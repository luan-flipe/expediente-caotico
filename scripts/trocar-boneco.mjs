/* global process, Buffer */
// Troca assets-src/characters/boneco_completo.glb por um boneco novo do designer, com o mesmo esqueleto.
// O modelo novo é pesado (mais de 100 mil vértices) e não entra no repositório: o caminho vem na linha de comando.
// Roda à mão:  node scripts/trocar-boneco.mjs <modelo.glb>
// Depois: node scripts/optimize-assets.mjs. As roupas do designer já vêm no corpo novo (scripts/importar-roupas.mjs).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { joinPrimitives, prune, simplifyPrimitive, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "assets-src", "characters", "boneco_completo.glb");
// o corpo do boneco antigo tinha uns 15 mil vértices
const RATIO = 0.09;
// o short justo guarda mais vértices: a dobra da barra é fina
const SHORT_RATIO = 0.4;
// nas animações o braço do boneco novo cai colado no tronco e a manga atravessa a camisa: os ombros abrem
// isto (radianos) para o lado em todos os clipes. A pose de amarração não muda, as roupas continuam valendo.
const ARM_SPREAD = 0.2;

const mulQuat = ([ax, ay, az, aw], [bx, by, bz, bw]) => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];

// ---- cabeça do boneco atual -------------------------------------------------------------------------
// O rosto do jogo é liso (#66) e o do designer vem esculpido: acima disto (altura no repouso) cada vértice
// do corpo novo vai para o ponto mais perto da cabeça atual, com a normal dela.
const HEAD_Y = 0.8;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Ponto do triângulo abc mais perto de p (Ericson, Real-Time Collision Detection 5.1.5). */
function closestOnTriangle(p, [a, b, c]) {
  const ab = sub(b, a),
    ac = sub(c, a),
    ap = sub(p, a);
  const d1 = dot(ab, ap),
    d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b),
    d3 = dot(ab, bp),
    d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]];
  }
  const cp = sub(p, c),
    d5 = dot(ab, cp),
    d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]];
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])];
  }
  const den = 1 / (va + vb + vc),
    v = vb * den,
    w = vc * den;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}
function keepHead(from, to) {
  const P = from.getAttribute("POSITION").getArray(),
    N = from.getAttribute("NORMAL").getArray(),
    I = from.getIndices().getArray();
  const vert = (A, i) => [A[i * 3], A[i * 3 + 1], A[i * 3 + 2]];
  const CELL = 0.02,
    grid = new Map(),
    tris = [];
  const key = (a, b, c) => `${a},${b},${c}`;
  for (let t = 0; t < I.length; t += 3) {
    const ids = [I[t], I[t + 1], I[t + 2]];
    const v = ids.map((i) => vert(P, i));
    if (Math.max(...v.map((q) => q[1])) < HEAD_Y - 0.05) continue;
    const lo = [0, 1, 2].map((k) => Math.floor(Math.min(...v.map((q) => q[k])) / CELL));
    const hi = [0, 1, 2].map((k) => Math.floor(Math.max(...v.map((q) => q[k])) / CELL));
    for (let a = lo[0]; a <= hi[0]; a++)
      for (let b = lo[1]; b <= hi[1]; b++)
        for (let c = lo[2]; c <= hi[2]; c++)
          (grid.get(key(a, b, c)) ?? grid.set(key(a, b, c), []).get(key(a, b, c))).push(tris.length);
    tris.push({ v, n: ids.map((i) => vert(N, i)) });
  }
  const pos = to.getAttribute("POSITION"),
    nor = to.getAttribute("NORMAL");
  const TP = pos.getArray().slice(),
    TN = nor.getArray().slice();
  for (let i = 0; i < TP.length / 3; i++) {
    const p = vert(TP, i);
    if (p[1] < HEAD_Y) continue;
    const g = p.map((x) => Math.floor(x / CELL));
    let best = null,
      bestD = 0.05,
      tri = null;
    for (let a = -2; a <= 2; a++)
      for (let b = -2; b <= 2; b++)
        for (let c = -2; c <= 2; c++)
          for (const k of grid.get(key(g[0] + a, g[1] + b, g[2] + c)) ?? []) {
            const q = closestOnTriangle(p, tris[k].v);
            const d = Math.hypot(...sub(p, q));
            if (d < bestD) [best, bestD, tri] = [q, d, tris[k]];
          }
    if (!best) continue;
    // normal da cabeça atual no ponto, pelas coordenadas baricêntricas
    const [a, b, c] = tri.v,
      n = cross(sub(b, a), sub(c, a)),
      area = dot(n, n) || 1e-12;
    const u = dot(cross(sub(c, b), sub(best, b)), n) / area,
      v = dot(cross(sub(a, c), sub(best, c)), n) / area;
    const w = [u, v, 1 - u - v];
    const nn = [0, 1, 2].map((k) => w[0] * tri.n[0][k] + w[1] * tri.n[1][k] + w[2] * tri.n[2][k]);
    const len = Math.hypot(...nn) || 1;
    for (let k = 0; k < 3; k++) [TP[i * 3 + k], TN[i * 3 + k]] = [best[k], nn[k] / len];
  }
  pos.setArray(TP);
  nor.setArray(TN);
}

