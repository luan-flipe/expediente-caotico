import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Field } from "@ec/shared";
import { crewSpots, type CrewKind } from "./arenaLayout";

const SKIN = "#d9a074";
const PANTS = "#23262b";
const BLACK = "#16151a";
const GREY = "#9a9a9a";

/** Peça de baixa resolução já posicionada e pintada por vértice. */
function piece(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, rx = 0): THREE.BufferGeometry {
  geo.rotateX(rx);
  geo.translate(x, y, z);
  const c = new THREE.Color(color);
  const col = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Pessoa de pé (frente = +z): pernas, colete, cabeça. */
function person(vest: string, z = 0): THREE.BufferGeometry[] {
  return [
    piece(box(0.34, 0.8, 0.22), PANTS, 0, 0.4, z),
    piece(box(0.42, 0.55, 0.26), vest, 0, 1.07, z),
    piece(new THREE.SphereGeometry(0.12, 5, 4), SKIN, 0, 1.5, z),
    piece(box(0.26, 0.06, 0.3), BLACK, 0, 1.62, z + 0.02),
  ];
}

/** Câmera de ombro: corpo na altura do ombro e lente na frente. */
function shoulderCam(): THREE.BufferGeometry[] {
  return [
    ...person("#ff8a1f"),
    piece(box(0.24, 0.24, 0.5), BLACK, 0.13, 1.38, 0.18),
    piece(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 5), GREY, 0.13, 1.38, 0.52, Math.PI / 2),
    piece(box(0.1, 0.1, 0.34), "#ff8a1f", 0.23, 1.15, 0.2),
  ];
}

/** Câmera em tripé, com o operador atrás. */
function tripodCam(): THREE.BufferGeometry[] {
  const legs = [0, 1, 2].map((i) => {
    const a = (i / 3) * Math.PI * 2;
    const g = new THREE.CylinderGeometry(0.02, 0.025, 1.2, 4);
    g.rotateZ(Math.sin(a) * 0.22);
    g.rotateX(Math.cos(a) * 0.22);
    return piece(g, BLACK, 0, 0.6, 0.55);
  });
  return [
    ...person("#2c8a57", -0.1),
    ...legs,
    piece(box(0.26, 0.26, 0.55), BLACK, 0, 1.33, 0.55),
    piece(new THREE.CylinderGeometry(0.08, 0.1, 0.24, 5), GREY, 0, 1.33, 0.9, Math.PI / 2),
  ];
}

/** Técnico de som com a vara de microfone esticada para o campo. */
function boom(): THREE.BufferGeometry[] {
  return [
    ...person("#1f5fbf"),
    piece(box(0.04, 0.04, 2.6), BLACK, 0, 1.78, 1.1, 0.12),
    piece(box(0.1, 0.1, 0.26), GREY, 0, 1.4, 2.35),
  ];
}

const BUILD: Record<CrewKind, () => THREE.BufferGeometry[]> = { ombro: shoulderCam, tripe: tripodCam, boom };
/** Quanto a equipe pode girar para os lados da posição de repouso (rad). */
const MAX_TURN = 0.8;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Equipe de filmagem atrás das placas: um InstancedMesh por tipo de pessoa (3 draw calls), geometria mesclada e pintada
 * por vértice, material sem textura. Giram devagar para a bola (sem alocação por quadro).
 */
export class EquipeFilmagem {
  private group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private meshes: { mesh: THREE.InstancedMesh; first: number; n: number }[] = [];
  private spots: ReturnType<typeof crewSpots>;
  private yaw: Float32Array;
  private dummy = new THREE.Object3D();

  constructor(
    private readonly scene: THREE.Scene,
    f: Field,
  ) {
    this.spots = crewSpots(f);
    this.yaw = Float32Array.from(this.spots, (s) => s.yaw);
    const mat = this.own(new THREE.MeshLambertMaterial({ vertexColors: true }));
    for (const kind of ["ombro", "tripe", "boom"] as const) {
      const first = this.spots.findIndex((s) => s.kind === kind);
      const n = this.spots.filter((s) => s.kind === kind).length;
      if (first < 0) continue;
      const parts = BUILD[kind]();
      const geo = this.own(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!);
      for (const p of parts) p.dispose();
      const mesh = this.own(new THREE.InstancedMesh(geo, mat, n));
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.meshes.push({ mesh, first, n });
    }
    this.scene.add(this.group);
    this.update(0, 0, 0, true);
  }

  private own<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  /** Gira cada um um pouco para a bola e reescreve as poucas matrizes. */
  update(dt: number, ballX: number, ballZ: number, snap = false): void {
    const k = snap ? 1 : 1 - Math.exp(-dt * 2.5);
    const o = this.dummy;
    for (const { mesh, first, n } of this.meshes) {
      let w = 0;
      for (let i = 0; i < this.spots.length && w < n; i++) {
        if (this.spots[i].kind !== this.spots[first].kind) continue;
        const s = this.spots[i];
        const toBall = wrap(Math.atan2(ballX - s.x, ballZ - s.z) - s.yaw);
        const want = s.yaw + Math.max(-MAX_TURN, Math.min(MAX_TURN, toBall));
        this.yaw[i] += wrap(want - this.yaw[i]) * k;
        o.position.set(s.x, 0, s.z);
        o.rotation.y = this.yaw[i];
        o.updateMatrix();
        mesh.setMatrixAt(w++, o.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.meshes = [];
  }
}
