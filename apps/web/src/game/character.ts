import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EYE_COLORS, HAIR_COLORS, PANTS, SHIRTS, SKINS, type AvatarDNA } from "@ec/shared";
import { animateAvatar, buildAvatar, disposeAvatar } from "./avatarMesh";

export type CharacterAction = "throw" | "cafe" | "dash";

/** Boneco renderizado: GLB do romulo-h quando carregado, boneco procedural enquanto isso. */
export interface Character {
  root: THREE.Group;
  update(dt: number, speed01: number): void;
  play(action: CharacterAction): void;
  /** Pose sentada (modo corrida): pernas para a frente e braços no apoio. Para as animações. */
  sit(): void;
  dispose(): void;
}

/** Altura do quadril do boneco em pé, para encaixar no assento. */
export const HIP_HEIGHT = 0.82;

const MODEL_URL = "/assets/characters/boneco.glb";

interface SkinDef {
  url: string;
  /** Nó raiz do corpo, usado para medir a altura. */
  root: string;
}

/** Skins prontas por índice de MODELS. A 1 também empresta cabelo e barba ao crachá. */
const SKIN_DEFS: Record<number, SkinDef> = {
  1: { url: "/assets/characters/boneco_polo_barba.glb", root: "Boneco" },
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

async function loadModel(url: string, root: string): Promise<{ model: Loaded; animations: THREE.AnimationClip[] }> {
  const gltf = await new GLTFLoader().loadAsync(url);
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
    // direção só da posição (do centro da cabeça; na parte que cai, para fora do eixo):
    // vértices repetidos na costura sobem juntos e não abrem fresta
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

/**
 * Cabelo que cai abaixo da cabeça (d = quanto já desceu), em vez de um cilindro reto:
 * dos lados abre um pouco sobre os ombros e se divide em mechas; atrás cai liso e reto.
 * hem é a maior descida: tudo para numa barra fechada (reta atrás, subindo um pouco para a frente),
 * então as pontas serrilhadas do modelo não deixam ver a face de dentro nem o corpo pelos vãos.
 * Só depende de az e d: vértices repetidos na costura andam juntos.
 */
function drape(p: THREE.Vector3, d: number, az: number, hem: number): void {
  const back = THREE.MathUtils.smoothstep(Math.abs(az), THREE.MathUtils.degToRad(95), THREE.MathUtils.degToRad(150));
  const side = 1 - back;
  const clump = (0.6 * Math.sin(9 * az) + 0.4 * Math.sin(14 * az + 1.3)) * side;
  const len = Math.min(d, hem * (0.86 + 0.14 * back + 0.05 * clump));
  const ease = THREE.MathUtils.smoothstep(len, 0, 0.5);
  // costas: vem só um pouco para a nuca, sem colar; lados: abre em A por fora das mangas
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
  // ângulo final a partir do topo: rosto livre, cresce só nas laterais e atrás; encurtar mexe pouco na franja
  const thetaOf = (x: number, y: number, z: number) => {
    const az = azimuth(x, z);
    const theta = Math.acos(THREE.MathUtils.clamp(y / Math.hypot(x, y, z), -1, 1));
    const t = THREE.MathUtils.clamp((theta - PIVOT) / (tipAt(tips, az) - PIVOT), 0, 1);
    const sides = THREE.MathUtils.smoothstep(Math.abs(az), THREE.MathUtils.degToRad(40), THREE.MathUtils.degToRad(80));
    return theta + grow * t * (grow > 0 ? sides : 0.3 + 0.7 * sides);
  };
  // barra do cabelo solto: um pouco acima da ponta mais comprida, para as pontas serrilhadas se alinharem nela
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
      // as pontas do modelo são claras e, esticadas, pareciam desbotar até sumir: o que cai
      // fica no tom do meio do cabelo, descendo aos poucos para não marcar onde começa
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
  // na barra as pontas se juntam e os triângulos deitam: a normal apontaria para cima e a ponta
  // acenderia como uma faixa clara. O que cai é uma cortina: normal horizontal, para fora na casca
  // de fora e para dentro na de dentro. w faz a passagem aos poucos logo abaixo da cabeça
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
  // coque: o mesmo cabelo em miniatura, com a abertura virada para a nuca
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
  // embaixo do boné não cabe crista nem coque
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

/** Carrega os GLBs uma vez. Resolve false se o boneco base falhar (o jogo segue com o procedural). */
export function preloadCharacter(): Promise<boolean> {
  loading ??= loadModel(MODEL_URL, "Boneco")
    .then(async ({ model, animations }) => {
      for (const a of animations) model.clips.set(a.name, cleanClip(a));
      // skin que falha cai no boneco do crachá; o resto do jogo segue
      await Promise.all(
        Object.entries(SKIN_DEFS).map(([id, def]) =>
          loadSkin(Number(id), def).catch((err) => console.warn(`${def.url} não carregou`, err)),
        ),
      );
      loaded = model;
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

const SNEAKERS = 2;

/**
 * Calçados por índice de SHOES. O tênis é o do próprio GLB; os outros entram no lugar dele,
 * presos ao quadril para andar junto. y do tênis original menos 0,09 é o chão.
 */
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
    // solado oval um pouco maior que o pé, rente ao chão
    const sole = (sx: number, sz: number) => ball(m.sole, [sx, 0.03, sz], -0.065, 0.01);
    // cano das botas em volta da perna (eixo do quadril), cobrindo a barra da calça
    const shaft = (mat: THREE.Material, top: number, r: number) => {
      const h = top - (y - 0.09);
      return extra(hip, new THREE.CylinderGeometry(r, r - 0.008, h, 24), mat, [0, y - 0.09 + h / 2, 0]);
    };
    switch (kind) {
      case 0: // descalço
        ball(m.skin, [0.13, 0.075, 0.22], -0.015);
        break;
      case 1: // meia
        ball(m.sock, [0.14, 0.08, 0.23], -0.01);
        ball(m.sockTip, [0.105, 0.065, 0.08], -0.02, 0.17);
        ball(m.sockTip, [0.105, 0.065, 0.07], -0.02, -0.14);
        break;
      case 3: // sapato social
        ball(m.leather, [0.14, 0.075, 0.26], -0.015, 0.01);
        sole(0.145, 0.265);
        break;
      case 4: { // salto alto: pé inclinado com a ponta no chão e o salto fino atrás
        // a barra da calça para no peito do pé, senão a perna atravessa o scarpin baixo
        const leg = inner.getObjectByName(`Perna_${side}`);
        if (leg) fitLeg(leg, y + 0.05);
        ball(m.heel, [0.15, 0.08, 0.26], 0.01, 0.03).rotation.x = 0.22;
        extra(hip, new THREE.CylinderGeometry(0.032, 0.018, 0.085, 12), m.heel, [x, y - 0.05, z - 0.16]);
        break;
      }
      case 5: // bota de segurança com biqueira de aço
        ball(m.boot, [0.17, 0.1, 0.26], 0, 0.01);
        shaft(m.boot, y + 0.16, 0.185);
        ball(m.steel, [0.155, 0.085, 0.1], 0, 0.17);
        sole(0.178, 0.27);
        break;
      case 6: { // galocha de borracha até a canela
        ball(m.rubber, [0.16, 0.095, 0.25], 0, 0.01);
        // a calça chega a 0,18 de fundo perto do joelho: o cano precisa ser mais largo
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

/** Índices de TOPS e BOTTOMS (a ordem da lista é a do crachá salvo). */
const TOP = { tee: 0, shirt: 1, dressShirt: 2, polo: 3, tank: 4, hoodie: 5, dress: 6 } as const;
const BOTTOM = { pants: 0, bermuda: 1, shorts: 2, skirt: 3, longSkirt: 4 } as const;

/** Raio da perna torneada (em unidades de LEG_R) na altura yu do perfil de legGeometry, de -1 a 1. */
function legProfile(yu: number): number {
  if (yu >= 0.2) return Math.sqrt(Math.max(0, 1 - ((yu - 0.2) / 0.8) ** 2));
  const t = THREE.MathUtils.clamp((yu + 0.86) / 1.06, 0, 1);
  return 0.74 + 0.26 * Math.sin((t * Math.PI) / 2);
}

/**
 * Parte de cima e de baixo do crachá sobre o corpo do GLB: o tronco, as mangas e o quadril já vêm
 * pintados com shirt e pants; aqui entram golas, botões, mangas compridas, saias e pernas de fora.
 */
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

  // gola da polo para camisa, social e polo; botões descendo pela frente nas de abotoar
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
      // vista inteira até a cintura, em gomos assentados na curva do tronco
      for (let y = 1.38; y > 0.92; y -= 0.06) extra(chestAnchor(body, 0, y), new THREE.BoxGeometry(0.06, 0.066, 0.014), trim, [0, 0, 0.002]);
      for (const y of [1.42, 1.28, 1.14, 1.0]) {
        extra(chestAnchor(body, 0, y), new THREE.CylinderGeometry(0.018, 0.018, 0.012, 12), button, [0, 0, 0.012]).rotation.x = Math.PI / 2;
      }
    }
  }

  // mangas compridas: o braço vira tecido, com punho e a mão de fora na ponta
  if (top === TOP.dressShirt || top === TOP.hoodie) {
    const handMat = mk(skin, 0.6);
    for (const side of ["D", "E"]) {
      const arm = inner.getObjectByName(`Braco_${side}`) as THREE.Mesh | undefined;
      if (!arm?.isMesh) continue;
      (arm.material as THREE.MeshStandardMaterial).color.copy(shirt);
      // filhos do braço herdam a escala (0,1 × 0,31 × 0,11): medidas aqui são em raios do braço
      extra(arm, new THREE.CylinderGeometry(1, 1, 1, 20), trim, [0, -0.76, 0], [0.7, 0.16, 0.7]);
      extra(arm, new THREE.SphereGeometry(1, 16, 12), handMat, [0, -0.97, 0], [0.85, 0.28, 0.78]);
    }
  }

  if (top === TOP.tank) {
    // ombro de fora: a manga bufante vira pele
    recolor("Manga_D", skin);
    recolor("Manga_E", skin);
  }

  if (top === TOP.hoodie) {
    // capuz caído nas costas, bolso canguru e os cordões do capuz
    const hoodMat = mk(shirt);
    const rim = extra(body, new THREE.TorusGeometry(0.27, 0.1, 12, 24, Math.PI * 1.3), hoodMat, [0, 1.55, -0.08]);
    rim.rotation.set(Math.PI / 2 + 0.35, 0, Math.PI * 0.85);
    rim.scale.set(1.15, 1, 0.9);
    // o pano do capuz pendurado nas costas, metade afundada no tronco
    extra(body, new THREE.SphereGeometry(1, 20, 14), hoodMat, [0, 1.42, -0.24], [0.27, 0.2, 0.13]).rotation.x = 0.35;
    extra(body, new THREE.SphereGeometry(1, 20, 14), trim, [0, 1.44, -0.27], [0.17, 0.12, 0.08]).rotation.x = 0.35;
    extra(chestAnchor(body, 0, 1.0), new THREE.BoxGeometry(0.4, 0.15, 0.02), trim, [0, 0, 0.004]);
    const cord = mk("#f4f1ea", 0.6);
    for (const x of [-0.08, 0.08]) extra(chestAnchor(body, x, 1.4), new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), cord, [0, -0.05, 0.012]);
  }

  // pernas de fora: bermuda, short, saias e vestido
  if (bottom === BOTTOM.pants) return;
  const lowerMat = mk(lower, 0.85, THREE.DoubleSide);
  for (const side of ["D", "E"]) {
    recolor(`Perna_${side}`, skin);
    if (bottom !== BOTTOM.bermuda && bottom !== BOTTOM.shorts) continue;
    const hip = inner.getObjectByName(`Quadril_${side}`);
    const shoe = inner.getObjectByName(`Tenis_${side}`);
    if (!hip || !shoe) continue;
    // barra da bermuda no joelho, do short no meio da coxa; o tubo fica um pouco mais largo que a perna
    const half = (LEG_TOP - shoe.position.y) / 2;
    const hem = bottom === BOTTOM.bermuda ? -0.15 : 0.3;
    // começa por dentro do quadril da calça e mais larga que a coxa, para não sobrar pele entre os dois
    const top_ = 0.75;
    const rTop = 1.12;
    const rHem = legProfile(hem) * 1.14;
    const h = (top_ - hem) * half;
    const tube = extra(hip, new THREE.CylinderGeometry(rTop, rHem, 1, 24), lowerMat, [0, LEG_TOP - half + ((top_ + hem) / 2) * half, 0]);
    tube.scale.set(LEG_R[0], h, LEG_R[1]);
  }
  if (bottom === BOTTOM.skirt || bottom === BOTTOM.longSkirt) {
    // saia rodada da cintura para baixo: perfil torneado, mais aberta na barra
    const long = bottom === BOTTOM.longSkirt;
    const waist = 0.97;
    const hemY = long ? 0.2 : 0.46;
    const hemR = long ? 0.6 : 0.5;
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const s = i / 12;
      // começa justa (0,4 de raio), abre rápido no quadril e segue reta até a barra
      pts.push(new THREE.Vector2(0.4 + (hemR - 0.4) * Math.sin((s * Math.PI) / 2) ** 0.7, waist - s * (waist - hemY)));
    }
    pts.reverse();
    const skirt = extra(body, new THREE.LatheGeometry(pts, 32), lowerMat, [0, 0, 0]);
    // o tronco é mais fundo que largo só um pouco: 0,32 / 0,42
    skirt.scale.set(1, 1, 0.8);
    // barra dobrada
    const band = extra(body, new THREE.TorusGeometry(hemR, 0.018, 6, 40), mk(lower.clone().multiplyScalar(0.8)), [0, hemY + 0.01, 0]);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1, 0.8, 1);
  }
}

/** Ponto do peito onde fica o bolso: lado esquerdo do boneco (+x), na metade de cima da Camiseta. */
const POCKET_AT: [number, number] = [0.17, 1.26];

/** Camiseta: elipsoide (raios x, y, z) com centro em y 1,2; a metade de baixo é a superelipse de reshape. */
const TORSO = { rx: 0.42, ry: 0.5, rz: 0.32, cy: 1.2 };

/**
 * Grupo assentado na frente do tronco no ponto (x, y) do corpo, virado para fora como o tecido ali:
 * no grupo, z = 0 é a superfície e +z sai do peito.
 */
function chestAnchor(body: THREE.Object3D, x: number, y: number): THREE.Group {
  const { rx, ry, rz, cy } = TORSO;
  const t = (y - cy) / ry;
  // raio da fatia em y (1 no equador) e sua derivada em y, iguais às de reshape
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

/**
 * Bolso no peito esquerdo da camisa com o crachá preso por um clipe na borda, pendurado na frente.
 */
function addBadge(body: THREE.Object3D, shirt: THREE.Color, skin: THREE.Color, mats: THREE.Material[]): void {
  const mk = (color: THREE.ColorRepresentation, roughness = 0.6, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    mats.push(m);
    return m;
  };
  const anchor = chestAnchor(body, ...POCKET_AT);

  const box = (w: number, h: number, d: number, mat: THREE.Material, px: number, py: number, pz: number) =>
    extra(anchor, new THREE.BoxGeometry(w, h, d), mat, [px, py, pz]);
  // bolso: tecido um tom abaixo da camisa, com a bainha de cima dobrada
  const pocket = mk(shirt.clone().multiplyScalar(0.82), 0.85);
  const pocketTop = 0.09;
  box(0.23, 0.23, 0.03, pocket, 0, pocketTop - 0.115, 0.002);
  box(0.235, 0.03, 0.036, mk(shirt.clone().multiplyScalar(0.7), 0.85), 0, pocketTop - 0.015, 0.003);

  // clipe metálico abraçando a borda do bolso
  const steel = mk("#d5dade", 0.35, 0.3);
  box(0.05, 0.07, 0.008, steel, 0, pocketTop - 0.025, 0.026);
  box(0.05, 0.012, 0.03, steel, 0, pocketTop + 0.004, 0.012);

  // crachá pendurado no clipe, na frente do bolso e passando um pouco da barra dele
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

/** Peças dos GLBs que ficam de fora em todo boneco: bochecha rosa e o cinto, que marcava uma linha entre camisa e calça. */
const HIDDEN_PARTS = ["Bochecha_D", "Bochecha_E", "Cinto"];

function hideParts(inner: THREE.Object3D): void {
  for (const n of HIDDEN_PARTS) {
    const o = inner.getObjectByName(n);
    if (o) o.visible = false;
  }
}

/** Peça de outra skin com o mesmo pivô da Cabeca, então entra sem deslocamento. */
function addPart(head: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material): void {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  head.add(m);
}

/** Aplica o crachá sobre o boneco base: cores, penteado, barba, óculos e acessório. */
function dress(inner: THREE.Object3D, dna: AvatarDNA, mats: THREE.Material[]): void {
  const palette = paletteFor(dna);
  inner.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    const src = mesh.material as THREE.MeshStandardMaterial;
    const m = src.clone();
    // olhos, sobrancelhas e boca dividem o material "Olhos": a cor dos olhos vai pelo nome da peça
    const color = mesh.name.startsWith("Olho_") ? new THREE.Color(EYE_COLORS[dna.eyes]) : palette[src.name];
    if (color) m.color.copy(color);
    // mechas do modelo são brilhantes e viram um reflexo cinza em cabelo recolorido
    if (src.name.startsWith("Cabelo")) m.roughness = 0.9;
    mesh.material = m;
    mats.push(m);
  });

  const head = inner.getObjectByName("Cabeca");
  const body = inner.getObjectByName("Boneco");
  // com as peças da skin polo, todo penteado sai do mesmo cabelo e o do modelo base some
  const strands = parts.hair !== undefined;
  // careca, moicano e volumoso dispensam o cabelo curto do modelo
  const baseHair = !strands && dna.hair !== 0 && dna.hair !== 5 && dna.hair !== 7;
  for (const n of ["Cabelo_Curto", "Mecha_1", "Mecha_2", "Mecha_3"]) {
    const o = inner.getObjectByName(n);
    if (o) o.visible = baseHair;
  }
  const cap = inner.getObjectByName("Bone");
  if (cap) cap.visible = dna.accessory === 2;
  const hairMat = new THREE.MeshStandardMaterial({ color: palette.Cabelo, roughness: 0.9 });
  mats.push(hairMat);
  // a cor por vértice da skin polo dá o desenho dos fios, a do material dá o tom
  const strandMat = new THREE.MeshStandardMaterial({ color: palette.Cabelo, roughness: 0.9, vertexColors: true, side: THREE.DoubleSide });
  mats.push(strandMat);
  if (head) {
    if (strands) {
      const hair = hairFor(dna.hair, dna.accessory === 2);
      if (hair) addPart(head, hair, strandMat);
    } else {
      addHair(head, dna.hair, hairMat);
    }
    // barba tem cor própria: material separado do cabelo
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

function glbCharacter(dna: AvatarDNA, base: Loaded): Character {
  // skin pronta fica como veio; do crachá só vale a altura
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

  let seated = false;
  return {
    root,
    update(dt, speed01) {
      if (seated) return;
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
    },
    dispose() {
      // geometrias do GLB e das peças de skin são compartilhadas; só as peças extras são deste boneco
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
