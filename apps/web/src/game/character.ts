import * as THREE from "three";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { EYE_COLORS, HAIR_COLORS, SKINS, type AvatarDNA, type ItemId } from "@ec/shared";
import { createGltfLoader } from "./gltfLoader";
import { BARBAS, CABELOS, type PieceDef } from "./itens/cabelo-e-barba";
import { ROSTOS, type FacePiece } from "./itens/pele-e-olhos";
import { SeatedPose } from "./seatedPose";

/**
 * Boneco do jogo: boneco_bebe.glb, um bebê careca de fralda com esqueleto, expressões (piscar,
 * cara brava) e as animações do jogo. O crachá tinge pele e olhos pelo shader, monta o rosto com as
 * peças de expressão do próprio bebê e põe cabelo e barba (modelos do designer). Os itens de cada aba
 * do crachá ficam registrados em ./itens/.
 */
export type CharacterAction = "throw" | "cafe" | "dash" | "tchau";

export interface Character {
  root: THREE.Group;
  update(dt: number, speed01: number): void;
  play(action: CharacterAction): void;
  /** Atualização dinâmica na cadeira de corrida (inclinação do corpo, cabeça na curva, braços esterçando). */
  updateSeated?(dt: number, speed: number, steer: number, driftDir: number, boosting: boolean): void;
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
function bottomOf(root: THREE.Object3D, parts: THREE.Object3D[]): number {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  for (const p of parts) box.union(new THREE.Box3().setFromObject(p).applyMatrix4(inv));
  return box.isEmpty() ? 0 : box.min.y;
}

const MODEL_URL = "/assets/characters/boneco/boneco_bebe.glb";
/** Altura do GLB e a do boneco no jogo (colisão, câmera e balões são medidos para ela). */
const MODEL_HEIGHT = 1.9;
export const TARGET_HEIGHT = 1.75;
const SCALE = TARGET_HEIGHT / MODEL_HEIGHT;
/** Duração no jogo de cada ação (os clipes são mais longos) e o clipe de cada uma. */
const ACTION_SECONDS: Record<CharacterAction, number> = { throw: 0.45, cafe: 0.7, dash: 0.3, tchau: 3.2 };
const CLIP_OF: Record<CharacterAction, string> = { throw: "jogar_bolinha", cafe: "jogar_cafe", dash: "dash", tchau: "tchau" };
/** Trecho útil de cada clipe em segundos: o resto é a volta para a pose parada. */
const CLIP_RANGE: Record<CharacterAction, [number, number]> = { throw: [0, 0.9], cafe: [0, 1.5], dash: [0, 1.1], tchau: [0, 3.2] };
const FPS = 30;
/**
 * Parado e andando, os clipes deixam os braços ~69° abaixo da horizontal, colados no corpo. Depois de
 * cada quadro o braço abre este tanto para fora (no espaço do tronco): cada braço fica ~15° abaixo da
 * horizontal, uns 150° entre os dois. Nas ações o braço segue o clipe, que já o tira do corpo.
 */
const ARM_OPEN = THREE.MathUtils.degToRad(54);

interface Loaded {
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
  /** Cabelos do designer já carregados, com a matriz do espaço do osso cabeca para o modelo. */
  modelHairs: Map<number, Piece>;
  /** Barbas do designer, ligadas ao esqueleto de cada boneco ao vestir. */
  beards: Map<number, THREE.BufferGeometry>;
  /** Pele do rosto em grade, para as peças de expressão encostarem nela e pegarem a sombra dela. */
  faceSkin: Map<string, SkinCell>;
  /** Peças de expressão giradas ou subidas, feitas uma vez por posição. */
  faceGeos: Map<string, THREE.BufferGeometry>;
  /** Corpo sem a sobrancelha e/ou a boca esculpidas, por combinação. */
  bodyGeos: Map<string, THREE.BufferGeometry>;
}

interface Piece {
  geo: THREE.BufferGeometry;
  frame: THREE.Matrix4;
}

let loaded: Loaded | null = null;
let loading: Promise<boolean> | null = null;

export function modelReady(): boolean {
  return loaded !== null;
}

/** Tira a translação do corpo dos clipes (o dash anda 1,2 m sozinho): a posição vem do servidor. */
function cleanClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const c = clip.clone();
  c.tracks = c.tracks.filter((t) => t.name !== "figura.position" && t.name !== "root.position");
  return c;
}