const [input] = process.argv.slice(2);
await Promise.all([MeshoptSimplifier.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(input);
const old = await io.read(OUT);

// o short justo vem como malha à parte, com os mesmos vértices e material do corpo
const nodes = doc.getRoot().listNodes();
const body = nodes
  .find((n) => n.getName() === "boneco")
  ?.getMesh()
  ?.listPrimitives()[0];
const shortNode = nodes.find((n) => n.getName() === "short");
const shortPrim = shortNode?.getMesh()?.listPrimitives()[0];
const shortJoins = !!body && !!shortPrim && shortPrim.getAttribute("POSITION") === body.getAttribute("POSITION");

/**
 * Máscara (1 byte por texel) dos triângulos do short no mapa UV, alargada DILATE texels para cobrir a
 * borda e o filtro da textura.
 */
const DILATE = 4;
function uvMask(prim, w, h) {
  const uv = prim.getAttribute("TEXCOORD_0").getArray();
  const idx = prim.getIndices().getArray();
  const mask = new Uint8Array(w * h);
  for (let t = 0; t < idx.length; t += 3) {
    const p = [0, 1, 2].map((k) => [uv[idx[t + k] * 2] * w, uv[idx[t + k] * 2 + 1] * h]);
    const [[ax, ay], [bx, by], [cx, cy]] = p;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - DILATE),
      x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)) + DILATE);
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)) - DILATE),
      y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)) + DILATE);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        // distância do texel ao triângulo, aproximada pelas coordenadas baricêntricas em texels
        const px = x + 0.5,
          py = y + 0.5;
        const l1 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
        const l2 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
        const l3 = 1 - l1 - l2;
        const edge =
          (Math.min(l1, l2, l3) * Math.abs(area)) /
          Math.max(Math.hypot(bx - ax, by - ay), Math.hypot(cx - bx, cy - by), Math.hypot(ax - cx, ay - cy));
        if (edge >= -DILATE) mask[y * w + x] = 1;
      }
  }
  return mask;
}

// o rosto liso do jogo (#60, #67): cor, relevo e rugosidade do boneco atual, no mesmo mapa UV. Na área do
// short ficam os texels do designer: os do boneco atual têm a sombra da barra e do cós do short com volume.
const skin = (d) =>
  d
    .getRoot()
    .listMaterials()
    .find((m) => m.getName() === "model");
const [from, to] = [skin(old), skin(doc)];
for (const get of ["getBaseColorTexture", "getNormalTexture", "getMetallicRoughnessTexture"]) {
  const src = from[get]();
  const dst = to[get]();
  let image = src.getImage();
  if (shortJoins) {
    const mine = await sharp(Buffer.from(src.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = mine.info;
    const theirs = await sharp(Buffer.from(dst.getImage())).removeAlpha().resize(w, h).raw().toBuffer();
    const mask = uvMask(shortPrim, w, h);
    for (let i = 0; i < w * h; i++) if (mask[i]) for (let c = 0; c < 3; c++) mine.data[i * 3 + c] = theirs[i * 3 + c];
    const out = sharp(mine.data, { raw: { width: w, height: h, channels: 3 } });
    image = new Uint8Array(
      await (src.getMimeType() === "image/png" ? out.png() : out.jpeg({ quality: 85, mozjpeg: true })).toBuffer(),
    );
  }
  dst.setImage(image).setMimeType(src.getMimeType()).setURI(src.getURI());
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

await doc.transform(weld());
// o short volta para o corpo, pintado na pele e sem volume. Soldado e simplificado à parte, com a borda
// travada dos dois lados: a barra tem uma dobra fina para dentro que, simplificada junto com a pele, vira
// pontas e buracos
if (shortJoins) {
  const opts = { simplifier: MeshoptSimplifier, lockBorder: true };
  simplifyPrimitive(body, { ...opts, ratio: RATIO, error: 0.01 });
  simplifyPrimitive(shortPrim, { ...opts, ratio: SHORT_RATIO, error: 0.002 });
  const mesh = shortNode.getMesh();
  const joined = joinPrimitives([body, shortPrim]);
  const bodyMesh = nodes.find((n) => n.getName() === "boneco").getMesh();
  bodyMesh.removePrimitive(body).addPrimitive(joined);
  body.dispose();
  shortNode.dispose();
  mesh.dispose();
}
// o resto (corpo sem short, peças do rosto e da bolinha) com a mesma redução
const simplified = new Set(
  shortJoins
    ? nodes
        .find((n) => n.getName() === "boneco")
        .getMesh()
        .listPrimitives()
    : [],
);
for (const mesh of doc.getRoot().listMeshes())
  for (const prim of mesh.listPrimitives())
    if (!simplified.has(prim)) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: RATIO, error: 0.01 });
await doc.transform(prune());
const bodyOf = (d) =>
  d
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === "boneco")
    ?.getMesh()
    ?.listPrimitives()[0];
keepHead(bodyOf(old), bodyOf(doc));
await io.write(OUT, doc);
