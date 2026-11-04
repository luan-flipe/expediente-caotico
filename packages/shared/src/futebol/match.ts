import type { BotLevel } from "../botLevels";
import { DEFAULT_AVATAR } from "../data/avatar";
import { mulberry32 } from "../rng";
import type { AvatarDNA } from "../types";
import { FUT, FUT_COLORS, FUT_KITS } from "./balance";
import { ballOut } from "./ball";
import { attackDir } from "./bots";
import { fieldFor } from "./field";
import { activeOutfield, applyCard, isPenaltyFoul, judgeShove, judgeTackle, repeatCard } from "./fouls";
import { startShootout, stepShootout } from "./penalties";
import { restartForOut, startRestart } from "./restarts";
import { nearMiss, recordKicks, recordPossession } from "./stats";
import { stepWorld, type WorldStep } from "./sim";
import { linePlayers } from "./types";
import type {
  FutFormat,
  FutInput,
  FutMatch,
  FutPlayer,
  FutPlayerInfo,
  FutPrivate,
  FutResultRowFull,
  FutSnapshot,
  FutTeamConfig,
  RestartKind,
  TeamSide,
} from "./types";

/** Janela (ms) em que o passe antes do gol ainda vale assistência. */
const ASSIST_WINDOW_MS = 6000;
/** Distância (m) da linha lateral onde o expulso espera. */
const SENT_OFF_MARGIN = 3;

export interface FutPlayerIn {
  id: string;
  name: string;
  avatar: AvatarDNA;
  side: TeamSide;
  isBot: boolean;
  accountId: string | null;
}

const other = (s: TeamSide): TeamSide => (s === 0 ? 1 : 0);
const r2 = (v: number): number => Math.round(v * 100) / 100;

function newPlayer(id: string, side: TeamSide, role: "linha" | "goleiro", isBot: boolean): FutPlayer {
  return {
    id, side, role, x: 0, z: 0, vx: 0, vz: 0, facing: Math.atan2(attackDir(side), 0),
    chargeMs: 0, chargeKind: null, tackleMs: 0, downMs: 0, yellow: 0, sentOff: false, isBot,
  };
}

/** Cria os 2 goleiros da IA e completa cada lado com bots até `format` jogadores de linha. */
export function createFutebol(opts: {
  seed: number;
  format: FutFormat;
  durationMs: number;
  botLevel: BotLevel;
  players: FutPlayerIn[];
  teams: [FutTeamConfig, FutTeamConfig];
}): FutMatch {
  const rng = mulberry32(opts.seed);
  const players: FutPlayer[] = [];
  const info = new Map<string, FutPlayerInfo>();
  const connected = new Set<string>();
  const add = (p: FutPlayer, i: Omit<FutPlayerInfo, "goals" | "assists" | "shots" | "shotsOn" | "passes" | "fouls">): void => {
    players.push(p);
    info.set(p.id, { ...i, goals: 0, assists: 0, shots: 0, shotsOn: 0, passes: 0, fouls: 0 });
  };
  const line = linePlayers(opts.format);
  for (const side of [0, 1] as const) {
    const mine = opts.players.filter((p) => p.side === side).slice(0, line);
    for (const p of mine) {
      add(newPlayer(p.id, side, "linha", p.isBot), { name: p.name, avatar: p.avatar, accountId: p.accountId, human: !p.isBot });
      if (!p.isBot) {
        connected.add(p.id);
      }
    }
    for (let i = mine.length; i < line; i++) {
      add(newPlayer(`bot-${side}-${i}`, side, "linha", true), { name: `Bot ${i + 1}`, avatar: DEFAULT_AVATAR, accountId: null, human: false });
    }
    add(newPlayer(`gk-${side}`, side, "goleiro", true), { name: "Goleiro", avatar: DEFAULT_AVATAR, accountId: null, human: false });
  }
  const m: FutMatch = {
    field: fieldFor(opts.format),
    players,
    ball: { x: 0, y: FUT.ballRadius, z: 0, vx: 0, vy: 0, vz: 0, ownerId: null, lastTouch: null, prevTouch: null },
    restart: null,
    connected,
    rng,
    now: 0,
    phase: "kickoff",
    phaseMs: FUT.kickoffWaitMs,
    elapsedMs: 0,
    durationMs: opts.durationMs,
    format: opts.format,
    botLevel: opts.botLevel,
    seed: opts.seed,
    score: [0, 0],
    teams: [safeTeam(opts.teams[0]), safeTeam(opts.teams[1])],
    info,
    inputs: new Map(),
    ack: new Map(),
    events: [],
    kickoffSide: rng() < 0.5 ? 0 : 1,
    halfDone: false,
    beaten: null,
    shootout: null,
    winner: null,
    possMs: [0, 0],
  };
  resetPositions(m);
  return m;
}

