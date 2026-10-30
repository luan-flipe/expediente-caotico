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
  /** Tempo de findSeats, para medir. */
  seatMs = 0;

  constructor(
    private readonly scene: THREE.Scene,
    stadium: THREE.Object3D,
    quality: Quality,
  ) {
    const t0 = performance.now();
    const seats = this.findSeats(stadium);
    this.seatMs = performance.now() - t0;
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

  /**
   * Acha assentos nas arquibancadas sem raycast: as malhas do anel (caixa que cobre a elipse toda, baixas, sem o teto)
   * viram triângulos em coordenadas do mundo; só os que olham para cima entram em uma grade de 2 m e cada candidato
   * consulta os triângulos da sua célula (ponto no triângulo em XZ, altura por interpolação). A normal é calculada
   * em espaço do mundo a partir dos vértices já transformados.
   */
  private findSeats(stadium: THREE.Object3D): Seat[] {
    stadium.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const tris: number[] = [];
    const cells = new Map<number, number[]>();
    const CELL = 2;
    const cellId = (cx: number, cz: number) => cx * 4096 + cz;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    stadium.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      box.setFromObject(m);
      // só as malhas que cobrem o anel inteiro das arquibancadas (sem o teto, que passa de 30 m)
      if (!(box.max.y < 30 && box.max.y > 0.3 && box.max.x > 115 && box.min.x < -115 && box.max.z > 95 && box.min.z < -95)) return;
      const pos = m.geometry.attributes.position;
      const idx = m.geometry.index;
      const count = idx ? idx.count : pos.count;
      for (let i = 0; i + 2 < count; i += 3) {
        a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
        b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(m.matrixWorld);
        c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(m.matrixWorld);
        e1.subVectors(b, a);
        e2.subVectors(c, a);
        const ny = e1.z * e2.x - e1.x * e2.z;
        const len = e1.cross(e2).length();
        // degrau voltado para cima (normal no mundo com y >= 0,6) e acima do chão do estádio
        if (len < 1e-9 || ny / len < 0.6 || Math.max(a.y, b.y, c.y) < 0.3) continue;
        const t = tris.length / 9;
        tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        const x0 = Math.floor(Math.min(a.x, b.x, c.x) / CELL);
        const x1 = Math.floor(Math.max(a.x, b.x, c.x) / CELL);
        const z0 = Math.floor(Math.min(a.z, b.z, c.z) / CELL);
        const z1 = Math.floor(Math.max(a.z, b.z, c.z) / CELL);
        for (let cx = x0; cx <= x1; cx++) {
          for (let cz = z0; cz <= z1; cz++) {
            const k = cellId(cx, cz);
            const list = cells.get(k);
            if (list) list.push(t);
            else cells.set(k, [t]);
          }
        }
      }
    });
    const heightAt = (x: number, z: number): number => {
      let best = -1;
      for (const t of cells.get(cellId(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
        const o = t * 9;
        const ax = tris[o];
        const az = tris[o + 2];
        const v0x = tris[o + 3] - ax;
        const v0z = tris[o + 5] - az;
        const v1x = tris[o + 6] - ax;
        const v1z = tris[o + 8] - az;
        const px = x - ax;
        const pz = z - az;
        const den = v0x * v1z - v1x * v0z;
        if (Math.abs(den) < 1e-12) continue;
        const u = (px * v1z - v1x * pz) / den;
        const w = (v0x * pz - px * v0z) / den;
        if (u < 0 || w < 0 || u + w > 1) continue;
        const y = tris[o + 1] + u * (tris[o + 4] - tris[o + 1]) + w * (tris[o + 7] - tris[o + 1]);
        // só assentos abaixo do teto das arquibancadas (12 m)
        if (y > best && y <= 12) best = y;
      }
      return best;
    };
    const out: Seat[] = [];
    const used = new Set<string>();
    const r = rng(7);
    for (let tries = 0; tries < MAX_CROWD * 4 && out.length < MAX_CROWD; tries++) {
      const s = ringCandidate(r);
      const key = cellKey(s.x, s.z);
      if (used.has(key)) continue;
      const y = heightAt(s.x, s.z);
      if (y < 0.3) continue;
      used.add(key);
      out.push({ x: s.x, y, z: s.z, yaw: s.yaw });
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
    for (let i = 0, end = this.body.count; i < end; i++) {
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
