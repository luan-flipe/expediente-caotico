/* global process */
// Grava um cabelo em assets-src/roupas/cabelos a partir de um modelo gerado por IA, encaixado na cabeça e preso ao osso cabeca.
// O modelo original é pesado (mais de 500 mil vértices) e não entra no repositório: o caminho vem na linha de comando.
// Roda à mão:  node scripts/importar-cabelo.mjs <modelo.glb> <saida.glb> <largura> <topo> (depois: node scripts/optimize-assets.mjs)
// Cabelo novo também entra na lista WEARABLES do optimize-assets.mjs.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { simplify, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(root, "assets-src", "roupas", "cabelos");
// o esqueleto vem do cabelo 01
const TEMPLATE = join(DIR, "01_romarinho.glb");

const VERTICES = 15000; // menos que isso perde as pontas das mechas
const [input, output, width, top] = process.argv.slice(2);
const WIDTH = Number(width); // largura da cabeça com o cabelo (01: 1.1)
const TOP = Number(top); // altura do topo (01: 1.98)
const CENTER_Z = -0.025; // centro da cabeça de frente para trás

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const hair = await io.read(input);
const src = hair.getRoot().listMeshes()[0].listPrimitives()[0];
// normais e cores repartem a malha em pedaços que a simplificação não consegue juntar
for (const semantic of src.listSemantics()) if (semantic !== "POSITION") src.setAttribute(semantic, null);
await hair.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: VERTICES / src.getAttribute("POSITION").getCount(), error: 0.02 }),
);

const position = src.getAttribute("POSITION");
const min = position.getMin([]);
const max = position.getMax([]);
const scale = WIDTH / (max[0] - min[0]);
const midX = (min[0] + max[0]) / 2;
const midZ = (min[2] + max[2]) / 2;
const count = position.getCount();
const positions = new Float32Array(count * 3);
for (let v = 0; v < count; v++) {
  const [x, y, z] = position.getElement(v, []);
  positions.set([(x - midX) * scale, TOP + (y - max[1]) * scale, CENTER_Z + (z - midZ) * scale], v * 3);
}

// normais suaves: cada vértice soma as faces em volta, pesadas pela área
const indices = src.getIndices().getArray();
const normals = new Float32Array(count * 3);
const point = (v) => positions.subarray(v * 3, v * 3 + 3);
for (let i = 0; i < indices.length; i += 3) {
  const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
  const [pa, pb, pc] = [point(a), point(b), point(c)];
  const [ux, uy, uz] = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
  const [vx, vy, vz] = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
  const face = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  for (const v of [a, b, c]) for (let k = 0; k < 3; k++) normals[v * 3 + k] += face[k];
}
for (let v = 0; v < count; v++) {
  const n = normals.subarray(v * 3, v * 3 + 3);
  const length = Math.hypot(n[0], n[1], n[2]) || 1;
  for (let k = 0; k < 3; k++) n[k] /= length;
}

const doc = await io.read(TEMPLATE);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const node = doc.getRoot().listNodes().find((n) => n.getMesh());
const head = node.getSkin().listJoints().findIndex((j) => j.getName() === "cabeca");
const joints = new Uint8Array(count * 4);
const weights = new Float32Array(count * 4);
for (let v = 0; v < count; v++) {
  joints[v * 4] = head;
  weights[v * 4] = 1;
}
const buffer = doc.getRoot().listBuffers()[0];
const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
for (const semantic of prim.listSemantics()) prim.setAttribute(semantic, null);
prim.setAttribute("POSITION", accessor("VEC3", positions));
prim.setAttribute("NORMAL", accessor("VEC3", normals));
prim.setAttribute("JOINTS_0", accessor("VEC4", joints));
prim.setAttribute("WEIGHTS_0", accessor("VEC4", weights));
prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(indices)).setBuffer(buffer));
await io.write(join(DIR, output), doc);
