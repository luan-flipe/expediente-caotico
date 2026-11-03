/* global process, console */
// Ajusta as peças de assets-src/roupas ao boneco_completo novo, quando o corpo muda de proporção e o
// esqueleto fica o mesmo (mesmos ossos, outras posições): pernas e braços mais compridos.
// Roda à mão, uma vez por troca de corpo, com o boneco de antes:
//   node scripts/ajustar-roupas-proporcao.mjs <boneco_antigo.glb>   (depois: node scripts/optimize-assets.mjs)
//  - cabelo, barba e óculos vão junto com o osso cabeca; tênis, junto com o pé;
//  - camiseta e calça esticam ao longo do braço e da perna (ombro-cotovelo-punho, perna-joelho-pé), na
//    mesma distância do osso; quanto cada membro manda em cada ponto vem dos pesos da própria peça.
//    O ponto que fica dentro do corpo novo é empurrado para fora;
//  - a manga da camiseta vai com o braço (pesos do corpo antigo em volta), que nas animações fica afastado
//    do tronco;
//  - a manga das blusas compridas (LONG_SLEEVES) desce até perto do punho.
// Fora a manga, os pesos das peças não mudam; a pose de amarração passa a ser a do boneco novo.
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BONECO = join(root, "assets-src", "characters", "boneco_completo.glb");
const ROUPAS = join(root, "assets-src", "roupas");
/** Peças que vão inteiras com um osso: a cabeça ou o pé. */
const RIGID = ["cabelos", "barbas", "oculos", "tenis"];
const CLOTHES = ["camisetas", "calcas"];
/**
 * Braços e pernas: as juntas do membro e os ossos que vão com ele. O membro inteiro é um caminho só (dois
 * trechos que esticam); a mão e o pé seguem o último trecho sem esticar.
 */
const LIMBS = ["D", "E"].flatMap((s) => [
  { joints: [`ombro_${s}`, `cotovelo_${s}`, `punho_${s}`], bones: new RegExp(`^(ombro|cotovelo|punho|dedos2?|polegar)_${s}$`) },
  { joints: [`perna_${s}`, `joelho_${s}`, `pe_${s}`], bones: new RegExp(`^(perna|joelho|pe)_${s}$`) },
]);
/** Perto do cotovelo e do joelho os dois trechos se misturam ao longo desta distância, sem degrau. */
const JOINT_BLEND = 0.015;
/** Folga mínima entre a roupa e a pele do corpo novo. */
const CLEARANCE = 0.006;
/**
 * Manga: nas peças antigas boa parte da manga é pesada no tronco. Com os braços abertos nas animações
 * (ARM_SPREAD do trocar-boneco), ela ficava para trás e o braço atravessava a blusa. O que é manga sai da
 * pele do corpo antigo em volta do ponto (os ARM_NEAREST vértices mais perto): ali o peso do braço vale
 * para a peça também, na posição e na pele; o jogo reparte esse peso entre ombro, cotovelo e punho.
 */
const ARM_NEAREST = 8;
const UPPER_ARM = /^(ombro|cotovelo)_[DE]$/;
/**
 * Até onde (fração do ombro ao punho, no corpo antigo, pela altura) a pele do braço conta como manga: as
 * mangas das peças antigas param no cotovelo (0,5, a dobra do punho da manga vai até 0,6); abaixo disso, ao
 * lado do antebraço, já é o lado da blusa.
 */
const SLEEVE_END = 0.62;
/** Peso mínimo de braço (da peça ou da pele em volta) para o ponto ser manga. */
const SLEEVE_MIN = 0.3;
/** Do ombro à axila (fração do ombro ao punho, corpo antigo) a manga passa do tronco para o braço. */
const ARMPIT = [0.08, 0.25];
/**
 * Blusas de manga comprida: no corpo antigo a manga já parava logo abaixo do cotovelo (62% do braço). Ela
 * estica, a partir de LONG_FROM do braço (ombro ao punho), até a ponta chegar em LONG_TO, perto do punho.
 */
