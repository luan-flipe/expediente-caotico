import { describe, expect, it } from "vitest";
import { SETORES, mulberry32, newCup, nextHumanMatch, nextPlayable, recordCupMatch, simulateRest } from "../index";
import type { Cup } from "../index";

const humans = [
  { name: "Financeiro", side: 0 as const },
  { name: "TI", side: 1 as const },
];

/** Jogos da rodada: de qual jogo cada vencedor segue. */
const teamsOf = (c: Cup, i: number) => [c.matches[i].a, c.matches[i].b];

describe("campeonato entre setores", () => {
  it("4 setores: 2 semifinais e a final; humanos em metades opostas", () => {
    const c = newCup(4, humans);
    expect(c.matches).toHaveLength(3);
    expect(c.teams).toHaveLength(4);
    expect(c.champion).toBeNull();
    const semi = [teamsOf(c, 0), teamsOf(c, 1)];
    const idx = (side: number) => c.teams.findIndex((t) => t.side === side);
    expect(semi[0]).toContain(idx(0));
    expect(semi[1]).toContain(idx(1));
    expect(c.matches[2].a).toBeNull();
  });

  it("8 setores: 7 jogos, sem setor repetido, humanos só se encontram na final", () => {
    const c = newCup(8, humans);
    expect(c.matches).toHaveLength(7);
    expect(new Set(c.teams.map((t) => t.name)).size).toBe(8);
    expect(c.teams.every((t) => (SETORES as readonly string[]).includes(t.name) || t.side !== null)).toBe(true);
    const a = c.teams.findIndex((t) => t.side === 0);
    const b = c.teams.findIndex((t) => t.side === 1);
    // metades opostas: o índice do time na chave decide a metade
    expect(a < 4).not.toBe(b < 4);
  });

  it("nome de time humano personalizado entra sem duplicar setores", () => {
    const c = newCup(4, [{ name: "Diretoria", side: 0 }, { name: "RH", side: 1 }]);
    expect(c.teams.map((t) => t.name).filter((n) => n === "RH")).toHaveLength(1);
    expect(c.teams.map((t) => t.name)).toContain("Diretoria");
  });

  it("simula só o que não tem humano e para no jogo dele", () => {
    const c = newCup(8, humans);
    simulateRest(c, mulberry32(7));
    const h = nextHumanMatch(c)!;
    expect(h).not.toBeNull();
    expect(c.matches[h].winner).toBeNull();
    const a = c.matches[h].a!;
    const b = c.matches[h].b!;
    expect(c.teams[a].side !== null || c.teams[b].side !== null).toBe(true);
    // todo jogo anterior ao dele que não tem humano já foi decidido
    for (let i = 0; i < h; i++) {
      const m = c.matches[i];
      const humanIn = m.a !== null && m.b !== null && (c.teams[m.a].side !== null || c.teams[m.b].side !== null);
      if (!humanIn) expect(m.winner).not.toBeNull();
    }
  });

  it("resultado do humano avança o vencedor e a final dá o campeão", () => {
    const c = newCup(4, humans);
    simulateRest(c, mulberry32(1));
    // joga os dois jogos humanos: Financeiro e TI vencem
    for (let guard = 0; guard < 4 && c.champion === null; guard++) {
      const i = nextHumanMatch(c);
      if (i === null) break;
      const m = c.matches[i];
      const win = m.a!;
      recordCupMatch(c, i, [2, 1], null, win);
      simulateRest(c, mulberry32(2));
    }
    expect(c.champion).not.toBeNull();
    expect(c.matches[2].winner).toBe(c.champion);
  });

  it("sem time humano na disputa, o resto é simulado até o campeão", () => {
    const c = newCup(8, humans);
    simulateRest(c, mulberry32(3));
    // elimina os dois humanos: perdem nos jogos em que entram
    for (let guard = 0; guard < 6; guard++) {
      const i = nextHumanMatch(c);
      if (i === null) break;
      const m = c.matches[i];
      const loser = c.teams[m.a!].side !== null ? m.a! : m.b!;
      const win = loser === m.a ? m.b! : m.a!;
      recordCupMatch(c, i, [0, 1], null, win);
      simulateRest(c, mulberry32(4));
    }
    expect(c.champion).not.toBeNull();
    expect(nextPlayable(c)).toBeNull();
    expect(c.matches.every((m) => m.winner !== null)).toBe(true);
  });

  it("empate simulado sai nos pênaltis e sempre tem vencedor", () => {
    for (let seed = 1; seed < 40; seed++) {
      const c = newCup(4, [{ name: "Financeiro", side: 0 }]);
      simulateRest(c, mulberry32(seed));
      for (const m of c.matches) {
        if (m.winner !== null && m.goals && m.goals[0] === m.goals[1]) expect(m.pens).not.toBeNull();
      }
    }
  });
});
