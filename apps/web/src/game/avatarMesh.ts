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
  eyeL?: THREE.Mesh;
  eyeR?: THREE.Mesh;
  browL?: THREE.Mesh;
  browR?: THREE.Mesh;
  mouth?: THREE.Mesh;
  // Articulações dinâmicas de vento secundário
  tiePivot?: THREE.Group;
  badgePivot?: THREE.Group;
  hairPivot?: THREE.Group;
  hairPonytail?: THREE.Object3D;
  beardPivot?: THREE.Group;
  capVisor?: THREE.Mesh;
  materials: THREE.MeshStandardMaterial[];
}

export interface AvatarWindState {
  tieRotX: number;
  tieRotZ: number;
  badgeRotX: number;
  badgeRotZ: number;
  badgeBounceY: number;
  hairRotX: number;
  hairRotZ: number;
  beardRotX: number;
  capLift: number;
}

export interface EmotionWeights {
  adrenaline: number;
  panic: number;
  victory: number;
  yawn: number;
}

const HEIGHT_SCALE = [0.9, 1, 1.1];

function mat(color: string, rough = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true });
}

export function box(w: number, h: number, d: number, m: THREE.Material, rounded = 0): THREE.Mesh {
  const g = rounded > 0 ? new RoundedBoxGeometry(w, h, d, 2, rounded) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  return mesh;
}

export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

function limb(w: number, h: number, d: number, m: THREE.Material, endMat?: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(at(box(w, h, d, m, 0.04), 0, -h / 2, 0));
  if (endMat) g.add(at(box(w * 0.95, 0.13, d * 1.25, endMat, 0.03), 0, -h + 0.02, 0.02));
  return g;
}

interface HairPivots {
  hairPivot?: THREE.Group;
  hairPonytail?: THREE.Object3D;
}

function addHair(head: THREE.Group, style: number, m: THREE.Material): HairPivots {
  const top = 0.56;
  const pivots: HairPivots = {};
  switch (style) {
    case 1:
      head.add(at(box(0.56, 0.14, 0.54, m, 0.05), 0, top - 0.02, -0.01));
      head.add(at(box(0.56, 0.3, 0.1, m, 0.04), 0, top - 0.16, -0.24));
      break;
    case 2:
      head.add(at(box(0.58, 0.16, 0.56, m, 0.06), 0, top - 0.01, -0.01));
      {
        const hp = new THREE.Group();
        hp.name = "Cabelo_Pivo";
        hp.position.set(0, top - 0.01, -0.16);
        hp.add(at(box(0.6, 0.42, 0.14, m, 0.05), 0, -0.23, -0.07));
        head.add(hp);
        pivots.hairPivot = hp;
      }
      head.add(at(box(0.08, 0.3, 0.4, m, 0.03), -0.29, top - 0.17, -0.04));
      head.add(at(box(0.08, 0.3, 0.4, m, 0.03), 0.29, top - 0.17, -0.04));
      break;
    case 3:
      head.add(at(box(0.58, 0.16, 0.56, m, 0.06), 0, top - 0.01, -0.01));
      {
        const hp = new THREE.Group();
        hp.name = "Cabelo_Pivo";
        hp.position.set(0, top - 0.01, -0.17);
        hp.add(at(box(0.6, 0.85, 0.14, m, 0.05), 0, -0.41, -0.07));
        head.add(hp);
        pivots.hairPivot = hp;
      }
      head.add(at(box(0.08, 0.6, 0.36, m, 0.03), -0.29, top - 0.3, -0.06));
      head.add(at(box(0.08, 0.6, 0.36, m, 0.03), 0.29, top - 0.3, -0.06));
      break;
    case 4:
      head.add(at(box(0.56, 0.13, 0.54, m, 0.05), 0, top - 0.02, -0.01));
      head.add(at(box(0.56, 0.3, 0.1, m, 0.04), 0, top - 0.16, -0.24));
      {
        const hp = new THREE.Group();
        hp.name = "Coque_Pivo";
        hp.position.set(0, top + 0.07, -0.22);
        hp.add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), m), 0, 0, 0));
        head.add(hp);
        pivots.hairPonytail = hp;
      }
      break;
    case 5:
      {
        const hp = new THREE.Group();
        hp.name = "Moicano_Pivo";
        hp.position.set(0, top - 0.04, -0.02);
        hp.add(at(box(0.12, 0.2, 0.56, m, 0.04), 0, 0.10, 0));
        head.add(hp);
        pivots.hairPivot = hp;
      }
      break;
    case 6:
      {
        const hp = new THREE.Group();
        hp.name = "Afro_Pivo";
        hp.position.set(0, top, 0);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const r = i % 2 ? 0.2 : 0.12;
          hp.add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), m), Math.cos(a) * r, 0.03, Math.sin(a) * r - 0.04));
        }
        hp.add(at(box(0.58, 0.32, 0.12, m, 0.05), 0, -0.15, -0.24));
        head.add(hp);
        pivots.hairPivot = hp;
      }
      break;
    default:
      break;
  }
  return pivots;
}

