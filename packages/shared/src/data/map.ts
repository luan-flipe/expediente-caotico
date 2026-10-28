import type { Vec2 } from "../types";

export type BoxKind = "wall" | "glass" | "desk" | "cabinet" | "counter" | "plant" | "partition" | "sofa" | "door";

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

const W = 70;
const D = 44;

export const OFFICE_MAP: GameMap = {
  width: W,
  depth: D,
  rooms: [
    { name: "Sala executiva", x: -29, z: -15, w: 12, d: 14, floor: "#ede8df" },
    { name: "Sala de infra", x: -16, z: -15, w: 14, d: 14, floor: "#e5e3dc" },
    { name: "Banheiro", x: -5.5, z: -15, w: 7, d: 14, floor: "#dee2e6" },
    { name: "Sala do comandante", x: 1.5, z: -15, w: 7, d: 14, floor: "#e8e5dc" },
    { name: "Sala de reunião", x: 15, z: -15, w: 20, d: 14, floor: "#ded9cf" },
    { name: "Cozinha", x: -20, z: -1, w: 18, d: 14, floor: "#e6e1d8" },
    { name: "Corredor central", x: 0, z: 4.5, w: 50, d: 7, floor: "#eae6de" },
    { name: "Banheiro feminino", x: -9, z: -2, w: 10, d: 7.5, floor: "#e2e5e8" },
    { name: "Sala de reunião menor 1", x: 14, z: -3.8, w: 8, d: 3.5, floor: "#ded9cf" },
    { name: "Sala de reunião menor 2", x: 14, z: -0.2, w: 8, d: 3.5, floor: "#ded9cf" },
    { name: "Sala de gestão", x: -29.5, z: 15, w: 11, d: 14, floor: "#e5e2da" },
    { name: "Sala dos devs", x: -11, z: 15, w: 26, d: 14, floor: "#e2ded4" },
    { name: "Sala suporte", x: 13.5, z: 15, w: 23, d: 14, floor: "#e4dfd6" },
    { name: "Elevador aberto", x: 30, z: -1, w: 10, d: 14, floor: "#9ea6ae" },
    { name: "Elevador aberto", x: 30, z: 14, w: 10, d: 16, floor: "#9ea6ae" },
  ],
  boxes: [
    // --- Perímetro externo ---
    box(-5, -22, 60, T, H, "wall"),
    ...wallZ(-35, -22, 22, [[-4.5, 3.0]]),
    box(-5, 22, 60, T, H, "wall"),
    box(25, -15, T, 14, H, "wall"),
    box(30, -8, 10, T, H, "wall"),
    box(35, 7, T, 30, H, "wall"),
    box(30, 22, 10, T, H, "wall"),

    // --- Parede horizontal divisória das salas superiores (z = -8) ---
    ...wallX(-8, -35, 25, [
      [-27, 2.4],
      [-14, 2.4],
      [-4.5, 2.2],
      [1.0, 2.2],
      [10.0, 2.6],
    ]),

    // Divisórias verticais superiores (z de -22 a -8)
    box(-23, -15, T, 14, H, "wall"),
    box(-9, -15, T, 14, H, "wall"),
    box(-2, -15, T, 14, H, "wall"),
    box(5, -15, T, 14, H, "wall"),
    box(-5, -18.5, T, 7, H, "wall"),

    // --- Corredor central e Cozinha ---
    box(4, -1, 4, 3.6, 0.8, "desk"),

    // Bloco Central Saliente (Banheiro Feminino): z de -5.5 a 1.5, x de -14 a -4
    box(-9, -5.5, 10, T, H, "wall"),
    ...wallX(1.5, -14, -4, [[-9, 2.0]]),
    box(-14, -2, T, 7.5, H, "wall"),
    box(-4, -2, T, 7.5, H, "wall"),
    box(-5.5, -2, 1.2, 3.5, 1.0, "counter"),

    // Salas de Reunião Menores (x de 10 a 18, z de -5.5 a 1.5)
    box(14, -5.5, 8, T, H, "wall"),
    ...wallX(1.5, 10, 18, [[14, 2.2]]),
    box(10, -2, T, 7.5, H, "wall"),
    box(18, -2, T, 7.5, H, "wall"),
    box(14, -2, 8, T, H, "wall"),
    box(14, -3.8, 3.2, 1.4, 0.8, "desk"),
    box(14, -0.2, 3.2, 1.4, 0.8, "desk"),

    // Parede horizontal divisória inferior em z = 8
    ...wallX(8, -35, 25, [
      [-29, 2.6],
      [-16, 3.0],
      [8, 3.0],
    ]),

    // Divisórias verticais inferiores (z de 8 a 22)
    box(-24, 15, T, 14, H, "wall"),
    box(2, 15, T, 14, H, "wall"),

    // Divisória dos elevadores em x = 25 (de z = -8 a 22)
    ...wallZ(25, -8, 22, [
      [-1.5, 4.0],
      [13.5, 4.0],
    ], "glass"),
    box(30, 6, 10, T, H, "wall"),

    // =========================================================================
    // MOBILIÁRIO CONFORME A PLANTA
    // =========================================================================

    // Sala Superior Esquerda: Mesa em T
    box(-29, -15, 5, 1.4, 0.8, "desk"),
    box(-31, -15, 1.4, 3, 0.8, "desk"),

    // Sala de Infra: Bancada longa de computadores e rack
    box(-16, -10, 9, 1.4, 0.85, "counter"),
    box(-21, -19, 1.4, 3, 2.1, "cabinet"),

    // Sala do Comandante: Mesa executiva
    box(1.5, -15, 1.4, 4.5, 0.8, "desk"),

    // Sala de Reunião Grande: Mesa de 10 lugares
    box(15, -15, 12, 3.5, 0.8, "desk"),

    // Cozinha: Mesa redonda central e planta
    box(-20, -1, 3.2, 3.2, 0.8, "desk"),
    box(-20, -1, 1.0, 1.0, 1.5, "plant"),

    // Sala de Gestão: Mesa em T executiva
    box(-29, 15, 1.4, 5, 0.8, "desk"),
    box(-31, 15, 3, 1.4, 0.8, "desk"),

    // Sala dos Devs: Duas grandes ilhas verticais
    box(-19, 15, 2.2, 8, 0.8, "desk"),
    box(-19, 15, 0.15, 8, 1.4, "partition"),
    box(-11, 15, 2.2, 8, 0.8, "desk"),
    box(-11, 15, 0.15, 8, 1.4, "partition"),

    // Sala Suporte: Duas mesas verticais e uma horizontal
    box(6, 15, 2.0, 6, 0.8, "desk"),
    box(12, 15, 2.0, 6, 0.8, "desk"),
    box(19, 15, 6, 2.0, 0.8, "desk"),
  ],
  spawns: [
    { x: -28, z: 4.5 },   // Corredor / Cozinha
    { x: -16, z: -15 },   // Sala de infra
    { x: -1, z: -12 },    // Sala do comandante
    { x: 20, z: -11 },    // Sala de reunião grande
    { x: -29, z: 12 },    // Sala de gestão
    { x: -15, z: 15 },    // Sala dos devs
    { x: 10, z: 15 },     // Sala suporte
    { x: 30, z: -1.5 },   // Elevador aberto superior
  ],
  objectivePoints: [
    { x: 15, z: -11 },    // Sala de reunião grande
    { x: -25, z: 4.5 },   // Cozinha
    { x: -15, z: 10 },    // Sala dos devs
    { x: 1, z: -11 },     // Sala do comandante
    { x: 30, z: -1.5 },   // Hall dos elevadores
  ],
};
