import type { Vec2 } from "../types";
import { RACE } from "./balance";

/**
 * Pistas do Rally. Cada uma é uma lista de pontos de controle da linha central (sentido da corrida),
 * com a largura da pista em cada um; a curva final passa suavemente por todos. Paredes, checkpoints,
 * carpete, caixas e grid saem daí. Para criar ou mudar uma pista, edite só a definição dela abaixo
 * (o teste race-track.test.ts avisa se ficou curta, longa ou encostando nela mesma).
 */
interface Ctrl {
  x: number;
  z: number;
  w: number;
}

/** Circuito Corporativo: a pista original, com o escritório inteiro. */
const CORPORATIVO: Ctrl[] = [
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

/** Ambiente por ponto de controle inicial (para HUD e decoração). */
export interface TrackRoom {
  name: string;
  ctrl: number;
}

const CORPORATIVO_ROOMS: TrackRoom[] = [
  { name: "Recepção", ctrl: 0 },
  { name: "Corredor", ctrl: 2 },
  { name: "Ilhas de mesas", ctrl: 5 },
  { name: "Copa", ctrl: 9 },
  { name: "Sala de reunião", ctrl: 13 },
  { name: "TI", ctrl: 17 },
  { name: "Recepção", ctrl: 23 },
];

/** Carpete na borda interna destas curvas (índices de controle). */
const CORPORATIVO_CARPET: [number, number][] = [
  [3, 5],
  [9, 12],
  [13, 16],
];
/** Fileiras de caixas de item (índice de controle, pode ser fracionário). */
const CORPORATIVO_BOXES = [1.5, 8, 12.5, 21];
/** Fileiras de xícaras de café colecionáveis (índice de controle), longe das caixas e do carpete. */
const CORPORATIVO_CUPS = [2.5, 7.5, 14.5, 20.5];

/** Estacionamento: pista larga e rápida, curvas abertas entre vagas e pilares. */
const ESTACIONAMENTO: Ctrl[] = [
  { x: -36, z: -34, w: 13 }, // 0 cancela, linha de chegada
  { x: -10, z: -36, w: 13 },
  { x: 16, z: -36, w: 13 }, // 2 reta das vagas
  { x: 40, z: -32, w: 13 },
  { x: 55, z: -18, w: 13 }, // 4 curva aberta da rampa
  { x: 57, z: 2, w: 13 },
  { x: 48, z: 20, w: 12 },
  { x: 30, z: 26, w: 12 }, // 7 pilares, S rápido
  { x: 12, z: 16, w: 12 },
  { x: -6, z: 12, w: 12 },
  { x: -22, z: 22, w: 12 },
  { x: -36, z: 34, w: 13 }, // 11 vagas do fundo
  { x: -54, z: 28, w: 13 },
  { x: -62, z: 8, w: 13 },
  { x: -58, z: -16, w: 13 },
];

const ESTACIONAMENTO_ROOMS: TrackRoom[] = [
  { name: "Cancela", ctrl: 0 },
  { name: "Vagas", ctrl: 2 },
  { name: "Rampa", ctrl: 4 },
  { name: "Pilares", ctrl: 7 },
  { name: "Vagas do fundo", ctrl: 11 },
  { name: "Cancela", ctrl: 14 },
];
const ESTACIONAMENTO_CARPET: [number, number][] = [[12, 14]];
const ESTACIONAMENTO_BOXES = [1.5, 5, 8.5, 11.2];
const ESTACIONAMENTO_CUPS = [3, 6.5, 10, 14.3];

/** Copa: curta e travada, entre mesas, geladeira e máquina de café. */
const COPA: Ctrl[] = [
  { x: -14, z: -20, w: 10 }, // 0 balcão, linha de chegada
  { x: 4, z: -20, w: 10 },
  { x: 18, z: -16, w: 9 }, // 2 mesas
  { x: 22, z: -4, w: 9 },
  { x: 12, z: 3, w: 9 },
  { x: 8, z: 12, w: 9 },
  { x: 16, z: 22, w: 9 }, // 6 geladeira, grampo
  { x: 4, z: 30, w: 9 },
  { x: -10, z: 24, w: 9 },
  { x: -14, z: 12, w: 9 }, // 9 cafeteira
  { x: -24, z: 4, w: 9 },
  { x: -26, z: -10, w: 10 },
];

const COPA_ROOMS: TrackRoom[] = [
  { name: "Balcão", ctrl: 0 },
  { name: "Mesas", ctrl: 2 },
  { name: "Geladeira", ctrl: 6 },
  { name: "Cafeteira", ctrl: 9 },
  { name: "Balcão", ctrl: 11 },
];
const COPA_CARPET: [number, number][] = [[6, 8]];
const COPA_BOXES = [1.5, 5, 9];
const COPA_CUPS = [3, 8.5, 10.5];

/**
 * Atalho: segundo corredor que sai da pista principal no índice de controle from e volta nela em to
 * (podem ser fracionários), passando pelos pontos de ctrl. Mais curto e mais estreito, sem caixas.
 */
interface BranchDef {
  from: number;
  to: number;
  ctrl: Ctrl[];
}

const CORPORATIVO_BRANCH: BranchDef = { from: 2.2, to: 5, ctrl: [{ x: 35, z: -24, w: 5 }] };
const ESTACIONAMENTO_BRANCH: BranchDef = { from: 2.5, to: 5.5, ctrl: [{ x: 42, z: -10, w: 7 }] };
const COPA_BRANCH: BranchDef = { from: 8.7, to: 11.4, ctrl: [{ x: -12, z: -2, w: 5 }] };

/**
 * Rampa: o chão sobe linear de 0 a height entre sFrom e sTo; quem sai do topo rápido decola. gap é um
 * vão depois dela (cair ali é como a reposição). Medidas em s da principal (path -1) ou no bs do atalho.
 */
export interface Ramp {
  path: number;
  sFrom: number;
  sTo: number;
  height: number;
  gap?: { sFrom: number; sTo: number };
}

/** Rampa definida por fração: ctrl na principal, ou fração do comprimento do atalho (path >= 0). */
interface RampDef {
  path: number;
  at: number;
  len: number;
  height: number;
  gap?: [number, number];
}

/** Corporativo: no meio do corredor reto da largada, antes das caixas e da boca do atalho. Sem vão. */
const CORPORATIVO_RAMP: RampDef = { path: -1, at: 0.4, len: 6, height: 1.6 };
/** Estacionamento: rampa da garagem no atalho, pulando o fosso do subsolo. */
const ESTACIONAMENTO_RAMP: RampDef = { path: 0, at: 0.15, len: 6, height: 2.2, gap: [0.36, 0.47] };

const STEP = 5;
/** Nas bocas, só troca de corredor quando o outro centro está tanto mais perto (m). */
const PATH_SWITCH_MARGIN = 0.3;
/** Atalho é curto e curvo: amostrado mais fino que a principal. */
const BRANCH_STEP = 2;
const DENSE = 24;

export interface CarpetZone {
  from: number;
  to: number;
  side: -1 | 1;
}

export interface Track {
  id: TrackId;
  name: string;
  rooms: TrackRoom[];
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
  /** Atalhos (vazio nas pistas sem). */
  branches: Branch[];
  /** Rampas (vazio nas pistas sem). */
  ramps: Ramp[];
}

/** Corredor do atalho: linha aberta de sFrom a sTo (s da pista principal), com bs próprio em cum. */
export interface Branch {
  sFrom: number;
  sTo: number;
  points: Vec2[];
  widths: number[];
  cum: number[];
  spacing: number;
  length: number;
  /** s de cada ponto, a partir de sFrom (crescente, de 0 até a distância entre as bocas). */
  sOff: number[];
}

export interface TrackProgress {
  /** Distância ao longo da pista principal; no atalho, convertida proporcionalmente. */
  s: number;
  /** -1 = pista principal; 0.. = índice do atalho. */
  path: number;
  /** Direção do caminho neste ponto. */
  heading: number;
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

interface TrackDef {
  id: TrackId;
  name: string;
  ctrl: Ctrl[];
  rooms: TrackRoom[];
  carpet: [number, number][];
  boxes: number[];
  cups: number[];
  branch?: BranchDef;
  ramp?: RampDef;
}

/** Curva aberta do atalho, reamostrada a cada STEP, com tangentes iguais às da principal nas pontas. */
function buildBranch(track: Track, def: BranchDef, sAtCtrl: (c: number) => number): Branch {
  const sFrom = sAtCtrl(def.from);
  const sTo = sAtCtrl(def.to);
  const a = pointAt(track, sFrom);
  const b = pointAt(track, sTo);
  const w0 = def.ctrl[0].w;
  const w1 = def.ctrl[def.ctrl.length - 1].w;
  const pts: Ctrl[] = [
    { x: a.pos.x - Math.sin(a.heading) * 8, z: a.pos.z - Math.cos(a.heading) * 8, w: w0 },
    { x: a.pos.x, z: a.pos.z, w: w0 },
    ...def.ctrl,
    { x: b.pos.x, z: b.pos.z, w: w1 },
    { x: b.pos.x + Math.sin(b.heading) * 8, z: b.pos.z + Math.cos(b.heading) * 8, w: w1 },
  ];
  const dense: Ctrl[] = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    for (let k = 0; k < DENSE; k++) {
      const t = k / DENSE;
      dense.push({ x: catmull(p0.x, p1.x, p2.x, p3.x, t), z: catmull(p0.z, p1.z, p2.z, p3.z, t), w: p1.w + (p2.w - p1.w) * t });
    }
  }
  dense.push(pts[pts.length - 2]);
  const dcum = [0];
  for (let i = 1; i < dense.length; i++) dcum.push(dcum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z));
  const length = dcum[dcum.length - 1];
  const count = Math.max(2, Math.round(length / BRANCH_STEP));
  const spacing = length / count;
  const points: Vec2[] = [];
  const widths: number[] = [];
  const cum: number[] = [];
  let j = 0;
  for (let k = 0; k <= count; k++) {
    const s = Math.min(length, k * spacing);
    while (j < dense.length - 2 && dcum[j + 1] < s) j++;
    const t = Math.min(1, (s - dcum[j]) / (dcum[j + 1] - dcum[j] || 1));
    const p = dense[j];
    const q = dense[j + 1];
    points.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
    widths.push(p.w + (q.w - p.w) * t);
    cum.push(s);
  }
  // s de cada ponto do atalho, medido a partir de sFrom. Nas bocas, enquanto o atalho ainda está dentro
  // da principal, vale a projeção na principal (trocar de corredor ali não dá salto de s); no miolo, linear.
  const span = deltaS(track, sFrom, sTo);
  const onMain = points.map((p, k) => {
    const pr = project(track.points, track.widths, track.cum, track.spacing, true, p);
    return { off: Math.max(0, Math.min(span, deltaS(track, sFrom, pr.s))), inside: pr.dist + widths[k] / 2 < pr.halfWidth };
  });
  let a0 = 0;
  while (a0 + 1 < points.length && onMain[a0 + 1].inside) a0++;
  let b0 = points.length - 1;
  while (b0 - 1 > a0 && onMain[b0 - 1].inside) b0--;
  const sOff = points.map((_, k) => {
    if (k <= a0) return onMain[k].off;
    if (k >= b0) return onMain[k].off;
    const f = (cum[k] - cum[a0]) / (cum[b0] - cum[a0]);
    return onMain[a0].off + (onMain[b0].off - onMain[a0].off) * f;
  });
  for (let k = 1; k < sOff.length; k++) sOff[k] = Math.max(sOff[k], sOff[k - 1]);
  return { sFrom, sTo, points, widths, cum, spacing, length, sOff };
}

