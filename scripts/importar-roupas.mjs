/* global process, console */
// Prepara peças de roupa entregues já no esqueleto do boneco, mas com a malha comprimida
// (KHR_mesh_quantization: posições em inteiros e a escala embutida na pose de amarração de cada osso).
// O jogo compara as posições da peça com as do corpo, em metros, para repartir o peso entre ombro,
// cotovelo e punho (retargetWearable): comprimida, a peça desmonta. Aqui a compressão vai para as
// posições, em float, e a pose de amarração volta a ser a do boneco.
// Roda à mão nos arquivos de assets-src/roupas:  node scripts/importar-roupas.mjs <peça.glb>...
// (depois: node scripts/optimize-assets.mjs)
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });

/** Produto de matrizes 4x4 em coluna maior. */
function mul(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}
/** Inversa de matriz afim (última linha 0 0 0 1). */
function invert(m) {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const r = [(e * i - f * h) / det, -(b * i - c * h) / det, (b * f - c * e) / det, -(d * i - f * g) / det, (a * i - c * g) / det, -(a * f - c * d) / det, (d * h - e * g) / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  const t = [m[12], m[13], m[14]];
  const out = [r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0, 0, 0, 0, 1];
  for (let k = 0; k < 3; k++) out[12 + k] = -(out[k] * t[0] + out[4 + k] * t[1] + out[8 + k] * t[2]);
  return out;
}
/** Pose de repouso de cada osso do boneco, no mundo: a inversa da amarração dele. */
const bodySkin = (await io.read(join(dirname(fileURLToPath(import.meta.url)), "..", "assets-src", "characters", "boneco_completo.glb"))).getRoot().listSkins()[0];
const rest = new Map(bodySkin.listJoints().map((j, i) => [j.getName(), invert(bodySkin.getInverseBindMatrices().getElement(i, []))]));
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

for (const path of process.argv.slice(2)) {
  const doc = await io.read(path);
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];
  const done = new Set();
  for (const node of root.listNodes()) {
    const skin = node.getSkin();
    if (!node.getMesh() || !skin) continue;
    const ibm = skin.getInverseBindMatrices();
    // compressão Q = (osso do boneco em repouso) · (amarração da peça), igual para todos os ossos; os ossos
    // do arquivo da peça podem não estar em repouso, por isso a pose vem do boneco
    const qs = skin.listJoints().map((j, i) => mul(rest.get(j.getName()), ibm.getElement(i, [])));
    const q = qs[0];
    const off = Math.max(...qs.map((m) => Math.max(...m.map((v, k) => Math.abs(v - q[k])))));
    if (off > 1e-3) throw new Error(`${path}: a amarração muda de osso para osso (${off.toFixed(4)}), não é só compressão`);
    const identity = q.every((v, k) => Math.abs(v - (k % 5 === 0 ? 1 : 0)) < 1e-6);
    if (identity) continue;
    for (const prim of node.getMesh().listPrimitives()) {
      const P = prim.getAttribute("POSITION");
      if (done.has(P)) continue;
      done.add(P);
      const pos = new Float32Array(P.getCount() * 3);
      for (let v = 0; v < P.getCount(); v++) pos.set(apply(q, P.getElement(v, [])), v * 3);
      prim.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(pos).setBuffer(buffer));
      // a escala da compressão é igual nos três eixos: a normal só volta a ser float
      const N = prim.getAttribute("NORMAL");
      if (N && N.getComponentType() !== 5126) {
        const nor = new Float32Array(N.getCount() * 3);
        for (let v = 0; v < N.getCount(); v++) {
          const n = N.getElement(v, []);
          const l = Math.hypot(n[0], n[1], n[2]) || 1;
          nor.set([n[0] / l, n[1] / l, n[2] / l], v * 3);
        }
        prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(nor).setBuffer(buffer));
      }
    }
    // amarração sem a compressão: a do boneco
    const iq = invert(q);
    skin.listJoints().forEach((j, i) => ibm.setElement(i, mul(ibm.getElement(i, []), iq)));
  }
  // em assets-src a peça fica sem a compressão do meshopt: quem comprime é o optimize-assets
  for (const ext of root.listExtensionsUsed()) if (ext.extensionName === "EXT_meshopt_compression") ext.dispose();
  await io.write(path, doc);
  console.log(`${path}: ok`);
}
