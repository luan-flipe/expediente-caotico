/* global console, process */
// Simplifica o mapa Ipatingão conforme a distância ao centro do campo, para o Futebol da Firma desenhar menos triângulos.
//   node scripts/simplificar-ipatingao.mjs
// Lê apps/web/src/assets/futebol/ipatingao.glb (já mesclado por mesclar-ipatingao.mjs e sem a figura) e grava por cima.
//
// A distância é a elíptica das arquibancadas: r = hypot(x / 108, z / 89) (a mesma de STANDS em torcidaLayout.ts; o
// gramado e o campo ficam em r < 0,65 e os assentos da torcida em 0,985 a 1,12). Cada primitiva é cortada em faixas
// pelo MENOR r entre os três vértices do triângulo (triângulo que encosta na faixa de perto fica de perto):
//   perto  r < 1,17      intacta: campo, gramado, linhas, degraus onde há torcida
//   meio   1,17 a 1,5    suave: fundo das arquibancadas
//   longe  r >= 1,5      forte: entorno, cobertura e fundo distante
// Cada faixa de meio/longe passa pelo simplificador do meshoptimizer com a borda travada (LockBorder: a costura entre
// faixas e os furos do modelo não se mexem, então não abre buraco), normais e cor de vértice como atributos (as
// divisões de cor não se perdem) e erro máximo ABSOLUTO em metros. Primitivas com textura não entram (UV).
// Costuras (vértice que serve a mais de uma faixa ou primitiva, por posição) ficam travadas, então as superfícies
// vizinhas continuam encostadas. As caixas fechadas de 12 triângulos com menos de 2 m (os torcedores de caixa do mapa)
// não simplificam; de meio e de longe perdem as faces de baixo e de trás (que ninguém vê) e uma parte é poupada.
// Confere no fim a altura dos assentos de assentosTorcida.json contra a malha nova (aborta se algum passar de 2 cm).
// SO_MEDIR=1 só mede, sem gravar. Ajustes por variável de ambiente: ERRO_MEIO, RAZAO_MEIO, POUPA_MEIO, ERRO_LONGE...
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { getBounds, prune } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "apps", "web", "src", "assets", "futebol", "ipatingao.glb");
const seatsFile = join(root, "apps", "web", "src", "futebol", "assentosTorcida.json");
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

const STANDS_A = 108;
const STANDS_B = 89;
/** Faixas: limite superior de r, razão de triângulos que sobram (no máximo) e erro absoluto máximo (m). */
const FAIXAS = [
  { nome: "perto", ate: 1.17, razao: 1, erro: 0, flags: [], poupa: 1 },
  { nome: "meio", ate: 1.5, razao: Number(process.env.RAZAO_MEIO ?? 0.2), erro: Number(process.env.ERRO_MEIO ?? 2), flags: ["ErrorAbsolute"], poupa: Number(process.env.POUPA_MEIO ?? 0.55) },
  { nome: "longe", ate: Infinity, razao: Number(process.env.RAZAO_LONGE ?? 0.03), erro: Number(process.env.ERRO_LONGE ?? 8), flags: ["ErrorAbsolute"], poupa: Number(process.env.POUPA_LONGE ?? 0.2) },
];
const MIN_TRIS = 200;
const PESO_COR = Number(process.env.PESO_COR ?? 0.01);
const PESO_NORMAL = Number(process.env.PESO_NORMAL ?? 0.01);
const rOf = (x, z) => Math.hypot(x / STANDS_A, z / STANDS_B);

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(file);
const docRoot = doc.getRoot();
const scene = docRoot.listScenes()[0];
const buffer = docRoot.listBuffers()[0];
const sizeAntes = statSync(file).size;

const prims = [];
for (const node of docRoot.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const W = node.getWorldMatrix();
  if (W.some((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) > 1e-6)) throw new Error("esperava os nós do mapa sem transformação (rode mesclar-ipatingao.mjs antes)");
  for (const prim of mesh.listPrimitives()) prims.push({ mesh, prim });
}

