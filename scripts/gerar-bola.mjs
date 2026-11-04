/* global console */
// Gera assets-src/futebol/bola.glb: bola de gomos (icosaedro truncado) feita por código.
// Roda à mão:  node scripts/gerar-bola.mjs  (depois: node scripts/optimize-assets.mjs)
// Metros, Y para cima, origem no centro, diâmetro 0,5 m. 12 pentágonos pretos e 20 hexágonos brancos,
// cada gomo estufado e afastado dos vizinhos; o vinco mostra a "costura" (esfera escura por dentro).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { add, cross, dot, face, mul, norm, part, push, sphere, sub, writeGlb } from "./glb-util.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets-src", "futebol", "bola.glb");
const R = 0.25;
const INSET = 0.94; // quanto o gomo encolhe em volta do centro (o resto é o vinco)
const BULGE = 0.025; // estufado do centro do gomo, em fração de R
const RING = 0.55; // anel intermediário do gomo

// icosaedro
const t = (1 + Math.sqrt(5)) / 2;
const ico = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];

// vértices do truncado: 1/3 e 2/3 de cada aresta
const edgePt = (a, b) => add(mul(ico[a], 2 / 3), mul(ico[b], 1 / 3)); // ponto da aresta a-b mais perto de a
const hexes = F.map(([a, b, c]) => [edgePt(a, b), edgePt(b, a), edgePt(b, c), edgePt(c, b), edgePt(c, a), edgePt(a, c)]);
// pentágonos: um por vértice do icosaedro, com os pontos das arestas ao redor (ordenados em volta do eixo)
const pents = ico.map((v, i) => {
  const nb = new Set();
  F.forEach((f) => f.includes(i) && f.forEach((x) => x !== i && nb.add(x)));
  const pts = [...nb].map((j) => edgePt(i, j));
  const up = Math.abs(v[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(sub(up, mul(v, dot(up, v))));
  const w = cross(v, u);
  const ang = (p) => Math.atan2(dot(p, w), dot(p, u));
  return pts.sort((p, q) => ang(p) - ang(q));
});

/** Gomo estufado: anel de fora (inset), anel do meio e centro, projetados na esfera. */
function panel(m, poly) {
  const c = mul(poly.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / poly.length);
  const at = (p, k, h) => mul(norm(add(c, mul(sub(p, c), k))), R * (1 + h));
  const outer = poly.map((p) => push(m, at(p, INSET, -BULGE * 0.25)));
  const mid = poly.map((p) => push(m, at(p, INSET * RING, BULGE * 0.75)));
  const top = push(m, at(c, 0, BULGE));
  const n = poly.length;
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    face(m, outer[k], outer[k2], mid[k2], c);
    face(m, outer[k], mid[k2], mid[k], c);
    face(m, mid[k], mid[k2], top, c);
  }
}

const preto = part(), branco = part(), costura = part();
pents.forEach((p) => panel(preto, p));
hexes.forEach((h) => panel(branco, h));
sphere(costura, [0, 0, 0], R * 0.985, 16, 10);

const verts = await writeGlb(OUT, [{
  name: "Bola",
  parts: [
    { material: ["bola_branca", "#f6f3ec", 0.35], mesh: branco },
    { material: ["bola_preta", "#1b1b20", 0.35], mesh: preto },
    { material: ["bola_costura", "#2a2a30", 0.6], mesh: costura },
  ],
}]);
console.log(`${OUT}: ${verts} vértices`);
