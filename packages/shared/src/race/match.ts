import type { AvatarDNA } from "../types";
import { mulberry32 } from "../rng";
import { RACE } from "./balance";
import { stepRaceBot } from "./bots";
import type { ChairDNA } from "./chair";
import { pickBoxes, stepHazards, useItem } from "./items";
import { collideKarts, NO_INPUT, newKart, respawnAt, stepKart, type KartInput } from "./kart";
import { lapsDone, newLapState, raceProgress, ranking, updateProgress } from "./laps";
import { boxSpots, checkpoints, clampToTrack, cupSpots, gridSlots, pointAt, progressOf, TRACK } from "./track";
import type { ItemId, RaceMatch, Racer, RacePrivate, RaceResultRow, RaceSnapshot } from "./types";

export interface RacePlayerInfo {
  id: string;
  name: string;
  avatar: AvatarDNA;
  chair: ChairDNA;
  isBot: boolean;
}

export function createRace(opts: { seed: number; players: RacePlayerInfo[]; laps?: number; graceMs?: number }): RaceMatch {
  const rng = mulberry32(opts.seed);
  const order = [...opts.players].sort(() => rng() - 0.5);
  const slots = gridSlots(TRACK, order.length);
  const race: RaceMatch = {
    now: 0,
    phase: "countdown",
    countdownEndsAt: RACE.countdownMs,
    graceEndsAt: null,
    laps: opts.laps ?? RACE.laps,
    graceMs: opts.graceMs ?? RACE.finishGraceMs,
    racers: new Map(),
    hazards: [],
    boxes: boxSpots(TRACK).map((pos, i) => ({ id: i, pos, readyAt: 0 })),
    cups: cupSpots(TRACK).map((pos, i) => ({ id: i, pos, readyAt: 0 })),
    events: [],
    cps: checkpoints(TRACK),
    rng,
    nextId: 1,
  };
  order.forEach((info, i) => {
    const slot = slots[i];
    const s = progressOf(TRACK, slot.pos).s;
    const r: Racer = {
      ...info,
      connected: true,
      kart: newKart(slot.pos, slot.heading),
      input: { ...NO_INPUT },
      lap: newLapState(s, RACE.countdownMs),
      progress: 0,
      place: i + 1,
      item: null,
      charges: 0,
      useQueued: false,
      respawnQueued: false,
      shieldUntil: 0,
      blindUntil: 0,
      wrongMs: 0,
      inputQueue: [],
      ackSeq: 0,
      idleTicks: 0,
      stepCredit: 0,
      itemsUsed: {},
    };
    r.progress = raceProgress(r.lap, s, race.cps, TRACK);
    race.racers.set(r.id, r);
  });
  return race;
}

const clampIn = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

/** Com seq, o comando entra na fila e é aplicado no próximo tick livre; sem seq, vale na hora. */
export function setKartInput(race: RaceMatch, id: string, input: KartInput, seq?: number): void {
  const r = race.racers.get(id);
  if (!r || r.isBot) return;
  const clean: KartInput = {
    steer: clampIn(input.steer),
    throttle: clampIn(input.throttle),
    drift: !!input.drift,
    itemHold: input.itemHold !== undefined ? !!input.itemHold : r.holdingItem,
  };
  r.holdingItem = clean.itemHold;
  if (seq === undefined) {
    r.input = clean;
    return;
  }
  if (seq <= r.ackSeq || r.inputQueue.some((q) => q.seq >= seq)) return;
  r.inputQueue.push({ seq, input: clean });
  if (r.inputQueue.length > RACE.maxQueuedInputs) r.inputQueue.shift();
}

export function queueItemUse(race: RaceMatch, id: string): void {
  const r = race.racers.get(id);
  if (r) r.useQueued = true;
}

export function respawnRequest(race: RaceMatch, id: string): void {
  const r = race.racers.get(id);
  if (r && race.phase === "active" && race.now >= r.kart.frozenUntil) r.respawnQueued = true;
}

/** Volta para o último checkpoint passado, parado por alguns segundos. */
function respawn(race: RaceMatch, r: Racer): void {
  const s = r.lap.cpCount === 0 ? TRACK.length - 5 : race.cps[(r.lap.cpCount - 1) % race.cps.length] + 0.5;
  const at = respawnAt(TRACK, s);
  r.kart = { ...newKart(at.pos, at.heading), frozenUntil: race.now + RACE.respawnPenaltyMs };
  r.lap = { ...r.lap, lastS: progressOf(TRACK, at.pos).s };
}

