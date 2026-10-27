import type { Vec2 } from "../types";

export type BoxKind = "wall" | "glass" | "desk" | "cabinet" | "counter" | "plant" | "partition" | "sofa";

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

export interface GameMap {
  width: number;
  depth: number;
  boxes: Box[];
  spawns: Vec2[];
  objectivePoints: Vec2[];
  rooms: Room[];
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

const deskCluster = (cx: number, cz: number): Box[] => [
  box(cx, cz - 0.8, 4, 1.4, 0.8, "desk"),
  box(cx, cz + 0.8, 4, 1.4, 0.8, "desk"),
  box(cx, cz, 4, 0.15, 1.5, "partition"),
];

const W = 64;
const D = 44;

export const OFFICE_MAP: GameMap = {
  width: W,
  depth: D,
  rooms: [
    { name: "Sala de reunião", x: -21, z: -15, w: 22, d: 14, floor: "#cfd8e3" },
    { name: "Copa", x: -1, z: -15, w: 18, d: 14, floor: "#e9dcc4" },
    { name: "Área de TI", x: 20, z: -15, w: 24, d: 14, floor: "#c9ccd6" },
    { name: "Recepção", x: -23, z: 7, w: 18, d: 30, floor: "#e4d6c6" },
    { name: "Área de mesas", x: 9, z: 7, w: 46, d: 30, floor: "#d9dde3" },
  ],
  boxes: [
    // perímetro
    box(0, -D / 2 - T / 2, W + 2 * T, T, H, "wall"),
    box(0, D / 2 + T / 2, W + 2 * T, T, H, "wall"),
    box(-W / 2 - T / 2, 0, T, D, H, "wall"),
    box(W / 2 + T / 2, 0, T, D, H, "wall"),
    // divisórias internas
    ...wallX(-8, -32, -10, [[-21, 4]], "glass"),
    ...wallX(-8, -10, 32, [[-1, 4], [20, 4]]),
    ...wallZ(-10, -22, -8, [[-15, 3]], "glass"),
    ...wallZ(8, -22, -8, [[-15, 3]]),
    ...wallZ(-14, -8, 22, [[2, 5], [15, 4]]),
    // sala de reunião
    box(-21, -15, 8, 3, 0.8, "desk"),
    box(-21, -21.5, 4, 0.4, 2, "cabinet"),
    box(-31, -21, 0.9, 0.9, 1.6, "plant"),
    box(-11, -21, 0.9, 0.9, 1.6, "plant"),
    // copa
    box(-1, -20.8, 10, 1.2, 1, "counter"),
    box(6.6, -20.8, 1.2, 1.2, 2.1, "cabinet"),
    box(-3, -13, 2.2, 2.2, 0.8, "desk"),
    box(3, -13, 2.2, 2.2, 0.8, "desk"),
    box(-8.6, -12, 1, 1.2, 2, "cabinet"),
    // área de TI
    box(14, -17, 1.2, 4, 2.2, "cabinet"),
    box(18, -17, 1.2, 4, 2.2, "cabinet"),
    box(26, -17, 1.2, 4, 2.2, "cabinet"),
    box(22, -11.5, 4, 1.4, 0.8, "desk"),
    // recepção
    box(-23, -1, 6, 1.4, 1.1, "counter"),
    box(-29, 10, 1.4, 4, 0.7, "sofa"),
    box(-23, 18, 5, 1.4, 0.7, "sofa"),
    box(-17, 20, 0.9, 0.9, 1.6, "plant"),
    box(-31, -6, 0.9, 0.9, 1.6, "plant"),
    // área de mesas
    ...deskCluster(-6, -1),
    ...deskCluster(4, -1),
    ...deskCluster(14, -1),
    ...deskCluster(24, -1),
    ...deskCluster(-6, 10),
    ...deskCluster(4, 10),
    ...deskCluster(14, 10),
    ...deskCluster(24, 10),
    box(31.2, 3, 1, 3, 2, "cabinet"),
    box(31.2, 16, 1, 3, 2, "cabinet"),
    box(0, 20.5, 0.9, 0.9, 1.6, "plant"),
    box(20, 20.5, 0.9, 0.9, 1.6, "plant"),
    box(-11.5, 19, 1.2, 1, 1.2, "cabinet"),
  ],
  spawns: [
    { x: -28, z: -12 },
    { x: -1, z: -10.5 },
    { x: 28, z: -10.5 },
    { x: -27, z: 3 },
    { x: -20, z: 14 },
    { x: -9, z: 5 },
    { x: 19, z: 4.5 },
    { x: 9, z: 19 },
  ],
  objectivePoints: [
    { x: 9, z: 4.5 },
    { x: -21, z: -11 },
    { x: 20, z: -14 },
    { x: -23, z: 6 },
    { x: -1, z: -17 },
  ],
};
