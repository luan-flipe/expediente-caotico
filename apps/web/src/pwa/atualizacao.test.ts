import { describe, expect, it } from "vitest";
import { deveRecarregar } from "./atualizacao";

describe("recarregar quando um SW novo assume", () => {
  it("recarrega se já havia SW, fora de sala e ainda não recarregou", () => {
    expect(deveRecarregar({ tinhaControlador: true, emSala: false, jaRecarregou: false })).toBe(true);
  });
  it("primeira instalação não recarrega", () => {
    expect(deveRecarregar({ tinhaControlador: false, emSala: false, jaRecarregou: false })).toBe(false);
  });
  it("nunca recarrega no meio de uma sala", () => {
    expect(deveRecarregar({ tinhaControlador: true, emSala: true, jaRecarregou: false })).toBe(false);
  });
  it("recarrega só uma vez", () => {
    expect(deveRecarregar({ tinhaControlador: true, emSala: false, jaRecarregou: true })).toBe(false);
  });
});
