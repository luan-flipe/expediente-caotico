/**
 * Rosto vetorial: cada expressão é uma lista de camadas (formas) que o shader do corpo desenha por cima
 * da pele, sem imagem. As medidas são em centímetros na vista de frente do rosto, nas coordenadas do
 * corpo antigo (x para a esquerda do boneco, y para cima; o shader desconta quanto o corpo subiu).
 *
 * Tipos de camada:
 *  - fill: forma fechada, contorno em curvas quadráticas;
 *  - stroke: traço aberto em curvas quadráticas, com espessura variando do começo ao fim;
 *  - ellipse / ring: elipse cheia ou só o contorno;
 *  - tear: gota (círculo embaixo, ponta em cima).
 * Uma camada pode ser recortada por outra (clip): a íris só aparece dentro do branco do olho.
 * A cor "iris" é a cor de olho do crachá vezes um fator (sombra e brilho da íris).
 *
 * Este arquivo não depende do three.js: roda também no Node (conferência com as pinturas do designer).
 */

export type Pt = readonly [number, number];

/** Cor: hex sRGB, ou a cor de olho do crachá vezes um fator. */
export type Paint = string | { iris: number };

interface Base {
  paint: Paint;
  /** 0–1 */
  alpha?: number;
  /** recorte pela camada com este nome (anterior a esta) */
  clip?: string;
  /** a opacidade cai de 1 (em from) a 0 (em to) */
  fade?: { from: Pt; to: Pt };
  /** borda esfumada (cm), para manchas como o rubor */
  feather?: number;
  name?: string;
}
export interface FillLayer extends Base {
  kind: "fill";
  /** P0, C0, P1, C1, ... Pn-1, Cn-1: segmento k vai de Pk a Pk+1 (o último volta a P0) com controle Ck */
  path: Pt[];
}
export interface StrokeLayer extends Base {
  kind: "stroke";
  /** P0, C0, P1, C1, ... Pn: segmento k vai de Pk a Pk+1 com controle Ck */
  path: Pt[];
  /** espessura no começo, no meio e no fim (cm) */
  width: readonly [number, number, number];
}
export interface EllipseLayer extends Base {
  kind: "ellipse" | "ring";
  center: Pt;
  radius: Pt;
  /** graus, anti-horário */
  angle?: number;
  /** espessura do contorno (ring) */
  width?: number;
}
export interface TearLayer extends Base {
  kind: "tear";
  /** centro do círculo de baixo */
  center: Pt;
  radius: number;
  /** altura da ponta acima do centro */
  height: number;
}
export type Layer = FillLayer | StrokeLayer | EllipseLayer | TearLayer;

// ---------------------------------------------------------------------------------------------
// Montadores

const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
/** Controle da quadrática de a a b que passa por m no meio (t = 0,5). */
export const through = (a: Pt, m: Pt, b: Pt): Pt => {
  const c = mid(a, b);
  return [2 * m[0] - c[0], 2 * m[1] - c[1]];
};
/** Corrente de pontos de passagem: [P0, C0, P1, ...], cada segmento passando pelo ponto do meio dado. */
const chain = (pts: Pt[]): Pt[] => {
  // pts: P0, M0, P1, M1, P2 ... (âncoras e pontos do meio alternados)
  const out: Pt[] = [pts[0]];
  for (let i = 0; i + 2 < pts.length; i += 2) out.push(through(pts[i], pts[i + 1], pts[i + 2]), pts[i + 2]);
  return out;
};
const reverse = (path: Pt[]): Pt[] => [...path].reverse();

export const LID = "#5e1c10";
const LOWER_LINE = "#9a4a44";
const SCLERA = "#fdfbfa";
const SCLERA_SHADE = "#c9b8bd";
const WHITE = "#ffffff";

