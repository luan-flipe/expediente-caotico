import { FUT } from "./balance";
import type { Ball, Field, TeamSide } from "./types";

/** Abaixo disso a quicada vira rolagem (m/s). */
const MIN_BOUNCE_VY = 0.5;

/** Passo da bola: gravidade, quique, atrito no chão e parada. */
export function stepBall(b: Ball, dtMs: number): void {
  const dt = dtMs / 1000;
  if (b.curve && b.y > FUT.ballRadius + 0.02) {
    // efeito: a direção horizontal gira, a velocidade não muda
    const a = b.curve * dt;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const vx = b.vx * c + b.vz * s;
    b.vz = b.vz * c - b.vx * s;
    b.vx = vx;
  }
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  b.vy -= FUT.gravity * dt;
  b.y += b.vy * dt;

  if (b.y <= FUT.ballRadius) {
    b.y = FUT.ballRadius;
    b.curve = 0;
    if (b.vy < -MIN_BOUNCE_VY) {
      b.vy = -b.vy * FUT.bounce;
      if (b.lob) {
        b.vx *= FUT.lobScrub;
        b.vz *= FUT.lobScrub;
      }
    } else {
      b.vy = 0;
    }
  }

  if (b.y <= FUT.ballRadius && b.vy === 0) {
    const keep = Math.pow(1 - FUT.groundFrictionPerSec, dt);
    b.vx *= keep;
    b.vz *= keep;
    if (Math.hypot(b.vx, b.vz) < FUT.ballStopSpeed) {
      b.vx = 0;
      b.vz = 0;
    }
  }
}

/** Saída da bola. Só conta quando passa INTEIRA da linha. Em "gol" e "fundo",
 *  side é o time que defende aquele lado (x > 0 = time 1, x < 0 = time 0);
 *  em "lateral", side é o lado do campo por onde saiu (z > 0 = 1, z < 0 = 0). */
export function ballOut(b: Ball, f: Field): { kind: "lateral" | "fundo" | "gol"; side: TeamSide } | null {
  const r = FUT.ballRadius;
  if (Math.abs(b.x) > f.halfL + r) {
    const side: TeamSide = b.x > 0 ? 1 : 0;
    const gol = Math.abs(b.z) < f.goalHalfW && b.y < f.goalH;
    return { kind: gol ? "gol" : "fundo", side };
  }
  if (Math.abs(b.z) > f.halfW + r) {
    return { kind: "lateral", side: b.z > 0 ? 1 : 0 };
  }
  return null;
}

/** Opções do toque: vy força a velocidade vertical (m/s); lob dá ao passe a razão vertical/velocidade (lançamento). */
export interface KickOpts {
  vy?: number;
  lob?: number;
  /** Velocidade horizontal (m/s) em vez da que a força daria. */
  speed?: number;
  /** Efeito (rad/s) da direção horizontal enquanto a bola está no ar. */
  curve?: number;
}

/** Velocidade vertical (m/s) de um chute forte: cresce de 0 (em loftFrom) a loftMax x velocidade (força total). */
export function loftVy(speed: number, p: number): number {
  if (p <= FUT.loftFrom) {
    return 0;
  }
  return ((p - FUT.loftFrom) / (1 - FUT.loftFrom)) * speed * FUT.loftMax;
}

/** Velocidade horizontal (m/s) do lançamento que cai a `d` metros (sem arrasto): d = 2 * lob * v^2 / g. */
export function lobSpeedFor(d: number): number {
  return Math.sqrt((Math.max(0, d) * FUT.gravity) / (2 * FUT.lobRatio));
}

/** Velocidade (m/s) do lançamento do goleiro para a força 0..1: vai de passMin a lobMax. */
export function keeperLobSpeed(power01: number): number {
  return FUT.passMin + (FUT.lobMax - FUT.passMin) * Math.min(1, Math.max(0, power01));
}

/** Força (0..1) do lançamento do goleiro que cai a `d` metros (inverso de keeperLobSpeed). */
export function keeperLobPowerFor(d: number): number {
  return Math.min(1, Math.max(0, (lobSpeedFor(d) - FUT.passMin) / (FUT.lobMax - FUT.passMin)));
}

/** Chute (kick) ou passe (pass). dirYaw: 0 = +z, vetor (sin, cos). */
export function kickBall(b: Ball, dirYaw: number, power01: number, kind: "kick" | "pass", opts: KickOpts = {}): void {
  const p = Math.min(1, Math.max(0, power01));
  const [min, max] = kind === "kick" ? [FUT.shotMin, FUT.shotMax] : [FUT.passMin, FUT.passMax];
  const speed = opts.speed ?? min + (max - min) * p;
  b.curve = opts.curve ?? 0;
  b.lob = opts.lob !== undefined;
  b.vx = Math.sin(dirYaw) * speed;
  b.vz = Math.cos(dirYaw) * speed;
  b.vy = opts.vy ?? (opts.lob !== undefined ? speed * opts.lob : kind === "kick" ? loftVy(speed, p) : 0);
  b.ownerId = null;
}