const LONG_SLEEVES = ["03_moletom.glb", "04_corta_vento.glb", "05_jaqueta_jeans.glb"];
const LONG_FROM = 0.25;
const LONG_TO = 1;
/** Quanto a manga comprida alarga no antebraço, e entre que frações do braço ela vai alargando (cotovelo em 0,5). */
const SLEEVE_WIDEN = 0.25;
const WIDEN_FROM = [0.4, 0.6];
/**
 * Calça comprida: a barra parava no meio da canela comprida. A perna da calça estica, a partir de PANTS_FROM
 * da perna (quadril ao tornozelo), até a barra chegar em PANTS_TO, no tornozelo.
 */
const LONG_PANTS = ["01_calca.glb"];
const PANTS_FROM = 0.3;
const PANTS_TO = 0.97;
const LEG = /^(?:perna|joelho|pe)_([DE])$/;
/** Vértices do corpo novo olhados para achar a pele do membro em volta de um ponto esticado. */
const LIMB_NEAREST = 16;
/** Fração dos pontos da manga que fica abaixo da "ponta" medida: tira uns poucos pontos soltos. */
const LONG_CUFF = 0.03;

const [oldPath] = process.argv.slice(2);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });

const sub = (a, b) => a.map((c, i) => c - b[i]);
const add = (a, b) => a.map((c, i) => c + b[i]);
const scale = (a, k) => a.map((c) => c * k);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = ([ax, ay, az], [bx, by, bz]) => [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
const normalize = (v) => scale(v, 1 / (Math.hypot(...v) || 1));
/** Rotação que leva a direção a até a direção b, como função. */
function between(a, b) {
  const [ua, ub] = [normalize(a), normalize(b)];
  const [x, y, z, w] = normalize([...cross(ua, ub), 1 + dot(ua, ub)]);
  return (v) => {
    // v + 2w(q×v) + 2q×(q×v)
    const t = scale(cross([x, y, z], v), 2);
    return add(add(v, scale(t, w)), cross([x, y, z], t));
  };
}
/** Parte 3x3 da inversa de uma matriz de nó (coluna maior), aplicada a d. */
function inverseDir(m, d) {
  const [a, b, c] = [
    [m[0], m[1], m[2]],
    [m[4], m[5], m[6]],
    [m[8], m[9], m[10]],
  ];
  const det = dot(a, cross(b, c));
  return [dot(d, cross(b, c)) / det, dot(a, cross(d, c)) / det, dot(a, cross(b, d)) / det];
}

const CELL = 0.03;
const key = (x, y, z) => `${x},${y},${z}`;

/** Corpo de um boneco: juntas no mundo, pose de amarração e os vértices do corpo com pesos e normais. */
async function readBody(path) {
  const doc = await io.read(path);
  const skin = doc.getRoot().listSkins()[0];
  const ibm = skin.getInverseBindMatrices();
  const names = skin.listJoints().map((j) => j.getName());
  const joints = new Map();
  skin.listJoints().forEach((j, i) => {
    const m = j.getWorldMatrix();
    joints.set(names[i], { pos: [m[12], m[13], m[14]], ibm: ibm.getElement(i, []), node: j });
  });
  const prim = doc.getRoot().listNodes().find((n) => n.getName() === "boneco").getMesh().listPrimitives()[0];
  const [P, N, J, W] = ["POSITION", "NORMAL", "JOINTS_0", "WEIGHTS_0"].map((s) => prim.getAttribute(s));
  const grid = new Map();
  for (let v = 0; v < P.getCount(); v++) {
    const j = J.getElement(v, []);
    const w = W.getElement(v, []);
    const weights = new Map();
    for (let k = 0; k < 4; k++) if (w[k] > 0) weights.set(names[j[k]], (weights.get(names[j[k]]) ?? 0) + w[k]);
    const pos = P.getElement(v, []);
    const cell = key(...pos.map((c) => Math.floor(c / CELL)));
    if (!grid.has(cell)) grid.set(cell, []);
    grid.get(cell).push({ pos, normal: normalize(N.getElement(v, [])), weights });
  }
  return { joints, grid };
}

/** Os n vértices do corpo mais próximos de p, com a distância. */
function nearest({ grid }, p, n) {
  const c = p.map((v) => Math.floor(v / CELL));
  let best = [];
  for (let r = 0; r < 40; r++) {
    for (let x = -r; x <= r; x++)
      for (let y = -r; y <= r; y++)
        for (let z = -r; z <= r; z++) {
          if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== r) continue;
          for (const q of grid.get(key(c[0] + x, c[1] + y, c[2] + z)) ?? []) best.push([Math.hypot(...sub(q.pos, p)), q]);
        }
    best.sort((a, b) => a[0] - b[0]);
    best = best.slice(0, n);
    // o anel seguinte fica a pelo menos r células de distância
    if (best.length === n && best[n - 1][0] <= r * CELL) break;
  }
  return best;
}

