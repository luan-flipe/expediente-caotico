import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EYE_COLORS, HAIR_COLORS, PANTS, SHIRTS, SKINS, type AvatarDNA, type ItemId } from "@ec/shared";
import { getSettings } from "../settings";
import { animateAvatar, buildAvatar, disposeAvatar } from "./avatarMesh";
import { BONECO_GLB, BONECO_POLO_BARBA_GLB, ZOMBIE_FBX, ZOMBIE_TEX } from "./assets";
import { loadFBX, loadGLB, loadSkiaTexture } from "./loaders";

export type CharacterAction = "throw" | "cafe" | "dash";

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

const MODEL_URL = BONECO_GLB;

interface SkinDef {
  url: number;
  /** Nó raiz do corpo, usado para medir a altura. */
  root: string;
}

/** Skins prontas por índice de MODELS. A 1 também empresta cabelo e barba ao crachá. */
const SKIN_DEFS: Record<number, SkinDef> = {
  1: { url: BONECO_POLO_BARBA_GLB, root: "Boneco" },
};
/** Skin de onde saem o cabelo "Volumoso" e a barba "Cheia" do crachá. */
const PARTS_SKIN = 1;
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

interface LoadedZombie {
  scene: THREE.Group;
  clip: THREE.AnimationClip | null;
  scale: number;
}

/** Cabelo e barba tirados de uma skin, com a cor por vértice virada em sombra neutra. */
interface Parts {
  hair?: THREE.BufferGeometry;
  hairCap?: THREE.BufferGeometry;
  beard?: THREE.BufferGeometry;
  /** Gola, vista e botões da polo, presos ao Boneco: servem de colarinho para as camisas do crachá. */
  collar?: THREE.Mesh[];
}

let loaded: Loaded | null = null;
let loading: Promise<boolean> | null = null;
const skins = new Map<number, Loaded>();
const parts: Parts = {};

let loadedZombie: LoadedZombie | null = null;
let loadingZombie: Promise<boolean> | null = null;
let zombieTexture: THREE.Texture | null = null;

/**
 * Remove trilhas que brigam com o jogo: deslocamento do corpo (a posição vem do servidor)
 * e a bolinha que voa sozinha (o projétil de verdade já é desenhado).
 */
function cleanClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const c = clip.clone();
  c.tracks = c.tracks.filter((t) => !t.name.startsWith("Boneco.position") && !t.name.startsWith("Bolinha_Voo."));
  return c;
}

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
        vals[i] = 0;
        vals[i + 2] = 0;
      }
    }
  }
  return c;
}

export function modelReady(): boolean {
  return loaded !== null;
}

export function zombieReady(): boolean {
  return loadedZombie !== null;
}

/** Quanto o corpo sobe para as pernas crescerem; os pés ficam no mesmo lugar. */
const LEG_GROW = 0.16;
/** Topo da perna no espaço do quadril, escondido sob o quadril da calça. */
const LEG_TOP = 0.04;
/** Raios da perna (x, z): um pouco mais grossa que a original para equilibrar com o tronco. */
const LEG_R: [number, number] = [0.175, 0.195];

/**
 * Perna torneada em vez de elipsoide: coxa cheia, afina até o tornozelo e termina arredondada,
 * assim cabe dentro do calçado sem a ponta oval sobrar por baixo. Perfil em unidades de raio 1, y de -1 a 1.
 */
function legGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const ankle = 0.74;
  const quarter = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(new THREE.Vector2(Math.max(0, cx + rx * Math.cos(a)), cy + ry * Math.sin(a)));
    }
  };
  // sola do tornozelo, achatada
  quarter(0, -0.86, ankle, 0.14, -Math.PI / 2, 0, 6);
  // canela até a coxa
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const y = -0.86 + t * 1.06;
    pts.push(new THREE.Vector2(ankle + (1 - ankle) * Math.sin((t * Math.PI) / 2), y));
  }
  // coxa arredondada até o centro do quadril
  quarter(0, 0.2, 1, 0.8, 0, Math.PI / 2, 10);
  const geo = new THREE.LatheGeometry(pts, 28);
  geo.computeVertexNormals();
  return geo;
}

/** Estica a perna do quadril até `bottom` (y no espaço do quadril). */
function fitLeg(leg: THREE.Object3D, bottom: number): void {
  const half = (LEG_TOP - bottom) / 2;
  leg.position.y = LEG_TOP - half;
  leg.scale.set(LEG_R[0], half, LEG_R[1]);
}

/**
 * Proporções do boneco: o GLB vem com tronco em ovo e pernas curtas. O corpo sobe LEG_GROW,
 * as pernas crescem até os pés, a metade de baixo do tronco fica mais cheia e o quadril da calça
 * murcha um pouco para não estufar. O topo do tronco fica igual (a gola da polo encaixa nele).
 */
function reshape(scene: THREE.Object3D): void {
  const body = scene.getObjectByName("Boneco");
  if (!body) return;
  body.position.y += LEG_GROW;
  const leg = legGeometry();
  for (const side of ["D", "E"]) {
    const perna = scene.getObjectByName(`Perna_${side}`) as THREE.Mesh | undefined;
    const tenis = scene.getObjectByName(`Tenis_${side}`);
    if (!perna?.isMesh || !tenis) continue;
    tenis.position.y -= LEG_GROW;
    perna.geometry = leg;
    fitLeg(perna, tenis.position.y);
  }
  const shirt = scene.getObjectByName("Camiseta") as THREE.Mesh | undefined;
  if (shirt?.isMesh) {
    // metade de baixo vira superelipse: barriga menos afunilada, ainda arredondada
    const geo = shirt.geometry.clone();
    const pos = geo.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y >= 0) continue;
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      if (r < 1e-6) continue;
      const k = Math.sqrt(1 - Math.abs(y) ** 3) / r;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    geo.computeVertexNormals();
    shirt.geometry = geo;
  }
  scene.getObjectByName("Quadril_Calca")?.scale.set(0.36, 0.2, 0.27);
}

async function loadModel(url: number, root: string): Promise<{ model: Loaded; animations: THREE.AnimationClip[] }> {
  const gltf = await loadGLB(url);
  const scene = gltf.scene;
  scene.getObjectByName("Pedestal")?.removeFromParent();
  reshape(scene);
  const body = scene.getObjectByName(root) ?? scene;
  const h = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3()).y;
  return { model: { scene, clips: new Map(), scale: TARGET_HEIGHT / h }, animations: gltf.animations };
}