const validIndex = (i: number, n: number): number => (Number.isInteger(i) && i >= 0 && i < n ? i : 0);
const safeTeam = (t: FutTeamConfig): FutTeamConfig => ({
  name: t.name,
  kit: validIndex(t.kit, FUT_KITS.length),
  color: validIndex(t.color, FUT_COLORS.length),
});

const clampIn = (v: number): number => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
const PHASES = ["none", "charge", "release"] as const;
const phaseOf = (v: string): (typeof PHASES)[number] => PHASES.find((x) => x === v) ?? "none";

/** Guarda a intenção do jogador humano (o servidor decide tudo). */
export function setFutInput(m: FutMatch, id: string, input: FutInput, seq?: number): void {
  const p = m.players.find((q) => q.id === id);
  if (!p || p.role !== "linha" || p.isBot) {
    return;
  }
  m.inputs.set(id, {
    mx: clampIn(input.mx),
    mz: clampIn(input.mz),
    aim: Number.isFinite(input.aim) ? input.aim : 0,
    sprint: !!input.sprint,
    kick: phaseOf(input.kick),
    pass: phaseOf(input.pass),
  });
  if (seq !== undefined && seq > (m.ack.get(id) ?? 0)) {
    m.ack.set(id, seq);
  }
}

/** Humano que saiu ou caiu: vira bot na hora e a partida segue. */
export function dropFutPlayer(m: FutMatch, id: string): void {
  m.connected.delete(id);
  m.inputs.delete(id);
  const p = m.players.find((q) => q.id === id);
  if (p && p.role === "linha") {
    p.isBot = true;
  }
}

/** Humano que voltou (mesmo token): reassume o controle do seu jogador. */
export function reviveFutPlayer(m: FutMatch, id: string): void {
  m.connected.add(id);
  const p = m.players.find((q) => q.id === id);
  if (p && p.role === "linha") {
    p.isBot = false;
  }
}

/** Jogadores de volta à formação (metade própria) e bola no centro. */
function resetPositions(m: FutMatch): void {
  const f = m.field;
  for (const side of [0, 1] as const) {
    const dir = attackDir(side);
    const alive = m.players.filter((p) => p.side === side && p.role === "linha" && !p.sentOff);
    alive.forEach((p, k) => {
      p.x = -dir * f.halfL * 0.35;
      p.z = alive.length === 1 ? 0 : (((k + 0.5) / alive.length) * 2 - 1) * f.halfW * 0.6;
    });
    const gk = m.players.find((p) => p.side === side && p.role === "goleiro")!;
    gk.x = -dir * (f.halfL - 1.5);
    gk.z = 0;
    for (const p of m.players) {
      if (p.side === side) {
        p.vx = 0;
        p.vz = 0;
        p.downMs = 0;
        p.tackleMs = 0;
        p.chargeMs = 0;
        p.chargeKind = null;
        p.facing = Math.atan2(dir, 0);
      }
    }
  }
  Object.assign(m.ball, { x: 0, y: FUT.ballRadius, z: 0, vx: 0, vy: 0, vz: 0, ownerId: null });
}

function beginRestart(m: FutMatch, kind: RestartKind, side: TeamSide, x: number, z: number): void {
  startRestart(m, kind, side, x, z);
  m.events.push({ type: "restart", kind });
}

function endMatch(m: FutMatch, winner: TeamSide | null): void {
  m.winner = winner;
  m.phase = "over";
  m.restart = null;
  m.events.push({ type: "whistle", kind: "end" });
}

function endRegulation(m: FutMatch): void {
  m.elapsedMs = m.durationMs;
  if (m.score[0] !== m.score[1]) {
    endMatch(m, m.score[0] > m.score[1] ? 0 : 1);
  } else {
    startShootout(m);
  }
}

function sendOff(m: FutMatch, p: FutPlayer): void {
  p.sentOff = true;
  p.vx = 0;
  p.vz = 0;
  p.x = 0;
  p.z = m.field.halfW + SENT_OFF_MARGIN;
  if (m.ball.ownerId === p.id) {
    m.ball.ownerId = null;
  }
}

