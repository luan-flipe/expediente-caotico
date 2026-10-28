import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "../data/avatar";
import { RACE } from "../race/balance";
import { DEFAULT_CHAIR } from "../race/chair";
import { giveItem, HOLDABLE_ITEMS, useItem } from "../race/items";
import { newKart, stepKart, type KartState } from "../race/kart";
import { buildRacePrivate, createRace, setKartInput, stepRace } from "../race/match";
import { boxSpots, cupSpots, pointAt, progressOf, TRACK_IDS, TRACKS, type TrackId } from "../race/track";

const DT = 1000 / 30;

function race(n: number, opts: { track?: TrackId; timeTrial?: boolean; itemsOff?: boolean } = {}) {
  return createRace({
    seed: 7,
    ...opts,
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, avatar: DEFAULT_AVATAR, chair: DEFAULT_CHAIR, isBot: false })),
  });
}

const start = (r: ReturnType<typeof race>) => {
  for (let t = 0; t < RACE.countdownMs + DT; t += DT) stepRace(r, DT);
};

describe("xícaras de café por pista", () => {
  for (const id of TRACK_IDS) {
    it(`${id}: xícaras dentro da pista e longe das caixas`, () => {
      const track = TRACKS[id];
      const cups = cupSpots(track);
      expect(cups.length).toBeGreaterThanOrEqual(6);
      for (const c of cups) {
        const pr = progressOf(track, c);
        expect(pr.dist).toBeLessThan(pr.halfWidth - RACE.cupRadius);
        for (const b of boxSpots(track)) expect(Math.hypot(b.x - c.x, b.z - c.z)).toBeGreaterThan(2);
      }
    });

    it(`${id}: a corrida usa as xícaras da própria pista e a coleta funciona`, () => {
      const r = race(2, { track: id });
      expect(r.cups.map((c) => c.pos)).toEqual(cupSpots(TRACKS[id]));
      start(r);
      const p = r.racers.get("p0")!;
      p.kart.pos = { ...r.cups[0].pos };
      stepRace(r, DT);
      expect(p.kart.cups).toBe(1);
      expect(r.cups[0].readyAt).toBeGreaterThan(r.now);
    });
  }

  it("xícaras não são item: continuam com os itens desligados", () => {
    const r = race(2, { itemsOff: true });
    expect(r.boxes).toHaveLength(0);
    expect(r.cups.length).toBeGreaterThan(0);
  });

  it("contra o relógio não tem xícara nem vácuo (tempos comparáveis)", () => {
    const r = race(2, { timeTrial: true, track: "copa" });
    expect(r.cups).toHaveLength(0);
    start(r);
    const [a, b] = [r.racers.get("p0")!, r.racers.get("p1")!];
    const at = pointAt(r.track, 10);
    for (let t = 0; t < RACE.slipstreamChargeMs + 400; t += DT) {
      b.kart.pos = { ...at.pos };
      b.kart.heading = at.heading;
      b.kart.speed = 10;
      a.kart.pos = { x: at.pos.x - Math.sin(at.heading) * 4, z: at.pos.z - Math.cos(at.heading) * 4 };
      a.kart.heading = at.heading;
      a.kart.speed = 10;
      stepRace(r, DT);
    }
    expect(r.events.some((e) => e.type === "draft")).toBe(false);
    expect(a.kart.draftMs ?? 0).toBe(0);
  });
});

describe("escudo traseiro", () => {
  it("só resma, poça e grampeador seguram atrás", () => {
    expect([...HOLDABLE_ITEMS].sort()).toEqual(["grampeador", "poca", "resma"]);
  });

  it("segurar item que não é escudo não bloqueia nada", () => {
    const r = race(2);
    start(r);
    const [shooter, target] = [r.racers.get("p0")!, r.racers.get("p1")!];
    const at = pointAt(r.track, 20);
    target.kart = { ...newKart(at.pos, at.heading) };
    shooter.kart = { ...newKart({ x: at.pos.x - Math.sin(at.heading) * 5, z: at.pos.z - Math.cos(at.heading) * 5 }, at.heading) };
    giveItem(target, "expresso");
    setKartInput(r, "p1", { steer: 0, throttle: 0, drift: false, itemHold: true });
    giveItem(shooter, "grampeador");
    useItem(r, shooter);
    for (let t = 0; t < 500; t += DT) stepRace(r, DT);
    expect(target.kart.spinUntil).toBeGreaterThan(0);
    expect(target.item).toBe("expresso");
  });
});

describe("previsão local", () => {
  it("o estado privado tem o teto do turbo e as xícaras: o passo previsto bate com o do servidor", () => {
    const r = race(1);
    start(r);
    const p = r.racers.get("p0")!;
    p.kart.cups = 6;
    p.kart.speed = 20;
    p.kart.boostUntil = r.now + 1000;
    p.kart.boostSpeed = RACE.boost3Speed;
    const me = buildRacePrivate(r, "p0")!;
    const k = me.kart;
    // reconstrução igual à do cliente (raceEngine.reconcile)
    const client: KartState = {
      ...newKart({ x: k.x, z: k.z }, k.heading),
      speed: k.speed,
      drifting: k.drifting,
      driftDir: k.driftDir,
      driftMs: k.driftMs,
      boostUntil: r.now + k.boostMs,
      spinUntil: r.now + k.spinMs,
      slipUntil: r.now + k.slipMs,
      frozenUntil: r.now + k.frozenMs,
      boostSpeed: k.boostMs > 0 ? k.boostSpeed : undefined,
      cups: k.cups ?? 0,
    };
    const input = { steer: 0, throttle: 1, drift: false };
    let a = client;
    let b: KartState = { ...p.kart };
    for (let i = 1; i <= 20; i++) {
      a = stepKart(a, input, DT, r.now + i * DT, r.track).state;
      b = stepKart(b, input, DT, r.now + i * DT, r.track).state;
    }
    expect(a.pos.x).toBeCloseTo(b.pos.x, 6);
    expect(a.pos.z).toBeCloseTo(b.pos.z, 6);
    expect(a.speed).toBeCloseTo(b.speed, 6);
  });
});
