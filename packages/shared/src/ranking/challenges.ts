/** Pontos no mês por cumprir o desafio da semana (uma vez por semana, por conta). */
export const CHALLENGE_POINTS = 8;

/**
 * Limite do desafio de volta. O Circuito Corporativo tem 347 m; a 16 m/s (máximo da cadeira) o chão é 21,7 s
 * e os bots, que dirigem bem, fecham entre 24 e 27 s. Humano com derrapagem boa chega perto de 30 s:
 * é uma meta puxada, mas possível. (O "52 s" do rascunho do spec seria fácil demais.)
 */
export const LAP_CHALLENGE_MS = 30000;

/** Semanas de progresso guardadas no arquivo (as mais recentes); o resto é descartado. */
export const WEEKS_KEPT = 6;

/** O que a conta fez na semana, só com partidas que contam (volta vale também no treino). */
export interface WeekProgress {
  shooterMatches: number;
  shooterWins: number;
  shooterKills: number;
  /** Mais eliminações numa única partida de tiroteio. */
  bestKills: number;
  /** Corridas jogadas (inclusive quem não terminou). */
  raceMatches: number;
  /** Corridas em que cruzou a linha de chegada. */
  raceFinished: number;
  raceWins: number;
  racePodiums: number;
  /** Melhor volta da semana no Circuito Corporativo, inclusive no Contra o relógio. */
  bestLapMs: number | null;
  /** Quando cumpriu o desafio da semana; null enquanto não cumpriu. */
  doneAt: number | null;
}

export function emptyProgress(): WeekProgress {
  return { shooterMatches: 0, shooterWins: 0, shooterKills: 0, bestKills: 0, raceMatches: 0, raceFinished: 0, raceWins: 0, racePodiums: 0, bestLapMs: null, doneAt: null };
}

export interface Challenge {
  id: string;
  text: string;
  target: number;
  /** Quanto do alvo já foi feito (pode passar do alvo). */
  value: (p: WeekProgress) => number;
}

/**
 * Lista fixa de desafios, sorteada por semana. Fica de fora, por enquanto, "Pódio em 3 pistas diferentes":
 * a PR 7 (mais pistas no Rally) acrescenta esse desafio junto com o progresso por pista.
 */
export const CHALLENGES: Challenge[] = [
  { id: "volta-rapida", text: `Volta abaixo de ${LAP_CHALLENGE_MS / 1000} s no Circuito Corporativo`, target: 1, value: (p) => (p.bestLapMs !== null && p.bestLapMs < LAP_CHALLENGE_MS ? 1 : 0) },
  { id: "tiroteio-3-vitorias", text: "3 vitórias no tiroteio", target: 3, value: (p) => p.shooterWins },
  { id: "corridas-5", text: "Terminar 5 corridas", target: 5, value: (p) => p.raceFinished },
  { id: "eliminacoes-10-partida", text: "10 eliminações numa partida", target: 10, value: (p) => p.bestKills },
  { id: "tiroteio-4-partidas", text: "Jogar 4 partidas de tiroteio", target: 4, value: (p) => p.shooterMatches },
  { id: "eliminacoes-25-semana", text: "25 eliminações na semana", target: 25, value: (p) => p.shooterKills },
  { id: "rally-2-vitorias", text: "2 vitórias no Rally", target: 2, value: (p) => p.raceWins },
  { id: "rally-3-podios", text: "3 pódios no Rally", target: 3, value: (p) => p.racePodiums },
  { id: "vencer-os-dois", text: "Vencer um tiroteio e uma corrida", target: 2, value: (p) => Math.min(p.shooterWins, 1) + Math.min(p.raceWins, 1) },
  { id: "tres-de-cada", text: "Jogar 3 tiroteios e 3 corridas", target: 6, value: (p) => Math.min(p.shooterMatches, 3) + Math.min(p.raceMatches, 3) },
  { id: "seis-partidas", text: "Jogar 6 partidas, de qualquer modo", target: 6, value: (p) => p.shooterMatches + p.raceMatches },
  { id: "rally-1-vitoria", text: "Vencer uma corrida", target: 1, value: (p) => p.raceWins },
];

export function challengeDone(c: Challenge, p: WeekProgress): boolean {
  return c.value(p) >= c.target;
}

const DAY_MS = 86400000;
const DATE_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });

/** "YYYY-MM-DD" da segunda-feira (0h de Brasília) que abre a semana de `date`. */
export function weekKey(date: Date): string {
  const p: Record<string, string> = {};
  for (const part of DATE_FMT.formatToParts(date)) p[part.type] = part.value;
  const day = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  const sinceMonday = (new Date(day).getUTCDay() + 6) % 7;
  return new Date(day - sinceMonday * DAY_MS).toISOString().slice(0, 10);
}

/** Hash FNV-1a da chave: o sorteio da semana não precisa de nada guardado. */
function hash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Ordem embaralhada da lista numa "temporada" (um ciclo de semanas), decidida só pelo número dela. */
function seasonOrder(season: number): Challenge[] {
  return CHALLENGES.map((c) => ({ c, h: hash(`${season}:${c.id}`) }))
    .sort((a, b) => a.h - b.h || (a.c.id < b.c.id ? -1 : 1))
    .map((x) => x.c);
}

/**
 * Desafio da semana `key`: igual para todos, sem guardar nada. Cada ciclo de N semanas (N = tamanho da lista)
 * passa por todos os desafios uma vez, em ordem embaralhada pelo ciclo; assim nunca repete de uma semana para a outra.
 */
export function challengeOfWeek(key: string): Challenge {
  const n = CHALLENGES.length;
  const week = Math.floor(Date.parse(`${key}T12:00:00Z`) / (7 * DAY_MS));
  const season = Math.floor(week / n);
  const order = seasonOrder(season);
  // a primeira da temporada não pode ser igual à última da anterior: troca com a segunda
  if (n > 2 && order[0].id === seasonOrder(season - 1)[n - 1].id) [order[0], order[1]] = [order[1], order[0]];
  return order[week - season * n];
}
