import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { HAIR_COLORS, PANTS, SHIRTS, SKINS, type AvatarDNA } from "@ec/shared";

export interface AvatarRig {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  head: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
}

const HEIGHT_SCALE = [0.9, 1, 1.1];

function mat(color: string, rough = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true });
}

function box(w: number, h: number, d: number, m: THREE.Material, rounded = 0): THREE.Mesh {
  const g = rounded > 0 ? new RoundedBoxGeometry(w, h, d, 2, rounded) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  return mesh;
}

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

function limb(w: number, h: number, d: number, m: THREE.Material, endMat?: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(at(box(w, h, d, m, 0.04), 0, -h / 2, 0));
  if (endMat) g.add(at(box(w * 0.95, 0.13, d * 1.25, endMat, 0.03), 0, -h + 0.02, 0.02));
  return g;
}

function addHair(head: THREE.Group, style: number, m: THREE.Material): void {
  const top = 0.56;
  switch (style) {
    case 1:
      head.add(at(box(0.56, 0.14, 0.54, m, 0.05), 0, top - 0.02, -0.01));
      head.add(at(box(0.56, 0.3, 0.1, m, 0.04), 0, top - 0.16, -0.24));
      break;
    case 2:
      head.add(at(box(0.58, 0.16, 0.56, m, 0.06), 0, top - 0.01, -0.01));
      head.add(at(box(0.6, 0.42, 0.14, m, 0.05), 0, top - 0.24, -0.23));
      head.add(at(box(0.08, 0.3, 0.4, m, 0.03), -0.29, top - 0.17, -0.04));
      head.add(at(box(0.08, 0.3, 0.4, m, 0.03), 0.29, top - 0.17, -0.04));
      break;
    case 3:
      head.add(at(box(0.58, 0.16, 0.56, m, 0.06), 0, top - 0.01, -0.01));
      head.add(at(box(0.6, 0.85, 0.14, m, 0.05), 0, top - 0.42, -0.24));
      head.add(at(box(0.08, 0.6, 0.36, m, 0.03), -0.29, top - 0.3, -0.06));
      head.add(at(box(0.08, 0.6, 0.36, m, 0.03), 0.29, top - 0.3, -0.06));
      break;
    case 4:
      head.add(at(box(0.56, 0.13, 0.54, m, 0.05), 0, top - 0.02, -0.01));
      head.add(at(box(0.56, 0.3, 0.1, m, 0.04), 0, top - 0.16, -0.24));
      head.add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), m), 0, top + 0.07, -0.22));
      break;
    case 5:
      head.add(at(box(0.12, 0.2, 0.56, m, 0.04), 0, top + 0.06, -0.02));
      break;
    case 6:
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const r = i % 2 ? 0.2 : 0.12;
        head.add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), m), Math.cos(a) * r, top + 0.03, Math.sin(a) * r - 0.04));
      }
      head.add(at(box(0.58, 0.32, 0.12, m, 0.05), 0, top - 0.15, -0.24));
      break;
    default:
      break;
  }
}

