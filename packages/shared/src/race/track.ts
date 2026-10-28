import type { Vec2 } from "../types";
import { RACE } from "./balance";

/**
 * Circuito Corporativo. Pontos de controle da linha central (sentido da corrida),
 * com a largura da pista em cada um. A curva final passa suavemente por todos.
 * Para trocar a pista (ex.: escritório real), edite só esta lista e as zonas abaixo.
 */
interface Ctrl {
  x: number;
  z: number;
  w: number;
}

const CTRL: Ctrl[] = [
  { x: -10, z: -36, w: 12 }, // 0 recepção, linha de chegada
  { x: 10, z: -36, w: 12 },
  { x: 30, z: -36, w: 12 }, // 2 corredor longo
  { x: 44, z: -31, w: 11 },
  { x: 50, z: -20, w: 10 },
  { x: 45, z: -9, w: 9 }, // 5 ilhas de mesas (chicane)
  { x: 51, z: 1, w: 9 },
  { x: 45, z: 11, w: 9 },
  { x: 50, z: 22, w: 10 },
  { x: 47, z: 33, w: 10 }, // 9 copa, curva fechada no balcão
  { x: 37, z: 38, w: 10 },
  { x: 28, z: 31, w: 10 },
  { x: 23, z: 19, w: 10 },
  { x: 11, z: 13, w: 11 }, // 13 sala de reunião, curva larga
  { x: -1, z: 19, w: 11 },
  { x: -6, z: 31, w: 11 },
  { x: -18, z: 37, w: 10 },
  { x: -33, z: 33, w: 9 }, // 17 TI, zigue-zague entre racks
  { x: -45, z: 24, w: 9 },
  { x: -38, z: 13, w: 9 },
  { x: -47, z: 2, w: 9 },
  { x: -40, z: -9, w: 9 },
  { x: -46, z: -22, w: 10 },
  { x: -36, z: -33, w: 11 },
  { x: -22, z: -36, w: 12 },
];

/** Nomes dos ambientes por ponto de controle inicial (para HUD e decoração). */
export const TRACK_ROOMS: { name: string; ctrl: number }[] = [
  { name: "Recepção", ctrl: 0 },
  { name: "Corredor", ctrl: 2 },
  { name: "Ilhas de mesas", ctrl: 5 },
  { name: "Copa", ctrl: 9 },
  { name: "Sala de reunião", ctrl: 13 },
  { name: "TI", ctrl: 17 },
  { name: "Recepção", ctrl: 23 },
];

/** Carpete na borda interna destas curvas (índices de controle). */
const CARPET_CTRL: [number, number][] = [
  [3, 5],
  [9, 12],
  [13, 16],
];
/** Fileiras de caixas de item (índice de controle, pode ser fracionário). */
const BOX_CTRL = [1.5, 8, 12.5, 21];
/** Fileiras de xícaras de café (moedas) colecionáveis ao longo do traçado. */
const CUP_CTRL = [2.5, 7.5, 14.5, 20.5];

const STEP = 5;
const DENSE = 24;

export interface CarpetZone {
  from: number;
  to: number;
  side: -1 | 1;
}

export interface Track {
  points: Vec2[];
  widths: number[];
  /** Distância ao longo da linha central de cada ponto (s). */
  cum: number[];
  spacing: number;
  length: number;
  ctrlS: number[];
  carpet: CarpetZone[];
  boxRows: number[];
  cupRows: number[];
}

export interface TrackProgress {
  s: number;
  seg: number;
  /** Distância lateral com sinal (positivo = lado +1). */
  lateral: number;
  dist: number;
  halfWidth: number;
  closest: Vec2;
}

function catmull(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}

const wrapIdx = (i: number, n: number) => ((i % n) + n) % n;

/** Normal do lado +1 para a direção (tx, tz). */
export const sideNormal = (tx: number, tz: number): Vec2 => ({ x: tz, z: -tx });

