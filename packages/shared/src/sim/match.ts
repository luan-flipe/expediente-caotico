import { pickAwards, shooterCandidates, type Award } from "../awards";
import type { BotLevel } from "../botLevels";
import { BALANCE } from "../data/balance";
import { OFFICE_MAP, getGroundHeight } from "../data/map";
import { mulberry32 } from "../rng";
import type { AvatarDNA, Match, PlayerAction, PlayerInput, PlayerSim, PrivateState, ResultRow, Snapshot, ZombieInternalState } from "../types";
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

export interface ZombieWaveDef {
  wave: number;
  count: number;
  hp: number;
  damage: number;
  speed: number;
  spawnIntervalMs: number;
}

export const ZOMBIE_WAVES: ZombieWaveDef[] = [
  { wave: 1, count: 8, hp: 60, damage: 10, speed: 4.8, spawnIntervalMs: 1400 },
  { wave: 2, count: 14, hp: 90, damage: 14, speed: 5.0, spawnIntervalMs: 1100 },
  { wave: 3, count: 20, hp: 130, damage: 18, speed: 5.2, spawnIntervalMs: 900 },
  { wave: 4, count: 28, hp: 180, damage: 24, speed: 5.4, spawnIntervalMs: 750 },
  { wave: 5, count: 38, hp: 240, damage: 30, speed: 5.6, spawnIntervalMs: 600 },
];

const ZOMBIE_SPAWN_POINTS = [
  { x: 30, z: -1.5 },   // Elevador superior
  { x: 30, z: 14 },     // Elevador inferior
  { x: -30, z: -18 },   // Sala executiva
  { x: -16, z: -18 },   // Sala de infra
  { x: -28, z: 18 },    // Sala de gestão
  { x: -28, z: -1 },    // Cozinha
  { x: 20, z: 18 },     // Sala suporte
  { x: 20, z: -18 },    // Sala reunião
];

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

