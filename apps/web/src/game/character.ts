import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { HAIR_COLORS, type AvatarDNA, type ItemId } from "@ec/shared";
import { animateAvatar, applyAvatarEmotion, buildAvatar, disposeAvatar } from "./avatarMesh";
import { createGltfLoader } from "./gltfLoader";
import { dressFace } from "./rosto";
import { BEARDS_3D, HAIRS, PANTS_3D, SHIRTS_3D, SHOES_3D, type Wearable } from "./wearables";

export type CharacterAction = "throw" | "cafe" | "dash" | "tchau";

export type CharacterEmotion = "normal" | "adrenaline" | "panic" | "victory" | "yawn";

export interface CharacterSeatedOptions {
  driftLevel?: number;
  draft?: boolean;
  spinning?: boolean;
  countdown?: boolean;
  stoppedSeconds?: number;
}

/** Boneco renderizado: GLB do romulo-h quando carregado, boneco procedural enquanto isso. */
export interface Character {
  root: THREE.Group;
  update(dt: number, speed01: number): void;
  /** Atualização dinâmica na cadeira de corrida (inclinação do corpo, cabeça na curva, braços esterçando). */
  updateSeated?(
    dt: number,
    speed: number,
    steer: number,
    driftDir: number,
    boosting: boolean,
    rivalDir?: THREE.Vector3,
    options?: CharacterSeatedOptions,
  ): void;
  setEmotion?(state: CharacterEmotion, duration?: number): void;
  getEmotion?(): CharacterEmotion;
  play(action: CharacterAction): void;
  /** Executa um gesto animado ao usar um item/power-up na corrida de cadeiras. */
  playItemGesture?(item: ItemId): void;
  /**
   * Pose sentada (modo corrida): pernas para a frente e braços no apoio. Para as animações.
   * Devolve a altura da parte de baixo das coxas, para apoiá-las no assento.
   */
  sit(): number;
  /** Já sentado, gira os ombros até os pulsos alcançarem os pontos dados (coordenadas de root). */
  restHands(left: THREE.Vector3, right: THREE.Vector3): void;
  /** Já sentado, toca a comemoração e volta à pose sentada. Só o corpo: assento e confete ficam com a cadeira. */
  celebrate(): void;
  dispose(): void;
}

// Objetos matemáticos reutilizáveis pré-alocados para Zero GC no render/tick loop
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qArmTemp = new THREE.Quaternion();
const _eArmTemp = new THREE.Euler();

export class CharacterEmotionManager {
  current: CharacterEmotion = "normal";
  timer = 0;
  stoppedTimer = 0;
  panicArmTimer = 0;
  time = 0;

  // Pesos amortecidos para transição suave (harmônica / lerp)
  wAdrenaline = 0;
  wPanic = 0;
  wVictory = 0;
  wYawn = 0;

  setEmotion(state: CharacterEmotion, duration?: number): void {
    this.current = state;
    if (duration !== undefined && duration > 0) {
      this.timer = duration;
    } else {
      this.timer = 0;
    }
    if (state === "panic") {
      this.panicArmTimer = duration !== undefined ? Math.min(0.4, duration) : 0.4;
    }
  }

  getEmotion(): CharacterEmotion {
    return this.current;
  }

  update(dt: number, speed: number, options?: CharacterSeatedOptions, boosting = false): void {
    this.time += dt;

    if (this.panicArmTimer > 0) {
      this.panicArmTimer = Math.max(0, this.panicArmTimer - dt);
    }

    if (this.timer > 0) {
      this.timer = Math.max(0, this.timer - dt);
      if (this.timer === 0 && this.current !== "normal") {
        this.current = "normal";
      }
    } else {
      // Estado dinâmico do jogo
      if (Math.abs(speed) < 0.05) {
        this.stoppedTimer += dt;
      } else {
        this.stoppedTimer = 0;
      }

      if (options?.spinning) {
        this.current = "panic";
        this.panicArmTimer = 0.4;
      } else if (boosting || options?.draft || options?.driftLevel === 3) {
        this.current = "adrenaline";
      } else if (options?.countdown || this.stoppedTimer >= 3.0) {
        this.current = "yawn";
      } else {
        this.current = "normal";
      }
    }

    // Amortecimento harmônico suave / lerp contínuo
    const targetAdrenaline = this.current === "adrenaline" ? 1 : 0;
    const targetPanic = this.current === "panic" ? 1 : 0;
    const targetVictory = this.current === "victory" ? 1 : 0;
    const targetYawn = this.current === "yawn" ? 1 : 0;

    const k = Math.min(1, dt * 10);
    this.wAdrenaline += (targetAdrenaline - this.wAdrenaline) * k;
    this.wPanic += (targetPanic - this.wPanic) * k;
    this.wVictory += (targetVictory - this.wVictory) * k;
    this.wYawn += (targetYawn - this.wYawn) * k;
  }
}

interface GlbFaceParts {
  browD?: THREE.Object3D;
  browE?: THREE.Object3D;
  mouth?: THREE.Object3D;
  blinkHalfD?: THREE.Object3D;
  blinkFullD?: THREE.Object3D;
  blinkHalfE?: THREE.Object3D;
  blinkFullE?: THREE.Object3D;
  caraBrava?: THREE.Object3D;
}

interface GlbBaseTransforms {
  browD_pos: THREE.Vector3;
  browD_rot: THREE.Euler;
  browE_pos: THREE.Vector3;
  browE_rot: THREE.Euler;
  mouth_pos: THREE.Vector3;
  mouth_rot: THREE.Euler;
  mouth_scale: THREE.Vector3;
}

