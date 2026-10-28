import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import { OFFICE_MAP, type Box } from "@ec/shared";

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

function addBox(list: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number): void {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  list.push(g);
}

function commitMerged(
  scene: THREE.Scene,
  geos: THREE.BufferGeometry[],
  mat: THREE.Material,
  shadow = true,
): void {
  if (geos.length === 0) return;
  const merged = BufferGeometryUtils.mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return;
  const m = new THREE.Mesh(merged, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  scene.add(m);
}

/** Monta o escritório otimizado com geometrias unificadas (slashes centenas de draw calls). */
export function buildOffice(scene: THREE.Scene): void {
  const W = OFFICE_MAP.width;
  const D = OFFICE_MAP.depth;

  // Chão externo
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 40, D + 40),
    new THREE.MeshStandardMaterial({ color: "#7d8a6a", roughness: 1 }),
  );
  ground.position.set(0, -0.02, 0);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Pisos de cada ambiente
  for (const r of OFFICE_MAP.rooms) {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(r.w, r.d),
      new THREE.MeshStandardMaterial({ color: r.floor, roughness: 0.95 }),
    );
    floor.position.set(r.x, 0, r.z);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const lines = new THREE.GridHelper(Math.max(r.w, r.d), Math.max(r.w, r.d) / 2, "#000000", "#000000");
    (lines.material as THREE.Material).opacity = 0.05;
    (lines.material as THREE.Material).transparent = true;
    lines.position.set(r.x, 0.01, r.z);
    lines.scale.set(r.w / Math.max(r.w, r.d), 1, r.d / Math.max(r.w, r.d));
    scene.add(lines);
  }

  // Coletores de geometrias por material
  const wallGeos: THREE.BufferGeometry[] = [];
  const wallTopGeos: THREE.BufferGeometry[] = [];
  const glassGeos: THREE.BufferGeometry[] = [];
  const deskTopGeos: THREE.BufferGeometry[] = [];
  const deskBaseGeos: THREE.BufferGeometry[] = [];
  const screenGeos: THREE.BufferGeometry[] = [];
  const chairGeos: THREE.BufferGeometry[] = [];
  const cabinetGeos: THREE.BufferGeometry[] = [];
  const counterGeos: THREE.BufferGeometry[] = [];
  const partitionGeos: THREE.BufferGeometry[] = [];
  const sofaGeos: THREE.BufferGeometry[] = [];
  const plantPotGeos: THREE.BufferGeometry[] = [];
  const plantLeafGeos: THREE.BufferGeometry[] = [];
  const glassFrameLines: THREE.LineSegments[] = [];

  for (const b of OFFICE_MAP.boxes) {
    if (b.kind === "plant") {
      const pot = new THREE.CylinderGeometry(0.32, 0.26, 0.55, 8);
      pot.translate(b.x, 0.275, b.z);
      plantPotGeos.push(pot);

      const leaf = new THREE.IcosahedronGeometry(0.6, 0);
      leaf.translate(b.x, 1.1, b.z);
      plantLeafGeos.push(leaf);
      continue;
    }
    if (b.kind === "desk") {
      addBox(deskTopGeos, b.w, 0.08, b.d, b.x, b.h - 0.04, b.z);
      addBox(deskBaseGeos, b.w * 0.96, b.h - 0.08, b.d * 0.9, b.x, (b.h - 0.08) / 2, b.z);
      if (b.w >= 3.5 && b.d < 2) {
        for (const off of [-b.w / 4, b.w / 4]) {
          const facing = b.z > 0 ? 1 : -1;
          addBox(screenGeos, 0.7, 0.45, 0.05, b.x + off, b.h + 0.3, b.z);
          addBox(chairGeos, 0.55, 0.9, 0.55, b.x + off, 0.45, b.z + facing * 1.05);
        }
      }
      continue;
    }
    if (b.kind === "wall") {
      addBox(wallGeos, b.w, b.h, b.d, b.x, b.h / 2, b.z);
      addBox(wallTopGeos, b.w + 0.02, 0.08, b.d + 0.02, b.x, b.h + 0.04, b.z);
      continue;
    }
    if (b.kind === "glass") {
      addBox(glassGeos, b.w, b.h, b.d, b.x, b.h / 2, b.z);
      const frame = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(b.w, b.h, b.d)),
        new THREE.LineBasicMaterial({ color: "#5a6f80" }),
      );
      frame.position.set(b.x, b.h / 2, b.z);
      glassFrameLines.push(frame);
      continue;
    }
    if (b.kind === "cabinet") addBox(cabinetGeos, b.w, b.h, b.d, b.x, b.h / 2, b.z);
    else if (b.kind === "counter") addBox(counterGeos, b.w, b.h, b.d, b.x, b.h / 2, b.z);
    else if (b.kind === "partition") addBox(partitionGeos, b.w, b.h, b.d, b.x, b.h / 2, b.z);
    else if (b.kind === "sofa") addBox(sofaGeos, b.w, b.h, b.d, b.x, b.h / 2, b.z);
  }

  // Materiais compartilhados
  const top = new THREE.MeshStandardMaterial({ color: "#f3efe6", roughness: 0.7 });
  const deskMat = new THREE.MeshStandardMaterial({ color: COLORS.desk, roughness: 0.85, flatShading: true });
  const screenMat = new THREE.MeshStandardMaterial({ color: "#1b2433", emissive: "#2a4f8a", emissiveIntensity: 0.6 });
  const leafMat = new THREE.MeshStandardMaterial({ color: "#3e9b52", roughness: 0.9, flatShading: true });
  const potMat = new THREE.MeshStandardMaterial({ color: COLORS.plant, roughness: 0.85, flatShading: true });
  const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.85, flatShading: true });
  const wallTopMat = new THREE.MeshStandardMaterial({ color: "#5a554c" });
  const chairMat = new THREE.MeshStandardMaterial({ color: "#2b2f36", roughness: 0.8 });
  const cabinetMat = new THREE.MeshStandardMaterial({ color: COLORS.cabinet, roughness: 0.85, flatShading: true });
  const counterMat = new THREE.MeshStandardMaterial({ color: COLORS.counter, roughness: 0.85, flatShading: true });
  const partitionMat = new THREE.MeshStandardMaterial({ color: COLORS.partition, roughness: 0.85, flatShading: true });
  const sofaMat = new THREE.MeshStandardMaterial({ color: COLORS.sofa, roughness: 0.85, flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({ color: COLORS.glass, transparent: true, opacity: 0.32, roughness: 0.1, metalness: 0.1 });

  // Unifica e adiciona malhas agregadas à cena
  commitMerged(scene, wallGeos, wallMat, true);
  commitMerged(scene, wallTopGeos, wallTopMat, false);
  commitMerged(scene, glassGeos, glassMat, false);
  commitMerged(scene, deskTopGeos, top, true);
  commitMerged(scene, deskBaseGeos, deskMat, true);
  commitMerged(scene, screenGeos, screenMat, false);
  commitMerged(scene, chairGeos, chairMat, true);
  commitMerged(scene, cabinetGeos, cabinetMat, true);
  commitMerged(scene, counterGeos, counterMat, true);
  commitMerged(scene, partitionGeos, partitionMat, true);
  commitMerged(scene, sofaGeos, sofaMat, true);
  commitMerged(scene, plantPotGeos, potMat, true);
  commitMerged(scene, plantLeafGeos, leafMat, true);

  for (const f of glassFrameLines) scene.add(f);

  // Nomes das salas no chão
  for (const r of OFFICE_MAP.rooms) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 96;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(29,27,23,0.08)";
    g.font = "800 64px 'Bricolage Grotesque', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(r.name.toUpperCase(), 256, 50);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 1.5),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
    );
    label.rotation.x = -Math.PI / 2;
    label.position.set(r.x, 0.02, r.z + r.d / 2 - 1.4);
    scene.add(label);
  }
}