/** Troca a cor por vértice por um fator de sombra em torno de 1, para a cor do material tingir. */
function tintable(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = src.clone();
  const col = geo.getAttribute("color");
  if (!col) return geo;
  const lum = new Float32Array(col.count);
  let sum = 0;
  for (let i = 0; i < col.count; i++) {
    lum[i] = 0.2126 * col.getX(i) + 0.7152 * col.getY(i) + 0.0722 * col.getZ(i);
    sum += lum[i];
  }
  const mean = sum / col.count || 1;
  const out = new Float32Array(col.count * 3);
  for (let i = 0; i < col.count; i++) out.fill(THREE.MathUtils.clamp(lum[i] / mean, 0.55, 1.5), i * 3, i * 3 + 3);
  geo.setAttribute("color", new THREE.BufferAttribute(out, 3));
  return geo;
}

function takeParts(scene: THREE.Object3D): void {
  const geo = (name: string) => {
    const mesh = scene.getObjectByName(name) as THREE.Mesh | undefined;
    return mesh?.isMesh ? tintable(mesh.geometry) : undefined;
  };
  parts.hair = geo("Cabelo_Volume");
  parts.hairCap = geo("Cabelo_Bone");
  parts.beard = geo("Barba");
  const collar = COLLAR_PARTS.map((n) => scene.getObjectByName(n) as THREE.Mesh | undefined);
  if (collar.every((m) => m?.isMesh)) parts.collar = collar as THREE.Mesh[];
}

/** Peças da polo, na ordem: gola, vista (faixa dos botões) e os dois botões. */
const COLLAR_PARTS = ["Polo_Gola", "Polo_Vista", "Polo_Botao_1", "Polo_Botao_2"];

/** Raio interno das peças da skin polo: a casca começa colada na cabeça. */
const SCALP = 0.553;
/** Pele do Rosto fica em 0,56: fio que aparecia não pode afundar abaixo disto ao afinar. */
const SKIN_TOP = 0.566;

/** Afina ou engrossa a casca sem abrir falhas onde o fio já aparecia. */
function thicken(r: number, k: number): number {
  return r < SKIN_TOP ? r : Math.max(SKIN_TOP, SCALP + (r - SCALP) * k);
}
/** Até este ângulo a partir do topo o cabelo não muda; daí até a ponta ele estica ou encolhe. */
const PIVOT = THREE.MathUtils.degToRad(30);
/** Abaixo deste ângulo a casca deixaria a cabeça, então o cabelo passa a cair reto. */
const HANG = THREE.MathUtils.degToRad(105);
const AZ_BINS = 36;

interface HairShape {
  /** Graus somados à ponta do cabelo; negativo encurta. A frente do rosto não cresce. */
  length: number;
  /** Multiplica a espessura da casca. */
  thick: number;
  /** Meia largura da crista: o que fica fora dela deita dentro da cabeça. */
  crest?: number;
  bun?: boolean;
  curls?: boolean;
  /** A parte que cai abaixo da cabeça assenta nas costas, abre em mechas e termina em U irregular. */
  drape?: boolean;
}

/** Todos os penteados saem do mesmo cabelo da skin polo. Índices de HAIR_STYLES. */
const HAIR_SHAPES: Record<number, HairShape> = {
  1: { length: -12, thick: 0.55 },
  2: { length: 40, thick: 1, drape: true },
  3: { length: 80, thick: 1, drape: true },
  4: { length: -12, thick: 0.55, bun: true },
  5: { length: -10, thick: 2.6, crest: 0.1 },
  6: { length: 40, thick: 1.1, curls: true },
  7: { length: 0, thick: 1 },
};
/** Espessura da barba por índice de BEARDS. */
const BEARD_THICK = [0, 0.3, 1];

const shaped = new Map<string, THREE.BufferGeometry>();

const azimuth = (x: number, z: number) => Math.atan2(x, z);

/** Ângulo da ponta do cabelo (a partir do topo) para cada faixa de azimute. */
function tipTable(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Float32Array {
  const tips = new Float32Array(AZ_BINS).fill(PIVOT + 0.1);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const bin = Math.floor(((azimuth(x, z) + Math.PI) / (Math.PI * 2)) * AZ_BINS) % AZ_BINS;
    tips[bin] = Math.max(tips[bin], Math.acos(THREE.MathUtils.clamp(y / Math.hypot(x, y, z), -1, 1)));
  }
  return tips;
}

/** Ponta interpolada entre faixas, para a deformação não fazer degraus. */
function tipAt(tips: Float32Array, az: number): number {
  const f = ((az + Math.PI) / (Math.PI * 2)) * AZ_BINS - 0.5;
  const i = Math.floor(f);
  const a = tips[(i + AZ_BINS) % AZ_BINS];
  const b = tips[(i + 1) % AZ_BINS];
  return a + (b - a) * (f - i);
}

/** Grade dos cachos: um cacho por célula, com raio e altura do relevo. */
const CURL_CELL = 0.11;
const CURL_R = 0.075;
const CURL_H = 0.055;

/** Centro fixo do cacho de uma célula da grade (sorteio por hash, igual para todos os bonecos). */
function curlCenter(i: number, j: number, k: number, out: THREE.Vector3): THREE.Vector3 {
  let h = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(k, 83492791)) >>> 0;
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  return out.set((i + rnd()) * CURL_CELL, (j + rnd()) * CURL_CELL, (k + rnd()) * CURL_CELL);
}

/**
 * Cachos: cada vértice sobe num domo em volta do centro de cacho mais próximo,
 * e o vão entre cachos escurece. underCap mantém o topo liso para caber no boné.
 */
function addCurls(geo: THREE.BufferGeometry, underCap: boolean): void {
  const pos = geo.getAttribute("position");
  const col = geo.getAttribute("color");
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let v = 0; v < pos.count; v++) {
    p.fromBufferAttribute(pos, v);
    const ci = Math.floor(p.x / CURL_CELL), cj = Math.floor(p.y / CURL_CELL), ck = Math.floor(p.z / CURL_CELL);
    let best = Infinity;
    for (let i = ci - 1; i <= ci + 1; i++)
      for (let j = cj - 1; j <= cj + 1; j++)
        for (let k = ck - 1; k <= ck + 1; k++) best = Math.min(best, p.distanceTo(curlCenter(i, j, k, c)));
    let bump = Math.sqrt(Math.max(0, 1 - (best / CURL_R) ** 2));
    if (underCap) bump *= 1 - THREE.MathUtils.smoothstep(p.y, 0.05, 0.25);
    n.set(p.x, p.y - Math.min(p.y, 0), p.z).normalize();
    p.addScaledVector(n, bump * CURL_H);
    pos.setXYZ(v, p.x, p.y, p.z);
    if (col) {
      const k = 0.7 + 0.45 * bump;
      col.setXYZ(v, col.getX(v) * k, col.getY(v) * k, col.getZ(v) * k);
    }
  }
  geo.computeVertexNormals();
}

