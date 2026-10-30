/* global console */
// Gera assets-src/roupas/oculos/01_redondo.glb e 02_quadrado.glb
// Baseado no esqueleto de assets-src/roupas/barbas/01_barba.glb (preso ao osso 'cabeca')
// Roda à mão:  node scripts/gerar-oculos.mjs  (depois: node scripts/optimize-assets.mjs)

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = join(root, "assets-src", "roupas", "barbas", "01_barba.glb");
const OUT_DIR = join(root, "assets-src", "roupas", "oculos");
const HEAD_BONE = "cabeca";

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

// Diretórios já existem

/** Cria curva 3D suave a partir de pontos de controle. */
function spline(points) {
  const v = points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  return new THREE.CatmullRomCurve3(v);
}

/** Tubo 3D cilíndrico ao longo de uma curva. */
function tube(curve, tubularSegments, radius, radialSegments = 8) {
  return new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
}

/** Retângulo com cantos arredondados como THREE.Shape. */
function roundedRectShape(x, y, width, height, radius) {
  const shape = new THREE.Shape();
  const left = x - width / 2;
  const right = x + width / 2;
  const top = y + height / 2;
  const bottom = y - height / 2;
  const r = Math.min(radius, width / 2, height / 2);

  shape.moveTo(left + r, top);
  shape.lineTo(right - r, top);
  shape.quadraticCurveTo(right, top, right, top - r);
  shape.lineTo(right, bottom + r);
  shape.quadraticCurveTo(right, bottom, right - r, bottom);
  shape.lineTo(left + r, bottom);
  shape.quadraticCurveTo(left, bottom, left, bottom + r);
  shape.lineTo(left, top - r);
  shape.quadraticCurveTo(left, top, left + r, top);
  return shape;
}

/** Cria haste curvada ao redor do crânio com espessura retangular (acetato). */
function buildAcetateTemple(points, widths, heights) {
  const path = spline(points);
  const segments = 24;
  const frames = path.computeFrenetFrames(segments, false);
  const positions = [];
  const indices = [];

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const p = path.getPointAt(u);
    const n = frames.normals[i];
    const b = frames.binormals[i];
    const w = widths(u) / 2;
    const h = heights(u) / 2;

    // 4 cantos da seção retangular
    const c0 = p.clone().addScaledVector(n, -w).addScaledVector(b, -h);
    const c1 = p.clone().addScaledVector(n, w).addScaledVector(b, -h);
    const c2 = p.clone().addScaledVector(n, w).addScaledVector(b, h);
    const c3 = p.clone().addScaledVector(n, -w).addScaledVector(b, h);

    positions.push(
      c0.x, c0.y, c0.z,
      c1.x, c1.y, c1.z,
      c2.x, c2.y, c2.z,
      c3.x, c3.y, c3.z
    );

    if (i < segments) {
      const rowA = i * 4;
      const rowB = (i + 1) * 4;
      // 4 faces laterais
      for (let k = 0; k < 4; k++) {
        const kNext = (k + 1) % 4;
        const a = rowA + k;
        const b = rowA + kNext;
        const c = rowB + kNext;
        const d = rowB + k;
        indices.push(a, b, c, a, c, d);
      }
    }
  }

  // Tampas no início e fim
  indices.push(0, 2, 1, 0, 3, 2);
  const last = segments * 4;
  indices.push(last, last + 1, last + 2, last, last + 2, last + 3);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function mergeClean(geos) {
  const nonIndexed = geos.map((g) => {
    const c = g.getIndex() ? g.toNonIndexed() : g.clone();
    if (!c.getAttribute("normal")) c.computeVertexNormals();
    for (const key of Object.keys(c.attributes)) {
      if (key !== "position" && key !== "normal") {
        c.deleteAttribute(key);
      }
    }
    return c;
  });
  const merged = BufferGeometryUtils.mergeGeometries(nonIndexed, false);
  return BufferGeometryUtils.mergeVertices(merged);
}

