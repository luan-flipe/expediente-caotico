import { RACE_BOT } from "../botLevels";
import { RACE } from "./balance";
import { deltaS, pointAt, progressOf, routeAhead, sideNormal, turnAhead } from "./track";
import type { RaceMatch, Racer } from "./types";

/** Perto da boca de um atalho, o lado da principal (-1/+1) oposto a ele; 0 longe das bocas. */
function awaySide(race: RaceMatch, s: number): number {
  for (const br of race.track.branches) {
    const span = deltaS(race.track, br.sFrom, br.sTo);
    const into = deltaS(race.track, br.sFrom - 10, s);
    if (into < 0 || into > 20) continue;
    const mid = br.points[Math.floor(br.points.length / 2)];
    const at = pointAt(race.track, br.sFrom + span / 2);
    const n = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    return (mid.x - at.pos.x) * n.x + (mid.z - at.pos.z) * n.z > 0 ? -1 : 1;
  }
  return 0;
}

/** Piloto automático simples: segue a linha central com desvio, derrapa nas curvas e usa itens. */
export function stepRaceBot(race: RaceMatch, r: Racer, dtMs: number): void {
  const b = (r.bot ??= { lane: 0, nextLaneAt: 0, stuckMs: 0, holdMs: 0 });
  const k = r.kart;
  const P = RACE_BOT[race.botLevel];
  const s = r.lap.lastS;
  if (race.now >= b.nextLaneAt) {
    b.lane = (race.rng() - 0.5) * P.laneSpread;
    b.nextLaneAt = race.now + 2500 + race.rng() * 3500;
  }

  // bifurcação: sorteia uma vez a 20 m da boca e esquece depois de sair do atalho
  race.track.branches.forEach((br, i) => {
    const toMouth = deltaS(race.track, s, br.sFrom);
    // atalho com vão: só quem chega rápido o bastante para atravessar
    const gap = race.track.ramps.some((rp) => rp.path === i && rp.gap);
    const fast = !gap || k.speed >= RACE.minLaunchSpeed + 6;
    if (b.route === undefined && toMouth >= 0 && toMouth <= 20) b.route = fast && race.rng() < P.shortcutChance ? i : -1;
    const past = deltaS(race.track, br.sTo, s);
    if (b.route !== undefined && past > 0 && past < 30 && (k.path ?? -1) === -1) b.route = undefined;
  });
  const route = b.route ?? -1;
  const pr = progressOf(race.track, k.pos, k.path);
  const ahead = routeAhead(race.track, pr, route, P.lookBase + Math.max(0, k.speed) * P.lookSpeed);
  const n = sideNormal(Math.sin(ahead.heading), Math.cos(ahead.heading));
  // perto da bifurcação: no atalho, pelo centro; na principal, um pouco para longe da boca do atalho
  const away = route === -1 ? awaySide(race, pr.s) : 0;
  const lane = b.route === undefined ? b.lane * (ahead.halfWidth - 1.5) : away * Math.min(1.5, ahead.halfWidth - 2);
  const tx = ahead.pos.x + n.x * lane;
  const tz = ahead.pos.z + n.z * lane;
  const want = Math.atan2(tx - k.pos.x, tz - k.pos.z);
  const diff = Math.atan2(Math.sin(want - k.heading), Math.cos(want - k.heading));
  const steer = Math.max(-1, Math.min(1, -diff * P.steerGain));
  const turnOn = (from: number, len: number) => {
    const h0 = routeAhead(race.track, pr, route, from).heading;
    const h1 = routeAhead(race.track, pr, route, from + len).heading;
    return Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0));
  };
  const turn = turnOn(3, 18);

  const drift = k.drifting
    ? Math.abs(turnOn(0.1, 10)) > 0.15 && k.driftMs < RACE.driftLevel2Ms + 150
    : Math.abs(turn) > 0.6 && k.speed > 10 && Math.abs(steer) > 0.35;
  const throttle = Math.abs(turn) > 1.3 && k.speed > 12 && !k.drifting ? P.cornerThrottle : P.throttleMax;
  r.input = { steer, throttle, drift };

  b.stuckMs = Math.abs(k.speed) < 1 && race.now >= k.frozenUntil ? b.stuckMs + dtMs : 0;
  if (b.stuckMs > 2500) {
    r.respawnQueued = true;
    b.stuckMs = 0;
  }

  if (race.itemsOff || !r.item || r.lap.finishedAt !== null) {
    b.holdMs = 0;
    return;
  }
  b.holdMs += dtMs;
  const near = { ahead: Infinity, behind: Infinity };
  for (const o of race.racers.values()) {
    if (o === r) continue;
    const d = o.progress - r.progress;
    if (d > 0) near.ahead = Math.min(near.ahead, d);
    else near.behind = Math.min(near.behind, -d);
  }
  const straight = Math.abs(turnAhead(race.track, s, 25)) < 0.35;
  let use = false;
  switch (r.item) {
    case "expresso":
    case "triplo":
      use = straight && b.holdMs > 500 * P.holdScale;
      break;
    case "grampeador":
    case "aviao":
    case "postit":
      use = near.ahead < 25 * P.rangeScale || b.holdMs > 6000 * P.holdScale;
      break;
    case "poca":
    case "resma":
      use = near.behind < 12 * P.rangeScale || b.holdMs > 4000 * P.holdScale;
      break;
    case "pasta":
      use = b.holdMs > 3000 * P.holdScale;
      break;
  }
  if (use) {
    r.useQueued = true;
    b.holdMs = 0;
  }
}
