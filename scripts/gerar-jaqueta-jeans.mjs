/* global console */
// Gera assets-src/roupas/camisetas/05_jaqueta_jeans_do_romarinho.glb: jaqueta jeans feita por código.
// Roda à mão:  node scripts/gerar-jaqueta-jeans.mjs  (depois: node scripts/optimize-assets.mjs)
//
// Parte do 03_moletom.glb (corpo, mangas longas, punhos e barra, já com pele), como o gerar-camiseta-corta-vento.mjs.
// A jaqueta fica aberta: no meio da frente o corpo vira a camiseta preta de baixo, que fica com a gola redonda do
// moletom, e cada beirada da abertura ganha uma vista em relevo (botões de um lado, casas do outro). Entram a gola
// de camisa dobrada sobre os ombros, dois bolsos de peito com lapela e botão e as costuras (pala e pregas na
// frente, pala em V atrás). Tudo que é novo assenta no corpo por raio e copia os pesos do ponto onde caiu.
// Camiseta e botões ficam fora do tingimento ("fixa" e "botao" casam com FIXED_PART de game/character.ts);
// o resto do jeans segue a cor do crachá.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = join(root, "assets-src", "roupas", "camisetas", "03_moletom.glb");
const OUT = join(root, "assets-src", "roupas", "camisetas", "05_jaqueta_jeans.glb");

/** Meia largura (|x|, vista de frente) da abertura por altura y: estreita no peito, abre embaixo e na gola. */
const OPEN = [[0.44, 0.064], [0.52, 0.055], [0.62, 0.045], [0.72, 0.04], [0.78, 0.046], [0.84, 0.07], [0.92, 0.1]];
const PLACKET_W = 0.017;
const PLACKET_LIFT = 0.0035;
const PLACKET_TOP = 0.815;
/** Largura da gola deitada (distância até a gola redonda) pelo ângulo a partir da frente: mais larga nas pontas. */
const COLLAR_W = [[0.5, 0.075], [0.8, 0.062], [1.3, 0.046], [Math.PI, 0.044]];
const COLLAR_LIFT = 0.006;
/** Lavagem estonada: a cor de cada vértice do jeans multiplica a do material, de isto (manchas escuras) até branco. */
const WASH_DARK = [0.42, 0.48, 0.58];
const WASHED = ["jeans", "jeans_barra", "jeans_gola", "jeans_bolso"];
/** Bolso do peito do lado +x (o outro é espelhado): meio em x, alto, baixo e meia largura. */
const POCKET = { x: 0.118, top: 0.712, bottom: 0.638, half: 0.045 };
/** Lapela do bolso: o meio de baixo desce `point` a mais, em bico. */
const FLAP = { top: 0.752, bottom: 0.718, point: 0.014, half: 0.05 };
const POCKET_LIFT = 0.0025;
const FLAP_LIFT = 0.0055;
const BUTTON_R = 0.0075;
const BUTTON_H = 0.0035;
/** Botões na vista do lado +x; as casas ficam na vista do outro lado, nas mesmas alturas. */
const BUTTONS_Y = [0.49, 0.555, 0.62, 0.685, 0.75];
const HOLE_HALF = 0.006;
const SEAM_W = 0.0026;
const SEAM_LIFT = 0.0012;
/** Costuras, espelhadas em x: [1 na frente ou -1 atrás, pontos (x, y)]. */
const SEAMS = [
  [1, [[0.074, 0.776], [0.15, 0.786], [0.215, 0.802]]],
  [1, [[0.094, 0.632], [0.09, 0.49]]],
  [1, [[0.142, 0.632], [0.148, 0.49]]],
  [-1, [[0, 0.7], [0.12, 0.745], [0.225, 0.785]]],
  [-1, [[0.1, 0.725], [0.108, 0.49]]],
];

