import { pickAwards, shooterCandidates, type Award } from "../awards";
import { BALANCE } from "../data/balance";
import { OFFICE_MAP } from "../data/map";
import { mulberry32 } from "../rng";
import type { AvatarDNA, Match, PlayerAction, PlayerInput, PlayerSim, PrivateState, ResultRow, Snapshot } from "../types";
import { activeSynergies, castAbility, dashContacts, dirOf, fireBall, resolveAbility, stepProjectiles, stepZones } from "./abilities";
import { stepBot } from "./bots";
import { moveCircle } from "./collision";
import { hasStatus, isInvulnerable, speedMult } from "./combat";
import { stepObjective } from "./objective";
import { expireEvolutions, generateOptions, xpToNext } from "./progression";
import { rankPlayers } from "./scoring";

export interface MatchPlayerInfo {
  id: string;
  name: string;
  avatar: AvatarDNA;
  isBot: boolean;
}

const MAX_ACTIONS_PER_TICK = 4;

function makePlayer(info: MatchPlayerInfo, pos: { x: number; z: number }): PlayerSim {
  return {
    ...info,
    connected: true,
    pos: { ...pos },
    yaw: Math.atan2(-pos.x, -pos.z),
    moving: false,
    push: { x: 0, z: 0 },
    hp: BALANCE.maxHp,
    maxHp: BALANCE.maxHp,
    shield: 0,
    shieldUntil: 0,
    alive: true,
    respawnAt: 0,
    invulnUntil: 0,
    stunImmuneUntil: 0,
    statuses: [],
    input: { mx: 0, mz: 0, yaw: 0, fire: false },
    actions: [],
    lastShotAt: -Infinity,
    dodgeReadyAt: 0,
    dodgeUntil: 0,
    dodgeDir: { x: 0, z: 1 },
    dashUntil: 0,
    dashDir: { x: 0, z: 1 },
    dashSpeed: 0,
    dashHit: [],
    xp: 0,
    level: 1,
    abilities: [],
    options: null,
    choiceSeq: 0,
    optionsExpireAt: 0,
    pendingLevels: 0,
    stats: { hp: 0, speed: 0, ball: 0 },
    score: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    damageLog: [],
    zoneMs: 0,
    zoneCycleMs: 0,
    shots: 0,
    shotHits: 0,
    damageDealt: 0,
    dodges: 0,
  };
}

export function createMatch(opts: { durationMs: number; seed: number; players: MatchPlayerInfo[] }): Match {
  const rng = mulberry32(opts.seed);
  const spawns = [...OFFICE_MAP.spawns].sort(() => rng() - 0.5);
  const countdownEndsAt = BALANCE.countdownMs;
  const first = OFFICE_MAP.objectivePoints[0];
  const m: Match = {
    now: 0,
    phase: "countdown",
    countdownEndsAt,
    endsAt: countdownEndsAt + opts.durationMs,
    durationMs: opts.durationMs,
    players: new Map(),
    projectiles: [],
    zones: [],
    objective: {
      index: 0,
      x: first.x,
      z: first.z,
      radius: BALANCE.objectiveRadius,
      cycleEndsAt: countdownEndsAt + BALANCE.objectiveCycleMs,
      owner: null,
      contested: false,
    },
    events: [],
    rng,
    nextId: 1,
    seed: opts.seed,
  };
  opts.players.forEach((info, i) => {
    const p = makePlayer(info, spawns[i % spawns.length]);
    p.choiceSeq = 1;
    p.options = generateOptions(p, rng);
    p.optionsExpireAt = countdownEndsAt + BALANCE.evolutionTimeoutMs;
    m.players.set(p.id, p);
  });
  return m;
}

export function setInput(m: Match, id: string, input: PlayerInput): void {
  const p = m.players.get(id);
  if (p) p.input = input;
}

export function queueAction(m: Match, id: string, action: PlayerAction): void {
  const p = m.players.get(id);
  if (p && p.actions.length < MAX_ACTIONS_PER_TICK) p.actions.push(action);
}