export interface OpenEye {
  /** branco do olho: borda de cima, do canto de dentro ao de fora (pontos de passagem: âncora, meio, âncora, ...) */
  upper: Pt[];
  /** borda de baixo, do canto de fora ao de dentro */
  lower: Pt[];
  /** borda de fora do traço da pálpebra, do começo (perto do canto de dentro) até a ponta da asa */
  lid: Pt[];
  /** ponto do meio da volta da asa até o canto de fora */
  wing: Pt;
  /** traço fino de baixo (opcional): pontos de passagem e espessuras */
  lowerLine?: { path: Pt[]; width: readonly [number, number, number]; alpha?: number };
  iris: { center: Pt; radius: Pt; angle?: number };
  /** parte escura de cima da íris (pupila grande do desenho) */
  pupil: { center: Pt; radius: Pt; angle?: number };
  /** miolo mais escuro dentro da pupila (opcional) */
  core?: { center: Pt; radius: Pt };
  /** brilhos, em relação ao centro da íris, sem espelhar (a luz vem do mesmo lado nos dois olhos) */
  shine: { at: Pt; radius: Pt; angle?: number; alpha?: number; paint?: string }[];
  /** olho molhado (triste): a parte de baixo da íris e do branco fica azulada */
  wet?: number;
}

export interface ClosedEye {
  closed: true;
  /** arco do olho fechado: pontos de passagem */
  arc: Pt[];
  width: readonly [number, number, number];
  /** cílios: segmentos [início, fim] */
  lashes: [Pt, Pt][];
}

/** Camadas de um olho aberto. side: nome único (prefixo das camadas). */
export function openEye(e: OpenEye, side: string): Layer[] {
  const n = (s: string) => `${side}.${s}`;
  const up = chain(e.upper);
  const low = chain(e.lower);
  // branco: borda de cima (dentro -> fora) e de baixo (fora -> dentro), sem repetir os cantos
  const sclera: Pt[] = [...up.slice(0, -1), ...low.slice(0, -1)];
  const lidOut = chain(e.lid);
  const outer = up[up.length - 1];
  const inner = up[0];
  // traço: borda de fora (começo -> asa), volta da asa até o canto de fora, borda do branco de fora
  // para dentro, e do canto de dentro de volta ao começo
  const upRev = reverse(up);
  const lidBand: Pt[] = [
    ...lidOut.slice(0, -1),
    lidOut[lidOut.length - 1],
    through(lidOut[lidOut.length - 1], e.wing, outer),
    ...upRev.slice(0, -1),
    inner,
    mid(inner, lidOut[0]),
  ];
  const iris = { center: e.iris.center, radius: e.iris.radius, angle: e.iris.angle ?? 0 };
  // ponto mais alto do branco: a sombra da pálpebra começa nele
  const top = e.upper.reduce((a, b) => (b[1] > a[1] ? b : a));
  const layers: Layer[] = [
    { kind: "fill", name: n("branco"), path: sclera, paint: SCLERA },
    // sombra da pálpebra no branco
    { kind: "fill", path: sclera, paint: SCLERA_SHADE, alpha: 0.55, clip: n("branco"), fade: { from: top, to: [top[0], top[1] - 3] } },
    { kind: "ellipse", name: n("iris"), ...iris, paint: { iris: 1.15 }, clip: n("branco") },
    // metade de baixo da íris mais clara
    { kind: "ellipse", ...iris, paint: { iris: 1.7 }, alpha: 0.75, clip: n("iris"), fade: { from: [iris.center[0], iris.center[1] - iris.radius[1]], to: [iris.center[0], iris.center[1] - iris.radius[1] * 0.15] } },
    { kind: "ellipse", ...e.pupil, paint: { iris: 0.5 }, clip: n("iris") },
    ...(e.core ? [{ kind: "ellipse", ...e.core, paint: { iris: 0.3 }, clip: n("iris") } as Layer] : []),
    // sombra da pálpebra na íris
    { kind: "ellipse", ...iris, paint: { iris: 0.35 }, alpha: 0.7, clip: n("iris"), fade: { from: top, to: [top[0], top[1] - 2.5] } },
  ];
  if (e.wet) {
    const bottom = iris.center[1] - iris.radius[1];
    layers.splice(2, 0, { kind: "fill", path: sclera, paint: "#bcd3ee", alpha: e.wet, clip: n("branco"), fade: { from: [iris.center[0], bottom], to: [iris.center[0], bottom + 3.5] } });
    layers.push({
      kind: "ellipse",
      ...iris,
      paint: "#b9d3ee",
      alpha: e.wet,
      clip: n("iris"),
      fade: { from: [iris.center[0], iris.center[1] - iris.radius[1]], to: [iris.center[0], iris.center[1] - iris.radius[1] * 0.2] },
    });
  }
  layers.push({ kind: "ring", ...iris, width: 0.35, paint: { iris: 0.28 }, clip: n("branco") });
  for (const s of e.shine)
    layers.push({
      kind: "ellipse",
      center: [iris.center[0] + s.at[0], iris.center[1] + s.at[1]],
      radius: s.radius,
      angle: s.angle ?? 0,
      paint: s.paint ?? WHITE,
      alpha: s.alpha ?? 1,
      clip: n("branco"),
    });
  layers.push({ kind: "fill", path: lidBand, paint: LID });
  if (e.lowerLine) layers.push({ kind: "stroke", path: chain(e.lowerLine.path), width: e.lowerLine.width, paint: LOWER_LINE, alpha: e.lowerLine.alpha ?? 1 });
  return layers;
}

