/* global console */
// Gera assets-src/roupas/tenis/05_adidas_do_thaythay.glb: tênis Adidas (Grand Court) feito por código.
// Roda à mão:  node scripts/gerar-tenis-adidas.mjs  (depois: node scripts/optimize-assets.mjs)
//
// Mesma construção do gerar-sapato-crocs.mjs: cada pé é medido no boneco_completo.glb e o tênis é feito de
// perfis (r, y) que giram em volta do meio do pé, tudo pesado no osso do pé. Sola branca alta, cabedal preto,
// três listras brancas em cada lado, aba branca no calcanhar e cadarço preto. As listras, a aba e o cadarço
// são fitas assentadas no cabedal por raio.
// Só o cabedal e o forro mudam com a cor do crachá: sola, listras, aba e cadarço casam com FIXED_PART de
// game/character.ts ("sola", "fixa"/"fixo", "cadarco").
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, PropertyType } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BONECO = join(root, "assets-src", "characters", "boneco_completo.glb");
const OUT = join(root, "assets-src", "roupas", "tenis", "05_adidas_do_thaythay.glb");

const AROUND = 56;
const ROWS = 14;
const INNER_ROWS = 6;
const GROUND = 0.001;
const SOLE_TOP = 0.036;
const UPPER_BASE = SOLE_TOP - 0.004;
const FOOTBED = 0.012;
const THICK = 0.008;
const HEEL_BACK = 0.016;
const TOE_FRONT = 0.036;
const HEEL_R = [0.088, 0.07];
const TOE_R = [0.1, 0.095];
const TOE_SPRING = 0.012;
const SOLE_OUT = 0.006;
const COLLAR_GAP = { side: 0.009, front: 0.013, back: 0.011 };
const COLLAR_EXP = 2.4;
/** Altura da boca por ângulo em volta do pé: 0 é a ponta, π é o calcanhar. */
const COLLAR_HEIGHT = [[0, 0.102], [0.5, 0.099], [0.9, 0.094], [1.3, 0.087], [1.8, 0.083], [2.4, 0.092], [Math.PI, 0.104]];
/** Altura do bico: da boca o cabedal desce até aqui na ponta, depois faz a curva até a sola. */
const TOE_BOX = 0.06;
/** Largura de cada listra medida ao longo do pé. */
const STRIPE_W = 0.013;
/** z do pé de cada listra a partir do meio do pé (largura mais vão) e quanto o alto avança para a frente. */
const STRIPE_Z = [0.0, 0.022, 0.044];
const STRIPE_LEAN = 0.05;
/** As listras sobem girando em volta de um eixo ao longo do pé, na altura da sola, até este ângulo (0 é de lado). */
const STRIPE_RISE = 1.3;
/** As listras param esta altura abaixo da boca, ou onde o cabedal já vira para cima (peito do pé). */
const STRIPE_STOP = 0.012;
const STRIPE_FLAT = 0.8;
const STRIPE_LIFT = 0.0009;
const TAB_W = 0.044;
const TAB_H = 0.05;
const TAB_LIFT = 0.0016;
const LACE_R = 0.0028;
const LACES = [0.004, 0.018, 0.032];
const LACE_HALF = [0.027, 0.025, 0.022];

const srgb = (hex) =>
  [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
/** [nome, cor da foto de referência, rugosidade]. O cabedal tem que ser a parte de mais vértices entre as que mudam. */
const MATERIALS = [
  ["adidas", "#1d1d1d", 0.5],
  ["adidas_forro", "#121212", 0.85],
  ["adidas_sola", "#f3f3f1", 0.6],
  ["adidas_faixa_fixa", "#f4f4f2", 0.45],
  ["adidas_calcanhar_fixo", "#f4f4f2", 0.45],
  ["adidas_cadarco", "#151515", 0.7],
];

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / (Math.hypot(...a) || 1));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const table = (rows, x) => {
  const k = rows.findIndex(([rx]) => rx > x);
  if (k <= 0) return rows[k < 0 ? rows.length - 1 : 0][1];
  const [[x0, y0], [x1, y1]] = [rows[k - 1], rows[k]];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
};
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const bezier = (P, t) => {
  const u = 1 - t, k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [0, 1].map((c) => P.reduce((s, p, i) => s + p[c] * k[i], 0));
};
const bezierTangent = (P, t) => {
  const u = 1 - t;
  return [0, 1].map((c) => 3 * u * u * (P[1][c] - P[0][c]) + 6 * u * t * (P[2][c] - P[1][c]) + 3 * t * t * (P[3][c] - P[2][c]));
};

