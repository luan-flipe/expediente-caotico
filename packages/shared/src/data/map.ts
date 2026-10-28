import type { Vec2 } from "../types";

export type BoxKind = "wall" | "glass" | "desk" | "cabinet" | "counter" | "plant" | "partition" | "sofa" | "railing";

/** Caixa alinhada aos eixos: centro (x, z), largura em x (w), profundidade em z (d), altura (h). */
export interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  kind: BoxKind;
}

export interface Room {
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  floor: string;
}

export interface ElevationArea {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

export interface StairArea {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  axis: "x" | "z";
  direction: 1 | -1; // 1 = sobe na direção positiva; -1 = sobe na direção negativa
  h0: number;
  h1: number;
  steps: number;
}

export interface GameMap {
  width: number;
  depth: number;
  boxes: Box[];
  spawns: Vec2[];
  objectivePoints: Vec2[];
  rooms: Room[];
  elevations: ElevationArea[];
  stairs: StairArea[];
}

const T = 0.4;
const H = 3;

/** Parede ao longo de x (z fixo), com vãos [centro, largura]. */
function wallX(z: number, x0: number, x1: number, gaps: [number, number][], kind: BoxKind = "wall"): Box[] {
  const cuts = gaps.map(([c, w]) => [c - w / 2, c + w / 2]).sort((a, b) => a[0] - b[0]);
  const out: Box[] = [];
  let start = x0;
  for (const [a, b] of [...cuts, [x1, x1]]) {
    if (a > start) out.push({ x: (start + a) / 2, z, w: a - start, d: T, h: H, kind });
    start = b;
  }
  return out;
}

/** Parede ao longo de z (x fixo), com vãos [centro, largura]. */
function wallZ(x: number, z0: number, z1: number, gaps: [number, number][], kind: BoxKind = "wall"): Box[] {
  return wallX(0, z0, z1, gaps, kind).map((b) => ({ ...b, x, z: b.x, w: T, d: b.w }));
}

const box = (x: number, z: number, w: number, d: number, h: number, kind: BoxKind): Box => ({ x, z, w, d, h, kind });

const W = 70;
const D = 44;

export const OFFICE_MAP: GameMap = {
  width: W,
  depth: D,
  rooms: [
    { name: "Campo Gramado", x: 0, z: 0, w: W, d: D, floor: "#4f7d3d" },
  ],
  elevations: [
    // 1. Colina / Platô Central do Campo
    { id: "elev-central", name: "Colina Central", x: 0, z: 0, w: 8.0, d: 8.0, h: 1.0 },
    // 2. Mirante Norte
    { id: "elev-norte", name: "Mirante Norte", x: 18, z: -11, w: 9.0, d: 7.0, h: 1.2 },
    // 3. Mirante Sul
    { id: "elev-sul", name: "Mirante Sul", x: -18, z: 11, w: 9.0, d: 7.0, h: 1.1 },
  ],
  stairs: [
    // Escadas para a Colina Central (oeste e leste)
    { id: "stair-central-w", name: "Escada Central Oeste", x: -5.0, z: 0, w: 2.0, d: 4.0, axis: "x", direction: 1, h0: 0, h1: 1.0, steps: 5 },
    { id: "stair-central-e", name: "Escada Central Leste", x: 5.0, z: 0, w: 2.0, d: 4.0, axis: "x", direction: -1, h0: 0, h1: 1.0, steps: 5 },
    // Escada para o Mirante Norte (subindo pelo sul em direção a z=-11)
    { id: "stair-norte", name: "Escada Mirante Norte", x: 18, z: -6.5, w: 4.0, d: 2.0, axis: "z", direction: -1, h0: 0, h1: 1.2, steps: 6 },
    // Escada para o Mirante Sul (subindo pelo norte em direção a z=11)
    { id: "stair-sul", name: "Escada Mirante Sul", x: -18, z: 6.5, w: 4.0, d: 2.0, axis: "z", direction: 1, h0: 0, h1: 1.1, steps: 5 },
  ],
  // Campo 100% aberto: todos os objetos e paredes foram removidos
  boxes: [],
  spawns: [
    { x: -26, z: -14 },
    { x: 26, z: -14 },
    { x: -26, z: 14 },
    { x: 26, z: 14 },
    { x: -28, z: 0 },
    { x: 28, z: 0 },
    { x: 0, z: -16 },
    { x: 0, z: 16 },
  ],
  objectivePoints: [
    { x: 0, z: 0 },
    { x: 18, z: -11 },
    { x: -18, z: 11 },
    { x: -20, z: -10 },
    { x: 20, z: 10 },
  ],
};

/** Retorna a altura da superfície (chão, escada ou plataforma elevada) no ponto (x, z). */
export function getGroundHeight(x: number, z: number, map: GameMap = OFFICE_MAP): number {
  if (map.stairs) {
    for (const s of map.stairs) {
      const halfW = s.w / 2;
      const halfD = s.d / 2;
      if (Math.abs(x - s.x) <= halfW && Math.abs(z - s.z) <= halfD) {
        if (s.axis === "x") {
          const t = s.direction > 0 ? (x - (s.x - halfW)) / s.w : (s.x + halfW - x) / s.w;
          const clamped = Math.max(0, Math.min(1, t));
          return s.h0 + (s.h1 - s.h0) * clamped;
        } else {
          const t = s.direction > 0 ? (z - (s.z - halfD)) / s.d : (s.z + halfD - z) / s.d;
          const clamped = Math.max(0, Math.min(1, t));
          return s.h0 + (s.h1 - s.h0) * clamped;
        }
      }
    }
  }

  if (map.elevations) {
    for (const e of map.elevations) {
      if (Math.abs(x - e.x) <= e.w / 2 && Math.abs(z - e.z) <= e.d / 2) {
        return e.h;
      }
    }
  }

  return 0;
}