function updatePlaces(race: RaceMatch): void {
  const ids = ranking([...race.racers.values()].map((r) => ({ id: r.id, progress: r.progress, finishedAt: r.lap.finishedAt })));
  ids.forEach((id, i) => (race.racers.get(id)!.place = i + 1));
}

/**
 * Entradas a aplicar neste tick. Com comandos numerados, a cadeira dá exatamente um passo por
 * comando (igual à previsão do cliente): sem comando ela espera; com atraso recupera até 2 por
 * tick, limitado por crédito, então mandar mais rápido não dá velocidade extra.
 */
function takeInputs(r: Racer): KartInput[] {
  if (r.ackSeq === 0 && r.inputQueue.length === 0) return [r.input];
  r.stepCredit = Math.min(r.stepCredit + 1, RACE.maxStepCredit);
  const out: KartInput[] = [];
  while (r.inputQueue.length && r.stepCredit >= 1 && out.length < 2) {
    const next = r.inputQueue.shift()!;
    r.input = next.input;
    r.ackSeq = next.seq;
    r.stepCredit--;
    out.push(next.input);
  }
  if (out.length) {
    r.idleTicks = 0;
  } else if (++r.idleTicks > RACE.idleInputTicks) {
    // aba escondida ou conexão parada: solta tudo e a cadeira para sozinha
    r.input = { ...NO_INPUT };
    r.stepCredit = 0;
    out.push(r.input);
  }
  return out;
}

