/* global console */
// Gera assets-src/roupas/cabelos/06_topete.glb: topete feito por código.
// Roda à mão:  node scripts/gerar-cabelo-topete.mjs  (depois: node scripts/optimize-assets.mjs)
//
// Duas partes, presas ao osso `cabeca`, rentes à cabeça do boneco (raio medido por raycast na malha presa
// ao osso `cabeca` do boneco_completo.glb):
// - casca curta: laterais e nuca batidas, uma camada fina colada à pele com sulcos de pente, recortada na
//   linha do cabelo (entradas, costeleta em ponta, contorno da orelha, nuca afinando);
// - topete: mechas em gomo que nascem na testa, sobem, rolam para trás e morrem no cocuruto, em duas
//   camadas intercaladas e com leve varrido para o lado -X.
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
const SEGMENTS = 18; // pontos ao longo de cada mecha
const SIDES = 10; // lados da seção da mecha
const SHELL_LIFT = 0.014; // espessura da casca curta sobre a pele
const GROOVES = 46; // sulcos de pente em volta da cabeça
const GROOVE_DEPTH = 0.006;

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
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
/** Interpolação linear numa tabela [[x, y], ...] ordenada por x. */
const table = (rows, x) => {
  const k = rows.findIndex(([rx]) => rx > x);
  if (k <= 0) return rows[k < 0 ? rows.length - 1 : 0][1];
  const [[x0, y0], [x1, y1]] = [rows[k - 1], rows[k]];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
};

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
const onHead = (dir, lift) => add(CENTER, mul(dir, headRadius(dir) + lift));

// Malha única: cada parte empilha seus vértices e triângulos.
const positions = [], tri = [];
const push = (p) => (positions.push(p), positions.length - 1);
/** Triângulo virado para `away` (normal com produto escalar positivo com essa direção). */
function face(a, b, c, away) {
  const n = cross(sub(positions[b], positions[a]), sub(positions[c], positions[a]));
  tri.push(...(dot(n, away) >= 0 ? [a, b, c] : [a, c, b]));
}

