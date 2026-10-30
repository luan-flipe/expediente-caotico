import * as THREE from "three";
import type { Quality } from "../settings";
import { MAX_CROWD, bounce, cellKey, crowdCount, crowdEnergy, ringCandidate, rng } from "./torcidaLayout";

const SHIRTS = ["#d83a2e", "#1f5fbf", "#ffd21f", "#2c8a57", "#f4f1ea", "#7a3fb0", "#ff8a1f", "#1c1a17", "#3bb6c4"];
const SKINS = ["#f2c9a5", "#d9a074", "#a8704a", "#7a4a2e", "#4d2f1c"];

interface Seat {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/**
 * Torcida animada nas arquibancadas do mapa. Os torcedores sentam em pontos achados por raio
 * contra a geometria do .glb (que não é alterada), então não flutuam nem atravessam os degraus.
 * Dois InstancedMesh (corpo e cabeça) dividem a mesma matriz: dois draw calls.
 */
export class Torcida {
  private body: THREE.InstancedMesh | null = null;
  private head: THREE.InstancedMesh | null = null;
  private disposables: { dispose(): void }[] = [];
  private n = 0;
  private x = new Float32Array(0);
  private y = new Float32Array(0);
  private z = new Float32Array(0);
  private yaw = new Float32Array(0);
  private k = new Float32Array(0);
  private ph = new Float32Array(0);
  private t = 0;
  private cheerAt = -100;

  constructor(
    private readonly scene: THREE.Scene,
    stadium: THREE.Object3D,
    quality: Quality,
  ) {
    const seats = this.findSeats(stadium);
    const total = seats.length;
    this.n = total;
    if (!total) return;
    this.x = new Float32Array(total);
    this.y = new Float32Array(total);
    this.z = new Float32Array(total);
    this.yaw = new Float32Array(total);
    this.k = new Float32Array(total);
    this.ph = new Float32Array(total);
    const r = rng(99);
    const bodyGeo = this.own(new THREE.CylinderGeometry(0.26, 0.3, 0.8, 7));
    bodyGeo.translate(0, 0.4, 0);
    const headGeo = this.own(new THREE.SphereGeometry(0.2, 8, 6));
    headGeo.translate(0, 1.0, 0);
    const body = this.own(new THREE.InstancedMesh(bodyGeo, this.own(new THREE.MeshLambertMaterial({ color: "#ffffff" })), total));
    const head = this.own(new THREE.InstancedMesh(headGeo, this.own(new THREE.MeshLambertMaterial({ color: "#ffffff" })), total));
    head.instanceMatrix = body.instanceMatrix;
    const c = new THREE.Color();
    seats.forEach((s, i) => {
      this.x[i] = s.x;
      this.y[i] = s.y;
      this.z[i] = s.z;
      this.yaw[i] = s.yaw;
      this.k[i] = 0.9 + r() * 0.35;
      this.ph[i] = r() * Math.PI * 2;
      body.setColorAt(i, c.set(SHIRTS[Math.floor(r() * SHIRTS.length)]));
      head.setColorAt(i, c.set(SKINS[Math.floor(r() * SKINS.length)]));
    });
    for (const m of [body, head]) {
      m.frustumCulled = false;
      this.scene.add(m);
    }
    this.body = body;
    this.head = head;
    this.setQuality(quality);
    this.write();
  }

  private own<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  /** Acha assentos por raio vertical nas arquibancadas: a superfície mais alta, voltada para cima. */
  private findSeats(stadium: THREE.Object3D): Seat[] {
    stadium.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const meshes: THREE.Mesh[] = [];
    stadium.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      box.setFromObject(m);
      // só o que pode ser degrau: baixo, fora do campo e sem ser o teto
      if (box.min.y < 8 && box.max.y > 0.3 && box.max.y < 30 && (box.max.x > 80 || box.min.x < -80 || box.max.z > 60 || box.min.z < -60)) meshes.push(m);
    });
    const out: Seat[] = [];
    const used = new Set<string>();
    const rc = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 30);
    const r = rng(7);
    for (let tries = 0; tries < MAX_CROWD * 8 && out.length < MAX_CROWD; tries++) {
      const s = ringCandidate(r);
      const key = cellKey(s.x, s.z);
      if (used.has(key)) continue;
      rc.ray.origin.set(s.x, 12, s.z);
      const hit = rc.intersectObjects(meshes, false)[0];
      // degrau voltado para cima, acima do chão do estádio
      if (!hit || hit.point.y < 0.3 || !hit.face || hit.face.normal.y < 0.6) continue;
      used.add(key);
      out.push({ x: s.x, y: hit.point.y, z: s.z, yaw: s.yaw });
    }
    return out;
  }

  /** Metade dos torcedores no modo Leve. */
  setQuality(q: Quality): void {
    const c = crowdCount(this.n, q);
    if (this.body) this.body.count = c;
    if (this.head) this.head.count = c;
  }

  /** Pulo e agitação forte por uns 3 s (gol, apito final). */
  cheer(): void {
    this.cheerAt = this.t;
  }

  private write(): void {
    if (!this.body) return;
    const e = crowdEnergy(this.t - this.cheerAt);
    const arr = this.body.instanceMatrix.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      const ph = this.ph[i];
      const roll = Math.sin(this.t * 1.6 + ph) * (0.05 + e * 0.1);
      const cr = Math.cos(roll);
      const sr = Math.sin(roll);
      const c = Math.cos(this.yaw[i]);
      const s = Math.sin(this.yaw[i]);
      const k = this.k[i];
      const o = i * 16;
      arr[o] = c * cr * k;
      arr[o + 1] = sr * k;
      arr[o + 2] = -s * cr * k;
      arr[o + 3] = 0;
      arr[o + 4] = -c * sr * k;
      arr[o + 5] = cr * k;
      arr[o + 6] = s * sr * k;
      arr[o + 7] = 0;
      arr[o + 8] = s * k;
      arr[o + 9] = 0;
      arr[o + 10] = c * k;
      arr[o + 11] = 0;
      arr[o + 12] = this.x[i];
      arr[o + 13] = this.y[i] + bounce(this.t, ph, e) * k;
      arr[o + 14] = this.z[i];
      arr[o + 15] = 1;
    }
    this.body.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    this.t += dt;
    this.write();
  }

  dispose(): void {
    for (const m of [this.body, this.head]) if (m) this.scene.remove(m);
    this.head?.dispose();
    this.body?.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.body = this.head = null;
  }
}
