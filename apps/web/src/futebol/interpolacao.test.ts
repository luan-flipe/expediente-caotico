import { describe, expect, it } from "vitest";
import { sampleAt, type Sample } from "./interpolacao";

const s = (t: number, x: number, z = 0, f = 0): Sample => ({ t, x, y: 0, z, f });

describe("interpolação dos snapshots", () => {
  it("sem amostras não há posição", () => {
    expect(sampleAt([], 100)).toBeNull();
  });

  it("no meio de duas amostras fica no meio do caminho (e do giro)", () => {
    const r = sampleAt([s(0, 0, 0, 0), s(100, 2, 4, 1)], 50)!;
    expect(r.x).toBeCloseTo(1);
    expect(r.z).toBeCloseTo(2);
    expect(r.f).toBeCloseTo(0.5);
  });

  it("o giro vai pelo lado mais curto", () => {
    const r = sampleAt([s(0, 0, 0, 3), s(100, 0, 0, -3)], 50)!;
    expect(Math.abs(r.f)).toBeGreaterThan(3);
  });

  it("salto grande (cobrança, saída) vai direto, sem deslizar", () => {
    const r = sampleAt([s(0, 0), s(100, 20)], 10)!;
    expect(r.x).toBe(20);
  });

  it("antes da primeira e depois da última, segura nas pontas", () => {
    const buf = [s(100, 1), s(200, 2)];
    expect(sampleAt(buf, 0)!.x).toBe(1);
    expect(sampleAt(buf, 999)!.x).toBe(2);
  });
});