/** Brilho linear (como o shader mede) de uma cor sRGB 0–255. */
function lum(r: number, g: number, b: number): number {
  const c = new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
/** Cor média da pele e da íris na textura do bebê: a referência do tingimento. */
const SKIN_REF = lum(235, 190, 175);
const IRIS_REF = lum(117, 55, 39);
/**
 * A pele em volta dos olhos é mais clara que a média (brilho 0,651 contra 0,584 da referência) e a das
 * peças de expressão é 0,606: a referência delas é ajustada para a peça sair no mesmo tom do rosto.
 */
const OVERLAY_REF = SKIN_REF * (0.606 / 0.651);
/** Brilho da testa logo acima dos olhos, relativo à referência (a textura é mais escura no lado direito). */
const FOREHEAD_D = 0.97;
const FOREHEAD_E = 1.06;
/** Brilho da pele em volta da boca, relativo à referência. */
const MOUTH_SKIN = 1.06;

/**
 * Onde ficam a sobrancelha e a boca do modelo, no espaço do bebê, com borda suave. O rosto que põe as
 * suas tira as do modelo daqui: a pintura vira pele lisa e o relevo do mapa de normais some (o da
 * malha sai em erasedBody).
 */
const ERASE_GLSL = /* glsl */ `
uniform vec2 uErase;
float eraseMask(vec3 p) {
  if (p.z < 0.2) return 0.0;
  float ax = abs(p.x);
  float brow = uErase.x * smoothstep(1.245, 1.262, p.y) * (1.0 - smoothstep(1.35, 1.37, p.y))
    * smoothstep(0.05, 0.07, ax) * (1.0 - smoothstep(0.33, 0.35, ax));
  float mouth = uErase.y * smoothstep(0.945, 0.96, p.y) * (1.0 - smoothstep(1.018, 1.03, p.y))
    * (1.0 - smoothstep(0.115, 0.135, ax));
  return max(brow, mouth);
}`;

const HSV_GLSL = /* glsl */ `
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}`;

/**
 * Pele e olhos do crachá sobre a textura do bebê. A sombra vem do brilho do pixel relativo à cor
 * média da região. Ficam como vieram a fralda e os traços do rosto (pupila, cílios, brilho do olho).
 * erase tira do modelo a sobrancelha e a boca quando o rosto escolhido põe as dele.
 */
function tintBody(material: THREE.MeshStandardMaterial, skin: THREE.Color, iris: THREE.Color, erase: Erase): void {
  const uniforms = {
    uSkin: { value: skin },
    uIris: { value: iris },
    uRef: { value: new THREE.Vector2(SKIN_REF, IRIS_REF) },
    uErase: { value: new THREE.Vector2(erase.brows ? 1 : 0, erase.mouth ? 1 : 0) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBindPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBindPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nuniform vec3 uSkin; uniform vec3 uIris; uniform vec2 uRef;\nvarying vec3 vBindPos;\nconst vec2 FOREHEAD = vec2(${FOREHEAD_D.toFixed(3)}, ${FOREHEAD_E.toFixed(3)});\n${HSV_GLSL}\n${ERASE_GLSL}`,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>
{
  vec3 lin = diffuseColor.rgb;
  vec3 hsv = rgb2hsv(pow(max(lin, 0.0), vec3(1.0 / 2.2)));
  vec3 srgb = pow(max(lin, 0.0), vec3(1.0 / 2.2));
  vec3 p = vBindPos;
  float l = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  bool diaper = (srgb.b > srgb.r + 0.08 && srgb.b > srgb.g) || (p.y > 0.25 && p.y < 0.52 && hsv.y < 0.25 && hsv.z < 0.45);
  bool face = p.y > 1.0 && p.y < 1.36 && p.z > 0.2 && abs(p.x) < 0.34;
  bool iris = face && hsv.y > 0.45 && hsv.x * 360.0 < 35.0 && hsv.z < 0.62;
  bool feature = face && (hsv.z < 0.4 || (hsv.y < 0.15 && hsv.z > 0.7));
  if (iris) diffuseColor.rgb = uIris * (l / uRef.y);
  else if (!diaper && !feature) diffuseColor.rgb = uSkin * (l / uRef.x);
  // sobrancelha e boca do modelo tiradas: o traço (mais escuro que a pele em volta) vira o tom dela;
  // a pele fica com a textura, que traz a sombra em volta do olho e da boca
  float tone = p.y < 1.1 ? ${MOUTH_SKIN.toFixed(3)} : (p.x < 0.0 ? FOREHEAD.x : FOREHEAD.y);
  float rel = l / uRef.x;
  vec3 bare = uSkin * mix(tone, rel, smoothstep(tone * 0.9, tone * 0.98, rel));
  diffuseColor.rgb = mix(diffuseColor.rgb, bare, eraseMask(p));
}`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        "#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, eraseMask(vBindPos)));",
      );
  };
  material.customProgramCacheKey = () => "bebe-corpo";
}

/**
 * Pálpebras do piscar, da cara brava e a boca: a parte cor de pele acompanha a pele do crachá.
 * lineOnly deixa só o traço (a boca nova, no lugar da do modelo, que já foi tirada): a pele em volta some.
 */
function tintOverlay(material: THREE.MeshStandardMaterial, skin: THREE.Color, lineOnly = false): void {
  const uniforms = { uSkin: { value: skin }, uRef: { value: OVERLAY_REF }, uLineOnly: { value: lineOnly ? 1 : 0 } };
  // o corpo é fosco (textura de rugosidade); a peça brilhando mais parecia um remendo claro
  material.roughness = 1;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec3 uSkin; uniform float uRef; uniform float uLineOnly;\n${HSV_GLSL}`)
      .replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>
{
  vec3 hsv = rgb2hsv(pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2)));
  bool skinPx = hsv.z >= 0.4 && hsv.x * 360.0 < 40.0 && hsv.y < 0.45;
  if (skinPx) diffuseColor.rgb = uSkin * (dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / uRef);
  // o traço da boca é escuro e saturado (brilho 0,5, saturação 0,7); a pele é clara (0,9 e 0,3)
  if (uLineOnly > 0.5) diffuseColor.a *= clamp(smoothstep(0.42, 0.55, hsv.y) + 1.0 - smoothstep(0.62, 0.75, hsv.z), 0.0, 1.0);
}`,
      );
  };
  material.customProgramCacheKey = () => "bebe-sobreposicao";
}

