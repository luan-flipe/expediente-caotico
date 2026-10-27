import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { CHAIR_BASES, CHAIR_SEATS, type AvatarDNA, type ChairDNA } from "@ec/shared";
import { createCharacter, HIP_HEIGHT, modelReady, type Character } from "../game/character";

/** Altura do topo do assento. */
const SEAT_TOP = 0.6;

function shade(hex: string, k: number): THREE.Color {
  const c = new THREE.Color(hex);
  return k >= 0 ? c.lerp(new THREE.Color("#ffffff"), k) : c.multiplyScalar(1 + k);
}

/**
 * Cadeira de escritório procedural, virada para +z. Quando o modelo GLB do romulo-h
 * chegar, ele entra aqui e esta versão vira o fallback.
 */
export function buildChair(chair: ChairDNA): THREE.Group {
  const g = new THREE.Group();
  const seatColor = CHAIR_SEATS[chair.seat] ?? CHAIR_SEATS[0];
  const baseColor = CHAIR_BASES[chair.base] ?? CHAIR_BASES[0];
  const fabric = new THREE.MeshStandardMaterial({ color: seatColor, roughness: 0.9 });
  const fabricDark = new THREE.MeshStandardMaterial({ color: shade(seatColor, -0.35), roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.35, metalness: 0.6 });
  const plastic = new THREE.MeshStandardMaterial({ color: "#1d1d1f", roughness: 0.6 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };

  // base em estrela, pistão e rodas
  const wheelR = chair.wheels === 2 ? 0.09 : 0.055;
  const wheelMat =
    chair.wheels === 1
      ? new THREE.MeshStandardMaterial({ color: "#3cf2ff", emissive: "#19d6ff", emissiveIntensity: 1.6 })
      : chair.wheels === 2
        ? new THREE.MeshStandardMaterial({ color: "#ff4fa3", roughness: 0.4 })
        : plastic;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = add(new THREE.BoxGeometry(0.06, 0.05, 0.36), metal, Math.sin(a) * 0.18, wheelR * 2 + 0.03, Math.cos(a) * 0.18, 0, a);
    leg.castShadow = true;
    const w = add(new THREE.CylinderGeometry(wheelR, wheelR, chair.wheels === 2 ? 0.07 : 0.05, 14), wheelMat, Math.sin(a) * 0.35, wheelR, Math.cos(a) * 0.35, 0, a, Math.PI / 2);
    w.castShadow = false;
  }
  add(new THREE.CylinderGeometry(0.045, 0.06, 0.32, 10), metal, 0, wheelR * 2 + 0.2, 0);
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 10), plastic, 0, SEAT_TOP - 0.16, 0);

  // assento e encosto
  add(new RoundedBoxGeometry(0.64, 0.12, 0.6, 3, 0.05), fabric, 0, SEAT_TOP - 0.06, 0.02);
  const backH = [0.42, 0.68, 0.86][chair.back] ?? 0.68;
  const backW = chair.back === 2 ? 0.58 : 0.54;
  const backY = SEAT_TOP + 0.08 + backH / 2;
  add(new THREE.BoxGeometry(0.06, 0.24, 0.05), plastic, 0, SEAT_TOP + 0.05, -0.29);
  add(new RoundedBoxGeometry(backW, backH, 0.1, 3, 0.04), fabric, 0, backY, -0.32, -0.12);
  if (chair.back === 2) {
    // encosto gamer: abas laterais, faixa e apoio de cabeça
    for (const s of [-1, 1]) add(new RoundedBoxGeometry(0.1, backH * 0.75, 0.14, 2, 0.03), fabricDark, s * (backW / 2 - 0.02), backY - 0.05, -0.28, -0.12, s * 0.3);
    add(new THREE.BoxGeometry(0.1, backH * 0.9, 0.012), new THREE.MeshStandardMaterial({ color: "#f5f0e1" }), 0, backY, -0.262, -0.12);
    add(new RoundedBoxGeometry(0.26, 0.14, 0.08, 2, 0.03), fabricDark, 0, backY + backH / 2 - 0.12, -0.25, -0.12);
  }
  // braços
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.04, 0.2, 0.04), plastic, s * 0.33, SEAT_TOP + 0.07, -0.02);
    add(new RoundedBoxGeometry(0.08, 0.04, 0.32, 2, 0.015), plastic, s * 0.33, SEAT_TOP + 0.18, 0.02);
  }

  // enfeite
  const armY = SEAT_TOP + 0.2;
  switch (chair.trinket) {
    case 1: {
      add(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 6), metal, -0.22, backY + backH / 2 + 0.25, -0.36);
      const flag = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.28, -0.08), new THREE.Vector2(0, -0.16)]);
      add(new THREE.ShapeGeometry(flag), new THREE.MeshStandardMaterial({ color: "#ffd23f", side: THREE.DoubleSide }), -0.22, backY + backH / 2 + 0.58, -0.36, 0, -Math.PI / 2);
      break;
    }
    case 2:
      add(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: "#d62828", roughness: 0.5 }), 0.33, armY + 0.05, -0.06);
      add(new THREE.ConeGeometry(0.05, 0.16, 12, 1, true), new THREE.MeshStandardMaterial({ color: "#d4af37", metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }), 0.33, armY + 0.05, 0.06, -Math.PI / 2);
      break;
    case 3:
      add(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 14), new THREE.MeshStandardMaterial({ color: "#f5f0e1" }), -0.33, armY + 0.05, 0.08);
      add(new THREE.TorusGeometry(0.025, 0.008, 6, 12), new THREE.MeshStandardMaterial({ color: "#f5f0e1" }), -0.38, armY + 0.05, 0.08, 0, Math.PI / 2);
      add(new THREE.CircleGeometry(0.04, 14), new THREE.MeshStandardMaterial({ color: "#4a2c1a" }), -0.33, armY + 0.095, 0.08, -Math.PI / 2);
      break;
    case 4: {
      add(new THREE.CylinderGeometry(0.05, 0.04, 0.08, 10), new THREE.MeshStandardMaterial({ color: "#b5651d" }), 0.33, armY + 0.04, 0.06);
      const leaf = new THREE.MeshStandardMaterial({ color: "#3e9b52", flatShading: true });
      for (const [x, y, z] of [
        [0, 0.12, 0],
        [0.04, 0.1, 0.02],
        [-0.03, 0.1, -0.02],
      ])
        add(new THREE.IcosahedronGeometry(0.045, 0), leaf, 0.33 + x, armY + y, 0.06 + z);
      break;
    }
    case 5:
      for (const [x, y, c] of [
        [-0.12, 0.15, "#ffd23f"],
        [0.13, 0.3, "#2e86de"],
        [-0.05, 0.42, "#e84393"],
      ] as const)
        add(new THREE.CircleGeometry(0.06, 16), new THREE.MeshStandardMaterial({ color: c }), x, SEAT_TOP + 0.08 + y, -0.383, 0.12 + Math.PI, 0, 0);
      break;
  }
  return g;
}