/** Primeiro ponto (distância t > 0) onde o raio corta um dos triângulos [a, b, c] (Möller–Trumbore). */
function raycast(tris, origin, dir) {
  let best = null;
  for (const [a, b, c] of tris) {
    const e1 = sub(b, a), e2 = sub(c, a), p = cross(dir, e2), det = dot(e1, p);
    if (Math.abs(det) < 1e-12) continue;
    const s = sub(origin, a), u = dot(s, p) / det;
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1), v = dot(dir, q) / det;
    if (v < 0 || u + v > 1) continue;
    const t = dot(e2, q) / det;
    if (t > 1e-6 && (!best || t < best.t)) best = { t, point: add(origin, mul(dir, t)), normal: norm(cross(e1, e2)) };
  }
  return best;
}

const boneco = await io.read(BONECO);
const body = boneco.getRoot().listNodes().find((n) => n.getName() === "boneco");
const bodyPrim = body.getMesh().listPrimitives()[0];
const bodyBones = body.getSkin().listJoints().map((j) => j.getName());
/** Pontos do corpo com mais da metade do peso em `bones`. */
function bodyPoints(bones, keep) {
  const pos = bodyPrim.getAttribute("POSITION"), J = bodyPrim.getAttribute("JOINTS_0"), W = bodyPrim.getAttribute("WEIGHTS_0");
  const out = [], j = [], w = [];
  for (let i = 0; i < pos.getCount(); i++) {
    J.getElement(i, j); W.getElement(i, w);
    const p = pos.getElement(i, []);
    if (j.reduce((s, ji, k) => s + (bones.includes(bodyBones[ji]) ? w[k] : 0), 0) > 0.5 && keep(p)) out.push(p);
  }
  return out;
}
const range = (pts, c) => [Math.min(...pts.map((p) => p[c])), Math.max(...pts.map((p) => p[c]))];
const mid = ([a, b]) => (a + b) / 2;

/** Malha de uma parte: vértices e triângulos. */
const part = () => ({ positions: [], tri: [] });
const push = (m, p) => (m.positions.push(p), m.positions.length - 1);
/** Triângulo virado para `away`. */
function face(m, a, b, c, away) {
  const P = m.positions, n = cross(sub(P[b], P[a]), sub(P[c], P[a]));
  m.tri.push(...(dot(n, away) >= 0 ? [a, b, c] : [a, c, b]));
}
const trianglesOf = (m) => {
  const out = [];
  for (let t = 0; t < m.tri.length; t += 3) out.push([m.tri[t], m.tri[t + 1], m.tri[t + 2]].map((i) => m.positions[i]));
  return out;
};

