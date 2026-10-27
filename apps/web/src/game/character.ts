import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HAIR_COLORS, PANTS, SHIRTS, SKINS, type AvatarDNA } from "@ec/shared";
import { animateAvatar, buildAvatar, disposeAvatar } from "./avatarMesh";

export type CharacterAction = "throw" | "cafe" | "dash";

/** Boneco renderizado: GLB do romulo-h quando carregado, boneco procedural enquanto isso. */
export interface Character {
  root: THREE.Group;
  update(dt: number, speed01: number): void;
  play(action: CharacterAction): void;
  dispose(): void;
}

const MODEL_URL = "/assets/characters/boneco.glb";
const TARGET_HEIGHT = 1.75;
const HEIGHT_SCALE = [0.9, 1, 1.1];
/** Duração em segundos de cada ação no jogo (os clipes originais são mais longos). */
const ACTION_SECONDS: Record<CharacterAction, number> = { throw: 0.45, cafe: 0.7, dash: 0.3 };
const CLIP_OF: Record<CharacterAction, string> = { throw: "Jogar_Bolinha", cafe: "Jogar_Cafe", dash: "Dash" };
/** Trecho útil de cada clipe em segundos: o Jogar_Bolinha tem 3 s, mas o arremesso acontece até 0,9 s. */
const CLIP_RANGE: Record<CharacterAction, [number, number]> = { throw: [0, 0.9], cafe: [0, 1.5], dash: [0, 1.1] };
const FPS = 30;

interface Loaded {
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
  scale: number;
}

let loaded: Loaded | null = null;
let loading: Promise<boolean> | null = null;

/**
 * Remove trilhas que brigam com o jogo: deslocamento do corpo (a posição vem do servidor)
 * e a bolinha que voa sozinha (o projétil de verdade já é desenhado).
 */
function cleanClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const c = clip.clone();
  c.tracks = c.tracks.filter((t) => !t.name.startsWith("Boneco.position") && !t.name.startsWith("Bolinha_Voo."));
  return c;
}

export function modelReady(): boolean {
  return loaded !== null;
}

/** Carrega o GLB uma vez. Resolve false se falhar (o jogo segue com o boneco procedural). */
export function preloadCharacter(): Promise<boolean> {
  loading ??= new GLTFLoader()
    .loadAsync(MODEL_URL)
    .then((gltf) => {
      const scene = gltf.scene;
      scene.getObjectByName("Pedestal")?.removeFromParent();
      const body = scene.getObjectByName("Boneco")!;
      const h = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3()).y;
      loaded = {
        scene,
        clips: new Map(gltf.animations.map((a) => [a.name, cleanClip(a)])),
        scale: TARGET_HEIGHT / h,
      };
      return true;
    })
    .catch((err) => {
      console.warn("boneco.glb não carregou, usando boneco procedural", err);
      return false;
    });
  return loading;
}

function shade(hex: string, k: number): THREE.Color {
  const c = new THREE.Color(hex);
  return k >= 0 ? c.lerp(new THREE.Color("#ffffff"), k) : c.multiplyScalar(1 + k);
}

/** Cores do crachá aplicadas pelos nomes dos materiais do GLB. */
function paletteFor(dna: AvatarDNA): Record<string, THREE.Color> {
  const hair = HAIR_COLORS[dna.hairColor];
  const cap = SHIRTS[(dna.shirt + 3) % SHIRTS.length];
  return {
    Pele: new THREE.Color(SKINS[dna.skin]),
    Camiseta: new THREE.Color(SHIRTS[dna.shirt]),
    Jeans: new THREE.Color(PANTS[dna.pants]),
    Cabelo: new THREE.Color(hair),
    Cabelo_Degrade: shade(hair, -0.25),
    Cabelo_Claro: shade(hair, 0.12),
    Bone_Vermelho: new THREE.Color(cap),
    Bone_Azul: shade(cap, -0.45),
  };
}

