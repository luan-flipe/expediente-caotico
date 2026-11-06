import { describe, expect, it } from "vitest";
import { crowdLevel } from "./torcidaSom";

describe("empolgação da torcida", () => {
  const halfL = 20;
  it("bola no meio do campo: torcida calma", () => {
    expect(crowdLevel({ x: 0, vx: 0 }, halfL)).toBeCloseTo(0.25);
  });

  it("sobe perto do gol, dos dois lados", () => {
    expect(crowdLevel({ x: 17, vx: 0 }, halfL)).toBeGreaterThan(crowdLevel({ x: 8, vx: 0 }, halfL));
    expect(crowdLevel({ x: -17, vx: 0 }, halfL)).toBeCloseTo(crowdLevel({ x: 17, vx: 0 }, halfL));
  });

  it("ataque: bola indo para o gol empolga mais que bola saindo dele", () => {
    const indo = crowdLevel({ x: 15, vx: 18 }, halfL);
    const saindo = crowdLevel({ x: 15, vx: -18 }, halfL);
    expect(indo).toBeGreaterThan(saindo);
    expect(indo).toBeLessThanOrEqual(1);
    expect(crowdLevel({ x: -15, vx: -18 }, halfL)).toBeCloseTo(indo);
  });

  it("fica sempre entre 0 e 1", () => {
    for (const x of [-30, -20, 0, 20, 30]) {
      for (const vx of [-40, 0, 40]) {
        const v = crowdLevel({ x, vx }, halfL);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});
