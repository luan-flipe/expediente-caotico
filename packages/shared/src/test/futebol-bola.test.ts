import { describe, expect, it } from "vitest";
import { FUT, ballOut, fieldFor, kickBall, stepBall } from "../index";
import type { Ball } from "../index";

const field = fieldFor(2);

function ball(over: Partial<Ball> = {}): Ball {
  return { x: 0, y: FUT.ballRadius, z: 0, vx: 0, vy: 0, vz: 0, ownerId: null, lastTouch: null, prevTouch: null, ...over };
}

function run(b: Ball, ms: number): void {
  for (let t = 0; t < ms; t += 16) {
    stepBall(b, 16);
  }
}

describe("bola do futebol", () => {
  it("quica e perde altura", () => {
    const b = ball({ y: 3 });
    let bounced = false;
    let peak = 0;
    for (let i = 0; i < 400; i++) {
      const prevVy = b.vy;
      stepBall(b, 16);
      if (prevVy < 0 && b.vy > 0) {
        bounced = true;
      }
      if (bounced && b.vy <= 0) {
        peak = Math.max(peak, b.y);
        break;
      }
      if (bounced) {
        peak = Math.max(peak, b.y);
      }
    }
    expect(bounced).toBe(true);
    expect(peak).toBeGreaterThan(FUT.ballRadius);
    expect(peak).toBeLessThan(3 * 0.55);
  });

  it("rolando para sozinha", () => {
    const b = ball({ vx: 5 });
    run(b, 20000);
    expect(b.vx).toBe(0);
    expect(b.vz).toBe(0);
    expect(b.x).toBeGreaterThan(0);
  });

  it("meio fora da linha ainda está em jogo", () => {
    const b = ball({ x: field.halfL + FUT.ballRadius * 0.5 });
    expect(ballOut(b, field)).toBeNull();
    const z = ball({ z: field.halfW + FUT.ballRadius * 0.5 });
    expect(ballOut(z, field)).toBeNull();
  });

  it("passou inteira da lateral dá lateral", () => {
    const b = ball({ z: field.halfW + FUT.ballRadius + 0.1 });
    expect(ballOut(b, field)?.kind).toBe("lateral");
  });

  it("entre as traves e abaixo de 2 m é gol", () => {
    const g = ball({ x: field.halfL + FUT.ballRadius + 0.1, y: 0.5, z: 1 });
    expect(ballOut(g, field)).toEqual({ kind: "gol", side: 1 });
    const g0 = ball({ x: -field.halfL - FUT.ballRadius - 0.1, y: 0.5, z: -1 });
    expect(ballOut(g0, field)).toEqual({ kind: "gol", side: 0 });
  });

  it("por cima do travessão é tiro de meta (fundo)", () => {
    const b = ball({ x: field.halfL + FUT.ballRadius + 0.1, y: 2.5, z: 0 });
    expect(ballOut(b, field)).toEqual({ kind: "fundo", side: 1 });
    const fora = ball({ x: field.halfL + FUT.ballRadius + 0.1, y: 0.5, z: 5 });
    expect(ballOut(fora, field)?.kind).toBe("fundo");
  });

  it("chute forte sobe e passe fica rasteiro", () => {
    const k = ball();
    kickBall(k, 0, 1, "kick");
    expect(k.vy).toBeGreaterThan(0);
    expect(Math.hypot(k.vx, k.vz)).toBeCloseTo(FUT.shotMax, 5);
    const fraco = ball();
    kickBall(fraco, 0, 0.3, "kick");
    expect(fraco.vy).toBe(0);
    const p = ball();
    kickBall(p, Math.PI / 2, 1, "pass");
    expect(p.vy).toBe(0);
    expect(p.vx).toBeCloseTo(FUT.passMax, 5);
    expect(Math.abs(p.vz)).toBeLessThan(1e-9);
  });
});