function drape(p: THREE.Vector3, d: number, az: number, hem: number): void {
  const back = THREE.MathUtils.smoothstep(Math.abs(az), THREE.MathUtils.degToRad(95), THREE.MathUtils.degToRad(150));
  const side = 1 - back;
  const clump = (0.6 * Math.sin(9 * az) + 0.4 * Math.sin(14 * az + 1.3)) * side;
  const len = Math.min(d, hem * (0.86 + 0.14 * back + 0.05 * clump));
  const ease = THREE.MathUtils.smoothstep(len, 0, 0.5);
  let k = 1 - 0.1 * back * ease + 0.14 * side * ease;
  k += 0.05 * clump * THREE.MathUtils.smoothstep(len, 0, 0.3);
  p.x *= k;
  p.z *= k;
  p.y -= len;
}

/** Muda comprimento e volume do cabelo mantendo os fios (cor por vértice) onde estão. */
function shapeHair(src: THREE.BufferGeometry, shape: HairShape, underCap: boolean): THREE.BufferGeometry {
  const geo = src.clone();
  const pos = geo.getAttribute("position");
  const col = geo.getAttribute("color");
  const tips = tipTable(pos);
  const grow = THREE.MathUtils.degToRad(shape.length);
  const p = new THREE.Vector3();
  const thetaOf = (x: number, y: number, z: number) => {
    const az = azimuth(x, z);
    const theta = Math.acos(THREE.MathUtils.clamp(y / Math.hypot(x, y, z), -1, 1));
    const t = THREE.MathUtils.clamp((theta - PIVOT) / (tipAt(tips, az) - PIVOT), 0, 1);
    const sides = THREE.MathUtils.smoothstep(Math.abs(az), THREE.MathUtils.degToRad(40), THREE.MathUtils.degToRad(80));
    return theta + grow * t * (grow > 0 ? sides : 0.3 + 0.7 * sides);
  };
  let hem = 0;
  if (shape.drape) {
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      hem = Math.max(hem, (thetaOf(x, y, z) - HANG) * thicken(Math.hypot(x, y, z), shape.thick));
    }
    hem *= 0.82;
  }
  const draped: [number, number][] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, y, z);
    const az = azimuth(x, z);
    const theta = thetaOf(x, y, z);
    let rr = thicken(r, shape.thick);
    if (shape.crest !== undefined) {
      const out = THREE.MathUtils.smoothstep(Math.abs(x), shape.crest, shape.crest + 0.08);
      rr += (SCALP - 0.03 - rr) * out;
    }
    const drop = Math.max(0, theta - HANG);
    p.setFromSphericalCoords(rr, Math.min(theta, HANG), az);
    if (shape.drape && drop > 0) {
      drape(p, drop * rr, az, hem);
      const w = THREE.MathUtils.smoothstep(drop * rr, 0, 0.25);
      if (col) {
        const k = Math.min(1, (1 - 0.2 * w) / Math.max(col.getX(i), 1e-3));
        col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
      }
      draped.push([i, w]);
    } else {
      p.y -= drop * rr;
    }
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  const nor = geo.getAttribute("normal");
  const radial = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const [i, w] of draped) {
    radial.set(pos.getX(i), 0, pos.getZ(i)).normalize();
    n.fromBufferAttribute(nor, i);
    if (n.x * radial.x + n.z * radial.z < 0) radial.negate();
    n.lerp(radial, w).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  if (shape.curls) addCurls(geo, underCap);
  if (!shape.bun) return geo;
  const bun = src.clone();
  bun.applyMatrix4(
    new THREE.Matrix4()
      .makeTranslation(0, 0.36, -0.5)
      .multiply(new THREE.Matrix4().makeRotationX(-1.03))
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI))
      .multiply(new THREE.Matrix4().makeScale(0.46, 0.46, 0.46)),
  );
  const merged = mergeGeometries([geo, bun]) ?? geo;
  geo.dispose();
  bun.dispose();
  return merged;
}

/** Penteado pronto para a Cabeca (compartilhado entre bonecos). undefined = careca. */
function hairFor(style: number, underCap: boolean): THREE.BufferGeometry | undefined {
  const base = HAIR_SHAPES[style];
  const src = underCap ? (parts.hairCap ?? parts.hair) : parts.hair;
  if (!base || !src) return undefined;
  const shape = underCap ? { length: base.length, thick: Math.min(base.thick, 1), curls: base.curls, drape: base.drape } : base;
  const key = `${style}|${underCap}`;
  let geo = shaped.get(key);
  if (!geo) {
    geo = shapeHair(src, shape, underCap);
    shaped.set(key, geo);
  }
  return geo;
}

/** Barba pela espessura da casca: a curta é a cheia rente ao rosto. */
function beardFor(kind: number): THREE.BufferGeometry | undefined {
  const thick = BEARD_THICK[kind] ?? 0;
  if (!thick || !parts.beard) return undefined;
  const key = `barba|${kind}`;
  let geo = shaped.get(key);
  if (!geo) {
    geo = parts.beard.clone();
    const pos = geo.getAttribute("position");
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const r = v.length();
      v.setLength(thicken(r, thick));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    shaped.set(key, geo);
  }
  return geo;
}

async function loadSkin(id: number, def: SkinDef): Promise<void> {
  const { model, animations } = await loadModel(def.url, def.root);
  for (const a of animations) model.clips.set(a.name, cleanClip(a));
  skins.set(id, model);
  if (id === PARTS_SKIN) takeParts(model.scene);
}

/**
 * Carrega os GLBs uma vez, o boneco base e as skins ao mesmo tempo. Resolve false se o boneco base falhar
 * (o jogo segue com o procedural).
 */
export function preloadCharacter(): Promise<boolean> {
  if (loading) return loading;
  const skinsDone = Promise.all(
    Object.entries(SKIN_DEFS).map(([id, def]) => loadSkin(Number(id), def).catch((err) => console.warn(`skin ${id} do boneco não carregou`, err))),
  );
  loading = loadModel(MODEL_URL, "Boneco")
    .then(async ({ model, animations }) => {
      for (const a of animations) model.clips.set(a.name, cleanClip(a));
      await skinsDone;
      loaded = model;
      return true;
    })
    .catch((err) => {
      console.warn("boneco.glb não carregou, usando boneco procedural", err);
      return false;
    });
  return loading;
}

