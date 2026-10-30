import { describe, expect, it } from "vitest";
import { FUT, resolveTouches } from "../index";
import type { Ball, FutInput, FutPlayer } from "../index";

function mk(over: Partial<FutPlayer> = {}): FutPlayer {
  return {
    id: "p1", side: 0, role: "linha", x: 0, z: 0, vx: 0, vz: 0, facing: 0,
    chargeMs: 0, chargeKind: null, tackleMs: 0, downMs: 0, yellow: 0, sentOff: false, isBot: false,
    ...over,
  };
}
function ball(over: Partial<Ball> = {}): Ball {
  return { x: 0, y: FUT.ballRadius, z: 0, vx: 0, vy: 0, vz: 0, ownerId: null, lastTouch: null, prevTouch: null, ...over };
}
function inp(over: Partial<FutInput> = {}): FutInput {
  return { mx: 0, mz: 0, aim: 0, sprint: false, kick: "none", pass: "none", ...over };
}
const dist = (b: Ball, p: FutPlayer) => Math.hypot(b.x - p.x, b.z - p.z);

describe("toques no futebol", () => {
  it("dono conduz a bola à frente andando", () => {
    const p = mk({ vz: FUT.walkSpeed, facing: 0 });
    const b = ball({ z: 0.3, ownerId: "p1" });
    resolveTouches([p], b, new Map([["p1", inp({ mz: 1 })]]), 16);
    expect(b.ownerId).toBe("p1");
    expect(b.z - p.z).toBeCloseTo(FUT.dribbleTouch, 5);
    expect(b.vz).toBeCloseTo(p.vz, 5);
  });

  it("correndo o toque é mais longo e a bola sai do raio", () => {
    const p = mk({ vz: FUT.sprintSpeed, facing: 0 });
    const b = ball({ z: 0.3, ownerId: "p1" });
    resolveTouches([p], b, new Map([["p1", inp({ mz: 1, sprint: true })]]), 16);
    expect(b.z - p.z).toBeCloseTo(FUT.sprintTouch, 5);
    expect(b.ownerId).toBeNull();
  });

  it("correndo, o adversário mais perto toma a bola solta", () => {
    const p = mk({ id: "a", vz: FUT.sprintSpeed, z: 0 });
    const d = mk({ id: "d", side: 1, z: 2.0, x: 0.2 });
    const b = ball({ z: 1.6 });
    resolveTouches([p, d], b, new Map(), 16);
    expect(dist(b, d) <= FUT.controlRadius).toBe(true);
    expect(b.ownerId).toBe("d");
  });

  it("bola solta vai para o mais perto", () => {
    const a = mk({ id: "a", x: 0.5 });
    const c = mk({ id: "c", side: 1, x: -0.2 });
    const b = ball();
    resolveTouches([a, c], b, new Map(), 16);
    expect(b.ownerId).toBe("c");
  });

  it("empate de distância vence o menor id", () => {
    const z = mk({ id: "z", x: 0.5 });
    const a = mk({ id: "a", side: 1, x: -0.5 });
    const b = ball();
    resolveTouches([z, a], b, new Map(), 16);
    expect(b.ownerId).toBe("a");
  });

  it("ninguém fora do raio pega a bola", () => {
    const a = mk({ id: "a", x: FUT.controlRadius + 0.5 });
    const b = ball();
    resolveTouches([a], b, new Map(), 16);
    expect(b.ownerId).toBeNull();
  });

  it("segurar e soltar chuta com força proporcional", () => {
    const run = (holdMs: number) => {
      const p = mk();
      const b = ball({ z: 0.5, ownerId: "p1" });
      const steps = holdMs / 100;
      for (let i = 0; i < steps; i++) {
        resolveTouches([p], b, new Map([["p1", inp({ kick: "charge" })]]), 100);
      }
      const ev = resolveTouches([p], b, new Map([["p1", inp({ kick: "release", aim: 0 })]]), 16);
      return { b, p, ev };
    };
    const fraco = run(0);
    const forte = run(FUT.chargeMaxMs);
    const demais = run(FUT.chargeMaxMs * 3);
    const meio = run(FUT.chargeMaxMs / 2);
    expect(fraco.ev[0]).toMatchObject({ t: "kick", id: "p1", ok: true });
    expect(fraco.b.vz).toBeCloseTo(FUT.shotMin, 5);
    expect(forte.b.vz).toBeCloseTo(FUT.shotMax, 5);
    expect(demais.b.vz).toBeCloseTo(FUT.shotMax, 5);
    expect(meio.b.vz).toBeGreaterThan(fraco.b.vz);
    expect(meio.b.vz).toBeLessThan(forte.b.vz);
    expect(forte.b.ownerId).toBeNull();
    expect(forte.p.chargeMs).toBe(0);
    expect(forte.p.chargeKind).toBeNull();
  });

  it("o passe vai na direção do aim", () => {
    const p = mk();
    const b = ball({ z: 0.5, ownerId: "p1" });
    resolveTouches([p], b, new Map([["p1", inp({ pass: "release", aim: Math.PI / 2 })]]), 16);
    expect(b.vx).toBeCloseTo(FUT.passMin, 5);
    expect(Math.abs(b.vz)).toBeLessThan(1e-9);
  });

  it("soltar sem a bola não chuta nem passa", () => {
    const p = mk();
    const b = ball({ x: 10, z: 10 });
    const antes = { ...b };
    const ev = resolveTouches([p], b, new Map([["p1", inp({ kick: "release" })]]), 16);
    expect(b).toEqual(antes);
    expect(ev.some((e) => e.t === "kick" || e.t === "pass")).toBe(false);
  });

  it("goleiro e expulso são ignorados", () => {
    const g = mk({ id: "g", role: "goleiro" });
    const s = mk({ id: "s", sentOff: true });
    const b = ball();
    resolveTouches([g, s], b, new Map(), 16);
    expect(b.ownerId).toBeNull();
  });

  it("passe registra prevTouch para a assistência", () => {
    const a = mk({ id: "a" });
    const c = mk({ id: "c", x: 8 });
    const b = ball({ z: 0.5, ownerId: "a", lastTouch: { id: "a", side: 0 } });
    resolveTouches([a, c], b, new Map([["a", inp({ pass: "release", aim: Math.PI / 2 })]]), 16);
    expect(b.lastTouch).toEqual({ id: "a", side: 0 });
    b.x = 8.2; b.z = 0; b.vx = 0; b.vz = 0;
    resolveTouches([a, c], b, new Map(), 16);
    expect(b.ownerId).toBe("c");
    expect(b.lastTouch).toEqual({ id: "c", side: 0 });
    expect(b.prevTouch).toEqual({ id: "a", side: 0 });
  });

  it("quem chutou não retoma a bola que está saindo", () => {
    const p = mk();
    const b = ball({ z: 0.5, ownerId: "p1" });
    resolveTouches([p], b, new Map([["p1", inp({ kick: "release" })]]), 16);
    b.z += 0.16;
    resolveTouches([p], b, new Map(), 16);
    expect(b.ownerId).toBeNull();
  });

  it("disputa toma a bola de quem conduz dentro do raio", () => {
    const dono = mk({ id: "a", x: 0, z: 0 });
    const rival = mk({ id: "b", side: 1, x: 0.6, z: 0 });
    const b = ball({ x: 0, z: 0.3, ownerId: "a", lastTouch: { id: "a", side: 0 } });
    const ev = resolveTouches([dono, rival], b, new Map([["b", inp({ pass: "release" })]]), 16);
    expect(b.ownerId).toBe("b");
    expect(ev).toContainEqual({ t: "steal", id: "b", ok: true, victimId: "a", ballFirst: true });
    expect(b.lastTouch).toEqual({ id: "b", side: 1 });
    expect(b.prevTouch).toEqual({ id: "a", side: 0 });
  });

  it("disputa falha longe do dono", () => {
    const dono = mk({ id: "a" });
    const rival = mk({ id: "b", side: 1, x: 5 });
    const b = ball({ ownerId: "a" });
    const ev = resolveTouches([dono, rival], b, new Map([["b", inp({ pass: "release" })]]), 16);
    expect(b.ownerId).toBe("a");
    expect(ev).toContainEqual({ t: "steal", id: "b", ok: false });
  });

  it("carrinho derruba o adversário e informa o contato", () => {
    const t = mk({ id: "t", x: 0, z: 0 });
    const v = mk({ id: "v", side: 1, x: 0, z: 1.5 });
    const b = ball({ x: 8, z: 8 });
    const ev = resolveTouches([t, v], b, new Map([["t", inp({ kick: "release", aim: 0 })]]), 16);
    expect(v.downMs).toBeGreaterThan(0);
    expect(t.tackleMs).toBeGreaterThan(0);
    expect(ev).toContainEqual({ t: "tackle", id: "t", ok: true, victimId: "v", ballFirst: false });
  });

  it("carrinho que pega a bola primeiro marca ballFirst", () => {
    const t = mk({ id: "t" });
    const v = mk({ id: "v", side: 1, z: 2.1 });
    const b = ball({ z: 1.85 });
    const ev = resolveTouches([t, v], b, new Map([["t", inp({ kick: "release", aim: 0 })]]), 16);
    expect(ev).toContainEqual({ t: "tackle", id: "t", ok: true, victimId: "v", ballFirst: true });
    expect(b.lastTouch).toEqual({ id: "t", side: 0 });
  });

  it("carrinho no vazio dá ok falso e respeita a recarga", () => {
    const t = mk({ id: "t" });
    const b = ball({ x: 9, z: 9 });
    const ins = new Map([["t", inp({ kick: "release", aim: 0 })]]);
    const ev = resolveTouches([t], b, ins, 16);
    expect(ev).toContainEqual({ t: "tackle", id: "t", ok: false });
    const z1 = t.z;
    const ev2 = resolveTouches([t], b, ins, 16);
    expect(ev2.some((e) => e.t === "tackle")).toBe(false);
    expect(t.z).toBe(z1);
  });
});
