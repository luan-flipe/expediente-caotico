import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Medidas de referência (m) para um gol de meia-boca 2: escalam com o gol, sem esticar o desenho. */
const TOP_DEPTH = 0.35;
const BACK_DEPTH = 1.4;
const TUBE_R = 0.06;
const CELL = 0.14;

export interface GolGeometry {
  tubes: THREE.BufferGeometry;
  net: THREE.BufferGeometry;
  /** Profundidade do topo e da base traseira (m), já escaladas. */
  topDepth: number;
  backDepth: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Gol de perfil em triângulo retângulo. Boca em +Z, no plano z = 0 (linha de gol); a parte traseira fica em -Z.
 * Quadro frontal vertical (dois postes e travessão), topo curto, tubos em diagonal até o chão atrás.
 */
export function buildGolGeometry(halfW: number, height: number): GolGeometry {
  const k = halfW / 2;
  const td = TOP_DEPTH * k;
  const bd = BACK_DEPTH * k;
  const r = TUBE_R * Math.min(1, Math.max(0.6, k));

  const segs: [THREE.Vector3, THREE.Vector3][] = [];
  const joints: THREE.Vector3[] = [];
  for (const s of [-1, 1]) {
    const fb = V(s * halfW, 0, 0);
    const ft = V(s * halfW, height, 0);
    const bt = V(s * halfW, height, -td);
    const bb = V(s * halfW, 0, -bd);
    segs.push([fb, ft], [ft, bt], [bt, bb], [fb, bb]);
    joints.push(fb, ft, bt, bb);
  }
  segs.push([V(-halfW, height, 0), V(halfW, height, 0)]);
  segs.push([V(-halfW, height, -td), V(halfW, height, -td)]);
  segs.push([V(-halfW, 0, -bd), V(halfW, 0, -bd)]);

  const parts: THREE.BufferGeometry[] = [];
  const up = V(0, 1, 0);
  for (const [a, b] of segs) {
    const d = b.clone().sub(a);
    const g = new THREE.CylinderGeometry(r, r, d.length(), 8, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize()));
    const m = a.clone().add(b).multiplyScalar(0.5);
    g.translate(m.x, m.y, m.z);
    parts.push(g);
  }
  // esferas nas juntas arredondam os cantos
  for (const p of joints) {
    const g = new THREE.SphereGeometry(r * 1.05, 8, 6);
    g.translate(p.x, p.y, p.z);
    parts.push(g);
  }
  const tubes = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();

  // rede: laterais triangulares, fundo inclinado e topo curto (uv em células de CELL metros)
  const pos: number[] = [];
  const uv: number[] = [];
  const quad = (pts: THREE.Vector3[], uvOf: (p: THREE.Vector3) => [number, number]) => {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const p = pts[i];
      pos.push(p.x, p.y, p.z);
      const [u, v] = uvOf(p);
      uv.push(u / CELL, v / CELL);
    }
  };
  const side = (p: THREE.Vector3): [number, number] => [p.z, p.y];
  for (const s of [-1, 1]) {
    quad([V(s * halfW, 0, 0), V(s * halfW, height, 0), V(s * halfW, height, -td), V(s * halfW, 0, -bd)], side);
  }
  const slope = Math.hypot(bd - td, height);
  quad([V(-halfW, height, -td), V(halfW, height, -td), V(halfW, 0, -bd), V(-halfW, 0, -bd)], (p) => [p.x, (p.y / height) * slope]);
  quad([V(-halfW, height, 0), V(halfW, height, 0), V(halfW, height, -td), V(-halfW, height, -td)], (p) => [p.x, p.z]);
  const net = new THREE.BufferGeometry();
  net.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  net.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  net.computeVertexNormals();

  return { tubes, net, topDepth: td, backDepth: bd };
}

function netTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  if (g) {
    g.strokeStyle = "#ffffff";
    g.lineWidth = 3;
    g.strokeRect(0, 0, 32, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Gol pronto (2 draw calls): tubos brancos e rede com alpha. Boca em +Z. */
export function createGolMesh(halfW: number, height: number): THREE.Group {
  const { tubes, net } = buildGolGeometry(halfW, height);
  const group = new THREE.Group();
  const tubeMesh = new THREE.Mesh(tubes, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 }));
  tubeMesh.castShadow = true;
  tubeMesh.receiveShadow = true;
  const netMesh = new THREE.Mesh(
    net,
    new THREE.MeshBasicMaterial({ map: netTexture(), color: "#ffffff", transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, depthWrite: false, opacity: 0.8 }),
  );
  group.add(tubeMesh, netMesh);
  return group;
}

/** Libera geometrias, materiais e a textura da rede. */
export function disposeGolMesh(g: THREE.Object3D): void {
  g.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
  });
}