/** Carrega o Zombie.fbx com sua animação embutida de zumbi em movimento, sob demanda no modo Zumbis. */
export function preloadZombie(): Promise<boolean> {
  if (loadingZombie) return loadingZombie;
  const texture = loadSkiaTexture(ZOMBIE_TEX, true).then(
    (tex) => {
      zombieTexture = tex;
    },
    (err) => console.warn("Falha ao carregar zombie_texture.png, usando cor padrão", err),
  );
  loadingZombie = Promise.all([loadFBX(ZOMBIE_FBX), texture])
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
  const inner = SkeletonUtils.clone(loadedZombie.scene) as THREE.Group;
  inner.scale.setScalar(loadedZombie.scale);
  const mats: THREE.Material[] = [];
  // O FBX do zumbi é denso: só projeta sombra no mapa em qualidade Alta para segurar FPS nas hordas
  const castShadow = getSettings().quality === "alta";

  inner.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (mesh.isMesh) {
      mesh.castShadow = castShadow;
      mesh.receiveShadow = castShadow;
      mesh.frustumCulled = false;
      const map = zombieTexture;
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
    play() {},
    sit() {
      return 0;
    },
    dispose() {
      mixer.stopAllAction();
      for (const m of mats) m.dispose();
    },
  };
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

const SNEAKERS = 2;

function addShoes(inner: THREE.Object3D, kind: number, skin: THREE.Color, mats: THREE.Material[]): void {
  if (kind === SNEAKERS) return;
  const mk = (color: THREE.ColorRepresentation, roughness = 0.6, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    mats.push(m);
    return m;
  };
  const m = {
    skin: mk(skin, 0.6),
    sock: mk("#e8e4dc", 0.95),
    sockTip: mk("#3a6fc4", 0.9),
    leather: mk("#2b1b12", 0.3),
    heel: mk("#c0262e", 0.25),
    boot: mk("#6b4a2b", 0.8),
    steel: mk("#a7b0b8", 0.3, 0.85),
    rubber: mk("#f2c230", 0.35),
    sole: mk("#1d1a17", 0.9),
  };
  for (const side of ["D", "E"]) {
    const shoe = inner.getObjectByName(`Tenis_${side}`);
    const hip = inner.getObjectByName(`Quadril_${side}`);
    if (!shoe || !hip) continue;
    shoe.visible = false;
    const { x, y, z } = shoe.position;
    const ball = (mat: THREE.Material, s: [number, number, number], dy = 0, dz = 0) =>
      extra(hip, new THREE.SphereGeometry(1, 24, 16), mat, [x, y + dy, z + dz], s);
    const sole = (sx: number, sz: number) => ball(m.sole, [sx, 0.03, sz], -0.065, 0.01);
    const shaft = (mat: THREE.Material, top: number, r: number) => {
      const h = top - (y - 0.09);
      return extra(hip, new THREE.CylinderGeometry(r, r - 0.008, h, 24), mat, [0, y - 0.09 + h / 2, 0]);
    };
    switch (kind) {
      case 0:
        ball(m.skin, [0.13, 0.075, 0.22], -0.015);
        break;
      case 1:
        ball(m.sock, [0.14, 0.08, 0.23], -0.01);
        ball(m.sockTip, [0.105, 0.065, 0.08], -0.02, 0.17);
        ball(m.sockTip, [0.105, 0.065, 0.07], -0.02, -0.14);
        break;
      case 3:
        ball(m.leather, [0.14, 0.075, 0.26], -0.015, 0.01);
        sole(0.145, 0.265);
        break;
      case 4: {
        const leg = inner.getObjectByName(`Perna_${side}`);
        if (leg) fitLeg(leg, y + 0.05);
        ball(m.heel, [0.15, 0.08, 0.26], 0.01, 0.03).rotation.x = 0.22;
        extra(hip, new THREE.CylinderGeometry(0.032, 0.018, 0.085, 12), m.heel, [x, y - 0.05, z - 0.16]);
        break;
      }
      case 5:
        ball(m.boot, [0.17, 0.1, 0.26], 0, 0.01);
        shaft(m.boot, y + 0.16, 0.185);
        ball(m.steel, [0.155, 0.085, 0.1], 0, 0.17);
        sole(0.178, 0.27);
        break;
      case 6: {
        ball(m.rubber, [0.16, 0.095, 0.25], 0, 0.01);
        const top = y + 0.22;
        shaft(m.rubber, top, 0.2);
        extra(hip, new THREE.TorusGeometry(0.2, 0.022, 8, 24), m.rubber, [0, top, 0]).rotation.x = Math.PI / 2;
        sole(0.168, 0.26);
        break;
      }
      default:
        shoe.visible = true;
        break;
    }
  }
}

const HEAD_R = 0.56;
const FRONT = Math.PI / 2;

function shell(head: THREE.Object3D, mat: THREE.Material, r: number, theta0: number, theta1: number, gap = 0): THREE.Mesh {
  const geo = new THREE.SphereGeometry(r, 36, 24, FRONT + gap / 2, Math.PI * 2 - gap, theta0, theta1 - theta0);
  return extra(head, geo, mat, [0, 0, 0]);
}

function addHair(head: THREE.Object3D, style: number, mat: THREE.Material): void {
  const R = HEAD_R + 0.04;
  switch (style) {
    case 2:
      shell(head, mat, R, 0, 1.05);
      shell(head, mat, R, 1.0, 1.95, 1.7);
      break;
    case 3:
      shell(head, mat, R, 0, 1.05);
      shell(head, mat, R, 1.0, 2.25, 1.7);
      extra(head, new THREE.CapsuleGeometry(0.4, 0.45, 6, 16), mat, [0, -0.58, -0.3], [1, 1, 0.42]);
      for (const x of [-0.46, 0.46]) extra(head, new THREE.CapsuleGeometry(0.12, 0.35, 6, 12), mat, [x, -0.5, -0.05]);
      break;
    case 4:
      shell(head, mat, R - 0.01, 0, 1.25);
      shell(head, mat, R - 0.01, 1.2, 1.75, 2.2);
      extra(head, new THREE.SphereGeometry(0.21, 20, 14), mat, [0, 0.4, -0.5]);
      extra(head, new THREE.TorusGeometry(0.15, 0.035, 8, 20), mat, [0, 0.31, -0.43]).rotation.x = 0.9;
      break;
    case 5:
      for (let i = 0; i <= 10; i++) {
        const a = 0.55 - (i / 10) * 2.1;
        const d = R + 0.06;
        const lobe = extra(head, new THREE.SphereGeometry(1, 14, 10), mat, [0, Math.cos(a) * d, Math.sin(a) * d], [0.075, 0.2 - Math.abs(i - 4) * 0.012, 0.15]);
        lobe.rotation.x = a;
      }
      break;
    case 6: {
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

function addAccessory(head: THREE.Object3D, body: THREE.Object3D, kind: number, shirt: THREE.Color, skin: THREE.Color, mats: THREE.Material[]): void {
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
    addBadge(body, shirt, skin, mats);
  }
}

const TOP = { tee: 0, shirt: 1, dressShirt: 2, polo: 3, tank: 4, hoodie: 5, dress: 6 } as const;
const BOTTOM = { pants: 0, bermuda: 1, shorts: 2, skirt: 3, longSkirt: 4 } as const;

function legProfile(yu: number): number {
  if (yu >= 0.2) return Math.sqrt(Math.max(0, 1 - ((yu - 0.2) / 0.8) ** 2));
  const t = THREE.MathUtils.clamp((yu + 0.86) / 1.06, 0, 1);
  return 0.74 + 0.26 * Math.sin((t * Math.PI) / 2);
}

function addOutfit(inner: THREE.Object3D, body: THREE.Object3D, dna: AvatarDNA, palette: Record<string, THREE.Color>, mats: THREE.Material[]): void {
  const mk = (color: THREE.ColorRepresentation, roughness = 0.8, side: THREE.Side = THREE.FrontSide) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, side });
    mats.push(m);
    return m;
  };
  const shirt = palette.Camiseta;
  const pants = palette.Jeans;
  const skin = palette.Pele;
  const top = dna.top;
  const bottom = top === TOP.dress ? BOTTOM.skirt : dna.bottom;
  const lower = top === TOP.dress ? shirt : pants;
  const recolor = (name: string, color: THREE.Color) => {
    const m = inner.getObjectByName(name) as THREE.Mesh | undefined;
    if (m?.isMesh) (m.material as THREE.MeshStandardMaterial).color.copy(color);
  };
  const trim = mk(shirt.clone().multiplyScalar(0.8));
  const button = mk("#f4f1ea", 0.4);

  if ((top === TOP.shirt || top === TOP.dressShirt || top === TOP.polo) && parts.collar) {
    const [gola, vista, ...buttons] = parts.collar;
    const add = (src: THREE.Mesh, mat: THREE.Material) => {
      const m = new THREE.Mesh(src.geometry, mat);
      m.position.copy(src.position);
      m.quaternion.copy(src.quaternion);
      m.scale.copy(src.scale);
      m.castShadow = true;
      body.add(m);
    };
    add(gola, trim);
    if (top === TOP.polo) {
      add(vista, trim);
      for (const b of buttons) add(b, button);
    } else {
      for (let y = 1.38; y > 0.92; y -= 0.06) extra(chestAnchor(body, 0, y), new THREE.BoxGeometry(0.06, 0.066, 0.014), trim, [0, 0, 0.002]);
      for (const y of [1.42, 1.28, 1.14, 1.0]) {
        extra(chestAnchor(body, 0, y), new THREE.CylinderGeometry(0.018, 0.018, 0.012, 12), button, [0, 0, 0.012]).rotation.x = Math.PI / 2;
      }
    }
  }

  if (top === TOP.dressShirt || top === TOP.hoodie) {
    const handMat = mk(skin, 0.6);
    for (const side of ["D", "E"]) {
      const arm = inner.getObjectByName(`Braco_${side}`) as THREE.Mesh | undefined;
      if (!arm?.isMesh) continue;
      (arm.material as THREE.MeshStandardMaterial).color.copy(shirt);
      extra(arm, new THREE.CylinderGeometry(1, 1, 1, 20), trim, [0, -0.76, 0], [0.7, 0.16, 0.7]);
      extra(arm, new THREE.SphereGeometry(1, 16, 12), handMat, [0, -0.97, 0], [0.85, 0.28, 0.78]);
    }
  }

  if (top === TOP.tank) {
    recolor("Manga_D", skin);
    recolor("Manga_E", skin);
  }

  if (top === TOP.hoodie) {
    const hoodMat = mk(shirt);
    const rim = extra(body, new THREE.TorusGeometry(0.27, 0.1, 12, 24, Math.PI * 1.3), hoodMat, [0, 1.55, -0.08]);
    rim.rotation.set(Math.PI / 2 + 0.35, 0, Math.PI * 0.85);
    rim.scale.set(1.15, 1, 0.9);
    extra(body, new THREE.SphereGeometry(1, 20, 14), hoodMat, [0, 1.42, -0.24], [0.27, 0.2, 0.13]).rotation.x = 0.35;
    extra(body, new THREE.SphereGeometry(1, 20, 14), trim, [0, 1.44, -0.27], [0.17, 0.12, 0.08]).rotation.x = 0.35;
    extra(chestAnchor(body, 0, 1.0), new THREE.BoxGeometry(0.4, 0.15, 0.02), trim, [0, 0, 0.004]);
    const cord = mk("#f4f1ea", 0.6);
    for (const x of [-0.08, 0.08]) extra(chestAnchor(body, x, 1.4), new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), cord, [0, -0.05, 0.012]);
  }

  if (bottom === BOTTOM.pants) return;
  const lowerMat = mk(lower, 0.85, THREE.DoubleSide);
  for (const side of ["D", "E"]) {
    recolor(`Perna_${side}`, skin);
    if (bottom !== BOTTOM.bermuda && bottom !== BOTTOM.shorts) continue;
    const hip = inner.getObjectByName(`Quadril_${side}`);
    const shoe = inner.getObjectByName(`Tenis_${side}`);
    if (!hip || !shoe) continue;
    const half = (LEG_TOP - shoe.position.y) / 2;
    const hem = bottom === BOTTOM.bermuda ? -0.15 : 0.3;
    const top_ = 0.75;
    const rTop = 1.12;
    const rHem = legProfile(hem) * 1.14;
    const h = (top_ - hem) * half;
    const tube = extra(hip, new THREE.CylinderGeometry(rTop, rHem, 1, 24), lowerMat, [0, LEG_TOP - half + ((top_ + hem) / 2) * half, 0]);
    tube.scale.set(LEG_R[0], h, LEG_R[1]);
  }
  if (bottom === BOTTOM.skirt || bottom === BOTTOM.longSkirt) {
    const long = bottom === BOTTOM.longSkirt;
    const waist = 0.97;
    const hemY = long ? 0.2 : 0.46;
    const hemR = long ? 0.6 : 0.5;
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const s = i / 12;
      pts.push(new THREE.Vector2(0.4 + (hemR - 0.4) * Math.sin((s * Math.PI) / 2) ** 0.7, waist - s * (waist - hemY)));
    }
    pts.reverse();
    const skirt = extra(body, new THREE.LatheGeometry(pts, 32), lowerMat, [0, 0, 0]);
    skirt.scale.set(1, 1, 0.8);
    const band = extra(body, new THREE.TorusGeometry(hemR, 0.018, 6, 40), mk(lower.clone().multiplyScalar(0.8)), [0, hemY + 0.01, 0]);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1, 0.8, 1);
  }
}

