import { describe, expect, it } from "vitest";
import { FUT, advancedFreeMate, aimTo, assistShot, fieldFor, kickBall, keeperInput, lobPowerFor, mulberry32, resolveTouches, stepBall } from "../index";
import type { Ball, FutInput, FutPlayer } from "../index";

const field = fieldFor(3);

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

describe("carga e voo do chute", () => {
  it("a carga chega à força máxima em 0,35 a 0,45 s", () => {
    expect(FUT.chargeMaxMs).toBeGreaterThanOrEqual(350);
    expect(FUT.chargeMaxMs).toBeLessThanOrEqual(450);
  });

  it("chute forte sobe mais do que o médio e o fraco fica rasteiro", () => {
    const forte = ball();
    kickBall(forte, 0, 1, "kick");
    const medio = ball();
    kickBall(medio, 0, 0.75, "kick");
    const fraco = ball();
    kickBall(fraco, 0, 0.3, "kick");
    expect(forte.vy).toBeGreaterThan(10);
    expect(forte.vy).toBeGreaterThan(medio.vy);
    expect(medio.vy).toBeGreaterThan(3);
    expect(fraco.vy).toBe(0);
  });

  it("lançamento do goleiro cai perto da distância pedida", () => {
    for (const d of [18, 28, 38]) {
      const b = ball();
      kickBall(b, Math.PI / 2, lobPowerFor(d), "pass", { lob: FUT.lobRatio });
      expect(b.vy).toBeGreaterThan(5);
      let x = 0;
      let landed = false;
      for (let i = 0; i < 400 && !landed; i++) {
        stepBall(b, 16);
        if (b.vy > 0 && b.y > 1) {
          landed = false;
        }
        if (b.y <= FUT.ballRadius + 1e-6 && i > 5) {
          x = b.x;
          landed = true;
        }
      }
      expect(landed).toBe(true);
      expect(Math.abs(x - d)).toBeLessThan(d * 0.15);
    }
  });
});

describe("goleiro lança para o atacante mais avançado e livre", () => {
  it("escolhe o mais avançado entre os livres, não o mais livre", () => {
    const k = mk({ id: "ga", role: "goleiro", x: -field.halfL + 1 });
    const recuado = mk({ id: "a1", x: -10, z: -8 });
    const avancado = mk({ id: "a2", x: 14, z: 6 });
    const marcado = mk({ id: "a3", x: 25, z: -6 });
    const foe = mk({ id: "b1", side: 1, x: 26, z: -6.5 });
    expect(advancedFreeMate([k, recuado, avancado, marcado, foe], k)?.id).toBe("a2");
  });

  it("sem ninguém livre cai no de maior folga", () => {
    const k = mk({ id: "ga", role: "goleiro", x: -field.halfL + 1 });
    const a = mk({ id: "a1", x: 10, z: 0 });
    const b = mk({ id: "a2", x: 20, z: 0 });
    const f1 = mk({ id: "b1", side: 1, x: 11, z: 0 });
    const f2 = mk({ id: "b2", side: 1, x: 20, z: 2 });
    // a1 tem folga 1, a2 tem folga 2: o mais livre é a2
    expect(advancedFreeMate([k, a, b, f1, f2], k)?.id).toBe("a2");
  });

  it("a mira da soltura vai no atacante avançado e o passe longo é lançamento", () => {
    const k = mk({ id: "ga", role: "goleiro", x: -field.halfL + 1 });
    const longe = mk({ id: "a2", x: 14, z: 6 });
    const perto = mk({ id: "a1", x: -10, z: -8 });
    const players = [k, perto, longe];
    const b = ball({ ownerId: "ga", x: k.x + 0.5 });
    k.holdMs = 3600;
    k.chargeKind = "pass";
    k.chargeMs = FUT.chargeMaxMs;
    const out = keeperInput(k, b, field, "normal", players);
    expect(out.pass).toBe("release");
    expect(out.aim).toBeCloseTo(aimTo(k, longe), 5);
  });
});

