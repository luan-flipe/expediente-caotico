import { describe, expect, it } from "vitest";
import { sampleGhost } from "../ranking/ghost";
import type { GhostSample } from "../ranking/types";

const line: GhostSample[] = [
  [0, 0, 0, 0],
  [100, 10, 20, 1],
  [300, 30, 20, 1],
];

describe("sampleGhost", () => {
  it("sem amostras devolve null", () => {
    expect(sampleGhost([], 50)).toBeNull();
  });

  it("interpola entre duas amostras", () => {
    const p = sampleGhost(line, 50)!;
    expect(p.x).toBeCloseTo(5);
    expect(p.z).toBeCloseTo(10);
    expect(p.heading).toBeCloseTo(0.5);
    const q = sampleGhost(line, 200)!;
    expect(q.x).toBeCloseTo(20);
    expect(q.z).toBeCloseTo(20);
  });

  it("no instante exato de uma amostra devolve ela", () => {
    expect(sampleGhost(line, 100)).toEqual({ x: 10, z: 20, heading: 1 });
  });

  it("antes do começo e depois do fim fica na primeira e na última amostra", () => {
    expect(sampleGhost(line, -500)).toEqual({ x: 0, z: 0, heading: 0 });
    expect(sampleGhost(line, 99999)).toEqual({ x: 30, z: 20, heading: 1 });
  });

  it("uma amostra só serve em qualquer instante", () => {
    expect(sampleGhost([[0, 3, 4, 2]], 700)).toEqual({ x: 3, z: 4, heading: 2 });
  });

  it("direção passa pelo caminho curto na virada do ângulo", () => {
    const wrap: GhostSample[] = [
      [0, 0, 0, Math.PI - 0.1],
      [100, 0, 0, -Math.PI + 0.1],
    ];
    const mid = sampleGhost(wrap, 50)!;
    // meio do caminho curto é meio giro (pi), não 0
    expect(Math.cos(mid.heading)).toBeCloseTo(-1, 5);
  });

  it("amostras com o mesmo tempo não dividem por zero", () => {
    const dup: GhostSample[] = [
      [0, 0, 0, 0],
      [100, 1, 1, 0],
      [100, 2, 2, 0],
      [200, 3, 3, 0],
    ];
    const p = sampleGhost(dup, 100)!;
    expect(Number.isFinite(p.x)).toBe(true);
  });
});
