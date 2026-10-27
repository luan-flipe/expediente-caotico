import type { GhostSample, LapRow, MonthRow, PlayerStats, RallyRow, RankingData, RankingRowBase, RankingTab, RankingView, ShooterRow } from "./types";

/** Pontos do mês por colocação (1º, 2º, 3º); os demais ganham PARTICIPATION_POINTS. */
export const PLACE_POINTS = [10, 6, 4];
export const PARTICIPATION_POINTS = 1;
/** Bônus no mês por bater o recorde de volta da firma. */
export const RECORD_POINTS = 5;
/** Circuito Corporativo, a única pista com recorde. */
export const MAIN_TRACK_ID = "corporativo";
/** Linhas por aba na tela de ranking. */
export const RANKING_ROWS = 20;

const MONTH_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" });

export function emptyRankingData(): RankingData {
  return { version: 1, accounts: {}, stats: {}, months: {}, laps: {} };
}

/** "YYYY-MM" em horário de Brasília (o mês vira à meia-noite de lá, não de UTC). */
export function monthKey(date: Date): string {
  const p: Record<string, string> = {};
  for (const part of MONTH_FMT.formatToParts(date)) p[part.type] = part.value;
  return `${p.year}-${p.month}`;
}

/** A partida só pontua com 2 ou mais contas distintas (bots, visitantes e abas repetidas não contam). */
export function matchCounts(entries: { accountId: string | null }[]): boolean {
  return new Set(entries.flatMap((e) => (e.accountId === null ? [] : [e.accountId]))).size >= 2;
}

function emptyStats(): PlayerStats {
  return { shooterWins: 0, shooterMatches: 0, shooterKills: 0, raceWins: 0, racePodiums: 0, raceMatches: 0, bestLapMs: null };
}

function statsOf(data: RankingData, id: string): PlayerStats {
  return (data.stats[id] ??= emptyStats());
}

function addPoints(data: RankingData, now: number, id: string, points: number): void {
  const month = (data.months[monthKey(new Date(now))] ??= {});
  month[id] = (month[id] ?? 0) + points;
}

function placePoints(place: number): number {
  return PLACE_POINTS[place - 1] ?? PARTICIPATION_POINTS;
}

/** Uma linha por conta (ignora sem conta), mantendo a melhor segundo `better`. */
function onePerAccount<T extends { accountId: string | null }>(rows: T[], better: (a: T, b: T) => boolean): (T & { accountId: string })[] {
  const best = new Map<string, T & { accountId: string }>();
  for (const r of rows) {
    if (r.accountId === null) continue;
    const row = r as T & { accountId: string };
    const cur = best.get(row.accountId);
    if (!cur || better(row, cur)) best.set(row.accountId, row);
  }
  return [...best.values()];
}

/** `rank` já considera empate (empatados no 1º lugar vêm todos com rank 1 e todos vencem). */
export function applyShooterResult(data: RankingData, rows: { accountId: string | null; rank: number; kills: number }[], now: number): void {
  if (!matchCounts(rows)) return;
  const better = (a: { rank: number; kills: number }, b: { rank: number; kills: number }) => a.rank < b.rank || (a.rank === b.rank && a.kills > b.kills);
  for (const r of onePerAccount(rows, better)) {
    const s = statsOf(data, r.accountId);
    s.shooterMatches++;
    s.shooterKills += r.kills;
    if (r.rank === 1) s.shooterWins++;
    addPoints(data, now, r.accountId, placePoints(r.rank));
  }
}

/** `place` de todos que correram, inclusive quem não terminou (conta como corrida jogada). */
export function applyRaceResult(data: RankingData, rows: { accountId: string | null; place: number }[], now: number): void {
  if (!matchCounts(rows)) return;
  for (const r of onePerAccount(rows, (a, b) => a.place < b.place)) {
    const s = statsOf(data, r.accountId);
    s.raceMatches++;
    if (r.place === 1) s.raceWins++;
    if (r.place <= PLACE_POINTS.length) s.racePodiums++;
    addPoints(data, now, r.accountId, placePoints(r.place));
  }
}

/**
 * Registra uma volta válida. Fantasma e melhor volta só mudam se for estritamente melhor que a própria;
 * recorde é estritamente melhor que a melhor da firma na pista (a primeira volta de todas também é recorde).
 */
export function applyLap(data: RankingData, trackId: string, accountId: string, ms: number, ghost: GhostSample[], now: number): { personalBest: boolean; record: boolean } {
  const board = (data.laps[trackId] ??= {});
  const mine = board[accountId];
  if (mine && ms >= mine.ms) return { personalBest: false, record: false };
  const record = Object.values(board).every((l) => ms < l.ms);
  board[accountId] = { ms, at: now, ghost };
  const s = statsOf(data, accountId);
  s.bestLapMs = s.bestLapMs === null ? ms : Math.min(s.bestLapMs, ms);
  if (record) addPoints(data, now, accountId, RECORD_POINTS);
  return { personalBest: true, record };
}

function previousMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Numera as linhas já ordenadas e monta a aba (top + linha do jogador). */
function buildTab<R extends RankingRowBase>(sorted: Omit<R, "rank">[], viewerId: string | undefined): RankingTab<R> {
  const all = sorted.map((r, i) => ({ ...r, rank: i + 1 }) as R);
  return { rows: all.slice(0, RANKING_ROWS), me: viewerId === undefined ? null : (all.find((r) => r.id === viewerId) ?? null) };
}

export function rankingView(data: RankingData, now: number, viewerId?: string): RankingView {
  const nameOf = (id: string) => data.accounts[id]?.name ?? "Jogador";
  const current = monthKey(new Date(now));
  const monthRows = (key: string): Omit<MonthRow, "rank">[] =>
    Object.entries(data.months[key] ?? {})
      .filter(([, points]) => points > 0)
      .map(([id, points]) => ({ id, name: nameOf(id), points }))
      .sort((a, b) => b.points - a.points || byId(a, b));

  const stats = Object.entries(data.stats);
  const tiroteio: Omit<ShooterRow, "rank">[] = stats
    .filter(([, s]) => s.shooterMatches > 0)
    .map(([id, s]) => ({ id, name: nameOf(id), wins: s.shooterWins, matches: s.shooterMatches, kills: s.shooterKills }))
    .sort((a, b) => b.wins - a.wins || b.kills - a.kills || byId(a, b));
  const rally: Omit<RallyRow, "rank">[] = stats
    .filter(([, s]) => s.raceMatches > 0)
    .map(([id, s]) => ({ id, name: nameOf(id), wins: s.raceWins, podiums: s.racePodiums, matches: s.raceMatches }))
    .sort((a, b) => b.wins - a.wins || b.podiums - a.podiums || byId(a, b));
  const voltas: Omit<LapRow, "rank">[] = Object.entries(data.laps[MAIN_TRACK_ID] ?? {})
    .map(([id, l]) => ({ id, name: nameOf(id), ms: l.ms }))
    .sort((a, b) => a.ms - b.ms || byId(a, b));

  const prev = previousMonth(current);
  const top = monthRows(prev)[0];
  return {
    mes: buildTab<MonthRow>(monthRows(current), viewerId),
    tiroteio: buildTab<ShooterRow>(tiroteio, viewerId),
    rally: buildTab<RallyRow>(rally, viewerId),
    voltas: buildTab<LapRow>(voltas, viewerId),
    mesPassado: top ? { month: prev, id: top.id, name: top.name, points: top.points } : null,
  };
}
