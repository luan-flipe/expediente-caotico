/* global console */
// Otimiza o mapa do estádio Ipatingão para o modo Futebol da Firma.
//   node scripts/otimizar-ipatingao.mjs
// Lê assets-src/futebol/ipatingao.glb e grava apps/web/src/assets/futebol/ipatingao.glb.
//
// O original (cerca de 18 MB, 13,5 mil nós, 950 materiais) NÃO vai para o git (está no .gitignore).
// Para gerar de novo, copie o original (ipatingao-3d.glb) para assets-src/futebol/ipatingao.glb.
//
// Medidas do modelo original (eixo para cima = Y, 1 unidade = 1 m):
//  - O gramado é a malha com a textura 340x520 (listras com as linhas do campo): fica em y = 0.5,
//    x 2.0..75.7 e z 224.3..332.5, centro (38.85, 278.4). O eixo comprido do campo é Z.
//  - Dentro da textura as linhas ocupam só uma parte: o script mede (pixels brancos) e calcula o
//    tamanho das linhas, cerca de 99,9 m (comprimento) x 64,2 m (largura).
// Transformação aplicada no próprio .glb (nó "Ipatingao" na raiz da cena):
//  - leva o centro do gramado para a origem, gira 90 graus em Y (eixo comprido vira X), escala 1
//    (o modelo já está em metros) e põe o gramado em y = 0.
//  - O campo 4v4 (60 x 38 m) cabe com folga dentro das linhas. O cliente só carrega e põe na origem.
//  - O tamanho do gramado (meio comprimento e meia largura das linhas) é impresso no fim e vive em
//    IPATINGAO, em packages/shared/src/futebol/balance.ts.
// Restrição do projeto: o mapa não muda de aparência. Passos: dedup de dados idênticos, flatten, weld sem
// tolerância, join por material, texturas WebP na mesma resolução e meshopt (posições em float, sem
// quantizar). Nada de simplify. O cliente lê com o MeshoptDecoder (apps/web/src/game/gltfLoader.ts).
import { Buffer } from "node:buffer";
import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, flatten, getBounds, join as joinMeshes, prune, reorder, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "assets-src", "futebol", "ipatingao.glb");
const to = join(root, "apps", "web", "src", "assets", "futebol", "ipatingao.glb");

const SCALE = 1;
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(from);
const docRoot = doc.getRoot();
const scene = docRoot.listScenes()[0];

await doc.transform(dedup(), flatten());

// 2. Posição do gramado (malha com a textura 340x520) e tamanho das linhas dentro dela.
let pitchNode = null;
for (const n of docRoot.listNodes()) {
  const tex = n.getMesh()?.listPrimitives()[0]?.getMaterial()?.getBaseColorTexture();
  if (tex && tex.getSize()?.join("x") === "340x520") pitchNode = n;
}
if (!pitchNode) throw new Error("não achei a malha do gramado (textura 340x520)");
const pb = getBounds(pitchNode);
const cx = (pb.min[0] + pb.max[0]) / 2;
const cz = (pb.min[2] + pb.max[2]) / 2;
const py = pb.max[1];
const pitchTex = pitchNode.getMesh().listPrimitives()[0].getMaterial().getBaseColorTexture();
const { data, info } = await sharp(Buffer.from(pitchTex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
let x0 = info.width, x1 = 0, y0 = info.height, y1 = 0;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 3;
    if (data[i] > 230 && data[i + 1] > 230 && data[i + 2] > 230) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
}
const lineW = ((pb.max[0] - pb.min[0]) * (x1 - x0 + 1)) / info.width; // eixo X do modelo = largura
const lineL = ((pb.max[2] - pb.min[2]) * (y1 - y0 + 1)) / info.height; // eixo Z do modelo = comprimento
console.log(`gramado: centro (${cx.toFixed(2)}, ${py.toFixed(2)}, ${cz.toFixed(2)}), malha ${(pb.max[0] - pb.min[0]).toFixed(1)} x ${(pb.max[2] - pb.min[2]).toFixed(1)}, linhas ${lineL.toFixed(1)} x ${lineW.toFixed(1)} m`);

// 3. Join por material (sem mexer na geometria).
await doc.transform(weld({ tolerance: 0, toleranceNormal: 0 }), joinMeshes(), prune());
console.log(`malhas ${docRoot.listMeshes().length}, materiais ${docRoot.listMaterials().length}`);

// 4. Transformação: gramado no centro, eixo comprido em X, chão em y = 0.
// p' = SCALE * R * (p - c), com R = giro de 90 graus em Y (x' = z, z' = -x).
const wrap = doc.createNode("Ipatingao").setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]).setScale([SCALE, SCALE, SCALE]);
wrap.setTranslation([-SCALE * cz, -SCALE * py, SCALE * cx]);
for (const c of scene.listChildren()) {
  scene.removeChild(c);
  wrap.addChild(c);
}
scene.addChild(wrap);

// 5. Texturas em WebP (mesma resolução), meshopt sem quantizar posições.
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: "webp", quality: 95 }),
  reorder({ encoder: MeshoptEncoder, target: "size" }),
  prune(),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
mkdirSync(dirname(to), { recursive: true });
await io.write(to, doc);
console.log(`ipatingao.glb: ${kb(statSync(from).size)} -> ${kb(statSync(to).size)}`);
console.log(`IPATINGAO = { grassHalfL: ${((lineL * SCALE) / 2).toFixed(2)}, grassHalfW: ${((lineW * SCALE) / 2).toFixed(2)} }`);
const fb = getBounds(scene);
console.log("bounds finais", fb.min.map((v) => +v.toFixed(1)), fb.max.map((v) => +v.toFixed(1)));