function addGlasses(head: THREE.Object3D, kind: number, mats: THREE.Material[]): void {
  if (kind === 0) return;
  const frame = new THREE.MeshStandardMaterial({ color: kind === 1 ? "#6b4226" : "#151515", roughness: 0.4 });
  mats.push(frame);
  for (const x of [-0.18, 0.18]) {
    const lens =
      kind === 1
        ? new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 16), frame)
        : new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 4, 4, Math.PI * 2), frame);
    if (kind === 2) lens.rotation.z = Math.PI / 4;
    lens.position.set(x, 0.04, 0.6);
    lens.userData.extra = true;
    head.add(lens);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.025), frame);
  bridge.position.set(0, 0.06, 0.6);
  bridge.userData.extra = true;
  head.add(bridge);
}

/** Peça extra presa a uma parte do GLB; a geometria é deste boneco e é liberada no dispose. */
function extra(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale?: [number, number, number]): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  m.userData.extra = true;
  parent.add(m);
  return m;
}

/** Raio da cabeça do GLB (Rosto), em unidades do modelo. */
const HEAD_R = 0.56;

/** Frente do rosto no ângulo phi da SphereGeometry (x = -cos phi, z = sin phi). */
const FRONT = Math.PI / 2;

/**
 * Casca esférica que acompanha a cabeça, como o cabelo curto do modelo.
 * theta 0 = topo; gap = abertura na frente para o rosto (rad).
 */
function shell(head: THREE.Object3D, mat: THREE.Material, r: number, theta0: number, theta1: number, gap = 0): THREE.Mesh {
  const geo = new THREE.SphereGeometry(r, 36, 24, FRONT + gap / 2, Math.PI * 2 - gap, theta0, theta1 - theta0);
  return extra(head, geo, mat, [0, 0, 0]);
}

