import { describe, expect, it } from "vitest";
import { FUT_FORMATS, fieldFor } from "../index";

describe("campo do futebol", () => {
  it("cresce do formato 1 ao 4", () => {
    expect(fieldFor(1).halfL).toBeLessThan(fieldFor(4).halfL);
  });
  it("formato 4 mede 60 x 38", () => {
    const f = fieldFor(4);
    expect(f.halfL).toBe(30);
    expect(f.halfW).toBe(19);
  });
  it("gol tem as mesmas medidas em todos os formatos", () => {
    for (const fmt of FUT_FORMATS) {
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
