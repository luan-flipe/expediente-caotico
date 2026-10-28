import { RACE } from "./balance";
import { pointAt, sideNormal, TRACK, turnAhead } from "./track";
import type { RaceMatch, Racer } from "./types";

/** Piloto automático simples: segue a linha central com desvio, derrapa nas curvas e usa itens. */
export function stepRaceBot(race: RaceMatch, r: Racer, dtMs: number): void {
  const b = (r.bot ??= { lane: 0, nextLaneAt: 0, stuckMs: 0, holdMs: 0 });
  const k = r.kart;
  const s = r.lap.lastS;
  if (race.now >= b.nextLaneAt) {
    b.lane = (race.rng() - 0.5) * 0.9;
    b.nextLaneAt = race.now + 2500 + race.rng() * 3500;
  }

  const ahead = pointAt(TRACK, s + 6 + Math.max(0, k.speed) * 0.35);
  const n = sideNormal(Math.sin(ahead.heading), Math.cos(ahead.heading));
  const lane = b.lane * (ahead.halfWidth - 1.5);
  const tx = ahead.pos.x + n.x * lane;
  const tz = ahead.pos.z + n.z * lane;
  const want = Math.atan2(tx - k.pos.x, tz - k.pos.z);
  const diff = Math.atan2(Math.sin(want - k.heading), Math.cos(want - k.heading));
  const steer = Math.max(-1, Math.min(1, -diff * 2.5));
  const turn = turnAhead(TRACK, s + 3, 18);

  const drift = k.drifting
    ? Math.abs(turnAhead(TRACK, s, 10)) > 0.15 && k.driftMs < RACE.driftLevel2Ms + 150
    : Math.abs(turn) > 0.6 && k.speed > 10 && Math.abs(steer) > 0.35;
  const throttle = Math.abs(turn) > 1.3 && k.speed > 12 && !k.drifting ? 0.2 : 1;
  r.input = { steer, throttle, drift };

  b.stuckMs = Math.abs(k.speed) < 1 && race.now >= k.frozenUntil ? b.stuckMs + dtMs : 0;
  if (b.stuckMs > 2500) {
    r.respawnQueued = true;
    b.stuckMs = 0;
  }

  if (!r.item || r.lap.finishedAt !== null) {
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
  const straight = Math.abs(turnAhead(TRACK, s, 25)) < 0.35;
  let use = false;
  switch (r.item) {
    case "expresso":
    case "triplo":
      use = straight && b.holdMs > 500;
      break;
    case "grampeador":
    case "aviao":
    case "postit":
      use = near.ahead < 25 || b.holdMs > 6000;
      break;
    case "poca":
    case "resma":
      use = near.behind < 12 || b.holdMs > 4000;
      break;
    case "pasta":
      use = b.holdMs > 3000;
      break;
  }
  if (use) {
    r.useQueued = true;
    b.holdMs = 0;
  }
}
