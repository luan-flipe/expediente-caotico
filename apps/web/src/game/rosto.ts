import * as THREE from "three";
import { EYE_COLORS, SKINS, type AvatarDNA } from "@ec/shared";
import { ROSTOS, type FacePiece } from "./itens/pele-e-olhos";

/**
 * Pele, olhos e rosto do crachá no boneco: a cor da pele e da íris pelo shader, em cima da textura, e o
 * rosto montado com as peças de expressão do próprio boneco (sobrancelhas, pálpebras, boca e veia).
 * Quando o rosto traz sobrancelha ou boca próprias, as do modelo saem da pintura, do mapa de normais e
 * do relevo da malha; olhos apertados deformam a malha em volta deles.
 */

/** Caches de uma malha de corpo: a pele do rosto em grade e as malhas refeitas, feitas uma vez cada. */
interface FaceCache {
  /** Pele do rosto em grade, para as peças de expressão encostarem nela e pegarem a sombra dela. */
  faceSkin: SkinSurface;
  /** Peças de expressão giradas ou subidas, feitas uma vez por posição. */
  faceGeos: Map<string, THREE.BufferGeometry>;
  /** Corpo sem a sobrancelha e/ou a boca esculpidas e com os olhos apertados, por combinação. */
  bodyGeos: Map<string, THREE.BufferGeometry>;
}

const caches = new WeakMap<THREE.BufferGeometry, FaceCache>();

function cacheOf(body: THREE.BufferGeometry): FaceCache {
  let c = caches.get(body);
  if (!c) {
    const fresh: Omit<FaceCache, "faceSkin"> = { faceGeos: new Map(), bodyGeos: new Map() };
    // as peças encostam na pele sem a sobrancelha e a boca do modelo, que é onde elas ficam quando o
    // rosto traz as suas
    c = { ...fresh, faceSkin: faceSkinOf(erasedBody(fresh, body, { brows: true, mouth: true, squint: [1, 1] })) };
    caches.set(body, c);
  }
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

/** Grade da pele do rosto: passo e área (no espaço da malha) que cobre a cabeça vista de frente. */
const SKIN_STEP = 0.004;
const SKIN_X0 = -0.5;
const SKIN_Y0 = 0.8;
const SKIN_W = 250;
const SKIN_H = 230;

/**
 * Pele do rosto (o corpo sem a sobrancelha e a boca do modelo) vista de frente: o z mais à frente e a
 * normal suave em cada ponto da grade. Os triângulos da malha são rasterizados uma vez, como num
 * z-buffer: a malha do boneco tem vértices a mais de 1 cm uns dos outros, e só os vértices deixariam buracos.
 */
interface SkinSurface {
  z: Float32Array;
  n: Float32Array;
}

function faceSkinOf(geo: THREE.BufferGeometry): SkinSurface {
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const index = geo.getIndex();
  const z = new Float32Array(SKIN_W * SKIN_H).fill(-Infinity);
  const n = new Float32Array(SKIN_W * SKIN_H * 3);
  const count = index ? index.count : pos.count;
  const v = [0, 0, 0];
  const gx = (x: number) => (x - SKIN_X0) / SKIN_STEP;
  const gy = (y: number) => (y - SKIN_Y0) / SKIN_STEP;
  for (let t = 0; t < count; t += 3) {
    for (let k = 0; k < 3; k++) v[k] = index ? index.getX(t + k) : t + k;
    if (v.some((i) => pos.getZ(i) < 0.1)) continue;
    const X = v.map((i) => gx(pos.getX(i)));
    const Y = v.map((i) => gy(pos.getY(i)));
    const d = (Y[1] - Y[2]) * (X[0] - X[2]) + (X[2] - X[1]) * (Y[0] - Y[2]);
    if (Math.abs(d) < 1e-9) continue;
    const x0 = Math.max(0, Math.ceil(Math.min(...X))), x1 = Math.min(SKIN_W - 1, Math.floor(Math.max(...X)));
    const y0 = Math.max(0, Math.ceil(Math.min(...Y))), y1 = Math.min(SKIN_H - 1, Math.floor(Math.max(...Y)));
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const w0 = ((Y[1] - Y[2]) * (cx - X[2]) + (X[2] - X[1]) * (cy - Y[2])) / d;
        const w1 = ((Y[2] - Y[0]) * (cx - X[2]) + (X[0] - X[2]) * (cy - Y[2])) / d;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const pz = w0 * pos.getZ(v[0]) + w1 * pos.getZ(v[1]) + w2 * pos.getZ(v[2]);
        const c = cy * SKIN_W + cx;
        if (pz <= z[c]) continue;
        z[c] = pz;
        for (let k = 0; k < 3; k++) n[c * 3 + k] = w0 * nor.getComponent(v[0], k) + w1 * nor.getComponent(v[1], k) + w2 * nor.getComponent(v[2], k);
      }
  }
  return { z, n };
}