function applyGlbEmotion(
  face: GlbFaceParts,
  base: GlbBaseTransforms,
  weights: { wAdrenaline: number; wPanic: number; wVictory: number; wYawn: number },
  stareWeight = 0,
): void {
  const { wAdrenaline, wPanic, wVictory, wYawn } = weights;

  // 1. Sobrancelhas (Brows)
  if (face.browE) {
    let rotZ = base.browE_rot.z - 0.26 * stareWeight;
    let posY = base.browE_pos.y - 0.015 * stareWeight;

    rotZ += -0.32 * wAdrenaline;
    posY += -0.02 * wAdrenaline;

    rotZ += 0.28 * wPanic;
    posY += 0.035 * wPanic;

    rotZ += 0.15 * wVictory;
    posY += 0.03 * wVictory;

    rotZ += 0.05 * wYawn;
    posY += -0.018 * wYawn;

    face.browE.rotation.z = rotZ;
    face.browE.position.y = posY;
  }

  if (face.browD) {
    let rotZ = base.browD_rot.z + 0.26 * stareWeight;
    let posY = base.browD_pos.y - 0.015 * stareWeight;

    rotZ += 0.32 * wAdrenaline;
    posY += -0.02 * wAdrenaline;

    rotZ += -0.28 * wPanic;
    posY += 0.035 * wPanic;

    rotZ += 0.18 * wVictory;
    posY += -0.015 * wVictory;

    rotZ += -0.05 * wYawn;
    posY += -0.018 * wYawn;

    face.browD.rotation.z = rotZ;
    face.browD.position.y = posY;
  }

  // 2. Boca (Mouth)
  if (face.mouth) {
    let scaleX = base.mouth_scale.x;
    let scaleY = base.mouth_scale.y;
    let posX = base.mouth_pos.x;
    let posY = base.mouth_pos.y;
    let rotZ = base.mouth_rot.z;

    scaleX += base.mouth_scale.x * (0.38 * wAdrenaline - 0.32 * wPanic + 0.22 * wVictory + 0.45 * wYawn);
    scaleY += base.mouth_scale.y * (-0.45 * wAdrenaline + 1.85 * wPanic + 0.18 * wVictory + 2.1 * wYawn);
    posY += -0.03 * wPanic + 0.012 * wVictory - 0.038 * wYawn;
    posX += 0.02 * wVictory;
    rotZ += 0.22 * wVictory;

    face.mouth.scale.set(scaleX, scaleY, base.mouth_scale.z);
    face.mouth.position.set(posX, posY, base.mouth_pos.z);
    face.mouth.rotation.z = rotZ;
  }

  // 3. Olhos e Pálpebras
  // Piscadela no olho direito (Victory)
  if (face.blinkFullD) {
    face.blinkFullD.scale.setScalar(wVictory);
  } else if (face.blinkHalfD) {
    face.blinkHalfD.scale.setScalar(Math.max(wVictory, wYawn));
  }

  // Pálpebra esquerda (Yawn)
  if (face.blinkHalfE) {
    face.blinkHalfE.scale.setScalar(wYawn);
  }
  if (face.blinkHalfD && wVictory < 0.1) {
    face.blinkHalfD.scale.setScalar(wYawn);
  }

  // Cara brava (veia de esforço na adrenalina intensa)
  if (face.caraBrava) {
    face.caraBrava.scale.setScalar(wAdrenaline > 0.6 ? 1 : 0);
  }
}

/** Altura (no espaço do boneco) da parte mais baixa das peças, já na pose sentada. */
function bottomOf(root: THREE.Object3D, parts: (THREE.Object3D | undefined)[]): number {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  for (const p of parts) if (p) box.union(new THREE.Box3().setFromObject(p).applyMatrix4(inv));
  return box.isEmpty() ? 0 : box.min.y;
}

const MODEL_URL = "/assets/characters/boneco_completo.glb";
/** Comemoração na cadeira: só a animação e o confete, sem malha do boneco nem da cadeira. */
const CELEBRATE_URL = "/assets/characters/boneco_comemora.glb";
/** No arquivo da comemoração a figura está em escala 1,25: o pulinho dela é medido nessa escala. */
const CELEBRATE_FIGURE_SCALE = 1.25;
const TARGET_HEIGHT = 1.75;
const HEIGHT_SCALE = [0.9, 1, 1.1];
/** Duração em segundos de cada ação no jogo (os clipes originais são mais longos). */
const ACTION_SECONDS: Record<CharacterAction, number> = { throw: 0.45, cafe: 0.7, dash: 0.3, tchau: 3.2 };
const CLIP_OF: Record<CharacterAction, string> = { throw: "jogar_bolinha", cafe: "jogar_cafe", dash: "dash", tchau: "tchau" };
/** Trecho útil de cada clipe em segundos: o resto é a volta para a pose parada. */
const CLIP_RANGE: Record<CharacterAction, [number, number]> = { throw: [0, 0.9], cafe: [0, 1.5], dash: [0, 1.1], tchau: [0, 3.2] };
const FPS = 30;

interface Loaded {
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
  scale: number;
  /** Malhas de cada peça das pastas, na ordem de HAIRS, BEARDS_3D, SHIRTS_3D, PANTS_3D e SHOES_3D; vazio se o arquivo não serviu. */
  hairs: THREE.SkinnedMesh[][];
  beards: THREE.SkinnedMesh[][];
  shirts: THREE.SkinnedMesh[][];
  pants: THREE.SkinnedMesh[][];
  shoes: THREE.SkinnedMesh[][];
  celebration: Celebration | null;
}

/** Comemoração sentada, separada por quem a toca: o boneco, o assento da cadeira e o confete. */
export interface Celebration {
  body: THREE.AnimationClip;
  /** Giro do assento, já com o nome do nó da cadeira do jogo. */
  seat: THREE.AnimationClip | null;
  confetti: { scene: THREE.Object3D; clip: THREE.AnimationClip } | null;
}

