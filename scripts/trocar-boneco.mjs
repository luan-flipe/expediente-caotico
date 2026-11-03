/* global process */
// Troca assets-src/characters/boneco_completo.glb por um boneco novo do designer, com o mesmo esqueleto.
// O modelo novo é pesado (mais de 100 mil vértices) e não entra no repositório: o caminho vem na linha de comando.
// Roda à mão:  node scripts/trocar-boneco.mjs <modelo.glb>
// Depois: node scripts/ajustar-roupas-proporcao.mjs <boneco antigo> (as roupas foram feitas no corpo antigo)
// e node scripts/optimize-assets.mjs.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { simplify, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "assets-src", "characters", "boneco_completo.glb");
// o corpo do boneco antigo tinha uns 15 mil vértices
const RATIO = 0.09;
// nas animações o braço do boneco novo cai colado no tronco e a manga atravessa a camisa: os ombros abrem
// isto (radianos) para o lado em todos os clipes. A pose de amarração não muda, as roupas continuam valendo.
const ARM_SPREAD = 0.2;

const mulQuat = ([ax, ay, az, aw], [bx, by, bz, bw]) => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];

const [input] = process.argv.slice(2);
await Promise.all([MeshoptSimplifier.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(input);
const old = await io.read(OUT);

// o rosto liso do jogo (#60): cor, relevo e rugosidade do boneco atual, no mesmo mapa UV
const skin = (d) => d.getRoot().listMaterials().find((m) => m.getName() === "model");
const [from, to] = [skin(old), skin(doc)];
for (const get of ["getBaseColorTexture", "getNormalTexture", "getMetallicRoughnessTexture"]) {
  const src = from[get]();
  to[get]().setImage(src.getImage()).setMimeType(src.getMimeType()).setURI(src.getURI());
}

// giro em volta do eixo de frente, no espaço do tronco: o braço direito (x negativo) abre para -x
const done = new Set();
for (const anim of doc.getRoot().listAnimations())
  for (const channel of anim.listChannels()) {
    const side = /^ombro_([DE])$/.exec(channel.getTargetNode()?.getName() ?? "")?.[1];
    const out = channel.getSampler().getOutput();
    if (!side || channel.getTargetPath() !== "rotation" || done.has(out)) continue;
    done.add(out);
    const half = ((side === "D" ? -1 : 1) * ARM_SPREAD) / 2;
    const spread = [0, 0, Math.sin(half), Math.cos(half)];
    for (let k = 0; k < out.getCount(); k++) out.setElement(k, mulQuat(spread, out.getElement(k, [])));
  }

await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: 0.01 }));
await io.write(OUT, doc);
