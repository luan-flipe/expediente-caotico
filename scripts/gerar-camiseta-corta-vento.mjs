/* global console */
// Gera assets-src/roupas/camisetas/04_corta_vento.glb: jaqueta corta-vento feita por código.
// Roda à mão:  node scripts/gerar-camiseta-corta-vento.mjs  (depois: node scripts/optimize-assets.mjs)
//
// Parte do 03_moletom.glb (corpo, mangas longas, punhos e barra, já com pele). O corpo é recortado em painéis
// vistos de frente (verde no meio, faixa branca de cada lado, o resto preto), a gola redonda vira gola alta
// (parando abaixo do queixo, medido no boneco_completo.glb) e entra um zíper no meio da frente.
// Só o painel do meio muda com a cor do crachá: os outros materiais têm "fixo"/"fixa" ou "ziper" no nome,
// que casam com FIXED_PART de game/character.ts.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BONECO = join(root, "assets-src", "characters", "boneco_completo.glb");
const BASE = join(root, "assets-src", "roupas", "camisetas", "03_moletom.glb");
const OUT = join(root, "assets-src", "roupas", "camisetas", "04_corta_vento.glb");

/** Meia largura (|x|, vista de frente) de cada recorte por altura y. */
const PANEL = [[0.44, 0.07], [0.6, 0.074], [0.7, 0.085], [0.76, 0.105], [0.8, 0.135], [0.9, 0.16]];
const STRIPE_IN = [[0.44, 0.115], [0.55, 0.13], [0.65, 0.15], [0.72, 0.168], [0.78, 0.185], [0.84, 0.2], [0.95, 0.21]];
const STRIPE_W = [[0.44, 0.022], [0.65, 0.026], [0.8, 0.03], [0.95, 0.03]];
/** O painel do meio só vai na frente: atrás dele a jaqueta é preta. */
const FRONT_Z = 0;
const COLLAR_SIDES = 48;
const COLLAR_RISE = 0.03;
const COLLAR_FLARE = 0.006;
const COLLAR_THICK = 0.009;
const PUSH_MAX = 0.03;
const SKIN_GAP = 0.005;
const CHIN_GAP = 0.008;
const ZIP_W = 0.0055;
const ZIP_LIFT = 0.0025;
const ZIP_STEP = 0.008;

const srgb = (hex) =>
  [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
/** [nome, cor da foto de referência, rugosidade]. */
const MATERIALS = [
  ["corta_vento", "#57705d", 0.55],
  ["corta_vento_preto_fixo", "#1c1c1c", 0.55],
  ["corta_vento_faixa_fixa", "#eeedec", 0.55],
  ["corta_vento_ziper", "#141414", 0.4],
];
const [PAINEL, PRETO, FAIXA, ZIPER] = MATERIALS.map(([name]) => name);

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / (Math.hypot(...a) || 1));
const lerp3 = (a, b, t) => add(a, mul(sub(b, a), t));
const table = (rows, x) => {
  const k = rows.findIndex(([rx]) => rx > x);
  if (k <= 0) return rows[k < 0 ? rows.length - 1 : 0][1];
  const [[x0, y0], [x1, y1]] = [rows[k - 1], rows[k]];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
};

/** Primeiro ponto (distância t > 0) onde o raio corta um dos triângulos [a, b, c] (Möller–Trumbore). */
function raycast(tris, origin, dir) {
  let best = null;
  for (const tri of tris) {
    const [a, b, c] = tri;
    const e1 = sub(b, a), e2 = sub(c, a), p = cross(dir, e2), det = dot(e1, p);
    if (Math.abs(det) < 1e-12) continue;
    const s = sub(origin, a), u = dot(s, p) / det;
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1), v = dot(dir, q) / det;
    if (v < 0 || u + v > 1) continue;
    const t = dot(e2, q) / det;
    if (t > 1e-6 && (!best || t < best.t)) best = { t, point: add(origin, mul(dir, t)), normal: norm(cross(e1, e2)) };
  }
  return best;
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
      const j = J.getElement(i, []), w = W.getElement(i, []), weights = new Map();
      j.forEach((ji, k) => w[k] > 0 && weights.set(ji, (weights.get(ji) ?? 0) + w[k]));
      verts.set(i, { key: `${name}:${i}`, p: pos.getElement(i, []), n: nor.getElement(i, []), w: weights });
    }
    return verts.get(i);
  };
  const idx = p.getIndices().getArray(), tris = [];
  for (let t = 0; t < idx.length; t += 3) tris.push([vert(idx[t]), vert(idx[t + 1]), vert(idx[t + 2])]);
  return tris;
}

