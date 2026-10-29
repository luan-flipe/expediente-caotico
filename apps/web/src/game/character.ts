import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { AvatarDNA, ItemId } from "@ec/shared";
import { animateAvatar, buildAvatar, disposeAvatar } from "./avatarMesh";
import { createGltfLoader } from "./gltfLoader";
import { HAIRS, PANTS_3D, SHIRTS_3D, SHOES_3D, type Wearable } from "./wearables";

export type CharacterAction = "throw" | "cafe" | "dash" | "tchau";

/** Boneco renderizado: GLB do romulo-h quando carregado, boneco procedural enquanto isso. */
export interface Character {
  root: THREE.Group;
  update(dt: number, speed01: number): void;
  /** Atualização dinâmica na cadeira de corrida (inclinação do corpo, cabeça na curva, braços esterçando). */
  updateSeated?(dt: number, speed: number, steer: number, driftDir: number, boosting: boolean): void;
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
  /** Malhas de cada peça das pastas, na ordem de HAIRS, SHIRTS_3D, PANTS_3D e SHOES_3D; vazio se o arquivo não serviu. */
  hairs: THREE.SkinnedMesh[][];
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

/** Prende a peça aos ossos do boneco, pelo nome, para ela seguir as animações. */
function attachWearable(inner: THREE.Object3D, body: THREE.SkinnedMesh, src: THREE.SkinnedMesh): void {
  const bones = src.skeleton.bones.map((b) => inner.getObjectByName(b.name));
  if (bones.some((b) => !(b as THREE.Bone | undefined)?.isBone)) {
    console.warn(`peça ${src.name}: esqueleto diferente do boneco, ignorada`);
    return;
  }
  const piece = src.clone();
  piece.castShadow = true;
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
  loading ??= Promise.all([loader.loadAsync(MODEL_URL, onProgress), load(HAIRS), load(SHIRTS_3D), load(PANTS_3D), load(SHOES_3D), cheer])
    .then(([gltf, hairs, shirts, pants, shoes, party]) => {
      const scene = gltf.scene;
      const h = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).y;
      loaded = {
        scene,
        clips: new Map(gltf.animations.map((a) => [a.name, cleanClip(a)])),
        scale: TARGET_HEIGHT / h,
        hairs,
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
  // a malha tem pele: o clone comum continuaria preso aos ossos do original
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
  const pieces = [model.hairs[dna.hair - 1], model.shirts[dna.shirt - 1], model.pants[dna.pants - 1], model.shoes[dna.shoes - 1]];
  for (const piece of pieces.flatMap((p) => p ?? [])) {
    if (body) attachWearable(inner, body, piece);
  }

  const mixer = new THREE.AnimationMixer(inner);
  const loop = (name: string) => {
    const clip = model.clips.get(name);
    const a = clip ? mixer.clipAction(clip) : null;
    a?.play();
    return a;
  };
  const idle = loop("parado");
  const walk = loop("andar");
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

  let seated = false;
  return {
    root,
    update(dt, speed01) {
      if (seated) {
        if (!cheer?.isRunning()) return;
        mixer.update(dt);
        if (cheer.isRunning()) return;
        for (const [o, p, q, s] of pose) {
          o.position.copy(p);
          o.quaternion.copy(q);
          o.scale.copy(s);
        }
        return;
      }
      const busy = [...actions.values()].some((a) => a.isRunning());
      const w = busy ? 0 : speed01;
      walk?.setEffectiveWeight(w);
      idle?.setEffectiveWeight(busy ? 0 : 1 - w);
      if (walk) walk.timeScale = 0.6 + speed01 * 0.8;
      mixer.update(dt);
    },
    updateSeated(dt, speed, _steer, driftDir) {
      if (!seated || cheer?.isRunning()) return;
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
        const s = shoulder.getWorldPosition(new THREE.Vector3());
        const from = wrist.getWorldPosition(new THREE.Vector3()).sub(s).normalize();
        const to = root.localToWorld(target.clone()).sub(s).normalize();
        // gira o ombro no espaço do mundo e devolve a rotação para o espaço do pai
        const world = shoulder.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromUnitVectors(from, to));
        shoulder.quaternion.copy(shoulder.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
        shoulder.updateMatrixWorld(true);
      }
    },
    celebrate() {
      if (!seated || !cheer || cheer.isRunning()) return;
      pose = [];
      inner.traverse((o) => pose.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
      cheer.reset().play();
    },
    dispose() {
      // malha, materiais e texturas do GLB são compartilhados entre clones
      mixer.stopAllAction();
    },
  };
}

function proceduralCharacter(dna: AvatarDNA): Character {
  const rig = buildAvatar(dna);
  let t = 0;
  let aimUntil = 0;
  let seated = false;
  return {
    root: rig.root,
    update(dt, speed01) {
      if (seated) return;
      t += dt * Math.max(0.05, speed01);
      aimUntil -= dt;
      animateAvatar(rig, speed01, t, aimUntil > 0);
    },
    play(action) {
      if (action === "throw") aimUntil = ACTION_SECONDS.throw;
    },
    sit() {
      seated = true;
      rig.legL.rotation.x = rig.legR.rotation.x = -Math.PI / 2;
      rig.armL.rotation.x = rig.armR.rotation.x = -0.75;
      return bottomOf(rig.root, [rig.legL, rig.legR]);
    },
    restHands() {
      // o boneco procedural já sai de sit() com os braços no apoio
    },
    celebrate() {
      // sem animação de comemoração no boneco procedural
    },
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
  // a textura chega junto com o modelo, porque é aplicada quando o zumbi é criado
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
  // Usa SkeletonUtils.clone para preservar as ligações dos ossos do SkinnedMesh
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
      // Como o zumbi já está em movimento contínuo na animação, escala proporcionalmente à velocidade
      const rate = 0.6 + Math.max(0.2, speed01) * 0.8;
      mixer.update(dt * rate);
    },
    play() {},
    // zumbi nunca senta numa cadeira
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