/** Peças de expressão que têm pele (as outras, sobrancelha brava e veia, ficam como vieram). */
const SKIN_OVERLAYS = ["palpebra_D", "palpebra_E", "boca", "piscar_meio_D", "piscar_fechado_D", "piscar_meio_E", "piscar_fechado_E"];

const FACE_CELL = 0.01;

/** Célula da pele do rosto: o z mais à frente e a soma das normais dos vértices dela. */
type SkinCell = { z: number; n: THREE.Vector3 };

/** Pele do rosto numa grade de 1 cm, no espaço da malha. */
function faceSkinOf(geo: THREE.BufferGeometry): Map<string, SkinCell> {
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const field = new Map<string, SkinCell>();
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z < 0.1) continue;
    const k = `${Math.round(pos.getX(i) / FACE_CELL)},${Math.round(pos.getY(i) / FACE_CELL)}`;
    let cell = field.get(k);
    if (!cell) field.set(k, (cell = { z, n: new THREE.Vector3() }));
    cell.z = Math.max(cell.z, z);
    cell.n.x += nor.getX(i);
    cell.n.y += nor.getY(i);
    cell.n.z += nor.getZ(i);
  }
  return field;
}

/**
 * Pele em (x, y): o z mais à frente das células em volta (a peça nunca fica atrás da pele) e a normal
 * média delas (a peça pega a mesma sombra do rosto, sem parecer um remendo).
 */
function skinAt(field: Map<string, SkinCell>, x: number, y: number, normal: THREE.Vector3): number | null {
  const cx = Math.round(x / FACE_CELL), cy = Math.round(y / FACE_CELL);
  let z = -Infinity;
  normal.set(0, 0, 0);
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++) {
      const cell = field.get(`${cx + a},${cy + b}`);
      if (!cell) continue;
      z = Math.max(z, cell.z);
      normal.add(cell.n);
    }
  if (z === -Infinity) return null;
  normal.normalize();
  return z;
}

/**
 * Peça de expressão do rosto: girada e subida em volta do próprio centro, com a mesma distância da
 * pele de antes, e com as normais da pele embaixo dela.
 */
function facePieceGeo(model: Loaded, src: THREE.Mesh, p: FacePiece): THREE.BufferGeometry {
  const key = `${p.node}|${p.turn ?? 0}|${p.up ?? 0}`;
  const hit = model.faceGeos.get(key);
  if (hit) return hit;
  const geo = src.geometry.clone();
  geo.computeBoundingBox();
  const c = geo.boundingBox!.getCenter(new THREE.Vector3());
  const a = THREE.MathUtils.degToRad(p.turn ?? 0);
  const cos = Math.cos(a), sin = Math.sin(a);
  // sobrancelha e boca vão para a pele alisada no lugar das do modelo (erasedBody): mesmo paradas,
  // saem do sulco antigo e encostam por cima da pele
  const moved = Boolean(p.turn || p.up) || p.node.startsWith("sobrancelha") || p.node === "boca";
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const n = new THREE.Vector3();
  const n0 = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = c.x + cos * (x - c.x) - sin * (y - c.y);
    const ny = c.y + sin * (x - c.x) + cos * (y - c.y) + (p.up ?? 0);
    const before = skinAt(model.faceSkin, x, y, n0);
    const after = skinAt(model.faceSkin, nx, ny, n);
    // a movida guarda a distância que tinha da pele, mas nunca fica atrás da pele mais alta em volta
    // (o degrau da órbita do olho), e vai um pouco mais longe para não sumir nela
    const nz = moved && before !== null && after !== null ? Math.max(z + after - before, after + 0.003) + 0.004 : z;
    pos.setXYZ(i, nx, ny, nz);
    if (after !== null && nor) nor.setXYZ(i, n.x, n.y, n.z);
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  model.faceGeos.set(key, geo);
  return geo;
}

type Erase = { brows: boolean; mouth: boolean };
/** Forma do corpo para um rosto: o que sai do modelo e quanto cada olho aperta (1 = como veio). */
type BodyShape = Erase & { squint: [d: number, e: number] };