const POCKET_AT: [number, number] = [0.17, 1.26];
const TORSO = { rx: 0.42, ry: 0.5, rz: 0.32, cy: 1.2 };

function chestAnchor(body: THREE.Object3D, x: number, y: number): THREE.Group {
  const { rx, ry, rz, cy } = TORSO;
  const t = (y - cy) / ry;
  const r2 = t >= 0 ? 1 - t * t : 1 - (-t) ** 3;
  const dr2 = t >= 0 ? (-2 * t) / ry : (3 * t * t) / ry;
  const z = rz * Math.sqrt(Math.max(0, r2 - (x / rx) ** 2));
  const normal = new THREE.Vector3((2 * x) / (rx * rx), -dr2, (2 * z) / (rz * rz)).normalize();
  const anchor = new THREE.Group();
  anchor.position.set(x, y, z);
  anchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  body.add(anchor);
  return anchor;
}

function addBadge(body: THREE.Object3D, shirt: THREE.Color, skin: THREE.Color, mats: THREE.Material[]): void {
  const mk = (color: THREE.ColorRepresentation, roughness = 0.6, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    mats.push(m);
    return m;
  };
  const anchor = chestAnchor(body, ...POCKET_AT);

  const box = (w: number, h: number, d: number, mat: THREE.Material, px: number, py: number, pz: number) =>
    extra(anchor, new THREE.BoxGeometry(w, h, d), mat, [px, py, pz]);
  const pocket = mk(shirt.clone().multiplyScalar(0.82), 0.85);
  const pocketTop = 0.09;
  box(0.23, 0.23, 0.03, pocket, 0, pocketTop - 0.115, 0.002);
  box(0.235, 0.03, 0.036, mk(shirt.clone().multiplyScalar(0.7), 0.85), 0, pocketTop - 0.015, 0.003);

  const steel = mk("#d5dade", 0.35, 0.3);
  box(0.05, 0.07, 0.008, steel, 0, pocketTop - 0.025, 0.026);
  box(0.05, 0.012, 0.03, steel, 0, pocketTop + 0.004, 0.012);

  const card = new THREE.Group();
  card.position.set(0, pocketTop - 0.05, 0.034);
  card.rotation.set(0.04, 0, 0.05);
  anchor.add(card);
  const cardBox = (w: number, h: number, d: number, mat: THREE.Material, px: number, py: number, pz: number) =>
    extra(card, new THREE.BoxGeometry(w, h, d), mat, [px, py, pz]);
  cardBox(0.016, 0.03, 0.008, steel, 0, 0, 0);
  cardBox(0.15, 0.22, 0.012, mk("#f7f5f0", 0.5), 0, -0.125, 0);
  const blue = mk("#2f6fdf", 0.5);
  cardBox(0.15, 0.05, 0.014, blue, 0, -0.04, 0.001);
  cardBox(0.055, 0.07, 0.014, mk(skin, 0.6), -0.036, -0.115, 0.001);
  const ink = mk("#8a8f96", 0.7);
  cardBox(0.05, 0.012, 0.014, ink, 0.032, -0.097, 0.001);
  cardBox(0.05, 0.012, 0.014, ink, 0.032, -0.125, 0.001);
  cardBox(0.11, 0.016, 0.014, blue, 0, -0.2, 0.001);
}

