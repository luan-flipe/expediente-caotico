import { describe, expect, it } from "vitest";
import type { Box } from "../data/map";
import { moveCircle, segmentBlocked, segmentBoxT } from "../sim/collision";

const wall: Box = { x: 5, z: 0, w: 2, d: 10, h: 3, kind: "wall" };
const desk: Box = { x: -5, z: 0, w: 2, d: 2, h: 0.8, kind: "desk" };
const bounds = { w: 40, d: 40 };
const r = 0.5;

describe("moveCircle", () => {
  it("para na borda da parede", () => {
    const p = moveCircle({ x: 0, z: 0 }, 10, 0, r, [wall], bounds);
    expect(p.x).toBeCloseTo(4 - r, 5);
    expect(p.z).toBe(0);
  });

  it("desliza no outro eixo ao andar na diagonal contra a parede", () => {
    const p = moveCircle({ x: 3.4, z: 0 }, 1, 1, r, [wall], bounds);
    expect(p.x).toBeCloseTo(3.5, 5);
    expect(p.z).toBeCloseTo(1, 5);
  });

  it("mesa baixa também bloqueia movimento", () => {
    const p = moveCircle({ x: -2, z: 0 }, -5, 0, r, [desk], bounds);
    expect(p.x).toBeCloseTo(-4 + r, 5);
  });

  it("não sai dos limites do mapa", () => {
    const p = moveCircle({ x: 0, z: 0 }, 0, -500, r, [], bounds);
    expect(p.z).toBeGreaterThanOrEqual(-20 + r);
  });

  it("movimento grande não atravessa parede fina", () => {
    const thin: Box = { x: 5, z: 0, w: 0.4, d: 10, h: 3, kind: "wall" };
    const p = moveCircle({ x: 0, z: 0 }, 20, 0, r, [thin], bounds);
    expect(p.x).toBeLessThan(5);
  });

  it("recuar após penetração ligeira não teleporta para o outro lado da parede", () => {
    const p = moveCircle({ x: 3.501, z: 0 }, -0.0002, 0, r, [wall], bounds);
    expect(p.x).toBeLessThan(3.501);
    expect(p.x).toBeGreaterThan(3.0);
  });
});

describe("segmentos", () => {
  it("t da interseção com a parede", () => {
    const t = segmentBoxT({ x: 0, z: 0 }, { x: 8, z: 0 }, [wall]);
    expect(t).toBeCloseTo(0.5, 5);
  });

  it("linha livre não bloqueia", () => {
    expect(segmentBlocked({ x: 0, z: 6 }, { x: 10, z: 6 }, [wall])).toBe(false);
    expect(segmentBlocked({ x: 0, z: 0 }, { x: 10, z: 0 }, [wall])).toBe(true);
  });

  it("caixa mais baixa que a altura do tiro não bloqueia tiro", () => {
    expect(segmentBlocked({ x: 0, z: 0 }, { x: -10, z: 0 }, [desk])).toBe(false);
  });
});