function adidas(side) {
  const foot = bodyPoints([`pe_${side}`], (p) => p[1] < 0.05);
  const leg = bodyPoints([`joelho_${side}`, `perna_${side}`], (p) => p[1] > 0.07 && p[1] < 0.16);
  const footX = range(foot, 0), footZ = range(foot, 2), legX = range(leg, 0), legZ = range(leg, 2);
  const cx = mid(footX), cz = mid(footZ);
  const z0 = footZ[0] - HEEL_BACK, z1 = footZ[1] + TOE_FRONT;
  const lx = mid(legX), lz = mid(legZ);
  const ax = (legX[1] - legX[0]) / 2 + COLLAR_GAP.side, azF = legZ[1] - lz + COLLAR_GAP.front, azB = lz - legZ[0] + COLLAR_GAP.back;
  /** Lado de fora do pé (+1 ou -1 em x): o pé direito fica em x < 0. */
  const outward = Math.sign(cx);

  const halfWidth = (z) => {
    const zh = z0 + HEEL_R[1], zt = z1 - TOE_R[1];
    if (z <= z0 || z >= z1) return 0;
    if (z < zh) return HEEL_R[0] * Math.sqrt(1 - ((zh - z) / HEEL_R[1]) ** 2);
    if (z > zt) return TOE_R[0] * Math.sqrt(1 - ((z - zt) / TOE_R[1]) ** 2);
    return lerp(HEEL_R[0], TOE_R[0], smooth(zh, zt, z));
  };
  const inBase = (x, z) => Math.abs(x - cx) < halfWidth(z);
  const inCollar = (x, z) => (Math.abs(x - lx) / ax) ** COLLAR_EXP + (Math.abs(z - lz) / (z > lz ? azF : azB)) ** COLLAR_EXP <= 1;
  /** Distância do meio do pé até a borda da região na direção `th` (0 é a ponta, +π/2 é o lado +X). */
  const reach = (inside, th) => {
    let lo = 0, hi = 0.4;
    for (let k = 0; k < 40; k++) {
      const m = (lo + hi) / 2;
      if (inside(cx + Math.sin(th) * m, cz + Math.cos(th) * m)) lo = m;
      else hi = m;
    }
    return lo;
  };
  const spring = (z) => TOE_SPRING * smooth(z1 - 0.08, z1, z) ** 2;
  const world = (th, r, y) => [cx + Math.sin(th) * r, y, cz + Math.cos(th) * r];
  const lifted = (th, r, y, k) => [r, y + k * spring(cz + Math.cos(th) * r)];

  const profiles = new Map();
  /** Cabedal na direção `th`: sobe de dentro da sola, faz o bico baixo na frente e fecha na boca. */
  const profile = (th) => {
    const key = th.toFixed(6);
    if (profiles.has(key)) return profiles.get(key);
    const rB = reach(inBase, th), rC = reach(inCollar, th);
    const yB = UPPER_BASE + spring(cz + Math.cos(th) * rB), yC = table(COLLAR_HEIGHT, Math.abs(wrap(th)));
    const dy = yC - yB, dr = rB - rC;
    // de frente o cabedal sobe pouco no bico e vai subindo devagar até a boca; dos lados e atrás sobe reto
    const front = smooth(1.6, 0, Math.abs(wrap(th))), toe = Math.min(TOE_BOX, yC) - yB;
    const P = [
      [rB, yB],
      [rB + 0.004, yB + lerp(0.7 * dy, 1.15 * toe, front)],
      [rC + lerp(0.3, 0.55, front) * dr + 0.004, lerp(yC, yB + toe + 0.3 * (yC - yB - toe), front)],
      [rC, yC],
    ];
    const out = { rB, rC, yB, yC, at: (s) => bezier(P, s), tangent: (s) => bezierTangent(P, s) };
    profiles.set(key, out);
    return out;
  };

  const parts = Object.fromEntries(MATERIALS.map(([name]) => [name, part()]));
  const ths = Array.from({ length: AROUND }, (_, i) => -Math.PI + (i / AROUND) * 2 * Math.PI);

  /** Gira os perfis (um por ângulo de `ths`, todos com o mesmo número de pontos); r = 0 é o polo. */
  function revolve(m, rows) {
    const ids = [], poles = new Map();
    rows.forEach((row, i) =>
      ids.push(row.map(([r, y], j) => {
        if (r > 1e-6) return push(m, world(ths[i], r, y));
        if (!poles.has(j)) poles.set(j, push(m, world(0, 0, y)));
        return poles.get(j);
      })),
    );
    for (let i = 0; i < AROUND; i++) {
      const i2 = (i + 1) % AROUND, th = ths[i] + Math.PI / AROUND, row = rows[i];
      for (let j = 0; j < row.length - 1; j++) {
        const [a, b, c, d] = [ids[i][j], ids[i2][j], ids[i2][j + 1], ids[i][j + 1]];
        const t = [row[j + 1][0] - row[j][0], row[j + 1][1] - row[j][1]];
        const away = [Math.sin(th) * t[1], -t[0], Math.cos(th) * t[1]];
        if (a !== b) face(m, a, b, c, away);
        if (c !== d) face(m, a, c, d, away);
      }
    }
  }

  const outer = [], inner = [], sole = [];
  for (const th of ths) {
    const p = profile(th);
    const cap = [135, 180, 225, 270].map((a) => {
      const r = (a * Math.PI) / 180;
      return [p.rC + (Math.cos(r) * THICK) / 2, p.yC - THICK / 2 + (Math.sin(r) * THICK) / 2];
    });
    outer.push([...Array.from({ length: ROWS + 1 }, (_, j) => p.at(j / ROWS)), ...cap]);
    const offset = Array.from({ length: INNER_ROWS + 1 }, (_, j) => {
      const s = 1 - j / INNER_ROWS, [r, y] = p.at(s), t = p.tangent(s), l = Math.hypot(...t);
      return [r - (THICK * t[1]) / l, y + (THICK * t[0]) / l];
    });
    inner.push([...offset, lifted(th, p.rB - THICK - 0.004, FOOTBED, 1), lifted(th, 0, FOOTBED, 1)]);
    const rB = p.rB, k = (y) => 1 - (0.5 * (y - GROUND)) / (SOLE_TOP - GROUND);
    sole.push(
      [
        [0, GROUND], [0.55 * rB, GROUND], [rB - 0.006, GROUND], [rB + SOLE_OUT - 0.003, GROUND + 0.0006], [rB + SOLE_OUT - 0.0005, GROUND + 0.003],
        [rB + SOLE_OUT, GROUND + 0.008], [rB + SOLE_OUT, SOLE_TOP - 0.006], [rB + SOLE_OUT - 0.0006, SOLE_TOP - 0.0015],
        [rB + SOLE_OUT - 0.003, SOLE_TOP], [rB - 0.002, SOLE_TOP],
      ].map(([r, y]) => lifted(th, r, y, k(y))),
    );
  }
  revolve(parts.adidas, outer);
  revolve(parts.adidas_forro, inner);
  revolve(parts.adidas_sola, sole);

  const upper = trianglesOf(parts.adidas);
  /** Ponto do cabedal visto de fora pelo raio de `from` na direção `dir`, levantado `lift` na normal. */
  const onUpper = (from, dir, lift) => {
    const hit = raycast(upper, from, dir);
    if (!hit) return null;
    const n = dot(hit.normal, dir) > 0 ? mul(hit.normal, -1) : hit.normal;
    return { p: add(hit.point, mul(n, lift)), n };
  };
  /** Fita assentada no cabedal: grade de pontos `grid[i][j]` ({p, n}) ligada em quadrados virados para fora. */
  const ribbon = (m, grid) => {
    const ids = grid.map((row) => row.map((v) => push(m, v.p)));
    for (let i = 0; i < grid.length - 1; i++)
      for (let j = 0; j < grid[i].length - 1; j++) {
        const n = grid[i][j].n;
        face(m, ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], n);
        face(m, ids[i][j], ids[i + 1][j + 1], ids[i][j + 1], n);
      }
  };

  // Três listras de cada lado: saem de dentro da sola e sobem pelo lado e pela curva do cabedal, inclinadas
  // para a frente, até perto da boca. Cada ponto vai para o cabedal por um raio na direção do eixo do pé.
  const belowCollar = ([x, y, z]) => y < table(COLLAR_HEIGHT, Math.abs(Math.atan2(x - cx, z - cz))) - STRIPE_STOP;
  let stripes = 0;
  for (const s of [outward, -outward])
    for (const zb of STRIPE_Z) {
      const rows = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16, a = t * STRIPE_RISE, dir = [-s * Math.cos(a), -Math.sin(a), 0], row = [];
        for (const v of [-1, 0, 1]) {
          const z = cz + zb + t * STRIPE_LEAN + (v * STRIPE_W) / 2;
          const hit = onUpper([cx - dir[0] * 0.4, SOLE_TOP - dir[1] * 0.4, z], dir, STRIPE_LIFT);
          if (!hit || !belowCollar(hit.p) || hit.n[1] > STRIPE_FLAT) break;
          row.push(hit);
        }
        if (row.length === 3) rows.push(row);
        else if (rows.length) break;
      }
      if (rows.length < 2) continue;
      ribbon(parts.adidas_faixa_fixa, rows);
      stripes++;
    }

  // Aba do calcanhar: retângulo assentado atrás, da boca para baixo.
  {
    const top = table(COLLAR_HEIGHT, Math.PI) - 0.004, rows = [];
    for (let i = 0; i <= 6; i++) {
      const y = top - (TAB_H * i) / 6, row = [];
      for (let j = 0; j <= 4; j++) {
        const hit = onUpper([cx + ((j / 4) * 2 - 1) * (TAB_W / 2), y, cz - 0.4], [0, 0, 1], TAB_LIFT);
        if (hit) row.push(hit);
      }
      if (row.length === 5) rows.push(row);
    }
    ribbon(parts.adidas_calcanhar_fixo, rows);
  }

  // Cadarço: travessas redondas no peito do pé, logo à frente da boca, assentadas por raios de cima.
  const lace = parts.adidas_cadarco;
  const throat = lz + azF;
  LACES.forEach((dz, k) => {
    const z = throat + dz, half = LACE_HALF[k], sections = [];
    for (let i = 0; i <= 8; i++) {
      const x = lx + (i / 8) * 2 * half - half, hit = onUpper([x, 0.5, z], [0, -1, 0], LACE_R);
      if (!hit) continue;
      sections.push(hit);
    }
    if (sections.length < 2) return;
    const rings = sections.map(({ p, n }, i) => {
      const T = norm(sub(sections[Math.min(i + 1, sections.length - 1)].p, sections[Math.max(i - 1, 0)].p));
      const N = norm(sub(n, mul(T, dot(n, T)))), B = cross(T, N);
      return Array.from({ length: 6 }, (_, a) => {
        const ang = (a / 6) * 2 * Math.PI;
        return push(lace, add(p, add(mul(N, Math.cos(ang) * LACE_R), mul(B, Math.sin(ang) * LACE_R))));
      }).map((id) => ({ id, c: p }));
    });
    for (let i = 0; i < rings.length - 1; i++)
      for (let a = 0; a < 6; a++) {
        const a2 = (a + 1) % 6, [r0, r1] = [rings[i], rings[i + 1]], away = sub(lace.positions[r0[a].id], r0[a].c);
        face(lace, r0[a].id, r0[a2].id, r1[a2].id, away);
        face(lace, r0[a].id, r1[a2].id, r1[a].id, away);
      }
    for (const [ring, end] of [[rings[0], -1], [rings[rings.length - 1], 1]]) {
      const c = push(lace, ring[0].c);
      for (let a = 0; a < 6; a++) face(lace, c, ring[a].id, ring[(a + 1) % 6].id, [end, 0, 0]);
    }
  });

  console.log(`${side}: ${stripes} listras, ${Object.entries(parts).map(([n, m]) => `${n} ${m.positions.length}`).join(", ")}`);
  return parts;
}