export function stepRace(race: RaceMatch, dtMs: number): void {
  if (race.phase === "finished") return;
  race.now += dtMs;
  if (race.phase === "countdown") {
    if (race.now < race.countdownEndsAt) {
      for (const r of race.racers.values()) {
        r.useQueued = r.respawnQueued = false;
        r.inputQueue = [];
      }
      return;
    }
    race.phase = "active";
  }
  const now = race.now;
  const racers = [...race.racers.values()];

  const steps = new Map<string, KartInput[]>();
  for (const r of racers) {
    if (r.isBot || r.lap.finishedAt !== null) {
      stepRaceBot(race, r, dtMs);
      steps.set(r.id, [r.input]);
    } else {
      steps.set(r.id, r.connected ? takeInputs(r) : [NO_INPUT]);
    }
  }
  for (const r of racers) {
    if (r.useQueued && (r.connected || r.isBot) && r.lap.finishedAt === null) useItem(race, r);
    r.useQueued = false;
    if (r.respawnQueued) respawn(race, r);
    r.respawnQueued = false;
  }

  for (const r of racers) {
    for (const input of steps.get(r.id)!) {
      if (input.itemHold !== undefined) r.holdingItem = !!input.itemHold;
      const res = stepKart(r.kart, input, dtMs, now, TRACK);
      r.kart = res.state;
      if (res.boost) race.events.push({ type: "boost", id: r.id, level: res.boost });
      if (res.wall && Math.abs(r.kart.speed) > 4) race.events.push({ type: "wall", id: r.id });
    }
  }
  for (let i = 0; i < racers.length; i++) {
    for (let j = i + 1; j < racers.length; j++) {
      if (!collideKarts(racers[i].kart, racers[j].kart)) continue;
      racers[i].kart.pos = clampToTrack(TRACK, racers[i].kart.pos, RACE.kartRadius).pos;
      racers[j].kart.pos = clampToTrack(TRACK, racers[j].kart.pos, RACE.kartRadius).pos;
    }
  }

  // Vácuo dinâmico (Slipstream / Drafting estilo Mario Kart)
  for (const a of racers) {
    if (a.lap.finishedAt !== null || a.kart.speed < 7) {
      a.kart.draftMs = Math.max(0, (a.kart.draftMs ?? 0) - dtMs * 2);
      continue;
    }
    let drafting = false;
    for (const b of racers) {
      if (a.id === b.id || b.kart.speed < 7) continue;
      const dx = b.kart.pos.x - a.kart.pos.x;
      const dz = b.kart.pos.z - a.kart.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.2 && dist <= RACE.slipstreamDist) {
        const toAngle = Math.atan2(dx, dz);
        const diff = Math.abs(Math.atan2(Math.sin(toAngle - a.kart.heading), Math.cos(toAngle - a.kart.heading)));
        const headingAlign = Math.cos(a.kart.heading - b.kart.heading);
        if (diff <= RACE.slipstreamAngleRad && headingAlign > 0.6) {
          drafting = true;
          break;
        }
      }
    }
    if (drafting) {
      a.kart.draftMs = (a.kart.draftMs ?? 0) + dtMs;
      if (a.kart.draftMs >= RACE.slipstreamChargeMs) {
        a.kart.boostUntil = Math.max(a.kart.boostUntil, now + RACE.slipstreamBoostMs);
        a.kart.boostSpeed = Math.max(a.kart.boostSpeed ?? 0, RACE.slipstreamSpeed);
        race.events.push({ type: "draft", id: a.id });
        race.events.push({ type: "boost", id: a.id, level: "draft" });
        a.kart.draftMs = 0;
      }
    } else {
      a.kart.draftMs = Math.max(0, (a.kart.draftMs ?? 0) - dtMs * 2);
    }
  }

  for (const r of racers) {
    const pr = progressOf(TRACK, r.kart.pos);
    const u = updateProgress(r.lap, pr.s, now, race.cps, TRACK, race.laps);
    r.lap = u.state;
    r.progress = raceProgress(r.lap, pr.s, race.cps, TRACK);
    if (u.lapDone && !u.finished) race.events.push({ type: "lap", id: r.id, lap: lapsDone(r.lap, race.cps) + 1, ms: Math.round(r.lap.lastLapMs ?? 0) });
    const k = r.kart;
    const moveDir = k.heading + (k.speed < 0 ? Math.PI : 0);
    const along = Math.cos(moveDir - pointAt(TRACK, pr.s).heading);
    r.wrongMs = Math.abs(k.speed) > 2 && along < -0.3 && r.lap.finishedAt === null ? r.wrongMs + dtMs : 0;
  }
  updatePlaces(race);
  for (const r of racers) {
    if (r.lap.finishedAt === now) {
      race.events.push({ type: "finish", id: r.id, place: r.place, ms: Math.round(now - race.countdownEndsAt) });
      race.graceEndsAt ??= now + race.graceMs;
    }
  }

  pickBoxes(race);
  pickCups(race);
  stepHazards(race, dtMs);

  const racing = racers.filter((r) => r.connected || r.isBot);
  const allDone = racing.length > 0 && racing.every((r) => r.lap.finishedAt !== null);
  const graceOver = race.graceEndsAt !== null && now >= race.graceEndsAt;
  if (allDone || graceOver || now - race.countdownEndsAt >= RACE.maxRaceMs) {
    race.phase = "finished";
    race.hazards = [];
  }
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function flagsOf(r: Racer, now: number): string[] {
  const f: string[] = [];
  if (now < r.kart.boostUntil) f.push("boost");
  if (now < r.kart.spinUntil) f.push("spin");
  if (now < r.kart.slipUntil) f.push("slip");
  if (now < r.kart.frozenUntil) f.push("frozen");
  if (now < r.shieldUntil) f.push("pasta");
  if (now < r.blindUntil) f.push("blind");
  return f;
}

function pickCups(race: RaceMatch): void {
  const now = race.now;
  for (const c of race.cups) {
    if (c.readyAt > now) continue;
    for (const r of race.racers.values()) {
      if (r.lap.finishedAt !== null) continue;
      const dist = Math.hypot(r.kart.pos.x - c.pos.x, r.kart.pos.z - c.pos.z);
      if (dist < RACE.cupRadius + RACE.kartRadius) {
        c.readyAt = now + RACE.cupRespawnMs;
        r.kart.cups = Math.min(RACE.maxCups, (r.kart.cups ?? 0) + 1);
        race.events.push({ type: "cup", id: r.id, cupId: c.id });
        break;
      }
    }
  }
}

function currentLap(race: RaceMatch, r: Racer): number {
  return Math.min(race.laps, lapsDone(r.lap, race.cps) + 1);
}

