/* global console */
// Gera assets-src/roupas/tenis/04_crocs.glb: Crocs feito por código.
// Roda à mão:  node scripts/gerar-sapato-crocs.mjs  (depois: node scripts/optimize-assets.mjs)
//
// Cada pé é medido no boneco_completo.glb: a planta pelos pontos presos a `pe_D`/`pe_E` e o tornozelo pelos
// presos a `joelho`/`perna`, que a boca do sapato contorna com folga. O sapato é feito de perfis (r, y) que
// giram em volta do meio do pé, com tudo pesado no osso do pé.
// As partes escuras (base, lado de dentro, fundo dos furos) guardam no material o quanto são mais escuras
// que o cabedal, para a cor do crachá tingir o sapato inteiro. Nenhum nome de material pode casar com
// FIXED_PART de game/character.ts ("sola" incluso), senão a parte fica sem tingir.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, PropertyType } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BONECO = join(root, "assets-src", "characters", "boneco_completo.glb");
const OUT = join(root, "assets-src", "roupas", "tenis", "04_crocs.glb");

const AROUND = 52;
const ROWS = 12;
const INNER_ROWS = 6;
const GROUND = 0.001; // altura da sola do 01_tenis
const SOLE_TOP = 0.03;
const FOOTBED = 0.004;
const THICK = 0.009;
const HEEL_BACK = 0.018;
const TOE_FRONT = 0.05;
const HEEL_R = [0.094, 0.08];
const TOE_R = [0.108, 0.1];
const TOE_SPRING = 0.028;
const COLLAR_GAP = { side: 0.011, front: 0.016, back: 0.012 };
const COLLAR_EXP = 2.4;
/** Altura da boca por ângulo em volta do pé: 0 é a ponta, π é o calcanhar. */
const COLLAR_HEIGHT = [[0, 0.12], [0.5, 0.116], [0.9, 0.094], [1.3, 0.073], [1.8, 0.068], [2.4, 0.072], [Math.PI, 0.076]];
const HOLE_SIDES = 12;
const HOLE_RIM = 0.004;
const TOP_HOLE_R = 0.0085;
const SIDE_HOLE_R = 0.0065;
/** Furos de cima: [distância para a frente da boca, deslocamentos para o lado]. */
const TOP_HOLES = [
  [0.018, [-0.063, -0.021, 0.021, 0.063]],
  [0.04, [-0.042, 0, 0.042]],
  [0.061, [-0.021, 0.021]],
];
const SIDE_HOLES = { y: 0.06, angles: [0.42, 0.64, 0.86, 1.08] };
const STRAP_AT = 1.75;
const STRAP_PAST = 0.14;
const STRAP_SEGMENTS = 30;
const STRAP_W = 0.011;
const STRAP_T = 0.0032;
const RIVET_Y = 0.052;
const STRAP_BACK_Y = 0.098;
const RIVET_R = 0.0125;