const srgb = (hex) =>
  [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
/** [nome, cor da foto de referência, rugosidade, metal]. O jeans tem que ser a parte de mais vértices. */
const MATERIALS = [
  ["jeans", "#b9d4ee", 0.85, 0],
  ["jeans_barra", "#adc9e6", 0.85, 0],
  ["jeans_gola", "#b9d4ee", 0.85, 0],
  ["jeans_bolso", "#c0d9f0", 0.85, 0],
  ["jeans_costura", "#5e81aa", 0.9, 0],
  ["jeans_botao", "#8c6a3c", 0.35, 0.7],
  ["camiseta_fixa", "#1b1b1b", 0.9, 0],
];
const [JEANS, BARRA, GOLA, BOLSO, COSTURA, BOTAO, CAMISETA] = MATERIALS.map(([name]) => name);

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / (Math.hypot(...a) || 1));
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => add(a, mul(sub(b, a), t));
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const table = (rows, x) => {
  const k = rows.findIndex(([rx]) => rx > x);
  if (k <= 0) return rows[k < 0 ? rows.length - 1 : 0][1];
  const [[x0, y0], [x1, y1]] = [rows[k - 1], rows[k]];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
};

/**
 * Primeiro ponto (distância t > 0) onde o raio corta um dos triângulos (Möller–Trumbore). O triângulo pode ser
 * de pontos [x, y, z] ou de vértices { p, w }; com vértices, `weights` dá os pesos no ponto atingido.
 */
function raycast(tris, origin, dir) {
  let best = null;
  for (const tri of tris) {
    const [a, b, c] = tri.map((v) => v.p ?? v);
    const e1 = sub(b, a), e2 = sub(c, a), p = cross(dir, e2), det = dot(e1, p);
    if (Math.abs(det) < 1e-12) continue;
    const s = sub(origin, a), u = dot(s, p) / det;
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1), v = dot(dir, q) / det;
    if (v < 0 || u + v > 1) continue;
    const t = dot(e2, q) / det;
    if (t > 1e-6 && (!best || t < best.t)) best = { t, tri, u, v, point: add(origin, mul(dir, t)), normal: norm(cross(e1, e2)) };
  }
  return best;
}
const weights = ({ tri, u, v }) => mixWeights([[tri[0].w, 1 - u - v], [tri[1].w, u], [tri[2].w, v]]);
function mixWeights(list) {
  const out = new Map();
  for (const [w, k] of list) for (const [j, x] of w) out.set(j, (out.get(j) ?? 0) + x * k);
  return out;
}

const base = await io.read(BASE);
const skin = base.getRoot().listSkins()[0];
const joints = skin.listJoints().map((j) => j.getName());
const TRONCO = joints.indexOf("tronco");
const node = base.getRoot().listNodes().find((n) => n.getMesh());
if (node.getWorldMatrix().some((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) > 1e-6)) throw new Error("moletom fora da origem");
const prims = Object.fromEntries(node.getMesh().listPrimitives().map((p) => [p.getMaterial().getName(), p]));

/** Vértice: posição, normal e pesos por índice de osso; `key` identifica o mesmo vértice entre triângulos. */
function readPrim(name) {
  const p = prims[name];
  const pos = p.getAttribute("POSITION"), nor = p.getAttribute("NORMAL"), J = p.getAttribute("JOINTS_0"), W = p.getAttribute("WEIGHTS_0");
  const verts = new Map();
  const vert = (i) => {
    if (!verts.has(i)) {
      const j = J.getElement(i, []), w = W.getElement(i, []), ws = new Map();
      j.forEach((ji, k) => w[k] > 0 && ws.set(ji, (ws.get(ji) ?? 0) + w[k]));
      verts.set(i, { key: `${name}:${i}`, p: pos.getElement(i, []), n: nor.getElement(i, []), w: ws });
    }
    return verts.get(i);
  };
  const idx = p.getIndices().getArray(), tris = [];
  for (let t = 0; t < idx.length; t += 3) tris.push([vert(idx[t]), vert(idx[t + 1]), vert(idx[t + 2])]);
  return tris;
}

