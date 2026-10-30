import { describe, expect, it } from "vitest";
import { reconcileDrawn } from "./reconcile";

/** Posição desenhada: ponto anterior + (previsão - anterior) * k + desvio. */
const draw = (prev: { x: number; z: number }, pred: { x: number; z: number }, vis: { x: number; z: number }, k: number) => ({
  x: prev.x + (pred.x - prev.x) * k + vis.x,
  z: prev.z + (pred.z - prev.z) * k + vis.z,
});

describe("reconcileDrawn", () => {
  it("reconciliar sem erro não move a posição desenhada", () => {
    const next = { x: 5, z: 2 };
    const before = { x: 5.2, z: 2.1 };
    const r = reconcileDrawn(before, next);
    for (const k of [0, 0.4, 1]) {
      const d = draw(r.prev, next, r.vis, k);
      expect(d.x).toBeCloseTo(before.x);
      expect(d.z).toBeCloseTo(before.z);
    }
  });

  it("erro maior que 3 m aceita a previsão sem suavizar", () => {
    const next = { x: 0, z: 0 };
    const r = reconcileDrawn({ x: 4, z: 0 }, next);
    expect(r.vis).toEqual({ x: 0, z: 0 });
    expect(draw(r.prev, next, r.vis, 0.5)).toEqual(next);
  });
});
