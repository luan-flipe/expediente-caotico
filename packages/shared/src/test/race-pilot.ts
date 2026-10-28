import { newLapState, updateProgress } from "../race/laps";
import { newKart, stepKart, type KartInput, type KartState } from "../race/kart";
import { checkpoints, deltaS, pointAt, progressOf, routeAhead, type Track } from "../race/track";

export const DT = 1000 / 30;

/** Piloto de teste: mira um ponto à frente no caminho escolhido (route -1 = principal), sempre acelerando. */
export function pilot(track: Track, k: KartState, route: number): KartInput {
  const pr = progressOf(track, k.pos, k.path);
  const at = routeAhead(track, pr, route, 6 + Math.max(0, k.speed) * 0.3);
  const want = Math.atan2(at.pos.x - k.pos.x, at.pos.z - k.pos.z);
  const diff = Math.atan2(Math.sin(want - k.heading), Math.cos(want - k.heading));
  return { steer: Math.max(-1, Math.min(1, -diff * 2.8)), throttle: 1, drift: false };
}

/** Uma volta lançada (da linha até a linha) pelo caminho route; devolve tempo, checkpoints e se bateu. */
export function flyingLap(track: Track, route: number) {
  const cps = checkpoints(track);
  const start = pointAt(track, track.length - 30);
  let k: KartState = newKart(start.pos, start.heading);
  let lap = newLapState(track.length - 30, 0);
  let now = 0;
  let walls = 0;
  let maxStep = 0;
  let usedBranch = false;
  const cpOrder: number[] = [];
  for (let i = 0; i < 4000; i++) {
    now += DT;
    const before = lap.lastS;
    const res = stepKart(k, pilot(track, k, route), DT, now, track);
    k = res.state;
    if (res.wall) walls++;
    if (k.path === route && route >= 0) usedBranch = true;
    const s = progressOf(track, k.pos, k.path).s;
    maxStep = Math.max(maxStep, deltaS(track, before, s));
    const cpBefore = lap.cpCount;
    const u = updateProgress(lap, s, now, cps, track, 99);
    lap = u.state;
    if (lap.cpCount > cpBefore && cpBefore >= 1) cpOrder.push((lap.cpCount - 1) % cps.length);
    if (u.lapDone) return { ms: lap.lastLapMs!, walls, maxStep, usedBranch, cpOrder, cps };
  }
  throw new Error("volta não fechou");
}
