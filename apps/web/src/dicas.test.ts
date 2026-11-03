import { describe, expect, it } from "vitest";
import { DICAS, dicaAleatoria } from "./dicas";

describe("dicas", () => {
  it("sorteia dentro da lista, inclusive nas pontas", () => {
    expect(dicaAleatoria(() => 0)).toBe(DICAS[0]);
    expect(dicaAleatoria(() => 0.999999)).toBe(DICAS[DICAS.length - 1]);
  });

  it("nenhuma dica usa travessão", () => {
    for (const d of DICAS) expect(d).not.toContain("—");
  });
});