/** Ponto de renascimento mais distante dos adversários vivos. */
function pickSpawn(m: Match, p: PlayerSim) {
  let best = OFFICE_MAP.spawns[0];
  let bestScore = -Infinity;
  for (const s of OFFICE_MAP.spawns) {
    let near = Infinity;
    for (const o of m.players.values()) {
      if (o.id !== p.id && o.alive) near = Math.min(near, Math.hypot(o.pos.x - s.x, o.pos.z - s.z));
    }
    const score = near + m.rng() * 3;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

function stepPlayer(m: Match, p: PlayerSim, dtMs: number): void {
  const dt = dtMs / 1000;
  const now = m.now;
  const stunned = hasStatus(p, "stun", now);

  for (const a of p.actions) {
    if (stunned) break;
    if (a.kind === "dodge") {
      if (now < p.dodgeReadyAt) continue;
      const len = Math.hypot(p.input.mx, p.input.mz);
      p.dodgeDir = len > 0.1 ? { x: p.input.mx / len, z: p.input.mz / len } : dirOf(a.yaw);
      p.dodgeUntil = now + BALANCE.dodgeMs;
      p.dodgeReadyAt = now + BALANCE.dodgeCooldownMs;
      p.dodges++;
      m.events.push({ type: "fx", kind: "dodge", x: p.pos.x, z: p.pos.z, owner: p.id });
    } else {
      castAbility(m, p, a.slot, a.yaw, a.dist);
    }
  }
  p.actions = [];

  let dx = 0;
  let dz = 0;
  if (now < p.dashUntil) {
    dx = p.dashDir.x * p.dashSpeed * dt;
    dz = p.dashDir.z * p.dashSpeed * dt;
  } else if (now < p.dodgeUntil) {
    const speed = BALANCE.dodgeDistance / (BALANCE.dodgeMs / 1000);
    dx = p.dodgeDir.x * speed * dt;
    dz = p.dodgeDir.z * speed * dt;
  } else if (!stunned) {
    const len = Math.hypot(p.input.mx, p.input.mz);
    const k = len > 1 ? 1 / len : 1;
    const speed = BALANCE.moveSpeed * speedMult(p, now);
    dx = p.input.mx * k * speed * dt;
    dz = p.input.mz * k * speed * dt;
  }
  p.moving = Math.hypot(dx, dz) > 0.001;
  dx += p.push.x * dt;
  dz += p.push.z * dt;
  const decay = Math.max(0, 1 - BALANCE.knockDecayPerSec * dt);
  p.push.x *= decay;
  p.push.z *= decay;
  p.pos = moveCircle(p.pos, dx, dz, BALANCE.playerRadius, OFFICE_MAP.boxes, { w: OFFICE_MAP.width, d: OFFICE_MAP.depth });
  if (now < p.dashUntil) dashContacts(m, p);

  if (!stunned) p.yaw = p.input.yaw;
  if (p.input.fire && !stunned && now >= p.dodgeUntil) fireBall(m, p, p.yaw);
  if (now >= p.shieldUntil) p.shield = 0;
  p.statuses = p.statuses.filter((s) => s.until > now);
}

export function stepMatch(m: Match, dtMs: number): void {
  if (m.phase === "finished") return;
  m.now += dtMs;
  if (m.phase === "countdown") {
    if (m.now < m.countdownEndsAt) {
      for (const p of m.players.values()) p.actions = [];
      return;
    }
    m.phase = "active";
    m.events.push({ type: "info", text: "Valendo! Bom expediente." });
  }
  if (m.now >= m.endsAt) {
    m.phase = "finished";
    m.projectiles = [];
    m.zones = [];
    return;
  }

  for (const p of m.players.values()) {
    if (!p.alive && m.now >= p.respawnAt) {
      p.alive = true;
      p.hp = p.maxHp;
      p.pos = { ...pickSpawn(m, p) };
      p.invulnUntil = m.now + BALANCE.spawnInvulnMs;
    }
  }
  expireEvolutions(m);
  for (const p of m.players.values()) if (p.isBot) stepBot(m, p);
  for (const p of m.players.values()) {
    if (p.alive) stepPlayer(m, p, dtMs);
    else p.actions = [];
  }
  stepProjectiles(m, dtMs);
  stepZones(m);
  stepObjective(m, dtMs);
}

function flagsOf(p: PlayerSim, now: number): string[] {
  const f: string[] = p.statuses.filter((s) => s.until > now).map((s) => s.kind);
  if (isInvulnerable(p, now)) f.push("invuln");
  if (p.shield > 0) f.push("shield");
  if (now < p.dodgeUntil) f.push("dodge");
  if (now < p.dashUntil) f.push("dash");
  return f;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function buildSnapshot(m: Match): Snapshot {
  return {
    t: m.now,
    phase: m.phase,
    remainingMs: m.phase === "countdown" ? m.durationMs : Math.max(0, m.endsAt - m.now),
    countdownMs: Math.max(0, m.countdownEndsAt - m.now),
    players: [...m.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      x: r2(p.pos.x),
      z: r2(p.pos.z),
      yaw: r2(p.yaw),
      hp: Math.ceil(p.hp),
      maxHp: p.maxHp,
      shield: Math.ceil(p.shield),
      alive: p.alive,
      level: p.level,
      score: p.score,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      flags: flagsOf(p, m.now),
      moving: p.moving,
      isBot: p.isBot,
      connected: p.connected,
      abilities: p.abilities.map((a) => ({ id: a.id, level: a.level, spec: a.spec })),
    })),
    projectiles: m.projectiles.map((pr) => ({
      id: pr.id,
      kind: pr.kind,
      x: r2(pr.x),
      z: r2(pr.z),
      vx: r2(pr.vx),
      vz: r2(pr.vz),
      owner: pr.owner,
      radius: pr.radius,
    })),
    zones: m.zones.map((z) => ({ id: z.id, kind: z.kind, x: r2(z.x), z: r2(z.z), radius: z.radius, owner: z.owner })),
    objective: {
      x: m.objective.x,
      z: m.objective.z,
      radius: m.objective.radius,
      owner: m.objective.owner,
      contested: m.objective.contested,
      cycleMs: Math.max(0, m.objective.cycleEndsAt - Math.max(m.now, m.countdownEndsAt)),
    },
    events: [...m.events],
  };
}

export function buildPrivate(m: Match, id: string): PrivateState | null {
  const p = m.players.get(id);
  if (!p) return null;
  const blind = p.statuses.find((s) => s.kind === "blind" && s.until > m.now);
  return {
    xp: Math.floor(p.xp),
    xpNext: xpToNext(p.level),
    level: p.level,
    abilities: p.abilities.map((a) => ({
      id: a.id,
      level: a.level,
      spec: a.spec,
      readyInMs: Math.max(0, a.readyAt - m.now),
      cooldownMs: resolveAbility(p.abilities, a.id).cooldownMs,
    })),
    dodgeInMs: Math.max(0, p.dodgeReadyAt - m.now),
    options: p.options,
    optionsSeq: p.choiceSeq,
    optionsInMs: p.options ? Math.max(0, p.optionsExpireAt - m.now) : 0,
    pendingLevels: p.pendingLevels,
    synergies: activeSynergies(p.abilities).map((s) => s.name),
    stats: { ...p.stats },
    respawnInMs: p.alive ? 0 : Math.max(0, p.respawnAt - m.now),
    speedMult: speedMult(p, m.now),
    blindMs: blind ? blind.until - m.now : 0,
    stunned: hasStatus(p, "stun", m.now),
  };
}

export function getResults(m: Match): ResultRow[] {
  return rankPlayers([...m.players.values()]);
}

/** Prêmios bobos do tiroteio. */
export function getAwards(m: Match): Award[] {
  const stats = [...m.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    shots: p.shots,
    hits: p.shotHits,
    damage: p.damageDealt,
    deaths: p.deaths,
    dodges: p.dodges,
  }));
  return pickAwards(shooterCandidates(stats), m.seed);
}
