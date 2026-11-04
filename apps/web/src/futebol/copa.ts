import { nextHumanMatch, type Cup } from "@ec/shared";

export interface CupSlot {
  name: string;
  human: boolean;
  goals: number | null;
  pens: number | null;
  won: boolean;
}

export interface CupRoundView {
  name: string;
  matches: { index: number; a: CupSlot; b: CupSlot; next: boolean }[];
}

const ROUND_NAMES: Record<number, string[]> = { 4: ["Semifinais", "Final"], 8: ["Quartas", "Semifinais", "Final"] };

/** A chave pronta para desenhar: rodadas com nome, cada jogo com os dois lados (placar, pênaltis, vencedor) e o próximo jogo de humano marcado. */
export function cupRounds(c: Cup): CupRoundView[] {
  const next = nextHumanMatch(c);
  const slot = (team: number | null, m: Cup["matches"][number], pos: 0 | 1): CupSlot => ({
    name: team === null ? "A definir" : c.teams[team].name,
    human: team !== null && c.teams[team].side !== null,
    goals: m.goals ? m.goals[pos] : null,
    pens: m.pens ? m.pens[pos] : null,
    won: team !== null && m.winner === team,
  });
  const names = ROUND_NAMES[c.size] ?? [];
  const rounds: CupRoundView[] = names.map((name) => ({ name, matches: [] }));
  c.matches.forEach((m, index) => {
    rounds[m.round]?.matches.push({ index, a: slot(m.a, m, 0), b: slot(m.b, m, 1), next: index === next });
  });
  return rounds;
}