// Cada triângulo é cortado nas curvas f = 0 (interpoladas nas arestas) e cada pedaço sabe de que lado de cada
// curva caiu. O ponto de corte de uma aresta é o mesmo nos dois triângulos dela.
const cutCache = new Map();
function cutPoint(id, a, b, fa, fb) {
  const key = `${id}:${a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`}`;
  if (!cutCache.has(key)) {
    const t = fa / (fa - fb);
    cutCache.set(key, { key, p: lerp3(a.p, b.p, t), n: norm(lerp3(a.n, b.n, t)), w: mixWeights([[a.w, 1 - t], [b.w, t]]) });
  }
  return cutCache.get(key);
}
function split(poly, id, f) {
  const fs = poly.map(f), inside = [], outside = [];
  poly.forEach((a, i) => {
    const j = (i + 1) % poly.length;
    (fs[i] < 0 ? inside : outside).push(a);
    if (fs[i] < 0 !== fs[j] < 0) {
      const c = cutPoint(id, a, poly[j], fs[i], fs[j]);
      inside.push(c);
      outside.push(c);
    }
  });
  return [inside, outside];
}
/** Pedaços de `tris` cortados nas curvas `cuts` ([nome, f]), cada um com `signs[k]` verdadeiro se f < 0. */
function divide(tris, cuts) {
  const out = [];
  for (const tri of tris) {
    let pieces = [{ poly: tri, signs: [] }];
    for (const [id, f] of cuts)
      pieces = pieces.flatMap(({ poly, signs }) => {
        const [inside, outside] = split(poly, id, f);
        return [{ poly: inside, signs: [...signs, true] }, { poly: outside, signs: [...signs, false] }].filter((x) => x.poly.length >= 3);
      });
    for (const { poly, signs } of pieces) for (let i = 1; i < poly.length - 1; i++) out.push({ tri: [poly[0], poly[i], poly[i + 1]], signs });
  }
  return out;
}
/** Abertura: o meio da frente (|x| abaixo de OPEN) vai para a camiseta, o resto para `rest`. */
function cutOpening(tris, rest) {
  const out = { [CAMISETA]: [], [rest]: [] };
  const cuts = [["abertura", (v) => Math.abs(v.p[0]) - table(OPEN, v.p[1])], ["frente", (v) => -v.p[2]]];
  for (const { tri, signs } of divide(tris, cuts)) out[signs.every(Boolean) ? CAMISETA : rest].push(tri);
  return out;
}

// Gola deitada: a faixa do jeans em volta da gola redonda, até COLLAR_W dela, é recortada e copiada COLLAR_LIFT
// acima, com os mesmos pesos; a borda desce em parede até o corpo. Na frente a faixa para na abertura, e como ali
// ela é mais larga, as pontas descem pelo peito.
const rib = [...new Set(readPrim("gola").flat())].map((v) => v.p);
const axisZ = (Math.min(...rib.map((p) => p[2])) + Math.max(...rib.map((p) => p[2]))) / 2;
const collarCut = (v) => {
  v.neck ??= Math.min(...rib.map((q) => Math.hypot(...sub(v.p, q))));
  return v.neck - table(COLLAR_W, Math.abs(Math.atan2(v.p[0], v.p[2] - axisZ)));
};

const parts = Object.fromEntries(MATERIALS.map(([name]) => [name, []]));
const body = cutOpening(readPrim("moletom"), JEANS), hem = cutOpening(readPrim("barra"), BARRA), band = [];
body[JEANS] = divide(body[JEANS], [["gola", collarCut]]).map(({ tri, signs }) => (signs[0] && band.push(tri), tri));
for (const piece of [body, hem]) for (const [name, tris] of Object.entries(piece)) parts[name].push(...tris);
for (const name of ["manga_D", "manga_E"]) parts[JEANS].push(...readPrim(name));
for (const name of ["punho_D", "punho_E"]) parts[BARRA].push(...readPrim(name));
// a gola redonda do moletom (um aro vertical colado no pescoço) não entra: o corpo cortado por OPEN já dá o
// decote da camiseta de baixo, e o aro, de perfil quase vertical, rasga a gola deitada da jaqueta por cima
const surface = [...Object.values(body), ...Object.values(hem)].flat();

let fresh = 0;
/** Vértice novo; sem `w`, preso ao tronco. */
const newVert = (p, n, w = new Map([[TRONCO, 1]])) => ({ key: `novo:${fresh++}`, p, n, w, recompute: true });
/** Triângulo virado para `away`. */
const facing = (a, b, c, away) => (dot(cross(sub(b.p, a.p), sub(c.p, a.p)), away) >= 0 ? [a, b, c] : [a, c, b]);
const quad = (list, a, b, c, d, away) => list.push(facing(a, b, c, away), facing(a, c, d, away));
/** Ponto de `tris` visto de frente (dirZ = -1) ou de costas (dirZ = 1) em (x, y), levantado `lift` na normal. */
function onto(tris, x, y, dirZ, lift) {
  const hit = raycast(tris, [x, y, -dirZ], [0, 0, dirZ]);
  if (!hit) return null;
  const n = hit.normal[2] * dirZ > 0 ? mul(hit.normal, -1) : hit.normal;
  return newVert(add(hit.point, mul(n, lift)), n, weights(hit));
}

// Vistas: tira em relevo ao longo de cada beirada da abertura, com parede para o lado da camiseta e para fora.
const placket = { [-1]: [], [1]: [] };
for (const s of [-1, 1]) {
  const rows = [];
  for (let y = 0.447; y <= PLACKET_TOP; y += 0.006) {
    const x0 = s * table(OPEN, y), x1 = s * (table(OPEN, y) + PLACKET_W);
    const row = [onto(surface, x0, y, -1, -0.001), onto(surface, x0, y, -1, PLACKET_LIFT), onto(surface, x1, y, -1, PLACKET_LIFT), onto(surface, x1, y, -1, -0.001)];
    if (row.some((v) => !v)) continue;
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const [r0, r1] = [rows[i], rows[i + 1]];
    quad(placket[s], r0[0], r1[0], r1[1], r0[1], [-s, 0, 0]);
    quad(placket[s], r0[1], r1[1], r1[2], r0[2], r0[1].n);
    quad(placket[s], r0[2], r1[2], r1[3], r0[3], [s, 0, 0]);
  }
  for (const [row, away] of [[rows[0], [0, -1, 0]], [rows[rows.length - 1], [0, 1, 0]]]) quad(placket[s], row[0], row[1], row[2], row[3], away);
  parts[JEANS].push(...placket[s]);
}

/** Remendo em relevo: `at(u, v)` dá (x, y) com u em [-1, 1] e v em [0, 1]; a borda desce em parede até o corpo. */
function patch(list, at, nu, nv, lift) {
  const grid = [], floor = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const [x, y] = at(-1 + (2 * i) / nu, j / nv);
      grid.push(onto(surface, x, y, -1, lift));
      floor.push(onto(surface, x, y, -1, -0.0008));
    }
  const id = (i, j) => j * (nu + 1) + i;
  if (grid.some((v) => !v) || floor.some((v) => !v)) throw new Error("remendo fora do corpo");
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) quad(list, grid[id(i, j)], grid[id(i + 1, j)], grid[id(i + 1, j + 1)], grid[id(i, j + 1)], grid[id(i, j)].n);
  const ring = [
    ...Array.from({ length: nu }, (_, i) => id(i, 0)),
    ...Array.from({ length: nv }, (_, j) => id(nu, j)),
    ...Array.from({ length: nu }, (_, i) => id(nu - i, nv)),
    ...Array.from({ length: nv }, (_, j) => id(0, nv - j)),
  ];
  const center = grid[id(nu >> 1, nv >> 1)].p;
  ring.forEach((a, k) => {
    const b = ring[(k + 1) % ring.length];
    quad(list, floor[a], floor[b], grid[b], grid[a], sub(grid[a].p, center));
  });
  return list;
}

/** Botão de cobre assentado em `v` (vértice com normal), com aro e tampo. */
function button(v) {
  const n = v.n, e1 = norm(cross(n, Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), e2 = cross(n, e1);
  const rings = [[BUTTON_R, -0.001], [BUTTON_R, BUTTON_H * 0.6], [BUTTON_R * 0.8, BUTTON_H]].map(([r, h]) =>
    Array.from({ length: 12 }, (_, k) => {
      const a = (k / 12) * 2 * Math.PI;
      return newVert(add(v.p, add(add(mul(e1, Math.cos(a) * r), mul(e2, Math.sin(a) * r)), mul(n, h))), n, v.w);
    }),
  );
  const top = newVert(add(v.p, mul(n, BUTTON_H * 1.05)), n, v.w);
  for (let k = 0; k < 12; k++) {
    const k2 = (k + 1) % 12;
    for (let j = 0; j < 2; j++) quad(parts[BOTAO], rings[j][k], rings[j][k2], rings[j + 1][k2], rings[j + 1][k], sub(rings[j][k].p, v.p));
    parts[BOTAO].push(facing(rings[2][k], rings[2][k2], top, n));
  }
}

/** Fita fina por uma linha (x, y) vista de frente (dirZ = -1) ou de costas (dirZ = 1), assentada em `tris`. */
function strip(list, line, dirZ, tris, width, lift) {
  const pts = [];
  for (let i = 0; i < line.length - 1; i++) {
    const [a, b] = [line[i], line[i + 1]], steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.005));
    for (let k = i ? 1 : 0; k <= steps; k++) pts.push([lerp(a[0], b[0], k / steps), lerp(a[1], b[1], k / steps)]);
  }
  let prev = null;
  pts.forEach((p, i) => {
    const [a, b] = [pts[Math.max(0, i - 1)], pts[Math.min(pts.length - 1, i + 1)]];
    const t = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...t), side = [-t[1] / l, t[0] / l];
    const row = [-1, 1].map((k) => onto(tris, p[0] + (side[0] * k * width) / 2, p[1] + (side[1] * k * width) / 2, dirZ, lift));
    if (row.some((v) => !v)) return void (prev = null);
    if (prev) quad(list, prev[0], prev[1], row[1], row[0], row[0].n);
    prev = row;
  });
}

// Bolsos do peito: remendo, lapela em bico por cima e botão na ponta da lapela.
for (const s of [-1, 1]) {
  const cx = s * POCKET.x;
  patch(parts[BOLSO], (u, v) => [cx + u * POCKET.half, lerp(POCKET.top, POCKET.bottom, v)], 6, 5, POCKET_LIFT);
  const flapTris = patch(
    [],
    (u, v) => [cx + u * FLAP.half, lerp(FLAP.top, FLAP.bottom - FLAP.point * (1 - Math.abs(u)), v)],
    8,
    3,
    FLAP_LIFT,
  );
  parts[BOLSO].push(...flapTris);
  button(onto(flapTris, cx, FLAP.bottom - FLAP.point + 0.01, -1, 0));
}

// Botões na vista do lado +x e casas (pespontos curtos) na do outro lado.
for (const y of BUTTONS_Y) {
  const x = table(OPEN, y) + PLACKET_W / 2;
  button(onto(placket[1], x, y, -1, 0));
  strip(parts[COSTURA], [[-x - HOLE_HALF, y], [-x + HOLE_HALF, y]], -1, placket[-1], SEAM_W * 1.2, SEAM_LIFT);
}

for (const [dirSign, line] of SEAMS)
  for (const s of [-1, 1]) strip(parts[COSTURA], line.map(([x, y]) => [s * x, y]), -dirSign, surface, SEAM_W, SEAM_LIFT);

const raised = new Map(), sunk = new Map();
const lifted = (v, h, cache, tag) => {
  if (!cache.has(v.key)) cache.set(v.key, { key: `${tag}:${v.key}`, p: add(v.p, mul(v.n, h)), n: v.n, w: v.w, recompute: cache === sunk });
  return cache.get(v.key);
};
const edges = new Map();
for (const tri of band) {
  parts[GOLA].push(tri.map((v) => lifted(v, COLLAR_LIFT, raised, "gola")));
  tri.forEach((a, i) => {
    const b = tri[(i + 1) % 3], key = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;
    if (edges.has(key)) edges.get(key).shared = true;
    else edges.set(key, { a, b, c: tri[(i + 2) % 3] });
  });
}
for (const { a, b, c, shared } of edges.values()) {
  if (shared) continue;
  const [a0, b0] = [a, b].map((v) => lifted(v, -0.001, sunk, "gola_borda")), [a1, b1] = [a, b].map((v) => lifted(v, COLLAR_LIFT, raised, "gola"));
  quad(parts[GOLA], a0, b0, b1, a1, sub(mul(add(a.p, b.p), 0.5), c.p));
}
console.log(`gola: ${band.length} triângulos`);

// Normais dos vértices novos pelas faces; os outros guardam as do moletom.
for (const tris of Object.values(parts))
  for (const tri of tris) {
    const n = cross(sub(tri[1].p, tri[0].p), sub(tri[2].p, tri[0].p));
    for (const v of tri) if (v.recompute) v.acc = add(v.acc ?? [0, 0, 0], n);
  }

/** Ruído de valor 3D em [-1, 1], suave entre os pontos de uma grade inteira. */
const hash = (x, y, z) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
};
function noise([x, y, z]) {
  const i = [Math.floor(x), Math.floor(y), Math.floor(z)], f = [x - i[0], y - i[1], z - i[2]].map((t) => t * t * (3 - 2 * t));
  let out = 0;
  for (const dx of [0, 1])
    for (const dy of [0, 1])
      for (const dz of [0, 1]) out += hash(i[0] + dx, i[1] + dy, i[2] + dz) * (dx ? f[0] : 1 - f[0]) * (dy ? f[1] : 1 - f[1]) * (dz ? f[2] : 1 - f[2]);
  return out;
}
const wash = (p) => {
  const k = smooth(-0.3, 0.35, noise(mul(p, 16)) * 0.65 + noise(mul(p, 41)) * 0.35);
  return WASH_DARK.map((c) => lerp(c, 1, k));
};

const mesh = node.getMesh();
for (const prim of mesh.listPrimitives()) {
  for (const a of prim.listAttributes().concat(prim.getIndices() ?? [])) a.dispose();
  prim.dispose();
}
for (const anim of base.getRoot().listAnimations()) {
  for (const p of [...anim.listChannels(), ...anim.listSamplers()]) p.dispose();
  anim.dispose();
}
for (const m of base.getRoot().listMaterials()) m.dispose();
node.setName("jaqueta_jeans");
mesh.setName("jaqueta_jeans");
const buffer = base.getRoot().listBuffers()[0];
const accessor = (type, array) => base.createAccessor().setType(type).setArray(array).setBuffer(buffer);
let total = 0;
for (const [name, hex, rough, metal] of MATERIALS) {
  const ids = new Map(), verts = [], tri = [];
  for (const t of parts[name])
    for (const v of t) {
      if (!ids.has(v.key)) ids.set(v.key, verts.push(v) - 1);
      tri.push(ids.get(v.key));
    }
  const skinOf = (v) => {
    const top = [...v.w].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((s, [, w]) => s + w, 0);
    while (top.length < 4) top.push([0, 0]);
    return { j: top.map(([j]) => j), w: top.map(([, w]) => w / sum) };
  };
  const skins = verts.map(skinOf);
  total += verts.length;
  console.log(`${name}: ${verts.length} vértices`);
  const prim = base
    .createPrimitive()
    // mangas, punhos, barra e gola do moletom só aparecem com material de dupla face, como lá
    .setMaterial(base.createMaterial(name).setBaseColorFactor([...srgb(hex), 1]).setRoughnessFactor(rough).setMetallicFactor(metal).setDoubleSided(name !== BOTAO))
    .setAttribute("POSITION", accessor("VEC3", new Float32Array(verts.flatMap((v) => v.p))))
    .setAttribute("NORMAL", accessor("VEC3", new Float32Array(verts.flatMap((v) => (v.acc ? norm(v.acc) : v.n)))))
    .setAttribute("JOINTS_0", accessor("VEC4", new Uint8Array(skins.flatMap((s) => s.j))))
    .setAttribute("WEIGHTS_0", accessor("VEC4", new Float32Array(skins.flatMap((s) => s.w))))
    .setIndices(accessor("SCALAR", verts.length > 65535 ? new Uint32Array(tri) : new Uint16Array(tri)));
  if (WASHED.includes(name)) prim.setAttribute("COLOR_0", accessor("VEC3", new Float32Array(verts.flatMap((v) => wash(v.p)))));
  mesh.addPrimitive(prim);
}
await io.write(OUT, base);
console.log(`${OUT}: ${total} vértices`);