/** Penteados além do "Curto" do modelo, montados sobre a cabeça. Índices de HAIR_STYLES. */
function addHair(head: THREE.Object3D, style: number, mat: THREE.Material): void {
  const R = HEAD_R + 0.04;
  switch (style) {
    case 2: // médio: chanel até a altura do queixo
      shell(head, mat, R, 0, 1.05);
      shell(head, mat, R, 1.0, 1.95, 1.7);
      break;
    case 3: // longo: cai pelas costas até os ombros
      shell(head, mat, R, 0, 1.05);
      shell(head, mat, R, 1.0, 2.25, 1.7);
      extra(head, new THREE.CapsuleGeometry(0.4, 0.45, 6, 16), mat, [0, -0.58, -0.3], [1, 1, 0.42]);
      for (const x of [-0.46, 0.46]) extra(head, new THREE.CapsuleGeometry(0.12, 0.35, 6, 12), mat, [x, -0.5, -0.05]);
      break;
    case 4: // coque no alto da nuca
      shell(head, mat, R - 0.01, 0, 1.25);
      shell(head, mat, R - 0.01, 1.2, 1.75, 2.2);
      extra(head, new THREE.SphereGeometry(0.21, 20, 14), mat, [0, 0.4, -0.5]);
      extra(head, new THREE.TorusGeometry(0.15, 0.035, 8, 20), mat, [0, 0.31, -0.43]).rotation.x = 0.9;
      break;
    case 5: // moicano: crista lisa da testa até a nuca
      for (let i = 0; i <= 10; i++) {
        const a = 0.55 - (i / 10) * 2.1;
        const d = R + 0.06;
        const lobe = extra(head, new THREE.SphereGeometry(1, 14, 10), mat, [0, Math.cos(a) * d, Math.sin(a) * d], [0.075, 0.2 - Math.abs(i - 4) * 0.012, 0.15]);
        lobe.rotation.x = a;
      }
      break;
    case 6: { // cacheado: volume arredondado com cachos na superfície
      const puff = shell(head, mat, R + 0.1, 0, 2.0, 1.5);
      puff.position.y = 0.06;
      for (let i = 0; i < 48; i++) {
        const theta = Math.acos(1 - ((i + 0.5) / 48) * 1.4);
        const phi = i * 2.39996;
        const rel = (((phi - FRONT) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (theta > 0.9 && (rel < 0.75 || rel > Math.PI * 2 - 0.75)) continue;
        const r = R + 0.13;
        extra(head, new THREE.IcosahedronGeometry(0.12, 1), mat, [-Math.cos(phi) * Math.sin(theta) * r, Math.cos(theta) * r + 0.06, Math.sin(phi) * Math.sin(theta) * r]);
      }
      break;
    }
    default:
      break;
  }
}

/** Barba: volume no queixo abaixo da boca, bigode e costeletas que encontram o cabelo. */
function addBeard(head: THREE.Object3D, mat: THREE.Material): void {
  extra(head, new THREE.SphereGeometry(1, 28, 18), mat, [0, -0.34, 0.26], [0.47, 0.2, 0.32]);
  const R = HEAD_R + 0.025;
  for (const side of [-1, 1]) {
    const geo = new THREE.SphereGeometry(R, 12, 12, FRONT + side * 1.1 - (side > 0 ? 0 : 0.28), 0.28, 1.2, 0.9);
    extra(head, geo, mat, [0, 0, 0]);
    const half = extra(head, new THREE.CapsuleGeometry(0.035, 0.13, 4, 10), mat, [side * 0.08, -0.09, 0.545]);
    half.rotation.z = side * (Math.PI / 2 - 0.3);
  }
}

/** Acessórios do crachá (o boné é o do próprio GLB). Índices de ACCESSORIES. */
function addAccessory(head: THREE.Object3D, body: THREE.Object3D, kind: number, mats: THREE.Material[]): void {
  const mk = (color: string) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    mats.push(m);
    return m;
  };
  if (kind === 1) {
    const band = mk("#2b2b2b");
    const red = mk("#e2483c");
    extra(head, new THREE.TorusGeometry(HEAD_R + 0.07, 0.05, 6, 20, Math.PI), band, [0, 0, 0]);
    for (const x of [-1, 1]) {
      const cup = extra(head, new THREE.CylinderGeometry(0.19, 0.19, 0.14, 14), red, [x * (HEAD_R + 0.05), 0, 0]);
      cup.rotation.z = Math.PI / 2;
    }
  } else if (kind === 3) {
    const tie = mk("#b8242c");
    extra(body, new THREE.BoxGeometry(0.15, 0.1, 0.06), tie, [0, 1.47, 0.27]);
    const blade = extra(body, new THREE.BoxGeometry(0.13, 0.5, 0.04), tie, [0, 1.2, 0.33]);
    blade.rotation.x = -0.12;
  } else if (kind === 4) {
    const white = mk("#f7f5f0");
    const blue = mk("#2f6fdf");
    extra(body, new THREE.BoxGeometry(0.28, 0.36, 0.03), white, [0.17, 1.2, 0.34]);
    extra(body, new THREE.BoxGeometry(0.28, 0.09, 0.035), blue, [0.17, 1.34, 0.345]);
    for (const x of [0.08, 0.26]) {
      const strap = extra(body, new THREE.BoxGeometry(0.03, 0.35, 0.03), blue, [x, 1.5, 0.26]);
      strap.rotation.x = 0.35;
    }
  }
}

function glbCharacter(dna: AvatarDNA, model: Loaded): Character {
  const root = new THREE.Group();
  const inner = model.scene.clone(true);
  inner.scale.setScalar(model.scale * (HEIGHT_SCALE[dna.height] ?? 1));
  root.add(inner);

  const palette = paletteFor(dna);
  const mats: THREE.Material[] = [];
  inner.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    const src = mesh.material as THREE.MeshStandardMaterial;
    const m = src.clone();
    const color = palette[src.name];
    if (color) m.color.copy(color);
    // mechas do modelo são brilhantes e viram um reflexo cinza em cabelo recolorido
    if (src.name.startsWith("Cabelo")) m.roughness = 0.9;
    mesh.material = m;
    mats.push(m);
  });

  const head = inner.getObjectByName("Cabeca");
  const body = inner.getObjectByName("Boneco");
  // careca e moicano dispensam o cabelo curto do modelo
  const baseHair = dna.hair !== 0 && dna.hair !== 5;
  for (const n of ["Cabelo_Curto", "Mecha_1", "Mecha_2", "Mecha_3"]) {
    const o = inner.getObjectByName(n);
    if (o) o.visible = baseHair;
  }
  const cap = inner.getObjectByName("Bone");
  if (cap) cap.visible = dna.accessory === 2;
  const hairMat = new THREE.MeshStandardMaterial({ color: palette.Cabelo, roughness: 0.9 });
  mats.push(hairMat);
  if (head) {
    addHair(head, dna.hair, hairMat);
    if (dna.beard) addBeard(head, hairMat);
    addGlasses(head, dna.glasses, mats);
  }
  if (head && body) addAccessory(head, body, dna.accessory, mats);

  const mixer = new THREE.AnimationMixer(inner);
  const walkClip = model.clips.get("Andar");
  const walk = walkClip ? mixer.clipAction(walkClip) : null;
  walk?.play();
  const actions = new Map<CharacterAction, THREE.AnimationAction>();
  for (const k of Object.keys(CLIP_OF) as CharacterAction[]) {
    const full = model.clips.get(CLIP_OF[k]);
    if (!full) continue;
    const [from, to] = CLIP_RANGE[k];
    const clip = THREE.AnimationUtils.subclip(full, `${full.name}_jogo`, from * FPS, Math.min(to, full.duration) * FPS, FPS);
    const a = mixer.clipAction(clip);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = false;
    a.timeScale = clip.duration / ACTION_SECONDS[k];
    actions.set(k, a);
  }

  return {
    root,
    update(dt, speed01) {
      const busy = [...actions.values()].some((a) => a.isRunning());
      if (walk) {
        walk.setEffectiveWeight(busy ? 0 : speed01);
        walk.timeScale = 0.6 + speed01 * 0.8;
      }
      mixer.update(dt);
    },
    play(action) {
      const a = actions.get(action);
      if (!a || (a.isRunning() && action !== "throw")) return;
      a.reset().play();
    },
    dispose() {
      // geometrias do GLB são compartilhadas entre clones; só as peças extras são deste boneco
      mixer.stopAllAction();
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.userData.extra) mesh.geometry.dispose();
      });
      for (const m of mats) m.dispose();
    },
  };
}

