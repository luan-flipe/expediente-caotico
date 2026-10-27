import * as THREE from "three";
import { OFFICE_MAP, type Box } from "@ec/shared";
import { Canvas2D } from "./canvas";

const COLORS: Record<Box["kind"], string> = {
  wall: "#ece6da",
  glass: "#a9d4f0",
  desk: "#c9a27a",
  cabinet: "#8b939e",
  counter: "#d8d2c4",
  plant: "#7a5236",
  partition: "#6d86a6",
  sofa: "#3f6b8a",
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** Monta o escritório a partir da mesma lista de caixas usada pela colisão do servidor. */
export function buildOffice(scene: THREE.Scene): void {
  const W = OFFICE_MAP.width;
  const D = OFFICE_MAP.depth;

  const ground = mesh(new THREE.PlaneGeometry(W + 40, D + 40), new THREE.MeshStandardMaterial({ color: "#7d8a6a", roughness: 1 }), 0, -0.02, 0, false);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  for (const r of OFFICE_MAP.rooms) {
    const floor = mesh(new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshStandardMaterial({ color: r.floor, roughness: 0.95 }), r.x, 0, r.z, false);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const lines = new THREE.GridHelper(Math.max(r.w, r.d), Math.max(r.w, r.d) / 2, "#000000", "#000000");
    (lines.material as THREE.Material).opacity = 0.05;
    (lines.material as THREE.Material).transparent = true;
    lines.position.set(r.x, 0.01, r.z);
    lines.scale.set(r.w / Math.max(r.w, r.d), 1, r.d / Math.max(r.w, r.d));
    scene.add(lines);
  }

  const mats = new Map<string, THREE.Material>();
  const matOf = (kind: Box["kind"]) => {
    let m = mats.get(kind);
    if (!m) {
      m =
        kind === "glass"
          ? new THREE.MeshStandardMaterial({ color: COLORS.glass, transparent: true, opacity: 0.32, roughness: 0.1, metalness: 0.1 })
          : new THREE.MeshStandardMaterial({ color: COLORS[kind], roughness: 0.85, flatShading: true });
      mats.set(kind, m);
    }
    return m;
  };

  const top = new THREE.MeshStandardMaterial({ color: "#f3efe6", roughness: 0.7 });
  const screen = new THREE.MeshStandardMaterial({ color: "#1b2433", emissive: "#2a4f8a", emissiveIntensity: 0.6 });
  const leaf = new THREE.MeshStandardMaterial({ color: "#3e9b52", roughness: 0.9, flatShading: true });
  const wallTop = new THREE.MeshStandardMaterial({ color: "#5a554c" });
  const chair = new THREE.MeshStandardMaterial({ color: "#2b2f36", roughness: 0.8 });

  for (const b of OFFICE_MAP.boxes) {
    if (b.kind === "plant") {
      scene.add(mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.55, 8), matOf("plant"), b.x, 0.275, b.z));
      scene.add(mesh(new THREE.IcosahedronGeometry(0.6, 0), leaf, b.x, 1.1, b.z));
      continue;
    }
    if (b.kind === "desk") {
      scene.add(mesh(new THREE.BoxGeometry(b.w, 0.08, b.d), top, b.x, b.h - 0.04, b.z));
      scene.add(mesh(new THREE.BoxGeometry(b.w * 0.96, b.h - 0.08, b.d * 0.9), matOf("desk"), b.x, (b.h - 0.08) / 2, b.z));
      if (b.w >= 3.5 && b.d < 2) {
        for (const off of [-b.w / 4, b.w / 4]) {
          const facing = b.z > 0 ? 1 : -1;
          scene.add(mesh(new THREE.BoxGeometry(0.7, 0.45, 0.05), screen, b.x + off, b.h + 0.3, b.z));
          const c = mesh(new THREE.BoxGeometry(0.55, 0.9, 0.55), chair, b.x + off, 0.45, b.z + facing * 1.05, true);
          scene.add(c);
        }
      }
      continue;
    }
    const m = mesh(new THREE.BoxGeometry(b.w, b.h, b.d), matOf(b.kind), b.x, b.h / 2, b.z, b.kind !== "glass");
    scene.add(m);
    if (b.kind === "wall") scene.add(mesh(new THREE.BoxGeometry(b.w + 0.02, 0.08, b.d + 0.02), wallTop, b.x, b.h + 0.04, b.z, false));
    if (b.kind === "glass") {
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b.w, b.h, b.d)), new THREE.LineBasicMaterial({ color: "#5a6f80" }));
      frame.position.copy(m.position);
      scene.add(frame);
    }
  }

  for (const r of OFFICE_MAP.rooms) {
    const g = new Canvas2D(512, 96);
    g.fillStyle = "rgba(29,27,23,0.08)";
    g.font = "800 64px 'Bricolage Grotesque', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(r.name.toUpperCase(), 256, 50);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), new THREE.MeshBasicMaterial({ map: g.texture(), transparent: true, depthWrite: false }));
    label.rotation.x = -Math.PI / 2;
    label.position.set(r.x, 0.02, r.z + r.d / 2 - 1.4);
    scene.add(label);
  }
}
