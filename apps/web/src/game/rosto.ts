import * as THREE from "three";
import { EYE_COLORS, SKINS, type AvatarDNA } from "@ec/shared";
import { ROSTOS } from "./itens/pele-e-olhos";

/**
 * Pele, olhos e rosto do crachá no boneco. Cada expressão é a textura do corpo inteira, com olhos,
 * sobrancelhas e boca pintados pelo designer (pasta assets/rostos): o rosto escolhido troca a textura
 * e fica parado como foi pintado. A cor da pele e da íris do crachá vem por shader, em cima da textura.
 */

// o glob do Vite só aceita caminho literal. A máscara da íris de cada rosto sai do
// scripts/optimize-assets.mjs junto com a textura.
const FACE_FILES = import.meta.glob<string>("../assets/rostos/*.jpg", { eager: true, query: "?url", import: "default" });
const IRIS_FILES = import.meta.glob<string>("../assets/rostos/*_iris.png", { eager: true, query: "?url", import: "default" });

/** "03_triste.jpg" e "03_triste_iris.png" viram "triste". */
const faceIdOf = (path: string) =>
  path
    .split("/")
    .pop()!
    .replace(/(_iris)?\.(jpg|png)$/i, "")
    .replace(/^\d+[_-]?/, "");

/** Texturas das expressões e máscaras da íris pelo id do arquivo, depois de preloadFaces. */
const faceTextures = new Map<string, THREE.Texture>();
const irisMasks = new Map<string, THREE.Texture>();
let facesLoading: Promise<void> | null = null;

/** Carrega as texturas das expressões uma vez. Uma que falhar deixa o boneco com a textura dele. */
export function preloadFaces(): Promise<void> {
  const loader = new THREE.TextureLoader();
  const load = (files: Record<string, string>, into: Map<string, THREE.Texture>, colorSpace: THREE.ColorSpace) =>
    Object.entries(files).map(([path, url]) =>
      loader
        .loadAsync(url)
        .then((tex) => {
          // como as texturas do glTF: sem virar
          tex.flipY = false;
          tex.colorSpace = colorSpace;
          into.set(faceIdOf(path), tex);
        })
        .catch((err) => console.warn(`${url}: rosto não carregou`, err)),
    );
  facesLoading ??= Promise.all([...load(FACE_FILES, faceTextures, THREE.SRGBColorSpace), ...load(IRIS_FILES, irisMasks, THREE.NoColorSpace)]).then(() => {});
  return facesLoading;
}

/** Brilho linear (como o shader mede) de uma cor sRGB 0–255. */
function lum(r: number, g: number, b: number): number {
  const c = new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
/** Cor média da íris na textura do boneco: a referência do tingimento dela. */
const IRIS_REF = lum(117, 55, 39);
/** Cor média da pele na textura do boneco (linear). */
const SKIN_BASE = new THREE.Color().setRGB(235 / 255, 190 / 255, 175 / 255, THREE.SRGBColorSpace);

const HSV_GLSL = /* glsl */ `
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}`;

/**
 * Pele e olhos do crachá sobre a textura do boneco. A pele é a da textura em escala de cor (cor do
 * crachá sobre a cor média da pele pintada): o rosado das bochechas e a sombra continuam, no tom
 * escolhido. A íris pega a cor de olho pelo brilho dela. Ficam como vieram a fralda e os traços do
 * rosto: pupila, cílios, sobrancelha, o brilho do olho, a boca e a lágrima. A íris só é procurada na
 * faixa dos olhos, para a boca aberta (vermelha e saturada como a íris) não pegar a cor do olho.
 */
function tintBody(material: THREE.MeshStandardMaterial, skin: THREE.Color, iris: THREE.Color, eye: EyeUniforms): void {
  const uniforms = {
    uSkinScale: { value: new THREE.Vector3(skin.r / SKIN_BASE.r, skin.g / SKIN_BASE.g, skin.b / SKIN_BASE.b) },
    uIris: { value: iris },
    uIrisRef: { value: IRIS_REF },
    ...eye,
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBindPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBindPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nuniform vec3 uSkinScale; uniform vec3 uIris; uniform float uIrisRef; uniform float uIrisOn; uniform float uHasMask; uniform sampler2D uIrisMask;\nvarying vec3 vBindPos;\n${HSV_GLSL}`,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>
{
  vec3 lin = diffuseColor.rgb;
  vec3 srgb = pow(max(lin, 0.0), vec3(1.0 / 2.2));
  vec3 hsv = rgb2hsv(srgb);
  vec3 p = vBindPos;
  float l = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  bool diaper = (srgb.b > srgb.r + 0.08 && srgb.b > srgb.g) || (p.y > 0.25 && p.y < 0.52 && hsv.y < 0.25 && hsv.z < 0.45);
  bool face = p.y > 0.9 && p.y < 1.36 && p.z > 0.2 && abs(p.x) < 0.34;
  bool eyes = face && p.y > 1.05 && abs(p.x) > 0.05;
  // a íris vem da máscara do rosto (o traço grosso da pálpebra tem o mesmo marrom dela); sem máscara,
  // laranja ou marrom forte que não seja o traço bem escuro
  bool iris = uIrisOn > 0.5 && eyes
    && (uHasMask > 0.5 ? texture2D(uIrisMask, vMapUv).r > 0.5 : hsv.y > 0.45 && hsv.x * 360.0 < 35.0 && hsv.z > 0.28);
  // traço escuro, branco do olho e, abaixo dos olhos, as cores fortes (boca, língua) ficam como o
  // designer pintou
  bool feature = face && (hsv.z < 0.4 || (hsv.y < 0.15 && hsv.z > 0.7) || (p.y < 1.05 && hsv.y > 0.45));
  if (iris) diffuseColor.rgb = uIris * (l / uIrisRef);
  else if (!diaper && !feature) diffuseColor.rgb = lin * uSkinScale;
}`,
      );
  };
  material.customProgramCacheKey = () => "bebe-corpo";
}