/** Contatos com adversário viram falta, cartão e cobrança (a primeira falta do tick vale). */
function judgeContacts(m: FutMatch, step: WorldStep): void {
  for (const ev of step.events) {
    if ((ev.t !== "tackle" && ev.t !== "steal") || !ev.victimId) {
      continue;
    }
    const tackler = m.players.find((p) => p.id === ev.id);
    const victim = m.players.find((p) => p.id === ev.victimId);
    if (!tackler || !victim || tackler.sentOff || victim.sentOff) {
      continue;
    }
    const sprint = step.inputs.get(tackler.id)?.sprint ?? false;
    // disputa em pé só é falta se foi tranco forte; carrinho é julgado pela bola (e por trás ou em corrida vira cartão)
    const j = ev.t === "steal" ? judgeShove(tackler, victim, ev.hard === true) : judgeTackle(tackler, victim, m.ball, "carrinho", sprint, ev.ballFirst);
    if (!j.foul) {
      continue;
    }
    m.events.push({ type: "foul", id: tackler.id, victimId: victim.id, x: r2(victim.x), z: r2(victim.z) });
    const fi = m.info.get(tackler.id);
    if (fi) {
      fi.fouls++;
    }
    // reincidência: a cada foulsForYellow faltas sem cartão o árbitro mostra o amarelo
    const card = repeatCard(tackler, j.card);
    if (card !== "none") {
      applyCard(tackler, card);
      if (card === "yellow") {
        m.events.push({ type: "card", id: tackler.id, card: "yellow" });
      }
      if (tackler.sentOff) {
        m.events.push({ type: "card", id: tackler.id, card: "red" });
        sendOff(m, tackler);
      }
    }
    if (isPenaltyFoul(victim, m.field)) {
      beginRestart(m, "penalti", victim.side, attackDir(victim.side) * (m.field.halfL - m.field.penaltySpot), 0);
    } else {
      const lx = m.field.halfL;
      const lz = m.field.halfW;
      beginRestart(m, "falta", victim.side, Math.max(-lx, Math.min(lx, victim.x)), Math.max(-lz, Math.min(lz, victim.z)));
    }
    if (m.format === 1 && tackler.sentOff && activeOutfield(m.players, tackler.side).length === 0) {
      endMatch(m, other(tackler.side));
    }
    return;
  }
}

function scoreGoal(m: FutMatch, defending: TeamSide): void {
  const side = other(defending);
  const lt = m.ball.lastTouch;
  const own = lt !== null && lt.side === defending;
  let assistId: string | null = null;
  if (lt && !own) {
    const pt = m.ball.prevTouch;
    if (pt && pt.side === lt.side && pt.id !== lt.id && pt.at !== undefined && pt.at >= m.now - ASSIST_WINDOW_MS) {
      assistId = pt.id;
    }
    const s = m.info.get(lt.id);
    if (s) {
      s.goals++;
    }
    const a = assistId ? m.info.get(assistId) : undefined;
    if (a) {
      a.assists++;
    }
  }
  m.score[side]++;
  m.events.push({ type: "goal", side, scorerId: lt?.id ?? null, assistId, own });
  Object.assign(m.ball, { vx: 0, vy: 0, vz: 0, y: FUT.ballRadius, ownerId: null });
  for (const p of m.players) {
    p.vx = 0;
    p.vz = 0;
  }
  m.restart = null;
  m.kickoffSide = defending;
  m.phase = "goal";
  m.phaseMs = FUT.goalCelebrateMs;
}

function playTick(m: FutMatch, dtMs: number): void {
  const step = stepWorld(m, dtMs);
  m.elapsedMs += dtMs;
  recordKicks(m, step.events);
  recordPossession(m, dtMs);
  const hadRestart = m.restart !== null;
  judgeContacts(m, step);
  if (m.phase === "over") {
    return;
  }
  if (!hadRestart && !m.restart) {
    const owner = m.ball.ownerId === null ? undefined : m.players.find((p) => p.id === m.ball.ownerId);
    const out = owner?.role === "goleiro" ? null : ballOut(m.ball, m.field);
    if (out?.kind === "gol") {
      scoreGoal(m, out.side);
      return;
    }
    if (out) {
      if (out.kind === "fundo") {
        nearMiss(m, out.side);
      }
      const r = restartForOut(m.ball, m.field);
      if (r) {
        beginRestart(m, r.kind, r.side, r.x, r.z);
      }
    }
  }
  if (!m.halfDone && m.elapsedMs >= m.durationMs / 2) {
    m.halfDone = true;
    m.events.push({ type: "whistle", kind: "half" });
  }
  if (m.elapsedMs >= m.durationMs) {
    endRegulation(m);
    return;
  }
  m.phase = m.restart ? "restart" : "play";
}

