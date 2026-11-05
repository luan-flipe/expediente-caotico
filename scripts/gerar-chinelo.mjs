/* global console */
// Refaz a tira de assets-src/roupas/tenis/06_chinelo.glb (solado e palmilha ficam como estão).
// Roda à mão:  node scripts/gerar-chinelo.mjs  (depois: node scripts/optimize-assets.mjs)
//
// Tira de chinelo de dedo: um nó em cima dos dedos, entre o dedão e o segundo dedo, e duas tiras em V que
// descem pelos lados do pé até a beira da palmilha. O caminho de cada tira é uma curva guia projetada no pé
// do boneco_completo.glb (ponto mais perto da pele), com folga; tudo pesado no osso do pé.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, PropertyType } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import { add, cross, dot, face, mul, norm, normalsOf, part, push, sub } from "./glb-util.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BONECO = join(root, "assets-src", "characters", "boneco_completo.glb");
const FILE = join(root, "assets-src", "roupas", "tenis", "06_chinelo.glb");

/** Nó: fração da meia largura do pé para o lado do dedão, e distância para trás da ponta do pé. */
const KNOT_IN = 0.3;
const KNOT_BACK = 0.03;
const KNOT_R = 0.0085;
/** Onde cada tira chega na palmilha: z, e quanto fica para dentro da beira. */
const ANCHOR_Z = 0.055;
const ANCHOR_IN = 0.007;
const STRAP_W = 0.017;
const STRAP_T = 0.0042;
const CLEAR = 0.0015;
const SEGMENTS = 36;

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });

const boneco = await io.read(BONECO);
const body = boneco.getRoot().listNodes().find((n) => n.getName() === "boneco");
if (body.getWorldMatrix().some((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) > 1e-6)) throw new Error("boneco fora da origem");
const bodyPrim = body.getMesh().listPrimitives()[0];
const bodyBones = body.getSkin().listJoints().map((j) => j.getName());
const bodyPos = bodyPrim.getAttribute("POSITION");
const P = Array.from({ length: bodyPos.getCount() }, (_, i) => bodyPos.getElement(i, []));
const bodyNrm = bodyPrim.getAttribute("NORMAL");
const Nrm = Array.from({ length: bodyNrm.getCount() }, (_, i) => bodyNrm.getElement(i, []));

const doc = await io.read(FILE);
const mesh = doc.getRoot().listMeshes()[0];
const node = doc.getRoot().listNodes().find((n) => n.getMesh() === mesh);
const joints = node.getSkin().listJoints().map((j) => j.getName());
const prims = Object.fromEntries(mesh.listPrimitives().map((p) => [p.getMaterial().getName(), p]));
const palm = prims.palmilha.getAttribute("POSITION");
const palmPts = Array.from({ length: palm.getCount() }, (_, i) => palm.getElement(i, []));
const PALM_TOP = Math.max(...palmPts.map((p) => p[1]));

/** Pontos do corpo com mais da metade do peso em `bone`. */
function bonePoints(bone) {
  const J = bodyPrim.getAttribute("JOINTS_0"), W = bodyPrim.getAttribute("WEIGHTS_0"), j = [], w = [];
  return P.filter((_, i) => {
    J.getElement(i, j); W.getElement(i, w);
    return j.reduce((s, ji, k) => s + (bodyBones[ji] === bone ? w[k] : 0), 0) > 0.5;
  });
}
const range = (pts, c) => [Math.min(...pts.map((p) => p[c])), Math.max(...pts.map((p) => p[c]))];

/** Ponto do triângulo mais perto de p (Ericson, Real-Time Collision Detection 5.1.5) e seus pesos baricêntricos. */
function closestOnTri(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [1, 0, 0];
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [0, 1, 0];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [1 - v, v, 0]; }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [0, 0, 1];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [1 - w, 0, w]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return [0, 1 - w, w]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [1 - v - w, v, w];
}