export function closedEye(e: ClosedEye): Layer[] {
  return [
    { kind: "stroke", path: chain(e.arc), width: e.width, paint: LID },
    ...e.lashes.map(([a, b]): Layer => ({ kind: "stroke", path: [a, mid(a, b), b], width: [0.32, 0.22, 0.08], paint: LID })),
  ];
}

export interface Brow {
  /** pontos de passagem do meio do traço (dentro -> fora) */
  path: Pt[];
  width: readonly [number, number, number];
}
export const BROW = "#946555";
export const brow = (b: Brow): Layer => ({ kind: "stroke", path: chain(b.path), width: b.width, paint: BROW });

export const MOUTH = "#7d3a2c";
/** Traço por pontos de passagem [P0, M0, P1, M1, ...]. */
export const line = (path: Pt[], width: readonly [number, number, number], paint: Paint, alpha = 1): Layer => ({
  kind: "stroke",
  path: chain(path),
  width,
  paint,
  alpha,
});
export const mouthLine = (path: Pt[], width: readonly [number, number, number], alpha = 1, paint = MOUTH): Layer => line(path, width, paint, alpha);

/** Rubor: mancha esfumada nas bochechas (os dois lados). */
export const blush = (center: Pt, radius: Pt, alpha: number): Layer[] => [
  { kind: "ellipse", center, radius, paint: "#f2606e", alpha, feather: Math.min(radius[0], radius[1]) * 1.6 },
  { kind: "ellipse", center: [-center[0], center[1]], radius, paint: "#f2606e", alpha, feather: Math.min(radius[0], radius[1]) * 1.6 },
];

export interface OpenMouth {
  /** contorno fechado: pontos de passagem [canto, meio, canto, meio] (volta ao primeiro) */
  outline: Pt[];
  /** dentes: faixa de cima (contorno fechado, pontos de passagem), recortada pela boca */
  teeth?: Pt[];
  tongue?: { center: Pt; radius: Pt };
  /** contorno escuro */
  line: number;
}
/** Contorno fechado a partir de pontos de passagem [P0, M0, P1, M1, ...] que voltam a P0. */
export const loop = (pts: Pt[]): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i += 2) out.push(pts[i], through(pts[i], pts[i + 1], pts[(i + 2) % pts.length]));
  return out;
};
export function openMouth(m: OpenMouth, name: string): Layer[] {
  const path = loop(m.outline);
  const layers: Layer[] = [{ kind: "fill", name, path, paint: "#6e1a22" }];
  if (m.tongue) layers.push({ kind: "ellipse", center: m.tongue.center, radius: m.tongue.radius, paint: "#e0838a", clip: name });
  if (m.teeth) layers.push({ kind: "fill", path: loop(m.teeth), paint: WHITE, clip: name });
  // contorno: o mesmo caminho, como traço (fechado: repete o primeiro ponto)
  layers.push({ kind: "stroke", path: [...path, path[0]], width: [m.line, m.line, m.line], paint: "#4a1414" });
  return layers;
}

