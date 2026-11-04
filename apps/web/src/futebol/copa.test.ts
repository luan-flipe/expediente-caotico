import { describe, expect, it } from "vitest";
import { mulberry32, newCup, recordCupMatch, simulateRest } from "@ec/shared";
import { cupRounds } from "./copa";

const humans = [{ name: "Financeiro", side: 0 as const }, { name: "TI", side: 1 as const }];

describe("chave do campeonato na tela", () => {
  it("8 setores: quartas, semifinais e final com a vaga ainda a definir", () => {
    const r = cupRounds(newCup(8, humans));
    expect(r.map((x) => x.name)).toEqual(["Quartas", "Semifinais", "Final"]);
    expect(r.map((x) => x.matches.length)).toEqual([4, 2, 1]);
    expect(r[2].matches[0].a.name).toBe("A definir");
  });
  it("marca o próximo jogo de humano e mostra placar e vencedor", () => {
    const c = newCup(4, humans);
    simulateRest(c, mulberry32(1));
    let r = cupRounds(c);
    expect(r[0].matches[0].next).toBe(true);
    expect(r[0].matches[0].a.human).toBe(true);
    recordCupMatch(c, 0, [3, 1], null, c.matches[0].a!);
    r = cupRounds(c);
    expect(r[0].matches[0]).toMatchObject({ next: false, a: { goals: 3, won: true }, b: { goals: 1, won: false } });
    expect(r[0].matches[1].next).toBe(true);
  });
});
