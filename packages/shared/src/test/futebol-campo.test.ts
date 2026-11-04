import { describe, expect, it } from "vitest";
import { FUT_FORMATS, IPATINGAO, fieldFor, linePlayers } from "../index";

describe("campo do futebol", () => {
  it("cresce do formato 1 ao 4", () => {
    expect(fieldFor(1).halfL).toBeLessThan(fieldFor(4).halfL);
  });
  it("formato 4 mede 60 x 38", () => {
    const f = fieldFor(4);
    expect(f.halfL).toBe(30);
    expect(f.halfW).toBe(19);
  });
  it("gol tem as mesmas medidas nos formatos de campo reduzido", () => {
    for (const fmt of [1, 2, 3, 4] as const) {
      const f = fieldFor(fmt);
      expect(f.goalHalfW).toBe(2);
      expect(f.goalH).toBe(2);
    }
  });
  it("area e marca do penalti ficam dentro do campo", () => {
    for (const fmt of FUT_FORMATS) {
      const f = fieldFor(fmt);
      expect(f.boxHalfW).toBeLessThan(f.halfW);
      expect(f.boxL).toBeLessThan(f.halfL);
      expect(f.penaltySpot).toBeLessThan(f.boxL);
    }
  });
});

describe("5v5 estádio", () => {
  const f = fieldFor(5);

  it("usa o gramado inteiro do estádio (as linhas do mapa)", () => {
    expect(f.halfL).toBeCloseTo(IPATINGAO.grassHalfL, 5);
    expect(f.halfW).toBeCloseTo(IPATINGAO.grassHalfW, 5);
    expect(f.halfL).toBeGreaterThan(fieldFor(4).halfL);
  });

  it("o gol da sim é o do mapa (as traves desenhadas ficam onde a sim pensa que estão)", () => {
    expect(f.goalHalfW).toBe(IPATINGAO.goalHalfW);
    expect(f.goalH).toBe(IPATINGAO.goalH);
  });

  it("gol, áreas e marca do pênalti são maiores e cabem no campo", () => {
    expect(f.goalHalfW).toBeGreaterThan(fieldFor(4).goalHalfW);
    expect(f.goalH).toBeGreaterThan(fieldFor(4).goalH);
    expect(f.boxL).toBeGreaterThan(fieldFor(4).boxL);
    expect(f.boxHalfW).toBeGreaterThan(f.goalHalfW);
    expect(f.boxHalfW).toBeLessThan(f.halfW);
    expect(f.penaltySpot).toBeLessThan(f.boxL);
  });

  it("tem quatro de linha por time (mais o goleiro) e os outros formatos seguem o número", () => {
    expect(linePlayers(5)).toBe(4);
    expect([1, 2, 3, 4].map((n) => linePlayers(n as 1 | 2 | 3 | 4))).toEqual([1, 2, 3, 4]);
    expect(FUT_FORMATS).toContain(5);
  });
});