const before = await readBody(oldPath);
const after = await readBody(BONECO);
const shift = (name) => sub(after.joints.get(name).pos, before.joints.get(name).pos);

/** Um trecho do membro: estica entre as juntas, não estica antes nem depois. */
function segment(from, to) {
  const [s0, e0, s1, e1] = [before.joints.get(from).pos, before.joints.get(to).pos, after.joints.get(from).pos, after.joints.get(to).pos];
  const [u0, u1] = [normalize(sub(e0, s0)), normalize(sub(e1, s1))];
  const [l0, l1] = [Math.hypot(...sub(e0, s0)), Math.hypot(...sub(e1, s1))];
  const turn = between(u0, u1);
  return {
    /** Distância do ponto ao trecho antigo. */
    distance(p) {
      const a = Math.min(Math.max(dot(sub(p, s0), u0), 0), l0);
      return Math.hypot(...sub(p, add(s0, scale(u0, a))));
    },
    point(p) {
      const q = sub(p, s0);
      const a = dot(q, u0);
      const along = a < 0 ? a : a > l0 ? l1 + a - l0 : (a * l1) / l0;
      return add(add(s1, scale(u1, along)), turn(sub(q, scale(u0, a))));
    },
    dir: turn,
  };
}

/** Como um membro leva um ponto (e uma direção) do corpo antigo para o novo: o trecho mais perto manda. */
function limbMap({ joints }) {
  const parts = [segment(joints[0], joints[1]), segment(joints[1], joints[2])];
  const shares = (p) => {
    const d = parts.map((s) => s.distance(p));
    const k = d.map((x) => Math.exp(-(x - Math.min(...d)) / JOINT_BLEND));
    const sum = k[0] + k[1];
    return k.map((x) => x / sum);
  };
  return {
    point(p) {
      const k = shares(p);
      return add(scale(parts[0].point(p), k[0]), scale(parts[1].point(p), k[1]));
    },
    dir(p, v) {
      const k = shares(p);
      return normalize(add(scale(parts[0].dir(v), k[0]), scale(parts[1].dir(v), k[1])));
    },
  };
}
const limbs = LIMBS.map((limb) => ({ ...limb, map: limbMap(limb) }));

/**
 * Leva um ponto da roupa (e a normal dele) do corpo antigo para o novo. Quanto vai com cada membro vem dos
 * pesos da peça (`own`, por nome de osso, já com a manga presa ao braço).
 */
