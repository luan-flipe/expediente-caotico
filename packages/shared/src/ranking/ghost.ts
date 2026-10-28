import type { GhostSample } from "./types";

/** Posição e direção de uma cadeira gravada. */
export interface GhostPose {
  x: number;
  z: number;
  heading: number;
}

/** Interpola dois ângulos pelo caminho mais curto (de 359 para 1 grau passa por 0). */
export function lerpAngle(a: number, b: number, k: number): number {
  const full = Math.PI * 2;
  let d = (b - a) % full;
  if (d > Math.PI) d -= full;
  if (d < -Math.PI) d += full;
  return a + d * k;
}

/**
 * Onde a cadeira gravada estava no instante `t` (ms desde a linha de largada).
 * Entre duas amostras interpola; antes da primeira e depois da última fica parada nelas. Sem amostras: null.
 */
export function sampleGhost(samples: readonly GhostSample[], t: number): GhostPose | null {
  const n = samples.length;
  if (n === 0) return null;
  const pose = (s: GhostSample): GhostPose => ({ x: s[1], z: s[2], heading: s[3] });
  if (n === 1 || t <= samples[0][0]) return pose(samples[0]);
  if (t >= samples[n - 1][0]) return pose(samples[n - 1]);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid][0] <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const span = b[0] - a[0];
  const k = span > 0 ? (t - a[0]) / span : 1;
  return { x: a[1] + (b[1] - a[1]) * k, z: a[2] + (b[2] - a[2]) * k, heading: lerpAngle(a[3], b[3], k) };
}