// ==========================================
// MODELO 1: ÓCULOS REDONDOS (Estilo wireframe metal preto)
// ==========================================
function buildRoundGlasses() {
  const eyeX = 0.185;
  const eyeY = 1.205;
  const eyeZ = 0.422;
  const rimRadius = 0.108;
  const wireRadius = 0.0055;

  const frameGeos = [];
  const lensGeos = [];

  // 1. Aros circulares esquerdo e direito
  for (const sign of [-1, 1]) {
    // Toro do aro
    const ring = new THREE.TorusGeometry(rimRadius, wireRadius, 8, 36);
    ring.translate(sign * eyeX, eyeY, eyeZ);
    frameGeos.push(ring);

    // Lente circular transparente
    const disc = new THREE.CircleGeometry(rimRadius - wireRadius * 0.5, 32);
    disc.translate(sign * eyeX, eyeY, eyeZ);
    // Cria face dupla para a lente ser visível de frente e de trás
    const discBack = disc.clone();
    discBack.scale(-1, 1, 1);
    lensGeos.push(disc, discBack);

    // Haste exterior (charneira pequena)
    const hinge = tube(
      spline([
        [sign * (eyeX + rimRadius), eyeY, eyeZ],
        [sign * (eyeX + rimRadius + 0.012), eyeY, eyeZ - 0.008],
        [sign * 0.308, eyeY, 0.405],
      ]),
      8,
      0.0045,
      8
    );
    frameGeos.push(hinge);

    // Haste metálica fina ao longo da lateral da cabeça
    const templeCurve = spline([
      [sign * 0.308, eyeY, 0.405],
      [sign * 0.332, eyeY, 0.300],
      [sign * 0.365, eyeY, 0.200],
      [sign * 0.388, eyeY, 0.100],
      [sign * 0.405, eyeY, 0.000],
      [sign * 0.418, eyeY, -0.060],
      [sign * 0.418, eyeY - 0.020, -0.100],
      [sign * 0.408, eyeY - 0.055, -0.130],
      [sign * 0.395, eyeY - 0.075, -0.145],
    ]);
    const temple = tube(templeCurve, 28, 0.004, 8);
    frameGeos.push(temple);

    // Capa da ponteira da haste (acetato preto na ponta da orelha)
    const tipCurve = spline([
      [sign * 0.418, eyeY - 0.015, -0.085],
      [sign * 0.418, eyeY - 0.020, -0.100],
      [sign * 0.408, eyeY - 0.055, -0.130],
      [sign * 0.395, eyeY - 0.075, -0.145],
    ]);
    const tip = tube(tipCurve, 14, 0.0065, 8);
    frameGeos.push(tip);

    // Suporte da plaqueta nasal
    const padArm = tube(
      spline([
        [sign * (eyeX - rimRadius + 0.01), eyeY, eyeZ],
        [sign * 0.075, eyeY - 0.010, eyeZ - 0.008],
        [sign * 0.062, eyeY - 0.020, eyeZ - 0.014],
      ]),
      8,
      0.003,
      6
    );
    frameGeos.push(padArm);

    // Plaqueta nasal oval transparente/silicone
    const pad = new THREE.CylinderGeometry(0.004, 0.004, 0.016, 8);
    pad.rotateZ(sign * 0.25);
    pad.rotateY(sign * 0.3);
    pad.translate(sign * 0.060, eyeY - 0.020, eyeZ - 0.015);
    frameGeos.push(pad);
  }

  // 2. Ponte metálica arqueada sobre o nariz
  const bridgeCurve = spline([
    [-0.078, eyeY + 0.010, eyeZ - 0.002],
    [-0.040, eyeY + 0.028, eyeZ + 0.003],
    [0.000, eyeY + 0.033, eyeZ + 0.005],
    [0.040, eyeY + 0.028, eyeZ + 0.003],
    [0.078, eyeY + 0.010, eyeZ - 0.002],
  ]);
  const bridge = tube(bridgeCurve, 16, 0.0045, 8);
  frameGeos.push(bridge);

  const mergedFrame = mergeClean(frameGeos);
  const mergedLens = mergeClean(lensGeos);

  return { frameGeo: mergedFrame, lensGeo: mergedLens };
}

