import { FUT } from "./balance";
import { kickBall } from "./ball";
import type { Ball, Field, FutInput, FutPlayer } from "./types";

/** Resultado de um toque. Em "tackle" e "steal", victimId e ballFirst só vêm
 *  quando houve contato com um adversário (a falta é julgada em fouls.ts). */
export interface TouchEvent {
  t: "kick" | "pass" | "steal" | "tackle";
  id: string;
  ok: boolean;
  victimId?: string;
  ballFirst?: boolean;
}

/** Bola acima disso (m) não é dominada nem chutada pelo jogador. */
const REACH_Y = 1.2;
/** Distância máxima (m) da bola solta para o botão de chute valer como chute. */
const LOOSE_KICK_REACH = FUT.sprintTouch + 0.1;
/** A bola conduzida em corrida leva essa fração da velocidade do jogador. */
const SPRINT_BALL_SPEED = 0.8;
/** Abaixo disso (m/s) o jogador está parado e não empurra a bola. */
const MOVING_EPS = 0.1;
/** Bola solta que se afasta do último toque mais rápido que isso não é retomada (m/s). */
const AWAY_EPS = 0.5;
/** Parado com a bola, ela descansa a essa distância (m) à frente do boneco, na direção em que ele olha. */
const REST_OFFSET = 0.55;
/** Carrinho: comprimento do deslize (m), raio de contato (m), recarga e tempo no chão da vítima (ms), toque na bola (m/s). */
const TACKLE_LEN = 2;
const TACKLE_REACH = 0.8;
const TACKLE_COOLDOWN_MS = 800;
const TACKLE_DOWN_MS = 1200;
const TACKLE_POKE = 7;

/** Folga além das linhas do campo, igual à de stepPlayer (m). */
const MARGIN = 2;

const NO_INPUT: FutInput = { mx: 0, mz: 0, aim: 0, sprint: false, kick: "none", pass: "none" };

function touch(ball: Ball, p: FutPlayer): void {
  if (ball.lastTouch?.id === p.id) {
    return;
  }
  ball.prevTouch = ball.lastTouch;
  ball.lastTouch = { id: p.id, side: p.side };
}

function canPlay(p: FutPlayer): boolean {
  return p.role === "linha" && !p.sentOff && p.downMs <= 0;
}

function byId(a: FutPlayer, b: FutPlayer): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function tackle(p: FutPlayer, input: FutInput, players: FutPlayer[], ball: Ball, field?: Field): TouchEvent {
  const dx = Math.sin(input.aim);
  const dz = Math.cos(input.aim);
  /** Projeção (t) e distância lateral (d) de um ponto sobre o deslize. */
  const along = (x: number, z: number) => {
    const rx = x - p.x;
    const rz = z - p.z;
    const t = Math.min(TACKLE_LEN, Math.max(0, rx * dx + rz * dz));
    return { t, d: Math.hypot(rx - dx * t, rz - dz * t) };
  };

  let victim: FutPlayer | null = null;
  let victimT = 0;
  for (const o of players) {
    if (o.side === p.side || o.role !== "linha" || o.sentOff || o.downMs > 0) {
      continue;
    }
    const a = along(o.x, o.z);
    if (a.d <= TACKLE_REACH && (victim === null || a.t < victimT)) {
      victim = o;
      victimT = a.t;
    }
  }
  const b = ball.y <= REACH_Y ? along(ball.x, ball.z) : null;
  const ballHit = b !== null && b.d <= TACKLE_REACH && (ball.ownerId === null || ball.ownerId === victim?.id);
  const ballFirst = ballHit && (victim === null || b!.t <= victimT);

  const stop = victim !== null ? victimT : TACKLE_LEN;
  p.x += dx * stop;
  p.z += dz * stop;
  if (field) {
    const mx = field.halfL + MARGIN;
    const mz = field.halfW + MARGIN;
    p.x = Math.min(mx, Math.max(-mx, p.x));
    p.z = Math.min(mz, Math.max(-mz, p.z));
  }
  p.vx = 0;
  p.vz = 0;
  p.facing = input.aim;
  p.tackleMs = TACKLE_COOLDOWN_MS;

  if (ballFirst) {
    touch(ball, p);
    ball.ownerId = null;
    ball.vx = dx * TACKLE_POKE;
    ball.vz = dz * TACKLE_POKE;
  }
  if (victim !== null) {
    victim.downMs = TACKLE_DOWN_MS;
    return { t: "tackle", id: p.id, ok: true, victimId: victim.id, ballFirst };
  }
  return ballFirst ? { t: "tackle", id: p.id, ok: true } : { t: "tackle", id: p.id, ok: false };
}

function steal(p: FutPlayer, players: FutPlayer[], ball: Ball): TouchEvent {
  const owner = ball.ownerId === null ? null : players.find((o) => o.id === ball.ownerId);
  if (owner && owner.side !== p.side && Math.hypot(owner.x - p.x, owner.z - p.z) <= FUT.controlRadius) {
    ball.ownerId = p.id;
    ball.vx = 0;
    ball.vz = 0;
    touch(ball, p);
    return { t: "steal", id: p.id, ok: true, victimId: owner.id, ballFirst: true };
  }
  return { t: "steal", id: p.id, ok: false };
}