function buildTrack(ctrl: Ctrl[]): Track {
  const n = ctrl.length;
  const dense: { x: number; z: number; w: number }[] = [];
  const ctrlDense: number[] = [];
  for (let i = 0; i < n; i++) {
    const [a, b, c, d] = [ctrl[wrapIdx(i - 1, n)], ctrl[i], ctrl[wrapIdx(i + 1, n)], ctrl[wrapIdx(i + 2, n)]];
    ctrlDense.push(dense.length);
    for (let k = 0; k < DENSE; k++) {
      const t = k / DENSE;
      dense.push({ x: catmull(a.x, b.x, c.x, d.x, t), z: catmull(a.z, b.z, c.z, d.z, t), w: b.w + (c.w - b.w) * t });
    }
  }
  const dcum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const p = dense[i - 1];
    const q = dense[i % dense.length];
    dcum.push(dcum[i - 1] + Math.hypot(q.x - p.x, q.z - p.z));
  }
  const length = dcum[dense.length];
  const count = Math.round(length / STEP);
  const spacing = length / count;
  const points: Vec2[] = [];
  const widths: number[] = [];
  const cum: number[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const s = k * spacing;
    while (dcum[j + 1] < s) j++;
    const t = (s - dcum[j]) / (dcum[j + 1] - dcum[j] || 1);
    const p = dense[j];
    const q = dense[(j + 1) % dense.length];
    points.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
    widths.push(p.w + (q.w - p.w) * t);
    cum.push(s);
  }
  const ctrlS = ctrlDense.map((d) => dcum[d]);
  const sAtCtrl = (c: number) => {
    const i = Math.floor(c);
    const f = c - i;
    const a = ctrlS[wrapIdx(i, n)];
    let b = ctrlS[wrapIdx(i + 1, n)];
    if (b < a) b += length;
    return (a + (b - a) * f) % length;
  };
  const track: Track = {
    points,
    widths,
    cum,
    spacing,
    length,
    ctrlS,
    carpet: [],
    boxRows: BOX_CTRL.map(sAtCtrl),
    cupRows: CUP_CTRL.map(sAtCtrl),
  };
  track.carpet = CARPET_CTRL.map(([from, to]) => {
    const s0 = sAtCtrl(from);
    const s1 = sAtCtrl(to);
    const h0 = pointAt(track, s0).heading;
    const h1 = pointAt(track, s1).heading;
    const turn = Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0));
    // heading crescente gira para o lado +1, que é o lado interno da curva
    return { from: s0, to: s1, side: turn > 0 ? 1 : -1 } as CarpetZone;
  });
  return track;
}

/** Ponto e direção da linha central na distância s. */
export function pointAt(track: Track, s: number): { pos: Vec2; heading: number; halfWidth: number } {
  const L = track.length;
  const ss = ((s % L) + L) % L;
  const n = track.points.length;
  const i = Math.min(n - 1, Math.floor(ss / track.spacing));
  const t = (ss - track.cum[i]) / track.spacing;
  const p = track.points[i];
  const q = track.points[(i + 1) % n];
  const w = track.widths[i] + (track.widths[(i + 1) % n] - track.widths[i]) * t;
  return { pos: { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t }, heading: Math.atan2(q.x - p.x, q.z - p.z), halfWidth: w / 2 };
}

/** Projeção de uma posição na linha central (segmento mais próximo). */
export function progressOf(track: Track, pos: Vec2): TrackProgress {
  const n = track.points.length;
  let best: TrackProgress | null = null;
  for (let i = 0; i < n; i++) {
    const p = track.points[i];
    const q = track.points[(i + 1) % n];
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const len2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((pos.x - p.x) * dx + (pos.z - p.z) * dz) / len2));
    const cx = p.x + dx * t;
    const cz = p.z + dz * t;
    const dist = Math.hypot(pos.x - cx, pos.z - cz);
    if (best && dist >= best.dist) continue;
    const len = Math.sqrt(len2);
    const nrm = sideNormal(dx / len, dz / len);
    best = {
      s: (track.cum[i] + t * track.spacing) % track.length,
      seg: i,
      lateral: (pos.x - cx) * nrm.x + (pos.z - cz) * nrm.z,
      dist,
      halfWidth: (track.widths[i] + (track.widths[(i + 1) % n] - track.widths[i]) * t) / 2,
      closest: { x: cx, z: cz },
    };
  }
  return best!;
}