// ==========================================
// MODELO 2: ÓCULOS QUADRADOS (Estilo Ray-Ban Wayfarer / Acetato retangular)
// ==========================================
function buildSquareGlasses() {
  const eyeX = 0.185;
  const eyeY = 1.205;
  const eyeZ = 0.422;
  const frameGeos = [];
  const lensGeos = [];

  // Forma frontal completa dos óculos quadrados com ponte e recorte dos olhos
  const shape = new THREE.Shape();

  // Contorno externo dos óculos (simétrico)
  // Lado direito (+X)
  shape.moveTo(0, 1.275);
  shape.lineTo(0.075, 1.277);
  shape.lineTo(0.280, 1.280);
  // Asa da charneira superior direita
  shape.quadraticCurveTo(0.320, 1.280, 0.320, 1.260);
  shape.lineTo(0.302, 1.135);
  // Canto inferior direito arredondado
  shape.quadraticCurveTo(0.295, 1.116, 0.270, 1.116);
  shape.lineTo(0.095, 1.116);
  // Canto inferior interno direito arredondado
  shape.quadraticCurveTo(0.075, 1.120, 0.075, 1.140);
  shape.lineTo(0.075, 1.220);
  // Arco sob a ponte nasal
  shape.quadraticCurveTo(0.040, 1.238, 0, 1.240);
  shape.quadraticCurveTo(-0.040, 1.238, -0.075, 1.220);
  // Lado esquerdo (-X)
  shape.lineTo(-0.075, 1.140);
  shape.quadraticCurveTo(-0.075, 1.120, -0.095, 1.116);
  shape.lineTo(-0.270, 1.116);
  shape.quadraticCurveTo(-0.295, 1.116, -0.302, 1.135);
  shape.lineTo(-0.320, 1.260);
  // Asa da charneira superior esquerda
  shape.quadraticCurveTo(-0.320, 1.280, -0.280, 1.280);
  shape.lineTo(-0.075, 1.277);
  shape.lineTo(0, 1.275);

  // Recorte para a lente direita (+X)
  const holeR = roundedRectShape(eyeX, eyeY - 0.004, 0.198, 0.128, 0.020);
  shape.holes.push(holeR);

  // Recorte para a lente esquerda (-X)
  const holeL = roundedRectShape(-eyeX, eyeY - 0.004, 0.198, 0.128, 0.020);
  shape.holes.push(holeL);

  // Extrusão da armação com bisel suave
  const frontExtrude = new THREE.ExtrudeGeometry(shape, {
    depth: 0.015,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 2,
    curveSegments: 16,
  });
  // Posiciona a armação na frente dos olhos
  frontExtrude.translate(0, 0, eyeZ - 0.008);
  frameGeos.push(frontExtrude);

  // Lentes nos recortes (+X e -X)
  for (const sign of [-1, 1]) {
    const lensShape = roundedRectShape(sign * eyeX, eyeY - 0.004, 0.194, 0.124, 0.018);
    const lensPlane = new THREE.ShapeGeometry(lensShape, 16);
    lensPlane.translate(0, 0, eyeZ + 0.001);
    const lensBack = lensPlane.clone();
    lensBack.scale(-1, 1, 1);
    lensGeos.push(lensPlane, lensBack);

    // Rebites metálicos horizontais na ponta superior da armação (estilo Ray-Ban)
    const rivet = new THREE.CylinderGeometry(0.0022, 0.0022, 0.009, 8);
    rivet.rotateZ(Math.PI / 2);
    rivet.translate(sign * 0.307, 1.266, eyeZ + 0.011);
    frameGeos.push(rivet);

    // Hastes retangulares de acetato contornando a cabeça até a orelha
    const templePoints = [
      [sign * 0.316, 1.264, eyeZ + 0.002],
      [sign * 0.342, 1.258, 0.300],
      [sign * 0.372, 1.248, 0.200],
      [sign * 0.395, 1.238, 0.100],
      [sign * 0.410, 1.228, 0.000],
      [sign * 0.422, 1.218, -0.060],
      [sign * 0.422, 1.185, -0.100],
      [sign * 0.412, 1.145, -0.130],
      [sign * 0.398, 1.125, -0.145],
    ];

    const templeWidths = (u) => 0.009 - 0.003 * u;
    const templeHeights = (u) => (u < 0.2 ? 0.020 - 0.006 * (u / 0.2) : 0.014 - 0.003 * u);

    const temple = buildAcetateTemple(templePoints, templeWidths, templeHeights);
    frameGeos.push(temple);
  }

  const mergedFrame = mergeClean(frameGeos);
  const mergedLens = mergeClean(lensGeos);

  return { frameGeo: mergedFrame, lensGeo: mergedLens };
}