/** Domínio, condução, carga, chute, passe, carrinho e disputa. Chamar depois de
 *  stepPlayer e antes de stepBall. A potência vem só de chargeMs (servidor). */
export function resolveTouches(
  players: FutPlayer[],
  ball: Ball,
  inputs: Map<string, FutInput>,
  dtMs: number,
  field?: Field,
): TouchEvent[] {
  const events: TouchEvent[] = [];
  const ordered = [...players].sort(byId);
  const kicked = new Set<string>();

  for (const p of ordered) {
    p.tackleMs = Math.max(0, p.tackleMs - dtMs);
  }

  // O dono perde a bola se saiu, caiu, foi expulso ou ela passou do raio.
  if (ball.ownerId !== null) {
    const o = ordered.find((q) => q.id === ball.ownerId);
    if (!o || !canPlay(o) || ball.y > REACH_Y || Math.hypot(ball.x - o.x, ball.z - o.z) > FUT.controlRadius) {
      ball.ownerId = null;
    }
  }

  for (const p of ordered) {
    if (p.role !== "linha" || p.sentOff) {
      continue;
    }
    const input = inputs.get(p.id) ?? NO_INPUT;
    if (p.downMs > 0) {
      p.chargeMs = 0;
      p.chargeKind = null;
      continue;
    }
    const kind: "kick" | "pass" | null = input.kick !== "none" ? "kick" : input.pass !== "none" ? "pass" : null;
    const phase = kind === "kick" ? input.kick : kind === "pass" ? input.pass : "none";

    if (kind === null) {
      p.chargeMs = 0;
      p.chargeKind = null;
      continue;
    }
    if (phase === "charge") {
      if (p.chargeKind !== kind) {
        p.chargeKind = kind;
        p.chargeMs = 0;
      }
      p.chargeMs = Math.min(FUT.chargeMaxMs, p.chargeMs + dtMs);
      continue;
    }

    // release
    const charged = p.chargeKind === kind;
    const power01 = charged ? Math.min(1, p.chargeMs / FUT.chargeMaxMs) : 0;
    p.chargeMs = 0;
    p.chargeKind = null;
    const hasBall = ball.ownerId === p.id;
    const looseNear =
      ball.ownerId === null &&
      ball.y <= REACH_Y &&
      Math.hypot(ball.x - p.x, ball.z - p.z) <= LOOSE_KICK_REACH &&
      !(ball.lastTouch?.id === p.id && ball.vx * ball.vx + ball.vz * ball.vz > 0);
    if (hasBall || looseNear) {
      touch(ball, p);
      kickBall(ball, input.aim, power01, kind);
      kicked.add(p.id);
      events.push({ t: kind, id: p.id, ok: true });
    } else if (charged && kind === "kick") {
      if (p.tackleMs <= 0) {
        const ev = tackle(p, input, ordered, ball, field);
        events.push(ev);
        if (ev.ballFirst) {
          kicked.add(p.id);
        }
      }
    } else if (charged) {
      // sem carga do mesmo tipo (reenvio do release pelo cliente) não vira carrinho nem disputa
      events.push(steal(p, ordered, ball));
    }
  }

  // Bola solta: o mais perto dentro do raio fica com ela (empate: menor id).
  if (ball.ownerId === null && ball.y <= REACH_Y) {
    let best: FutPlayer | null = null;
    let bestD = Infinity;
    for (const p of ordered) {
      if (!canPlay(p) || kicked.has(p.id)) {
        continue;
      }
      const dx = ball.x - p.x;
      const dz = ball.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > FUT.controlRadius || d >= bestD) {
        continue;
      }
      // Quem acabou de tocar não retoma a bola que está se afastando.
      if (ball.lastTouch?.id === p.id && d > 0 && ((ball.vx - p.vx) * dx + (ball.vz - p.vz) * dz) / d > AWAY_EPS) {
        continue;
      }
      best = p;
      bestD = d;
    }
    if (best) {
      ball.ownerId = best.id;
      ball.vx = 0;
      ball.vz = 0;
      touch(ball, best);
    }
  }

  // Condução: o dono empurra a bola à frente. Em corrida o toque é longo e a
  // bola sai do raio por instantes (o adversário pode tomar).
  const owner = ball.ownerId === null ? null : ordered.find((q) => q.id === ball.ownerId);
  if (owner) {
    const speed = Math.hypot(owner.vx, owner.vz);
    if (speed <= MOVING_EPS) {
      ball.x = owner.x + Math.sin(owner.facing) * REST_OFFSET;
      ball.z = owner.z + Math.cos(owner.facing) * REST_OFFSET;
      ball.y = FUT.ballRadius;
      ball.vx = 0;
      ball.vz = 0;
    }
    if (speed > MOVING_EPS) {
      const sprint = (inputs.get(owner.id) ?? NO_INPUT).sprint;
      const d = sprint ? FUT.sprintTouch : FUT.dribbleTouch;
      const k = sprint ? SPRINT_BALL_SPEED : 1;
      ball.x = owner.x + (owner.vx / speed) * d;
      ball.z = owner.z + (owner.vz / speed) * d;
      ball.y = FUT.ballRadius;
      ball.vx = owner.vx * k;
      ball.vz = owner.vz * k;
      ball.vy = 0;
      if (d > FUT.controlRadius) {
        ball.ownerId = null;
      }
    }
  }

  return events;
}
