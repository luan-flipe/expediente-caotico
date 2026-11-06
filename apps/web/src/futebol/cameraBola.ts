/** Distância horizontal mínima à bola para ela mandar no yaw; mais perto que isso mantém o último yaw (evita giro louco). */
export const YAW_MIN_DIST = 1.5;
/** Taxa (1/s) do giro da câmera até a bola. */
export const YAW_RATE = 5;
/** Teto de velocidade angular (rad/s): a bola passando rente não faz a câmera chicotear. */
export const YAW_MAX_SPEED = 4.5;

interface Pt {
  x: number;
  z: number;
}

/** Ângulo no intervalo (-PI, PI]. */
export function wrapAngle(a: number): number {
  const t = Math.PI * 2;
  let r = (((a + Math.PI) % t) + t) % t - Math.PI;
  if (r === -Math.PI) r = Math.PI;
  return r;
}

/** Yaw (0 olha para +z) de `from` até `to`; se estiver perto demais, devolve `current`. */
export function yawToward(from: Pt, to: Pt, current: number): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.hypot(dx, dz) < YAW_MIN_DIST) return current;
  return Math.atan2(dx, dz);
}

/** Aproxima `cur` de `target` pelo caminho curto, suave e com velocidade angular limitada. */
export function approachYaw(cur: number, target: number, dt: number, rate = YAW_RATE, maxSpeed = YAW_MAX_SPEED): number {
  const d = wrapAngle(target - cur);
  const k = 1 - Math.exp(-dt * rate);
  const cap = maxSpeed * dt;
  const step = Math.max(-cap, Math.min(cap, d * k));
  return cur + step;
}

/** Alvo do yaw da câmera na partida normal: com a bola, o gol adversário; sem ela, a bola. */
export function cameraYawTarget(from: Pt, ball: Pt, goal: Pt, hasBall: boolean, current: number): number {
  return yawToward(from, hasBall ? goal : ball, current);
}