/** Mantém um círculo de raio r dentro da pista. Devolve a posição corrigida e se bateu na parede. */
export function clampToTrack(track: Track, pos: Vec2, r: number): { pos: Vec2; hit: boolean; normal: Vec2; progress: TrackProgress } {
  const pr = progressOf(track, pos);
  const limit = pr.halfWidth - r;
  if (pr.dist <= limit || pr.dist < 1e-6) return { pos, hit: false, normal: { x: 0, z: 0 }, progress: pr };
  const nx = (pos.x - pr.closest.x) / pr.dist;
  const nz = (pos.z - pr.closest.z) / pr.dist;
  return {
    pos: { x: pr.closest.x + nx * limit, z: pr.closest.z + nz * limit },
    hit: true,
    normal: { x: nx, z: nz },
    progress: { ...pr, dist: limit, lateral: Math.sign(pr.lateral) * limit },
  };
}

/** Distância com sinal de a até b ao longo da pista, em (-L/2, L/2]. */
export function deltaS(track: Track, from: number, to: number): number {
  const L = track.length;
  let d = (to - from) % L;
  if (d > L / 2) d -= L;
  if (d <= -L / 2) d += L;
  return d;
}

export function inCarpet(track: Track, pr: TrackProgress): boolean {
  for (const c of track.carpet) {
    const inside = c.from <= c.to ? pr.s >= c.from && pr.s <= c.to : pr.s >= c.from || pr.s <= c.to;
    if (inside && pr.lateral * c.side > pr.halfWidth - RACE.carpetWidth) return true;
  }
  return false;
}

/** Bordas esquerda/direita da pista, para desenhar paredes e minimapa. */
export function trackEdges(track: Track): { plus: Vec2[]; minus: Vec2[] } {
  const n = track.points.length;
  const plus: Vec2[] = [];
  const minus: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = track.points[wrapIdx(i - 1, n)];
    const b = track.points[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const nrm = sideNormal((b.x - a.x) / len, (b.z - a.z) / len);
    const hw = track.widths[i] / 2;
    const p = track.points[i];
    plus.push({ x: p.x + nrm.x * hw, z: p.z + nrm.z * hw });
    minus.push({ x: p.x - nrm.x * hw, z: p.z - nrm.z * hw });
  }
  return { plus, minus };
}

/** Valores de s dos checkpoints; o 0 é a linha de chegada. */
export function checkpoints(track: Track): number[] {
  const cps: number[] = [];
  for (let s = 0; s < track.length - RACE.checkpointEvery / 2; s += RACE.checkpointEvery) cps.push(s);
  return cps;
}

/** Posições de largada atrás da linha, em fileiras de 2. */
export function gridSlots(track: Track, n: number): { pos: Vec2; heading: number }[] {
  const out: { pos: Vec2; heading: number }[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 2);
    const side = i % 2 === 0 ? 1 : -1;
    const at = pointAt(track, track.length - 5 - row * 4 - (i % 2) * 1.5);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    out.push({ pos: { x: at.pos.x + nrm.x * 2.3 * side, z: at.pos.z + nrm.z * 2.3 * side }, heading: at.heading });
  }
  return out;
}

/** Posições das caixas de item: 4 por fileira, atravessando a pista. */
export function boxSpots(track: Track): Vec2[] {
  const out: Vec2[] = [];
  for (const s of track.boxRows) {
    const at = pointAt(track, s);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    for (const f of [-0.6, -0.2, 0.2, 0.6]) {
      const off = f * at.halfWidth;
      out.push({ x: at.pos.x + nrm.x * off, z: at.pos.z + nrm.z * off });
    }
  }
  return out;
}

/** Posições das xícaras de café colecionáveis. */
export function cupSpots(track: Track): Vec2[] {
  const out: Vec2[] = [];
  for (const s of track.cupRows ?? []) {
    const at = pointAt(track, s);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    for (const f of [-0.28, 0.28]) {
      const off = f * at.halfWidth;
      out.push({ x: at.pos.x + nrm.x * off, z: at.pos.z + nrm.z * off });
    }
  }
  return out;
}

/** Quanto a pista vira (rad, com sinal) entre s e s + ahead. */
export function turnAhead(track: Track, s: number, ahead: number): number {
  const h0 = pointAt(track, s).heading;
  const h1 = pointAt(track, s + ahead).heading;
  return Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0));
}

export const TRACK: Track = buildTrack(CTRL);
export const TRACK_LENGTH = TRACK.length;