function strap(side) {
  const foot = bonePoints(`pe_${side}`).filter((p) => p[1] < 0.09);
  const [x0, x1] = range(foot, 0), [, zTip] = range(foot, 2);
  const cx = (x0 + x1) / 2, half = (x1 - x0) / 2;
  // o dedão fica do lado de dentro, virado para x = 0
  const inward = -Math.sign(cx);
  const tris = [];
  const I = bodyPrim.getIndices();
  for (let t = 0; t < I.getCount(); t += 3) {
    const tri = [0, 1, 2].map((k) => I.getScalar(t + k));
    if (tri.every((i) => P[i][1] < 0.2 && Math.sign(P[i][0]) === Math.sign(cx))) tris.push(tri);
  }

  /** Ponto da pele mais perto de p, empurrado para fora pela normal suave até a tira só encostar. */
  const onFoot = (p) => {
    let best = null;
    for (const [a, b, c] of tris) {
      const w = closestOnTri(p, P[a], P[b], P[c]);
      const q = add(add(mul(P[a], w[0]), mul(P[b], w[1])), mul(P[c], w[2]));
      const d = Math.hypot(...sub(p, q));
      if (!best || d < best.d) best = { d, q, n: norm(add(add(mul(Nrm[a], w[0]), mul(Nrm[b], w[1])), mul(Nrm[c], w[2]))) };
    }
    return { p: add(best.q, mul(best.n, CLEAR + STRAP_T)), n: best.n, q: best.q };
  };
  const top = onFoot([cx + inward * KNOT_IN * half, 0.09, zTip - KNOT_BACK]);
  const knot = top.p;

  const palmSide = palmPts.filter((p) => Math.sign(p[0]) === Math.sign(cx) && Math.abs(p[2] - ANCHOR_Z) < 0.012);
  const m = part();
  for (const dirX of [inward, -inward]) {
    const edge = dirX > 0 ? Math.max(...palmSide.map((p) => p[0])) : Math.min(...palmSide.map((p) => p[0]));
    const anchor = [edge - dirX * ANCHOR_IN, PALM_TOP + STRAP_T, ANCHOR_Z];
    const guide = [knot, add(knot, [(anchor[0] - knot[0]) * 0.5, 0, (anchor[2] - knot[2]) * 0.5]), add(anchor, [0, 0.04, 0]), anchor];
    const bez = (t) => {
      const u = 1 - t, k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
      return [0, 1, 2].map((c) => guide.reduce((s, g, i) => s + g[c] * k[i], 0));
    };
    let pts = Array.from({ length: 80 }, (_, i) => onFoot(bez(i / 79)));
    pts[0] = top;
    for (let pass = 0; pass < 8; pass++)
      pts = pts.map((q, i) => (i === 0 || i === pts.length - 1 ? q : onFoot(mul(add(add(pts[i - 1].p, pts[i + 1].p), mul(q.p, 2)), 0.25))));
    // a pele é facetada: alisa sem projetar de novo, só empurrando para fora o ponto que entrar nela
    const avg = (v, i, get) => mul(add(add(get(v[i - 1]), get(v[i + 1])), mul(get(v[i]), 2)), 0.25);
    for (let pass = 0; pass < 24; pass++)
      pts = pts.map((q, i, v) => {
        if (i === 0 || i === v.length - 1) return q;
        const p = avg(v, i, (o) => o.p), skin = onFoot(p), depth = dot(sub(p, skin.q), skin.n);
        return { p: depth < CLEAR + STRAP_T ? add(p, mul(skin.n, CLEAR + STRAP_T - depth)) : p, n: norm(avg(v, i, (o) => o.n)) };
      });
    pts = pts.map(({ p, n }) => ({ p: [p[0], Math.max(p[1], PALM_TOP + STRAP_T), p[2]], n }));
    pts.push({ p: [pts.at(-1).p[0], PALM_TOP - 0.001, pts.at(-1).p[2]], n: pts.at(-1).n });

    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(...sub(pts[i].p, pts[i - 1].p)));
    const at = (s) => {
      const k = Math.max(1, len.findIndex((l) => l >= s)), f = (s - len[k - 1]) / (len[k] - len[k - 1] || 1);
      return { p: add(pts[k - 1].p, mul(sub(pts[k].p, pts[k - 1].p), f)), n: norm(add(mul(pts[k - 1].n, 1 - f), mul(pts[k].n, f))) };
    };
    const total = len.at(-1);
    const sections = Array.from({ length: SEGMENTS + 1 }, (_, i) => {
      const s = (i / SEGMENTS) * total, { p, n } = at(s);
      const T = norm(sub(at(Math.min(total, s + 1e-3)).p, at(Math.max(0, s - 1e-3)).p));
      const W = norm(cross(T, n)), N = cross(W, T);
      // a tira afina um pouco perto do nó, como na de borracha
      const w = STRAP_W * (0.8 + 0.2 * Math.min(1, i / (SEGMENTS * 0.25)));
      const C = sub(p, mul(N, STRAP_T / 2));
      const ring = [[1, 0.55], [0.8, 1], [-0.8, 1], [-1, 0.55], [-1, -0.55], [-0.8, -1], [0.8, -1], [1, -0.55]];
      return { C, T, ids: ring.map(([a, b]) => push(m, add(C, add(mul(W, (a * w) / 2), mul(N, (b * STRAP_T) / 2))))) };
    });
    for (let i = 0; i < SEGMENTS; i++) {
      const [s0, s1] = [sections[i], sections[i + 1]];
      for (let k = 0; k < 8; k++) {
        const k2 = (k + 1) % 8, away = sub(m.positions[s0.ids[k]], s0.C);
        face(m, s0.ids[k], s0.ids[k2], s1.ids[k2], away);
        face(m, s0.ids[k], s1.ids[k2], s1.ids[k], away);
      }
    }
    for (const [sec, dir] of [[sections[0], mul(sections[0].T, -1)], [sections[SEGMENTS], sections[SEGMENTS].T]]) {
      const c = push(m, sec.C);
      for (let k = 0; k < 8; k++) face(m, c, sec.ids[k], sec.ids[(k + 1) % 8], dir);
    }
  }

  // nó achatado em cima do pé, onde as duas tiras se juntam
  const n = top.n, e1 = norm(cross(n, [1, 0, 0])), e2 = cross(n, e1), C = sub(top.p, mul(n, STRAP_T));
  const rows = 6, around = 12, ids = [];
  for (let i = 0; i <= rows; i++) {
    const ph = (i / rows) * Math.PI, row = [];
    for (let k = 0; k < around; k++) {
      const th = (k / around) * 2 * Math.PI, r = Math.sin(ph) * KNOT_R;
      row.push(push(m, add(C, add(add(mul(e1, Math.cos(th) * r), mul(e2, Math.sin(th) * r)), mul(n, Math.cos(ph) * KNOT_R * 0.55)))));
    }
    ids.push(row);
  }
  for (let i = 0; i < rows; i++)
    for (let k = 0; k < around; k++) {
      const k2 = (k + 1) % around, [a, b, d, e] = [ids[i][k], ids[i][k2], ids[i + 1][k], ids[i + 1][k2]];
      const out = sub(m.positions[a], C);
      face(m, a, b, e, out);
      face(m, a, e, d, out);
    }

  console.log(`${side}: pé x ${[x0, x1].map((v) => v.toFixed(3))} ponta z ${zTip.toFixed(3)}, nó ${knot.map((v) => v.toFixed(3))}, ${m.positions.length} vértices`);
  return { joint: joints.indexOf(`pe_${side}`), m };
}

const feet = ["D", "E"].map(strap);
const all = part();
const J = [];
for (const { joint, m } of feet) {
  const base = all.positions.length;
  all.positions.push(...m.positions);
  all.tri.push(...m.tri.map((i) => i + base));
  J.push(...m.positions.flatMap(() => [joint, 0, 0, 0]));
}
const buffer = doc.getRoot().listBuffers()[0];
const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
prims.tira
  .setAttribute("POSITION", accessor("VEC3", new Float32Array(all.positions.flat())))
  .setAttribute("NORMAL", accessor("VEC3", new Float32Array(normalsOf(all).flat())))
  .setAttribute("JOINTS_0", accessor("VEC4", new Uint8Array(J)))
  .setAttribute("WEIGHTS_0", accessor("VEC4", new Float32Array(all.positions.flatMap(() => [1, 0, 0, 0]))))
  .setIndices(accessor("SCALAR", new Uint16Array(all.tri)));
await doc.transform(prune({ propertyTypes: [PropertyType.ACCESSOR] }));
await io.write(FILE, doc);
console.log(`${FILE}: tira com ${all.positions.length} vértices`);