/** Centro do desenho de cada olho (D com x negativo) e o tamanho da área que aperta junto. */
const EYE_CENTER = { x: 0.19, y: 1.14 };
const EYE_RADIUS = { x: 0.14, y: 0.11 };

/** Altura da pele (z) numa grade de 1 cm, média 5×5: a superfície do rosto sem os detalhes. */
function smoothFaceZ(pos: THREE.BufferAttribute): (x: number, y: number) => number {
  const sum = new Map<string, [number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z < 0.1) continue;
    const k = `${Math.round(pos.getX(i) / 0.01)},${Math.round(pos.getY(i) / 0.01)}`;
    const c = sum.get(k) ?? [0, 0];
    c[0] += z;
    c[1]++;
    sum.set(k, c);
  }
  return (x, y) => {
    const cx = Math.round(x / 0.01), cy = Math.round(y / 0.01);
    let s = 0, n = 0;
    for (let a = -2; a <= 2; a++)
      for (let b = -2; b <= 2; b++) {
        const c = sum.get(`${cx + a},${cy + b}`);
        if (c) {
          s += c[0] / c[1];
          n++;
        }
      }
    return n ? s / n : 0;
  };
}

/**
 * Olho apertado: a pele em volta do olho vai para a linha do meio dele, e o desenho da textura vai
 * junto (os cílios de cima e de baixo se aproximam). Fora da área a pele fica como é.
 */
function squintEyes(pos: THREE.BufferAttribute, src: THREE.BufferAttribute, squint: [number, number]): void {
  const faceZ = smoothFaceZ(src);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (z < 0.15) continue;
    const s = squint[x < 0 ? 0 : 1];
    if (s === 1) continue;
    const r = Math.hypot((Math.abs(x) - EYE_CENTER.x) / EYE_RADIUS.x, (y - EYE_CENTER.y) / EYE_RADIUS.y);
    const w = 1 - THREE.MathUtils.smoothstep(r, 0.9, 1.5);
    if (w <= 0) continue;
    const ny = EYE_CENTER.y + (y - EYE_CENTER.y) * (1 - (1 - s) * w);
    // segue a superfície do rosto na altura nova, para a pele não sair dela
    pos.setXYZ(i, x, ny, z + faceZ(x, ny) - faceZ(x, y));
  }
}

/** A mesma conta do eraseMask do ERASE_GLSL, para a malha. */
function eraseMask(x: number, y: number, z: number, e: Erase): number {
  if (z < 0.2) return 0;
  const ss = THREE.MathUtils.smoothstep;
  const ax = Math.abs(x);
  const brow = e.brows ? ss(y, 1.245, 1.262) * (1 - ss(y, 1.35, 1.37)) * ss(ax, 0.05, 0.07) * (1 - ss(ax, 0.33, 0.35)) : 0;
  const mouth = e.mouth ? ss(y, 0.945, 0.96) * (1 - ss(y, 1.018, 1.03)) * (1 - ss(ax, 0.115, 0.135)) : 0;
  return Math.max(brow, mouth);
}

/**
 * Pele lisa no lugar de um traço esculpido: z = f(|x|, y), polinômio de grau 3 ajustado à pele em
 * volta. O sulco (o que fica bem abaixo da superfície) sai do ajuste a cada volta.
 */
