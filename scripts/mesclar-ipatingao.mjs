/* global console */
// Mescla as malhas do mapa Ipatingão para reduzir draw calls no Futebol da Firma.
//   node scripts/mesclar-ipatingao.mjs
// Lê apps/web/src/assets/futebol/ipatingao.glb (já gerado por otimizar-ipatingao.mjs) e grava por cima.
//
// O mapa tem uma cor base diferente por material (756 materiais, 747 cores distintas), o que impede o join por
// material. Aqui a cor base de cada primitiva vira atributo COLOR_0 (o three multiplica cor do material por cor de
// vértice, como a fábrica do glTF define) e o fator do material passa a branco. Com isso os materiais que só
// diferiam na cor viram um só (dedup), e o join junta tudo que usa o mesmo material. Posição, UV, normais, texturas
// e cor final de cada triângulo não mudam. O script confere isso antes de gravar: caixa total, triângulos,
// texturas e, por grupo cor+textura+dupla face, triângulos, área e caixa em coordenadas do mundo. Se algo
// divergir, aborta sem gravar.
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, PropertyType } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, flatten, getBounds, join as joinMeshes, prune, transformMesh } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "apps", "web", "src", "assets", "futebol", "ipatingao.glb");
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const r2 = (v) => Math.round(v * 1e2) / 1e2;

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(file);
const docRoot = doc.getRoot();
const scene = docRoot.listScenes()[0];

const hashOf = (tex) => (tex ? createHash("sha1").update(Buffer.from(tex.getImage())).digest("hex").slice(0, 12) : "-");

/** Aparência de um triângulo: cor efetiva (fator do material vezes COLOR_0 do 1º vértice), textura e demais parâmetros. */
function lookOf(prim, vertex, cache) {
  const m = prim.getMaterial();
  let tail = cache.get(m);
  if (!tail) {
    tail = `${hashOf(m.getBaseColorTexture())}|${m.getDoubleSided()}|${r4(m.getRoughnessFactor())}|${r4(m.getMetallicFactor())}|${m.getAlphaMode()}|${m.getEmissiveFactor().map(r4).join(",")}`;
    cache.set(m, tail);
  }
  const f = m.getBaseColorFactor();
  const cv = prim.getAttribute("COLOR_0");
  const c = cv ? cv.getElement(vertex, []) : [1, 1, 1, 1];
  return `${[0, 1, 2, 3].map((i) => r4(f[i] * (c[i] ?? 1))).join(",")}|${tail}`;
}

/** Medidas que têm de ser iguais antes e depois: por aparência, triângulos, área e caixa no mundo. */
function medir() {
  const groups = new Map();
  let tris = 0;
  let draws = 0;
  const cache = new Map();
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  for (const node of docRoot.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const W = node.getWorldMatrix();
    const at = (acc, i, out) => {
      acc.getElement(i, out);
      const [x, y, z] = out;
      out[0] = W[0] * x + W[4] * y + W[8] * z + W[12];
      out[1] = W[1] * x + W[5] * y + W[9] * z + W[13];
      out[2] = W[2] * x + W[6] * y + W[10] * z + W[14];
    };
    for (const prim of mesh.listPrimitives()) {
      draws++;
      const pos = prim.getAttribute("POSITION");
      const idx = prim.getIndices();
      const n = idx.getCount();
      for (let i = 0; i < n; i += 3) {
        const key = lookOf(prim, idx.getScalar(i), cache);
        let g = groups.get(key);
        if (!g) groups.set(key, (g = { tris: 0, area: 0, min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }));
        at(pos, idx.getScalar(i), a);
        at(pos, idx.getScalar(i + 1), b);
        at(pos, idx.getScalar(i + 2), c);
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        g.area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        g.tris++;
        for (const p of [a, b, c]) {
          for (let k = 0; k < 3; k++) {
            g.min[k] = Math.min(g.min[k], p[k]);
            g.max[k] = Math.max(g.max[k], p[k]);
          }
        }
      }
      tris += n / 3;
    }
  }
  const bb = getBounds(scene);
  const textures = docRoot.listTextures().map(hashOf).sort();
  return { groups, tris, draws, meshes: docRoot.listMeshes().length, materials: docRoot.listMaterials().length, bb: [...bb.min, ...bb.max].map(r2), textures };
}

