// Monta o helicóptero do Comandante: o modelo de itens/ com o boneco de assets-src/characters/boneco_vestido.glb
// sentado no banco do piloto.
// O commander.ts clona a cena com scene.clone, que não religa esqueleto: a pose é gravada na malha, sem skin.
// Depois de rodar: node scripts/optimize-assets.mjs
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, PropertyType } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { mergeDocuments, prune, simplify, textureCompress, unpartition, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HELI = join(root, "apps", "web", "src", "assets", "itens", "helicoptero.glb");
const OUT = join(root, "assets-src", "characters", "comandante_helicoptero.glb");
const BONECO = join(root, "assets-src", "characters", "boneco_vestido.glb");

// banco do piloto (ponto_piloto do modelo): assento em y 1.1, centrado em x -0.42
const SCALE = 0.9;
const SEAT_X = -0.42;
const SEAT_Y = 1.1;
const HIP_Z = 0.2;
// coxas para a frente e canelas um pouco caídas, por baixo do painel (z 0.5 em diante)
const THIGH = -1.5;
const KNEE = 0.45;
// as mãos vão à borda do painel
const HANDS = { D: [-0.66, 1.35, 0.6], E: [-0.18, 1.35, 0.6] };
// nome que o commander.ts procura
const ROTOR_CLIP = "Rotores_Girando";

const axisX = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
const mulQuat = ([ax, ay, az, aw], [bx, by, bz, bw]) => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];
const conjugate = ([x, y, z, w]) => [-x, -y, -z, w];
const normalize = (v) => {
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
};
const sub = (a, b) => a.map((c, i) => c - b[i]);
const dot = (a, b) => a.reduce((s, c, i) => s + c * b[i], 0);
const cross = ([ax, ay, az], [bx, by, bz]) => [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
/** Rotação que leva a direção a até a direção b. */
function between(a, b) {
  const [ua, ub] = [normalize(a), normalize(b)];
  return normalize([...cross(ua, ub), 1 + dot(ua, ub)]);
}

function mulMat(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}
const transformPoint = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
const transformDir = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
const translationOf = (m) => [m[12], m[13], m[14]];

/** Rotação do nó no mundo; os ossos do boneco não têm escala. */
function worldQuat(node) {
  let q = node.getRotation();
  for (let p = node.getParentNode(); p; p = p.getParentNode()) q = mulQuat(p.getRotation(), q);
  return q;
}

/** Gira os ombros até os pulsos apontarem para as mãos, dadas em coordenadas do helicóptero. */
function reachHands(bone, place) {
  for (const side of ["D", "E"]) {
    const ombro = bone(`ombro_${side}`);
    const shoulder = translationOf(ombro.getWorldMatrix());
    const target = HANDS[side].map((c, i) => (c - place.offset[i]) / place.scale);
    const turn = between(sub(translationOf(bone(`punho_${side}`).getWorldMatrix()), shoulder), sub(target, shoulder));
    const parent = worldQuat(ombro.getParentNode());
    const local = mulQuat(mulQuat(conjugate(parent), turn), parent);
    ombro.setRotation(normalize(mulQuat(local, ombro.getRotation())));
  }
}

/** Grava a pose do esqueleto nos vértices e tira o skin. */
function bakeSkin(doc, node) {
  const skin = node.getSkin();
  const ibm = skin.getInverseBindMatrices().getArray();
  const palette = skin.listJoints().map((j, i) => mulMat(j.getWorldMatrix(), Array.from(ibm.subarray(i * 16, i * 16 + 16))));
  const buffer = doc.getRoot().listBuffers()[0];
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute("POSITION");
    const nor = prim.getAttribute("NORMAL");
    const jts = prim.getAttribute("JOINTS_0");
    const wts = prim.getAttribute("WEIGHTS_0");
    const outPos = new Float32Array(pos.getCount() * 3);
    const outNor = new Float32Array(pos.getCount() * 3);
    for (let v = 0; v < pos.getCount(); v++) {
      const j = jts.getElement(v, []);
      const w = wts.getElement(v, []);
      const p = pos.getElement(v, []);
      const n = nor.getElement(v, []);
      const pSum = [0, 0, 0];
      const nSum = [0, 0, 0];
      for (let i = 0; i < 4; i++) {
        if (!w[i]) continue;
        const tp = transformPoint(palette[j[i]], p);
        const tn = transformDir(palette[j[i]], n);
        for (let c = 0; c < 3; c++) {
          pSum[c] += tp[c] * w[i];
          nSum[c] += tn[c] * w[i];
        }
      }
      outPos.set(pSum, v * 3);
      outNor.set(normalize(nSum), v * 3);
    }
    prim.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(outPos).setBuffer(buffer));
    prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(outNor).setBuffer(buffer));
    for (const name of ["JOINTS_0", "WEIGHTS_0", "TANGENT"]) prim.setAttribute(name, null);
  }
  node.setSkin(null);
}