const HIDDEN_PARTS = ["Bochecha_D", "Bochecha_E", "Cinto"];

function hideParts(inner: THREE.Object3D): void {
  for (const n of HIDDEN_PARTS) {
    const o = inner.getObjectByName(n);
    if (o) o.visible = false;
  }
}

function addPart(head: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material): void {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  head.add(m);
}

function dress(inner: THREE.Object3D, dna: AvatarDNA, mats: THREE.Material[]): void {
  const palette = paletteFor(dna);
  inner.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    const src = mesh.material as THREE.MeshStandardMaterial;
    const m = src.clone();
    const color = mesh.name.startsWith("Olho_") ? new THREE.Color(EYE_COLORS[dna.eyes]) : palette[src.name];
    if (color) m.color.copy(color);
    if (src.name.startsWith("Cabelo")) m.roughness = 0.9;
    mesh.material = m;
    mats.push(m);
  });

  const head = inner.getObjectByName("Cabeca");
  const body = inner.getObjectByName("Boneco");
  const strands = parts.hair !== undefined;
  const baseHair = !strands && dna.hair !== 0 && dna.hair !== 5 && dna.hair !== 7;
  for (const n of ["Cabelo_Curto", "Mecha_1", "Mecha_2", "Mecha_3"]) {
    const o = inner.getObjectByName(n);
    if (o) o.visible = baseHair;
  }
  const cap = inner.getObjectByName("Bone");
  if (cap) cap.visible = dna.accessory === 2;
  const hairMat = new THREE.MeshStandardMaterial({ color: palette.Cabelo, roughness: 0.9 });
  mats.push(hairMat);
  const strandMat = new THREE.MeshStandardMaterial({ color: palette.Cabelo, roughness: 0.9, vertexColors: true, side: THREE.DoubleSide });
  mats.push(strandMat);
  if (head) {
    if (strands) {
      const hair = hairFor(dna.hair, dna.accessory === 2);
      if (hair) addPart(head, hair, strandMat);
    } else {
      addHair(head, dna.hair, hairMat);
    }
    const beardColor = new THREE.Color(HAIR_COLORS[dna.beardColor] ?? HAIR_COLORS[dna.hairColor]);
    const beard = beardFor(dna.beard);
    if (beard) {
      const beardStrands = strandMat.clone();
      beardStrands.color.copy(beardColor);
      mats.push(beardStrands);
      addPart(head, beard, beardStrands);
    } else if (dna.beard) {
      const beardMat = new THREE.MeshStandardMaterial({ color: beardColor, roughness: 0.9 });
      mats.push(beardMat);
      addBeard(head, beardMat);
    }
    addGlasses(head, dna.glasses, mats);
  }
  if (body) addOutfit(inner, body, dna, palette, mats);
  if (head && body) addAccessory(head, body, dna.accessory, palette.Camiseta, palette.Pele, mats);
  addShoes(inner, dna.shoes, palette.Pele, mats);
}

interface GestureOffsets {
  armDx: number;
  armDy: number;
  armDz: number;
  armEx: number;
  armEy: number;
  armEz: number;
  bodyX: number;
  bodyY: number;
  bodyZ: number;
  headX: number;
  headY: number;
}