export const tear = (center: Pt, radius: number): Layer[] => [
  { kind: "tear", center, radius, height: radius * 2.3, paint: "#a9c8ea" },
  { kind: "ellipse", center: [center[0] + radius * 0.25, center[1] - radius * 0.2], radius: [radius * 0.28, radius * 0.28], paint: WHITE, alpha: 0.9 },
];

/** Espelha camadas para o outro lado do rosto (x -> -x). */
export function mirror(layers: Layer[], from: string, to: string): Layer[] {
  const m = (p: Pt): Pt => [-p[0], p[1]];
  const rename = (s?: string) => s?.replace(`${from}.`, `${to}.`);
  return layers.map((l) => {
    const base = { ...l, name: rename(l.name), clip: rename(l.clip), fade: l.fade && { from: m(l.fade.from), to: m(l.fade.to) } };
    switch (l.kind) {
      case "fill":
      case "stroke":
        return { ...base, path: l.path.map(m) } as Layer;
      case "ellipse":
      case "ring":
        return { ...base, center: m(l.center), angle: -(l.angle ?? 0) } as Layer;
      case "tear":
        return { ...base, center: m(l.center) } as Layer;
    }
  });
}

/** Olho aberto espelhado para o lado -x: a forma espelha, os brilhos ficam do mesmo lado da íris. */
export function openEyeMirrored(e: OpenEye, side: string): Layer[] {
  const m = (p: Pt): Pt => [-p[0], p[1]];
  const mm = (ps: Pt[]) => ps.map(m);
  return openEye(
    {
      ...e,
      upper: mm(e.upper),
      lower: mm(e.lower),
      lid: mm(e.lid),
      wing: m(e.wing),
      lowerLine: e.lowerLine && { ...e.lowerLine, path: mm(e.lowerLine.path) },
      iris: { ...e.iris, center: m(e.iris.center), angle: -(e.iris.angle ?? 0) },
      pupil: { ...e.pupil, center: m(e.pupil.center), angle: -(e.pupil.angle ?? 0) },
      core: e.core && { ...e.core, center: m(e.core.center) },
    },
    side,
  );
}

// ---------------------------------------------------------------------------------------------
// Codificação para o shader: uma linha de texels RGBA float.

export const KIND = { fill: 0, stroke: 1, ellipse: 2, ring: 3, tear: 4 } as const;
/** texels por camada */
export const LAYER_TEXELS = 7;
export const MAX_LAYERS = 48;
/** segmentos por caminho */
export const MAX_SEGMENTS = 12;

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hexLinear = (hex: string): [number, number, number] => {
  const v = parseInt(hex.slice(1), 16);
  return [srgbToLinear(((v >> 16) & 255) / 255), srgbToLinear(((v >> 8) & 255) / 255), srgbToLinear((v & 255) / 255)];
};

/**
 * Camadas -> dados do shader (metros). Texel 0: (número de camadas). Camada i em 1 + 7i:
 *  0: tipo, primeiro ponto, número de pontos, recorte (índice ou -1)
 *  1: cor linear rgb, modo (0 cor, 1 íris vezes r)
 *  2: opacidade, espessura no começo, no meio, no fim
 *  3: esmaecimento: origem xy, direção xy (dividida pelo comprimento ao quadrado; 0 = sem)
 *  4: caixa: x mín, y mín, x máx, y máx
 *  5: elipse/gota: centro xy, raio xy (gota: raio, altura)
 *  6: cos e sen do ângulo, espessura do contorno, borda esfumada
 * Depois das camadas, um ponto por texel (x, y).
 */