function moveClothes(p, n, own) {
  const near = nearest(before, p, 1);
  const total = [...own.values()].reduce((a, b) => a + b, 0);
  // o peso de cada membro vai para o caminho dele; tronco, cabeça e raiz só sobem
  let pos = [0, 0, 0];
  let normal = [0, 0, 0];
  for (const [name, w] of own) {
    const limb = limbs.find((l) => l.bones.test(name));
    pos = add(pos, scale(limb ? limb.map.point(p) : add(p, shift(name)), w / total));
    if (n) normal = add(normal, scale(limb ? limb.map.dir(p, n) : n, w / total));
  }
  // folga até a pele, positiva do lado de fora, pelo vértice do corpo mais próximo
  const gap0 = dot(sub(p, near[0][1].pos), near[0][1].normal);
  const [[, skin]] = nearest(after, pos, 1);
  const gap1 = dot(sub(pos, skin.pos), skin.normal);
  const pushed = gap0 > 0 && gap1 < CLEARANCE;
  if (pushed) pos = add(pos, scale(skin.normal, Math.min(gap0, CLEARANCE) - gap1));
  return { pos, normal: n && normalize(normal), pushed };
}

const ARM = /^(ombro|cotovelo|punho|dedos2?|polegar)_([DE])$/;
/** Ponto no braço do corpo novo (reta do ombro ao punho): fração descendo o braço e o resto, de lado. */
function alongArm(p, side, body = after) {
  return alongLimb(p, "ombro", "punho", side, body);
}

/** Ponto ao longo de um membro (da junta de cima à de baixo, pela altura): fração e o resto, de lado. */
function alongLimb(p, top, bottom, side, body = after) {
  const s = body.joints.get(`${top}_${side}`).pos;
  const u = sub(body.joints.get(`${bottom}_${side}`).pos, s);
  // pela altura: o braço em repouso cai quase reto, e a projeção na reta inclinada dava fração maior
  // para a parte da manga que abre para fora, como se ela já descesse mais
  const t = (p[1] - s[1]) / u[1];
  return { t, rest: sub(sub(p, s), scale(u, t)), at: (k) => add(s, scale(u, k)) };
}
/**
 * Estica a parte da peça que cobre um membro (manga ou perna da calça): a ponta (onde ficam os LONG_CUFF
 * mais abaixo) desce até `to`, a partir de `from`. O membro do corpo novo dobra no cotovelo e no joelho, e a
 * peça esticada em linha reta entrava nele: o que fica dentro da pele do membro sai para fora.
 */
function stretchLimb(list, top, bottom, from, to) {
  const reach = {};
  for (const side of ["D", "E"]) {
    const ts = list.filter((l) => l.side === side && l.share >= 0.5).map(({ P, v }) => alongLimb(P.getElement(v, []), top, bottom, side).t);
    ts.sort((a, b) => a - b);
    reach[side] = ts.length ? ts[Math.floor((ts.length - 1) * (1 - LONG_CUFF))] : 0;
  }
  const limbOf = top === "ombro" ? (name) => ARM.exec(name)?.[2] : (name) => LEG.exec(name)?.[1];
  for (const { P, v, side, share } of list) {
    if (reach[side] <= from) continue;
    const p = P.getElement(v, []);
    const { t, rest, at } = alongLimb(p, top, bottom, side);
    if (t <= from) continue;
    const k = from + ((t - from) * (to - from)) / (reach[side] - from);
    // manga: do cotovelo para baixo ela alarga, senão o antebraço atravessa o pano quando o cotovelo dobra
    const widen = top === "ombro" ? 1 + SLEEVE_WIDEN * Math.min(1, Math.max(0, (k - WIDEN_FROM[0]) / (WIDEN_FROM[1] - WIDEN_FROM[0]))) : 1;
    const stretched = add(at(k), scale(rest, widen));
    let out = add(p, scale(sub(stretched, p), share));
    // pele do membro mais perto (não a do tronco, que fica ao lado do braço)
    const skin = nearest(after, out, LIMB_NEAREST).find(([, q]) => {
      let w = 0;
      for (const [name, x] of q.weights) if (limbOf(name) === side) w += x;
      return w >= 0.5;
    })?.[1];
    const gap = skin ? dot(sub(out, skin.pos), skin.normal) : Infinity;
    if (gap < CLEARANCE) out = add(out, scale(skin.normal, CLEARANCE - gap));
    P.setElement(v, out);
  }
}