function computeGesture(g: { item: ItemId; time: number; duration: number } | null, dt: number): { next: typeof g; off: GestureOffsets } {
  const off: GestureOffsets = { armDx: 0, armDy: 0, armDz: 0, armEx: 0, armEy: 0, armEz: 0, bodyX: 0, bodyY: 0, bodyZ: 0, headX: 0, headY: 0 };
  if (!g) return { next: null, off };
  g.time += dt;
  const u = g.time / g.duration;
  if (u >= 1) return { next: null, off };
  const peak = Math.sin(u * Math.PI);
  switch (g.item) {
    case "resma":
      off.bodyY = -0.35 * peak;
      off.bodyX = 0.12 * peak;
      off.armDx = 1.35 * peak;
      off.armDy = -0.25 * peak;
      off.armDz = 0.3 * peak;
      off.headY = -0.25 * peak;
      break;
    case "pasta":
      off.armDx = -0.75 * peak;
      off.armDz = -0.35 * peak;
      off.armEx = -0.75 * peak;
      off.armEz = 0.35 * peak;
      off.bodyX = 0.15 * peak;
      off.headX = -0.2 * peak;
      break;
    case "aviao":
      if (u < 0.35) {
        const p = u / 0.35;
        off.armDx = 0.5 * p;
        off.armDz = -0.25 * p;
        off.bodyY = 0.2 * p;
        off.headY = 0.15 * p;
      } else {
        const p = (1 - u) / 0.65;
        off.armDx = -0.95 * p;
        off.armDz = 0.15 * p;
        off.bodyX = -0.2 * p;
        off.headX = 0.2 * p;
      }
      break;
    case "grampeador":
      if (u < 0.25) {
        const p = u / 0.25;
        off.armDx = -0.8 * p;
      } else {
        const p = (1 - u) / 0.75;
        off.armDx = -0.3 * p;
        off.armDz = 0.15 * p;
        off.bodyX = 0.12 * p;
      }
      break;
    case "poca":
      off.bodyZ = -0.22 * peak;
      off.bodyY = 0.18 * peak;
      off.armEx = 1.15 * peak;
      off.armEy = 0.25 * peak;
      off.armEz = -0.4 * peak;
      off.headY = 0.3 * peak;
      break;
    case "postit":
      off.armDx = -0.9 * peak;
      off.armDz = 0.2 * peak;
      off.bodyX = -0.15 * peak;
      off.headX = 0.25 * peak;
      break;
    case "expresso":
    case "triplo":
      off.armDx = -0.6 * peak;
      off.armDz = -0.25 * peak;
      off.headX = -0.3 * peak;
      break;
  }
  return { next: g, off };
}

