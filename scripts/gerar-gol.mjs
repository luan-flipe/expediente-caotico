/* global console */
// Gera assets-src/futebol/gol.glb: gol de tubo branco com rede de malha, feito por código.
// Roda à mão:  node scripts/gerar-gol.mjs  (depois: node scripts/optimize-assets.mjs)
// Metros, Y para cima. 4 m de largura (x), 2 m de altura, 1,5 m de profundidade. Origem no centro da linha
// do gol, no chão; boca virada para +Z, fundo em -Z. Nós: Trave (tubos e juntas) e Rede (linhas finas).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { part, sphere, tube, writeGlb } from "./glb-util.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets-src", "futebol", "gol.glb");
const HALF = 2; // meia largura
const H = 2; // altura da trave
const D = 1.5; // profundidade
const HB = 0.9; // altura da barra de trás
const R = 0.06; // raio do tubo da frente
const RB = 0.045; // raio do tubo de trás
const NET_R = 0.007;
const CELL = 0.2;

const trave = part(), ferrugem = part(), rede = part();

/** Tubo com bolas nas pontas, para as juntas ficarem redondas. */
function bar(a, b, r) {
  tube(trave, a, b, r, 12);
  sphere(trave, a, r, 12, 8);
  sphere(trave, b, r, 12, 8);
}
// frente: dois postes e travessão
for (const s of [-1, 1]) bar([s * HALF, 0, 0], [s * HALF, H, 0], R);
bar([-HALF, H, 0], [HALF, H, 0], R);
// estrutura de trás: laterais em trapézio, barra de cima e barra no chão
for (const s of [-1, 1]) {
  bar([s * HALF, H, 0], [s * HALF, HB, -D], RB); // diagonal de cima
  bar([s * HALF, HB, -D], [s * HALF, RB, -D], RB); // poste de trás
  bar([s * HALF, RB, -D], [s * HALF, RB, 0], RB); // barra no chão da lateral
}
bar([-HALF, HB, -D], [HALF, HB, -D], RB);
bar([-HALF, RB, -D], [HALF, RB, -D], RB); // barra no chão atrás

// ferrugem: anéis curtos nas juntas (pé dos postes, ponta do travessão e cantos de trás)
const ring = (a, b, r) => tube(ferrugem, a, b, r * 1.12, 12);
for (const s of [-1, 1]) {
  ring([s * HALF, 0.0, 0], [s * HALF, 0.1, 0], R);
  ring([s * HALF, H - 0.09, 0], [s * HALF, H - 0.02, 0], R);
  ring([s * HALF, HB, -D + 0.01], [s * HALF, HB - 0.12, -D + 0.01], RB);
  ring([s * HALF, 0.0, -D], [s * HALF, 0.07, -D], RB);
}
ring([-HALF + 0.05, H, 0], [-HALF + 0.14, H, 0], R);
ring([HALF - 0.14, H, 0], [HALF - 0.05, H, 0], R);

// rede: cada linha é um tubo fino de 4 lados, sempre um pouco para dentro da estrutura
const line = (a, b) => tube(rede, a, b, NET_R, 4);
const steps = (from, to) => {
  const n = Math.max(1, Math.round(Math.abs(to - from) / CELL));
  return Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
};
const lerp = (a, b, t) => a + (b - a) * t;
const top = (x, k) => [x, lerp(H, HB, k), lerp(0, -D, k)];
// teto
for (const x of steps(-HALF, HALF).slice(1, -1)) line(top(x, 0), top(x, 1));
for (const k of steps(0, 1).slice(1, -1)) line(top(-HALF, k), top(HALF, k));
// fundo
const back = HALF - 0.01;
for (const x of steps(-back, back)) line([x, RB, -D], [x, HB, -D]);
for (const y of steps(RB, HB).slice(1, -1)) line([-back, y, -D], [back, y, -D]);
// laterais (trapézio: frente de 2 m, fundo de 0,9 m)
for (const s of [-1, 1]) {
  const x = s * (HALF - 0.01);
  for (const k of steps(0, 1).slice(1, -1)) line([x, 0, lerp(0, -D, k)], [x, lerp(H, HB, k), lerp(0, -D, k)]);
  for (const y of steps(0, HB).slice(1)) line([x, y, 0], [x, y, -D]);
  for (const y of steps(HB, H).slice(1, -1)) line([x, y, 0], [x, y, -D * ((H - y) / (H - HB))]);
}

const verts = await writeGlb(OUT, [
  {
    name: "Trave",
    parts: [
      { material: ["gol_tubo", "#f1f1ec", 0.5], mesh: trave },
      { material: ["gol_ferrugem", "#9a5a2e", 0.85], mesh: ferrugem },
    ],
  },
  { name: "Rede", parts: [{ material: ["gol_rede", "#c9cdd0", 0.9], mesh: rede }] },
]);
console.log(`${OUT}: ${verts} vértices`);