// Recorte do corpo: cada triângulo é cortado nas curvas f = 0 (interpoladas nas arestas) e cada pedaço vai
// para o painel do lado em que caiu. O ponto de corte de uma aresta é o mesmo nos dois triângulos dela.
const CUTS = [
  (v) => Math.abs(v.p[0]) - table(PANEL, v.p[1]),
  (v) => Math.abs(v.p[0]) - table(STRIPE_IN, v.p[1]),
  (v) => Math.abs(v.p[0]) - table(STRIPE_IN, v.p[1]) - table(STRIPE_W, v.p[1]),
  (v) => FRONT_Z - v.p[2],
  // costura da manga: onde o peso do tronco passa de metade
  (v) => 0.5 - (v.w.get(TRONCO) ?? 0),
];
const regionOf = ([inPanel, inStripeIn, inStripeOut, front, torso]) =>
  !torso ? PRETO : !inStripeIn && inStripeOut ? FAIXA : inPanel && front ? PAINEL : PRETO;
const cutCache = new Map();
function cutPoint(k, a, b, fa, fb) {
  const key = `${k}:${a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`}`;
  if (!cutCache.has(key)) {
    const t = fa / (fa - fb), w = new Map();
    for (const [j, x] of a.w) w.set(j, x * (1 - t));
    for (const [j, x] of b.w) w.set(j, (w.get(j) ?? 0) + x * t);
    cutCache.set(key, { key, p: lerp3(a.p, b.p, t), n: norm(lerp3(a.n, b.n, t)), w });
  }
  return cutCache.get(key);
}
function split(poly, k) {
  const f = poly.map((v) => CUTS[k](v)), inside = [], outside = [];
  poly.forEach((a, i) => {
    const j = (i + 1) % poly.length;
    (f[i] < 0 ? inside : outside).push(a);
    if (f[i] < 0 !== f[j] < 0) {
      const c = cutPoint(k, a, poly[j], f[i], f[j]);
      inside.push(c);
      outside.push(c);
    }
  });
  return [inside, outside];
}

const boneco = await io.read(BONECO);
const bodyPrim = boneco.getRoot().listNodes().find((n) => n.getName() === "boneco").getMesh().listPrimitives()[0];
const bpos = bodyPrim.getAttribute("POSITION"), bidx = bodyPrim.getIndices().getArray();
const bodyTris = (keep) => {
  const out = [];
  for (let t = 0; t < bidx.length; t += 3) {
    const tri = [bidx[t], bidx[t + 1], bidx[t + 2]].map((i) => bpos.getElement(i, []));
    if (keep(tri)) out.push(tri);
  }
  return out;
};

// O ombro do boneco atravessa o pano perto do pescoço (no moletom também): ali o pano sobe até cobrir a pele.
// Só conta a pele que o raio pela normal cruza de dentro para fora; a de baixo da cabeça, vista de fora, não.
const shoulders = bodyTris((tri) => tri.some((p) => p[1] > 0.74));
const torso = readPrim("moletom");
let pushed = 0;
for (const v of new Set(torso.flat())) {
  if (v.p[1] < 0.78) continue;
  const hit = raycast(shoulders, v.p, v.n);
  if (!hit || hit.t > PUSH_MAX || dot(hit.normal, v.n) <= 0) continue;
  v.p = add(v.p, mul(v.n, hit.t + SKIN_GAP));
  pushed++;
}
console.log(`pano empurrado para fora da pele: ${pushed} vértices`);

const parts = Object.fromEntries(MATERIALS.map(([name]) => [name, []]));
for (const tri of torso) {
  let pieces = [{ poly: tri, signs: [] }];
  for (let k = 0; k < CUTS.length; k++)
    pieces = pieces.flatMap(({ poly, signs }) => {
      const [inside, outside] = split(poly, k);
      return [{ poly: inside, signs: [...signs, true] }, { poly: outside, signs: [...signs, false] }].filter((x) => x.poly.length >= 3);
    });
  for (const { poly, signs } of pieces) for (let i = 1; i < poly.length - 1; i++) parts[regionOf(signs)].push([poly[0], poly[i], poly[i + 1]]);
}
for (const name of ["manga_D", "punho_D", "manga_E", "punho_E", "barra"]) parts[PRETO].push(...readPrim(name));

/** Vértice novo, preso ao tronco. */
let fresh = 0;
const torsoVert = (p, n) => ({ key: `novo:${fresh++}`, p, n, w: new Map([[TRONCO, 1]]), recompute: true });
/** Triângulo virado para `away`. */
const facing = (a, b, c, away) => (dot(cross(sub(b.p, a.p), sub(c.p, a.p)), away) >= 0 ? [a, b, c] : [a, c, b]);

// Gola alta no lugar da gola redonda do moletom: nasce onde ela pousava (por fora, um pouco abaixo; por dentro,
// rente ao pescoço), sobe um pouco aberta e para abaixo da cabeça (quase nada na frente, sob o queixo).
const neck = bodyTris((tri) => tri.every((p) => p[1] > 0.84));
const rib = [...new Set(readPrim("gola").flat())].map((v) => v.p);
const axis = [0, (Math.min(...rib.map((p) => p[2])) + Math.max(...rib.map((p) => p[2]))) / 2];
const around = (p) => [Math.atan2(p[0] - axis[0], p[2] - axis[1]), Math.hypot(p[0] - axis[0], p[2] - axis[1])];
const angleGap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const at = (th, r, y) => [axis[0] + Math.sin(th) * r, y, axis[1] + Math.cos(th) * r];
const ths = Array.from({ length: COLLAR_SIDES }, (_, i) => (i / COLLAR_SIDES) * 2 * Math.PI);
const ribAt = ths.map((th) => {
  const near = rib.filter((p) => angleGap(around(p)[0], th) < Math.PI / 12), rs = near.map((p) => around(p)[1]), ys = near.map((p) => p[1]);
  return { rIn: Math.min(...rs), rOut: Math.max(...rs), yLow: Math.min(...ys), yHigh: Math.max(...ys) };
});
const ceiling = ths.map((th, i) => {
  const { rOut, yHigh } = ribAt[i], r = rOut + COLLAR_FLARE;
  const head = Math.min(...[r, r - COLLAR_THICK].map((rr) => raycast(neck, at(th, rr, 0.8), [0, 1, 0])?.point[1] ?? Infinity));
  return Math.max(yHigh, Math.min(yHigh + COLLAR_RISE, head - CHIN_GAP));
});
const wrapAt = (list, i) => list[(i + list.length) % list.length];
const window5 = (list, f) => list.map((_, i) => f([-2, -1, 0, 1, 2].map((d) => wrapAt(list, i + d))));
const tops = window5(window5(ceiling, (w) => Math.min(...w)), (w) => w.reduce((a, b) => a + b, 0) / w.length);
const collarRows = ths.map((th, i) => {
  const { rIn, rOut, yLow } = ribAt[i], yTop = tops[i], half = COLLAR_THICK / 2, rTop = rOut + COLLAR_FLARE, mid = (yLow + yTop) / 2;
  const roll = [0, 45, 90, 135, 180].map((a) => {
    const r = (a * Math.PI) / 180;
    return [rTop - half + Math.cos(r) * half, yTop - half + Math.sin(r) * half];
  });
  return [[rOut + 0.002, yLow - 0.006], [rOut + 0.002 + COLLAR_FLARE / 3, mid], ...roll, [rTop - COLLAR_THICK - 0.002, mid], [rIn - 0.003, yLow - 0.006]];
});
const collar = collarRows.map((row, i) => row.map(([r, y]) => torsoVert(at(ths[i], r, y), [0, 0, 0])));
for (let i = 0; i < COLLAR_SIDES; i++) {
  const i2 = (i + 1) % COLLAR_SIDES, th = ths[i] + Math.PI / COLLAR_SIDES, row = collarRows[i];
  for (let j = 0; j < row.length - 1; j++) {
    const t = [row[j + 1][0] - row[j][0], row[j + 1][1] - row[j][1]];
    const away = [Math.sin(th) * t[1], -t[0], Math.cos(th) * t[1]];
    const [a, b, c, d] = [collar[i][j], collar[i2][j], collar[i2][j + 1], collar[i][j + 1]];
    parts[PRETO].push(facing(a, b, c, away), facing(a, c, d, away));
  }
}
console.log(`gola: ${Math.min(...tops.map((t, i) => t - ribAt[i].yHigh)).toFixed(3)} a ${Math.max(...tops.map((t, i) => t - ribAt[i].yHigh)).toFixed(3)} acima da gola redonda`);

// Zíper: fita no meio da frente, da barra até o alto da gola, acompanhando a superfície; puxador no alto.
const front = Object.values(parts).flat().map((tri) => tri.map((v) => v.p));
const rows = [];
for (let y = 0.447; ; y += ZIP_STEP) {
  const hit = raycast(front, [0, y, 1], [0, 0, -1]);
  if (!hit) break;
  const n = hit.normal[2] < 0 ? mul(hit.normal, -1) : hit.normal;
  const side = norm(sub([1, 0, 0], mul(n, n[0]))), c = add(hit.point, mul(n, ZIP_LIFT));
  rows.push({ c, n, ids: [-1, 1].map((s) => torsoVert(add(c, mul(side, s * ZIP_W)), n)) });
}
for (let i = 0; i < rows.length - 1; i++) {
  const [[a, b], [d, c]] = [rows[i].ids, rows[i + 1].ids];
  parts[ZIPER].push(facing(a, b, c, rows[i].n), facing(a, c, d, rows[i].n));
}
{
  const { c, n } = rows[rows.length - 2];
  const down = norm(sub(rows[rows.length - 3].c, c)), side = norm(cross(down, n));
  const corner = (s, l, h) => add(add(add(c, mul(side, s * 0.0045)), mul(down, l * 0.022)), mul(n, 0.002 + h * 0.003));
  const box = [0, 1].flatMap((l) => [-1, 1].flatMap((s) => [0, 1].map((h) => torsoVert(corner(s, l, h), n))));
  const mid = add(c, add(mul(down, 0.011), mul(n, 0.0035)));
  const quad = (a, b, cc, d) => {
    const away = sub(mul(add(add(box[a].p, box[b].p), add(box[cc].p, box[d].p)), 0.25), mid);
    parts[ZIPER].push(facing(box[a], box[b], box[cc], away), facing(box[a], box[cc], box[d], away));
  };
  // índice = l * 4 + s * 2 + h (l: ponta, s: lado, h: frente)
  quad(1, 3, 7, 5); quad(0, 2, 6, 4); quad(0, 1, 5, 4); quad(2, 3, 7, 6); quad(0, 1, 3, 2); quad(4, 5, 7, 6);
}
console.log(`zíper: ${rows.length} linhas`);

// Normais dos vértices novos ou mexidos (gola e zíper) pelas faces; os outros guardam as do moletom.
for (const tris of Object.values(parts))
  for (const tri of tris) {
    const n = cross(sub(tri[1].p, tri[0].p), sub(tri[2].p, tri[0].p));
    for (const v of tri) if (v.recompute) v.acc = add(v.acc ?? [0, 0, 0], n);
  }

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
node.setName("corta_vento");
mesh.setName("corta_vento");
const buffer = base.getRoot().listBuffers()[0];
const accessor = (type, array) => base.createAccessor().setType(type).setArray(array).setBuffer(buffer);
let total = 0;
for (const [name, hex, rough] of MATERIALS) {
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
  mesh.addPrimitive(
    base
      .createPrimitive()
      // mangas, punhos, barra e gola do moletom só aparecem com material de dupla face, como lá
      .setMaterial(base.createMaterial(name).setBaseColorFactor([...srgb(hex), 1]).setRoughnessFactor(rough).setMetallicFactor(0).setDoubleSided(name === PRETO))
      .setAttribute("POSITION", accessor("VEC3", new Float32Array(verts.flatMap((v) => v.p))))
      .setAttribute("NORMAL", accessor("VEC3", new Float32Array(verts.flatMap((v) => (v.acc ? norm(v.acc) : v.n)))))
      .setAttribute("JOINTS_0", accessor("VEC4", new Uint8Array(skins.flatMap((s) => s.j))))
      .setAttribute("WEIGHTS_0", accessor("VEC4", new Float32Array(skins.flatMap((s) => s.w))))
      .setIndices(accessor("SCALAR", verts.length > 65535 ? new Uint32Array(tri) : new Uint16Array(tri))),
  );
}
await io.write(OUT, base);
console.log(`${OUT}: ${total} vértices`);