/** Chave de posição (1/10000 m) para achar bordas abertas independente de vértices duplicados. */
const pk = (x, y, z) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
/** Bordas abertas (arestas que só um triângulo usa) do mapa inteiro, por posição. */
function bordasAbertas() {
  const cont = new Map();
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  for (const { prim } of prims) {
    const pos = prim.getAttribute("POSITION");
    const idx = prim.getIndices();
    for (let i = 0; i < idx.getCount(); i += 3) {
      pos.getElement(idx.getScalar(i), a);
      pos.getElement(idx.getScalar(i + 1), b);
      pos.getElement(idx.getScalar(i + 2), c);
      const k = [pk(...a), pk(...b), pk(...c)];
      for (const [p, q] of [[0, 1], [1, 2], [2, 0]]) {
        if (k[p] === k[q]) continue;
        const e = k[p] < k[q] ? `${k[p]}|${k[q]}` : `${k[q]}|${k[p]}`;
        cont.set(e, (cont.get(e) ?? 0) + 1);
      }
    }
  }
  return new Set([...cont].filter(([, n]) => n === 1).map(([e]) => e));
}
const contagem = () => Object.fromEntries(FAIXAS.map((f) => [f.nome, 0]));
function triPorFaixa() {
  const out = contagem();
  const p = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const { prim } of prims) {
    const pos = prim.getAttribute("POSITION");
    const idx = prim.getIndices();
    for (let i = 0; i < idx.getCount(); i += 3) {
      let r = Infinity;
      for (let k = 0; k < 3; k++) {
        pos.getElement(idx.getScalar(i + k), p[k]);
        r = Math.min(r, rOf(p[k][0], p[k][2]));
      }
      out[FAIXAS.find((f) => r < f.ate).nome]++;
    }
  }
  return out;
}

/**
 * Os "torcedores" do mapa são caixas fechadas de 12 triângulos com menos de 2 m. Caixas assim não simplificam (já são o
 * mínimo), então são tratadas à parte: de perto ficam como estão; de meio e de longe saem as faces que ninguém vê
 * (a de baixo, apoiada no degrau, e a de trás, que olha para fora do estádio) e uma parte das caixas é poupada de forma
 * determinística (o resto da arquibancada continua cheio).
 */
function achaCaixas(pos, ia, keys) {
  const raiz = new Map();
  const acha = (k) => {
    let r = k;
    while (raiz.get(r) !== r) r = raiz.get(r);
    for (let c = k; c !== r; ) {
      const n = raiz.get(c);
      raiz.set(c, r);
      c = n;
    }
    return r;
  };
  for (let i = 0; i < ia.length; i++) {
    const v = ia[i];
    const k = (keys[v] ??= pk(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]));
    if (!raiz.has(k)) raiz.set(k, k);
  }
  for (let i = 0; i < ia.length; i += 3) {
    const a = acha(keys[ia[i]]);
    for (let k = 1; k < 3; k++) {
      const b = acha(keys[ia[i + k]]);
      if (a !== b) raiz.set(b, a);
    }
  }
  const comp = new Map();
  for (let i = 0; i < ia.length; i += 3) {
    const r = acha(keys[ia[i]]);
    const c = comp.get(r) ?? { tris: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    comp.set(r, c);
    c.tris.push(i);
    for (let k = 0; k < 3; k++) for (let q = 0; q < 3; q++) {
      const v = pos[ia[i + k] * 3 + q];
      c.min[q] = Math.min(c.min[q], v);
      c.max[q] = Math.max(c.max[q], v);
    }
  }
  return [...comp.values()].filter((c) => c.tris.length === 12 && c.max.every((v, q) => v - c.min[q] <= 2));
}

const bbAntes = getBounds(scene);
const faixasAntes = triPorFaixa();
const bordasAntes = bordasAbertas();
let erroMax = 0;
const erroPorFaixa = contagem();