/**
 * Grupos de peças que as animações ligam por cima do rosto: as pálpebras do piscar e a cara brava do
 * arremesso. O rosto do crachá fica como o designer pintou, então elas não aparecem.
 */
const FACE_OVERLAYS = ["piscar", "cara_brava"];

/**
 * Íris do rosto no shader do corpo: uIrisOn é a íris à mostra (no olho fechado, o traço do olho fica
 * como veio) e uIrisMask a máscara dela, quando o rosto tem.
 */
interface EyeUniforms {
  uIrisOn: { value: number };
  uHasMask: { value: number };
  uIrisMask: { value: THREE.Texture | null };
}

/** Textura do rosto (ou a máscara da íris dele) no lugar da do corpo, com o mesmo jeito de amostrar. */
function faceMap(tex: THREE.Texture | undefined, own: THREE.Texture | null): THREE.Texture | null {
  if (!tex || !own) return tex ?? null;
  if (tex.userData.sampled !== true) {
    tex.wrapS = own.wrapS;
    tex.wrapT = own.wrapT;
    tex.magFilter = own.magFilter;
    tex.minFilter = own.minFilter;
    tex.anisotropy = own.anisotropy;
    tex.userData.sampled = true;
    tex.needsUpdate = true;
  }
  return tex;
}

/**
 * Veste pele, olhos e rosto do crachá no boneco (inner, já clonado): a textura da expressão escolhida,
 * tingida com a pele e o olho do crachá. O rosto não se mexe: as animações só mexem na escala das peças
 * do piscar e da cara brava, e elas ficam escondidas.
 */
export function dressFace(inner: THREE.Object3D, dna: AvatarDNA, mats: THREE.Material[]): void {
  for (const name of FACE_OVERLAYS) inner.getObjectByName(name)?.traverse((o) => (o.visible = false));
  const body = inner.getObjectByName("boneco") as THREE.SkinnedMesh | undefined;
  if (!body?.isMesh) return;
  const face = ROSTOS[dna.face] ?? ROSTOS[0];
  const m = (body.material as THREE.MeshStandardMaterial).clone();
  const own = m.map;
  const mask = faceMap(irisMasks.get(face.texture), own);
  m.map = faceMap(faceTextures.get(face.texture), own) ?? own;
  tintBody(m, new THREE.Color(SKINS[dna.skin] ?? SKINS[0]), new THREE.Color(EYE_COLORS[dna.eyes] ?? EYE_COLORS[0]), {
    uIrisOn: { value: face.iris ? 1 : 0 },
    uHasMask: { value: mask ? 1 : 0 },
    uIrisMask: { value: mask },
  });
  body.material = m;
  mats.push(m);
}