describe("chute assistido", () => {
  function shoot(power01: number, aim: number, seed: number, over: Partial<FutPlayer> = {}, others: FutPlayer[] = []): Ball {
    const p = mk({ x: 18, z: 1, ...over });
    const b = ball({ x: p.x + 0.7, z: p.z, ownerId: "p1" });
    const rng = mulberry32(seed);
    const players = [p, ...others];
    const ms = power01 * FUT.chargeMaxMs;
    const down = new Map([["p1", inp({ aim, kick: "charge" })]]);
    for (let t = 0; t < ms; t += 16) {
      resolveTouches(players, b, down, 16, field, rng);
    }
    resolveTouches(players, b, new Map([["p1", inp({ aim, kick: "release" })]]), 16, field, rng);
    return b;
  }

  /** Voa até a linha do gol e devolve onde cruzou. */
  function cross(b: Ball): { z: number; y: number; goal: boolean } {
    for (let i = 0; i < 600; i++) {
      stepBall(b, 8);
      if (b.x >= field.halfL) {
        return { z: b.z, y: b.y, goal: Math.abs(b.z) < field.goalHalfW && b.y < field.goalH };
      }
    }
    return { z: NaN, y: NaN, goal: false };
  }

  it("mirar à direita ou à esquerda do gol escolhe o canto, mesmo sem acertar a trave", () => {
    const px = 18;
    const right = shoot(0.4, Math.atan2(field.halfL - px, 1.5 - 1), 1);
    const left = shoot(0.4, Math.atan2(field.halfL - px, -1.5 - 1), 1);
    expect(cross(right).z).toBeGreaterThan(0.8);
    expect(cross(left).z).toBeLessThan(-0.8);
  });

  it("a maioria dos chutes assistidos entra, rasteiros ou altos", () => {
    let goals = 0;
    let n = 0;
    for (const power of [0.3, 0.5, 0.8, 1]) {
      for (let seed = 1; seed <= 20; seed++) {
        n++;
        const c = cross(shoot(power, Math.atan2(field.halfL - 18, 1.6 - 1), seed));
        if (c.goal) goals++;
      }
    }
    expect(goals / n).toBeGreaterThan(0.75);
  });

  it("força alta cruza no ângulo, fraca rasteiro", () => {
    const aim = Math.atan2(field.halfL - 18, 1.6 - 1);
    expect(cross(shoot(1, aim, 3)).y).toBeGreaterThan(0.9);
    expect(cross(shoot(0.3, aim, 3)).y).toBeLessThan(0.6);
  });

  it("marcação deixa o chute mais impreciso", () => {
    const aim = Math.atan2(field.halfL - 18, 1.6 - 1);
    const spread = (others: FutPlayer[]) => {
      const zs: number[] = [];
      for (let seed = 1; seed <= 40; seed++) {
        zs.push(cross(shoot(1, aim, seed, {}, others)).z);
      }
      const mean = zs.reduce((a, v) => a + v, 0) / zs.length;
      return Math.sqrt(zs.reduce((a, v) => a + (v - mean) ** 2, 0) / zs.length);
    };
    const marker = mk({ id: "m", side: 1, x: 19, z: 1.2 });
    expect(spread([marker])).toBeGreaterThan(spread([]));
  });

  it("sem assistência: longe do gol, de costas, passe e bot saem como apontados", () => {
    const far = shoot(0.6, 0.3, 1, { x: -5 });
    expect(Math.atan2(far.vx, far.vz)).toBeCloseTo(0.3, 5);
    const back = shoot(0.6, -Math.PI / 2, 1);
    expect(Math.atan2(back.vx, back.vz)).toBeCloseTo(-Math.PI / 2, 5);
    const bot = shoot(0.6, Math.atan2(field.halfL - 18, 2), 1, { isBot: true });
    expect(Math.atan2(bot.vx, bot.vz)).toBeCloseTo(Math.atan2(field.halfL - 18, 2), 5);
    const p = mk({ x: 18, z: 1 });
    expect(assistShot(p, inp({ aim: Math.PI / 2 + 1.2 }), 0.5, ball({ x: 18.7, z: 1 }), field, [p], mulberry32(1))).toBeNull();
  });
});
