/* global console */
// Gera assets-src/roupas/cabelos/06_topete.glb: topete de mechas grossas em gomos, feito por código.
// Roda à mão:  node scripts/gerar-cabelo-topete.mjs  (depois: node scripts/optimize-assets.mjs)
//
// Só mechas, presas ao osso `cabeca`: tubos achatados que nascem redondos e terminam em ponta, correndo
// rente à cabeça do boneco (raio medido por raycast na malha presa ao osso `cabeca` do boneco_completo.glb).
// O alto vem da testa para trás, as laterais em faixas até a nuca, a nuca desce, e há costeletas em ponta.
// O esqueleto, a skin e o material vêm do 01_cabelo.glb, então a peça pega a cor do crachá.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BONECO = join(root, "assets-src", "characters", "boneco_completo.glb");
const BASE = join(root, "assets-src", "roupas", "cabelos", "01_cabelo.glb");
const OUT = join(root, "assets-src", "roupas", "cabelos", "06_topete.glb");

const HEAD_BONE = "cabeca";
const CENTER = [0, 1.42, 0]; // centro da cabeça (Y 0,90 a 1,90, raio ~0,45)
const LIFT = 0.024; // altura da linha central das mechas sobre a pele
const SEGMENTS = 14; // pontos ao longo de cada mecha
const SIDES = 8; // lados do tubo da mecha

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });

// Triângulos da cabeça: os da malha do corpo com peso maior que 0,5 no osso da cabeça.
const boneco = await io.read(BONECO);
const headJoint = boneco.getRoot().listSkins()[0].listJoints().findIndex((j) => j.getName() === HEAD_BONE);
const tris = [];
for (const node of boneco.getRoot().listNodes()) {
  const prim = node.getMesh()?.listPrimitives()[0];
  const joints = prim?.getAttribute("JOINTS_0");
  if (!joints || node.getName() !== "boneco") continue;
  const pos = prim.getAttribute("POSITION"), weights = prim.getAttribute("WEIGHTS_0"), idx = prim.getIndices().getArray();
  const j = [], w = [];
  const onHead = (i) => {
    joints.getElement(i, j); weights.getElement(i, w);
    return j.reduce((s, ji, k) => s + (ji === headJoint ? w[k] : 0), 0) > 0.5;
  };
  for (let t = 0; t < idx.length; t += 3) {
    if (![idx[t], idx[t + 1], idx[t + 2]].every(onHead)) continue;
    tris.push([idx[t], idx[t + 1], idx[t + 2]].map((i) => pos.getElement(i, [])));
  }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / (Math.hypot(...a) || 1));

/** Distância do centro até a superfície mais externa da cabeça na direção `dir` (Möller–Trumbore). */
function headRadius(dir) {
  let far = 0;
  for (const [a, b, c] of tris) {
    const e1 = sub(b, a), e2 = sub(c, a), p = cross(dir, e2), det = dot(e1, p);
    if (Math.abs(det) < 1e-9) continue;
    const s = sub(CENTER, a), u = dot(s, p) / det;
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1), v = dot(dir, q) / det;
    if (v < 0 || u + v > 1) continue;
    far = Math.max(far, dot(e2, q) / det);
  }
  return far || 0.45;
}

/** Direção a partir do centro: `theta` gira em volta (0 = testa, +π/2 = lado +X, π = nuca), `phi` é a elevação. */
const dirOf = (theta, phi) => [Math.cos(phi) * Math.sin(theta), Math.sin(phi), Math.cos(phi) * Math.cos(theta)];

// Malha única: cada parte empilha seus vértices e triângulos.
const positions = [], tri = [];
const push = (p) => (positions.push(p), positions.length - 1);
/** Triângulo virado para `away` (normal com produto escalar positivo com essa direção). */
function face(a, b, c, away) {
  const n = cross(sub(positions[b], positions[a]), sub(positions[c], positions[a]));
  tri.push(...(dot(n, away) >= 0 ? [a, b, c] : [a, c, b]));
}

