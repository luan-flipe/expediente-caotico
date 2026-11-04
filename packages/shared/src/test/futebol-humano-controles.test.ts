import { describe, expect, it } from "vitest";
import { FUT, fieldFor, mulberry32, passTarget, resolveTouches } from "../index";
import type { Ball, FutInput, FutPlayer, RestartKind } from "../index";

const field = fieldFor(3);
const A = { rng: mulberry32(7), freeKick: false, restart: null };

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
const inp = (over: Partial<FutInput> = {}): FutInput => ({ mx: 0, mz: 0, aim: 0, sprint: false, kick: "none", pass: "none", ...over });

describe("carrinho em qualquer direção", () => {
  it("vai na direção do movimento, não da mira", () => {
    const t = mk({ id: "t", chargeKind: "kick", facing: 0 });
    const v = mk({ id: "v", side: 1, x: 1.5, z: 0 });
    const b = ball({ x: 9, z: 9 });
    const ev = resolveTouches([t, v], b, new Map([["t", inp({ kick: "release", mx: 1, mz: 0, aim: 0 })]]), 16);
    expect(v.downMs).toBeGreaterThan(0);
    expect(t.x).toBeGreaterThan(0.5);
    expect(t.facing).toBeCloseTo(Math.PI / 2);
    expect(ev).toContainEqual({ t: "tackle", id: "t", ok: true, victimId: "v", ballFirst: false });
  });

  it("para trás também", () => {
    const t = mk({ id: "t", chargeKind: "kick" });
    const v = mk({ id: "v", side: 1, z: -1.5 });
    resolveTouches([t, v], ball({ x: 9, z: 9 }), new Map([["t", inp({ kick: "release", mz: -1, aim: 0 })]]), 16);
    expect(v.downMs).toBeGreaterThan(0);
    expect(t.z).toBeLessThan(0);
  });

  it("sem movimento vai para onde o jogador está virado", () => {
    const t = mk({ id: "t", chargeKind: "kick", facing: -Math.PI / 2 });
    const v = mk({ id: "v", side: 1, x: -1.5 });
    resolveTouches([t, v], ball({ x: 9, z: 9 }), new Map([["t", inp({ kick: "release", aim: 0 })]]), 16);
    expect(v.downMs).toBeGreaterThan(0);
    expect(t.x).toBeLessThan(-0.5);
  });

  it("bot segue a mira", () => {
    const t = mk({ id: "t", chargeKind: "kick", isBot: true, facing: 0 });
    resolveTouches([t], ball({ x: 9, z: 9 }), new Map([["t", inp({ kick: "release", mx: 1, aim: Math.PI })]]), 16);
    expect(t.z).toBeLessThan(-1);
    expect(Math.abs(t.x)).toBeLessThan(1e-9);
  });
});

describe("chute sempre vai ao gol adversário", () => {
  const shoot = (p: FutPlayer, i: Partial<FutInput>, restart: RestartKind | null = null) => {
    const b = ball({ x: p.x, z: p.z + 0.4, ownerId: p.id });
    p.chargeKind = "kick";
    p.chargeMs = FUT.chargeMaxMs;
    resolveTouches([p], b, new Map([[p.id, inp({ kick: "release", ...i })]]), 16, field, { rng: mulberry32(3), freeKick: false, restart });
    return b;
  };

  it("de costas e com a mira para trás a bola sai para o gol", () => {
    const b = shoot(mk({ x: 0, z: 0, facing: -Math.PI / 2 }), { aim: -Math.PI / 2 });
    expect(b.vx).toBeGreaterThan(5);
  });

  it("time 1 ataca o gol do lado negativo", () => {
    const b = shoot(mk({ side: 1, x: 0 }), { aim: Math.PI / 2 });
    expect(b.vx).toBeLessThan(-5);
  });

  it("de longe, fora do alcance da assistência, ainda vai ao gol", () => {
    const b = shoot(mk({ x: -field.halfL + 2 }), { aim: Math.PI });
    expect(b.vx).toBeGreaterThan(5);
  });

  it("o canto vem do movimento lateral", () => {
    const esq = shoot(mk({ x: 8 }), { mz: -1 });
    const dir = shoot(mk({ x: 8 }), { mz: 1 });
    expect(esq.vz).toBeLessThan(0);
    expect(dir.vz).toBeGreaterThan(0);
  });

  it("a altura vem da força: fraco rasteiro, forte no ângulo", () => {
    const fraco = (() => {
      const p = mk({ x: 8 });
      const b = ball({ x: 8, z: 0.4, ownerId: "p1" });
      p.chargeKind = "kick";
      p.chargeMs = 0;
      resolveTouches([p], b, new Map([["p1", inp({ kick: "release" })]]), 16, field, A);
      return b;
    })();
    const forte = shoot(mk({ x: 8 }), {});
    expect(fraco.vy).toBe(0);
    expect(forte.vy).toBeGreaterThan(0);
  });

  it("reinício que não é falta nem pênalti mantém a mira", () => {
    const b = shoot(mk({ x: 0 }), { aim: -Math.PI / 2 }, "lateral" as never);
    expect(b.vx).toBeLessThan(-5);
  });

  it("bot chuta onde mirou", () => {
    const p = mk({ isBot: true, x: 0 });
    const b = ball({ ownerId: "p1", z: 0.4 });
    p.chargeKind = "kick";
    p.chargeMs = FUT.chargeMaxMs;
    resolveTouches([p], b, new Map([["p1", inp({ kick: "release", aim: -Math.PI / 2 })]]), 16, field, A);
    expect(b.vx).toBeLessThan(-5);
  });
});

