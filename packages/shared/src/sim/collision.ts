import { BALANCE } from "../data/balance";
import type { Box } from "../data/map";
import type { Vec2 } from "../types";

function pushAxis(pos: Vec2, axis: "x" | "z", delta: number, r: number, boxes: Box[]): void {
  if (delta === 0) return;
  let next = pos[axis] + delta;
  for (const b of boxes) {
    const half = axis === "x" ? b.w / 2 : b.d / 2;
    const otherHalf = axis === "x" ? b.d / 2 : b.w / 2;
    const center = axis === "x" ? b.x : b.z;
    const other = axis === "x" ? pos.z - b.z : pos.x - b.x;
    if (Math.abs(other) >= otherHalf + r) continue;
    if (Math.abs(next - center) >= half + r) continue;
    next = delta > 0 ? Math.min(next, center - half - r) : Math.max(next, center + half + r);
  }
  pos[axis] = next;
}

/**
 * Move um círculo pelo plano XZ deslizando nas caixas (eixos separados) e
 * preso aos limites do mapa. Divide o movimento em passos menores que o raio
 * para não atravessar paredes finas.
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
  const steps = Math.max(1, Math.ceil(len / (r * 0.8)));
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