/** Catmull-Rom uniforme pelos pontos de controle (vetores de mesmo tamanho), amostrado em `us` (0 a 1). */
function spline(ctrl, us) {
  const pts = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]], out = [];
  for (const u of us) {
    const f = u * (ctrl.length - 1), k = Math.min(Math.floor(f), ctrl.length - 2), t = f - k;
    const [p0, p1, p2, p3] = pts.slice(k, k + 4);
    out.push(p1.map((_, c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t * t * t)));
  }
  return out;
}

/**
 * Mecha: tubo achatado que nasce arredondado, engorda até `width` e afina até a ponta.
 * `ctrl` são [direção x, y, z, altura sobre a cabeça]; a mecha corre sobre a cabeça seguindo essas direções.
 */
function strand(ctrl, width) {
  // Amostras mais juntas no começo, para a raiz sair redonda e não em cone.
  const us = Array.from({ length: SEGMENTS }, (_, i) => (i / (SEGMENTS - 1)) ** 1.35);
  const path = spline(ctrl, us).map(([x, y, z, lift]) => {
    const dir = norm([x, y, z]);
    return add(CENTER, mul(dir, headRadius(dir) + LIFT + lift));
  });
  const radius = (u) => width * (u < 0.18 ? Math.sqrt(1 - (1 - u / 0.18) ** 2) : ((1 - u) / 0.82) ** 0.55); // afina tarde, para os vizinhos se encostarem
  const start = positions.length;
  const ringIds = [];
  for (let i = 1; i < SEGMENTS - 1; i++) {
    const p = path[i], tangent = norm(sub(path[i + 1], path[i - 1]));
    const up = norm(sub(sub(p, CENTER), mul(tangent, dot(sub(p, CENTER), tangent))));
    const side = cross(tangent, up), r = radius(us[i]);
    const center = add(p, mul(up, r * 0.45)); // a parte de baixo encosta na cabeça
    ringIds.push(Array.from({ length: SIDES }, (_, k) => {
      const a = (k / SIDES) * 2 * Math.PI;
      return push(add(center, add(mul(side, Math.cos(a) * r * 1.4), mul(up, Math.sin(a) * r * 0.8))));
    }));
  }
  const tipA = push(path[0]), tipB = push(path[SEGMENTS - 1]);
  const ringCenter = (ids) => mul(ids.map((i) => positions[i]).reduce(add, [0, 0, 0]), 1 / ids.length);
  for (let i = 0; i < ringIds.length - 1; i++) {
    const c = ringCenter(ringIds[i]);
    for (let k = 0; k < SIDES; k++) {
      const kn = (k + 1) % SIDES, [a, b, cc, d] = [ringIds[i][k], ringIds[i][kn], ringIds[i + 1][kn], ringIds[i + 1][k]];
      const away = sub(positions[a], c);
      face(a, b, cc, away); face(a, cc, d, away);
    }
  }
  for (const [tip, ids] of [[tipA, ringIds[0]], [tipB, ringIds[ringIds.length - 1]]]) {
    const c = ringCenter(ids);
    for (let k = 0; k < SIDES; k++) face(tip, ids[k], ids[(k + 1) % SIDES], add(sub(positions[ids[k]], c), sub(positions[tip], c)));
  }
  return positions.length - start;
}

// Pontos de controle: `meridian(a, s)` corre da testa (s = 0) pelo alto (π/2) até a nuca (π), aberto `a`
// radianos para o lado; `around(theta, phi)` é a direção comum por azimute e elevação.
const meridian = (a, s, lift) => [Math.sin(a), Math.cos(a) * Math.sin(s), Math.cos(a) * Math.cos(s), lift];
const around = (theta, phi, lift) => [...dirOf(theta, phi), lift];