/** Peças com escala 0 são expressões e objetos que só as animações mostram. */
const visible = (node) => {
  for (let n = node; n; n = n.getParentNode()) if (n.getScale().some((s) => s === 0)) return false;
  return true;
};

function boundsOf(nodes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const node of nodes) {
    const m = node.getWorldMatrix();
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      for (let v = 0; v < pos.getCount(); v++) {
        const p = transformPoint(m, pos.getElement(v, []));
        for (let c = 0; c < 3; c++) {
          min[c] = Math.min(min[c], p[c]);
          max[c] = Math.max(max[c], p[c]);
        }
      }
    }
  }
  return { min, max };
}

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const heli = await io.read(HELI);
const boneco = await io.read(BONECO);
const bonecoRoot = boneco.getRoot();
const bone = (name) => bonecoRoot.listNodes().find((n) => n.getName() === name);

for (const side of ["D", "E"]) {
  const perna = bone(`perna_${side}`);
  perna.setRotation(mulQuat(perna.getRotation(), axisX(THIGH)));
  const joelho = bone(`joelho_${side}`);
  joelho.setRotation(mulQuat(joelho.getRotation(), axisX(KNEE)));
}

// a parte de baixo da calça na pose diz a altura em que o boneco fica; só depois os braços acham o painel
const meshNodes = bonecoRoot.listNodes().filter((n) => n.getMesh() && visible(n));
const skinned = meshNodes.filter((n) => n.getSkin());
const pants = bone("calca");
bakeSkin(boneco, pants);
const place = {
  scale: SCALE,
  offset: [SEAT_X, SEAT_Y - boundsOf([pants]).min[1] * SCALE, HIP_Z - translationOf(bone("perna_D").getWorldMatrix())[2] * SCALE],
};
reachHands(bone, place);
for (const node of skinned) if (node.getSkin()) bakeSkin(boneco, node);

// óculos, cabelo e headset vão presos à cabeça: guardam onde estavam antes de sair da hierarquia
const worlds = new Map(meshNodes.map((n) => [n, skinned.includes(n) ? null : n.getWorldMatrix()]));
const piloto = boneco.createNode("Boneco").setScale([SCALE, SCALE, SCALE]).setTranslation(place.offset);
for (const [node, world] of worlds) {
  node.detach();
  node.setMatrix(world ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  piloto.addChild(node);
}
const scene = bonecoRoot.listScenes()[0];
for (const child of scene.listChildren()) child.detach();
scene.addChild(piloto);
for (const anim of bonecoRoot.listAnimations()) anim.dispose();
for (const skin of bonecoRoot.listSkins()) skin.dispose();
for (const n of bonecoRoot.listNodes()) if (n !== piloto && !worlds.has(n)) n.dispose();
await boneco.transform(
  prune({ keepLeaves: true }),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.2, error: 0.002 }),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024] }),
);

const heliRoot = heli.getRoot();
await heli.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.7, error: 0.0003 }));
for (const anim of heliRoot.listAnimations()) anim.setName(ROTOR_CLIP);
const merged = mergeDocuments(heli, boneco).get(scene);
const seat = heliRoot.listNodes().find((n) => n.getName() === "helicoptero");
for (const child of merged.listChildren()) seat.addChild(child);
merged.dispose();
await heli.transform(
  prune({
    keepLeaves: true,
    propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.MATERIAL, PropertyType.TEXTURE],
  }),
  unpartition(),
);
await io.write(OUT, heli);
