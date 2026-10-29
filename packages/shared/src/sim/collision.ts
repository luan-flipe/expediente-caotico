import { BALANCE } from "../data/balance";
import type { Box } from "../data/map";
import type { Vec2 } from "../types";

/**
 * Move o jogador em um único eixo ("x" ou "z"), deslizando nas caixas.
 * Garante que:
 * 1. O jogador nunca atravesse uma caixa.
 * 2. Se o jogador estiver encostado ou ligeiramente penetrado, recuar afasta-o suavemente
 *    sem jamais teleportá-lo para o lado oposto da caixa.
 * 3. O deslizamento no eixo perpendicular ocorra com velocidade total.
 */
function pushAxis(pos: Vec2, axis: "x" | "z", delta: number, r: number, boxes: Box[]): void {
  if (delta === 0) return;
  const otherAxis = axis === "x" ? "z" : "x";
  let next = pos[axis] + delta;

  for (const b of boxes) {
    const half = axis === "x" ? b.w / 2 : b.d / 2;
    const otherHalf = axis === "x" ? b.d / 2 : b.w / 2;
    const center = axis === "x" ? b.x : b.z;
    const otherCenter = axis === "x" ? b.z : b.x;

    // Se no outro eixo não há sobreposição, a caixa não interfere neste movimento
    if (Math.abs(pos[otherAxis] - otherCenter) >= otherHalf + r) continue;

    const minBound = center - half - r;
    const maxBound = center + half + r;

    if (delta > 0) {
      // Movendo no sentido positivo: só bloqueia se o jogador estava do lado menor (face minBound)
      if (pos[axis] <= center) {
        if (next > minBound) {
          next = Math.min(next, minBound);
        }
      }
    } else {
      // Movendo no sentido negativo: só bloqueia se o jogador estava do lado maior (face maxBound)
      if (pos[axis] >= center) {
        if (next < maxBound) {
          next = Math.max(next, maxBound);
        }
      }
    }
  }

  pos[axis] = next;
}

/**
 * Move um círculo pelo plano XZ deslizando suavemente nas caixas (eixos separados)
 * e preso aos limites do mapa. Divide o movimento em passos menores que o raio
 * para impedir tunelamento através de paredes finas.
 */
export function moveCircle(
  from: Vec2,
  dx: number,
  dz: number,
  r: number,
  boxes: Box[],
  bounds: { w: number; d: number },
): Vec2 {
  const pos = { x: from.x, z: from.z };
  const len = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(len / (r * 0.7)));

  for (let i = 0; i < steps; i++) {
    pushAxis(pos, "x", dx / steps, r, boxes);
    pushAxis(pos, "z", dz / steps, r, boxes);
  }

  const mx = bounds.w / 2 - r;
  const mz = bounds.d / 2 - r;
  pos.x = Math.max(-mx, Math.min(mx, pos.x));
  pos.z = Math.max(-mz, Math.min(mz, pos.z));
  return pos;
}

/** Menor t em [0,1] em que o segmento a→b entra numa caixa alta o bastante, ou null. */
export function segmentBoxT(
  a: Vec2,
  b: Vec2,
  boxes: Box[],
  pad = 0,
  minHeight: number = BALANCE.coverHeight,
): number | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let best: number | null = null;
  for (const box of boxes) {
    if (box.h < minHeight) continue;
    let t0 = 0;
    let t1 = 1;
    const slabs: [number, number, number][] = [
      [a.x, dx, box.w / 2 + pad],
      [a.z, dz, box.d / 2 + pad],
    ];
    const centers = [box.x, box.z];
    let miss = false;
    for (let i = 0; i < 2; i++) {
      const [p, d, half] = slabs[i];
      const min = centers[i] - half;
      const max = centers[i] + half;
      if (Math.abs(d) < 1e-9) {
        if (p < min || p > max) miss = true;
        continue;
      }
      let ta = (min - p) / d;
      let tb = (max - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) miss = true;
    }
    if (miss) continue;
    if (best === null || t0 < best) best = t0;
  }
  return best;
}

export function segmentBlocked(a: Vec2, b: Vec2, boxes: Box[]): boolean {
  return segmentBoxT(a, b, boxes) !== null;
}

export function pointInBoxes(p: Vec2, r: number, boxes: Box[]): boolean {
  return boxes.some((b) => Math.abs(p.x - b.x) < b.w / 2 + r && Math.abs(p.z - b.z) < b.d / 2 + r);
}