/** Monta o boneco procedural a partir do "Crachá". Olha para +z. */
export function buildAvatar(dna: AvatarDNA): AvatarRig {
  const skin = mat(SKINS[dna.skin]);
  // shirt e pants também indexam as pastas de peças, que podem passar do tamanho da paleta
  const shirt = mat(SHIRTS[dna.shirt % SHIRTS.length]);
  const pants = mat(PANTS[dna.pants % PANTS.length]);
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
  head.name = "Cabeca";
  body.add(head);
  head.add(at(box(0.12, 0.1, 0.12, skin), 0, 0.03, 0));
  head.add(at(box(0.52, 0.5, 0.48, skin, 0.08), 0, 0.31, 0));

  const eyeL = at(box(0.07, 0.08, 0.02, dark), -0.11, 0.33, 0.245);
  eyeL.name = "Olho_E";
  head.add(eyeL);

  const eyeR = at(box(0.07, 0.08, 0.02, dark), 0.11, 0.33, 0.245);
  eyeR.name = "Olho_D";
  head.add(eyeR);

  const browL = at(box(0.1, 0.025, 0.02, hair), -0.11, 0.41, 0.245);
  browL.name = "Sobrancelha_E";
  head.add(browL);

  const browR = at(box(0.1, 0.025, 0.02, hair), 0.11, 0.41, 0.245);
  browR.name = "Sobrancelha_D";
  head.add(browR);

  const mouth = at(box(0.14, 0.03, 0.02, mat("#8a3b2e")), 0, 0.19, 0.245);
  mouth.name = "Boca";
  head.add(mouth);

  const hairPivots = addHair(head, dna.hair, hair);

  let beardPivot: THREE.Group | undefined;
  if (dna.beard) {
    beardPivot = new THREE.Group();
    beardPivot.name = "Barba_Pivo";
    beardPivot.position.set(0, 0.2, 0.22);
    const chin = at(box(0.5, 0.16, 0.08, beard, 0.03), 0, -0.08, 0);
    beardPivot.add(chin);
    head.add(beardPivot);
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

  let tiePivot: THREE.Group | undefined;
  let badgePivot: THREE.Group | undefined;
  let capVisor: THREE.Mesh | undefined;

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
      capVisor = at(box(0.5, 0.04, 0.24, cap, 0.02), 0, 0.53, 0.33);
      capVisor.name = "Bone_Aba";
      head.add(capVisor);
      break;
    }
    case 3: {
      // Nó da gravata na gola
      torso.add(at(box(0.13, 0.08, 0.035, mat("#b8242c")), 0, 0.2, 0.17));
      // Lâmina suspensa com pivô dinâmico de vento
      tiePivot = new THREE.Group();
      tiePivot.name = "Gravata_Pivo";
      tiePivot.position.set(0, 0.2, 0.17);
      const blade = at(box(0.09, 0.42, 0.03, mat("#b8242c")), 0, -0.24, 0);
      tiePivot.add(blade);
      torso.add(tiePivot);
      break;
    }
    case 4: {
      const cordMat = mat("#2f6fdf");
      torso.add(at(box(0.02, 0.22, 0.02, cordMat), 0.06, 0.2, 0.165));
      torso.add(at(box(0.02, 0.22, 0.02, cordMat), 0.18, 0.2, 0.165));

      badgePivot = new THREE.Group();
      badgePivot.name = "Cracha_Pivo";
      badgePivot.position.set(0.12, 0.09, 0.17);
      const clip = at(box(0.16, 0.05, 0.022, cordMat), 0, 0, 0.002);
      const card = at(box(0.16, 0.2, 0.02, white), 0, -0.07, 0);
      badgePivot.add(clip, card);
      torso.add(badgePivot);
      break;
    }
    default:
      break;
  }

  return {
    root,
    body,
    legL,
    legR,
    armL,
    armR,
    head,
    eyeL,
    eyeR,
    browL,
    browR,
    mouth,
    tiePivot,
    badgePivot,
    hairPivot: hairPivots.hairPivot,
    hairPonytail: hairPivots.hairPonytail,
    beardPivot,
    capVisor,
    materials,
  };
}