// 1ª passada: cada triângulo vai para uma faixa; vértice (por posição) que serve a mais de um grupo (faixa ou primitiva)
// é costura e fica travado, senão as superfícies vizinhas se separariam. Bordas livres de uma peça podem encolher (erro limitado).
const plano = [];
let escondidas = 0;
const dono = new Map();
let gid = 0;
for (const { mesh, prim } of prims) {
  const idx = prim.getIndices();
  if (idx.getCount() / 3 < MIN_TRIS || prim.getAttribute("TEXCOORD_0")) {
    // fora da simplificação, mas ainda dona das suas posições
    const pos = prim.getAttribute("POSITION");
    const p = [0, 0, 0];
    const g = gid++;
    for (let i = 0; i < idx.getCount(); i++) {
      pos.getElement(idx.getScalar(i), p);
      const k = pk(...p);
      dono.set(k, dono.has(k) && dono.get(k) !== g ? -1 : g);
    }
    continue;
  }
  const pos = prim.getAttribute("POSITION").getArray();
  const ia = idx.getArray();
  const ids = FAIXAS.map(() => gid++);
  const keys = new Array(pos.length / 3);
  const grupos = [...FAIXAS, null].map(() => []);
  // caixas de torcedor de meio e de longe: faces escondidas fora, parte poupada; as de perto seguem o fluxo normal
  const caixas = achaCaixas(pos, ia, keys);
  const doCaixa = new Uint8Array(ia.length / 3);
  const idCaixas = gid++;
  for (const c of caixas) {
    const cx = (c.min[0] + c.max[0]) / 2, cz = (c.min[2] + c.max[2]) / 2;
    const f = FAIXAS.findIndex((x) => rOf(cx, cz) < x.ate);
    if (f === 0) continue;
    for (const t of c.tris) doCaixa[t / 3] = 1;
    const h = (Math.imul(Math.round(cx * 100), 73856093) ^ Math.imul(Math.round(cz * 100), 19349663)) >>> 0;
    if ((h % 1000) / 1000 >= FAIXAS[f].poupa) continue;
    const d = Math.hypot(cx, cz) || 1;
    for (const t of c.tris) {
      const a = [0, 1, 2].map((k) => [pos[ia[t + k] * 3], pos[ia[t + k] * 3 + 1], pos[ia[t + k] * 3 + 2]]);
      const e1 = a[1].map((v, q) => v - a[0][q]), e2 = a[2].map((v, q) => v - a[0][q]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const l = Math.hypot(...n) || 1;
      const embaixo = n[1] / l < -0.99;
      const atras = (n[0] * cx + n[2] * cz) / (l * d) > 0.9;
      if (embaixo || atras) {
        escondidas++;
        continue;
      }
      grupos[FAIXAS.length].push(ia[t], ia[t + 1], ia[t + 2]);
      for (let k = 0; k < 3; k++) {
        const key = keys[ia[t + k]];
        dono.set(key, dono.has(key) && dono.get(key) !== idCaixas ? -1 : idCaixas);
      }
    }
  }
  for (let i = 0; i < ia.length; i += 3) {
    if (doCaixa[i / 3]) continue;
    let r = Infinity;
    for (let k = 0; k < 3; k++) r = Math.min(r, rOf(pos[ia[i + k] * 3], pos[ia[i + k] * 3 + 2]));
    const f = FAIXAS.findIndex((x) => r < x.ate);
    grupos[f].push(ia[i], ia[i + 1], ia[i + 2]);
    for (let k = 0; k < 3; k++) {
      const v = ia[i + k];
      const key = (keys[v] ??= pk(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]));
      dono.set(key, dono.has(key) && dono.get(key) !== ids[f] ? -1 : ids[f]);
    }
  }
  plano.push({ mesh, prim, grupos, keys });
}