class SmoothPatch {
  private coef: number[] = [];
  constructor(
    private cx: number,
    private cy: number,
    private sx: number,
    private sy: number,
  ) {}
  private terms(ax: number, y: number): number[] {
    const u = (ax - this.cx) / this.sx, v = (y - this.cy) / this.sy;
    return [1, u, v, u * u, u * v, v * v, u * u * u, u * u * v, u * v * v, v * v * v];
  }
  z(ax: number, y: number): number {
    return this.terms(ax, y).reduce((s, t, i) => s + t * this.coef[i], 0);
  }
  /** Normal da superfície em (x, y), com o lado do x. */
  normal(x: number, y: number, out: THREE.Vector3): THREE.Vector3 {
    const ax = Math.abs(x), h = 1e-4;
    const dx = (this.z(ax + h, y) - this.z(ax - h, y)) / (2 * h);
    const dy = (this.z(ax, y + h) - this.z(ax, y - h)) / (2 * h);
    return out.set(-dx * Math.sign(x || 1), -dy, 1).normalize();
  }
  fit(pos: THREE.BufferAttribute, inside: (ax: number, y: number, z: number) => boolean): this {
    for (let round = 0; round < 6; round++) {
      const A = Array.from({ length: 10 }, () => new Array<number>(11).fill(0));
      for (let i = 0; i < pos.count; i++) {
        const ax = Math.abs(pos.getX(i)), y = pos.getY(i), z = pos.getZ(i);
        if (!inside(ax, y, z)) continue;
        if (round > 0 && z < this.z(ax, y) - 0.002) continue;
        const t = this.terms(ax, y);
        for (let a = 0; a < 10; a++) {
          A[a][10] += t[a] * z;
          for (let b = 0; b < 10; b++) A[a][b] += t[a] * t[b];
        }
      }
      for (let c = 0; c < 10; c++) {
        let p = c;
        for (let r = c + 1; r < 10; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
        [A[c], A[p]] = [A[p], A[c]];
        for (let r = 0; r < 10; r++) {
          if (r === c) continue;
          const f = A[r][c] / A[c][c];
          for (let k = c; k <= 10; k++) A[r][k] -= f * A[c][k];
        }
      }
      this.coef = A.map((r, i) => r[10] / r[i]);
    }
    return this;
  }
}

/**
 * Corpo sem a sobrancelha e/ou a boca esculpidas (o traço vai para a superfície lisa da pele em volta,
 * com a normal dela) e com os olhos apertados do rosto. Uma malha por combinação, dividindo com o corpo
 * tudo o que não muda.
 */
function erasedBody(model: Loaded, src: THREE.BufferGeometry, e: BodyShape): THREE.BufferGeometry {
  const key = `${e.brows}|${e.mouth}|${e.squint.join(",")}`;
  const hit = model.bodyGeos.get(key);
  if (hit) return hit;
  const srcPos = src.getAttribute("position") as THREE.BufferAttribute;
  const brow = new SmoothPatch(0.2, 1.3, 0.15, 0.08).fit(srcPos, (ax, y, z) => ax > 0.03 && ax < 0.37 && y > 1.24 && y < 1.4 && z > 0.15);
  const mouth = new SmoothPatch(0, 0.99, 0.15, 0.06).fit(srcPos, (ax, y, z) => ax < 0.18 && y > 0.92 && y < 1.06 && z > 0.3);
  const geo = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) geo.setAttribute(name, attr);
  geo.setIndex(src.getIndex());
  geo.groups = src.groups;
  const pos = srcPos.clone();
  const nor = (src.getAttribute("normal") as THREE.BufferAttribute).clone();
  const n = new THREE.Vector3();
  const flat = new THREE.Vector3();
  // quanto de cada vértice vai para a superfície lisa: só o traço esculpido (sulco ou lábio a mais de
  // 1–2 mm dela), alargado alguns anéis para pegar a borda do sulco. A pele que só difere pelo erro do
  // ajuste fica como é, para não aparecer emenda.
  const amount = new Map<number, number>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const w = eraseMask(x, y, z, e);
    if (w <= 0) continue;
    const d = (y < 1.1 ? mouth : brow).z(Math.abs(x), y) - z;
    amount.set(i, THREE.MathUtils.smoothstep(Math.abs(d), 0.0008, 0.002));
  }
  const near = new Map<number, number[]>();
  const index = src.getIndex()!;
  for (let t = 0; t < index.count; t += 3) {
    const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    if (!tri.some((v) => amount.has(v))) continue;
    for (const a of tri) for (const b of tri) if (a !== b && amount.has(a) && amount.has(b)) near.set(a, [...(near.get(a) ?? []), b]);
  }
  // vértices repetidos na costura da textura andam juntos
  const twins = new Map<string, number[]>();
  for (const i of amount.keys()) {
    const k = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
    twins.set(k, [...(twins.get(k) ?? []), i]);
  }
  const spread = (pick: (own: number, around: number[]) => number) => {
    const next = new Map<number, number>();
    for (const [i, v] of amount) next.set(i, pick(v, (near.get(i) ?? []).map((j) => amount.get(j)!)));
    for (const group of twins.values()) {
      const v = Math.max(...group.map((i) => next.get(i)!));
      for (const i of group) next.set(i, v);
    }
    for (const [i, v] of next) amount.set(i, v);
  };
  for (let r = 0; r < 3; r++) spread((v, around) => Math.max(v, ...around));
  for (let r = 0; r < 2; r++) spread((v, around) => (v + around.reduce((s, a) => s + a, 0)) / (1 + around.length));
  for (const [i, a] of amount) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = a * eraseMask(x, y, z, e);
    if (k <= 0) continue;
    const patch = y < 1.1 ? mouth : brow;
    const d = patch.z(Math.abs(x), y) - z;
    pos.setZ(i, z + k * d);
    patch.normal(x, y, flat);
    n.fromBufferAttribute(nor, i).lerp(flat, k).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  squintEyes(pos, srcPos, e.squint);
  geo.setAttribute("position", pos);
  geo.setAttribute("normal", nor);
  geo.boundingBox = src.boundingBox;
  geo.boundingSphere = src.boundingSphere;
  model.bodyGeos.set(key, geo);
  return geo;
}

/**
 * Carrega o boneco, os cabelos e as barbas uma vez, todos ao mesmo tempo. Resolve false se o boneco falhar
 * (o jogo segue com o provisório). onProgress soma os bytes de todos os arquivos.
 */
