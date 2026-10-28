import { CHALLENGE_POINTS, WEEKS_KEPT, challengeDone, challengeOfWeek, emptyProgress, weekKey, type WeekProgress } from "./challenges";
import { DEFAULT_TRACK_ID, TRACKS, TRACK_IDS, type TrackId } from "../race/track";
import type { ChallengeView, GhostSample, LapRow, MonthRow, PlayerStats, RallyRow, RankingData, RankingRowBase, RankingTab, RankingView, ShooterRow, StoredLap } from "./types";

/** Pontos do mês por colocação (1º, 2º, 3º); os demais ganham PARTICIPATION_POINTS. */
export const PLACE_POINTS = [10, 6, 4];
export const PARTICIPATION_POINTS = 1;
/** Bônus no mês por bater o recorde de volta da firma. */
export const RECORD_POINTS = 5;
/** Circuito Corporativo: pista padrão e a única do desafio de volta. */
export const MAIN_TRACK_ID: TrackId = DEFAULT_TRACK_ID;
/** Linhas por aba na tela de ranking. */
export const RANKING_ROWS = 20;

const MONTH_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" });

export function emptyRankingData(): RankingData {
  return { version: 1, accounts: {}, stats: {}, months: {}, laps: {}, challenges: {} };
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

/** Progresso da conta na semana de `now`; cria (e poda semanas antigas) se ainda não existe. */
function weekProgress(data: RankingData, now: number, id: string): WeekProgress {
  const challenges = (data.challenges ??= {});
  const key = weekKey(new Date(now));
  if (!challenges[key]) {
    challenges[key] = {};
    for (const old of Object.keys(challenges).sort().slice(0, -WEEKS_KEPT)) delete challenges[old];
  }
  return (challenges[key][id] ??= emptyProgress());
}

/** Se o progresso já cumpre o desafio da semana e ainda não pagou, paga +8 e devolve true (uma vez por semana). */
function settleChallenge(data: RankingData, now: number, id: string, p: WeekProgress): boolean {
  if (p.doneAt !== null || !challengeDone(challengeOfWeek(weekKey(new Date(now))), p)) return false;
  p.doneAt = now;
  addPoints(data, now, id, CHALLENGE_POINTS);
  return true;
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

/**
 * `rank` já considera empate (empatados no 1º lugar vêm todos com rank 1 e todos vencem).
 * Devolve as contas que cumpriram o desafio da semana com esta partida.
 */
export function applyShooterResult(data: RankingData, rows: { accountId: string | null; rank: number; kills: number }[], now: number): string[] {
  if (!matchCounts(rows)) return [];
  const better = (a: { rank: number; kills: number }, b: { rank: number; kills: number }) => a.rank < b.rank || (a.rank === b.rank && a.kills > b.kills);
  const completed: string[] = [];
  for (const r of onePerAccount(rows, better)) {
    const s = statsOf(data, r.accountId);
    s.shooterMatches++;
    s.shooterKills += r.kills;
    if (r.rank === 1) s.shooterWins++;
    addPoints(data, now, r.accountId, placePoints(r.rank));
    const w = weekProgress(data, now, r.accountId);
    w.shooterMatches++;
    w.shooterKills += r.kills;
    w.bestKills = Math.max(w.bestKills, r.kills);
    if (r.rank === 1) w.shooterWins++;
    if (settleChallenge(data, now, r.accountId, w)) completed.push(r.accountId);
  }
  return completed;
}

/**
 * `place` de todos que correram, inclusive quem não terminou (conta como corrida jogada).
 * `finished` ausente vale "terminou". `trackId` é a pista da corrida (conta para o desafio de pódio em pistas diferentes).
 * Devolve as contas que cumpriram o desafio da semana.
 */
export function applyRaceResult(data: RankingData, rows: { accountId: string | null; place: number; finished?: boolean }[], now: number, trackId: string = MAIN_TRACK_ID): string[] {
  if (!matchCounts(rows)) return [];
  const completed: string[] = [];
  for (const r of onePerAccount(rows, (a, b) => a.place < b.place)) {
    const s = statsOf(data, r.accountId);
    s.raceMatches++;
    if (r.place === 1) s.raceWins++;
    if (r.place <= PLACE_POINTS.length) s.racePodiums++;
    addPoints(data, now, r.accountId, placePoints(r.place));
    const w = weekProgress(data, now, r.accountId);
    w.raceMatches++;
    if (r.finished !== false) w.raceFinished++;
    if (r.place === 1) w.raceWins++;
    if (r.place <= PLACE_POINTS.length) {
      w.racePodiums++;
      const tracks = (w.podiumTracks ??= []);
      if (!tracks.includes(trackId)) tracks.push(trackId);
    }
    if (settleChallenge(data, now, r.accountId, w)) completed.push(r.accountId);
  }
  return completed;
}

/**
 * Volta válida da conta para o desafio da semana (vale em qualquer modo, inclusive Contra o relógio, sem exigir 2 contas).
 * Chamar a cada volta fechada, mesmo que não melhore a melhor de sempre. Só o Circuito Corporativo conta para o
 * desafio de volta. Devolve a conta se acabou de cumprir o desafio.
 */
export function applyWeeklyLap(data: RankingData, accountId: string, ms: number, now: number, trackId: string = MAIN_TRACK_ID): string[] {
  if (trackId !== MAIN_TRACK_ID) return [];
  const w = weekProgress(data, now, accountId);
  w.bestLapMs = w.bestLapMs === null ? ms : Math.min(w.bestLapMs, ms);
  return settleChallenge(data, now, accountId, w) ? [accountId] : [];
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
  const holder = Object.entries(board).sort((x, y) => x[1].ms - y[1].ms)[0]?.[0] ?? null;
  board[accountId] = { ms, at: now, ghost };
  const s = statsOf(data, accountId);
  s.bestLapMs = s.bestLapMs === null ? ms : Math.min(s.bestLapMs, ms);
  // os pontos são por tomar o recorde de alguém; melhorar o próprio não pontua de novo
  if (record && holder !== accountId) addPoints(data, now, accountId, RECORD_POINTS);
  return { personalBest: true, record };
}

function previousMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Melhores voltas da pista, da mais rápida para a mais lenta (empate pelo id): a ordem da aba Recordes de volta. */
export function lapStandings(data: RankingData, trackId: string): { id: string; lap: StoredLap }[] {
  return Object.entries(data.laps[trackId] ?? {})
    .map(([id, lap]) => ({ id, lap }))
    .sort((a, b) => a.lap.ms - b.lap.ms || byId(a, b));
}

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
  const voltasDe = (trackId: string) => buildTab<LapRow>(lapStandings(data, trackId).map(({ id, lap }) => ({ id, name: nameOf(id), ms: lap.ms })), viewerId);

  const prev = previousMonth(current);
  const week = weekKey(new Date(now));
  const challenge = challengeOfWeek(week);
  const weekRows = data.challenges?.[week] ?? {};
  const mineProgress = viewerId === undefined ? undefined : (weekRows[viewerId] ?? emptyProgress());
  const desafio: ChallengeView = {
    id: challenge.id,
    text: challenge.text,
    target: challenge.target,
    points: CHALLENGE_POINTS,
    week,
    mine: mineProgress === undefined ? null : { value: Math.min(challenge.value(mineProgress), challenge.target), target: challenge.target, done: mineProgress.doneAt !== null, bestLapMs: mineProgress.bestLapMs },
    completed: Object.entries(weekRows)
      .filter(([, p]) => p.doneAt !== null)
      .sort((a, b) => a[1].doneAt! - b[1].doneAt! || byId({ id: a[0] }, { id: b[0] }))
      .map(([id]) => ({ id, name: nameOf(id) })),
  };
  const top = monthRows(prev)[0];
  return {
    mes: buildTab<MonthRow>(monthRows(current), viewerId),
    tiroteio: buildTab<ShooterRow>(tiroteio, viewerId),
    rally: buildTab<RallyRow>(rally, viewerId),
    voltas: voltasDe(MAIN_TRACK_ID),
    pistas: TRACK_IDS.map((id) => ({ id, name: TRACKS[id].name, voltas: voltasDe(id) })),
    desafio,
    mesPassado: top ? { month: prev, id: top.id, name: top.name, points: top.points } : null,
  };
}
