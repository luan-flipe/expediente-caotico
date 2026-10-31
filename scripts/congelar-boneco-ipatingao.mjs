/* global console, process */
// Congela o boneco esqueletado que veio dentro do ipatingao.glb ("figura" de escala do modelador, nó "boneco").
//   node scripts/congelar-boneco-ipatingao.mjs
// O cliente nunca toca as animações do mapa, então o boneco sempre aparece na pose do arquivo. O script aplica o
// skinning uma vez (posição e normal de cada vértice no mundo, mesma conta do three: soma dos pesos vezes
// matriz do osso vezes matriz inversa de bind), grava a malha como estática no mundo, solta o esqueleto da malha e
// põe o nó na raiz da cena sem transformação. Nada some: a malha, o material, a textura e os ossos continuam no arquivo.
// Confere antes de gravar: triângulos, material e caixa no mundo (antes e depois do skinning). Aborta se divergir.
// Rode depois de otimizar-ipatingao.mjs; mesclar-ipatingao.mjs pode rodar antes ou depois.
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "apps", "web", "src", "assets", "futebol", "ipatingao.glb");
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(file);
const scene = doc.getRoot().listScenes()[0];
const sizeAntes = statSync(file).size;

const skinned = doc.getRoot().listNodes().filter((n) => n.getSkin() && n.getMesh());
if (!skinned.length) {
  console.log("nenhuma malha com esqueleto: nada a fazer");
  process.exit(0);
}

const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};

const stats = [];
for (const node of skinned) {
  const skin = node.getSkin();
  const ibm = skin.getInverseBindMatrices();
  // J = matriz do osso no mundo vezes inversa de bind
  const J = skin.listJoints().map((j, i) => mul(j.getWorldMatrix(), ibm.getElement(i, [])));
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute("POSITION");
    const nor = prim.getAttribute("NORMAL");
    const jt = prim.getAttribute("JOINTS_0");
    const wt = prim.getAttribute("WEIGHTS_0");
    const n = pos.getCount();
    const P = new Float32Array(n * 3);
    const N = nor ? new Float32Array(n * 3) : null;
    const p = [0, 0, 0], nn = [0, 0, 0], j4 = [0, 0, 0, 0], w4 = [0, 0, 0, 0];
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < n; v++) {
      pos.getElement(v, p);
      if (nor) nor.getElement(v, nn);
      jt.getElement(v, j4);
      wt.getElement(v, w4);
      const m = new Array(16).fill(0);
      for (let k = 0; k < 4; k++) if (w4[k]) for (let e = 0; e < 16; e++) m[e] += w4[k] * J[j4[k]][e];
      for (let r = 0; r < 3; r++) {
        P[v * 3 + r] = m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r];
        min[r] = Math.min(min[r], P[v * 3 + r]);
        max[r] = Math.max(max[r], P[v * 3 + r]);
      }
      if (N) {
        const x = m[0] * nn[0] + m[4] * nn[1] + m[8] * nn[2];
        const y = m[1] * nn[0] + m[5] * nn[1] + m[9] * nn[2];
        const z = m[2] * nn[0] + m[6] * nn[1] + m[10] * nn[2];
        const l = Math.hypot(x, y, z) || 1;
        N.set([x / l, y / l, z / l], v * 3);
      }
    }
    stats.push({ nome: node.getName(), tris: prim.getIndices().getCount() / 3, min: min.map((v) => +v.toFixed(2)), max: max.map((v) => +v.toFixed(2)), mat: prim.getMaterial().getName() });
    pos.setArray(P);
    nor?.setArray(N);
    prim.setAttribute("JOINTS_0", null);
    prim.setAttribute("WEIGHTS_0", null);
  }
  // o nó vai para a raiz da cena sem transformação: os vértices já estão no mundo
  const skinProp = node.getSkin();
  node.setSkin(null);
  skinProp.dispose();
  for (const parent of node.listParents()) if (parent !== doc.getRoot() && parent.removeChild) parent.removeChild(node);
  node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  scene.addChild(node);
}

// conferência: o mesmo cálculo refeito sobre a malha estática tem de dar a mesma caixa e os mesmos triângulos
for (const node of skinned) {
  for (const [i, prim] of node.getMesh().listPrimitives().entries()) {
    const pos = prim.getAttribute("POSITION");
    const lo = pos.getMin([]).map((v) => +v.toFixed(2));
    const hi = pos.getMax([]).map((v) => +v.toFixed(2));
    const s = stats.shift();
    const ok = s.tris === prim.getIndices().getCount() / 3 && lo.every((v, k) => Math.abs(v - s.min[k]) < 0.011) && hi.every((v, k) => Math.abs(v - s.max[k]) < 0.011) && !prim.getAttribute("JOINTS_0");
    console.log(`${node.getName()}[${i}] ${s.tris} triângulos, caixa no mundo ${s.min} .. ${s.max}, material "${s.mat}", ${ok ? "confere" : "DIVERGE"}`);
    if (!ok) throw new Error("boneco mudou, nada gravado");
  }
}
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(file, doc);
console.log(`ipatingao.glb: ${kb(sizeAntes)} -> ${kb(statSync(file).size)}`);
