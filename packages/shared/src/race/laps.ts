import { RACE } from "./balance";
import { deltaS, type Track } from "./track";

/**
 * Contagem de voltas por checkpoints. cpCount conta checkpoints passados na ordem,
 * começando pela primeira passagem na linha de chegada (o grid fica atrás dela).
 */
export interface LapState {
  cpCount: number;
  lastS: number;
  lapStartedAt: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
  finishedAt: number | null;
}

export interface LapUpdate {
  state: LapState;
  lapDone: boolean;
  finished: boolean;
}

export function newLapState(s: number, startedAt: number): LapState {
  return { cpCount: 0, lastS: s, lapStartedAt: startedAt, lastLapMs: null, bestLapMs: null, finishedAt: null };
}

export function lapsDone(l: LapState, cps: number[]): number {
  return l.cpCount > 0 ? Math.floor((l.cpCount - 1) / cps.length) : 0;
}

/** Avança checkpoints só para a frente, um de cada vez, e só em passos curtos (reposição não conta). */
export function updateProgress(l: LapState, s: number, now: number, cps: number[], track: Track, laps: number = RACE.laps): LapUpdate {
  const out: LapUpdate = { state: { ...l, lastS: s }, lapDone: false, finished: false };
  if (l.finishedAt !== null) return out;
  const d = deltaS(track, l.lastS, s);
  if (d <= 0 || d > RACE.maxProgressStep) return out;
  const next = l.cpCount % cps.length;
  const toCp = deltaS(track, l.lastS, cps[next]);
  if (toCp <= 0 || toCp > d) return out;
  const st = out.state;
  st.cpCount++;
  if (next === 0 && st.cpCount > 1) {
    const lapMs = now - st.lapStartedAt;
    st.lastLapMs = lapMs;
    st.bestLapMs = st.bestLapMs === null ? lapMs : Math.min(st.bestLapMs, lapMs);
    st.lapStartedAt = now;
    out.lapDone = true;
    if (lapsDone(st, cps) >= laps) {
      st.finishedAt = now;
      out.finished = true;
    }
  }
  return out;
}

/** Distância percorrida na corrida, para a classificação ao vivo. */
export function raceProgress(l: LapState, s: number, cps: number[], track: Track): number {
  if (l.cpCount === 0) return deltaS(track, 0, s);
  const idx = (l.cpCount - 1) % cps.length;
  const gap = (idx + 1 < cps.length ? cps[idx + 1] : track.length) - cps[idx];
  const fwd = Math.max(0, Math.min(gap, deltaS(track, cps[idx], s)));
  return lapsDone(l, cps) * track.length + cps[idx] + fwd;
}

/** Terminados primeiro (por ordem de chegada), depois os demais pelo progresso. */
export function ranking(entries: { id: string; progress: number; finishedAt: number | null }[]): string[] {
  return [...entries]
    .sort((a, b) => {
      if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt;
      if (a.finishedAt !== null) return -1;
      if (b.finishedAt !== null) return 1;
      return b.progress - a.progress;
    })
    .map((e) => e.id);
}