// ==========================================
// GRAVAÇÃO E ASSOCIAÇÃO AO ESQUELETO DO BONECO
// ==========================================
async function exportGlassesGLB(outPath, frameGeo, lensGeo, { frameColor, frameRoughness, frameMetalness }) {
  const doc = await io.read(BASE);
  for (const anim of doc.getRoot().listAnimations()) anim.dispose();

  const headJoint = doc.getRoot().listSkins()[0].listJoints().findIndex((j) => j.getName() === HEAD_BONE);
  const buffer = doc.getRoot().listBuffers()[0];
  const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);

  function makePrim(geo, mat) {
    const pos = geo.getAttribute("position");
    const norm = geo.getAttribute("normal");
    const idx = geo.getIndex();
    const count = pos.count;

    const prim = doc.createPrimitive();
    prim.setAttribute("POSITION", accessor("VEC3", new Float32Array(pos.array)));
    prim.setAttribute("NORMAL", accessor("VEC3", new Float32Array(norm.array)));
    prim.setAttribute("JOINTS_0", accessor("VEC4", new Uint8Array(count * 4).map((_, i) => (i % 4 === 0 ? headJoint : 0))));
    prim.setAttribute("WEIGHTS_0", accessor("VEC4", new Float32Array(count * 4).map((_, i) => (i % 4 === 0 ? 1 : 0))));
    if (idx) {
      prim.setIndices(accessor("SCALAR", count > 65535 ? new Uint32Array(idx.array) : new Uint16Array(idx.array)));
    }
    prim.setMaterial(mat);
    return prim;
  }

  // Material da armação (escuro/preto fosco ou acetato)
  const frameMat = doc
    .createMaterial("frame")
    .setBaseColorFactor(frameColor)
    .setRoughnessFactor(frameRoughness)
    .setMetallicFactor(frameMetalness);

  // Material da lente (translúcido/reflexivo)
  const lensMat = doc
    .createMaterial("lens")
    .setAlphaMode("BLEND")
    .setBaseColorFactor([0.85, 0.95, 1.0, 0.18])
    .setRoughnessFactor(0.08)
    .setMetallicFactor(0.1);

  const mesh = doc.getRoot().listMeshes()[0];
  for (const p of mesh.listPrimitives()) p.dispose();

  const primFrame = makePrim(frameGeo, frameMat);
  const primLens = makePrim(lensGeo, lensMat);

  mesh.addPrimitive(primFrame);
  mesh.addPrimitive(primLens);

  await io.write(outPath, doc);
  console.log(`Gerado: ${outPath} (Armação: ${frameGeo.getAttribute("position").count} vértices, Lentes: ${lensGeo.getAttribute("position").count} vértices)`);
}

// 1. Redondo
console.log("Gerando 01_redondo.glb...");
const round = buildRoundGlasses();
await exportGlassesGLB(join(OUT_DIR, "01_redondo.glb"), round.frameGeo, round.lensGeo, {
  frameColor: [0.09, 0.09, 0.10, 1.0], // metal escuro elegante
  frameRoughness: 0.35,
  frameMetalness: 0.8,
});

// 2. Quadrado
console.log("Gerando 02_quadrado.glb...");
const square = buildSquareGlasses();
await exportGlassesGLB(join(OUT_DIR, "02_quadrado.glb"), square.frameGeo, square.lensGeo, {
  frameColor: [0.08, 0.08, 0.09, 1.0], // acetato preto grafite
  frameRoughness: 0.25,
  frameMetalness: 0.05,
});

console.log("Concluído!");