function proceduralCharacter(dna: AvatarDNA): Character {
  const rig = buildAvatar(dna);
  let t = 0;
  let aimUntil = 0;
  return {
    root: rig.root,
    update(dt, speed01) {
      t += dt * Math.max(0.05, speed01);
      aimUntil -= dt;
      animateAvatar(rig, speed01, t, aimUntil > 0);
    },
    play(action) {
      if (action === "throw") aimUntil = ACTION_SECONDS.throw;
    },
    dispose() {
      disposeAvatar(rig);
    },
  };
}

export function createCharacter(dna: AvatarDNA): Character {
  return loaded ? glbCharacter(dna, loaded) : proceduralCharacter(dna);
}

let thumbRenderer: THREE.WebGLRenderer | null = null;
const thumbCache = new Map<string, string>();

/** Miniatura do boneco (dataURL) usando um único renderer compartilhado. */
export function avatarThumbnail(dna: AvatarDNA, size = 160): string {
  const key = JSON.stringify({ ...dna, name: "" }) + size + (loaded ? "glb" : "");
  const hit = thumbCache.get(key);
  if (hit) return hit;
  if (!thumbRenderer) {
    thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  }
  thumbRenderer.setSize(size, size, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#9a8f80", 2.2));
  const sun = new THREE.DirectionalLight("#ffffff", 1.6);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  const char = createCharacter(dna);
  char.root.rotation.y = 0.35;
  scene.add(char.root);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  cam.position.set(0, 1.75, 3.1);
  cam.lookAt(0, 1.45, 0);
  thumbRenderer.render(scene, cam);
  const url = thumbRenderer.domElement.toDataURL("image/png");
  char.dispose();
  thumbCache.set(key, url);
  return url;
}