export function preloadCharacter(onProgress?: (e: ProgressEvent) => void): Promise<boolean> {
  loading ??= loadAll(onProgress);
  return loading;
}

type Progress = (url: string) => ((e: ProgressEvent) => void) | undefined;

/** Carrega as peças de um registro (cabelos ou barbas). A que falhar só some da lista. */
function loadPieces(loader: GLTFLoader, urls: Record<number, string>, progress: Progress) {
  return Promise.all(
    Object.entries(urls).map(([key, url]) =>
      loader
        .loadAsync(url, progress(url))
        .then((g) => [Number(key), (g.scene.getObjectByProperty("isMesh", true) as THREE.Mesh).geometry] as const)
        .catch((err) => {
          console.warn(`${url} não carregou`, err);
          return null;
        }),
    ),
  );
}
const urlsOf = (defs: Record<number, PieceDef>) => Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, d.url]));

/** Junta cada peça carregada à matriz que a leva do espaço do osso cabeca para o lugar dela no bebê. */
function pieceMap(list: (readonly [number, THREE.BufferGeometry] | null)[], defs: Record<number, PieceDef>, toHead: THREE.Matrix4): Map<number, Piece> {
  return new Map(
    list.flatMap((h) => {
      if (!h) return [];
      const def = defs[h[0]];
      const fit = new THREE.Matrix4().compose(new THREE.Vector3(...def.offset), new THREE.Quaternion(), new THREE.Vector3().setScalar(def.scale));
      return [[h[0], { geo: h[1], frame: toHead.clone().multiply(fit) }] as const];
    }),
  );
}

function loadAll(onProgress?: (e: ProgressEvent) => void): Promise<boolean> {
  const loader = createGltfLoader();
  const hairUrls = urlsOf(CABELOS);
  const urls = [MODEL_URL, ...Object.values(hairUrls), ...Object.values(BARBAS)];
  const files = new Map(urls.map((u) => [u, { loaded: 0, total: 0 }]));
  const progress: Progress = (url) =>
    onProgress &&
    ((e) => {
      if (!e.lengthComputable) return;
      Object.assign(files.get(url)!, { loaded: e.loaded, total: e.total });
      const all = [...files.values()];
      if (all.every((f) => f.total > 0)) {
        const sum = (k: "loaded" | "total") => all.reduce((n, f) => n + f[k], 0);
        onProgress(new ProgressEvent("progress", { lengthComputable: true, loaded: sum("loaded"), total: sum("total") }));
      }
    });
  return Promise.all([loader.loadAsync(MODEL_URL, progress(MODEL_URL)), loadPieces(loader, hairUrls, progress), loadPieces(loader, BARBAS, progress)])
    .then(([gltf, hairs, beards]) => {
      const mesh = gltf.scene.getObjectByName("boneco") as THREE.SkinnedMesh;
      // do espaço da malha (pose de origem) para o espaço do osso cabeca
      const headIdx = mesh.skeleton.bones.findIndex((b) => b.name === "cabeca");
      const toHead = mesh.skeleton.boneInverses[headIdx].clone().multiply(mesh.bindMatrix);
      loaded = {
        scene: gltf.scene,
        clips: new Map(gltf.animations.map((a) => [a.name, cleanClip(a)])),
        modelHairs: pieceMap(hairs, CABELOS, toHead),
        beards: new Map(beards.flatMap((b) => (b ? [b] : []))),
        faceSkin: new Map(),
        faceGeos: new Map(),
        bodyGeos: new Map(),
      };
      // as peças de expressão encostam na pele sem a sobrancelha e a boca do modelo, que é onde elas
      // ficam quando o rosto traz as suas
      loaded.faceSkin = faceSkinOf(erasedBody(loaded, mesh.geometry, { brows: true, mouth: true, squint: [1, 1] }));
      return true;
    })
    .catch((err) => {
      console.warn("boneco_bebe.glb não carregou, usando o boneco provisório", err);
      return false;
    });
}

/**
 * Aplica o crachá: pele e olhos no corpo e nas pálpebras, o rosto, cabelo e barba presos ao osso da
 * cabeça. Devolve o acerto do rosto a fazer depois de cada quadro das animações.
 */