function splitCelebration(clip: THREE.AnimationClip | undefined, file: THREE.Object3D, model: THREE.Object3D): Celebration | null {
  if (!clip) return null;
  const node = (t: THREE.KeyframeTrack) => t.name.slice(0, t.name.lastIndexOf("."));
  const body = clip.tracks
    // o arquivo anima nós que o boneco do jogo não tem (olho feliz)
    .filter((t) => !node(t).startsWith("confete") && node(t) !== "assento_giratorio" && model.getObjectByName(node(t)))
    .map((t) => {
      if (t.name !== "figura.position") return t;
      // só o pulinho: o boneco já está sentado no lugar certo da cadeira do jogo
      const d = t.clone();
      for (let i = 0; i < d.values.length; i++) d.values[i] = (t.values[i] - t.values[i % 3]) / CELEBRATE_FIGURE_SCALE;
      return d;
    });
  const seat = clip.tracks
    .filter((t) => node(t) === "assento_giratorio")
    .map((t) => {
      const s = t.clone();
      s.name = s.name.replace("assento_giratorio", "Assento_Giratorio");
      return s;
    });
  const confetti = file.getObjectByName("confete");
  const bits = clip.tracks.filter((t) => node(t).startsWith("confete_"));
  return {
    body: new THREE.AnimationClip("comemorar", clip.duration, body),
    seat: seat.length ? new THREE.AnimationClip("comemorar_assento", clip.duration, seat) : null,
    confetti: confetti && bits.length ? { scene: confetti, clip: new THREE.AnimationClip("comemorar_confete", clip.duration, bits) } : null,
  };
}

export function celebrationExtras(): Celebration | null {
  return loaded?.celebration ?? null;
}

/** Malhas da peça (cabelo, roupa, um tênis por pé): um GLB exportado do mesmo esqueleto do boneco. */
function loadWearable(loader: GLTFLoader, url: string): Promise<THREE.SkinnedMesh[]> {
  return loader
    .loadAsync(url)
    .then((gltf) => {
      const meshes: THREE.SkinnedMesh[] = [];
      gltf.scene.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
      });
      if (!meshes.length) console.warn(`${url}: peça sem malha com pele, ignorada`);
      return meshes;
    })
    .catch((err) => {
      console.warn(`${url}: peça não carregou`, err);
      return [];
    });
}

/** Cadeias de braço e perna. O boneco tem cotovelo, joelho e dedos no meio delas; peças antigas não. */
const LIMBS = ["D", "E"].flatMap((s) => [
  [`ombro_${s}`, `cotovelo_${s}`, `punho_${s}`, `dedos_${s}`, `dedos2_${s}`, `polegar_${s}`],
  [`perna_${s}`, `joelho_${s}`, `pe_${s}`],
]);
/** Quantos pontos do corpo emprestam peso a cada ponto da peça. */
const NEAREST = 4;

/** Ponto do corpo na pose de amarração, com o peso da cadeia repartido entre os ossos dela. */
interface LimbSample {
  pos: THREE.Vector3;
  share: Map<string, number>;
}

/** Pesos do vértice v por nome de osso. */
function weightsOf(mesh: THREE.SkinnedMesh, v: number): Map<string, number> {
  const idx = mesh.geometry.getAttribute("skinIndex");
  const wt = mesh.geometry.getAttribute("skinWeight");
  const out = new Map<string, number>();
  for (let k = 0; k < 4; k++) {
    const w = wt.getComponent(v, k);
    const name = mesh.skeleton.bones[idx.getComponent(v, k)]?.name;
    if (w > 0 && name) out.set(name, (out.get(name) ?? 0) + w);
  }
  return out;
}

/** Pontos do corpo de cada cadeia de LIMBS. */
function limbSamples(scene: THREE.Object3D): LimbSample[][] {
  const out = LIMBS.map((): LimbSample[] => []);
  scene.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const pos = mesh.geometry.getAttribute("position");
    for (let v = 0; v < pos.count; v++) {
      const weights = weightsOf(mesh, v);
      LIMBS.forEach((chain, c) => {
        const share = new Map([...weights].filter(([n]) => chain.includes(n)));
        const sum = [...share.values()].reduce((a, b) => a + b, 0);
        if (sum < 0.01) return;
        for (const [n, w] of share) share.set(n, w / sum);
        out[c].push({ pos: new THREE.Vector3().fromBufferAttribute(pos, v).applyMatrix4(mesh.bindMatrix), share });
      });
    }
  });
  return out;
}

/** Média dos NEAREST pontos mais próximos de p, pesada pelo inverso da distância. */
function nearestShare(samples: LimbSample[], p: THREE.Vector3): Map<string, number> {
  const best: [number, LimbSample][] = [];
  for (const s of samples) {
    const d = s.pos.distanceToSquared(p);
    if (best.length === NEAREST && d >= best[NEAREST - 1][0]) continue;
    best.push([d, s]);
    best.sort((a, b) => a[0] - b[0]);
    if (best.length > NEAREST) best.pop();
  }
  const out = new Map<string, number>();
  let total = 0;
  for (const [d, s] of best) {
    const k = 1 / (Math.sqrt(d) + 1e-4);
    total += k;
    for (const [n, w] of s.share) out.set(n, (out.get(n) ?? 0) + w * k);
  }
  for (const [n, w] of out) out.set(n, w / total);
  return out;
}

/**
 * Peça feita no esqueleto antigo (braço e perna de um osso só) passa a dobrar no cotovelo e no joelho:
 * o peso que ela põe numa cadeia que não tem inteira é repartido como no corpo, no mesmo ponto.
 */
