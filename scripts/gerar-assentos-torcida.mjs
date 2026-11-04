/* global console, process */
// Acha os assentos da torcida nas arquibancadas do mapa e grava apps/web/src/futebol/assentosTorcida.json.
//   node scripts/gerar-assentos-torcida.mjs <ipatingao.glb>
// Rode com o .glb ANTES da mescla (mesclar-ipatingao.mjs junta as malhas do anel com o resto e o filtro por caixa
// deixa de valer). O cliente só lê o JSON: nada de varrer 480 mil triângulos na hora de abrir a partida.
//
// Sem raycast: as malhas do anel (caixa que cobre a elipse toda, baixas, sem o teto) viram triângulos em coordenadas
// do mundo; só os que olham para cima entram em uma grade de 2 m e cada candidato consulta os triângulos da sua
// célula (ponto no triângulo em XZ, altura por interpolação).
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { MAX_CROWD, cellKey, ringCandidate, rng } from "../apps/web/src/futebol/torcidaLayout.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = process.argv[2];
if (!from) throw new Error("uso: node scripts/gerar-assentos-torcida.mjs <ipatingao.glb antes da mescla>");
const to = join(root, "apps", "web", "src", "futebol", "assentosTorcida.json");

await MeshoptDecoder.ready;
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder }).read(from);

const tris = [];
const cells = new Map();
const CELL = 2;
const cellId = (cx, cz) => cx * 4096 + cz;
const apply = (W, p) => [W[0] * p[0] + W[4] * p[1] + W[8] * p[2] + W[12], W[1] * p[0] + W[5] * p[1] + W[9] * p[2] + W[13], W[2] * p[0] + W[6] * p[1] + W[10] * p[2] + W[14]];
let usadas = 0;
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const W = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION");
    // caixa do mundo = caixa local transformada (mesmo que Box3.setFromObject sem precisão)
    const lo = pos.getMin([]);
    const hi = pos.getMax([]);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 8; k++) {
      const q = apply(W, [k & 1 ? hi[0] : lo[0], k & 2 ? hi[1] : lo[1], k & 4 ? hi[2] : lo[2]]);
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], q[i]);
        max[i] = Math.max(max[i], q[i]);
      }
    }
    // só as malhas que cobrem o anel inteiro das arquibancadas (sem o teto, que passa de 30 m)
    if (!(max[1] < 30 && max[1] > 0.3 && max[0] > 115 && min[0] < -115 && max[2] > 95 && min[2] < -95)) continue;
    usadas++;
    const idx = prim.getIndices();
    const count = idx ? idx.getCount() : pos.getCount();
    for (let i = 0; i + 2 < count; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => apply(W, pos.getElement(idx ? idx.getScalar(i + k) : i + k, [])));
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const ny = e1[2] * e2[0] - e1[0] * e2[2];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const len = Math.hypot(...cr);
      // degrau voltado para cima (normal no mundo com y >= 0,6) e acima do chão do estádio
      if (len < 1e-9 || ny / len < 0.6 || Math.max(a[1], b[1], c[1]) < 0.3) continue;
      const t = tris.length / 9;
      tris.push(...a, ...b, ...c);
      const x0 = Math.floor(Math.min(a[0], b[0], c[0]) / CELL);
      const x1 = Math.floor(Math.max(a[0], b[0], c[0]) / CELL);
      const z0 = Math.floor(Math.min(a[2], b[2], c[2]) / CELL);
      const z1 = Math.floor(Math.max(a[2], b[2], c[2]) / CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const k = cellId(cx, cz);
          const list = cells.get(k);
          if (list) list.push(t);
          else cells.set(k, [t]);
        }
      }
    }
  }
}
const heightAt = (x, z) => {
  let best = -1;
  for (const t of cells.get(cellId(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
    const o = t * 9;
    const ax = tris[o], az = tris[o + 2];
    const v0x = tris[o + 3] - ax, v0z = tris[o + 5] - az;
    const v1x = tris[o + 6] - ax, v1z = tris[o + 8] - az;
    const px = x - ax, pz = z - az;
    const den = v0x * v1z - v1x * v0z;
    if (Math.abs(den) < 1e-12) continue;
    const u = (px * v1z - v1x * pz) / den;
    const w = (v0x * pz - px * v0z) / den;
    if (u < 0 || w < 0 || u + w > 1) continue;
    const y = tris[o + 1] + u * (tris[o + 4] - tris[o + 1]) + w * (tris[o + 7] - tris[o + 1]);
    // só assentos abaixo do teto das arquibancadas (12 m)
    if (y > best && y <= 12) best = y;
  }
  return best;
};
const out = [];
const used = new Set();
const r = rng(7);
for (let tries = 0; tries < MAX_CROWD * 4 && out.length < MAX_CROWD * 4; tries++) {
  const s = ringCandidate(r);
  const key = cellKey(s.x, s.z);
  if (used.has(key)) continue;
  const y = heightAt(s.x, s.z);
  if (y < 0.3) continue;
  used.add(key);
  out.push(s.x, y, s.z, s.yaw);
}
// x, y, z, yaw por assento, em linha; 3 casas bastam (1 mm)
writeFileSync(to, JSON.stringify(out.map((v) => Math.round(v * 1e3) / 1e3)));
console.log(`${usadas} primitivas do anel, ${tris.length / 9} degraus, ${out.length / 4} assentos -> ${to}`);