/** Monta o boneco procedural a partir do "Crachá". Olha para +z. */
export function buildAvatar(dna: AvatarDNA): AvatarRig {
  const skin = mat(SKINS[dna.skin]);
  const shirt = mat(SHIRTS[dna.shirt]);
  const pants = mat(PANTS[dna.pants]);
  const hair = mat(HAIR_COLORS[dna.hairColor], 0.95);
  const dark = mat("#1d1b17", 0.6);
  const shoe = mat("#2a2622");
  const white = mat("#f7f5f0");
  const beard = mat(HAIR_COLORS[dna.beardColor] ?? HAIR_COLORS[dna.hairColor], 0.95);
  const materials = [skin, shirt, pants, hair, beard, dark, shoe, white];

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.scale.setScalar(HEIGHT_SCALE[dna.height] ?? 1);

  const legL = at(limb(0.19, 0.72, 0.22, pants, shoe), -0.13, 0.78, 0);
  const legR = at(limb(0.19, 0.72, 0.22, pants, shoe), 0.13, 0.78, 0);
  body.add(legL, legR);

  const torso = at(box(0.56, 0.62, 0.32, shirt, 0.06), 0, 1.08, 0);
  body.add(torso);
  body.add(at(box(0.58, 0.08, 0.34, pants, 0.02), 0, 0.8, 0));

  const armL = at(limb(0.15, 0.58, 0.17, shirt, skin), -0.36, 1.36, 0);
  const armR = at(limb(0.15, 0.58, 0.17, shirt, skin), 0.36, 1.36, 0);
  body.add(armL, armR);

  const head = at(new THREE.Group(), 0, 1.44, 0);
  body.add(head);
  head.add(at(box(0.12, 0.1, 0.12, skin), 0, 0.03, 0));
  head.add(at(box(0.52, 0.5, 0.48, skin, 0.08), 0, 0.31, 0));
  head.add(at(box(0.07, 0.08, 0.02, dark), -0.11, 0.33, 0.245));
  head.add(at(box(0.07, 0.08, 0.02, dark), 0.11, 0.33, 0.245));
  head.add(at(box(0.1, 0.025, 0.02, hair), -0.11, 0.41, 0.245));
  head.add(at(box(0.1, 0.025, 0.02, hair), 0.11, 0.41, 0.245));
  head.add(at(box(0.14, 0.03, 0.02, mat("#8a3b2e")), 0, 0.19, 0.245));
  addHair(head, dna.hair, hair);

  if (dna.beard) {
    head.add(at(box(0.5, 0.16, 0.08, beard, 0.03), 0, 0.12, 0.22));
    head.add(at(box(0.08, 0.2, 0.36, beard, 0.02), -0.25, 0.17, 0.06));
    head.add(at(box(0.08, 0.2, 0.36, beard, 0.02), 0.25, 0.17, 0.06));
  }
  if (dna.glasses > 0) {
    const frame = mat(dna.glasses === 1 ? "#6b4226" : "#151515", 0.4);
    for (const x of [-0.11, 0.11]) {
      if (dna.glasses === 1) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.014, 6, 12), frame);
        head.add(at(ring, x, 0.33, 0.255));
      } else {
        head.add(at(box(0.15, 0.025, 0.02, frame), x, 0.385, 0.255));
        head.add(at(box(0.15, 0.025, 0.02, frame), x, 0.275, 0.255));
        head.add(at(box(0.02, 0.11, 0.02, frame), x - 0.075, 0.33, 0.255));
        head.add(at(box(0.02, 0.11, 0.02, frame), x + 0.075, 0.33, 0.255));
      }
    }
    head.add(at(box(0.06, 0.02, 0.02, frame), 0, 0.34, 0.255));
  }

  switch (dna.accessory) {
    case 1: {
      const band = mat("#2b2b2b", 0.5);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 16, Math.PI), band);
      head.add(at(arc, 0, 0.36, 0));
      arc.rotation.y = Math.PI / 2;
      arc.rotation.z = Math.PI / 2;
      arc.rotation.x = 0;
      const cupL = at(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 10), mat("#e2483c")), -0.29, 0.31, 0);
      const cupR = at(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 10), mat("#e2483c")), 0.29, 0.31, 0);
      cupL.rotation.z = Math.PI / 2;
      cupR.rotation.z = Math.PI / 2;
      head.add(cupL, cupR);
      break;
    }
    case 2: {
      const cap = mat(SHIRTS[(dna.shirt + 3) % SHIRTS.length]);
      head.add(at(box(0.56, 0.16, 0.54, cap, 0.06), 0, 0.6, -0.01));
      head.add(at(box(0.5, 0.04, 0.24, cap, 0.02), 0, 0.53, 0.33));
      break;
    }
    case 3:
      torso.add(at(box(0.09, 0.42, 0.03, mat("#b8242c")), 0, -0.04, 0.17));
      torso.add(at(box(0.13, 0.08, 0.035, mat("#b8242c")), 0, 0.2, 0.17));
      break;
    case 4:
      torso.add(at(box(0.16, 0.2, 0.02, white), 0.12, 0.02, 0.17));
      torso.add(at(box(0.16, 0.05, 0.022, mat("#2f6fdf")), 0.12, 0.09, 0.172));
      torso.add(at(box(0.02, 0.22, 0.02, mat("#2f6fdf")), 0.06, 0.2, 0.165));
      torso.add(at(box(0.02, 0.22, 0.02, mat("#2f6fdf")), 0.18, 0.2, 0.165));
      break;
    default:
      break;
  }

  return { root, body, legL, legR, armL, armR, head, materials };
}

/** Animação procedural: passo, balanço e braço de mira. */
export function animateAvatar(rig: AvatarRig, speed01: number, t: number, aiming: boolean): void {
  const swing = Math.sin(t * 11) * 0.65 * speed01;
  rig.legL.rotation.x = swing;
  rig.legR.rotation.x = -swing;
  rig.armL.rotation.x = -swing * 0.8;
  rig.armR.rotation.x = aiming ? -1.45 : swing * 0.8;
  rig.body.position.y = Math.abs(Math.sin(t * 11)) * 0.05 * speed01;
  rig.head.rotation.z = Math.sin(t * 2.1) * 0.03;
}

export function disposeAvatar(rig: AvatarRig): void {
  rig.root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
  for (const m of rig.materials) m.dispose();
}
