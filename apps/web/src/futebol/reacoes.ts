/** Duração (ms) do mergulho do goleiro e inclinação máxima (rad), deslocamento lateral (m) e subida (m) no auge. */
export const DIVE_MS = 950;
export const DIVE_ROLL = 1.25;
export const DIVE_REACH = 0.9;
export const DIVE_LIFT = 0.45;
/** Inclinação (rad) para a frente do time que levou gol (cabeça baixa). */
export const SLUMP = 0.38;
/** Só mergulha se a bola passa a mais disso (m) do goleiro; mais perto é defesa de pé. */
export const DIVE_MIN_GAP = 0.5;

/** Quanto do mergulho está aplicado (0..1) em u = tempo/duração: sobe rápido, segura e levanta devagar. */
export function diveAmount(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  const k = Math.min(1, u / 0.28, (1 - u) / 0.38);
  return k * k * (3 - 2 * k);
}

/** Lado do mergulho no eixo x do goleiro (+1 ou -1) para a bola que cruza em `ballZ`; 0 se passa perto demais para mergulhar. */
export function diveSide(facing: number, keeperZ: number, ballZ: number): -1 | 0 | 1 {
  const dz = ballZ - keeperZ;
  if (Math.abs(dz) < DIVE_MIN_GAP) return 0;
  // o eixo x do boneco girado em `facing` aponta para (cos f, -sin f): só a parte em z interessa
  const s = -Math.sin(facing) * dz;
  return Math.abs(s) < 1e-6 ? 0 : s > 0 ? 1 : -1;
}