function buildTrack(def: TrackDef): Track {
  const ctrl = def.ctrl;
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
  const track: Track = { id: def.id, name: def.name, rooms: def.rooms, points, widths, cum, spacing, length, ctrlS, carpet: [], boxRows: def.boxes.map(sAtCtrl), cupRows: def.cups.map(sAtCtrl), branches: [], ramps: [] };
  if (def.branch) track.branches.push(buildBranch(track, def.branch, sAtCtrl));
  if (def.ramp) {
    const r = def.ramp;
    const blen = track.branches[r.path]?.length;
    const sFrom = blen ? r.at * blen : sAtCtrl(r.at);
    const ramp: Ramp = { path: r.path, sFrom, sTo: sFrom + r.len, height: r.height };
    if (r.gap && blen) ramp.gap = { sFrom: r.gap[0] * blen, sTo: r.gap[1] * blen };
    track.ramps.push(ramp);
  }
  track.carpet = def.carpet.map(([from, to]) => {
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

/** Projeção numa polilinha (fechada ou aberta); s é o bs da própria linha. */
function project(pts: Vec2[], widths: number[], cum: number[], spacing: number, closed: boolean, pos: Vec2): Omit<TrackProgress, "path"> {
  const n = pts.length;
  const segs = closed ? n : n - 1;
  let best: Omit<TrackProgress, "path"> | null = null;
  for (let i = 0; i < segs; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
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
      s: cum[i] + t * spacing,
      heading: Math.atan2(dx, dz),
      seg: i,
      lateral: (pos.x - cx) * nrm.x + (pos.z - cz) * nrm.z,
      dist,
      halfWidth: (widths[i] + (widths[(i + 1) % n] - widths[i]) * t) / 2,
      closest: { x: cx, z: cz },
    };
  }
  return best!;
}

/** Projeção em cada corredor: a principal (path -1) e os atalhos, com s já na escala da principal. */
function allProgress(track: Track, pos: Vec2): TrackProgress[] {
  const main = project(track.points, track.widths, track.cum, track.spacing, true, pos);
  const out: TrackProgress[] = [{ ...main, s: main.s % track.length, path: -1 }];
  track.branches.forEach((b, i) => {
    const pr = project(b.points, b.widths, b.cum, b.spacing, false, pos);
    out.push({ ...pr, s: branchS(track, b, pr.seg, (pr.s - b.cum[pr.seg]) / b.spacing), path: i });
  });
  return out;
}

/** s da principal no segmento seg do atalho, fração t. */
function branchS(track: Track, b: Branch, seg: number, t: number): number {
  const L = track.length;
  const s = b.sFrom + b.sOff[seg] + (b.sOff[seg + 1] - b.sOff[seg]) * t;
  return ((s % L) + L) % L;
}

/**
 * Escolhe o corredor: vale aquele em que a posição cabe (com folga margin). Nas bocas, onde cabe nos
 * dois, fica com prefer (o caminho do tick anterior; sem ele, a principal). Fora de todos, o que
 * precisa do menor empurrão.
 */
function pickProgress(track: Track, pos: Vec2, margin: number, prefer = -1): TrackProgress {
  const all = allProgress(track, pos);
  if (all.length === 1) return all[0];
  const inside = all.filter((p) => p.dist <= p.halfWidth - margin);
  if (inside.length) {
    const best = inside.reduce((a, b) => (b.dist < a.dist ? b : a));
    const pref = inside.find((p) => p.path === prefer);
    // troca só com folga clara, senão quem para na boca alternaria de caminho a cada tick
    const pick = pref && pref.dist <= best.dist + PATH_SWITCH_MARGIN ? pref : best;
    const main = inside.find((p) => p.path === -1);
    const branch = inside.find((p) => p.path >= 0);
    if (!main || !branch) return pick;
    // na faixa comum o s passa aos poucos do da principal (na borda do atalho) para o do atalho (na
    // borda da principal): trocar de corredor não dá salto de s, que faria perder checkpoint
    const inBranch = 1 - branch.dist / branch.halfWidth;
    const inMain = 1 - main.dist / main.halfWidth;
    const f = inBranch / (inBranch + inMain || 1);
    return { ...pick, s: (main.s + f * deltaS(track, main.s, branch.s) + track.length) % track.length };
  }
  return all.reduce((a, b) => (b.dist - b.halfWidth < a.dist - a.halfWidth ? b : a));
}

/** Projeção de uma posição na linha central do corredor em que ela está (prefer = caminho anterior). */
export function progressOf(track: Track, pos: Vec2, prefer?: number): TrackProgress {
  return pickProgress(track, pos, 0, prefer);
}

/** Ponto e direção do caminho path (-1 = principal) no s da principal; no atalho, s fica entre as bocas. */
export function branchPointAt(track: Track, path: number, s: number): { pos: Vec2; heading: number; halfWidth: number } {
  const b = track.branches[path];
  if (!b) return pointAt(track, s);
  const n = b.points.length;
  const off = Math.max(0, Math.min(b.sOff[n - 1], deltaS(track, b.sFrom, s)));
  let i = 0;
  while (i < n - 2 && b.sOff[i + 1] < off) i++;
  const t = Math.min(1, (off - b.sOff[i]) / (b.sOff[i + 1] - b.sOff[i] || 1));
  const p = b.points[i];
  const q = b.points[i + 1];
  const w = b.widths[i] + (b.widths[i + 1] - b.widths[i]) * t;
  return { pos: { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t }, heading: Math.atan2(q.x - p.x, q.z - p.z), halfWidth: w / 2 };
}

/**
 * Ponto a ahead metros à frente de pr seguindo a rota route (-1 = principal), medidos no próprio
 * caminho: entra no atalho na boca e sai dele de volta na principal. Usado pelos bots.
 */
export function routeAhead(track: Track, pr: TrackProgress, route: number, ahead: number): { pos: Vec2; heading: number; halfWidth: number } {
  const b = track.branches[route];
  if (!b) return pointAt(track, pr.s + ahead);
  let bs: number;
  if (pr.path === route) {
    const bp = project(b.points, b.widths, b.cum, b.spacing, false, pr.closest);
    bs = bp.s + ahead;
  } else {
    const toMouth = deltaS(track, pr.s, b.sFrom);
    // um pouco depois da boca ainda dá para entrar (a cadeira continua na faixa comum)
    if (toMouth < -6 || toMouth >= ahead) return pointAt(track, pr.s + ahead);
    bs = ahead - toMouth;
  }
  if (bs >= b.length) return pointAt(track, b.sTo + bs - b.length);
  const n = b.points.length;
  const i = Math.min(n - 2, Math.floor(bs / b.spacing));
  const t = Math.min(1, (bs - b.cum[i]) / b.spacing);
  const p = b.points[i];
  const q = b.points[i + 1];
  return { pos: { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t }, heading: Math.atan2(q.x - p.x, q.z - p.z), halfWidth: (b.widths[i] + (b.widths[i + 1] - b.widths[i]) * t) / 2 };
}

/** Mantém um círculo de raio r dentro da pista. Devolve a posição corrigida e se bateu na parede. */
export function clampToTrack(track: Track, pos: Vec2, r: number, prefer?: number): { pos: Vec2; hit: boolean; normal: Vec2; progress: TrackProgress } {
  const pr = pickProgress(track, pos, r, prefer);
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

/** Altura do chão sob a posição projetada em pr (rampa) e se ali é vão. */
export function groundAt(track: Track, pr: TrackProgress): { y: number; gap: boolean } {
  for (const r of track.ramps) {
    if (r.path !== pr.path) continue;
    const b = track.branches[r.path];
    // no atalho a rampa é medida no bs dele; na principal, no s
    const s = b ? project(b.points, b.widths, b.cum, b.spacing, false, pr.closest).s : r.sFrom + deltaS(track, r.sFrom, pr.s);
    if (s >= r.sFrom && s <= r.sTo) return { y: (r.height * (s - r.sFrom)) / (r.sTo - r.sFrom), gap: false };
    if (r.gap && s >= r.gap.sFrom && s <= r.gap.sTo) return { y: 0, gap: true };
  }
  return { y: 0, gap: false };
}

export function inCarpet(track: Track, pr: TrackProgress): boolean {
  if (pr.path >= 0) return false;
  for (const c of track.carpet) {
    const inside = c.from <= c.to ? pr.s >= c.from && pr.s <= c.to : pr.s >= c.from || pr.s <= c.to;
    if (inside && pr.lateral * c.side > pr.halfWidth - RACE.carpetWidth) return true;
  }
  return false;
}

/** Projeção num corredor só (path -1 = principal), sem escolher entre eles. Para desenhar. */
export function pathProgress(track: Track, path: number, pos: Vec2): TrackProgress {
  return allProgress(track, pos).find((p) => p.path === path) ?? allProgress(track, pos)[0];
}

/** Bordas esquerda/direita do atalho i, como trackEdges. */
export function branchEdges(track: Track, i: number): { plus: Vec2[]; minus: Vec2[] } {
  const b = track.branches[i];
  const n = b.points.length;
  const plus: Vec2[] = [];
  const minus: Vec2[] = [];
  for (let k = 0; k < n; k++) {
    const a = b.points[Math.max(0, k - 1)];
    const c = b.points[Math.min(n - 1, k + 1)];
    const len = Math.hypot(c.x - a.x, c.z - a.z);
    const nrm = sideNormal((c.x - a.x) / len, (c.z - a.z) / len);
    const hw = b.widths[k] / 2;
    const p = b.points[k];
    plus.push({ x: p.x + nrm.x * hw, z: p.z + nrm.z * hw });
    minus.push({ x: p.x - nrm.x * hw, z: p.z - nrm.z * hw });
  }
  return { plus, minus };
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
  for (const s of track.cupRows) {
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

/** Ids das pistas, na ordem do seletor. O id vai para o arquivo de dados (laps[id]): nunca renomear. */
export const TRACK_IDS = ["corporativo", "estacionamento", "copa"] as const;
export type TrackId = (typeof TRACK_IDS)[number];
export const DEFAULT_TRACK_ID: TrackId = "corporativo";

export const TRACKS: Record<TrackId, Track> = {
  corporativo: buildTrack({ id: "corporativo", name: "Circuito Corporativo", ctrl: CORPORATIVO, rooms: CORPORATIVO_ROOMS, carpet: CORPORATIVO_CARPET, boxes: CORPORATIVO_BOXES, cups: CORPORATIVO_CUPS, branch: CORPORATIVO_BRANCH, ramp: CORPORATIVO_RAMP }),
  estacionamento: buildTrack({ id: "estacionamento", name: "Estacionamento", ctrl: ESTACIONAMENTO, rooms: ESTACIONAMENTO_ROOMS, carpet: ESTACIONAMENTO_CARPET, boxes: ESTACIONAMENTO_BOXES, cups: ESTACIONAMENTO_CUPS, branch: ESTACIONAMENTO_BRANCH, ramp: ESTACIONAMENTO_RAMP }),
  copa: buildTrack({ id: "copa", name: "Copa", ctrl: COPA, rooms: COPA_ROOMS, carpet: COPA_CARPET, boxes: COPA_BOXES, cups: COPA_CUPS, branch: COPA_BRANCH }),
};

export const isTrackId = (v: unknown): v is TrackId => typeof v === "string" && (TRACK_IDS as readonly string[]).includes(v);

/** Pista pelo id; id desconhecido cai no Circuito Corporativo. */
export const getTrack = (id: string | undefined): Track => (isTrackId(id) ? TRACKS[id] : TRACKS[DEFAULT_TRACK_ID]);

/** Circuito Corporativo (atalho para quem só conhece a pista original). */
export const TRACK: Track = TRACKS.corporativo;
export const TRACK_LENGTH = TRACK.length;
export const TRACK_ROOMS = CORPORATIVO_ROOMS;
