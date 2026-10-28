import { BALANCE } from "../data/balance";
import type { Box } from "../data/map";
import type { Vec2 } from "../types";

/**
 * Resolve a colisão/penetração de um círculo em um retângulo AABB (Box).
 * Empurra o círculo pela direção normal mais curta para fora do retângulo.
 */
function resolveCircleBox(pos: Vec2, r: number, b: Box): void {
  const hx = b.w / 2;
  const hz = b.d / 2;

  // Ponto mais próximo da caixa ao centro do círculo
  const cx = Math.max(b.x - hx, Math.min(b.x + hx, pos.x));
  const cz = Math.max(b.z - hz, Math.min(b.z + hz, pos.z));

  const vx = pos.x - cx;
  const vz = pos.z - cz;
  const distSq = vx * vx + vz * vz;

  if (distSq < r * r) {
    if (distSq > 1e-9) {
      const dist = Math.sqrt(distSq);
      const overlap = r - dist;
      pos.x += (vx / dist) * overlap;
      pos.z += (vz / dist) * overlap;
    } else {
      // Caso raro: o centro do círculo está exatamente dentro do retângulo.
      // Ejeta pela face mais próxima para a saída mais curta.
      const left = pos.x - (b.x - hx);
      const right = (b.x + hx) - pos.x;
      const top = pos.z - (b.z - hz);
      const bottom = (b.z + hz) - pos.z;
      const min = Math.min(left, right, top, bottom);
      if (min === left) pos.x = b.x - hx - r;
      else if (min === right) pos.x = b.x + hx + r;
      else if (min === top) pos.z = b.z - hz - r;
      else pos.z = b.z + hz + r;
    }
  }
}

function clampBounds(pos: Vec2, r: number, bounds: { w: number; d: number }): void {
  const mx = bounds.w / 2 - r;
  const mz = bounds.d / 2 - r;
  pos.x = Math.max(-mx, Math.min(mx, pos.x));
  pos.z = Math.max(-mz, Math.min(mz, pos.z));
}

/**
 * Move um círculo pelo plano XZ deslizando suavemente nas caixas e
 * mantendo o jogador dentro dos limites do mapa.
 *
 * Utiliza separação contínua de Circle vs AABB em sub-passos para:
 * 1. Evitar teletransportes e atravessamento de paredes finas.
 * 2. Permitir deslizamento fluido em qualquer parede.
 * 3. Contornar quinas de mesas e quinas de paredes de forma natural.
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

  if (len < 1e-9) {
    for (let it = 0; it < 2; it++) {
      for (const b of boxes) {
        if (Math.abs(pos.x - b.x) >= b.w / 2 + r || Math.abs(pos.z - b.z) >= b.d / 2 + r) continue;
        resolveCircleBox(pos, r, b);
      }
      clampBounds(pos, r, bounds);
    }
    return pos;
  }

  // Passos curtos (no máximo ~0.35 * r) para impedir tunelamento mesmo em altas velocidades (dash/dodge)
  const steps = Math.max(1, Math.ceil(len / (r * 0.35)));
  const subDx = dx / steps;
  const subDz = dz / steps;

  for (let s = 0; s < steps; s++) {
    // 1. Move componente X e resolve colisão
    pos.x += subDx;
    for (const b of boxes) {
      if (Math.abs(pos.x - b.x) >= b.w / 2 + r || Math.abs(pos.z - b.z) >= b.d / 2 + r) continue;
      resolveCircleBox(pos, r, b);
    }

    // 2. Move componente Z e resolve colisão
    pos.z += subDz;
    for (const b of boxes) {
      if (Math.abs(pos.x - b.x) >= b.w / 2 + r || Math.abs(pos.z - b.z) >= b.d / 2 + r) continue;
      resolveCircleBox(pos, r, b);
    }

    // 3. Relaxamento para cantos/quinas onde múltiplas caixas se encontram
    for (const b of boxes) {
      if (Math.abs(pos.x - b.x) >= b.w / 2 + r || Math.abs(pos.z - b.z) >= b.d / 2 + r) continue;
      resolveCircleBox(pos, r, b);
    }

    clampBounds(pos, r, bounds);
  }

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
