/* global console, process */
// Otimiza o mapa do Parque Ipanema para a corrida.
//   node scripts/otimizar-parque.mjs
// Lê assets-src/pistas/modelos-glb/parque-ipanema-3d.glb e grava apps/web/src/assets/itens/parque-ipanema-3d.glb.
//
// O original tem 5,4 milhões de triângulos em 3.482 malhas: cerca de 760 árvores e arbustos, 32 arquibancadas e
// torcedores, cada cópia com nó e malha próprios (um draw call por cópia). Passos:
//  1. dedup + weld: cópias iguais passam a apontar para a mesma malha.
//  2. As malhas repetidas (árvores, arbustos, assentos, torcida) passam pelo simplificador do meshoptimizer.
//     Erro relativo ao tamanho da peça: a silhueta fica, somem as subdivisões que não aparecem de longe.
//  3. instance: cópias da mesma malha, separadas por região do mapa, viram um nó com EXT_mesh_gpu_instancing.
//     O GLTFLoader do three monta isso como InstancedMesh, um draw call por região. O código do jogo não muda.
//  4. meshopt, como os outros modelos (o cliente lê com o MeshoptDecoder de game/gltfLoader.ts).
// O terreno (uma malha só, 259 mil triângulos, com cor de vértice) e as peças únicas ficam como estão.
// Ajustes por variável de ambiente: RAZAO (fração de triângulos que sobra, padrão 0.35), ERRO (padrão 0.015),
// MIN_COPIAS (a partir de quantas cópias a malha é simplificada, padrão 8), CELULA (lado da região em metros, padrão 160).
import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, instance, prune, reorder, simplifyPrimitive, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "assets-src", "pistas", "modelos-glb", "parque-ipanema-3d.glb");
const to = join(root, "apps", "web", "src", "assets", "itens", "parque-ipanema-3d.glb");

const RAZAO = Number(process.env.RAZAO ?? 0.35);
const ERRO = Number(process.env.ERRO ?? 0.015);
const MIN_COPIAS = Number(process.env.MIN_COPIAS ?? 8);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

/** Triângulos e draw calls da cena, contando as cópias de cada nó instanciado. */
function medir(doc) {
  let tris = 0;
  let draws = 0;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const copies = node.getExtension("EXT_mesh_gpu_instancing")?.getAttribute("TRANSLATION")?.getCount() ?? 1;
    for (const prim of mesh.listPrimitives()) {
      draws++;
      tris += ((prim.getIndices() ?? prim.getAttribute("POSITION")).getCount() / 3) * copies;
    }
  }
  return `${(tris / 1e6).toFixed(2)} mi triângulos, ${draws} draw calls`;
}

const doc = await io.read(from);
console.log(`original: ${medir(doc)}`);

await doc.transform(dedup(), weld());

// quantas vezes cada malha aparece na cena
const copias = new Map();
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (mesh) copias.set(mesh, (copias.get(mesh) ?? 0) + 1);
}
let simplificadas = 0;
for (const [mesh, n] of copias) {
  if (n < MIN_COPIAS) continue;
  for (const prim of mesh.listPrimitives()) {
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: RAZAO, error: ERRO });
  }
  simplificadas++;
}
console.log(`${simplificadas} malhas repetidas simplificadas (razão ${RAZAO}, erro ${ERRO})`);

// Um InstancedMesh é descartado pela câmera inteiro ou desenhado inteiro. Com as árvores do mapa todo num lote só,
// a câmera desenharia todas sempre. Por isso as cópias são separadas por região (grade de CELULA metros): cada região
// ganha a sua malha (mesmas geometrias, sem duplicar dados) e vira um lote próprio, que sai de cena quando fica fora
// da câmera.
const CELULA = Number(process.env.CELULA ?? 160);
for (const [mesh, n] of copias) {
  if (n < 2) continue;
  const porCelula = new Map();
  for (const node of doc.getRoot().listNodes()) {
    if (node.getMesh() !== mesh) continue;
    const [x, , z] = node.getWorldTranslation();
    const key = `${Math.floor(x / CELULA)},${Math.floor(z / CELULA)}`;
    porCelula.set(key, [...(porCelula.get(key) ?? []), node]);
  }
  let primeira = true;
  for (const nodes of porCelula.values()) {
    if (primeira) {
      primeira = false; // a primeira região fica com a malha original
      continue;
    }
    const copia = mesh.clone();
    for (const node of nodes) node.setMesh(copia);
  }
}

await doc.transform(instance({ min: 2 }), prune(), reorder({ encoder: MeshoptEncoder, target: "size" }));
console.log(`otimizado: ${medir(doc)}`);

doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
mkdirSync(dirname(to), { recursive: true });
await io.write(to, doc);
console.log(`${kb(statSync(from).size)} -> ${kb(statSync(to).size)}`);