/** Peso de cada braço numa lista de pesos por nome de osso. */
function armWeights(weights) {
  const arm = { D: 0, E: 0 };
  for (const [name, w] of weights) {
    const side = ARM.exec(name)?.[2];
    if (side) arm[side] += w;
  }
  return arm;
}

/**
 * Pesos da peça num ponto (corpo antigo) com a manga presa ao braço: o braço leva pelo menos o peso que
 * tem na pele do corpo ali em volta. Devolve os pesos, o lado e quanto vai com o braço.
 */
function sleeveWeights(p, own) {
  const near = nearest(before, p, ARM_NEAREST);
  const body = new Map();
  for (const [d, q] of near)
    for (const [name, w] of q.weights) {
      // no corpo antigo a mão cai junto do quadril: ela e o punho não contam, senão a barra da blusa vira manga
      const key = UPPER_ARM.test(name) ? name : "tronco";
      body.set(key, (body.get(key) ?? 0) + w / (d + 1e-4));
    }
  const total = (m) => [...m.values()].reduce((a, b) => a + b, 0);
  const [bodyArm, ownArm] = [armWeights(body), armWeights(own)];
  const [bodySum, ownSum] = [total(body), total(own)];
  const side = bodyArm.D / bodySum + ownArm.D / ownSum >= bodyArm.E / bodySum + ownArm.E / ownSum ? "D" : "E";
  const t = alongArm(p, side, before).t;
  const ownShare0 = ownArm[side] / ownSum;
  const armish = Math.max(t <= SLEEVE_END ? bodyArm[side] / bodySum : 0, ownShare0);
  // abaixo da axila a manga é toda do braço; do ombro até a axila passa do tronco para o braço
  // a barra da blusa fica ao lado do antebraço antigo, abaixo de SLEEVE_END: não é manga
  const tube = armish >= SLEEVE_MIN && t <= SLEEVE_END ? Math.min(1, Math.max(0, (t - ARMPIT[0]) / (ARMPIT[1] - ARMPIT[0]))) : 0;
  const share = Math.max(tube, ownShare0);
  const out = new Map();
  const ownShare = ownArm[side] / ownSum;
  for (const [name, w] of own) {
    const isArm = ARM.exec(name)?.[2] === side;
    // o braço sobe até `share`, o resto divide o que sobra na proporção de antes
    if (isArm) out.set(name, (w / ownSum) * (ownShare ? share / ownShare : 0));
    else out.set(name, (w / ownSum) * (ownShare < 1 ? (1 - share) / (1 - ownShare) : 0));
  }
  if (!ownShare) out.set(`ombro_${side}`, share);
  return { weights: out, side, share, tube };
}

