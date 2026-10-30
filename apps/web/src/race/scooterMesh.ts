import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CHAIR_BASES, CHAIR_SEATS, type ChairDNA } from "@ec/shared";
import type { Character, StandFit } from "../game/character";
import type { Vehicle } from "./chairMesh";

const REAR_Z = -0.5;
const FRONT_Z = 0.48;
const RIDER_Z = 0.02;
/** Ângulo dos braços abaixo da horizontal até o guidão (rad). */
const ARM_DROP = 0.45;
const FALLBACK_FIT: StandFit = { sole: 0, shoulder: new THREE.Vector3(0.17, 0.7, 0), reach: 0.3 };
/** Por índice de `wheels`: Comuns, Neon e Off-road. */
const WHEELS = [
  { r: 0.1, w: 0.05 },
  { r: 0.1, w: 0.05 },
  { r: 0.13, w: 0.085 },
];

function knobs(r: number, w: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const box = new THREE.BoxGeometry(w + 0.01, 0.035, 0.03);
    m.makeRotationX(-a).setPosition(0, Math.sin(a) * r, Math.cos(a) * r);
    parts.push(box.applyMatrix4(m));
  }
  const merged = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return merged;
}

/** Patinete elétrico com o boneco em pé: o guidão vai para onde as mãos dele alcançam. */
export function mountScooter(chair: ChairDNA, char: Character): Vehicle {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: CHAIR_SEATS[chair.seat] ?? CHAIR_SEATS[0], roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: CHAIR_BASES[chair.base] ?? CHAIR_BASES[0], roughness: 0.35, metalness: 0.6 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#1d1d1f", roughness: 0.9 });
  const glow = (color: string, k = 1.4) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k });
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const tube = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) => {
    const d = b.clone().sub(a);
    const mesh = add(g, new THREE.CylinderGeometry(r, r, d.length(), 12), m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return mesh;
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  const wheel = WHEELS[chair.wheels] ?? WHEELS[0];
  const R = wheel.r;
  const tire = chair.wheels === 1 ? glow("#3cf2ff", 1.6) : rubber;
  const spinners: THREE.Group[] = [];
  const addWheel = (parent: THREE.Object3D, z: number) => {
    const spin = new THREE.Group();
    spin.position.set(0, R, z);
    parent.add(spin);
    add(spin, new THREE.CylinderGeometry(R, R, wheel.w, 22), tire, 0, 0, 0, 0, 0, Math.PI / 2);
    add(spin, new THREE.CylinderGeometry(R * 0.55, R * 0.55, wheel.w + 0.012, 14), metal, 0, 0, 0, 0, 0, Math.PI / 2);
    if (chair.wheels === 2) add(spin, knobs(R, wheel.w), rubber, 0, 0, 0);
    spinners.push(spin);
  };
  /** Para-lama em arco sobre a roda; theta 0 aponta para a frente (+z). */
  const fender = (parent: THREE.Object3D, z: number, from: number, to: number) =>
    add(parent, new THREE.CylinderGeometry(R + 0.03, R + 0.03, wheel.w + 0.03, 18, 1, true, from, to - from), body, 0, R, z, 0, 0, Math.PI / 2);

  const deckTop = R + 0.07;
  add(g, new RoundedBoxGeometry(0.32, 0.07, 0.76, 3, 0.025), body, 0, deckTop - 0.035, -0.02);
  add(g, new THREE.BoxGeometry(0.27, 0.008, 0.64), rubber, 0, deckTop + 0.002, -0.03);
  addWheel(g, REAR_Z);
  fender(g, REAR_Z, Math.PI / 3, Math.PI * 0.95);
  const tail = R + 0.04;
  add(g, new THREE.BoxGeometry(0.08, 0.025, 0.025), glow("#ff3030"), 0, R + tail * 0.5, REAR_Z - tail * 0.866, -Math.PI / 6);

  const headY = 2 * R + 0.06;
  const steer = new THREE.Group();
  steer.position.z = FRONT_Z;
  g.add(steer);
  addWheel(steer, 0);
  fender(steer, 0, -Math.PI / 6, Math.PI * 0.62);
  for (const s of [-1, 1]) add(steer, new THREE.BoxGeometry(0.014, headY - R, 0.03), metal, s * (wheel.w / 2 + 0.014), (R + headY) / 2, 0);
  add(steer, new THREE.BoxGeometry(wheel.w + 0.06, 0.03, 0.05), metal, 0, headY, 0);

  const fit = char.stand?.() ?? FALLBACK_FIT;
  char.root.position.set(0, deckTop - fit.sole, RIDER_Z);
  const shoulder = fit.shoulder.clone().add(char.root.position);
  const arm = v(0.15, -Math.sin(ARM_DROP), Math.cos(ARM_DROP)).normalize();
  const wrist = shoulder.clone().addScaledVector(arm, fit.reach);
  const palm = wrist.clone().addScaledVector(arm, 0.045);
  const toRider = (x: number) => v(x, wrist.y, wrist.z).sub(char.root.position);
  char.restHands(toRider(wrist.x), toRider(-wrist.x));

  const bar = v(0, palm.y, palm.z);
  const head = v(0, headY, FRONT_Z);
  tube(v(0, deckTop - 0.03, 0.3), head.clone().setY(headY + 0.02), 0.035, metal);
  tube(head, bar, 0.022, metal);
  tube(v(-palm.x - 0.05, bar.y, bar.z), v(palm.x + 0.05, bar.y, bar.z), 0.015, metal);
  for (const s of [-1, 1]) tube(v(s * (palm.x - 0.06), bar.y, bar.z), v(s * (palm.x + 0.05), bar.y, bar.z), 0.024, rubber);
  add(g, new RoundedBoxGeometry(0.11, 0.03, 0.08, 2, 0.01), rubber, 0, bar.y + 0.025, bar.z);
  add(g, new THREE.PlaneGeometry(0.08, 0.05), glow("#3cf2ff", 1.2), 0, bar.y + 0.041, bar.z, -Math.PI / 2);
  const lamp = head.clone().lerp(bar, 0.7);
  add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.04, 14), glow("#fff4c2", 1.8), 0, lamp.y, lamp.z + 0.035, Math.PI / 2);

  switch (chair.trinket) {
    case 1: {
      // z atrás da nuca: mais à frente o mastro atravessa a cabeça
      const h = 1.75;
      add(g, new THREE.CylinderGeometry(0.008, 0.008, h, 6), metal, -0.1, deckTop + h / 2, -0.46);
      const flag = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.28, -0.08), new THREE.Vector2(0, -0.16)]);
      add(g, new THREE.ShapeGeometry(flag), new THREE.MeshStandardMaterial({ color: "#ffd23f", side: THREE.DoubleSide }), -0.1, deckTop + h, -0.46, 0, Math.PI / 2);
      break;
    }
    case 2: {
      const x = palm.x - 0.1;
      add(g, new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshStandardMaterial({ color: "#d62828", roughness: 0.5 }), x, bar.y + 0.045, bar.z - 0.02);
      add(g, new THREE.ConeGeometry(0.04, 0.13, 12, 1, true), new THREE.MeshStandardMaterial({ color: "#d4af37", metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }), x, bar.y + 0.045, bar.z + 0.08, -Math.PI / 2);
      break;
    }
    case 3: {
      const x = -(palm.x - 0.1);
      const cup = new THREE.MeshStandardMaterial({ color: "#f5f0e1" });
      add(g, new THREE.CylinderGeometry(0.04, 0.035, 0.09, 14), cup, x, bar.y + 0.06, bar.z);
      add(g, new THREE.TorusGeometry(0.022, 0.007, 6, 12), cup, x - 0.045, bar.y + 0.06, bar.z, 0, Math.PI / 2);
      add(g, new THREE.CircleGeometry(0.035, 14), new THREE.MeshStandardMaterial({ color: "#4a2c1a" }), x, bar.y + 0.101, bar.z, -Math.PI / 2);
      break;
    }
    case 4: {
      const z = 0.26;
      add(g, new THREE.CylinderGeometry(0.05, 0.04, 0.08, 10), new THREE.MeshStandardMaterial({ color: "#b5651d" }), 0, deckTop + 0.04, z);
      const leaf = new THREE.MeshStandardMaterial({ color: "#3e9b52", flatShading: true });
      for (const [x, y, dz] of [
        [0, 0.12, 0],
        [0.04, 0.1, 0.02],
        [-0.03, 0.1, -0.02],
      ])
        add(g, new THREE.IcosahedronGeometry(0.045, 0), leaf, x, deckTop + y, z + dz);
      break;
    }
    case 5:
      for (const s of [-1, 1])
        for (const [z, y, c] of [
          [-0.25, -0.035, "#ffd23f"],
          [-0.02, -0.03, "#2e86de"],
          [0.2, -0.038, "#e84393"],
        ] as const)
          add(g, new THREE.CircleGeometry(0.018, 16), new THREE.MeshStandardMaterial({ color: c }), s * 0.1605, deckTop + y, z, 0, (s * Math.PI) / 2);
      break;
  }

  return {
    group: g,
    exhaust: v(0, deckTop + 0.02, REAR_Z - R - 0.05),
    jet: "#6fe6ff",
    update(dt, speed, steerInput = 0, driftDir = 0) {
      for (const s of spinners) s.rotation.x += (speed * dt) / R;
      // no drift a roda da frente contraesterça
      const target = driftDir !== 0 ? driftDir * 0.3 : -steerInput * 0.35;
      steer.rotation.y += (target - steer.rotation.y) * Math.min(1, dt * 12);
    },
    dispose() {
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
    },
  };
}
