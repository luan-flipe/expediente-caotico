/* global console */
// Acrescenta o clipe "carrinho" (carrinho de futebol) ao boneco_completo.glb, sem mexer nos outros clipes.
// Escreve o original (assets-src/characters) e a versão leve (apps/web/public/assets/characters), esta com o mesmo
// pipeline de optimize-assets.mjs. Roda à mão:  node scripts/gerar-animacao-carrinho.mjs
// Rodar de novo troca o clipe (remove o "carrinho" antigo antes de criar).
//
// Eixos do esqueleto: o boneco olha para +Z, o lado direito dele é -X. Rotação X negativa joga a parte de cima
// do osso para trás (-Z) e o pé para a frente (+Z). Cada osso recebe delta * rotação de repouso (o repouso dos
// ombros já inclui a inclinação do braço). Só rotação dos ossos e o Y do nó "figura" (o quadril desce); X e Z
// ficam parados porque a simulação já move o jogador.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { NodeIO, PropertyType } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, quantize, reorder, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "assets-src", "characters", "boneco_completo.glb");
const OUT = join(root, "apps", "web", "public", "assets", "characters", "boneco_completo.glb");
const QUANTIZED = /^(TEXCOORD|COLOR|JOINTS|WEIGHTS)(_\d+)?$/;

/** Mesma duração do recarga do carrinho na sim (TACKLE_COOLDOWN_MS = 800 em packages/shared/src/futebol/touch.ts). */
const DURATION = 0.8;
const FPS = 30;
const NAME = "carrinho";

// Poses: ângulos em radianos sobre o eixo X de cada osso (y = descida do quadril em metros).
const STAND = { y: 0, tronco: 0, cabeca: 0, ombroD: 0, ombroE: 0, pernaD: 0, joelhoD: 0, peD: 0, pernaE: 0, joelhoE: 0, peE: 0 };
// Duas passadas de corrida: primeiro a perna D atrás, depois a D à frente.
const RUN0 = { y: 0, tronco: 0.2, cabeca: -0.1, ombroD: -0.7, ombroE: 0.7, pernaD: 0.5, joelhoD: 0.9, peD: 0.2, pernaE: -0.6, joelhoE: 0.2, peE: 0 };
const RUN1 = { y: -0.02, tronco: 0.25, cabeca: -0.12, ombroD: 0.7, ombroE: -0.7, pernaD: -0.7, joelhoD: 0.3, peD: 0, pernaE: 0.5, joelhoE: 0.9, peE: 0.2 };
// Deslize: quadril rente ao chão, tronco para trás, perna D esticada à frente (pé quase plano, ponta levemente
// para cima), perna E dobrada por baixo, braço D para trás tocando o chão, braço E para cima.
const SLIDE = { y: -0.17, tronco: -1.1, cabeca: 0.85, ombroD: 1.5, ombroE: -1.64, pernaD: -1.25, joelhoD: 0, peD: 0.95, pernaE: -0.9, joelhoE: 2.3, peE: -1.0 };

const ease = (u) => u * u * (3 - 2 * u);
const lerpPose = (a, b, u) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + (b[k] - a[k]) * ease(Math.min(1, Math.max(0, u)))]));
function poseAt(t) {
  if (t < 0.1) return lerpPose(RUN0, RUN1, t / 0.1);
  if (t < 0.3) return lerpPose(RUN1, SLIDE, (t - 0.1) / 0.2);
  if (t < 0.58) {
    // segura deslizando, com um respiro leve no tronco e nos braços
    const w = Math.sin(((t - 0.3) / 0.28) * Math.PI);
    return { ...SLIDE, tronco: SLIDE.tronco + 0.04 * w, ombroE: SLIDE.ombroE + 0.1 * w, ombroD: SLIDE.ombroD - 0.05 * w };
  }
  return lerpPose(SLIDE, STAND, (t - 0.58) / (DURATION - 0.58));
}

const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qx = (ang) => [Math.sin(ang / 2), 0, 0, Math.cos(ang / 2)];

function addClip(doc) {
  const rootNode = doc.getRoot();
  for (const a of rootNode.listAnimations()) if (a.getName() === NAME) a.dispose();
  const byName = new Map(rootNode.listNodes().filter((n) => n.getName()).map((n) => [n.getName(), n]));
  const buffer = rootNode.listBuffers()[0];
  const anim = doc.createAnimation(NAME);
  const times = Array.from({ length: Math.round(DURATION * FPS) + 1 }, (_, i) => i / FPS);
  const input = doc.createAccessor().setType("SCALAR").setArray(new Float32Array(times)).setBuffer(buffer);
  const sampler = (accessorOut) => {
    const s = doc.createAnimationSampler().setInput(input).setOutput(accessorOut).setInterpolation("LINEAR");
    anim.addSampler(s);
    return s;
  };
  const channel = (node, path, s) => anim.addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(s));

  const rotations = { tronco: "tronco", cabeca: "cabeca", ombro_D: "ombroD", ombro_E: "ombroE", perna_D: "pernaD", joelho_D: "joelhoD", pe_D: "peD", perna_E: "pernaE", joelho_E: "joelhoE", pe_E: "peE" };
  for (const [bone, key] of Object.entries(rotations)) {
    const node = byName.get(bone);
    if (!node) throw new Error(`osso ${bone} não achado`);
    const rest = node.getRotation();
    let prev = null;
    const out = [];
    for (const t of times) {
      let q = qmul(qx(poseAt(t)[key]), rest);
      if (prev && prev[0] * q[0] + prev[1] * q[1] + prev[2] * q[2] + prev[3] * q[3] < 0) q = q.map((v) => -v);
      out.push(...q);
      prev = q;
    }
    channel(node, "rotation", sampler(doc.createAccessor().setType("VEC4").setArray(new Float32Array(out)).setBuffer(buffer)));
  }
  const figura = byName.get("figura");
  const base = figura.getTranslation();
  const tr = times.flatMap((t) => [base[0], base[1] + poseAt(t).y, base[2]]);
  channel(figura, "translation", sampler(doc.createAccessor().setType("VEC3").setArray(new Float32Array(tr)).setBuffer(buffer)));

  // escalas de objetos escondidos (copo, café, rosto bravo, piscadas): mesmo valor do primeiro quadro do "dash"
  const dash = rootNode.listAnimations().find((a) => a.getName() === "dash");
  for (const ch of dash.listChannels().filter((c) => c.getTargetPath() === "scale")) {
    const v = Array.from(ch.getSampler().getOutput().getElement(0, []));
    const arr = new Float32Array(times.length * 3);
    for (let i = 0; i < times.length; i++) arr.set(v, i * 3);
    channel(ch.getTargetNode(), "scale", sampler(doc.createAccessor().setType("VEC3").setArray(arr).setBuffer(buffer)));
  }
  return anim;
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

// original
let doc = await io.read(SRC);
addClip(doc);
await io.write(SRC, doc);

// versão leve: parte do original já com o clipe, como optimize-assets.mjs
doc = await io.read(SRC);
await doc.transform(
  weld(),
  reorder({ encoder: MeshoptEncoder, target: "size" }),
  quantize({ pattern: QUANTIZED, patternTargets: QUANTIZED, cleanup: false }),
  dedup({ propertyTypes: [PropertyType.ACCESSOR] }),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
mkdirSync(dirname(OUT), { recursive: true });
await io.write(OUT, doc);

for (const f of [SRC, OUT]) {
  const clips = (await io.read(f)).getRoot().listAnimations().map((a) => a.getName());
  console.log(f.replace(root, ""), clips.length, "clips:", clips.join(", "));
}