/** Um tick da partida: kickoff, play/restart, goal e, no empate, penalties até over. */
export function stepFutebol(m: FutMatch, dtMs: number): void {
  if (m.phase === "over") {
    return;
  }
  m.now += dtMs;
  if (m.phase === "kickoff") {
    m.phaseMs -= dtMs;
    if (m.phaseMs <= 0) {
      m.events.push({ type: "whistle", kind: "start" });
      beginRestart(m, "saida", m.kickoffSide, 0, 0);
      m.phase = "restart";
    }
  } else if (m.phase === "goal") {
    m.phaseMs -= dtMs;
    if (m.phaseMs <= 0) {
      if (m.elapsedMs >= m.durationMs) {
        endRegulation(m);
        return;
      }
      resetPositions(m);
      beginRestart(m, "saida", m.kickoffSide, 0, 0);
      m.phase = "restart";
    }
  } else if (m.phase === "penalties") {
    stepShootout(m, dtMs);
  } else {
    playTick(m, dtMs);
  }
}

export function buildFutSnapshot(m: FutMatch): FutSnapshot {
  const b = m.ball;
  const r = m.restart;
  const s = m.shootout;
  return {
    t: m.now,
    phase: m.phase,
    elapsedMs: Math.round(m.elapsedMs),
    durationMs: m.durationMs,
    celebrateMs: m.phase === "goal" ? Math.max(0, Math.round(m.phaseMs)) : 0,
    format: m.format,
    score: [m.score[0], m.score[1]],
    pens: s
      ? { goals: [s.goals[0], s.goals[1]], taken: [s.taken[0], s.taken[1]], takerId: s.takerId, keeperId: s.keeperId, turn: s.turn, stage: s.stage, sudden: s.taken[0] >= 5 && s.taken[1] >= 5 }
      : null,
    teams: m.teams,
    restart: r ? { kind: r.kind, side: r.side, x: r2(r.x), z: r2(r.z), takerId: r.takerId, leftMs: Math.round(r.leftMs), wall: r.wall } : null,
    ball: { x: r2(b.x), y: r2(b.y), z: r2(b.z), vx: r2(b.vx), vy: r2(b.vy), vz: r2(b.vz), ownerId: b.ownerId },
    players: m.players.map((p) => ({
      id: p.id,
      name: m.info.get(p.id)?.name ?? p.id,
      side: p.side,
      role: p.role,
      x: r2(p.x),
      z: r2(p.z),
      vx: r2(p.vx),
      vz: r2(p.vz),
      facing: r2(p.facing),
      sliding: p.tackleMs > 0,
      down: p.downMs > 0,
      yellow: p.yellow,
      sentOff: p.sentOff,
      isBot: p.isBot,
      connected: p.isBot || m.connected.has(p.id),
    })),
    events: [...m.events],
  };
}

export function buildFutPrivate(m: FutMatch, id: string): FutPrivate | null {
  const p = m.players.find((q) => q.id === id);
  if (!p || p.role !== "linha") {
    return null;
  }
  return { chargeMs: Math.round(p.chargeMs), ackSeq: m.ack.get(id) ?? 0, slowMs: Math.round(p.slowMs ?? 0) };
}

export function getFutResults(m: FutMatch): FutResultRowFull[] {
  return m.players
    .filter((p) => p.role === "linha")
    .map((p) => {
      const i = m.info.get(p.id)!;
      return {
        id: p.id,
        name: i.name,
        side: p.side,
        isBot: !i.human,
        accountId: i.accountId,
        goals: i.goals,
        assists: i.assists,
        yellow: p.yellow,
        red: p.sentOff ? 1 : 0,
      };
    })
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || (a.id < b.id ? -1 : 1));
}

export function getFutScore(m: FutMatch): { score: [number, number]; pens: [number, number] | null; winner: TeamSide | null } {
  return {
    score: [m.score[0], m.score[1]],
    pens: m.shootout ? [m.shootout.goals[0], m.shootout.goals[1]] : null,
    winner: m.winner,
  };
}