const antes = medir();
const sizeAntes = statSync(file).size;

// Cor base da primitiva vira COLOR_0 e o fator do material vira branco.
for (const mesh of docRoot.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    if (prim.getAttribute("COLOR_0")) continue;
    const f = prim.getMaterial().getBaseColorFactor();
    const n = prim.getAttribute("POSITION").getCount();
    const arr = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) arr.set(f, i * 4);
    prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC4").setArray(arr).setBuffer(docRoot.listBuffers()[0]));
  }
}
for (const m of docRoot.listMaterials()) m.setBaseColorFactor([1, 1, 1, 1]);

await doc.transform(dedup({ propertyTypes: [PropertyType.MATERIAL, PropertyType.TEXTURE] }), flatten());
// Cada nó com malha leva a sua matriz para dentro da geometria e fica na identidade: assim o join só junta vértices
// já no mundo. Ficam de fora o boneco do arquivo (malha com esqueleto, a transformação do nó não vale para ela) e os
// nós com escala quase zero (pálpebras e piscadas dele).
const visivel = (node) => !node.getSkin() && !node.getMesh()?.listPrimitives().some((p) => p.listTargets().length) && !node.getScale().some((v) => Math.abs(v) < 0.01);
for (const node of docRoot.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh || !visivel(node)) continue;
  // malhas usadas por vários nós (instâncias) ganham geometria própria em cada nó
  const own = mesh.clone();
  for (const old of own.listPrimitives()) {
    own.removePrimitive(old);
    const prim = old.clone();
    for (const sem of prim.listSemantics()) prim.setAttribute(sem, prim.getAttribute(sem).clone());
    prim.setIndices(prim.getIndices().clone());
    own.addPrimitive(prim);
  }
  transformMesh(own, node.getWorldMatrix());
  node.setMesh(own).setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
}
await doc.transform(joinMeshes({ filter: visivel }), prune());
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });

const depois = medir();

// ---- prova de equivalência ----
const erros = [];
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
if (!same(antes.bb, depois.bb)) erros.push(`caixa total ${antes.bb} -> ${depois.bb}`);
if (antes.tris !== depois.tris) erros.push(`triângulos ${antes.tris} -> ${depois.tris}`);
if (!same([...new Set(antes.textures)], [...new Set(depois.textures)])) erros.push("lista de texturas diferente");
const tol = 0.02;
if (antes.groups.size !== depois.groups.size) erros.push(`grupos de aparência ${antes.groups.size} -> ${depois.groups.size}`);
for (const [k, g] of antes.groups) {
  const h = depois.groups.get(k);
  if (!h) { erros.push(`aparência sumiu: ${k}`); continue; }
  const areaOk = Math.abs(g.area - h.area) <= Math.max(1e-3, g.area * 1e-4);
  const boxOk = g.min.every((v, i) => Math.abs(v - h.min[i]) < tol) && g.max.every((v, i) => Math.abs(v - h.max[i]) < tol);
  if (g.tris !== h.tris || !areaOk || !boxOk) erros.push(`grupo divergente ${k} tris ${g.tris}/${h.tris} area ${g.area}/${h.area} min ${g.min}/${h.min} max ${g.max}/${h.max}`);
}
console.log(`malhas ${antes.meshes} -> ${depois.meshes}, materiais ${antes.materials} -> ${depois.materials}, draw calls ${antes.draws} -> ${depois.draws}`);
console.log(`triângulos ${antes.tris} -> ${depois.tris}, texturas ${antes.textures.length} -> ${depois.textures.length}, grupos de aparência ${antes.groups.size} -> ${depois.groups.size}`);
console.log("caixa antes ", antes.bb.join(" "));
console.log("caixa depois", depois.bb.join(" "));
if (erros.length) {
  console.error(erros.slice(0, 10).map((e) => e.slice(0, 700)).join("\n"));
  throw new Error(`mapa mudou (${erros.length} divergências), nada gravado`);
}
await io.write(file, doc);
console.log(`ipatingao.glb: ${kb(sizeAntes)} -> ${kb(statSync(file).size)}`);
