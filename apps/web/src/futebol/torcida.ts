import * as THREE from "three";
import type { Quality } from "../settings";
import seatData from "./assentosTorcida.json";
import { crowdCount, crowdEnergy, rng } from "./torcidaLayout";

const SHIRTS = ["#d83a2e", "#1f5fbf", "#ffd21f", "#2c8a57", "#f4f1ea", "#7a3fb0", "#ff8a1f", "#1c1a17", "#3bb6c4"];
const SKINS = ["#f2c9a5", "#d9a074", "#a8704a", "#7a4a2e", "#4d2f1c"];

/** Sombreado fixo no vértice (mais claro em cima): o material não usa luz, então isso dá volume à caixa e à cabeça. */
function shade(geo: THREE.BufferGeometry, lo: number, hi: number): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = 0.7 + 0.3 * Math.min(1, Math.max(0, (pos.getY(i) - lo) / (hi - lo)));
    col.set([k, k, k], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

/**
 * Torcida animada nas arquibancadas do mapa. Os assentos vêm de assentosTorcida.json (gerado por
 * scripts/gerar-assentos-torcida.mjs a partir da geometria do .glb), então não há varredura do mapa ao abrir a partida.
 * Dois InstancedMesh (corpo e cabeça, caixa e esfera de poucos vértices, material sem luz e sem sombra) dividem a mesma
 * matriz, escrita uma única vez. O balanço e o pulo rodam no vertex shader (uTime, uEnergy e fase por instância).
 */
export class Torcida {
  private body: THREE.InstancedMesh | null = null;
  private head: THREE.InstancedMesh | null = null;
  private disposables: { dispose(): void }[] = [];
  private n = 0;
  private t = 0;
  private cheerAt = -100;
  private uTime = { value: 0 };
  private uEnergy = { value: 0 };

  constructor(
    private readonly scene: THREE.Scene,
    quality: Quality,
  ) {
    const total = Math.floor(seatData.length / 4);
    this.n = total;
    if (!total) return;
    const r = rng(99);
    const ph = new THREE.InstancedBufferAttribute(new Float32Array(total), 1);
    const bodyGeo = this.own(shade(new THREE.BoxGeometry(0.5, 0.8, 0.36).translate(0, 0.4, 0), 0, 0.8));
    const headGeo = this.own(shade(new THREE.SphereGeometry(0.2, 5, 3).translate(0, 1.0, 0), 0.8, 1.2));
    bodyGeo.setAttribute("aPh", ph);
    headGeo.setAttribute("aPh", ph);
    const body = this.own(new THREE.InstancedMesh(bodyGeo, this.own(this.material()), total));
    const head = this.own(new THREE.InstancedMesh(headGeo, this.own(this.material()), total));
    head.instanceMatrix = body.instanceMatrix;
    const c = new THREE.Color();
    const o = new THREE.Object3D();
    for (let i = 0; i < total; i++) {
      const k = 0.9 + r() * 0.35;
      ph.setX(i, r() * Math.PI * 2);
      o.position.set(seatData[i * 4], seatData[i * 4 + 1], seatData[i * 4 + 2]);
      o.rotation.y = seatData[i * 4 + 3];
      o.scale.setScalar(k);
      o.updateMatrix();
      body.setMatrixAt(i, o.matrix);
      body.setColorAt(i, c.set(SHIRTS[Math.floor(r() * SHIRTS.length)]));
      head.setColorAt(i, c.set(SKINS[Math.floor(r() * SKINS.length)]));
    }
    for (const m of [body, head]) {
      m.frustumCulled = false;
      this.scene.add(m);
    }
    this.body = body;
    this.head = head;
    this.setQuality(quality);
  }

  private own<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  /** Material sem luz; o balanço (rolagem) e o pulo (altura) saem do tempo e da fase de cada torcedor, como em bounce(). */
  private material(): THREE.MeshBasicMaterial {
    const mat = new THREE.MeshBasicMaterial({ color: "#ffffff", vertexColors: true });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uTime;
      shader.uniforms.uEnergy = this.uEnergy;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aPh;\nuniform float uTime;\nuniform float uEnergy;")
        .replace(
          "#include <begin_vertex>",
          `float roll = sin(uTime * 1.6 + aPh) * (0.05 + uEnergy * 0.1);
float cr = cos(roll);
float sr = sin(roll);
vec3 transformed = vec3(cr * position.x - sr * position.y, sr * position.x + cr * position.y, position.z);
transformed.y += 0.025 * (1.0 + sin(uTime * 1.7 + aPh)) + uEnergy * 0.6 * abs(sin(uTime * 7.5 + aPh * 0.6));`,
        );
    };
    return mat;
  }

  /** Menos torcedores no modo Leve. */
  setQuality(q: Quality): void {
    const c = crowdCount(this.n, q);
    if (this.body) this.body.count = c;
    if (this.head) this.head.count = c;
  }

  /** Pulo e agitação forte por uns 3 s (gol, apito final). */
  cheer(): void {
    this.cheerAt = this.t;
  }

  update(dt: number): void {
    this.t += dt;
    this.uTime.value = this.t;
    this.uEnergy.value = crowdEnergy(this.t - this.cheerAt);
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