export function buildRaceSnapshot(race: RaceMatch): RaceSnapshot {
  const now = race.now;
  return {
    t: now,
    phase: race.phase,
    countdownMs: Math.max(0, race.countdownEndsAt - now),
    elapsedMs: Math.max(0, now - race.countdownEndsAt),
    graceMs: race.graceEndsAt === null ? null : Math.max(0, race.graceEndsAt - now),
    laps: race.laps,
    karts: [...race.racers.values()].map((r) => {
      const k = r.kart;
      const drift = !k.drifting ? -1 : k.driftMs >= RACE.driftLevel3Ms ? 3 : k.driftMs >= RACE.driftLevel2Ms ? 2 : k.driftMs >= RACE.driftLevel1Ms ? 1 : 0;
      return {
        id: r.id,
        name: r.name,
        x: r2(k.pos.x),
        z: r2(k.pos.z),
        heading: r2(k.heading),
        speed: r2(k.speed),
        drift,
        driftDir: k.driftDir,
        flags: flagsOf(r, now),
        place: r.place,
        lap: currentLap(race, r),
        finished: r.lap.finishedAt !== null,
        isBot: r.isBot,
        connected: r.connected,
        cups: k.cups ?? 0,
        holdingItem: !!r.holdingItem,
      };
    }),
    boxes: race.boxes.map((b) => ({ id: b.id, x: r2(b.pos.x), z: r2(b.pos.z), ready: b.readyAt <= now })),
    cups: race.cups.map((c) => ({ id: c.id, x: r2(c.pos.x), z: r2(c.pos.z), ready: c.readyAt <= now })),
    hazards: race.hazards.map((h) => ({ id: h.id, kind: h.kind, x: r2(h.pos.x), z: r2(h.pos.z), vx: r2(h.vel.x), vz: r2(h.vel.z) })),
    events: [...race.events],
  };
}

export function buildRacePrivate(race: RaceMatch, id: string): RacePrivate | null {
  const r = race.racers.get(id);
  if (!r) return null;
  const now = race.now;
  const k = r.kart;
  const left = (t: number) => Math.max(0, t - now);
  return {
    item: r.item,
    charges: r.charges,
    lap: currentLap(race, r),
    place: r.place,
    total: race.racers.size,
    lapMs: race.phase === "countdown" ? 0 : (r.lap.finishedAt ?? now) - r.lap.lapStartedAt,
    lastLapMs: r.lap.lastLapMs,
    bestLapMs: r.lap.bestLapMs,
    raceMs: Math.max(0, (r.lap.finishedAt ?? now) - race.countdownEndsAt),
    blindMs: left(r.blindUntil),
    shieldMs: left(r.shieldUntil),
    wrongWay: r.wrongMs >= RACE.wrongWayMs,
    finished: r.lap.finishedAt !== null,
    cups: k.cups ?? 0,
    holdingItem: !!r.holdingItem,
    ackSeq: r.ackSeq,
    kart: {
      x: k.pos.x,
      z: k.pos.z,
      heading: k.heading,
      speed: k.speed,
      drifting: k.drifting,
      driftDir: k.driftDir,
      driftMs: k.driftMs,
      boostMs: left(k.boostUntil),
      spinMs: left(k.spinUntil),
      slipMs: left(k.slipUntil),
      frozenMs: left(k.frozenUntil),
    },
  };
}

export function getRaceResults(race: RaceMatch): RaceResultRow[] {
  const all = [...race.racers.values()].sort((a, b) => a.place - b.place);
  return all.map((r) => {
    const used = Object.entries(r.itemsUsed) as [ItemId, number][];
    const fav = used.sort((a, b) => b[1] - a[1])[0];
    return {
      id: r.id,
      name: r.name,
      avatar: r.avatar,
      chair: r.chair,
      isBot: r.isBot,
      place: r.place,
      totalMs: r.lap.finishedAt === null ? null : Math.round(r.lap.finishedAt - race.countdownEndsAt),
      bestLapMs: r.lap.bestLapMs === null ? null : Math.round(r.lap.bestLapMs),
      lapsDone: lapsDone(r.lap, race.cps),
      favItem: fav ? fav[0] : null,
      itemsUsed: used.reduce((a, [, n]) => a + n, 0),
    };
  });
}
