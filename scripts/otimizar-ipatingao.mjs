/* global console */
// Otimiza o mapa do estádio Ipatingão para o modo Futebol da Firma.
//   node scripts/otimizar-ipatingao.mjs
// Lê assets-src/futebol/ipatingao.glb e grava apps/web/src/assets/futebol/ipatingao.glb.
//
// O original (cerca de 18 MB, 13,5 mil nós, 950 materiais) NÃO vai para o git (está no .gitignore).
// Para gerar de novo, copie o original (ipatingao-3d.glb) para assets-src/futebol/ipatingao.glb.
//
// Medidas do modelo original (eixo para cima = Y, 1 unidade = 1 m):
//  - O gramado é a malha com a textura 340x520 (listras com as linhas do campo). Ela tem giro próprio de
//    2,86 graus em Y: o eixo comprido do campo não é exatamente o Z do modelo. Centro das linhas
//    (38.93, 0.45, 278.27), y do gramado 0.45. Malha 68,6 x 104,9 m.
//  - Dentro da textura as linhas ocupam x 20..320, y 20..500 (de 340x520): 97,0 m (comprimento) x
//    60,7 m (largura). O script mede tudo isso (pixels brancos, matriz do nó).
// Transformação aplicada no próprio .glb (nó "Ipatingao" na raiz da cena):
//  - leva o centro das linhas para a origem, gira em Y (92,86 graus) para o eixo comprido ficar em X,
//    escala 1 (o modelo já está em metros) e põe o gramado em y = 0.
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
// A malha do gramado tem escala e giro próprios: o eixo comprido do campo NÃO é exatamente o Z do modelo
// (giro de cerca de 2,9 graus em Y). Mede-se no espaço local da malha e leva para o mundo pela matriz do nó.
const W = pitchNode.getWorldMatrix(); // coluna 0 = X local, coluna 2 = Z local (em mundo)
const sx = Math.hypot(W[0], W[2]);
const sz = Math.hypot(W[8], W[10]);
const pa = pitchNode.getMesh().listPrimitives()[0].getAttribute("POSITION");
const lmin = pa.getMin([]);
const lmax = pa.getMax([]);
const py = W[13];
const phi = Math.atan2(W[8], W[10]); // direção do eixo comprido (Z local) em mundo: (sin phi, cos phi)
if (lmax[2] - lmin[2] < lmax[0] - lmin[0]) throw new Error("esperava o eixo comprido em Z local");
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
// UV: u = 0..1 de x local min..max; v = 1..0 de z local min..max. Centro e tamanho das linhas (em metros).
const lineW = (lmax[0] - lmin[0]) * sx * ((x1 - x0 + 1) / info.width);
const lineL = (lmax[2] - lmin[2]) * sz * ((y1 - y0 + 1) / info.height);
const uc = (x0 + x1 + 1) / 2 / info.width;
const vc = (y0 + y1 + 1) / 2 / info.height;
const lc = [lmin[0] + (lmax[0] - lmin[0]) * uc, 0, lmax[2] - (lmax[2] - lmin[2]) * vc];
const cx = W[0] * lc[0] + W[8] * lc[2] + W[12];
const cz = W[2] * lc[0] + W[10] * lc[2] + W[14];
console.log(`gramado: centro das linhas (${cx.toFixed(2)}, ${py.toFixed(2)}, ${cz.toFixed(2)}), giro ${((phi * 180) / Math.PI).toFixed(2)} graus, linhas ${lineL.toFixed(1)} x ${lineW.toFixed(1)} m`);
console.log(`linhas na textura: x ${x0}..${x1}, y ${y0}..${y1} de ${info.width}x${info.height}`);

// 3. Join por material (sem mexer na geometria).
await doc.transform(weld({ tolerance: 0, toleranceNormal: 0 }), joinMeshes(), prune());
console.log(`malhas ${docRoot.listMeshes().length}, materiais ${docRoot.listMaterials().length}`);

// 4. Transformação: gramado no centro, eixo comprido em X, chão em y = 0.
// p' = SCALE * R * (p - c), com R = giro theta em Y (x' = x cos + z sin, z' = -x sin + z cos).
const theta = Math.PI / 2 - phi;
const c = Math.cos(theta);
const sn = Math.sin(theta);
const wrap = doc.createNode("Ipatingao").setRotation([0, Math.sin(theta / 2), 0, Math.cos(theta / 2)]).setScale([SCALE, SCALE, SCALE]);
wrap.setTranslation([-SCALE * (cx * c + cz * sn), -SCALE * py, -SCALE * (-cx * sn + cz * c)]);
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