const normalsOf = ({ positions, tri }) => {
  const normals = positions.map(() => [0, 0, 0]);
  for (let t = 0; t < tri.length; t += 3) {
    const [a, b, c] = [tri[t], tri[t + 1], tri[t + 2]];
    const n = cross(sub(positions[b], positions[a]), sub(positions[c], positions[a]));
    for (const i of [a, b, c]) normals[i] = add(normals[i], n);
  }
  return normals.map(norm);
};

// Tênis calculados antes de apagar as malhas do boneco, que são a medida deles.
const shoes = Object.fromEntries(["D", "E"].map((side) => [side, adidas(side)]));

// O arquivo é o próprio boneco_completo.glb sem as malhas: com o joelho no esqueleto da peça, o jogo não
// refaz os pesos pelo corpo (retargetWearable) e o tênis segue só o pé, sem torcer quando a canela dobra.
const doc = boneco;
const gltf = doc.getRoot();
for (const anim of gltf.listAnimations()) {
  for (const p of [...anim.listChannels(), ...anim.listSamplers()]) p.dispose();
  anim.dispose();
}
const skin = body.getSkin();
const joints = skin.listJoints().map((j) => j.getName());
const parent = body.getParentNode();
if (body.getWorldMatrix().some((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) > 1e-6)) throw new Error("boneco fora da origem");
for (const node of gltf.listNodes()) node.setMesh(null);
body.dispose();
const buffer = gltf.listBuffers()[0];
const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
const materials = Object.fromEntries(
  MATERIALS.map(([name, hex, rough]) => [name, doc.createMaterial(name).setBaseColorFactor([...srgb(hex), 1]).setRoughnessFactor(rough).setMetallicFactor(0)]),
);
let total = 0;
for (const [side, parts] of Object.entries(shoes)) {
  const mesh = doc.createMesh(`adidas_${side}`);
  const node = doc.createNode(`adidas_${side}`).setMesh(mesh).setSkin(skin);
  if (parent) parent.addChild(node);
  else gltf.listScenes()[0].addChild(node);
  const foot = joints.indexOf(`pe_${side}`);
  for (const [name, m] of Object.entries(parts)) {
    const count = m.positions.length;
    if (!count) continue;
    total += count;
    mesh.addPrimitive(
      doc
        .createPrimitive()
        .setMaterial(materials[name])
        .setAttribute("POSITION", accessor("VEC3", new Float32Array(m.positions.flat())))
        .setAttribute("NORMAL", accessor("VEC3", new Float32Array(normalsOf(m).flat())))
        .setAttribute("JOINTS_0", accessor("VEC4", new Uint8Array(m.positions.flatMap(() => [foot, 0, 0, 0]))))
        .setAttribute("WEIGHTS_0", accessor("VEC4", new Float32Array(m.positions.flatMap(() => [1, 0, 0, 0]))))
        .setIndices(accessor("SCALAR", count > 65535 ? new Uint32Array(m.tri) : new Uint16Array(m.tri))),
    );
  }
}
const { MESH, PRIMITIVE, PRIMITIVE_TARGET, ACCESSOR, MATERIAL, TEXTURE } = PropertyType;
await doc.transform(prune({ propertyTypes: [MESH, PRIMITIVE, PRIMITIVE_TARGET, ACCESSOR, MATERIAL, TEXTURE] }));
await io.write(OUT, doc);
console.log(`${OUT}: ${total} vértices no par`);
