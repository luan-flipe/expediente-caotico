import * as THREE from "three";
import type { AvatarDNA, ChairDNA, GhostSample } from "@ec/shared";
import { buildRacer, type Racer3D } from "./chairMesh";

export const GHOST_MINE = "#4aa3ff";
export const GHOST_RECORD = "#ffd23f";
const GHOST_OPACITY = 0.35;

const angleLerp = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/** Nome flutuante sobre a cadeira. */
export function nameTag(name: string, color = "#fffdf7"): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 48;
  const g = c.getContext("2d")!;
  g.font = "800 30px 'Bricolage Grotesque', sans-serif";
  g.textAlign = "center";
  g.lineWidth = 6;
  g.strokeStyle = "rgba(20,18,15,0.9)";
  g.strokeText(name, 128, 34);
  g.fillStyle = color;
  g.fillText(name, 128, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(1.9, 0.36, 1);
  s.position.y = 2.05;
  s.renderOrder = 5;
  return s;
}

/**
 * Troca os materiais de tudo sob `root` por cópias transparentes (e sem sombra).
 * Devolve a função que põe os originais de volta e libera as cópias; chame antes do dispose do modelo.
 */
export function fadeMaterials(root: THREE.Object3D, opts: { opacity: number; color?: THREE.ColorRepresentation; depthWrite?: boolean }): () => void {
  const swaps: { mesh: THREE.Mesh; orig: THREE.Material | THREE.Material[] }[] = [];
  const copies: THREE.Material[] = [];
  const fade = (m: THREE.Material) => {
    const c = m.clone();
    c.transparent = true;
    c.opacity = opts.opacity;
    c.depthWrite = opts.depthWrite ?? true;
    if (opts.color !== undefined) {
      const lit = c as THREE.MeshStandardMaterial;
      if (lit.color) lit.color.set(opts.color);
      if (lit.emissive) lit.emissive.set(opts.color).multiplyScalar(0.35);
    }
    copies.push(c);
    return c;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    swaps.push({ mesh, orig: mesh.material });
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(fade) : fade(mesh.material);
    mesh.castShadow = false;
  });
  return () => {
    for (const s of swaps) s.mesh.material = s.orig;
    for (const c of copies) c.dispose();
  };
}

/** Fantasma do contra o relógio: cadeira translúcida que repete as amostras de uma volta gravada. */
export class Ghost {
  readonly root: THREE.Group;
  private readonly r3d: Racer3D;
  private readonly restore: () => void;
  private readonly tag: THREE.Sprite;
  private samples: GhostSample[] = [];
  private label: string;

  constructor(
    avatar: AvatarDNA,
    chair: ChairDNA,
    private readonly color: string,
    label: string,
  ) {
    this.r3d = buildRacer(avatar, chair);
    this.root = this.r3d.root;
    this.restore = fadeMaterials(this.root, { opacity: GHOST_OPACITY, color, depthWrite: false });
    this.label = label;
    this.tag = nameTag(label, color);
    this.root.add(this.tag);
    this.root.visible = false;
  }

  setLap(samples: GhostSample[] | null, label: string): void {
    this.samples = samples ?? [];
    if (label === this.label) return;
    // recorde trocou de dono: refaz só o nome
    this.label = label;
    const old = this.tag.material;
    this.tag.material = nameTag(label, this.color).material;
    old.map?.dispose();
    old.dispose();
  }

  /** Põe o fantasma no instante `t` (ms desde a linha); null esconde. */
  update(t: number | null, dt: number): void {
    const s = this.samples;
    if (t === null || s.length < 2 || t < 0) {
      this.root.visible = false;
      return;
    }
    // acabou a volta gravada: espera na linha até a próxima começar
    let i = s.length - 2;
    if (t < s[s.length - 1][0]) {
      let lo = 0;
      let hi = s.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (s[mid][0] <= t) lo = mid;
        else hi = mid;
      }
      i = lo;
    }
    const a = s[i];
    const b = s[i + 1];
    const span = b[0] - a[0];
    const k = span > 0 ? Math.max(0, Math.min(1, (t - a[0]) / span)) : 1;
    // fantasma antigo (4 números) fica no chão; o 5º número é a altura do voo
    this.root.position.set(a[1] + (b[1] - a[1]) * k, (a[4] ?? 0) + ((b[4] ?? 0) - (a[4] ?? 0)) * k, a[2] + (b[2] - a[2]) * k);
    this.root.rotation.y = angleLerp(a[3], b[3], k);
    const speed = span > 0 && t < b[0] ? Math.hypot(b[1] - a[1], b[2] - a[2]) / (span / 1000) : 0;
    this.r3d.update(dt, speed);
    this.root.visible = true;
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    this.root.remove(this.tag);
    this.tag.material.map?.dispose();
    this.tag.material.dispose();
    this.restore();
    this.r3d.dispose();
  }
}