for (const { mesh, prim, grupos, keys } of plano) {
  const pos = prim.getAttribute("POSITION").getArray();
  const nor = prim.getAttribute("NORMAL")?.getArray();
  const colAcc = prim.getAttribute("COLOR_0");
  const col = colAcc?.getArray();
  const colN = colAcc?.getElementSize() ?? 0;
  const novas = [];
  grupos.forEach((tris, f) => {
    if (!tris.length) return;
    let indices = Uint32Array.from(tris);
    const { razao, erro } = FAIXAS[f] ?? { razao: 1, erro: 0 };
    if (razao < 1 && tris.length / 3 >= 30) {
      // atributos para o simplificador: normal (peso baixo) e cor de vértice (peso alto, as divisões de cor ficam)
      const n = pos.length / 3;
      const at = new Float32Array(n * 6);
      for (let v = 0; v < n; v++) {
        if (nor) at.set(nor.subarray(v * 3, v * 3 + 3), v * 6);
        if (col) at.set(col.subarray(v * colN, v * colN + 3), v * 6 + 3);
      }
      const trava = new Uint8Array(n);
      for (let v = 0; v < n; v++) if (keys[v] !== undefined && dono.get(keys[v]) === -1) trava[v] = 1;
      const alvo = Math.max(3, Math.floor((indices.length * razao) / 3) * 3);
      const [res, err] = MeshoptSimplifier.simplifyWithAttributes(indices, pos, 3, at, 6, [PESO_NORMAL, PESO_NORMAL, PESO_NORMAL, PESO_COR, PESO_COR, PESO_COR], trava, alvo, erro, FAIXAS[f].flags);
      if (process.env.DBG) console.log(`prim ${plano.findIndex((q) => q.prim === prim)} faixa ${FAIXAS[f].nome}: ${tris.length / 3} -> ${res.length / 3}, travados ${trava.reduce((a, b) => a + b, 0)} de ${n}`);
      indices = res;
      erroMax = Math.max(erroMax, err);
      erroPorFaixa[FAIXAS[f].nome] = Math.max(erroPorFaixa[FAIXAS[f].nome], err);
    }
    // só os vértices usados
    const remap = new Int32Array(pos.length / 3).fill(-1);
    let n = 0;
    for (const v of indices) if (remap[v] < 0) remap[v] = n++;
    const P = new Float32Array(n * 3), N = nor ? new Float32Array(n * 3) : null, C = col ? new Float32Array(n * colN) : null;
    for (let v = 0; v < remap.length; v++) {
      const o = remap[v];
      if (o < 0) continue;
      P.set(pos.subarray(v * 3, v * 3 + 3), o * 3);
      N?.set(nor.subarray(v * 3, v * 3 + 3), o * 3);
      C?.set(col.subarray(v * colN, v * colN + colN), o * colN);
    }
    const I = n > 65535 ? new Uint32Array(indices.length) : new Uint16Array(indices.length);
    indices.forEach((v, i) => (I[i] = remap[v]));
    const np = doc.createPrimitive().setMaterial(prim.getMaterial());
    const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    np.setAttribute("POSITION", acc("VEC3", P));
    if (N) np.setAttribute("NORMAL", acc("VEC3", N));
    if (C) np.setAttribute("COLOR_0", acc(colN === 4 ? "VEC4" : "VEC3", C));
    np.setIndices(acc("SCALAR", I));
    novas.push(np);
  });
  mesh.removePrimitive(prim);
  for (const np of novas) mesh.addPrimitive(np);
}
await doc.transform(prune());
// a lista de primitivas mudou: remonta
prims.length = 0;
for (const node of docRoot.listNodes()) for (const prim of node.getMesh()?.listPrimitives() ?? []) prims.push({ prim });

const faixasDepois = triPorFaixa();
const bordasDepois = bordasAbertas();
const novasBordas = [...bordasDepois].filter((e) => !bordasAntes.has(e)).length;
const bbDepois = getBounds(scene);
const f1 = (a) => a.map((v) => +v.toFixed(2)).join(" ");

