import * as THREE from "three";
import { ABILITIES, type AbilityId, type GameEvent } from "@ec/shared";

interface Effect {
  obj: THREE.Object3D;
  life: number;
  max: number;
  update: (k: number, obj: THREE.Object3D) => void;
}

function textSprite(text: string, color: string, size = 0.6): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "800 44px 'JetBrains Mono', monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 8;
  g.strokeStyle = "#1d1b17";
  g.strokeText(text, 64, 34);
  g.fillStyle = color;
  g.fillText(text, 64, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(size * 2, size, 1);
  s.renderOrder = 10;
  return s;
}

function fade(obj: THREE.Object3D, opacity: number): void {
  obj.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m && "opacity" in m) {
      m.transparent = true;
      m.opacity = opacity;
    }
  });
}

/** Efeitos visuais de curta duração disparados pelos eventos do servidor. */
export class FxSystem {
  private list: Effect[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  private add(obj: THREE.Object3D, life: number, update: Effect["update"]): void {
    this.scene.add(obj);
    this.list.push({ obj, life, max: life, update });
  }

  ring(x: number, z: number, radius: number, color: string, life = 0.45): void {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.08, z);
    this.add(m, life, (k, o) => {
      o.scale.setScalar(0.2 + radius * (1 - k));
      fade(o, k);
    });
  }

  puff(x: number, z: number, color: string, count = 6, y = 1): void {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color, transparent: true }));
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), 0.6 + Math.random(), Math.sin(a)).multiplyScalar(2.4);
      m.position.set(x, y, z);
      this.add(m, 0.4, (k, o) => {
        o.position.addScaledVector(v, 1 / 60);
        v.y -= 0.12;
        fade(o, k);
      });
    }
  }

  number(x: number, z: number, amount: number, mine: boolean): void {
    const s = textSprite(String(amount), mine ? "#ffe14d" : "#ffffff", mine ? 0.7 : 0.5);
    s.position.set(x + (Math.random() - 0.5) * 0.6, 2.3, z);
    this.add(s, 0.8, (k, o) => {
      o.position.y += 0.02;
      (o as THREE.Sprite).material.opacity = Math.min(1, k * 2);
    });
  }

  lightning(pts: { x: number; z: number }[]): void {
    const verts: THREE.Vector3[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      for (let s = 0; s <= 6; s++) {
        const t = s / 6;
        const j = s === 0 || s === 6 ? 0 : 0.35;
        verts.push(new THREE.Vector3(a.x + (b.x - a.x) * t + (Math.random() - 0.5) * j, 1.2 + (Math.random() - 0.5) * j, a.z + (b.z - a.z) * t + (Math.random() - 0.5) * j));
      }
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(verts), new THREE.LineBasicMaterial({ color: "#7fe3ff", transparent: true }));
    this.add(line, 0.3, (k, o) => fade(o, k));
    for (const p of pts.slice(1)) this.puff(p.x, p.z, "#7fe3ff", 4, 1.2);
  }

  cone(x: number, z: number, yaw: number, range: number, color: string): void {
    for (let i = 0; i < 18; i++) {
      const a = yaw + (Math.random() - 0.5) * 1.1;
      const speed = range * (0.8 + Math.random() * 0.6);
      const v = new THREE.Vector3(Math.sin(a) * speed, (Math.random() - 0.3) * 1.5, Math.cos(a) * speed);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 + Math.random() * 0.08, 0), new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.set(x, 1.3, z);
      this.add(m, 0.45, (k, o) => {
        o.position.addScaledVector(v, 1 / 60 / 0.45);
        fade(o, k);
      });
    }
  }

  handle(e: GameEvent, myId: string | null): void {
    if (e.type === "hit") {
      this.number(e.x, e.z, e.amount, e.from === myId);
      return;
    }
    if (e.type === "kill") return;
    if (e.type !== "fx") return;
    const def = ABILITIES[e.kind as AbilityId] as (typeof ABILITIES)[AbilityId] | undefined;
    const color = def?.color ?? "#ffffff";
    switch (e.kind) {
      case "impact":
        this.puff(e.x, e.z, "#f4f1ea", 4, 1.2);
        return;
      case "dodge":
        this.puff(e.x, e.z, "#ffffff", 6, 0.3);
        return;
      case "A1":
        if (e.pts) this.lightning(e.pts);
        return;
      case "A2":
        this.ring(e.x, e.z, e.radius ?? 3, color);
        this.puff(e.x, e.z, color, 10, 0.6);
        return;
      case "B1":
        this.cone(e.x, e.z, e.yaw ?? 0, e.radius ?? 6, color);
        return;
      case "C1":
        this.puff(e.x, e.z, color, 8, 0.4);
        return;
      case "C2":
      case "C3":
        this.ring(e.x, e.z, 1.6, color, 0.6);
        return;
      case "D1":
      case "D2":
        this.ring(e.x, e.z, e.radius ?? 3, color, 0.5);
        return;
      case "D3":
        if (e.pts) for (const p of e.pts) this.puff(p.x, p.z, color, 10, 1);
        return;
      default:
        if (e.kind.endsWith("-cast")) this.puff(e.x, e.z, color, 3, 1.3);
    }
  }

  private release(obj: THREE.Object3D): void {
    this.scene.remove(obj);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material & { map?: THREE.Texture };
      mat?.map?.dispose();
      mat?.dispose();
    });
  }

  update(dt: number): void {
    this.list = this.list.filter((f) => {
      f.life -= dt;
      if (f.life <= 0) {
        this.release(f.obj);
        return false;
      }
      f.update(f.life / f.max, f.obj);
      return true;
    });
  }

  /** Sai da partida: libera os efeitos que ainda estavam no ar. */
  dispose(): void {
    for (const f of this.list) this.release(f.obj);
    this.list = [];
  }
}
