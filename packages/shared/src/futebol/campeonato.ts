import type { TeamSide } from "./types";

/** Setores que completam a chave. Os times humanos entram com o nome que a sala deu a eles. */
export const SETORES = ["Financeiro", "TI", "RH", "Jurídico", "Comercial", "Marketing", "Compras", "Logística"] as const;

export type CupSize = 4 | 8;
export const CUP_SIZES = [4, 8] as const;

/** side = lado do time humano na sala (0 ou 1); null = setor de bots, só simulado ou como adversário. */
export interface CupTeam {
  name: string;
  side: TeamSide | null;
}

/** Um jogo da chave. a e b são índices em `teams` (null = ainda por definir). goals e pens seguem a ordem a, b. */
export interface CupMatch {
  round: number;
  a: number | null;
  b: number | null;
  goals: [number, number] | null;
  pens: [number, number] | null;
  winner: number | null;
}

/** Mata-mata: os jogos ficam em ordem de rodada (primeira rodada, depois semifinais..., final por último). */
export interface Cup {
  size: CupSize;
  teams: CupTeam[];
  matches: CupMatch[];
  champion: number | null;
}

const blank = (round: number): CupMatch => ({ round, a: null, b: null, goals: null, pens: null, winner: null });

/** Cria a chave. Os times humanos (até 2) ficam em metades opostas: só se encontram na final. */
export function newCup(size: CupSize, humans: { name: string; side: TeamSide }[]): Cup {
  const teams: (CupTeam | null)[] = Array.from({ length: size }, () => null);
  const hs = humans.slice(0, 2);
  hs.forEach((h, i) => {
    teams[i === 0 ? 0 : size / 2] = { name: h.name, side: h.side };
  });
  const taken = new Set(hs.map((h) => h.name.toLowerCase()));
  const pool = SETORES.filter((s) => !taken.has(s.toLowerCase()));
  let next = 0;
  for (let i = 0; i < size; i++) {
    if (!teams[i]) {
      teams[i] = { name: pool[next++] ?? `Setor ${next}`, side: null };
    }
  }
  const matches: CupMatch[] = [];
  for (let n = size / 2, round = 0; n >= 1; n /= 2, round++) {
    for (let i = 0; i < n; i++) {
      matches.push(blank(round));
    }
  }
  for (let k = 0; k < size / 2; k++) {
    matches[k].a = 2 * k;
    matches[k].b = 2 * k + 1;
  }
  return { size, teams: teams as CupTeam[], matches, champion: null };
}

/** Índice do jogo seguinte ao jogo i (null na final). */
function nextOf(c: Cup, i: number): number | null {
  const last = c.matches.length - 1;
  if (i >= last) {
    return null;
  }
  let start = 0;
  for (let n = c.size / 2; ; n /= 2) {
    if (i < start + n) {
      return start + n + Math.floor((i - start) / 2);
    }
    start += n;
  }
}

/** Primeiro jogo que já tem os dois times e ainda não foi decidido. */
export function nextPlayable(c: Cup): number | null {
  const i = c.matches.findIndex((m) => m.a !== null && m.b !== null && m.winner === null);
  return i < 0 ? null : i;
}

const hasHuman = (c: Cup, m: CupMatch): boolean => (m.a !== null && c.teams[m.a].side !== null) || (m.b !== null && c.teams[m.b].side !== null);

/** Próximo jogo pendente em que joga um time humano (null = nenhum: só falta simular, ou acabou). */
export function nextHumanMatch(c: Cup): number | null {
  const i = c.matches.findIndex((m) => m.a !== null && m.b !== null && m.winner === null && hasHuman(c, m));
  return i < 0 ? null : i;
}

/** Registra o resultado de um jogo e leva o vencedor adiante (ou coroa o campeão na final). */
export function recordCupMatch(c: Cup, i: number, goals: [number, number], pens: [number, number] | null, winner: number): void {
  const m = c.matches[i];
  m.goals = goals;
  m.pens = pens;
  m.winner = winner;
  const n = nextOf(c, i);
  if (n === null) {
    c.champion = winner;
    return;
  }
  const slot = c.matches[n];
  // posição do jogo i dentro da sua rodada decide se o vencedor ocupa a vaga a ou b
  const first = c.matches.findIndex((x) => x.round === m.round);
  if ((i - first) % 2 === 0) {
    slot.a = winner;
  } else {
    slot.b = winner;
  }
}

/** Joga por resultado todos os jogos que não têm time humano, na ordem, e para no primeiro jogo com humano. */
export function simulateRest(c: Cup, rng: () => number): void {
  for (;;) {
    const i = nextPlayable(c);
    if (i === null) {
      return;
    }
    const m = c.matches[i];
    if (hasHuman(c, m)) {
      return;
    }
    const ga = Math.floor(rng() * 4);
    const gb = Math.floor(rng() * 4);
    let pens: [number, number] | null = null;
    let winner: number;
    if (ga === gb) {
      const aWins = rng() < 0.5;
      pens = aWins ? [5, 4] : [4, 5];
      winner = aWins ? m.a! : m.b!;
    } else {
      winner = ga > gb ? m.a! : m.b!;
    }
    recordCupMatch(c, i, [ga, gb], pens, winner);
  }
}