// altura dos assentos contra os degraus da malha nova (triângulos voltados para cima, altura <= 12 m)
const seats = JSON.parse(readFileSync(seatsFile, "utf8"));
const CELL = 2;
const cells = new Map();
const tris = [];
{
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  for (const { prim } of prims) {
    const pos = prim.getAttribute("POSITION");
    const idx = prim.getIndices();
    for (let i = 0; i < idx.getCount(); i += 3) {
      pos.getElement(idx.getScalar(i), a);
      pos.getElement(idx.getScalar(i + 1), b);
      pos.getElement(idx.getScalar(i + 2), c);
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const ny = e1[2] * e2[0] - e1[0] * e2[2];
      const len = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], ny, e1[0] * e2[1] - e1[1] * e2[0]);
      if (len < 1e-9 || ny / len < 0.6) continue;
      const t = tris.length / 9;
      tris.push(...a, ...b, ...c);
      for (let cx = Math.floor(Math.min(a[0], b[0], c[0]) / CELL); cx <= Math.floor(Math.max(a[0], b[0], c[0]) / CELL); cx++) {
        for (let cz = Math.floor(Math.min(a[2], b[2], c[2]) / CELL); cz <= Math.floor(Math.max(a[2], b[2], c[2]) / CELL); cz++) {
          const k = cx * 4096 + cz;
          if (!cells.has(k)) cells.set(k, []);
          cells.get(k).push(t);
        }
      }
    }
  }
}
function altura(x, z) {
  let best = -1;
  for (const t of cells.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL)) ?? []) {
    const o = t * 9;
    const ax = tris[o], az = tris[o + 2];
    const v0x = tris[o + 3] - ax, v0z = tris[o + 5] - az, v1x = tris[o + 6] - ax, v1z = tris[o + 8] - az;
    const den = v0x * v1z - v1x * v0z;
    if (Math.abs(den) < 1e-12) continue;
    const px = x - ax, pz = z - az;
    const u = (px * v1z - v1x * pz) / den, w = (v0x * pz - px * v0z) / den;
    if (u < 0 || w < 0 || u + w > 1) continue;
    const y = tris[o + 1] + u * (tris[o + 4] - tris[o + 1]) + w * (tris[o + 7] - tris[o + 1]);
    if (y > best && y <= 12) best = y;
  }
  return best;
}
let seatMax = 0, seatBad = 0;
for (let i = 0; i < seats.length; i += 4) {
  const h = altura(seats[i], seats[i + 2]);
  const d = h < 0 ? 99 : Math.abs(h - seats[i + 1]);
  seatMax = Math.max(seatMax, d);
  if (d > 0.02) seatBad++;
}

console.log("triângulos por faixa de distância (antes -> depois):");
for (const f of FAIXAS) console.log(`  ${f.nome.padEnd(6)} r < ${String(f.ate).padEnd(8)} ${faixasAntes[f.nome]} -> ${faixasDepois[f.nome]}  (erro máx ${erroPorFaixa[f.nome].toFixed(3)} m)`);
const tot = (o) => Object.values(o).reduce((s, v) => s + v, 0);
console.log(`total ${tot(faixasAntes)} -> ${tot(faixasDepois)} (${((1 - tot(faixasDepois) / tot(faixasAntes)) * 100).toFixed(1)}% a menos), erro máximo ${erroMax.toFixed(3)} m, primitivas ${prims.length}`);
console.log(`faces escondidas de torcedores removidas: ${escondidas}`);
console.log(`bordas abertas ${bordasAntes.size} -> ${bordasDepois.size}, novas ${novasBordas}`);
console.log(`caixa antes ${f1([...bbAntes.min, ...bbAntes.max])} | depois ${f1([...bbDepois.min, ...bbDepois.max])}`);
console.log(`assentos: ${seats.length / 4}, maior diferença de altura ${seatMax.toFixed(3)} m, acima de 2 cm: ${seatBad}`);
if (process.env.SO_MEDIR) process.exit(0);
if (seatBad > 0) throw new Error("a simplificação mexeu nos degraus dos assentos, nada gravado");
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(file, doc);
console.log(`ipatingao.glb: ${kb(sizeAntes)} -> ${kb(statSync(file).size)}`);
