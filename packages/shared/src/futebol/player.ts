import { FUT } from "./balance";
import type { Field, FutInput, FutPlayer } from "./types";

/** Aceleração em m/s^2 (chega a walkSpeed em cerca de 0,2 s). */
const ACCEL = 30;
/** Folga além das linhas do campo, em metros. */
const MARGIN = 2;

/** Movimento do jogador de linha: aceleração suave até walk/sprint. */
export function stepPlayer(p: FutPlayer, input: FutInput, field: Field, dtMs: number): void {
  const dt = dtMs / 1000;
  if (p.downMs > 0) {
    p.downMs = Math.max(0, p.downMs - dtMs);
    p.vx = 0;
    p.vz = 0;
    return;
  }
  const len = Math.hypot(input.mx, input.mz);
  const speed = input.sprint ? FUT.sprintSpeed : FUT.walkSpeed;
  const tx = len > 0 ? (input.mx / len) * speed : 0;
  const tz = len > 0 ? (input.mz / len) * speed : 0;
  const dx = tx - p.vx;
  const dz = tz - p.vz;
  const dist = Math.hypot(dx, dz);
  const step = ACCEL * dt;
  if (dist <= step) {
    p.vx = tx;
    p.vz = tz;
  } else {
    p.vx += (dx / dist) * step;
    p.vz += (dz / dist) * step;
  }
  if (len > 0) p.facing = Math.atan2(p.vx, p.vz);
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  const maxX = field.halfL + MARGIN;
  const maxZ = field.halfW + MARGIN;
  if (p.x > maxX) { p.x = maxX; p.vx = 0; } else if (p.x < -maxX) { p.x = -maxX; p.vx = 0; }
  if (p.z > maxZ) { p.z = maxZ; p.vz = 0; } else if (p.z < -maxZ) { p.z = -maxZ; p.vz = 0; }
}