/** Pele em (x, y): o z do rosto bem ali e a normal suave dele, para a peça pegar a mesma sombra. */
function skinAt(surface: SkinSurface, x: number, y: number, normal: THREE.Vector3): number | null {
  const cx = Math.round((x - SKIN_X0) / SKIN_STEP), cy = Math.round((y - SKIN_Y0) / SKIN_STEP);
  if (cx < 0 || cy < 0 || cx >= SKIN_W || cy >= SKIN_H) return null;
  const c = cy * SKIN_W + cx;
  if (surface.z[c] === -Infinity) return null;
  normal.fromArray(surface.n, c * 3).normalize();
  return surface.z[c];
}

/**
 * Peça de expressão do rosto: girada e subida em volta do próprio centro, com a mesma distância da
 * pele de antes, e com as normais da pele embaixo dela.
 */
function facePieceGeo(cache: FaceCache, src: THREE.Mesh, p: FacePiece): THREE.BufferGeometry {
  const key = `${p.node}|${p.turn ?? 0}|${p.up ?? 0}`;
  const hit = cache.faceGeos.get(key);
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
    const before = skinAt(cache.faceSkin, x, y, n0);
    const after = skinAt(cache.faceSkin, nx, ny, n);
    // a movida guarda a distância que tinha da pele, mas nunca fica atrás da pele mais alta em volta
    // (o degrau da órbita do olho), e vai um pouco mais longe para não sumir nela
    const nz = moved && before !== null && after !== null ? Math.max(z + after - before, after + 0.003) + 0.004 : z;
    pos.setXYZ(i, nx, ny, nz);
    if (after !== null && nor) nor.setXYZ(i, n.x, n.y, n.z);
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  cache.faceGeos.set(key, geo);
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
function erasedBody(cache: Pick<FaceCache, "bodyGeos">, src: THREE.BufferGeometry, e: BodyShape): THREE.BufferGeometry {
  const key = `${e.brows}|${e.mouth}|${e.squint.join(",")}`;
  const hit = cache.bodyGeos.get(key);
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
  cache.bodyGeos.set(key, geo);
  return geo;
}

/**
 * Veste pele, olhos e rosto do crachá no boneco (inner, já clonado). Devolve o acerto do rosto a fazer
 * depois de cada quadro das animações (piscar e cara brava).
 */
export function dressFace(inner: THREE.Object3D, dna: AvatarDNA, mats: THREE.Material[]): () => void {
  const skin = new THREE.Color(SKINS[dna.skin] ?? SKINS[0]);
  const iris = new THREE.Color(EYE_COLORS[dna.eyes] ?? EYE_COLORS[0]);
  const face = ROSTOS[dna.face] ?? ROSTOS[0];
  const body = inner.getObjectByName("boneco") as THREE.SkinnedMesh | undefined;
  const cabeca = inner.getObjectByName("cabeca");
  if (!body?.isMesh || !cabeca) return () => {};
  const cache = cacheOf(body.geometry);
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
    const isBody = mesh === body;
    if (!isBody && !SKIN_OVERLAYS.includes(mesh.name)) return;
    if (isBody && reshaped) mesh.geometry = erasedBody(cache, mesh.geometry, erase);
    const m = (mesh.material as THREE.MeshStandardMaterial).clone();
    if (isBody) tintBody(m, skin, iris, erase);
    else tintOverlay(m, skin);
    mesh.material = m;
    mats.push(m);
  });
  const lineOnly = (src: THREE.Mesh) => {
    const m = (src.material as THREE.MeshStandardMaterial).clone();
    tintOverlay(m, skin, true);
    mats.push(m);
    return m;
  };
  return wearFace(inner, cabeca, cache, face.pieces, lineOnly, erase.squint.some((s) => s !== 1));
}

/**
 * Rosto do crachá: cópias das peças de expressão, fora dos grupos que as animações ligam e desligam.
 * Quando o clipe faz a cara brava (no arremesso), ela vale; quando um olho pisca, as pálpebras do
 * rosto daquele lado saem e fica o piscar do clipe.
 */
function wearFace(
  inner: THREE.Object3D,
  cabeca: THREE.Object3D,
  cache: FaceCache,
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
    const mesh = new THREE.Mesh(facePieceGeo(cache, src, p), p.node === "boca" ? lineOnly(src) : src.material);
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
