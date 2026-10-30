import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { CLOTH_COLORS, HAIR_COLORS, type AvatarDNA, type ItemId } from "@ec/shared";
import { animateAvatar, buildAvatar, disposeAvatar } from "./avatarMesh";
import { createGltfLoader } from "./gltfLoader";
import { dressFace, preloadFaces } from "./rosto";
import { BEARDS_3D, HAIRS, PANTS_3D, SHIRTS_3D, SHOES_3D, type Wearable } from "./wearables";

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
  /** Pose em pé no patinete: pernas retas, um pé à frente, braços para a frente. Para as animações. */
  stand?(): StandFit;
  /** Já sentado ou em pé, gira os ombros até os pulsos alcançarem os pontos dados (coordenadas de root). */
  restHands(left: THREE.Vector3, right: THREE.Vector3): void;
  /** Já sentado ou em pé, toca a comemoração e volta à pose. Só o corpo: assento e confete ficam com o veículo. */
  celebrate(): void;
  dispose(): void;
}

/** Medidas do boneco em pé (coordenadas de root), para o patinete pôr o deck sob os pés e o guidão ao alcance. */
export interface StandFit {
  sole: number;
  /** Ombro esquerdo (+x); o direito é o espelho em x. */
  shoulder: THREE.Vector3;
  /** Do ombro ao pulso. */
  reach: number;
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
/** Pernas em pé no patinete: o pé esquerdo um pouco à frente. */
const STANCE = 0.14;
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
  /** O mesmo sem as pernas, que no arquivo estão sentadas: no patinete os pés ficam no deck. */
  standing: THREE.AnimationClip;
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
  const legs = /^(perna|joelho|pe)_/;
  return {
    body: new THREE.AnimationClip("comemorar", clip.duration, body),
    standing: new THREE.AnimationClip("comemorar_em_pe", clip.duration, body.filter((t) => !legs.test(node(t)))),
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

/** Parte de roupa que fica na cor dela quando a peça muda de cor (pelo nome do material, "fixo"/"fixa" para qualquer parte). */
const FIXED_PART = /botao|cadarco|sola|ilhos|fivela|ziper|fix[ao]/i;
const luminance = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const fixedPart = (m: THREE.SkinnedMesh) => !Array.isArray(m.material) && FIXED_PART.test(m.material.name);

/**
 * Cor de cada malha de uma roupa tingida. A principal (a de mais vértices entre as que mudam) fica na cor
 * escolhida e as outras (gola, punho, forro) guardam o quanto eram mais claras ou escuras que ela; botão,
 * cadarço, sola e partes fixas não mudam.
 */
function clothTints(list: THREE.SkinnedMesh[], hex: string): Map<THREE.SkinnedMesh, THREE.Color> {
  const size = (m: THREE.SkinnedMesh) => m.geometry.getAttribute("position").count;
  const dyed = list.filter((m) => !fixedPart(m));
  const main = (dyed.length ? dyed : list).reduce((a, b) => (size(b) > size(a) ? b : a));
  const base = Math.max(luminance((main.material as THREE.MeshStandardMaterial).color), 1e-3);
  const tints = new Map<THREE.SkinnedMesh, THREE.Color>();
  for (const m of list) {
    const mat = m.material as THREE.MeshStandardMaterial;
    if (Array.isArray(m.material) || !mat.isMeshStandardMaterial || fixedPart(m)) continue;
    tints.set(m, new THREE.Color(hex).multiplyScalar(Math.min(luminance(mat.color) / base, 1.5)));
  }
  return tints;
}

/**
 * Prende a peça aos ossos do boneco, pelo nome, para ela seguir as animações. Peça sem textura (cabelo e
 * barba modelados, o desenho vem do relevo) ganha a cor do crachá, num material só deste boneco. Com
 * `overMap`, a cor também tinge peça com textura (roupa: a textura clara multiplica a cor escolhida).
 */
function attachWearable(
  inner: THREE.Object3D,
  body: THREE.SkinnedMesh,
  src: THREE.SkinnedMesh,
  color?: THREE.ColorRepresentation,
  mats?: THREE.Material[],
  overMap = false,
): void {
  const bones = src.skeleton.bones.map((b) => inner.getObjectByName(b.name));
  if (bones.some((b) => !(b as THREE.Bone | undefined)?.isBone)) {
    console.warn(`peça ${src.name}: esqueleto diferente do boneco, ignorada`);
    return;
  }
  const piece = src.clone();
  piece.castShadow = true;
  const own = piece.material as THREE.MeshStandardMaterial;
  if (color && mats && !Array.isArray(own) && own.isMeshStandardMaterial && (overMap || !own.map)) {
    const m = own.clone();
    m.color.set(color);
    piece.material = m;
    mats.push(m);
  }
  piece.bind(new THREE.Skeleton(bones as THREE.Bone[], src.skeleton.boneInverses), src.bindMatrix);
  body.parent?.add(piece);
}

/** Salto alto: o pé gira isto em volta do tornozelo, calcanhar para cima e ponta para baixo. */
const HEEL_TILT = 0.35;
/**
 * Quanto o boneco sobe com o pé inclinado, em unidades do modelo, para a ponta do sapato tocar o chão.
 * Medido no 03_salto_alto.glb, que desenha o salto já nessa pose.
 */
const HEEL_LIFT = 0.044;

/** Altura do cós medida a partir do topo da saia. */
const TUCK_BAND = 0.03;
/** Folga entre a camiseta apertada e o lado de dentro da saia. */
const TUCK_GAP = 0.008;
/** Acima do cós, a camiseta volta ao tamanho dela ao longo desta altura, como tecido preso na cintura. */
const TUCK_BLEND = 0.05;
const TUCK_BINS = 48;
/** Camiseta já posta para dentro, por camiseta e por saia. */
const tucked = new WeakMap<THREE.SkinnedMesh, WeakMap<THREE.SkinnedMesh, THREE.SkinnedMesh>>();

/** A camiseta com a parte de baixo apertada para dentro do cós da saia (contorno medido na própria saia). */
function tuckShirt(shirt: THREE.SkinnedMesh, skirt: THREE.SkinnedMesh[]): THREE.SkinnedMesh {
  const cached = tucked.get(shirt)?.get(skirt[0]);
  if (cached) return cached;
  // posições no espaço da amarração, onde camiseta e saia se encontram
  const pts: THREE.Vector3[] = [];
  for (const m of skirt) {
    const pos = m.geometry.getAttribute("position");
    for (let v = 0; v < pos.count; v++) pts.push(new THREE.Vector3().fromBufferAttribute(pos, v).applyMatrix4(m.bindMatrix));
  }
  const top = Math.max(...pts.map((p) => p.y));
  const band = pts.filter((p) => p.y > top - TUCK_BAND);
  const cx = band.reduce((s, p) => s + p.x, 0) / band.length;
  const cz = band.reduce((s, p) => s + p.z, 0) / band.length;
  const binOf = (x: number, z: number) => {
    const a = Math.atan2(x - cx, z - cz);
    return Math.floor(((a / (Math.PI * 2) + 1) % 1) * TUCK_BINS) % TUCK_BINS;
  };
  // raio do cós em cada direção: o menor, para a camiseta ficar por dentro dele todo
  const limit = new Array<number>(TUCK_BINS).fill(Infinity);
  for (const p of band) {
    const b = binOf(p.x, p.z);
    limit[b] = Math.min(limit[b], Math.hypot(p.x - cx, p.z - cz) - TUCK_GAP);
  }
  // direção sem ponto do cós: usa a vizinha mais próxima que tem
  for (let b = 0; b < TUCK_BINS; b++)
    for (let k = 1; limit[b] === Infinity && k < TUCK_BINS; k++)
      limit[b] = Math.min(limit[(b + k) % TUCK_BINS], limit[(b - k + TUCK_BINS) % TUCK_BINS]);

  const geometry = shirt.geometry.clone();
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const toBind = shirt.bindMatrix;
  const fromBind = shirt.bindMatrixInverse;
  const p = new THREE.Vector3();
  for (let v = 0; v < pos.count; v++) {
    p.fromBufferAttribute(pos, v).applyMatrix4(toBind);
    if (p.y > top + TUCK_BLEND) continue;
    const r = limit[binOf(p.x, p.z)];
    const d = Math.hypot(p.x - cx, p.z - cz);
    if (d <= r) continue;
    const k = p.y <= top ? 1 : 1 - (p.y - top) / TUCK_BLEND;
    const s = (d + (r - d) * k) / d;
    p.set(cx + (p.x - cx) * s, p.y, cz + (p.z - cz) * s).applyMatrix4(fromBind);
    pos.setXYZ(v, p.x, p.y, p.z);
  }
  // as normais ficam as da camiseta: a parte apertada some dentro da saia
  geometry.computeBoundingSphere();
  const out = shirt.clone();
  out.geometry = geometry;
  if (!tucked.has(shirt)) tucked.set(shirt, new WeakMap());
  tucked.get(shirt)!.set(skirt[0], out);
  return out;
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
  loading ??= Promise.all([
    loader.loadAsync(MODEL_URL, onProgress),
    load(HAIRS),
    load(BEARDS_3D),
    load(SHIRTS_3D),
    load(PANTS_3D),
    load(SHOES_3D),
    cheer,
    // as texturas das expressões do rosto
    preloadFaces(),
  ])
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
  // pele, olhos e rosto do crachá; os materiais tingidos são só deste boneco
  const mats: THREE.Material[] = [];
  dressFace(inner, dna, mats);
  const hairColor = HAIR_COLORS[dna.hairColor] ?? HAIR_COLORS[0];
  const beardColor = HAIR_COLORS[dna.beardColor] ?? hairColor;
  // com saia, a camiseta vai para dentro do cós
  const pants = model.pants[dna.pants - 1];
  const skirt = PANTS_3D[dna.pants - 1]?.tuck && pants?.length ? pants : null;
  const shirt = model.shirts[dna.shirt - 1];
  // cabelo e barba vêm com a cor; roupa vem com o índice de CLOTH_COLORS (0 deixa a cor original da peça)
  const pieces: [THREE.SkinnedMesh[] | undefined, string | undefined, number?][] = [
    [model.hairs[dna.hair - 1], hairColor],
    [model.beards[dna.beard - 1], beardColor],
    [skirt && shirt ? shirt.map((m) => tuckShirt(m, skirt)) : shirt, undefined, dna.shirtColor],
    [pants, undefined, dna.pantsColor],
    [model.shoes[dna.shoes - 1], undefined, dna.shoesColor],
  ];
  for (const [list, color, cloth] of pieces) {
    const hex = cloth ? CLOTH_COLORS[cloth - 1] : undefined;
    const tints = list?.length && hex ? clothTints(list, hex) : undefined;
    for (const piece of list ?? []) if (body) attachWearable(inner, body, piece, tints ? tints.get(piece) : color, mats, !!tints);
  }

  // salto alto: o pé fica inclinado e o boneco sobe para a ponta do sapato tocar o chão
  const feet =
    SHOES_3D[dna.shoes - 1]?.heel && model.shoes[dna.shoes - 1]?.length
      ? ["pe_D", "pe_E"].map((n) => inner.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o)
      : [];
  if (feet.length) inner.position.y = HEEL_LIFT * inner.scale.y;
  /** Rotação de cada pé logo depois de inclinado: igual a ela, a animação não mexeu no pé desde então. */
  const tilted = new Map<THREE.Object3D, THREE.Quaternion>();
  const toParent = new THREE.Quaternion();
  const tilt = new THREE.Quaternion();
  const side = new THREE.Vector3();
  const tiltFeet = () => {
    for (const foot of feet) {
      if (tilted.get(foot)?.equals(foot.quaternion)) continue;
      // eixo lateral do boneco escrito no espaço do pai do pé
      toParent.identity();
      for (let o = foot.parent; o && o !== inner; o = o.parent) toParent.premultiply(o.quaternion);
      side.set(1, 0, 0).applyQuaternion(toParent.invert());
      foot.quaternion.premultiply(tilt.setFromAxisAngle(side, HEEL_TILT));
      tilted.set(foot, foot.quaternion.clone());
    }
  };
  tiltFeet();

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

  const cheerOf = (clip?: THREE.AnimationClip) => (clip ? mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1) : null);
  let cheer = cheerOf(model.celebration?.body);
  /** Pose sentada ou em pé guardada ao começar a comemoração, para voltar a ela no fim. */
  let pose: [THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3][] = [];
  const pernaD = inner.getObjectByName("perna_D");
  const pernaE = inner.getObjectByName("perna_E");
  const bend = (list: readonly (readonly [string, number])[]) => {
    for (const [n, x] of list) {
      const o = inner.getObjectByName(n);
      if (o) o.rotation.x = x;
    }
    tiltFeet();
  };
  const sole = () => {
    if (!body) return 0;
    // a caixa da malha com pele é calculada na pose atual dos ossos
    inner.updateMatrixWorld(true);
    (body as THREE.SkinnedMesh).computeBoundingBox();
    return bottomOf(root, [body]);
  };

  let riding = false;
  /** Rotação das pernas na pose em pé; null sentado. */
  let stance: [THREE.Euler, THREE.Euler] | null = null;
  return {
    root,
    update(dt, speed01) {
      if (riding) {
        if (!cheer?.isRunning()) return;
        mixer.update(dt);
        tiltFeet();
        if (cheer.isRunning()) return;
        for (const [o, p, q, s] of pose) {
          o.position.copy(p);
          o.quaternion.copy(q);
          o.scale.copy(s);
        }
        return;
      }
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
      tiltFeet();
    },
    updateSeated(dt, speed, _steer, driftDir) {
      if (!riding || cheer?.isRunning()) return;
      const k = Math.min(1, dt * 10);
      if (stance) {
        // elétrico, sem remada: no drift o pé de dentro da curva sai do deck para o lado
        for (const [leg, base, dir] of [
          [pernaD, stance[0], 1],
          [pernaE, stance[1], -1],
        ] as const) {
          if (!leg) continue;
          const dab = driftDir === dir;
          leg.rotation.x += ((dab ? -0.35 : base.x) - leg.rotation.x) * k;
          leg.rotation.z += ((dab ? base.z - dir * 0.55 : base.z) - leg.rotation.z) * k;
        }
        return;
      }
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
      if (pernaD) pernaD.rotation.x += (legD - pernaD.rotation.x) * k;
      if (pernaE) pernaE.rotation.x += (legE - pernaE.rotation.x) * k;
    },
    play(action) {
      const a = actions.get(action);
      if (!a || (a.isRunning() && action !== "throw")) return;
      a.reset().play();
    },
    sit() {
      riding = true;
      mixer.stopAllAction();
      bend([
        ["perna_D", -Math.PI / 2],
        ["perna_E", -Math.PI / 2],
        ["ombro_D", -0.75],
        ["ombro_E", -0.75],
      ]);
      return sole();
    },
    stand() {
      riding = true;
      mixer.stopAllAction();
      cheer = cheerOf(model.celebration?.standing);
      bend([
        ["perna_D", STANCE],
        ["perna_E", -STANCE],
        ["ombro_D", -0.75],
        ["ombro_E", -0.75],
      ]);
      stance = [pernaD?.rotation.clone() ?? new THREE.Euler(), pernaE?.rotation.clone() ?? new THREE.Euler()];
      const bottom = sole();
      const at = (name: string) => inner.getObjectByName(name)?.getWorldPosition(new THREE.Vector3());
      const shoulder = at("ombro_E");
      const wrist = at("punho_E");
      return {
        sole: bottom,
        shoulder: shoulder ? root.worldToLocal(shoulder.clone()) : new THREE.Vector3(0.17, 0.7, 0),
        reach: shoulder && wrist ? shoulder.distanceTo(wrist) : 0.3,
      };
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
      if (!riding || !cheer || cheer.isRunning()) return;
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
  let t = 0;
  let aimUntil = 0;
  let riding = false;
  return {
    root: rig.root,
    update(dt, speed01) {
      if (riding) return;
      t += dt * Math.max(0.05, speed01);
      aimUntil -= dt;
      animateAvatar(rig, speed01, t, aimUntil > 0);
    },
    play(action) {
      if (action === "throw") aimUntil = ACTION_SECONDS.throw;
    },
    sit() {
      riding = true;
      rig.legL.rotation.x = rig.legR.rotation.x = -Math.PI / 2;
      rig.armL.rotation.x = rig.armR.rotation.x = -0.75;
      return bottomOf(rig.root, [rig.legL, rig.legR]);
    },
    stand() {
      riding = true;
      rig.legL.rotation.x = STANCE;
      rig.legR.rotation.x = -STANCE;
      rig.armL.rotation.x = rig.armR.rotation.x = -1;
      const sole = bottomOf(rig.root, [rig.legL, rig.legR]);
      const shoulder = rig.root.worldToLocal(rig.armR.getWorldPosition(new THREE.Vector3()));
      return { sole, shoulder, reach: 0.58 };
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
      shirtColor: 0,
      pantsColor: 0,
      shoesColor: 0,
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
