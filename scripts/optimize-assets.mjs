/* global console */
// Gera os arquivos leves de apps/web/public/assets a partir dos originais em assets-src.
// Roda à mão (não faz parte do build):  node scripts/optimize-assets.mjs
//
// GLB: compressão de malha (EXT_meshopt_compression) com glTF Transform. É o que o
// `gltf-transform optimize --compress meshopt` faz, menos o que quebra o jogo, porque o código procura
// nós, materiais e animações pelo nome (Quadril_D, Assento, Rotor_Principal, Bocal_Saida...):
//  - o `quantize` de posição embute a escala nos nós e move a malha de nós animados ou com filhos
//    para um nó filho sem nome (Cafe e Bolinha_Mao do boneco ficariam sem malha, e w.scale.setScalar
//    das rodas apagaria a escala embutida). Aqui as posições seguem em float (filtro do meshopt);
//  - flatten, join, palette, instance e prune renomeiam, juntam ou removem nós e materiais;
//  - dedup de material deixaria duas peças dividindo o mesmo material (o jogo pinta cada uma).
// Entram só: weld, reordenação, quantização de UV/cor, dedup de acessores (dados repetidos) e meshopt.
// MP3: tira a tag ID3 (capa embutida), que pesa cerca de 1 MB.
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, PropertyType } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, prune, quantize, reorder, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "assets-src");
const out = join(root, "apps", "web", "public", "assets");

const MODELS = [
  "characters/boneco_completo.glb",
  "characters/boneco_comemora.glb",
  "chairs/cadeira_escritorio.glb",
  "characters/comandante_helicoptero.glb",
];
// Roupas e cabelos: originais em assets-src/roupas/<pasta>, saída em apps/web/src/assets/<pasta>
// (o jogo lista as peças pelo glob do Vite). As animações das peças saem: o jogo só usa a malha e o skin,
// quem anima é o esqueleto do boneco_completo.
const WEARABLES = [
  "cabelos/01_cabelo.glb",
  "cabelos/02_repicado.glb",
  "cabelos/03_black_power.glb",
  "cabelos/04_longo.glb",
  "cabelos/05_medio_cacheado.glb",
  "cabelos/06_topete.glb",
  "barbas/01_barba.glb",
  "barbas/02_barba_longa.glb",
  "camisetas/01_camiseta.glb",
  "camisetas/02_polo.glb",
  "camisetas/03_moletom.glb",
  "camisetas/04_corta_vento.glb",
  "calcas/01_calca.glb",
  "calcas/02_saia.glb",
  "tenis/01_tenis.glb",
  "tenis/02_galocha.glb",
  "tenis/03_salto_alto.glb",
  "tenis/04_crocs.glb",
];
const wearablesOut = join(root, "apps", "web", "src", "assets");
const MUSIC = "audio/turbo_pixel_drift.mp3";

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
/** Tudo menos POSITION e NORMAL, que ficam em float. */
const QUANTIZED = /^(TEXCOORD|COLOR|JOINTS|WEIGHTS)(_\d+)?$/;

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

async function optimizeModel(rel, { from = join(src, rel), to = join(out, rel), dropAnimations = false } = {}) {
  const doc = await io.read(from);
  if (dropAnimations) {
    for (const anim of doc.getRoot().listAnimations()) anim.dispose();
    // acessores que eram só das animações
    await doc.transform(prune({ propertyTypes: [PropertyType.ACCESSOR] }));
  }
  await doc.transform(
    weld(),
    reorder({ encoder: MeshoptEncoder, target: "size" }),
    quantize({ pattern: QUANTIZED, patternTargets: QUANTIZED, cleanup: false }),
    dedup({ propertyTypes: [PropertyType.ACCESSOR] }),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  mkdirSync(dirname(to), { recursive: true });
  await io.write(to, doc);
  console.log(`${rel}: ${kb(statSync(from).size)} -> ${kb(statSync(to).size)}`);
}

/** Tamanho da tag ID3v2 no começo do arquivo (0 se não houver). */
function id3v2Length(buf) {
  if (buf.length < 10 || buf.toString("latin1", 0, 3) !== "ID3") return 0;
  const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  const footer = buf[5] & 0x10 ? 10 : 0;
  return 10 + size + footer;
}

function stripMusic(rel) {
  const from = join(src, rel);
  const to = join(out, rel);
  const buf = readFileSync(from);
  const start = id3v2Length(buf);
  let end = buf.length;
  // ID3v1 (128 bytes no fim, começando por "TAG")
  if (end - start >= 128 && buf.toString("latin1", end - 128, end - 125) === "TAG") end -= 128;
  const body = buf.subarray(start, end);
  // depois da tag tem que vir o sincronismo de um quadro MP3 (11 bits ligados)
  if (!(body[0] === 0xff && (body[1] & 0xe0) === 0xe0)) throw new Error(`${rel}: não achei o início do áudio depois da tag ID3`);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, body);
  console.log(`${rel}: ${kb(buf.length)} -> ${kb(body.length)}`);
}

for (const m of MODELS) await optimizeModel(m);
for (const w of WEARABLES) await optimizeModel(`roupas/${w}`, { to: join(wearablesOut, w), dropAnimations: true });
stripMusic(MUSIC);