function retargetWearable(src: THREE.SkinnedMesh, samples: LimbSample[][], body: THREE.Skeleton): void {
  const names = src.skeleton.bones.map((b) => b.name);
  const todo = LIMBS.map((chain, c) => samples[c].length > 0 && !chain.every((n) => names.includes(n)));
  if (!todo.some(Boolean)) return;
  const bones = [...names];
  const slot = (n: string) => (bones.includes(n) ? bones.indexOf(n) : bones.push(n) - 1);
  const pos = src.geometry.getAttribute("position");
  const skinIndex = new Uint16Array(pos.count * 4);
  const skinWeight = new Float32Array(pos.count * 4);
  const p = new THREE.Vector3();
  for (let v = 0; v < pos.count; v++) {
    const weights = weightsOf(src, v);
    p.fromBufferAttribute(pos, v).applyMatrix4(src.bindMatrix);
    LIMBS.forEach((chain, c) => {
      if (!todo[c]) return;
      let limb = 0;
      for (const n of chain) {
        limb += weights.get(n) ?? 0;
        weights.delete(n);
      }
      if (limb === 0) return;
      for (const [n, w] of nearestShare(samples[c], p)) weights.set(n, (weights.get(n) ?? 0) + w * limb);
    });
    // a pele aceita 4 ossos por vértice
    const top = [...weights].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((a, [, w]) => a + w, 0);
    top.forEach(([n, w], k) => {
      skinIndex[v * 4 + k] = slot(n);
      skinWeight[v * 4 + k] = w / sum;
    });
  }
  src.geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  src.geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
  // a pose de amarração dos ossos é a do corpo, para a peça casar com ele
  const inverses = bones.map((n, i) => {
    const b = body.bones.findIndex((o) => o.name === n);
    return b >= 0 ? body.boneInverses[b] : src.skeleton.boneInverses[i];
  });
  src.skeleton = new THREE.Skeleton(
    bones.map((n) => Object.assign(new THREE.Bone(), { name: n })),
    inverses,
  );
}

/**
 * Prende a peça aos ossos do boneco, pelo nome, para ela seguir as animações. Peça sem textura (cabelo e
 * barba modelados, o desenho vem do relevo) ganha a cor do crachá, num material só deste boneco.
 */
function attachWearable(inner: THREE.Object3D, body: THREE.SkinnedMesh, src: THREE.SkinnedMesh, color?: string, mats?: THREE.Material[]): void {
  const bones = src.skeleton.bones.map((b) => inner.getObjectByName(b.name));
  if (bones.some((b) => !(b as THREE.Bone | undefined)?.isBone)) {
    console.warn(`peça ${src.name}: esqueleto diferente do boneco, ignorada`);
    return;
  }
  const piece = src.clone();
  piece.castShadow = true;
  const own = piece.material as THREE.MeshStandardMaterial;
  if (color && mats && !Array.isArray(own) && own.isMeshStandardMaterial && !own.map) {
    const m = own.clone();
    m.color.set(color);
    piece.material = m;
    mats.push(m);
  }
  piece.bind(new THREE.Skeleton(bones as THREE.Bone[], src.skeleton.boneInverses), src.bindMatrix);
  body.parent?.add(piece);
}

let loaded: Loaded | null = null;
let loading: Promise<boolean> | null = null;

/** Nós cujo deslocamento move o boneco inteiro. */
const ROOT_MOTION = ["root.position", "figura.position"];

/** Remove o deslocamento do boneco inteiro, que briga com o jogo (a posição vem do servidor). */
function cleanClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const c = clip.clone();
  c.tracks = c.tracks.filter((t) => !ROOT_MOTION.includes(t.name));
  return c;
}

export function modelReady(): boolean {
  return loaded !== null;
}

/** Carrega o GLB e as peças uma vez. Resolve false se o boneco falhar (o jogo segue com o procedural). */
export function preloadCharacter(onProgress?: (e: ProgressEvent) => void): Promise<boolean> {
  const loader = createGltfLoader();
  const load = (list: Wearable[]) => Promise.all(list.map((w) => loadWearable(loader, w.url)));
  const cheer = loader.loadAsync(CELEBRATE_URL).catch((err) => {
    console.warn("boneco_comemora.glb não carregou, sem comemoração", err);
    return null;
  });
  loading ??= Promise.all([loader.loadAsync(MODEL_URL, onProgress), load(HAIRS), load(BEARDS_3D), load(SHIRTS_3D), load(PANTS_3D), load(SHOES_3D), cheer])
    .then(([gltf, hairs, beards, shirts, pants, shoes, party]) => {
      const scene = gltf.scene;
      let skeleton: THREE.Skeleton | null = null;
      scene.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) skeleton ??= (o as THREE.SkinnedMesh).skeleton;
      });
      if (skeleton) {
        const samples = limbSamples(scene);
        for (const piece of [hairs, beards, shirts, pants, shoes].flat(2)) retargetWearable(piece, samples, skeleton);
      }
      const h = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).y;
      loaded = {
        scene,
        clips: new Map(gltf.animations.map((a) => [a.name, cleanClip(a)])),
        scale: TARGET_HEIGHT / h,
        hairs,
        beards,
        shirts,
        pants,
        shoes,
        celebration: party ? splitCelebration(party.animations[0], party.scene, scene) : null,
      };
      return true;
    })
    .catch((err) => {
      console.warn("boneco_completo.glb não carregou, usando boneco procedural", err);
      return false;
    });
  return loading;
}