// Alto: da testa para trás, com o começo levantado (topete) e leve varrido para o lado -X.
for (let k = -3; k <= 3; k++) {
  const a = k * 0.2, w = 0.085 - Math.abs(k) * 0.007;
  strand([0.32, 0.75, 1.3, 1.9, 2.45].map((s, i) => meridian(a - 0.12 * (s / 2.45), s, [0.04, 0.1, 0.09, 0.05, 0.01][i])), w);
}
for (const side of [1, -1]) {
  // Laterais: faixas horizontais da têmpora até a nuca, pontas para trás, e uma camada de baixo
  // intercalada que tapa a pele entre elas.
  const band = (phi, from, to, w, lift) =>
    strand([0, 0.33, 0.66, 1].map((t) => around(side * (from + (to - from) * t), phi - 0.18 * t, lift - 0.02 * t)), w);
  for (const [phi, from, to] of [[1.0, 0.75, 2.5], [0.76, 0.82, 2.6], [0.52, 0.92, 2.68], [0.28, 1.05, 2.75], [0.04, 1.2, 2.8]]) band(phi, from, to, 0.08, 0.035);
  for (const [phi, from, to] of [[0.88, 0.9, 2.6], [0.64, 1.0, 2.7], [0.4, 1.1, 2.78], [0.16, 1.25, 2.85]]) band(phi, from, to, 0.075, 0.01);
  // Costeleta em ponta na frente da orelha e mecha caída atrás dela.
  strand([[0.6, 0.0], [0.25, 0.015], [-0.05, 0.01], [-0.32, 0]].map(([phi, lift]) => around(side * 1.28, phi, lift)), 0.05);
  for (const theta of [1.95, 2.35]) strand([[0.4, 0.02], [0.05, 0.02], [-0.25, 0.01], [-0.5, 0]].map(([phi, lift]) => around(side * theta, phi, lift)), 0.07);
}
// Nuca: mechas que descem do alto de trás, pontas para baixo, com uma camada de baixo nos vãos.
for (let k = -4; k <= 4; k++) {
  strand([[1.2, 0.05], [0.7, 0.05], [0.15, 0.035], [-0.35, 0.015], [-0.62, 0]].map(([phi, lift]) => around(Math.PI + k * 0.26, phi, lift)), 0.085);
}
for (let k = -3.5; k <= 3.5; k++) {
  strand([[1.0, 0.02], [0.5, 0.02], [0, 0.01], [-0.55, 0]].map(([phi, lift]) => around(Math.PI + k * 0.26, phi, lift)), 0.08);
}

const normals = positions.map(() => [0, 0, 0]);
for (let t = 0; t < tri.length; t += 3) {
  const [a, b, c] = [tri[t], tri[t + 1], tri[t + 2]];
  const n = cross(sub(positions[b], positions[a]), sub(positions[c], positions[a]));
  for (const i of [a, b, c]) normals[i] = add(normals[i], n);
}
console.log(`cabeça: ${tris.length} triângulos`);

// Troca a geometria do 01_cabelo.glb pela nova, mantendo nós, skin e material.
const doc = await io.read(BASE);
for (const anim of doc.getRoot().listAnimations()) anim.dispose();
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const headIndex = doc.getRoot().listSkins()[0].listJoints().findIndex((j) => j.getName() === HEAD_BONE);
const buffer = doc.getRoot().listBuffers()[0];
const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
const old = prim.listAttributes().concat(prim.getIndices() ?? []);
prim
  .setAttribute("POSITION", accessor("VEC3", new Float32Array(positions.flat())))
  .setAttribute("NORMAL", accessor("VEC3", new Float32Array(normals.map(norm).flat())))
  .setAttribute("JOINTS_0", accessor("VEC4", new Uint8Array(positions.flatMap(() => [headIndex, 0, 0, 0]))))
  .setAttribute("WEIGHTS_0", accessor("VEC4", new Float32Array(positions.flatMap(() => [1, 0, 0, 0]))))
  .setIndices(accessor("SCALAR", new Uint16Array(tri)));
for (const a of old) a.dispose();
await io.write(OUT, doc);
console.log(`${OUT}: ${positions.length} vértices, ${tri.length / 3} triângulos`);
