import { describe, expect, it } from "vitest";
import { RACE } from "../race/balance";
import { collideKarts, newKart, stepKart, type KartInput, type KartState } from "../race/kart";
import { pointAt, progressOf, TRACK } from "../race/track";

const DT = 1000 / 30;
const GAS: KartInput = { steer: 0, throttle: 1, drift: false };

function run(k: KartState, input: KartInput, ms: number, t0 = 0, track = null as typeof TRACK | null) {
  let s = k;
  let now = t0;
  let wall = false;
  for (let t = 0; t < ms - 1e-6; t += DT) {
    now += DT;
    const r = stepKart(s, input, DT, now, track);
    s = r.state;
    wall ||= r.wall;
  }
  return { s, now, wall };
}

const moving = (speed: number): KartState => ({ ...newKart({ x: 0, z: 0 }, 0), speed });

describe("física da cadeira", () => {
  it("chega a 95% da velocidade máxima entre 1,6 e 2,4 s", () => {
    let s = newKart({ x: 0, z: 0 }, 0);
    let t = 0;
    while (s.speed < RACE.maxSpeed * 0.95 && t < 5000) {
      t += DT;
      s = stepKart(s, GAS, DT, t, null).state;
    }
    expect(t).toBeGreaterThanOrEqual(1600);
    expect(t).toBeLessThanOrEqual(2400);
    expect(run(s, GAS, 3000).s.speed).toBeCloseTo(RACE.maxSpeed, 5);
  });

  it("sem acelerador desacelera até parar", () => {
    const { s } = run(moving(16), { steer: 0, throttle: 0, drift: false }, 6000);
    expect(s.speed).toBe(0);
  });

  it("virar rápido descreve raio maior que virar devagar", () => {
    const radius = (v: number) => {
      const turnMs = 600;
      const { s } = run(moving(v), { steer: 1, throttle: v / RACE.maxSpeed, drift: false }, turnMs);
      return v / (Math.abs(s.heading) / (turnMs / 1000));
    };
    expect(radius(16)).toBeGreaterThan(radius(6) + 1);
  });

  it("parada gira no lugar (cadeira de escritório)", () => {
    const { s } = run(newKart({ x: 0, z: 0 }, 0), { steer: 1, throttle: 0, drift: false }, 500);
    expect(Math.abs(s.heading)).toBeGreaterThan(0.4);
    expect(s.pos).toEqual({ x: 0, z: 0 });
  });

  it("parede de frente corta pelo menos metade da velocidade e não atravessa", () => {
    const at = pointAt(TRACK, 30);
    const k: KartState = { ...newKart(at.pos, at.heading + Math.PI / 2), speed: 16 };
    const { s, wall } = run(k, GAS, 400, 0, TRACK);
    expect(wall).toBe(true);
    expect(s.speed).toBeLessThanOrEqual(8);
    const pr = progressOf(TRACK, s.pos);
    expect(pr.dist).toBeLessThanOrEqual(pr.halfWidth - RACE.kartRadius + 1e-6);
  });

  it("encostada de frente na parede, virando e acelerando sai e segue a pista", () => {
    const at = pointAt(TRACK, 30);
    let k: KartState = { ...newKart(at.pos, at.heading + Math.PI / 2), speed: 10 };
    k = run(k, GAS, 500, 0, TRACK).s;
    const s0 = progressOf(TRACK, k.pos).s;
    let now = 500;
    for (let t = 0; t < 3000; t += DT) {
      now += DT;
      const pr = progressOf(TRACK, k.pos);
      const want = pointAt(TRACK, pr.s + 6).heading;
      const diff = Math.atan2(Math.sin(want - k.heading), Math.cos(want - k.heading));
      k = stepKart(k, { steer: Math.max(-1, Math.min(1, -diff * 2.5)), throttle: 1, drift: false }, DT, now, TRACK).state;
    }
    expect(progressOf(TRACK, k.pos).s - s0).toBeGreaterThan(15);
  });

  it("derrapagem: 0,9 s dá turbo de 600 ms, 1,7 s dá 1000 ms, menos de 0,8 s não dá", () => {
    const drift = (ms: number) => {
      const held = run(moving(15), { steer: 1, throttle: 1, drift: true }, ms);
      expect(held.s.drifting).toBe(true);
      const r = stepKart(held.s, { steer: 0, throttle: 1, drift: false }, DT, held.now + DT, null);
      return { boost: r.boost, ms: r.state.boostUntil ? r.state.boostUntil - (held.now + DT) : 0 };
    };
    expect(drift(900)).toEqual({ boost: 1, ms: RACE.boost1Ms });
    expect(drift(1700)).toEqual({ boost: 2, ms: RACE.boost2Ms });
    expect(drift(700)).toEqual({ boost: 0, ms: 0 });
  });

  it("turbo passa da velocidade máxima", () => {
    let k: KartState = { ...moving(16), boostUntil: 2000 };
    let max = 0;
    for (let t = DT; t < 1900; t += DT) {
      k = stepKart(k, GAS, DT, t, null).state;
      max = Math.max(max, k.speed);
    }
    expect(max).toBeGreaterThan(RACE.maxSpeed + 2);
    expect(max).toBeLessThanOrEqual(RACE.boostSpeed);
  });

  it("parada da reposição não anda nem com turbo de café", () => {
    const k = { ...newKart({ x: 0, z: 0 }, 0), frozenUntil: 2000, boostUntil: 1500 };
    const { s } = run(k, GAS, 1800);
    expect(s.pos).toEqual({ x: 0, z: 0 });
    expect(s.speed).toBe(0);
  });

  it("rodopiando ignora a entrada", () => {
    const k = { ...moving(10), spinUntil: 1000 };
    const a = run(k, { steer: 1, throttle: 1, drift: true }, 500);
    const b = run(k, { steer: -1, throttle: -1, drift: false }, 500);
    expect(a.s).toEqual(b.s);
    expect(a.s.speed).toBeLessThan(10);
  });

  it("no carpete a velocidade não passa de 60%", () => {
    const zone = TRACK.carpet[0];
    const mid = pointAt(TRACK, (zone.from + zone.to) / 2);
    const off = mid.halfWidth - 1.2;
    const pos = { x: mid.pos.x + Math.cos(mid.heading) * off * zone.side, z: mid.pos.z - Math.sin(mid.heading) * off * zone.side };
    let k = newKart(pos, mid.heading);
    let max = 0;
    for (let t = DT; t < 3000; t += DT) {
      k = stepKart(k, GAS, DT, t, TRACK).state;
      k.pos = pos;
      max = Math.max(max, k.speed);
    }
    expect(max).toBeLessThanOrEqual(RACE.maxSpeed * RACE.carpetMax + 1e-9);
    expect(max).toBeCloseTo(RACE.maxSpeed * RACE.carpetMax, 1);
  });

  it("duas cadeiras sobrepostas se separam", () => {
    const a = newKart({ x: 0, z: 0 }, 0);
    const b = newKart({ x: 0.3, z: 0 }, 0);
    expect(collideKarts(a, b)).toBe(true);
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)).toBeCloseTo(RACE.kartRadius * 2, 6);
  });

  it("determinística", () => {
    const k = { ...moving(12), drifting: true, driftDir: 1 as const, driftMs: 300 };
    const inp = { steer: 0.7, throttle: 1, drift: true };
    expect(stepKart(k, inp, DT, 500, TRACK)).toEqual(stepKart(k, inp, DT, 500, TRACK));
  });

  it("derrapagem nível 3 (ultra mini-turbo) libera boost 3 com duração e velocidade maiores", () => {
    const k: KartState = { ...moving(12), drifting: true, driftDir: 1, driftMs: 2600 };
    const step = stepKart(k, { steer: 0, throttle: 1, drift: false }, DT, 3000, null);
    expect(step.boost).toBe(3);
    expect(step.state.boostUntil).toBe(3000 + RACE.boost3Ms);
    expect(step.state.boostSpeed).toBe(RACE.boost3Speed);
  });

  it("xícaras de café aumentam a velocidade máxima proporcionalmente", () => {
    let k0: KartState = { ...newKart({ x: 0, z: 0 }, 0), cups: 0 };
    let k10: KartState = { ...newKart({ x: 0, z: 0 }, 0), cups: 10 };
    for (let t = DT; t < 4000; t += DT) {
      k0 = stepKart(k0, GAS, DT, t, null).state;
      k10 = stepKart(k10, GAS, DT, t, null).state;
    }
    expect(k10.speed).toBeCloseTo(RACE.maxSpeed * (1 + 10 * RACE.cupSpeedPerUnit), 1);
    expect(k10.speed).toBeGreaterThan(k0.speed);
  });
});
