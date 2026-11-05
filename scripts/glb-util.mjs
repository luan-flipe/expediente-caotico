// Ajudantes dos geradores de .glb por código (gerar-bola.mjs, gerar-gol.mjs): malha por material e escrita.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";

export const srgb = (hex) =>
  [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => mul(a, 1 / (Math.hypot(...a) || 1));

/** Malha de uma parte: vértices e triângulos. `face` vira o triângulo para `away`. */
export const part = () => ({ positions: [], tri: [] });
export const push = (m, p) => (m.positions.push(p), m.positions.length - 1);
export function face(m, a, b, c, away) {
  const P = m.positions, n = cross(sub(P[b], P[a]), sub(P[c], P[a]));
  m.tri.push(...(dot(n, away) >= 0 ? [a, b, c] : [a, c, b]));
}

/** Tubo de seção `sides` lados entre a e b (sem tampas), normais radiais. */
export function tube(m, a, b, r, sides = 8) {
  const d = norm(sub(b, a)), up = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(cross(d, up)), v = cross(d, u);
  const ra = [], rb = [];
  for (let k = 0; k < sides; k++) {
    const t = (k / sides) * Math.PI * 2, o = add(mul(u, Math.cos(t) * r), mul(v, Math.sin(t) * r));
    ra.push(push(m, add(a, o)));
    rb.push(push(m, add(b, o)));
  }
  for (let k = 0; k < sides; k++) {
    const k2 = (k + 1) % sides, out = sub(m.positions[ra[k]], a);
    face(m, ra[k], ra[k2], rb[k2], out);
    face(m, ra[k], rb[k2], rb[k], out);
  }
}

/** Esfera (uv) de raio r em c. */
export function sphere(m, c, r, seg = 12, rings = 8) {
  const idx = [];
  for (let i = 0; i <= rings; i++) {
    const ph = (i / rings) * Math.PI, row = [];
    for (let k = 0; k < seg; k++) {
      const th = (k / seg) * Math.PI * 2;
      row.push(push(m, add(c, [r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)])));
    }
    idx.push(row);
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < seg; k++) {
      const k2 = (k + 1) % seg, a = idx[i][k], b = idx[i][k2], d = idx[i + 1][k], e = idx[i + 1][k2];
      const out = sub(m.positions[a], c);
      if (i > 0) face(m, a, b, e, out);
      if (i < rings - 1) face(m, a, e, d, out);
    }
  }
}

export const normalsOf = ({ positions, tri }) => {
  const normals = positions.map(() => [0, 0, 0]);
  for (let t = 0; t < tri.length; t += 3) {
    const [a, b, c] = [tri[t], tri[t + 1], tri[t + 2]];
    const n = cross(sub(positions[b], positions[a]), sub(positions[c], positions[a]));
    for (const i of [a, b, c]) normals[i] = add(normals[i], n);
  }
  return normals.map(norm);
};

/**
 * Escreve um .glb. `nodes`: [{ name, parts: [{ material: [nome, hex, rugosidade], mesh }] }], todos filhos da cena.
 * Cada nó vira uma malha com uma primitiva por material. Devolve o total de vértices.
 */
export async function writeGlb(out, nodes) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("cena");
  const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const materials = new Map();
  let verts = 0;
  for (const { name, parts } of nodes) {
    const mesh = doc.createMesh(name);
    for (const { material: [mn, hex, rough], mesh: m } of parts) {
      if (!materials.has(mn)) {
        materials.set(mn, doc.createMaterial(mn).setBaseColorFactor([...srgb(hex), 1]).setRoughnessFactor(rough).setMetallicFactor(0));
      }
      verts += m.positions.length;
      mesh.addPrimitive(
        doc.createPrimitive()
          .setMaterial(materials.get(mn))
          .setAttribute("POSITION", acc("VEC3", new Float32Array(m.positions.flat())))
          .setAttribute("NORMAL", acc("VEC3", new Float32Array(normalsOf(m).flat())))
          .setIndices(acc("SCALAR", m.positions.length > 65535 ? new Uint32Array(m.tri) : new Uint16Array(m.tri))),
      );
    }
    scene.addChild(doc.createNode(name).setMesh(mesh));
  }
  mkdirSync(dirname(out), { recursive: true });
  await new NodeIO().write(out, doc);
  return verts;
}