export interface Racer3D {
  root: THREE.Group;
  char: Character;
  dispose(): void;
}

/** Cadeira com o boneco do crachá sentado. */
export function seatedRacer(avatar: AvatarDNA, chair: ChairDNA): Racer3D {
  const root = new THREE.Group();
  const seat = buildChair(chair);
  const char = createCharacter(avatar);
  char.sit();
  char.root.position.set(0, SEAT_TOP - HIP_HEIGHT, -0.06);
  root.add(seat, char.root);
  return {
    root,
    char,
    dispose() {
      char.dispose();
      seat.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
    },
  };
}

let thumbRenderer: THREE.WebGLRenderer | null = null;
const thumbCache = new Map<string, string>();

/** Miniatura do boneco sentado na cadeira (dataURL). */
export function chairThumbnail(avatar: AvatarDNA, chair: ChairDNA, size = 160): string {
  const key = JSON.stringify({ ...avatar, name: "" }) + JSON.stringify(chair) + size + (modelReady() ? "glb" : "");
  const hit = thumbCache.get(key);
  if (hit) return hit;
  thumbRenderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  thumbRenderer.setSize(size, size, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#9a8f80", 2.2));
  const sun = new THREE.DirectionalLight("#ffffff", 1.6);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  const r = seatedRacer(avatar, chair);
  r.root.rotation.y = 0.6;
  scene.add(r.root);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  cam.position.set(0, 1.6, 4.4);
  cam.lookAt(0, 0.82, 0);
  thumbRenderer.render(scene, cam);
  const url = thumbRenderer.domElement.toDataURL("image/png");
  r.dispose();
  thumbCache.set(key, url);
  return url;
}