function glbCharacter(dna: AvatarDNA, model: Loaded): Character {
  const root = new THREE.Group();
  const inner = cloneSkinned(model.scene);
  inner.scale.setScalar(model.scale * (HEIGHT_SCALE[dna.height] ?? 1));
  root.add(inner);
  let body: THREE.SkinnedMesh | null = null;
  inner.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    if (mesh.isSkinnedMesh) body = mesh;
  });

  const mats: THREE.Material[] = [];
  const syncFace = dressFace(inner, dna, mats);
  const hairColor = HAIR_COLORS[dna.hairColor] ?? HAIR_COLORS[0];
  const beardColor = HAIR_COLORS[dna.beardColor] ?? hairColor;
  const pieces: [THREE.SkinnedMesh[] | undefined, string?][] = [
    [model.hairs[dna.hair - 1], hairColor],
    [model.beards[dna.beard - 1], beardColor],
    [model.shirts[dna.shirt - 1]],
    [model.pants[dna.pants - 1]],
    [model.shoes[dna.shoes - 1]],
  ];
  for (const [list, color] of pieces) {
    for (const piece of list ?? []) if (body) attachWearable(inner, body, piece, color, mats);
  }

  // Peças de expressão facial do GLB e suas transformações base
  const faceParts: GlbFaceParts = {
    browD: inner.getObjectByName("rosto_sobrancelha_D") || inner.getObjectByName("sobrancelha_D"),
    browE: inner.getObjectByName("rosto_sobrancelha_E") || inner.getObjectByName("sobrancelha_E"),
    mouth: inner.getObjectByName("rosto_boca") || inner.getObjectByName("boca"),
    blinkHalfD: inner.getObjectByName("piscar_meio_D"),
    blinkFullD: inner.getObjectByName("piscar_fechado_D"),
    blinkHalfE: inner.getObjectByName("piscar_meio_E"),
    blinkFullE: inner.getObjectByName("piscar_fechado_E"),
    caraBrava: inner.getObjectByName("cara_brava"),
  };

  const baseTransforms: GlbBaseTransforms = {
    browD_pos: faceParts.browD ? faceParts.browD.position.clone() : new THREE.Vector3(),
    browD_rot: faceParts.browD ? faceParts.browD.rotation.clone() : new THREE.Euler(),
    browE_pos: faceParts.browE ? faceParts.browE.position.clone() : new THREE.Vector3(),
    browE_rot: faceParts.browE ? faceParts.browE.rotation.clone() : new THREE.Euler(),
    mouth_pos: faceParts.mouth ? faceParts.mouth.position.clone() : new THREE.Vector3(),
    mouth_rot: faceParts.mouth ? faceParts.mouth.rotation.clone() : new THREE.Euler(),
    mouth_scale: faceParts.mouth ? faceParts.mouth.scale.clone() : new THREE.Vector3(1, 1, 1),
  };

  const ombroD = inner.getObjectByName("ombro_D");
  const ombroE = inner.getObjectByName("ombro_E");
  const restQuatD = new THREE.Quaternion();
  const restQuatE = new THREE.Quaternion();
  let handsRested = false;

  const emotion = new CharacterEmotionManager();

  const mixer = new THREE.AnimationMixer(inner);
  const loop = (name: string) => {
    const clip = model.clips.get(name);
    const a = clip ? mixer.clipAction(clip) : null;
    a?.play();
    return a;
  };
  const idle = loop("parado");
  const walk = loop("andar");
  const run = loop("correr");
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

  const cheer = model.celebration ? mixer.clipAction(model.celebration.body) : null;
  cheer?.setLoop(THREE.LoopOnce, 1);
  /** Pose sentada guardada ao começar a comemoração, para voltar a ela no fim. */
  let pose: [THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3][] = [];
  const pernaD = inner.getObjectByName("perna_D");
  const pernaE = inner.getObjectByName("perna_E");
  const cabeca = inner.getObjectByName("cabeca");

  let seated = false;
  return {
    root,
    setEmotion(state, duration) {
      emotion.setEmotion(state, duration);
    },
    getEmotion() {
      return emotion.getEmotion();
    },
    update(dt, speed01) {
      if (seated) {
        if (!cheer?.isRunning()) return;
        mixer.update(dt);
        syncFace();
        if (cheer.isRunning()) return;
        for (const [o, p, q, s] of pose) {
          o.position.copy(p);
          o.quaternion.copy(q);
          o.scale.copy(s);
        }
        return;
      }
      emotion.update(dt, speed01);
      const busy = [...actions.values()].some((a) => a.isRunning());
      // até a metade da velocidade o boneco anda; dali em diante passa a correr
      const s = busy ? 0 : speed01;
      const r = run ? THREE.MathUtils.clamp(s * 2 - 1, 0, 1) : 0;
      const w = Math.min(1, s * (run ? 2 : 1)) - r;
      idle?.setEffectiveWeight(busy ? 0 : 1 - w - r);
      walk?.setEffectiveWeight(w);
      run?.setEffectiveWeight(r);
      if (walk) walk.timeScale = 0.6 + speed01 * (run ? 1.6 : 0.8);
      mixer.update(dt);
      syncFace();
      applyGlbEmotion(faceParts, baseTransforms, emotion, 0);
    },
    updateSeated(dt, speed, steer, driftDir, boosting = false, rivalDir, options) {
      if (!seated || cheer?.isRunning()) return;
      emotion.update(dt, speed, options, boosting);

      // pé no chão no drift para apoio e remadas na arrancada lenta; os braços ficam no apoio
      let legD = -Math.PI / 2;
      let legE = -Math.PI / 2;
      if (driftDir > 0) legD += 0.38;
      else if (driftDir < 0) legE += 0.38;
      else if (speed > 0.1 && speed < 3.2) {
        const push = Math.sin(performance.now() * 0.012);
        legD += Math.max(0, push) * 0.32;
        legE += Math.max(0, -push) * 0.32;
      }
      const k = Math.min(1, dt * 10);
      if (pernaD) pernaD.rotation.x += (legD - pernaD.rotation.x) * k;
      if (pernaE) pernaE.rotation.x += (legE - pernaE.rotation.x) * k;

      let stareWeight = 0;
      if (cabeca) {
        let targetHeadY = -steer * 0.38 - driftDir * 0.42;
        let targetHeadZ = steer * 0.08 + driftDir * 0.12;
        let targetHeadX = boosting ? -0.2 : speed > 2 ? -0.1 : 0;

        if (rivalDir) {
          const rivalDist = Math.hypot(rivalDir.x, rivalDir.z);
          if (rivalDist > 0.1 && rivalDist < 4.5) {
            const rivalAngle = Math.atan2(rivalDir.x, rivalDir.z);
            const stareYaw = Math.max(-0.95, Math.min(0.95, -rivalAngle * 0.8));
            const stareRoll = (rivalDir.x > 0 ? -0.12 : 0.12) * Math.sin(Math.abs(rivalAngle));
            stareWeight = Math.max(0, Math.min(1, (4.5 - rivalDist) / 1.8));

            targetHeadY = (1 - stareWeight) * targetHeadY + stareWeight * stareYaw;
            targetHeadZ = (1 - stareWeight) * targetHeadZ + stareWeight * stareRoll;
            targetHeadX += stareWeight * 0.08;
          }
        }

        // Efeitos de postura e tremor da emoção
        if (emotion.wAdrenaline > 0.01) {
          const tremor = Math.sin(emotion.time * 44) * 0.014 * emotion.wAdrenaline;
          targetHeadX += -0.15 * emotion.wAdrenaline + tremor;
          targetHeadY += Math.cos(emotion.time * 56) * 0.01 * emotion.wAdrenaline;
        }
        if (emotion.wPanic > 0.01) {
          targetHeadX += 0.22 * emotion.wPanic;
          targetHeadY += Math.sin(emotion.time * 30) * 0.04 * emotion.wPanic;
        }
        if (emotion.wVictory > 0.01) {
          targetHeadX += -0.05 * emotion.wVictory;
          targetHeadZ += -0.08 * emotion.wVictory;
        }
        if (emotion.wYawn > 0.01) {
          targetHeadX += 0.18 * emotion.wYawn;
          targetHeadZ += Math.sin(emotion.time * 1.5) * 0.06 * emotion.wYawn;
        }

        const headK = Math.min(1, dt * 12);
        cabeca.rotation.x += (targetHeadX - cabeca.rotation.x) * headK;
        cabeca.rotation.y += (targetHeadY - cabeca.rotation.y) * headK;
        cabeca.rotation.z += (targetHeadZ - cabeca.rotation.z) * headK;
      }

      // Braços: reação de pânico (solta apoios por 0.4s) ou gesto de vitória / tchauzinho
      const pArm = emotion.panicArmTimer > 0 ? Math.min(1, emotion.panicArmTimer / 0.4) : 0;
      if (pArm > 0 && ombroD && ombroE) {
        const flail = Math.sin(emotion.time * 34) * 0.12;
        _eArmTemp.set(-1.55 + flail, 0, -0.32);
        _qArmTemp.setFromEuler(_eArmTemp);
        ombroE.quaternion.slerpQuaternions(restQuatE, _qArmTemp, pArm);

        _eArmTemp.set(-1.55 - flail, 0, 0.32);
        _qArmTemp.setFromEuler(_eArmTemp);
        ombroD.quaternion.slerpQuaternions(restQuatD, _qArmTemp, pArm);
      } else if (emotion.wVictory > 0.01 && ombroE) {
        const wave = Math.sin(emotion.time * 14) * 0.3;
        _eArmTemp.set(-1.65 + wave * 0.2, -0.25, 0.45 + wave * 0.35);
        _qArmTemp.setFromEuler(_eArmTemp);
        ombroE.quaternion.slerpQuaternions(restQuatE, _qArmTemp, emotion.wVictory);
        if (ombroD && handsRested) ombroD.quaternion.copy(restQuatD);
      } else if (handsRested) {
        if (ombroD) ombroD.quaternion.copy(restQuatD);
        if (ombroE) ombroE.quaternion.copy(restQuatE);
      }

      applyGlbEmotion(faceParts, baseTransforms, emotion, stareWeight);
    },
    play(action) {
      const a = actions.get(action);
      if (!a || (a.isRunning() && action !== "throw")) return;
      a.reset().play();
    },
    sit() {
      seated = true;
      mixer.stopAllAction();
      for (const [n, x] of [
        ["perna_D", -Math.PI / 2],
        ["perna_E", -Math.PI / 2],
        ["ombro_D", -0.75],
        ["ombro_E", -0.75],
      ] as const) {
        const o = inner.getObjectByName(n);
        if (o) o.rotation.x = x;
      }
      syncFace();
      if (!body) return 0;
      // a caixa da malha com pele é calculada na pose atual dos ossos
      inner.updateMatrixWorld(true);
      (body as THREE.SkinnedMesh).computeBoundingBox();
      return bottomOf(root, [body]);
    },
    restHands(left, right) {
      root.updateMatrixWorld(true);
      for (const [side, target] of [
        ["E", left],
        ["D", right],
      ] as const) {
        const shoulder = inner.getObjectByName(`ombro_${side}`);
        const wrist = inner.getObjectByName(`punho_${side}`);
        if (!shoulder?.parent || !wrist) continue;
        const s = shoulder.getWorldPosition(_v1);
        const from = wrist.getWorldPosition(_v2).sub(s).normalize();
        _v2.copy(target);
        const to = root.localToWorld(_v2).sub(s).normalize();
        // gira o ombro no espaço do mundo e devolve a rotação para o espaço do pai
        const world = shoulder.getWorldQuaternion(_q1).premultiply(_q2.setFromUnitVectors(from, to));
        shoulder.quaternion.copy(shoulder.parent.getWorldQuaternion(_q2).invert().multiply(world));
        shoulder.updateMatrixWorld(true);
      }
      if (ombroD) restQuatD.copy(ombroD.quaternion);
      if (ombroE) restQuatE.copy(ombroE.quaternion);
      handsRested = true;
    },
    celebrate() {
      if (!seated || !cheer || cheer.isRunning()) return;
      pose = [];
      inner.traverse((o) => pose.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
      cheer.reset().play();
    },
    dispose() {
      // malha, materiais e texturas do GLB são compartilhados entre clones; os tingidos são deste boneco
      mixer.stopAllAction();
      for (const m of mats) m.dispose();
    },
  };
}

