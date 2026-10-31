import type { Field } from "@ec/shared";

/** Bordas do gramado do mapa (nó do plano do gramado, medido no .glb): um pouco além das linhas grandes de 97 x 60,7 m. */
export const GRASS_EDGE = { halfL: 52.6, halfW: 34.3 } as const;

export interface Rect {
  /** Centro. */
  x: number;
  z: number;
  /** Tamanho em x e z. */
  w: number;
  d: number;
}

/**
 * Moldura que cobre o gramado do mapa fora do campo jogável: faixas longas (com os cantos)
 * em cima e embaixo, e faixas de fundo só na largura do campo. Vazia se o campo ocupa tudo.
 */
export function frameRects(f: Field, edge: { halfL: number; halfW: number } = GRASS_EDGE): Rect[] {
  const out: Rect[] = [];
  const bandZ = edge.halfW - f.halfW;
  const bandX = edge.halfL - f.halfL;
  if (bandZ > 0.01) {
    for (const s of [-1, 1]) out.push({ x: 0, z: (s * (edge.halfW + f.halfW)) / 2, w: edge.halfL * 2, d: bandZ });
  }
  if (bandX > 0.01) {
    for (const s of [-1, 1]) out.push({ x: (s * (edge.halfL + f.halfL)) / 2, z: 0, w: bandX, d: f.halfW * 2 });
  }
  return out;
}

export const BOARD_LEN = 4;
export const BOARD_GAP = 0.12;
export const BOARD_H = 0.9;
/** Afastamento da linha lateral e da linha de fundo (o fundo fica mais longe por causa das redes dos gols). */
export const BOARD_OFF_SIDE = 1.8;
export const BOARD_OFF_END = 3.2;
/** Inclinação para trás, como placa de LED. */
export const BOARD_TILT = 0.2;
/** Vão livre atrás de cada gol, além da meia boca do gol. */
export const GOAL_GAP = 3;

export interface BoardSlot {
  x: number;
  z: number;
  /** Giro em y: a face aponta para o campo. */
  yaw: number;
}

/** Quantas placas cabem em um trecho de `len` metros e a folga para centralizar. */
export function boardsFit(len: number): number {
  return len < BOARD_LEN ? 0 : Math.floor((len + BOARD_GAP) / (BOARD_LEN + BOARD_GAP));
}

/** Posições das placas: laterais inteiras e fundos com vão atrás dos gols. */
export function boardSlots(f: Field): BoardSlot[] {
  const slots: BoardSlot[] = [];
  const run = (len: number, center: number, make: (c: number) => BoardSlot) => {
    const n = boardsFit(len);
    const span = n * BOARD_LEN + (n - 1) * BOARD_GAP;
    for (let i = 0; i < n; i++) slots.push(make(center - span / 2 + BOARD_LEN / 2 + i * (BOARD_LEN + BOARD_GAP)));
  };
  const sideLen = f.halfL * 2;
  for (const s of [-1, 1]) {
    run(sideLen, 0, (x) => ({ x, z: s * (f.halfW + BOARD_OFF_SIDE), yaw: s < 0 ? 0 : Math.PI }));
  }
  // fundo: dois trechos por lado, entre o vão do gol e o canto
  const gap = f.goalHalfW + GOAL_GAP;
  const end = f.halfW + BOARD_OFF_SIDE;
  const len = end - gap;
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      run(len, t * (gap + len / 2), (z) => ({ x: s * (f.halfL + BOARD_OFF_END), z, yaw: s < 0 ? Math.PI / 2 : -Math.PI / 2 }));
    }
  }
  return slots;
}

/** Anunciante da placa `slot` no passo `step` do rodízio. */
export function adIndex(slot: number, step: number, n: number): number {
  if (n <= 0) return 0;
  return (((slot + step) % n) + n) % n;
}

/** Passo do rodízio no instante `t` (segundos). */
export function adStep(t: number, everyS: number): number {
  return Math.max(0, Math.floor(t / everyS));
}

export type CrewKind = "ombro" | "tripe" | "boom";

export interface CrewSpot {
  x: number;
  z: number;
  kind: CrewKind;
  /** Giro em y de repouso: olhando para o centro do campo. */
  yaw: number;
}

/** Folga atrás das placas laterais para a equipe de filmagem. */
export const CREW_BEHIND = 1;

/** Equipe de filmagem atrás das placas das laterais, fora das linhas e do caminho das placas. */
export function crewSpots(f: Field): CrewSpot[] {
  const z = f.halfW + BOARD_OFF_SIDE + CREW_BEHIND;
  const at = (fx: number, s: -1 | 1, kind: CrewKind): CrewSpot => ({ x: fx * f.halfL, z: s * z, kind, yaw: s < 0 ? 0 : Math.PI });
  return [at(-0.5, -1, "ombro"), at(0.3, -1, "tripe"), at(0.55, 1, "ombro"), at(-0.2, 1, "tripe"), at(-0.8, 1, "boom")];
}
