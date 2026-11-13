import { describe, expect, it } from "vitest";
import type { FutResults } from "../store";
import { montarPlacar } from "./placarImagem";

const row = (id: string, side: 0 | 1, goals: number) => ({ id, name: id, side, isBot: false, goals, assists: 0, yellow: 0, red: 0, shots: 0, shotsOn: 0, passes: 0, fouls: 0 });
const TEAMS: [{ name: string; kit: number; color: number }, { name: string; kit: number; color: number }] = [
  { name: "Financeiro", kit: 0, color: 2 },
  { name: "TI", kit: 1, color: 3 },
];

describe("placar para compartilhar", () => {
  it("leva times, gols, autores (com o número quando marcou mais de um) e o melhor jogador", () => {
    const res = {
      rows: [row("Ana", 0, 2), row("Beto", 0, 0), row("Caio", 1, 1)],
      score: { score: [2, 1], pens: null, winner: 0 },
      stats: { poss: [55, 45], shots: [8, 5], shotsOn: [4, 2], passes: [40, 31], fouls: [1, 2], cards: [0, 1], mvpId: "Ana" },
    } as unknown as FutResults;
    const p = montarPlacar(res, TEAMS);
    expect(p.times.map((t) => [t.nome, t.gols, t.autores])).toEqual([
      ["Financeiro", 2, ["Ana (2)"]],
      ["TI", 1, ["Caio"]],
    ]);
    expect(p.titulo).toBe("Vitória do Financeiro");
    expect(p.craque).toBe("Ana");
    expect(p.penaltis).toBeNull();
    expect(p.numeros[0]).toEqual({ rotulo: "Posse de bola", v: ["55%", "45%"] });
  });

  it("empate nos pênaltis aparece como empate com a disputa", () => {
    const res = { rows: [], score: { score: [1, 1], pens: [4, 3], winner: 0 } } as unknown as FutResults;
    const p = montarPlacar(res, TEAMS);
    expect(p.penaltis).toBe("Nos pênaltis: 4 x 3");
    expect(p.numeros).toEqual([]);
    expect(p.craque).toBeNull();
  });
});