function proceduralCharacter(dna: AvatarDNA): Character {
  const rig = buildAvatar(dna);
  const emotion = new CharacterEmotionManager();
  let t = 0;
  let aimUntil = 0;
  let seated = false;
  return {
    root: rig.root,
    setEmotion(state, duration) {
      emotion.setEmotion(state, duration);
    },
    getEmotion() {
      return emotion.getEmotion();
    },
    update(dt, speed01) {
      if (seated) return;
      t += dt * Math.max(0.05, speed01);
      aimUntil -= dt;
      animateAvatar(rig, speed01, t, aimUntil > 0);
      emotion.update(dt, speed01);
      applyAvatarEmotion(
        rig,
        {
          adrenaline: emotion.wAdrenaline,
          panic: emotion.wPanic,
          victory: emotion.wVictory,
          yawn: emotion.wYawn,
        },
        emotion.panicArmTimer,
        emotion.time,
        0,
      );
    },
    play(action) {
      if (action === "throw") aimUntil = ACTION_SECONDS.throw;
    },
    updateSeated(dt, speed, steer, driftDir, boosting = false, rivalDir, options) {
      if (!seated) return;
      emotion.update(dt, speed, options, boosting);

      let legD = -Math.PI / 2;
      let legE = -Math.PI / 2;
      if (driftDir > 0) legD += 0.38;
      else if (driftDir < 0) legE += 0.38;
      else if (speed > 0.1 && speed < 3.2) {
        const push = Math.sin(performance.now() * 0.012);
        legD += Math.max(0, push) * 0.32;
        legE += Math.max(0, -push) * 0.32;
      }
      const k = Math.min(1, dt * 10);
      rig.legR.rotation.x += (legD - rig.legR.rotation.x) * k;
      rig.legL.rotation.x += (legE - rig.legL.rotation.x) * k;

      let targetHeadY = -steer * 0.38 - driftDir * 0.42;
      let targetHeadZ = steer * 0.08 + driftDir * 0.12;
      let targetHeadX = boosting ? -0.2 : speed > 2 ? -0.1 : 0;
      let stareWeight = 0;

      if (rivalDir) {
        const rivalDist = Math.hypot(rivalDir.x, rivalDir.z);
        if (rivalDist > 0.1 && rivalDist < 4.5) {
          const rivalAngle = Math.atan2(rivalDir.x, rivalDir.z);
          const stareYaw = Math.max(-0.95, Math.min(0.95, -rivalAngle * 0.8));
          const stareRoll = (rivalDir.x > 0 ? -0.12 : 0.12) * Math.sin(Math.abs(rivalAngle));
          stareWeight = Math.max(0, Math.min(1, (4.5 - rivalDist) / 1.8));

          targetHeadY = (1 - stareWeight) * targetHeadY + stareWeight * stareYaw;
          targetHeadZ = (1 - stareWeight) * targetHeadZ + stareWeight * stareRoll;
          targetHeadX += stareWeight * 0.08;
        }
      }

      // Efeitos de postura e tremor da emoção
      if (emotion.wAdrenaline > 0.01) {
        const tremor = Math.sin(emotion.time * 44) * 0.014 * emotion.wAdrenaline;
        targetHeadX += -0.15 * emotion.wAdrenaline + tremor;
        targetHeadY += Math.cos(emotion.time * 56) * 0.01 * emotion.wAdrenaline;
      }
      if (emotion.wPanic > 0.01) {
        targetHeadX += 0.22 * emotion.wPanic;
        targetHeadY += Math.sin(emotion.time * 30) * 0.04 * emotion.wPanic;
      }
      if (emotion.wVictory > 0.01) {
        targetHeadX += -0.05 * emotion.wVictory;
        targetHeadZ += -0.08 * emotion.wVictory;
      }
      if (emotion.wYawn > 0.01) {
        targetHeadX += 0.18 * emotion.wYawn;
        targetHeadZ += Math.sin(emotion.time * 1.5) * 0.06 * emotion.wYawn;
      }

      const headK = Math.min(1, dt * 12);
      rig.head.rotation.x += (targetHeadX - rig.head.rotation.x) * headK;
      rig.head.rotation.y += (targetHeadY - rig.head.rotation.y) * headK;
      rig.head.rotation.z += (targetHeadZ - rig.head.rotation.z) * headK;

      // Braços no rig procedural
      const pArm = emotion.panicArmTimer > 0 ? Math.min(1, emotion.panicArmTimer / 0.4) : 0;
      if (pArm > 0) {
        const flail = Math.sin(emotion.time * 34) * 0.12;
        rig.armL.rotation.x = -0.75 * (1 - pArm) + (-1.55 + flail) * pArm;
        rig.armR.rotation.x = -0.75 * (1 - pArm) + (-1.55 - flail) * pArm;
        rig.armL.rotation.z = -0.32 * pArm;
        rig.armR.rotation.z = 0.32 * pArm;
        rig.armL.rotation.y = 0;
        rig.armR.rotation.y = 0;
      } else if (emotion.wVictory > 0.01) {
        const wave = Math.sin(emotion.time * 14) * 0.3;
        rig.armL.rotation.x = -0.75 * (1 - emotion.wVictory) + (-1.65 + wave * 0.2) * emotion.wVictory;
        rig.armL.rotation.z = (0.45 + wave * 0.35) * emotion.wVictory;
        rig.armL.rotation.y = -0.25 * emotion.wVictory;
        rig.armR.rotation.x = -0.75;
        rig.armR.rotation.z = 0;
        rig.armR.rotation.y = 0;
      } else {
        rig.armL.rotation.x = -0.75;
        rig.armL.rotation.z = 0;
        rig.armL.rotation.y = 0;
        rig.armR.rotation.x = -0.75;
        rig.armR.rotation.z = 0;
        rig.armR.rotation.y = 0;
      }

      applyAvatarEmotion(
        rig,
        {
          adrenaline: emotion.wAdrenaline,
          panic: emotion.wPanic,
          victory: emotion.wVictory,
          yawn: emotion.wYawn,
        },
        emotion.panicArmTimer,
        emotion.time,
        stareWeight,
      );
    },
    sit() {
      seated = true;
      rig.legL.rotation.x = rig.legR.rotation.x = -Math.PI / 2;
      rig.armL.rotation.x = rig.armR.rotation.x = -0.75;
      rig.armL.rotation.y = rig.armR.rotation.y = 0;
      rig.armL.rotation.z = rig.armR.rotation.z = 0;
      return bottomOf(rig.root, [rig.legL, rig.legR]);
    },
    restHands() {
      // O boneco procedural já sai de sit() com os braços no apoio
    },
    celebrate() {},
    dispose() {
      disposeAvatar(rig);
    },
  };
}