export function encode(layers: Layer[]): Float32Array {
  if (layers.length > MAX_LAYERS) throw new Error(`rosto com ${layers.length} camadas (máximo ${MAX_LAYERS})`);
  const S = 0.01;
  const names = new Map<string, number>();
  const points: Pt[] = [];
  const texels: number[][] = [[layers.length, 0, 0, 0]];
  const body: number[][] = [];
  layers.forEach((l, i) => {
    const clip = l.clip === undefined ? -1 : (names.get(l.clip) ?? -2);
    if (clip === -2) throw new Error(`recorte ${l.clip} não existe antes de ${l.name ?? i}`);
    if (l.name) names.set(l.name, i);
    const [r, g, b, mode] = typeof l.paint === "string" ? [...hexLinear(l.paint), 0] : [l.paint.iris, 0, 0, 1];
    let start = 0, count = 0, w: [number, number, number] = [0, 0, 0];
    let ell = [0, 0, 0, 0], rot = [1, 0, 0, 0];
    let box: number[];
    if (l.kind === "fill" || l.kind === "stroke") {
      const segs = l.kind === "fill" ? l.path.length / 2 : (l.path.length - 1) / 2;
      if (!Number.isInteger(segs) || segs < 1 || segs > MAX_SEGMENTS) throw new Error(`caminho com ${l.path.length} pontos em ${l.name ?? i}`);
      start = points.length;
      count = l.path.length;
      points.push(...l.path);
      if (l.kind === "stroke") w = [l.width[0] * S, l.width[1] * S, l.width[2] * S];
      const pad = Math.max(...w) / 2;
      const xs = l.path.map((p) => p[0] * S), ys = l.path.map((p) => p[1] * S);
      box = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
    } else if (l.kind === "tear") {
      ell = [l.center[0] * S, l.center[1] * S, l.radius * S, l.height * S];
      box = [ell[0] - ell[2], ell[1] - ell[2], ell[0] + ell[2], ell[1] + ell[3]];
    } else {
      const a = ((l.angle ?? 0) * Math.PI) / 180;
      ell = [l.center[0] * S, l.center[1] * S, l.radius[0] * S, l.radius[1] * S];
      rot = [Math.cos(a), Math.sin(a), (l.width ?? 0) * S, 0];
      const R = Math.max(ell[2], ell[3]) + rot[2] + (l.feather ?? 0) * S;
      box = [ell[0] - R, ell[1] - R, ell[0] + R, ell[1] + R];
    }
    let fade = [0, 0, 0, 0];
    if (l.fade) {
      const dx = (l.fade.to[0] - l.fade.from[0]) * S, dy = (l.fade.to[1] - l.fade.from[1]) * S;
      const k = 1 / (dx * dx + dy * dy);
      // opacidade = 1 - clamp(dot(p - from, d))
      fade = [l.fade.from[0] * S, l.fade.from[1] * S, dx * k, dy * k];
    }
    rot[3] = (l.feather ?? 0) * S;
    body.push([KIND[l.kind], 0, count, clip], [r, g, b, mode], [l.alpha ?? 1, ...w], fade, box, ell, rot);
    body[body.length - LAYER_TEXELS][1] = start; // corrigido abaixo com o deslocamento
  });
  const firstPoint = 1 + layers.length * LAYER_TEXELS;
  for (let i = 0; i < layers.length; i++) body[i * LAYER_TEXELS][1] += firstPoint;
  texels.push(...body, ...points.map((p) => [p[0] * S, p[1] * S, 0, 0]));
  return Float32Array.from(texels.flat());
}
