import type { BotLevel } from "../botLevels";
import { FUT } from "./balance";
import { ballOut, kickBall } from "./ball";
import { attackDir } from "./bots";
import { activeOutfield } from "./fouls";
import { touchBall } from "./goalkeeping";
import { stepWorld } from "./sim";
import { recordKicks } from "./stats";
import type { FutMatch, FutPlayer, Shootout, TeamSide } from "./types";

const REGULATION_KICKS = 5;
/** Pausa (ms) depois de cada cobrança, para mostrar o resultado. */
const RESULT_MS = 1500;
/** Bola em voo por mais que isso (ms) conta como erro. */
const FLIGHT_MAX_MS = 4000;
/** Trava de segurança: depois de tantas cobranças no total, a rng decide. */
const MAX_KICKS = 60;
/** Distância (m) do goleiro à linha do gol na cobrança. */
const KEEPER_INSET = 0.6;
/** Força e alvo (fração da meia-trave) da cobrança automática. */
const AUTO_POWER = 0.8;
const AUTO_TARGET = 0.6;
/** Chance do goleiro da IA de ler o canto e saltar para ele, por nível. */
const DIVE_CHANCE: Record<BotLevel, number> = { easy: 0.25, normal: 0.4, hard: 0.55 };

/** Entrada lateral (eixo z) a partir da qual o goleiro humano escolheu um lado, e quanto da meia-trave ele alcança ao pular. */
const LATERAL_PICK = 0.35;
const DIVE_REACH = 0.75;

const other = (s: TeamSide): TeamSide => (s === 0 ? 1 : 0);

function keeperOf(m: FutMatch, side: TeamSide): FutPlayer {
  return m.players.find((p) => p.side === side && p.role === "goleiro")!;
}

