import { describe, expect, it } from "vitest";
import { carryWeight, localBallPos } from "./bolaLocal";

describe("bola do meu boneco", () => {
  it("dono: a bola leva o deslocamento do boneco desenhado e fica à frente do pé", () => {
    // servidor: boneco em x=10, bola 0,55 m à frente; desenhado (predito) em x=10,7
    const p = localBallPos({ x: 10.55, z: 0 }, { x: 10, z: 0 }, { x: 10.7, z: 0 }, 1);
    expect(p.x - 10.7).toBeCloseTo(0.55);
  });

  it("sem peso ou sem boneco do servidor, vale a bola do servidor", () => {
    expect(localBallPos({ x: 3, z: 4 }, { x: 0, z: 0 }, { x: 1, z: 1 }, 0)).toEqual({ x: 3, z: 4 });
    expect(localBallPos({ x: 3, z: 4 }, null, { x: 1, z: 1 }, 1)).toEqual({ x: 3, z: 4 });
  });

  it("o peso sobe com a posse e solta devagar sem pular", () => {
    let w = 0;
    for (let i = 0; i < 10; i++) w = carryWeight(w, true, 1 / 60);
    expect(w).toBeGreaterThan(0.8);
    const w1 = carryWeight(w, false, 1 / 60);
    expect(w1).toBeLessThan(w);
    expect(w - w1).toBeLessThan(0.25);
    for (let i = 0; i < 120; i++) w = carryWeight(w, false, 1 / 60);
    expect(w).toBeLessThan(0.001);
  });
});