function glbCharacter(dna: AvatarDNA, base: Loaded): Character {
  const skin = dna.model !== 0 ? skins.get(dna.model) : undefined;
  const model = skin ?? base;
  const root = new THREE.Group();
  const inner = model.scene.clone(true);
  inner.scale.setScalar(model.scale * (HEIGHT_SCALE[dna.height] ?? 1));
  root.add(inner);

  const mats: THREE.Material[] = [];
  hideParts(inner);
  if (skin) {
    inner.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  } else {
    dress(inner, dna, mats);
  }

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

  const head = inner.getObjectByName("Cabeca");
  const body = inner.getObjectByName("Boneco");
  const ombroD = inner.getObjectByName("Ombro_D");
  const ombroE = inner.getObjectByName("Ombro_E");
  const quadrilD = inner.getObjectByName("Quadril_D");
  const quadrilE = inner.getObjectByName("Quadril_E");
  const bodyBaseY = body?.position.y ?? 0;
  let seated = false;
  let smoothedSpeed = 0;
  let seatedHeadX = 0;
  let seatedHeadY = 0;
  let seatedHeadZ = 0;
  let seatedBodyZ = 0;
  let seatedBodyX = 0;
  let seatedArmD = -0.75;
  let seatedArmE = -0.75;
  let activeGesture: { item: ItemId; time: number; duration: number } | null = null;
  return {
    root,
    update(dt, speed01) {
      if (seated) return;
      const busy = [...actions.values()].some((a) => a.isRunning());
      smoothedSpeed += (speed01 - smoothedSpeed) * Math.min(1, dt * 12);
      if (walk) {
        walk.setEffectiveWeight(busy ? 0 : smoothedSpeed);
        walk.timeScale = 0.6 + smoothedSpeed * 0.8;
      }
      mixer.update(dt);
    },
    playItemGesture(item) {
      activeGesture = { item, time: 0, duration: 0.45 };
    },
    updateSeated(dt, speed, steer, driftDir, boosting) {
      if (!seated) return;
      const speedRatio = Math.min(1, Math.max(0, (speed - 4) / 12));
      const { next, off } = computeGesture(activeGesture, dt);
      activeGesture = next;

      const targetBodyX = Math.max(0, (boosting ? 0.3 : speed > 2 ? 0.2 * speedRatio : 0) + off.bodyX);
      const targetHeadX = (boosting ? -0.24 : speed > 2 ? -0.15 * speedRatio : 0) + off.headX;
      const targetHeadY = -steer * 0.38 - driftDir * 0.42 + off.headY;
      const targetHeadZ = steer * 0.08 + driftDir * 0.12;
      const targetBodyZ = (driftDir !== 0 ? driftDir * 0.18 : -steer * 0.12) + off.bodyZ;

      const armForward = boosting ? -0.2 : -speedRatio * 0.1;
      const targetArmD = -0.75 + armForward + steer * 0.22 + driftDir * 0.18 + off.armDx;
      const targetArmE = -0.75 + armForward - steer * 0.22 - driftDir * 0.18 + off.armEx;

      const k = Math.min(1, dt * 12);
      seatedHeadX += (targetHeadX - seatedHeadX) * k;
      seatedHeadY += (targetHeadY - seatedHeadY) * k;
      seatedHeadZ += (targetHeadZ - seatedHeadZ) * k;
      seatedBodyX += (targetBodyX - seatedBodyX) * k;
      seatedBodyZ += (targetBodyZ - seatedBodyZ) * k;
      seatedArmD += (targetArmD - seatedArmD) * k;
      seatedArmE += (targetArmE - seatedArmE) * k;

      const now = performance.now();
      const jitterTorsoX = boosting ? Math.sin(now * 0.065) * 0.025 : 0;
      const jitterTorsoY = boosting ? Math.cos(now * 0.052) * 0.02 : 0;
      const jitterHeadX = boosting ? -Math.sin(now * 0.07) * 0.025 : 0;
      const jitterHeadZ = boosting ? Math.cos(now * 0.06) * 0.02 : 0;
      const jitterArm = boosting ? Math.sin(now * 0.08) * 0.035 : 0;

      if (head) {
        head.rotation.x = seatedHeadX + jitterHeadX;
        head.rotation.y = seatedHeadY;
        head.rotation.z = seatedHeadZ + jitterHeadZ;
      }
      if (body) {
        body.rotation.x = Math.max(0, seatedBodyX + jitterTorsoX);
        body.rotation.y = (boosting ? jitterTorsoY : 0) + off.bodyY;
        body.rotation.z = seatedBodyZ;
        body.position.set(0, bodyBaseY, 0);
      }
      if (ombroD) {
        ombroD.rotation.x = seatedArmD + jitterArm;
        ombroD.rotation.y = off.armDy;
        ombroD.rotation.z = off.armDz;
      }
      if (ombroE) {
        ombroE.rotation.x = seatedArmE - jitterArm;
        ombroE.rotation.y = off.armEy;
        ombroE.rotation.z = off.armEz;
      }
      let legD_x = -Math.PI / 2;
      let legE_x = -Math.PI / 2;
      if (driftDir > 0) legD_x += 0.38;
      else if (driftDir < 0) legE_x += 0.38;
      else if (speed > 0.1 && speed < 3.2) {
        const push = Math.sin(now * 0.012);
        legD_x += Math.max(0, push) * 0.32;
        legE_x += Math.max(0, -push) * 0.32;
      }
      if (quadrilD) quadrilD.rotation.x += (legD_x - quadrilD.rotation.x) * Math.min(1, dt * 10);
      if (quadrilE) quadrilE.rotation.x += (legE_x - quadrilE.rotation.x) * Math.min(1, dt * 10);
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
        ["Quadril_D", -Math.PI / 2],
        ["Quadril_E", -Math.PI / 2],
        ["Ombro_D", -0.75],
        ["Ombro_E", -0.75],
      ] as const) {
        const o = inner.getObjectByName(n);
        if (o) o.rotation.x = x;
      }
      return bottomOf(
        root,
        ["Quadril_Calca", "Perna_D", "Perna_E"].map((n) => inner.getObjectByName(n)),
      );
    },
    dispose() {
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
  const bodyBaseY = rig.body.position.y;
  let t = 0;
  let aimUntil = 0;
  let seated = false;
  let smoothedSpeed = 0;
  let seatedHeadX = 0;
  let seatedHeadY = 0;
  let seatedHeadZ = 0;
  let seatedBodyZ = 0;
  let seatedBodyX = 0;
  let seatedArmD = -0.75;
  let seatedArmE = -0.75;
  let activeGesture: { item: ItemId; time: number; duration: number } | null = null;
  return {
    root: rig.root,
    update(dt, speed01) {
      if (seated) return;
      smoothedSpeed += (speed01 - smoothedSpeed) * Math.min(1, dt * 12);
      t += dt * Math.max(0.05, smoothedSpeed);
      aimUntil -= dt;
      animateAvatar(rig, smoothedSpeed, t, aimUntil > 0);
    },
    playItemGesture(item) {
      activeGesture = { item, time: 0, duration: 0.45 };
    },
    updateSeated(dt, speed, steer, driftDir, boosting) {
      if (!seated) return;
      const speedRatio = Math.min(1, Math.max(0, (speed - 4) / 12));
      const { next, off } = computeGesture(activeGesture, dt);
      activeGesture = next;

      const targetBodyX = Math.max(0, (boosting ? 0.3 : speed > 2 ? 0.2 * speedRatio : 0) + off.bodyX);
      const targetHeadX = (boosting ? -0.24 : speed > 2 ? -0.15 * speedRatio : 0) + off.headX;
      const targetHeadY = -steer * 0.38 - driftDir * 0.42 + off.headY;
      const targetHeadZ = steer * 0.08 + driftDir * 0.12;
      const targetBodyZ = (driftDir !== 0 ? driftDir * 0.18 : -steer * 0.12) + off.bodyZ;

      const armForward = boosting ? -0.2 : -speedRatio * 0.1;
      const targetArmD = -0.75 + armForward + steer * 0.22 + driftDir * 0.18 + off.armDx;
      const targetArmE = -0.75 + armForward - steer * 0.22 - driftDir * 0.18 + off.armEx;

      const k = Math.min(1, dt * 12);
      seatedHeadX += (targetHeadX - seatedHeadX) * k;
      seatedHeadY += (targetHeadY - seatedHeadY) * k;
      seatedHeadZ += (targetHeadZ - seatedHeadZ) * k;
      seatedBodyX += (targetBodyX - seatedBodyX) * k;
      seatedBodyZ += (targetBodyZ - seatedBodyZ) * k;
      seatedArmD += (targetArmD - seatedArmD) * k;
      seatedArmE += (targetArmE - seatedArmE) * k;

      const now = performance.now();
      const jitterTorsoX = boosting ? Math.sin(now * 0.065) * 0.025 : 0;
      const jitterTorsoY = boosting ? Math.cos(now * 0.052) * 0.02 : 0;
      const jitterHeadX = boosting ? -Math.sin(now * 0.07) * 0.025 : 0;
      const jitterHeadZ = boosting ? Math.cos(now * 0.06) * 0.02 : 0;
      const jitterArm = boosting ? Math.sin(now * 0.08) * 0.035 : 0;

      rig.head.rotation.x = seatedHeadX + jitterHeadX;
      rig.head.rotation.y = seatedHeadY;
      rig.head.rotation.z = seatedHeadZ + jitterHeadZ;
      rig.body.rotation.x = Math.max(0, seatedBodyX + jitterTorsoX);
      rig.body.rotation.y = (boosting ? jitterTorsoY : 0) + off.bodyY;
      rig.body.rotation.z = seatedBodyZ;
      rig.body.position.set(0, bodyBaseY, 0);

      rig.armR.rotation.x = seatedArmD + jitterArm;
      rig.armR.rotation.y = off.armDy;
      rig.armR.rotation.z = off.armDz;
      rig.armL.rotation.x = seatedArmE - jitterArm;
      rig.armL.rotation.y = off.armEy;
      rig.armL.rotation.z = off.armEz;

      let legD_x = -Math.PI / 2;
      let legE_x = -Math.PI / 2;
      if (driftDir > 0) legD_x += 0.38;
      else if (driftDir < 0) legE_x += 0.38;
      else if (speed > 0.1 && speed < 3.2) {
        const push = Math.sin(now * 0.012);
        legD_x += Math.max(0, push) * 0.32;
        legE_x += Math.max(0, -push) * 0.32;
      }
      rig.legR.rotation.x += (legD_x - rig.legR.rotation.x) * Math.min(1, dt * 10);
      rig.legL.rotation.x += (legE_x - rig.legL.rotation.x) * Math.min(1, dt * 10);
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
    dispose() {
      disposeAvatar(rig);
    },
  };
}

export function createCharacter(dna: AvatarDNA): Character {
  return loaded ? glbCharacter(dna, loaded) : proceduralCharacter(dna);
}