/** Aplica os pesos das expressões e estados emocionais no rig procedural (zero allocations). */
export function applyAvatarEmotion(
  rig: AvatarRig,
  weights: EmotionWeights,
  panicArmTimer: number,
  time: number,
  stareWeight = 0,
): void {
  const { adrenaline, panic, victory, yawn } = weights;

  // 1. Sobrancelhas (Brows)
  const browL = rig.browL ?? (rig.head.getObjectByName("Sobrancelha_E") as THREE.Mesh | undefined);
  const browR = rig.browR ?? (rig.head.getObjectByName("Sobrancelha_D") as THREE.Mesh | undefined);

  if (browL) {
    let rotZ = -0.26 * stareWeight;
    let posY = 0.41 - 0.015 * stareWeight;

    // Adrenalina: inclinadas para baixo em determinação agressiva (V-shape)
    rotZ += -0.32 * adrenaline;
    posY += -0.02 * adrenaline;

    // Pânico: sobrancelhas levantadas e invertidas (centro alto)
    rotZ += 0.28 * panic;
    posY += 0.035 * panic;

    // Vitória: sobrancelha esquerda arqueada com deboche
    rotZ += 0.15 * victory;
    posY += 0.03 * victory;

    // Bocejo: sobrancelhas caídas e relaxadas
    rotZ += 0.05 * yawn;
    posY += -0.018 * yawn;

    browL.rotation.z = rotZ;
    browL.position.y = posY;
  }

  if (browR) {
    let rotZ = 0.26 * stareWeight;
    let posY = 0.41 - 0.015 * stareWeight;

    // Adrenalina: inclinada para baixo
    rotZ += 0.32 * adrenaline;
    posY += -0.02 * adrenaline;

    // Pânico: sobrancelha levantada
    rotZ += -0.28 * panic;
    posY += 0.035 * panic;

    // Vitória: sobrancelha direita abaixada no piscar de olho
    rotZ += 0.18 * victory;
    posY += -0.015 * victory;

    // Bocejo
    rotZ += -0.05 * yawn;
    posY += -0.018 * yawn;

    browR.rotation.z = rotZ;
    browR.position.y = posY;
  }

  // 2. Olhos (Eyes)
  const eyeL = rig.eyeL ?? (rig.head.getObjectByName("Olho_E") as THREE.Mesh | undefined);
  const eyeR = rig.eyeR ?? (rig.head.getObjectByName("Olho_D") as THREE.Mesh | undefined);

  if (eyeL) {
    let scaleX = 1.0;
    let scaleY = 1.0;
    let posZ = 0.245;

    // Adrenalina: foco
    scaleY -= 0.2 * adrenaline;

    // Pânico: olhos arregalados cartoon
    scaleX += 0.45 * panic;
    scaleY += 0.55 * panic;
    posZ += 0.015 * panic;

    // Vitória: olho esquerdo aberto e confiante
    scaleX += 0.1 * victory;
    scaleY += 0.05 * victory;

    // Bocejo: pálpebra caída
    scaleY -= 0.65 * yawn;

    eyeL.scale.set(scaleX, scaleY, 1.0);
    eyeL.position.z = posZ;
  }

  if (eyeR) {
    let scaleX = 1.0;
    let scaleY = 1.0;
    let posZ = 0.245;

    // Adrenalina: foco
    scaleY -= 0.2 * adrenaline;

    // Pânico: olhos arregalados cartoon
    scaleX += 0.45 * panic;
    scaleY += 0.55 * panic;
    posZ += 0.015 * panic;

    // Vitória: piscadela (olho direito espremido fechado!)
    scaleY -= 0.88 * victory;

    // Bocejo: pálpebra caída
    scaleY -= 0.65 * yawn;

    eyeR.scale.set(scaleX, scaleY, 1.0);
    eyeR.position.z = posZ;
  }

  // 3. Boca (Mouth)
  const mouth = rig.mouth ?? (rig.head.getObjectByName("Boca") as THREE.Mesh | undefined);
  if (mouth) {
    let scaleX = 1.0;
    let scaleY = 1.0;
    let posX = 0;
    let posY = 0.19;
    let rotZ = 0;

    // Adrenalina: dentes cerrados / grito de esforço (larga e achatada)
    scaleX += 0.38 * adrenaline;
    scaleY -= 0.45 * adrenaline;

    // Pânico: boca aberta em 'O' de susto
    scaleX -= 0.32 * panic;
    scaleY += 1.85 * panic;
    posY -= 0.03 * panic;

    // Vitória: sorriso de canto / deboche
    scaleX += 0.22 * victory;
    scaleY += 0.18 * victory;
    rotZ += 0.22 * victory;
    posX += 0.02 * victory;
    posY += 0.012 * victory;

    // Bocejo: boca abre em bocejo preguiçoso
    scaleX += 0.45 * yawn;
    scaleY += 2.1 * yawn;
    posY -= 0.038 * yawn;

    mouth.scale.set(scaleX, scaleY, 1.0);
    mouth.position.set(posX, posY, 0.245);
    mouth.rotation.z = rotZ;
  }
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

/** Aplica a física secundária do vento e inércia em gravata, crachá, cabelos e barba (zero GC). */
export function applyAvatarWindPhysics(rig: AvatarRig, wind: AvatarWindState): void {
  // 1. Gravata (Articulação do nó até a lâmina)
  if (rig.tiePivot) {
    rig.tiePivot.rotation.x = wind.tieRotX;
    rig.tiePivot.rotation.z = wind.tieRotZ;
  }

  // 2. Crachá (Balanço do cordão e pulo contra o tórax)
  if (rig.badgePivot) {
    rig.badgePivot.rotation.x = wind.badgeRotX;
    rig.badgePivot.rotation.z = wind.badgeRotZ;
    rig.badgePivot.position.y = 0.09 + wind.badgeBounceY;
  }

  // 3. Cabelos (Mechas e coque/ponytail)
  if (rig.hairPivot) {
    rig.hairPivot.rotation.x = wind.hairRotX;
    rig.hairPivot.rotation.z = wind.hairRotZ;
  }
  if (rig.hairPonytail) {
    rig.hairPonytail.rotation.x = wind.hairRotX * 1.32;
    rig.hairPonytail.rotation.z = wind.hairRotZ * 0.78;
  }

  // 4. Barba no queixo
  if (rig.beardPivot) {
    rig.beardPivot.rotation.x = wind.beardRotX;
  }

  // 5. Aba do boné
  if (rig.capVisor) {
    rig.capVisor.position.y = 0.53 + wind.capLift;
  }
}
