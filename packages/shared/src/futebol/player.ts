import { FUT } from "./balance";
import type { Field, FutInput, FutPlayer } from "./types";

/** Folga além das linhas do campo, em metros. */
const MARGIN = 2;

/** Movimento do jogador: inércia. Arranca e frena em tempos finitos, virar custa velocidade
 *  (a parte da velocidade fora da nova direção é freada pela aderência lateral) e conduzir a bola
 *  ou acabar de perdê-la acelera menos. Igual para humanos, bots e goleiros (mais ágil). */
export function stepPlayer(p: FutPlayer, input: FutInput, field: Field, dtMs: number): void {
  const dt = dtMs / 1000;
  if (p.slowMs) {
    p.slowMs = Math.max(0, p.slowMs - dtMs);
  }
  if (p.downMs > 0) {
    p.downMs = Math.max(0, p.downMs - dtMs);
    p.vx = 0;
    p.vz = 0;
    return;
  }
  const mult = (p.role === "goleiro" ? FUT.keeperAccel : 1) * (p.carry ? FUT.carryAccel : 1) * (p.slowMs ? FUT.recoverAccel : 1);
  const len = Math.hypot(input.mx, input.mz);
  if (len > 0) {
    const top = input.sprint ? FUT.sprintSpeed : FUT.walkSpeed;
    const tx = input.mx / len;
    const tz = input.mz / len;
    // along = velocidade na direção pedida; o resto (lateral) é freado pela aderência
    let along = p.vx * tx + p.vz * tz;
    let sx = p.vx - along * tx;
    let sz = p.vz - along * tz;
    const side = Math.hypot(sx, sz);
    if (side > 0) {
      const grip = (Math.hypot(p.vx, p.vz) > FUT.walkSpeed ? FUT.gripRun : FUT.gripWalk) * mult * dt;
      const k = Math.max(0, side - grip) / side;
      sx *= k;
      sz *= k;
    }
    if (along < 0) {
      along = Math.min(0, along + FUT.brake * mult * dt);
    } else if (along < top) {
      const rate = along < FUT.walkSpeed ? FUT.accelWalk : FUT.accelSprint;
      along = Math.min(top, along + rate * mult * dt);
    } else if (along > top) {
      along = Math.max(top, along - FUT.brake * mult * dt);
    }
    p.vx = sx + along * tx;
    p.vz = sz + along * tz;
    p.facing = Math.atan2(input.mx, input.mz);
  } else {
    const v = Math.hypot(p.vx, p.vz);
    const k = v > 0 ? Math.max(0, v - FUT.brake * mult * dt) / v : 0;
    p.vx *= k;
    p.vz *= k;
  }
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  const maxX = field.halfL + MARGIN;
  const maxZ = field.halfW + MARGIN;
  if (p.x > maxX) { p.x = maxX; p.vx = 0; } else if (p.x < -maxX) { p.x = -maxX; p.vx = 0; }
  if (p.z > maxZ) { p.z = maxZ; p.vz = 0; } else if (p.z < -maxZ) { p.z = -maxZ; p.vz = 0; }
}
