import { describe, expect, it } from "vitest";
import { DIVE_MIN_GAP, diveAmount, diveSide } from "./reacoes";

describe("reações do goleiro", () => {
  it("o mergulho sobe, segura e desce", () => {
    expect(diveAmount(0)).toBe(0);
    expect(diveAmount(1)).toBe(0);
    expect(diveAmount(0.5)).toBe(1);
    expect(diveAmount(0.1)).toBeGreaterThan(0);
    expect(diveAmount(0.1)).toBeLessThan(1);
    expect(diveAmount(0.9)).toBeLessThan(diveAmount(0.5));
  });
  it("lado do mergulho depende de para onde o goleiro está virado", () => {
    // virado para -x (goleiro do time 1): facing = -pi/2, o x do boneco aponta para -z... e o lado inverte com o facing
    const a = diveSide(Math.PI / 2, 0, 1);
    const b = diveSide(-Math.PI / 2, 0, 1);
    expect(a).not.toBe(0);
    expect(b).toBe(-a);
  });
  it("bola perto demais não pede mergulho", () => {
    expect(diveSide(Math.PI / 2, 0, DIVE_MIN_GAP / 2)).toBe(0);
  });
});