/** Cobradores giram entre os jogadores de linha não expulsos, humanos conectados primeiro. */
function pickTaker(m: FutMatch, side: TeamSide, nth: number): FutPlayer {
  const list = activeOutfield(m.players, side).sort((a, b) => {
    const ha = m.connected.has(a.id) ? 0 : 1;
    const hb = m.connected.has(b.id) ? 0 : 1;
    return ha - hb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  return list.length > 0 ? list[nth % list.length] : keeperOf(m, side);
}

function setupKick(m: FutMatch, s: Shootout): void {
  const f = m.field;
  const side = s.turn;
  const dir = attackDir(side);
  const taker = pickTaker(m, side, s.taken[side]);
  const keeper = keeperOf(m, other(side));
  s.takerId = taker.id;
  s.keeperId = keeper.id;
  s.stage = "aim";
  s.timerMs = 0;
  s.dive = 0;

  let parked = 0;
  for (const p of m.players) {
    p.vx = 0;
    p.vz = 0;
    p.downMs = 0;
    p.chargeMs = 0;
    p.chargeKind = null;
    if (p.id === taker.id || p.id === keeper.id) {
      continue;
    }
    p.x = -6 + (parked % 8) * 1.5;
    p.z = (p.side === 0 ? -1 : 1) * (f.halfW + 2);
    parked++;
  }
  const spotX = dir * (f.halfL - f.penaltySpot);
  taker.x = spotX;
  taker.z = 0;
  taker.facing = Math.atan2(dir, 0);
  keeper.x = dir * (f.halfL - KEEPER_INSET);
  keeper.z = 0;
  keeper.facing = Math.atan2(-dir, 0);
  Object.assign(m.ball, {
    x: spotX, y: FUT.ballRadius, z: 0, vx: 0, vy: 0, vz: 0, ownerId: null, lastTouch: null, prevTouch: null,
  });
  m.restart = { kind: "penalti", side, x: spotX, z: 0, takerId: taker.id, leftMs: FUT.restartWaitMs };
  m.events.push({ type: "restart", kind: "penalti" });
}

/** Começa a disputa depois do empate no tempo normal. */
export function startShootout(m: FutMatch): void {
  m.phase = "penalties";
  m.restart = null;
  m.shootout = {
    goals: [0, 0],
    taken: [0, 0],
    turn: m.rng() < 0.5 ? 0 : 1,
    stage: "aim",
    takerId: "",
    keeperId: "",
    timerMs: 0,
    dive: 0,
  };
  setupKick(m, m.shootout);
}

/** Vencedor da disputa, ou null se continua. Cinco cobranças cada (com decisão antecipada) e depois par a par. */
function decided(s: Shootout): TeamSide | null {
  const [ga, gb] = s.goals;
  const [ta, tb] = s.taken;
  if (ta === tb && ta >= REGULATION_KICKS) {
    return ga === gb ? null : ga > gb ? 0 : 1;
  }
  if (ta < REGULATION_KICKS || tb < REGULATION_KICKS) {
    if (ga > gb + (REGULATION_KICKS - tb)) {
      return 0;
    }
    if (gb > ga + (REGULATION_KICKS - ta)) {
      return 1;
    }
  }
  return null;
}

function resolveKick(m: FutMatch, s: Shootout, scored: boolean): void {
  const side = s.turn;
  s.taken[side]++;
  if (scored) {
    s.goals[side]++;
  }
  s.stage = "result";
  s.timerMs = RESULT_MS;
  m.restart = null;
  m.events.push({ type: "pen", side, takerId: s.takerId, scored });
}

/** Humano conectado do time que defende: ele escolhe o lado do pulo do goleiro (o goleiro em si é sempre da IA). */
function keeperPilot(m: FutMatch, s: Shootout): FutPlayer | undefined {
  const side = other(s.turn);
  return activeOutfield(m.players, side).filter((p) => m.connected.has(p.id) && !p.isBot).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
}

/** Ao sair o chute, o goleiro pode adivinhar o canto e já estar lá quando a bola chega (ou pula para o lado que o humano escolheu). */
function keeperDive(m: FutMatch, s: Shootout): void {
  const b = m.ball;
  const keeper = m.players.find((p) => p.id === s.keeperId)!;
  if (s.dive !== 0) {
    keeper.z = s.dive * m.field.goalHalfW * DIVE_REACH;
    return;
  }
  if (keeperPilot(m, s)) {
    // humano defendendo que não escolheu: o goleiro fica no meio
    return;
  }
  const dir = attackDir(other(keeper.side));
  if (b.vx * dir <= 0.5 || m.rng() >= DIVE_CHANCE[m.botLevel]) {
    return;
  }
  const zGoal = b.z + b.vz * ((dir * m.field.halfL - b.x) / b.vx);
  if (Math.abs(zGoal) <= m.field.goalHalfW + 0.5) {
    keeper.z = Math.max(-m.field.goalHalfW, Math.min(m.field.goalHalfW, zGoal));
  }
}

/** Cobrança automática quando os 8 s acabam: chute no canto. */
function autoShot(m: FutMatch, s: Shootout): void {
  const taker = m.players.find((p) => p.id === s.takerId)!;
  const dir = attackDir(taker.side);
  const side = m.rng() < 0.5 ? -1 : 1;
  const yaw = Math.atan2(dir * m.field.halfL - m.ball.x, side * m.field.goalHalfW * AUTO_TARGET - m.ball.z);
  touchBall(m.ball, taker);
  kickBall(m.ball, yaw, AUTO_POWER, "kick");
  recordKicks(m, [{ t: "kick", id: taker.id, ok: true }], false);
  m.restart = null;
}

export function stepShootout(m: FutMatch, dtMs: number): void {
  const s = m.shootout;
  if (!s) {
    return;
  }
  if (s.stage === "result") {
    s.timerMs -= dtMs;
    if (s.timerMs > 0) {
      return;
    }
    const w = s.taken[0] + s.taken[1] >= MAX_KICKS && s.goals[0] === s.goals[1] ? (m.rng() < 0.5 ? 0 : 1) : decided(s);
    if (w !== null) {
      m.winner = w;
      m.phase = "over";
      m.events.push({ type: "whistle", kind: "end" });
      return;
    }
    s.turn = other(s.turn);
    setupKick(m, s);
    return;
  }

  const only = new Set([s.takerId, s.keeperId]);
  if (s.stage === "aim") {
    const pilot = keeperPilot(m, s);
    const pick = pilot ? (m.inputs.get(pilot.id)?.mz ?? 0) : 0;
    if (Math.abs(pick) >= LATERAL_PICK) {
      s.dive = pick > 0 ? 1 : -1;
    }
    const w = stepWorld(m, dtMs, { only, keeperIdle: true, aimOnly: true, restartAi: false });
    recordKicks(m, w.events, false);
    if (m.restart && m.restart.leftMs <= 0) {
      autoShot(m, s);
    }
    if (!m.restart) {
      s.stage = "flight";
      s.timerMs = 0;
      keeperDive(m, s);
    }
    return;
  }

  stepWorld(m, dtMs, { only, keeperIdle: true, restartAi: false });
  s.timerMs += dtMs;
  const b = m.ball;
  const keeperTouched = b.ownerId === s.keeperId || b.lastTouch?.id === s.keeperId;
  const out = b.ownerId === null ? ballOut(b, m.field) : null;
  if (keeperTouched) {
    resolveKick(m, s, false);
  } else if (out) {
    resolveKick(m, s, out.kind === "gol" && out.side === other(s.turn));
  } else if (s.timerMs >= FLIGHT_MAX_MS || (b.ownerId === null && b.vx === 0 && b.vz === 0 && b.vy === 0 && s.timerMs > 0)) {
    resolveKick(m, s, false);
  }
}