// Casca curta. A linha do cabelo é a elevação da borda por |theta| (simétrica): testa alta (o topete cobre),
// entradas, costeleta em ponta, arco rente acima da orelha (topo dela em ~-0,3, de ~1,5 a ~2,0), descida
// atrás dela e nuca.
const HAIRLINE = [
  [0, 0.5], [0.6, 0.5], [0.9, 0.36], [1.08, 0.18], [1.18, -0.15], [1.26, -0.58], [1.33, -0.58], [1.42, -0.34],
  [1.55, -0.3], [1.75, -0.28], [1.95, -0.31], [2.08, -0.48], [2.3, -0.7], [2.7, -0.84], [Math.PI, -0.9],
];
const COLS = 220, ROWS = 36, TOP = 1.5;
function shell() {
  const grid = [];
  for (let i = 0; i < COLS; i++) {
    const theta = -Math.PI + (i / COLS) * 2 * Math.PI, edge = table(HAIRLINE, Math.abs(theta));
    const col = [];
    for (let r = 0; r <= ROWS; r++) {
      const phi = edge + (TOP - edge) * (r / ROWS) ** 1.3; // linhas mais juntas na borda, para o recorte sair liso
      // Sulcos que seguem o pente (para baixo e um pouco para trás); somem na borda e no alto.
      const flow = theta + 0.18 * Math.sign(theta) * (phi - 0.6);
      const groove = GROOVE_DEPTH * (0.5 - 0.5 * Math.cos(flow * GROOVES)) * (1 - smooth(1.1, 1.4, phi));
      const lift = (SHELL_LIFT - groove) * (0.35 + 0.65 * smooth(edge, edge + 0.12, phi));
      col.push(push(onHead(dirOf(theta, phi), lift)));
    }
    col.unshift(push(onHead(dirOf(theta, edge - 0.01), -0.004))); // saia: a borda volta para dentro da pele
    grid.push(col);
  }
  const pole = push(onHead([0, 1, 0], SHELL_LIFT));
  for (let i = 0; i < COLS; i++) {
    const [a, b] = [grid[i], grid[(i + 1) % COLS]];
    for (let r = 0; r < a.length - 1; r++) {
      const away = sub(positions[a[r + 1]], CENTER);
      face(a[r], b[r], b[r + 1], away); face(a[r], b[r + 1], a[r + 1], away);
    }
    face(a[a.length - 1], b[b.length - 1], pole, [0, 1, 0]);
  }
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
 * Mecha: gomo de seção em lente (bordas vivas dos lados, lombo alto no meio) que nasce arredondado,
 * engorda até `width` e afina até a ponta. `ctrl` são [direção x, y, z, altura sobre a cabeça].
 */
function strand(ctrl, width) {
  // Amostras mais juntas no começo, para a raiz sair redonda e não em cone.
  const us = Array.from({ length: SEGMENTS }, (_, i) => (i / (SEGMENTS - 1)) ** 1.2);
  const path = spline(ctrl, us).map(([x, y, z, lift]) => onHead(norm([x, y, z]), lift));
  const radius = (u) => width * (u < 0.15 ? Math.sqrt(1 - (1 - u / 0.15) ** 2) : ((1 - u) / 0.85) ** 0.7);
  const ringIds = [];
  for (let i = 1; i < SEGMENTS - 1; i++) {
    const p = path[i], tangent = norm(sub(path[i + 1], path[i - 1]));
    const up = norm(sub(sub(p, CENTER), mul(tangent, dot(sub(p, CENTER), tangent))));
    const side = cross(tangent, up), r = radius(us[i]);
    const center = add(p, mul(up, r * 0.3)); // a parte de baixo encosta na cabeça
    ringIds.push(Array.from({ length: SIDES }, (_, k) => {
      const a = (k / SIDES) * 2 * Math.PI, s = Math.sin(a);
      // Lente: a altura cai mais rápido que o cos perto das bordas; o lombo de cima é mais alto que a barriga.
      const h = s * Math.abs(s) ** 0.6 * (s > 0 ? 0.75 : 0.35);
      return push(add(center, add(mul(side, Math.cos(a) * r * 1.5), mul(up, h * r))));
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
}

/** `meridian(a, s)` corre da testa (s = 0) pelo alto (π/2) até a nuca (π), aberto `a` radianos para o lado. */
const meridian = (a, s, lift) => [Math.sin(a), Math.cos(a) * Math.sin(s), Math.cos(a) * Math.cos(s), lift];
/** Variação fixa por mecha (sem aleatório, para o arquivo sair igual a cada rodada). */
const jitter = (k, salt) => Math.sin(k * 12.9898 + salt * 78.233) * 0.5;

shell();

// Topete: perfil (s, altura) da mecha do meio. Nasce na testa, sobe quase reto, faz o rolo um pouco à frente
// da raiz e desce para trás até sumir na casca do cocuruto.
const QUIFF = [[0.5, 0], [0.56, 0.08], [0.7, 0.17], [0.92, 0.2], [1.18, 0.14], [1.45, 0.07], [1.75, 0.025], [2.1, -0.006]];
const layer = (count, spread, gain, width, salt) => {
  for (let k = 0; k < count; k++) {
    const a = (k / (count - 1) - 0.5) * 2 * spread + jitter(k, salt) * 0.04;
    const edge = Math.abs(a) / 0.8; // nas pontas da testa o topete é mais baixo e nasce mais atrás
    const height = gain * (1 - 0.55 * edge * edge) * (1 + jitter(k, salt + 1) * 0.15);
    const ctrl = QUIFF.map(([s, lift], i) => {
      const sweep = -0.16 * smooth(0.6, 2.3, s); // varrido para -X ao ir para trás
      return meridian(a * (1 - 0.15 * (i / QUIFF.length)) + sweep, s + edge * 0.08, lift * height);
    });
    strand(ctrl, width * (1 - 0.3 * edge) * (1 + jitter(k, salt + 2) * 0.12));
  }
};
layer(9, 0.7, 0.85, 0.05, 1); // camada de baixo, mais larga e mais baixa: tapa os vãos
layer(8, 0.6, 1, 0.048, 2); // camada de cima, intercalada

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
  .setIndices(accessor("SCALAR", positions.length > 65535 ? new Uint32Array(tri) : new Uint16Array(tri)));
for (const a of old) a.dispose();
await io.write(OUT, doc);
console.log(`${OUT}: ${positions.length} vértices, ${tri.length / 3} triângulos`);