for (const dir of [...RIGID, ...CLOTHES]) {
  for (const file of readdirSync(join(ROUPAS, dir)).filter((f) => f.endsWith(".glb"))) {
    const path = join(ROUPAS, dir, file);
    const doc = await io.read(path);
    const done = new Set();
    let count = 0;
    let pushed = 0;
    let sleeves = 0;
    /** Vértices da manga comprida, com o lado e quanto vão com o braço. */
    const long = [];
    /** Vértices das pernas da calça comprida, com o lado e quanto vão com a perna. */
    const legs = [];
    for (const node of doc.getRoot().listNodes()) {
      const skin = node.getSkin();
      if (!node.getMesh() || !skin) continue;
      const names = skin.listJoints().map((j) => j.getName());
      // a malha dos tênis fica num nó com transformação: o deslocamento vai para o espaço dele
      const world = node.getWorldMatrix();
      if (CLOTHES.includes(dir) && world.some((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) > 1e-6)) throw new Error(`${file}: roupa num nó com transformação`);
      for (const prim of node.getMesh().listPrimitives()) {
        const P = prim.getAttribute("POSITION");
        if (done.has(P)) continue;
        done.add(P);
        const N = prim.getAttribute("NORMAL");
        const T = prim.getAttribute("TANGENT");
        const J = prim.getAttribute("JOINTS_0");
        const W = prim.getAttribute("WEIGHTS_0");
        for (let v = 0; v < P.getCount(); v++) {
          const p = P.getElement(v, []);
          count++;
          if (RIGID.includes(dir)) {
            // tênis: o pé do osso que mais pesa no ponto (o cano vai junto)
            let bone = "cabeca";
            if (dir === "tenis") {
              const w = W.getElement(v, []);
              const top = names[J.getElement(v, [])[w.indexOf(Math.max(...w))]];
              bone = `pe_${/_([DE])$/.exec(top)?.[1] ?? (p[0] < 0 ? "D" : "E")}`;
            }
            P.setElement(v, add(p, inverseDir(world, shift(bone))));
            continue;
          }
          let own = new Map();
          const [jv, wv] = [J.getElement(v, []), W.getElement(v, [])];
          jv.forEach((j, k) => wv[k] > 0 && own.set(names[j], (own.get(names[j]) ?? 0) + wv[k]));
          // camiseta: a manga vai com o braço, na posição e na pele
          const sleeve = dir === "camisetas" ? sleeveWeights(p, own) : null;
          if (sleeve && sleeve.share > armWeights(own)[sleeve.side] / [...own.values()].reduce((a, b) => a + b, 0) + 1e-3) {
            own = sleeve.weights;
            const top = [...own].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
            const sum = top.reduce((a, [, w]) => a + w, 0);
            J.setElement(v, [0, 1, 2, 3].map((i) => (top[i] ? names.indexOf(top[i][0]) : 0)));
            W.setElement(v, [0, 1, 2, 3].map((i) => (top[i] ? top[i][1] / sum : 0)));
            sleeves++;
          }
          const moved = moveClothes(p, N?.getElement(v, []), own);
          P.setElement(v, moved.pos);
          if (N) N.setElement(v, moved.normal);
          if (T) {
            const t = T.getElement(v, []);
            const tip = moveClothes(add(p, scale(t.slice(0, 3), 1e-3)), null, own).pos;
            T.setElement(v, [...normalize(sub(tip, moved.pos)), t[3]]);
          }
          if (moved.pushed) pushed++;
          // só o que a regra da manga reconheceu: a peça também põe peso de braço em pontos perto da mão antiga
          if (LONG_SLEEVES.includes(file) && sleeve?.tube > 0) long.push({ P, v, side: sleeve.side, share: sleeve.tube });
          if (LONG_PANTS.includes(file)) {
            const leg = { D: 0, E: 0 };
            for (const [name, w] of own) {
              const side = LEG.exec(name)?.[1];
              if (side) leg[side] += w;
            }
            const side = leg.D >= leg.E ? "D" : "E";
            const total = [...own.values()].reduce((a, b) => a + b, 0);
            if (leg[side] > 0) legs.push({ P, v, side, share: leg[side] / total });
          }
        }
      }
      // pose de amarração do boneco novo, osso a osso pelo nome
      const ibm = skin.getInverseBindMatrices();
      skin.listJoints().forEach((j, i) => {
        const b = after.joints.get(j.getName());
        ibm.setElement(i, b.ibm);
        j.setTranslation(b.node.getTranslation()).setRotation(b.node.getRotation()).setScale(b.node.getScale());
      });
    }
    stretchLimb(long, "ombro", "punho", LONG_FROM, LONG_TO);
    stretchLimb(legs, "perna", "pe", PANTS_FROM, PANTS_TO);
    await io.write(path, doc);
    const notes = [pushed && `${pushed} empurrados para fora do corpo`, sleeves && `${sleeves} da manga presos ao braço`].filter(Boolean);
    console.log(`${dir}/${file}: ${count} vértices${notes.length ? `, ${notes.join(", ")}` : ""}`);
  }
}