export function createMatch(opts: {
  durationMs: number;
  seed: number;
  players: MatchPlayerInfo[];
  submode?: "pvp" | "zombies";
  botLevel?: BotLevel;
}): Match {
  const rng = mulberry32(opts.seed);
  const spawns = [...OFFICE_MAP.spawns].sort(() => rng() - 0.5);
  const countdownEndsAt = BALANCE.countdownMs;
  const first = OFFICE_MAP.objectivePoints[0];

  const submode = opts.submode ?? "pvp";
  let zombieState: ZombieInternalState | undefined;
  if (submode === "zombies") {
    const w1 = ZOMBIE_WAVES[0];
    zombieState = {
      wave: 1,
      maxWaves: 5,
      waveState: "waiting",
      nextWaveAt: countdownEndsAt,
      totalZombiesInWave: w1.count,
      spawnedZombiesInWave: 0,
      nextSpawnAt: countdownEndsAt,
      aliveZombies: 0,
      waveHp: w1.hp,
      waveDamage: w1.damage,
      waveSpeed: w1.speed,
    };
  }

  const m: Match = {
    now: 0,
    phase: "countdown",
    submode,
    zombieState,
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
    botLevel: opts.botLevel ?? "normal",
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
  if (p && !p.isZombie) p.input = input;
}

export function queueAction(m: Match, id: string, action: PlayerAction): void {
  const p = m.players.get(id);
  if (p && !p.isZombie && p.actions.length < MAX_ACTIONS_PER_TICK) p.actions.push(action);
}

/** Ponto de renascimento mais distante dos adversários/zumbis vivos. */
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

function spawnZombie(m: Match, waveDef: ZombieWaveDef): void {
  const spawnPt = ZOMBIE_SPAWN_POINTS[Math.floor(m.rng() * ZOMBIE_SPAWN_POINTS.length)];
  const numId = m.nextId++;
  const id = `zombie_${numId}`;
  const z: PlayerSim = {
    id,
    name: `Zumbi ${numId}`,
    avatar: {
      name: "Zumbi",
      model: 0,
      skin: 5,
      hair: 0,
      hairColor: 0,
      eyes: 0,
      face: 0,
      beard: 0,
      beardColor: 0,
      glasses: 0,
      top: 0,
      bottom: 0,
      shirt: 0,
      pants: 0,
      shoes: 0,
      accessory: 0,
      height: 1,
    },
    isBot: true,
    isZombie: true,
    zombieDamage: waveDef.damage,
    connected: true,
    pos: { x: spawnPt.x + (m.rng() - 0.5) * 1.5, z: spawnPt.z + (m.rng() - 0.5) * 1.5 },
    yaw: m.rng() * Math.PI * 2,
    moving: true,
    push: { x: 0, z: 0 },
    hp: waveDef.hp,
    maxHp: waveDef.hp,
    shield: 0,
    shieldUntil: 0,
    alive: true,
    respawnAt: Infinity,
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
  m.players.set(id, z);
}

function stepZombie(m: Match, z: PlayerSim, dtMs: number): void {
  if (!z.alive) return;
  const dt = dtMs / 1000;
  const now = m.now;
  const stunned = hasStatus(z, "stun", now);

  // Procura o jogador vivo não-zumbi mais próximo
  let target: PlayerSim | null = null;
  let targetDist = Infinity;
  for (const p of m.players.values()) {
    if (!p.isZombie && p.alive) {
      const d = Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z);
      if (d < targetDist) {
        target = p;
        targetDist = d;
      }
    }
  }

  let dx = 0;
  let dz = 0;
  if (target && !stunned) {
    const rawDx = target.pos.x - z.pos.x;
    const rawDz = target.pos.z - z.pos.z;
    z.yaw = Math.atan2(rawDx, rawDz);

    // Ataque corpo a corpo quando próximo
    if (targetDist < 1.4 && now >= (z.lastZombieAttackAt || 0) + 900) {
      z.lastZombieAttackAt = now;
      const dmg = z.zombieDamage ?? 10;
      target.hp -= Math.min(target.hp, dmg);
      m.events.push({
        type: "hit",
        target: target.id,
        from: z.id,
        amount: dmg,
        x: target.pos.x,
        z: target.pos.z,
      });
      if (target.hp <= 0) {
        target.alive = false;
        target.deaths++;
        target.respawnAt = now + BALANCE.respawnMs;
        m.events.push({ type: "kill", killer: z.id, victim: target.id, assists: [] });
      }
    }

    // Movimentação em direção ao alvo
    if (targetDist > 0.8) {
      const spd = m.zombieState?.waveSpeed ?? 4.8;
      dx = (rawDx / targetDist) * spd * dt;
      dz = (rawDz / targetDist) * spd * dt;
    }
  }

  z.moving = Math.hypot(dx, dz) > 0.001;
  dx += z.push.x * dt;
  dz += z.push.z * dt;
  const decay = Math.max(0, 1 - BALANCE.knockDecayPerSec * dt);
  z.push.x *= decay;
  z.push.z *= decay;
  z.pos = moveCircle(z.pos, dx, dz, BALANCE.playerRadius, OFFICE_MAP.boxes, { w: OFFICE_MAP.width, d: OFFICE_MAP.depth });
  z.statuses = z.statuses.filter((s) => s.until > now);
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

function stepZombiesMode(m: Match): void {
  const zs = m.zombieState;
  if (!zs) return;

  const humans = [...m.players.values()].filter((p) => !p.isZombie);
  const aliveHumans = humans.filter((p) => p.alive);

  // Derrota: se todos os humanos foram eliminados
  if (aliveHumans.length === 0 && humans.length > 0) {
    zs.waveState = "defeat";
    m.phase = "finished";
    m.events.push({ type: "info", text: `💀 O escritório foi dominado pelos zumbis na Horda ${zs.wave}!` });
    return;
  }

  const curDef = ZOMBIE_WAVES[zs.wave - 1] ?? ZOMBIE_WAVES[ZOMBIE_WAVES.length - 1];

  if (zs.waveState === "waiting") {
    if (m.now >= zs.nextWaveAt) {
      zs.waveState = "active";
      zs.spawnedZombiesInWave = 0;
      zs.totalZombiesInWave = curDef.count;
      zs.waveHp = curDef.hp;
      zs.waveDamage = curDef.damage;
      zs.waveSpeed = curDef.speed;
      zs.nextSpawnAt = m.now;
      m.events.push({
        type: "info",
        text: `⚠️ HORDA ${zs.wave} DE ${zs.maxWaves} INICIADA! (${curDef.count} zumbis)`,
      });
    }
  } else if (zs.waveState === "active") {
    // Spawna zumbis periódicos
    if (zs.spawnedZombiesInWave < zs.totalZombiesInWave && m.now >= zs.nextSpawnAt) {
      spawnZombie(m, curDef);
      zs.spawnedZombiesInWave++;
      zs.nextSpawnAt = m.now + curDef.spawnIntervalMs;
    }

    // Conta zumbis vivos
    const currentZombies = [...m.players.values()].filter((p) => p.isZombie);
    const aliveZombies = currentZombies.filter((p) => p.alive).length;
    zs.aliveZombies = aliveZombies;

    // Se todos os zumbis da horda foram spawnados e todos estão mortos
    if (zs.spawnedZombiesInWave >= zs.totalZombiesInWave && aliveZombies === 0) {
      if (zs.wave >= zs.maxWaves) {
        // Vitória completa!
        zs.waveState = "victory";
        m.phase = "finished";
        m.events.push({
          type: "info",
          text: "🏆 VITÓRIA! Vocês sobreviveram a todas as 5 hordas de zumbis!",
        });
      } else {
        // Concluiu a horda atual
        const prevWave = zs.wave;
        zs.wave++;
        zs.waveState = "waiting";
        zs.nextWaveAt = m.now + 6000; // 6 segundos de intervalo
        m.events.push({
          type: "info",
          text: `🎉 Horda ${prevWave} derrotada! Horda ${zs.wave} chegando em 6 segundos...`,
        });

        // Cura parcial e renascimento dos humanos caídos entre as hordas
        for (const h of humans) {
          if (!h.alive) {
            h.alive = true;
            h.hp = h.maxHp;
            h.pos = { ...pickSpawn(m, h) };
            h.invulnUntil = m.now + BALANCE.spawnInvulnMs;
          } else {
            h.hp = Math.min(h.maxHp, h.hp + 40);
          }
        }
      }
    }
  }
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
    m.events.push({
      type: "info",
      text: m.submode === "zombies" ? "Preparem-se! A primeira horda de zumbis está chegando!" : "Valendo! Bom expediente.",
    });
  }

  // No modo zumbis a partida termina por vitória ou derrota das 5 hordas (endsAt estendido)
  if (m.submode !== "zombies" && m.now >= m.endsAt) {
    m.phase = "finished";
    m.projectiles = [];
    m.zones = [];
    return;
  }

  // Renascimento de humanos caídos
  for (const p of m.players.values()) {
    if (!p.isZombie && !p.alive && m.now >= p.respawnAt) {
      p.alive = true;
      p.hp = p.maxHp;
      p.pos = { ...pickSpawn(m, p) };
      p.invulnUntil = m.now + BALANCE.spawnInvulnMs;
    }
  }

  expireEvolutions(m);

  // Zumbis gerenciam as hordas
  if (m.submode === "zombies" && m.phase === "active") {
    stepZombiesMode(m);
  }

  // Atualização dos bots e jogadores
  for (const p of m.players.values()) {
    if (p.isZombie) {
      stepZombie(m, p, dtMs);
    } else if (p.isBot) {
      stepBot(m, p);
    }
  }

  for (const p of m.players.values()) {
    if (!p.isZombie) {
      if (p.alive) stepPlayer(m, p, dtMs);
      else p.actions = [];
    }
  }

  stepProjectiles(m, dtMs);
  stepZones(m);
  if (m.submode !== "zombies") {
    stepObjective(m, dtMs);
  }
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
  const zs = m.zombieState;
  return {
    t: m.now,
    phase: m.phase,
    remainingMs: m.phase === "countdown" ? m.durationMs : Math.max(0, m.endsAt - m.now),
    countdownMs: Math.max(0, m.countdownEndsAt - m.now),
    zombieWave: zs
      ? {
          wave: zs.wave,
          maxWaves: zs.maxWaves,
          remainingZombies: Math.max(0, zs.totalZombiesInWave - zs.spawnedZombiesInWave + zs.aliveZombies),
          waveState: zs.waveState,
          nextWaveCountdownMs: Math.max(0, zs.nextWaveAt - m.now),
        }
      : undefined,
    players: [...m.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      x: r2(p.pos.x),
      z: r2(p.pos.z),
      y: r2(getGroundHeight(p.pos.x, p.pos.z)),
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
      isZombie: p.isZombie,
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
  // Apenas participantes humanos e bots aliados (não lista os zumbis no placar)
  const participants = [...m.players.values()].filter((p) => !p.isZombie);
  const rows = rankPlayers(participants);
  if (m.submode === "zombies") {
    const victory = m.zombieState?.waveState === "victory";
    const waveReached = m.zombieState?.wave ?? 1;
    for (const r of rows) {
      r.teamResult = victory ? "victory" : "defeat";
      r.waveReached = waveReached;
    }
  }
  return rows;
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