function dress(inner: THREE.Object3D, model: Loaded, dna: AvatarDNA, mats: THREE.Material[]): () => void {
  const skin = new THREE.Color(SKINS[dna.skin] ?? SKINS[0]);
  const iris = new THREE.Color(EYE_COLORS[dna.eyes] ?? EYE_COLORS[0]);
  const face = ROSTOS[dna.face] ?? ROSTOS[0];
  // o rosto que traz sobrancelha ou boca tira as do modelo do lugar
  const erase: BodyShape = {
    brows: face.pieces.some((p) => p.node.startsWith("sobrancelha")),
    mouth: face.pieces.some((p) => p.node === "boca"),
    squint: [face.squint?.D ?? 1, face.squint?.E ?? 1],
  };
  const reshaped = erase.brows || erase.mouth || erase.squint.some((s) => s !== 1);
  inner.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    const isBody = mesh.name === "boneco";
    if (!isBody && !SKIN_OVERLAYS.includes(mesh.name)) return;
    if (isBody && reshaped) mesh.geometry = erasedBody(model, mesh.geometry, erase);
    const m = (mesh.material as THREE.MeshStandardMaterial).clone();
    if (isBody) tintBody(m, skin, iris, erase);
    else tintOverlay(m, skin);
    mesh.material = m;
    mats.push(m);
  });
  const cabeca = inner.getObjectByName("cabeca");
  if (!cabeca) return () => {};
  // sem textura: o desenho dos fios vem do relevo da malha
  const wear = (piece: Piece | undefined, color: number, roughness: number) => {
    if (!piece) return;
    const mat = new THREE.MeshStandardMaterial({ color: HAIR_COLORS[color] ?? HAIR_COLORS[0], roughness, side: THREE.DoubleSide });
    mats.push(mat);
    const mesh = new THREE.Mesh(piece.geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(piece.frame);
    mesh.castShadow = true;
    cabeca.add(mesh);
  };
  wear(model.modelHairs.get(dna.hair), dna.hairColor, 0.8);
  const beardGeo = model.beards.get(dna.beard);
  const body = inner.getObjectByName("boneco") as THREE.SkinnedMesh | undefined;
  if (beardGeo && body?.parent) {
    // mesma skin do corpo no GLB do designer: os índices de osso são os do esqueleto do boneco
    const mat = new THREE.MeshStandardMaterial({ color: HAIR_COLORS[dna.beardColor] ?? HAIR_COLORS[0], roughness: 0.9, side: THREE.DoubleSide });
    mats.push(mat);
    const beard = new THREE.SkinnedMesh(beardGeo, mat);
    beard.castShadow = true;
    body.parent.add(beard);
    beard.bind(body.skeleton, body.bindMatrix);
  }
  const lineOnly = (src: THREE.Mesh) => {
    const m = (src.material as THREE.MeshStandardMaterial).clone();
    tintOverlay(m, skin, true);
    mats.push(m);
    return m;
  };
  return wearFace(inner, cabeca, model, face.pieces, lineOnly, erase.squint.some((s) => s !== 1));
}

/**
 * Rosto do crachá: cópias das peças de expressão, fora dos grupos que as animações ligam e desligam.
 * Quando o clipe faz a cara brava (no arremesso), ela vale; quando um olho pisca, as pálpebras do
 * rosto daquele lado saem e fica o piscar do clipe.
 */
function wearFace(
  inner: THREE.Object3D,
  cabeca: THREE.Object3D,
  model: Loaded,
  pieces: FacePiece[],
  lineOnly: (src: THREE.Mesh) => THREE.Material,
  squinting: boolean,
): () => void {
  const parts: { mesh: THREE.Mesh; side: "D" | "E" | null }[] = [];
  for (const p of pieces) {
    const src = inner.getObjectByName(p.node) as THREE.Mesh | undefined;
    if (!src?.isMesh || !src.parent) continue;
    // o grupo de origem (cara_brava, piscar) só tem deslocamento: a cópia vai no mesmo lugar
    const holder = new THREE.Group();
    holder.position.copy(src.parent.position);
    // a boca nova entra só com o traço, no lugar da do modelo
    const mesh = new THREE.Mesh(facePieceGeo(model, src, p), p.node === "boca" ? lineOnly(src) : src.material);
    mesh.name = `rosto_${p.node}`;
    holder.add(mesh);
    cabeca.add(holder);
    const lid = p.node.startsWith("palpebra") || p.node.startsWith("piscar");
    parts.push({ mesh, side: lid ? (p.node.endsWith("_D") ? "D" : "E") : null });
  }
  const brava = inner.getObjectByName("cara_brava");
  const blink = (side: "D" | "E") => ["piscar_meio_", "piscar_fechado_"].flatMap((n) => inner.getObjectByName(n + side) ?? []);
  const blinks = { D: blink("D"), E: blink("E") };
  // rosto com olho fechado, meio fechado ou apertado não pisca: as pálpebras do piscar das animações
  // são do tamanho do olho aberto
  const noBlink = squinting || pieces.some((p) => p.node.startsWith("piscar"));
  if (parts.length === 0 && !noBlink) return () => {};
  return () => {
    if (noBlink) for (const o of [...blinks.D, ...blinks.E]) o.scale.setScalar(0);
    const angry = (brava?.scale.x ?? 0) > 0.5;
    for (const { mesh, side } of parts) mesh.visible = !angry && !(side && blinks[side].some((o) => o.scale.x > 0.5));
  };
}