const srgb = (hex) =>
  [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
const COLOR = srgb("#8dc63f");
/** [nome, fator sobre a cor do cabedal, rugosidade]. O cabedal tem que ser a parte de mais vértices. */
const MATERIALS = [
  ["crocs", 1, 0.55],
  ["crocs_base", 0.85, 0.6],
  ["crocs_dentro", 0.6, 0.85],
  ["crocs_furo", 0.22, 0.9],
  ["crocs_tira", 1, 0.5],
  ["crocs_rebite", 0.92, 0.45],
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

function crocs(side) {
  const foot = bodyPoints([`pe_${side}`], (p) => p[1] < 0.05);
  const leg = bodyPoints([`joelho_${side}`, `perna_${side}`], (p) => p[1] > 0.07 && p[1] < 0.16);
  const footX = range(foot, 0), footZ = range(foot, 2), legX = range(leg, 0), legZ = range(leg, 2);
  const cx = mid(footX), cz = mid(footZ);
  const z0 = footZ[0] - HEEL_BACK, z1 = footZ[1] + TOE_FRONT;
  const lx = mid(legX), lz = mid(legZ);
  const ax = (legX[1] - legX[0]) / 2 + COLLAR_GAP.side, azF = legZ[1] - lz + COLLAR_GAP.front, azB = lz - legZ[0] + COLLAR_GAP.back;
  console.log(`${side}: pé x ${footX.map((v) => v.toFixed(3))} z ${footZ.map((v) => v.toFixed(3))}, tornozelo x ${legX.map((v) => v.toFixed(3))} z ${legZ.map((v) => v.toFixed(3))}`);

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
  const spring = (z) => TOE_SPRING * smooth(z1 - 0.09, z1, z) ** 2;
  const world = (th, r, y) => [cx + Math.sin(th) * r, y, cz + Math.cos(th) * r];
  const lifted = (th, r, y, k) => [r, y + k * spring(cz + Math.cos(th) * r)];

  const profiles = new Map();
  /** Cabedal na direção `th`: sobe da sola, faz o bojo e dobra para dentro até a boca. */
  const profile = (th) => {
    const key = th.toFixed(6);
    if (profiles.has(key)) return profiles.get(key);
    const rB = reach(inBase, th), rC = reach(inCollar, th);
    const yB = SOLE_TOP + 0.4 * spring(cz + Math.cos(th) * rB), yC = table(COLLAR_HEIGHT, Math.abs(wrap(th)));
    const dy = yC - yB, dr = rB - rC;
    const P = [[rB, yB], [rB + 0.05 * dy, yB + 0.62 * dy], [rC + 0.62 * dr + 0.006, yC], [rC, yC]];
    const out = { rB, rC, yB, yC, at: (s) => bezier(P, s), tangent: (s) => bezierTangent(P, s) };
    profiles.set(key, out);
    return out;
  };
  const surf = (th, s) => world(th, ...profile(th).at(Math.min(1, Math.max(0, s))));
  const normalAt = (th, s) => {
    const e = 1e-4;
    const dTh = sub(surf(th + e, s), surf(th - e, s)), dS = sub(surf(th, s + e), surf(th, s - e));
    const t = profile(th).tangent(s), out = [Math.sin(th) * t[1], -t[0], Math.cos(th) * t[1]];
    const n = norm(cross(dS, dTh));
    return dot(n, out) >= 0 ? n : mul(n, -1);
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
    const k = (y) => 1 - (0.6 * (y - GROUND)) / (SOLE_TOP - GROUND);
    sole.push(
      [
        [0, GROUND], [0.55 * p.rB, GROUND], [p.rB - 0.01, GROUND], [p.rB - 0.001, GROUND + 0.0005], [p.rB + 0.004, GROUND + 0.004],
        [p.rB + 0.0055, GROUND + 0.01], [p.rB + 0.0055, SOLE_TOP - 0.007], [p.rB + 0.0045, SOLE_TOP - 0.0015],
        [p.rB + 0.002, SOLE_TOP + 0.0008], [p.rB - 0.003, SOLE_TOP + 0.0004],
      ].map(([r, y]) => lifted(th, r, y, k(y))),
    );
  }
  revolve(parts.crocs, outer);
  revolve(parts.crocs_dentro, inner);
  revolve(parts.crocs_base, sole);

  /** Furo com aro em relevo (no cabedal) e fundo escuro, assentado na superfície em (th, s). */
  function hole(th, s, radius) {
    const n = normalAt(th, s);
    const e1 = norm(cross(n, Math.abs(n[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0])), e2 = cross(n, e1);
    const e = 1e-4, P0 = surf(th, s);
    const dTh = mul(sub(surf(th + e, s), surf(th - e, s)), 1 / (2 * e)), dS = mul(sub(surf(th, s + e), surf(th, s - e)), 1 / (2 * e));
    const [a, b, d] = [dot(dTh, dTh), dot(dTh, dS), dot(dS, dS)], det = a * d - b * b;
    /** Ponto da superfície a (u, v) do centro no plano tangente, levantado `lift` na normal. */
    const at = (u, v, lift) => {
      const o = add(mul(e1, u), mul(e2, v)), [p, q] = [dot(dTh, o), dot(dS, o)];
      return add(surf(th + (d * p - b * q) / det, s + (a * q - b * p) / det), mul(n, lift));
    };
    const ring = (m, r, lift) => Array.from({ length: HOLE_SIDES }, (_, k) => {
      const ang = (k / HOLE_SIDES) * 2 * Math.PI;
      return push(m, at(Math.cos(ang) * r, Math.sin(ang) * r, lift));
    });
    const rim = parts.crocs, pit = parts.crocs_furo;
    const A = ring(rim, radius + HOLE_RIM, -0.0007), B = ring(rim, radius, 0.0028);
    const B2 = ring(pit, radius, 0.0028), C = ring(pit, radius * 0.82, 0.0011), D = push(pit, add(P0, mul(n, 0.0011)));
    for (let k = 0; k < HOLE_SIDES; k++) {
      const k2 = (k + 1) % HOLE_SIDES;
      face(rim, A[k], A[k2], B[k2], n); face(rim, A[k], B[k2], B[k], n);
      face(pit, B2[k], B2[k2], C[k2], n); face(pit, B2[k], C[k2], C[k], n);
      face(pit, C[k], C[k2], D, n);
    }
  }
  /** Parâmetro s do perfil onde `value(s)` passa de `target`, procurando a partir de `from`. */
  const solve = (th, value, target, from) => {
    const N = 400, p = profile(th);
    for (let k = 0; k < N; k++) {
      const [s0, s1] = from === 1 ? [1 - k / N, 1 - (k + 1) / N] : [k / N, (k + 1) / N];
      if ((value(p.at(s0)) - target) * (value(p.at(s1)) - target) > 0) continue;
      let [lo, hi] = [s0, s1];
      for (let i = 0; i < 30; i++) {
        const m = (lo + hi) / 2;
        if ((value(p.at(lo)) - target) * (value(p.at(m)) - target) <= 0) hi = m;
        else lo = m;
      }
      return (lo + hi) / 2;
    }
    return null;
  };
  const throat = lz + azF;
  let holes = 0;
  for (const [dz, dxs] of TOP_HOLES)
    for (const dx of dxs) {
      const x = lx + dx - cx, z = throat + dz - cz, th = Math.atan2(x, z), s = solve(th, ([r]) => r, Math.hypot(x, z), 1);
      if (s === null) continue;
      hole(th, s, TOP_HOLE_R);
      holes++;
    }
  for (const a of SIDE_HOLES.angles)
    for (const th of [a, -a]) {
      const s = solve(th, ([, y]) => y, SIDE_HOLES.y, 0);
      if (s === null) continue;
      hole(th, s, SIDE_HOLE_R);
      holes++;
    }

  // Tira: sai de um rebite, passa atrás do tornozelo e volta no outro, encostada no cabedal sem entrar nele.
  const span = 2 * Math.PI - 2 * STRAP_AT + 2 * STRAP_PAST;
  const strapTh = (t) => STRAP_AT - STRAP_PAST + t * span;
  const strapY = (t) => lerp(STRAP_BACK_Y, RIVET_Y, smooth(0, 1, (Math.PI - Math.abs(wrap(strapTh(t)))) / (Math.PI - STRAP_AT)));
  const wallR = (th, y0, y1) => {
    let r = 0;
    for (let k = 0; k <= 100; k++) {
      const [pr, py] = profile(th).at(k / 100);
      if (py >= y0 && py <= y1) r = Math.max(r, pr);
    }
    return r;
  };
  const raw = Array.from({ length: STRAP_SEGMENTS + 1 }, (_, i) => {
    const t = i / STRAP_SEGMENTS, th = wrap(strapTh(t)), y = strapY(t);
    return Math.max(wallR(th, y - STRAP_W, y + STRAP_W) + STRAP_T + 0.0015, profile(th).rC - 0.006 + STRAP_T);
  });
  let rs = raw;
  for (let pass = 0; pass < 3; pass++) rs = rs.map((r, i) => 0.25 * rs[Math.max(0, i - 1)] + 0.5 * r + 0.25 * rs[Math.min(rs.length - 1, i + 1)]);
  rs = rs.map((r, i) => Math.max(r, raw[i]));
  const strapR = (t) => {
    const f = Math.min(Math.max(t, 0), 1) * STRAP_SEGMENTS, i = Math.min(Math.floor(f), STRAP_SEGMENTS - 1);
    return lerp(rs[i], rs[i + 1], f - i);
  };
  const center = (t) => world(strapTh(t), strapR(t), strapY(t));
  const frame = (t) => {
    const T = norm(sub(center(t + 1e-4), center(t - 1e-4)));
    const W = norm(sub([0, 1, 0], mul(T, T[1])));
    const th = strapTh(t), N = cross(T, W);
    return { C: center(t), T, W, N: dot(N, [Math.sin(th), 0, Math.cos(th)]) >= 0 ? N : mul(N, -1) };
  };
  const SECTION = [[1, 0.55], [0.8, 1], [-0.8, 1], [-1, 0.55], [-1, -0.55], [-0.8, -1], [0.8, -1], [1, -0.55]];
  const strap = parts.crocs_tira;
  const sections = [];
  const section = ({ C, W, N }, along, width) => ({ C, ids: SECTION.map(([w, n]) => push(strap, add(add(C, along), add(mul(W, w * STRAP_W * width), mul(N, n * STRAP_T))))) });
  // ponta redonda em volta do rebite
  const ROUND = [80, 60, 30].map((a) => (a * Math.PI) / 180);
  const start = frame(0), end = frame(1);
  for (const a of ROUND) sections.push(section(start, mul(start.T, -Math.sin(a) * STRAP_W), Math.cos(a)));
  for (let i = 0; i <= STRAP_SEGMENTS; i++) sections.push(section(frame(i / STRAP_SEGMENTS), [0, 0, 0], 1));
  for (const a of [...ROUND].reverse()) sections.push(section(end, mul(end.T, Math.sin(a) * STRAP_W), Math.cos(a)));
  for (let i = 0; i < sections.length - 1; i++) {
    const [s0, s1] = [sections[i], sections[i + 1]];
    for (let k = 0; k < SECTION.length; k++) {
      const k2 = (k + 1) % SECTION.length, away = sub(strap.positions[s0.ids[k]], s0.C);
      face(strap, s0.ids[k], s0.ids[k2], s1.ids[k2], away); face(strap, s0.ids[k], s1.ids[k2], s1.ids[k], away);
    }
  }
  for (const [sec, dir] of [[sections[0], mul(start.T, -1)], [sections[sections.length - 1], end.T]]) {
    const c = push(strap, mul(sec.ids.map((i) => strap.positions[i]).reduce(add, [0, 0, 0]), 1 / SECTION.length));
    for (let k = 0; k < SECTION.length; k++) face(strap, c, sec.ids[k], sec.ids[(k + 1) % SECTION.length], dir);
  }

  const rivet = parts.crocs_rebite;
  for (const t of [STRAP_PAST / span, 1 - STRAP_PAST / span]) {
    const { C, W, N } = frame(t), base = add(C, mul(N, STRAP_T)), e2 = cross(N, W), behind = sub(base, mul(N, 0.01));
    const rings = [[RIVET_R, -0.001], [RIVET_R, 0.003], [RIVET_R * 0.75, 0.0052]].map(([r, h]) =>
      Array.from({ length: HOLE_SIDES }, (_, k) => {
        const ang = (k / HOLE_SIDES) * 2 * Math.PI;
        return push(rivet, add(base, add(add(mul(W, Math.cos(ang) * r), mul(e2, Math.sin(ang) * r)), mul(N, h))));
      }),
    );
    const top = push(rivet, add(base, mul(N, 0.0058)));
    for (let k = 0; k < HOLE_SIDES; k++) {
      const k2 = (k + 1) % HOLE_SIDES;
      for (let j = 0; j < rings.length - 1; j++) {
        const [a, b] = [rings[j], rings[j + 1]], away = sub(rivet.positions[a[k]], behind);
        face(rivet, a[k], a[k2], b[k2], away); face(rivet, a[k], b[k2], b[k], away);
      }
      face(rivet, rings[2][k], rings[2][k2], top, N);
    }
  }

  console.log(`${side}: ${holes} furos, ${Object.entries(parts).map(([n, m]) => `${n} ${m.positions.length}`).join(", ")}`);
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

// Sapatos calculados antes de apagar as malhas do boneco, que são a medida deles.
const shoes = Object.fromEntries(["D", "E"].map((side) => [side, crocs(side)]));

// O arquivo é o próprio boneco_completo.glb sem as malhas: com o joelho no esqueleto da peça, o jogo não
// refaz os pesos pelo corpo (retargetWearable) e o sapato segue só o pé, sem torcer quando a canela dobra.
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
  MATERIALS.map(([name, k, rough]) => [name, doc.createMaterial(name).setBaseColorFactor([...COLOR.map((c) => c * k), 1]).setRoughnessFactor(rough).setMetallicFactor(0)]),
);
let total = 0;
for (const [side, parts] of Object.entries(shoes)) {
  const mesh = doc.createMesh(`crocs_${side}`);
  const node = doc.createNode(`crocs_${side}`).setMesh(mesh).setSkin(skin);
  if (parent) parent.addChild(node);
  else gltf.listScenes()[0].addChild(node);
  const foot = joints.indexOf(`pe_${side}`);
  for (const [name, m] of Object.entries(parts)) {
    const count = m.positions.length;
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
