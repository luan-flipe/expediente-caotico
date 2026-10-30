import { FUT } from "./balance";
import type { Ball, Field, TeamSide } from "./types";

/** Abaixo disso a quicada vira rolagem (m/s). */
const MIN_BOUNCE_VY = 0.5;
/** Ganho de altura do chute forte por m/s de potência acima do limiar. */
const LOFT = 0.35;
const LOFT_THRESHOLD = 0.6;

/** Passo da bola: gravidade, quique, atrito no chão e parada. */
export function stepBall(b: Ball, dtMs: number): void {
  const dt = dtMs / 1000;
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  b.vy -= FUT.gravity * dt;
  b.y += b.vy * dt;

  if (b.y <= FUT.ballRadius) {
    b.y = FUT.ballRadius;
    if (b.vy < -MIN_BOUNCE_VY) {
      b.vy = -b.vy * FUT.bounce;
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

/** Chute (kick) ou passe (pass). dirYaw: 0 = +z, vetor (sin, cos). */
export function kickBall(b: Ball, dirYaw: number, power01: number, kind: "kick" | "pass"): void {
  const p = Math.min(1, Math.max(0, power01));
  const [min, max] = kind === "kick" ? [FUT.shotMin, FUT.shotMax] : [FUT.passMin, FUT.passMax];
  const speed = min + (max - min) * p;
  b.vx = Math.sin(dirYaw) * speed;
  b.vz = Math.cos(dirYaw) * speed;
  b.vy = kind === "kick" && p > LOFT_THRESHOLD ? (p - LOFT_THRESHOLD) * speed * LOFT * 2.5 : 0;
  b.ownerId = null;
}
