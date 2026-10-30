import { stepBall } from "./ball";
import { botInput } from "./bots";
import { holdBall, keeperKick, keeperSave } from "./goalkeeping";
import { keeperInput } from "./keeper";
import { stepPlayer } from "./player";
import { restartBlocks, stepRestart } from "./restarts";
import { resolveTouches, type TouchEvent } from "./touch";
import type { FutInput, FutMatch, FutPlayer } from "./types";

const IDLE: FutInput = { mx: 0, mz: 0, aim: 0, sprint: false, kick: "none", pass: "none" };
/** Abaixo disso (m/s) o cobrador está parado (não conduziu a bola). */
const MOVING_EPS = 0.1;

export interface WorldOpts {
  /** Só estes ids participam (os demais ficam parados e fora de jogo). */
  only?: ReadonlySet<string>;
  /** Goleiros da IA ficam parados (disputa de pênaltis: o salto é sorteado em penalties.ts). */
  keeperIdle?: boolean;
  /** Cobrador só mira e chuta: não anda, e conduzir a bola não encerra a cobrança. */
  aimOnly?: boolean;
  /** false = a IA não cobra sozinha quando os 8 s acabam (a disputa de pênaltis cuida disso). */
  restartAi?: boolean;
}

export interface WorldStep {
  events: TouchEvent[];
  inputs: Map<string, FutInput>;
}

function inputFor(m: FutMatch, p: FutPlayer, o: WorldOpts): FutInput {
  if (p.role === "goleiro") {
    return o.keeperIdle ? { ...IDLE, aim: p.facing } : keeperInput(p, m.ball, m.field, m.botLevel, m.players);
  }
  const raw = p.isBot || !m.connected.has(p.id) ? botInput(p, m, m.botLevel) : (m.inputs.get(p.id) ?? IDLE);
  return o.aimOnly ? { ...raw, mx: 0, mz: 0, sprint: false } : raw;
}

/** Guarda quando cada jogador tocou na bola (base da assistência). */
function trackTouches(m: FutMatch, events: TouchEvent[]): void {
  const lt = m.ball.lastTouch;
  if (lt) {
    if (lt.id !== m.lastTouchId) {
      m.lastTouchId = lt.id;
      m.touchAt.set(lt.id, m.now);
    } else if (m.ball.ownerId === lt.id) {
      m.touchAt.set(lt.id, m.now);
    }
  }
  for (const e of events) {
    if (e.t === "kick" || e.t === "pass") {
      m.touchAt.set(e.id, m.now);
    }
  }
  const pt = m.ball.prevTouch;
  if (pt && !m.touchAt.has(pt.id)) {
    m.touchAt.set(pt.id, m.now);
  }
}

/** Um tick do mundo: intenções, movimento, goleiros, toques, cobrança e bola. */
export function stepWorld(m: FutMatch, dtMs: number, o: WorldOpts = {}): WorldStep {
  const active = m.players.filter((p) => !p.sentOff && (!o.only || o.only.has(p.id)));
  const inputs = new Map<string, FutInput>();
  for (const p of active) {
    inputs.set(p.id, inputFor(m, p, o));
  }
  for (const p of active) {
    stepPlayer(p, inputs.get(p.id)!, m.field, dtMs);
  }

  const touchers: FutPlayer[] = [];
  for (const p of active) {
    if (restartBlocks(m, p.id)) {
      p.chargeMs = 0;
      p.chargeKind = null;
    } else {
      touchers.push(p);
    }
  }

  const events: TouchEvent[] = [];
  for (const k of touchers) {
    if (k.role !== "goleiro") {
      continue;
    }
    if (m.ball.ownerId === k.id) {
      const ev = keeperKick(m, k, inputs.get(k.id)!, dtMs);
      if (ev) {
        events.push(ev);
      }
    } else {
      k.chargeMs = 0;
      k.chargeKind = null;
      keeperSave(m, k);
    }
  }

  // resolveTouches só trata jogador de linha e solta a bola do goleiro: com ela
  // nas mãos, o motor recebe uma cópia fora de alcance.
  const holder = m.players.find((p) => p.role === "goleiro" && p.id === m.ball.ownerId) ?? null;
  const ball = holder ? { ...m.ball, y: 99, ownerId: null } : m.ball;
  events.push(...resolveTouches(touchers.filter((p) => p.role === "linha"), ball, inputs, dtMs, m.field));
  if (holder) {
    holdBall(m, holder);
  }

  const r = m.restart;
  if (r) {
    const taker = m.players.find((p) => p.id === r.takerId);
    const touched =
      events.some((e) => (e.t === "kick" || e.t === "pass") && e.id === r.takerId) ||
      (!o.aimOnly && taker !== undefined && m.ball.ownerId === taker.id && Math.hypot(taker.vx, taker.vz) > MOVING_EPS);
    if (touched) {
      m.restart = null;
    }
  }
  if (m.restart) {
    if (o.restartAi === false) {
      m.restart.leftMs = Math.max(0, m.restart.leftMs - dtMs);
    } else {
      stepRestart(m, dtMs);
    }
  }

  if (!holder) {
    stepBall(m.ball, dtMs);
  }
  trackTouches(m, events);
  return { events, inputs };
}