describe("passe para o companheiro na frente do portador", () => {
  const me = () => mk({ id: "me", x: 0, z: 0, facing: 0 });

  it("escolhe o de menor desvio em relação ao facing", () => {
    const a = mk({ id: "a", x: 3, z: 10 });
    const c = mk({ id: "c", x: -1, z: 6 });
    expect(passTarget(me(), [me(), a, c])?.id).toBe("c");
  });

  it("ignora quem está atrás se há opção à frente", () => {
    const atras = mk({ id: "atras", x: 0, z: -3 });
    const lado = mk({ id: "lado", x: 8, z: 1 });
    expect(passTarget(me(), [me(), atras, lado])?.id).toBe("lado");
  });

  it("só atrás: pega o menos desviado", () => {
    const a = mk({ id: "a", x: 0.5, z: -5 });
    const c = mk({ id: "c", x: 5, z: -0.5 });
    expect(passTarget(me(), [me(), a, c])?.id).toBe("c");
  });

  it("empate de ângulo: o mais perto", () => {
    const longe = mk({ id: "longe", x: 0, z: 20 });
    const perto = mk({ id: "perto", x: 0, z: 6 });
    expect(passTarget(me(), [me(), longe, perto])?.id).toBe("perto");
  });

  it("ignora adversário, goleiro, expulso e caído", () => {
    const foe = mk({ id: "f", side: 1, z: 4 });
    const gk = mk({ id: "g", role: "goleiro", z: 5 });
    const out = mk({ id: "o", z: 6, sentOff: true });
    const down = mk({ id: "d", z: 7, downMs: 500 });
    const ok = mk({ id: "ok", x: 9, z: 2 });
    expect(passTarget(me(), [me(), foe, gk, out, down, ok])?.id).toBe("ok");
    expect(passTarget(me(), [me(), foe])).toBeNull();
  });

  it("na sim, o passe do humano vai ao escolhido, não à mira", () => {
    const p = mk({ id: "me", facing: Math.PI / 2 });
    const mate = mk({ id: "m", x: 10, z: 0 });
    const b = ball({ ownerId: "me", z: 0.4 });
    resolveTouches([p, mate], b, new Map([["me", inp({ pass: "release", aim: Math.PI })]]), 16, field, A);
    expect(b.vx).toBeGreaterThan(FUT.passMin * 0.9);
    expect(Math.abs(b.vz)).toBeLessThan(1);
  });

  it("o passe tem força para chegar ao companheiro distante", () => {
    const p = mk({ id: "me", facing: Math.PI / 2 });
    const mate = mk({ id: "m", x: 30, z: 0 });
    const b = ball({ ownerId: "me", z: 0.4 });
    resolveTouches([p, mate], b, new Map([["me", inp({ pass: "release" })]]), 16, field, A);
    expect(Math.hypot(b.vx, b.vz)).toBeGreaterThan(FUT.passMin + 1);
  });
});