export function createCharacter(dna: AvatarDNA): Character {
  return loaded ? glbCharacter(dna, loaded) : proceduralCharacter(dna);
}

// ---------- zumbi (modo Sobrevivência) ----------
const ZOMBIE_URL = "/assets/characters/Zombie.fbx";
const ZOMBIE_TEXTURE_URL = "/assets/characters/zombie_texture.png";

interface LoadedZombie {
  scene: THREE.Group;
  clip: THREE.AnimationClip | null;
  scale: number;
}

let loadedZombie: LoadedZombie | null = null;
let loadingZombie: Promise<boolean> | null = null;
let zombieTexture: THREE.Texture | null = null;

/**
 * Zera o deslocamento lateral/frontal (root motion X e Z) dos ossos na animação do zumbi,
 * mantendo o balanço vertical Y e todas as rotações das articulações da caminhada.
 */
function cleanZombieClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const c = clip.clone();
  for (const track of c.tracks) {
    if (track.name.endsWith(".position") && track instanceof THREE.VectorKeyframeTrack) {
      const vals = track.values;
      for (let i = 0; i < vals.length; i += 3) {
        vals[i] = 0; // zera deslocamento X
        vals[i + 2] = 0; // zera deslocamento Z
      }
    }
  }
  return c;
}