function glbCharacter(model: Loaded, dna: AvatarDNA): Character {
  const root = new THREE.Group();
  const inner = cloneSkinned(model.scene) as THREE.Group;
  inner.scale.setScalar(SCALE);
  root.add(inner);
  const mats: THREE.Material[] = [];
  const syncFace = dress(inner, model, dna, mats);

  // parado por baixo, andar por cima conforme a velocidade; ações tocam uma vez
  const mixer = new THREE.AnimationMixer(inner);
  const loop = (name: string) => {
    const c = model.clips.get(name);
    return c ? mixer.clipAction(c).play() : null;
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
  const shoulders: [THREE.Object3D, THREE.Quaternion][] = [];
  for (const [n, side] of [["ombro_D", -1], ["ombro_E", 1]] as const) {
    const bone = inner.getObjectByName(n);
    if (bone) shoulders.push([bone, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * ARM_OPEN)]);
  }
  const openArms = () => {
    for (const [bone, open] of shoulders) bone.quaternion.premultiply(open);
  };
  const busy = () => [...actions.values()].some((a) => a.isRunning());
  const step = (dt: number) => {
    mixer.update(dt);
    if (!busy()) openArms();
    syncFace();
  };
  walk?.setEffectiveWeight(0);
  step(0);

  const body = inner.getObjectByName("boneco") as THREE.SkinnedMesh | undefined;
  let seated = false;
  // pose dinâmica na cadeira: desvios em cima da pose sentada parada de cada osso
  const pose = new SeatedPose();
  const seatBones = (["cabeca", "tronco", "ombro_D", "ombro_E", "perna_D", "perna_E"] as const).flatMap((n) => {
    const bone = inner.getObjectByName(n);
    return bone ? [{ name: n, bone, rest: new THREE.Quaternion() }] : [];
  });
  const turn = new THREE.Quaternion();
  const euler = new THREE.Euler();
  return {
    root,
    update(dt, speed01) {
      if (seated) return;
      const acting = busy();
      const w = acting ? 0 : speed01;
      walk?.setEffectiveWeight(w);
      idle?.setEffectiveWeight(acting ? 0 : 1 - w);
      if (walk) walk.timeScale = 0.6 + speed01 * 0.8;
      step(dt);
    },
    playItemGesture(item) {
      pose.playItemGesture(item);
    },
    updateSeated(dt, speed, steer, driftDir, boosting) {
      if (!seated) return;
      const a = pose.step(dt, speed, steer, driftDir, boosting);
      const angles: Record<(typeof seatBones)[number]["name"], [number, number, number]> = {
        cabeca: a.head,
        tronco: a.body,
        ombro_D: a.armD,
        ombro_E: a.armE,
        perna_D: [a.legD, 0, 0],
        perna_E: [a.legE, 0, 0],
      };
      // no espaço do pai, como a pose sentada é feita
      for (const { name, bone, rest } of seatBones) bone.quaternion.copy(rest).premultiply(turn.setFromEuler(euler.set(...angles[name])));
    },
    play(action) {
      const a = actions.get(action);
      if (!a || (a.isRunning() && action !== "throw")) return;
      a.reset().play();
    },
    sit() {
      // pose parada, depois pernas para a frente e braços no apoio
      seated = true;
      walk?.stop();
      for (const a of actions.values()) a.stop();
      idle?.setEffectiveWeight(1);
      mixer.setTime(0);
      openArms();
      syncFace();
      const forward = (n: string, angle: number) =>
        inner.getObjectByName(n)?.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle));
      forward("perna_D", -Math.PI / 2);
      forward("perna_E", -Math.PI / 2);
      forward("ombro_D", -0.75);
      forward("ombro_E", -0.75);
      for (const b of seatBones) b.rest.copy(b.bone.quaternion);
      if (!body) return 0;
      // a caixa da malha com pele é calculada na pose atual dos ossos
      inner.updateMatrixWorld(true);
      body.computeBoundingBox();
      return bottomOf(root, [body]);
    },
    dispose() {
      // malhas, texturas, penteados e barbas são compartilhados; os materiais tingidos são deste boneco
      mixer.stopAllAction();
      for (const m of mats) m.dispose();
    },
  };
}

/** Enquanto o GLB carrega: uma cápsula na altura do boneco, para a cena não ficar vazia. */
function placeholderCharacter(): Character {
  const root = new THREE.Group();
  const geo = new THREE.CapsuleGeometry(0.32, TARGET_HEIGHT - 0.64, 6, 16);
  const mat = new THREE.MeshStandardMaterial({ color: "#f3c3ad", roughness: 0.7 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = TARGET_HEIGHT / 2;
  mesh.castShadow = true;
  root.add(mesh);
  return {
    root,
    update() {},
    play() {},
    // a cápsula não dobra: apoia a base no assento
    sit: () => 0,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

export function createCharacter(dna: AvatarDNA): Character {
  return loaded ? glbCharacter(loaded, dna) : placeholderCharacter();
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
  cam.position.set(0, 1.4, 3.6);
  cam.lookAt(0, 0.95, 0);
  thumbRenderer.render(scene, cam);
  const url = thumbRenderer.domElement.toDataURL("image/png");
  char.dispose();
  thumbCache.set(key, url);
  return url;
}
