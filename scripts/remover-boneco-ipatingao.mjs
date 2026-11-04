/* global console, process */
// Tira do ipatingao.glb a "figura" de escala que o modelador deixou no meio do campo (AuxScene > figura > ... e o nó
// "boneco"): o boneco, os ossos, a pele, as 7 animações e as texturas que só ele usa.
//   node scripts/remover-boneco-ipatingao.mjs
// Lê e grava apps/web/src/assets/futebol/ipatingao.glb. O resto do mapa não pode mudar: o script mede, antes e
// depois, triângulos, área e caixa no mundo de cada primitiva que NÃO é da figura, e aborta sem gravar se algo divergir.
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "apps", "web", "src", "assets", "futebol", "ipatingao.glb");
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(file);
const docRoot = doc.getRoot();
const sizeAntes = statSync(file).size;

const figura = new Set();
const marca = (n) => {
  figura.add(n);
  n.listChildren().forEach(marca);
};
for (const n of docRoot.listNodes()) if (n.getName() === "AuxScene" || n.getName() === "boneco") marca(n);
if (!figura.size) {
  console.log("a figura já não está no arquivo");
  process.exit(0);
}

/** Triângulos, área e caixa no mundo de cada primitiva fora da figura. */
function medir() {
  const out = [];
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  for (const node of docRoot.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || figura.has(node)) continue;
    const W = node.getWorldMatrix();
    const at = (acc, i, o) => {
      acc.getElement(i, o);
      const [x, y, z] = o;
      o[0] = W[0] * x + W[4] * y + W[8] * z + W[12];
      o[1] = W[1] * x + W[5] * y + W[9] * z + W[13];
      o[2] = W[2] * x + W[6] * y + W[10] * z + W[14];
    };
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      const idx = prim.getIndices();
      const g = { tris: idx.getCount() / 3, area: 0, min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9], tex: prim.getMaterial().getBaseColorTexture()?.getSize()?.join("x") ?? "-" };
      for (let i = 0; i < idx.getCount(); i += 3) {
        at(pos, idx.getScalar(i), a);
        at(pos, idx.getScalar(i + 1), b);
        at(pos, idx.getScalar(i + 2), c);
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        g.area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        for (const p of [a, b, c]) {
          for (let k = 0; k < 3; k++) {
            g.min[k] = Math.min(g.min[k], p[k]);
            g.max[k] = Math.max(g.max[k], p[k]);
          }
        }
      }
      out.push(g);
    }
  }
  return out.sort((p, q) => q.tris - p.tris || q.area - p.area);
}
const triFigura = [...figura].reduce((s, n) => s + (n.getMesh()?.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0) ?? 0), 0);
const antes = medir();
const texAntes = docRoot.listTextures().length;

for (const an of docRoot.listAnimations()) an.dispose();
for (const s of docRoot.listSkins()) s.dispose();
for (const n of [...figura].reverse()) n.dispose();
await doc.transform(prune());

const depois = medir();
const erros = [];
if (antes.length !== depois.length) erros.push(`primitivas ${antes.length} -> ${depois.length}`);
antes.forEach((g, i) => {
  const h = depois[i];
  const ok = h && g.tris === h.tris && g.tex === h.tex && Math.abs(g.area - h.area) <= g.area * 1e-6 + 1e-6 && g.min.every((v, k) => v === h.min[k]) && g.max.every((v, k) => v === h.max[k]);
  if (!ok) erros.push(`primitiva ${i} mudou`);
});
console.log(`figura: ${figura.size} nós, ${triFigura} triângulos, ${docRoot.listAnimations().length} animações restantes`);
console.log(`resto do mapa: ${antes.reduce((s, g) => s + g.tris, 0)} -> ${depois.reduce((s, g) => s + g.tris, 0)} triângulos, ${antes.length} -> ${depois.length} primitivas, texturas ${texAntes} -> ${docRoot.listTextures().length}`);
if (erros.length) throw new Error(`o mapa mudou fora da figura, nada gravado: ${erros.slice(0, 5).join("; ")}`);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(file, doc);
console.log(`ipatingao.glb: ${kb(sizeAntes)} -> ${kb(statSync(file).size)}`);