export function zombieReady(): boolean {
  return loadedZombie !== null;
}

/** Carrega o Zombie.fbx com sua animação embutida de zumbi em movimento. */
/** Só baixa quando aparece o primeiro zumbi: são cerca de 5 MB que quem não joga o modo não precisa. */
export function preloadZombie(): Promise<boolean> {
  if (loadingZombie) return loadingZombie;
  const texture = new THREE.TextureLoader().loadAsync(ZOMBIE_TEXTURE_URL).then(
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      zombieTexture = tex;
    },
    (err) => console.warn("Falha ao carregar zombie_texture.png, usando fallback procedural ou de cor", err),
  );
  loadingZombie = Promise.all([new FBXLoader().loadAsync(ZOMBIE_URL), texture])
    .then(([fbx]) => {
      const bbox = new THREE.Box3().setFromObject(fbx);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const h = size.y > 0 ? size.y : 1.0;
      const rawClip = fbx.animations && fbx.animations.length > 0 ? fbx.animations[0] : null;
      const clip = rawClip ? cleanZombieClip(rawClip) : null;
      loadedZombie = {
        scene: fbx,
        clip,
        scale: TARGET_HEIGHT / h,
      };
      return true;
    })
    .catch((err) => {
      console.warn("Zombie.fbx não carregou, usando fallback procedural", err);
      return false;
    });
  return loadingZombie;
}

export function createZombieCharacter(): Character {
  if (!loadedZombie) {
    const zombieDna: AvatarDNA = {
      name: "Zumbi",
      model: 0,
      face: 0,
      skin: 5,
      hair: 0,
      hairColor: 0,
      eyes: 0,
      beard: 0,
      beardColor: 0,
      glasses: 0,
      top: 0,
      bottom: 0,
      shirt: 0,
      pants: 0,
      shoes: 0,
      accessory: 0,
      height: 1,
    };
    return proceduralCharacter(zombieDna);
  }

  const root = new THREE.Group();
  const inner = cloneSkinned(loadedZombie.scene) as THREE.Group;
  inner.scale.setScalar(loadedZombie.scale);
  const mats: THREE.Material[] = [];

  inner.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const orig = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const origMap = (orig as { map?: THREE.Texture })?.map ?? null;
      const map = zombieTexture ?? origMap;
      const standardMat = new THREE.MeshStandardMaterial({
        map,
        color: map ? 0xffffff : 0x5a7d52,
        roughness: 0.75,
        metalness: 0.1,
      });
      mesh.material = standardMat;
      mats.push(standardMat);
    }
  });
  root.add(inner);

  const mixer = new THREE.AnimationMixer(inner);
  if (loadedZombie.clip) {
    const action = mixer.clipAction(loadedZombie.clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
  }

  return {
    root,
    update(dt, speed01) {
      const rate = 0.6 + Math.max(0.2, speed01) * 0.8;
      mixer.update(dt * rate);
    },
    setEmotion() {},
    getEmotion() {
      return "normal" as const;
    },
    play() {},
    sit() {
      return 0;
    },
    restHands() {},
    celebrate() {},
    dispose() {
      mixer.stopAllAction();
      for (const m of mats) m.dispose();
    },
  };
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
