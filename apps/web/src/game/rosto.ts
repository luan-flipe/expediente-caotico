import * as THREE from "three";
import { EYE_COLORS, SKINS, type AvatarDNA } from "@ec/shared";
import { EXPRESSOES } from "./rosto/expressoes";
import { LAYER_TEXELS, MAX_LAYERS, MAX_SEGMENTS, encode } from "./rosto/vetor";

/**
 * Pele, olhos e rosto do crachá no boneco. O rosto não é imagem: cada expressão é uma lista de formas
 * (rosto/expressoes.ts) que o shader do corpo desenha por cima da pele lisa da textura. As formas seguem
 * as pinturas do designer e ficam paradas: o olho não pisca. A cor da pele e da íris vem do crachá.
 */

/** Cor média da pele na textura do boneco (linear). */
const SKIN_BASE = new THREE.Color().setRGB(235 / 255, 190 / 255, 175 / 255, THREE.SRGBColorSpace);

/** Pontos por curva quadrática ao medir distância e dentro/fora (o mesmo no gêmeo de conferência). */
const SAMPLES = 8;

/** Formas de cada expressão já codificadas para o shader, criadas na primeira vez que alguém usa. */
const faceData = new Map<number, THREE.DataTexture>();
function faceTexture(index: number): THREE.DataTexture {
  const i = EXPRESSOES[index] ? index : 0;
  let tex = faceData.get(i);
  if (!tex) {
    const data = encode(EXPRESSOES[i]);
    tex = new THREE.DataTexture(data, data.length / 4, 1, THREE.RGBAFormat, THREE.FloatType);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    faceData.set(i, tex);
  }
  return tex;
}

/**
 * Desenha as camadas do rosto (ver encode em rosto/vetor.ts) sobre col, no ponto p do rosto (vista de
 * frente, metros). aa é o tamanho do pixel ali, para a borda suave.
 */
const FACE_GLSL = /* glsl */ `
#define FACE_MAX_LAYERS ${MAX_LAYERS}
#define FACE_MAX_SEGMENTS ${MAX_SEGMENTS}
#define FACE_SAMPLES ${SAMPLES}
#define FACE_LT ${LAYER_TEXELS}
vec4 faceT(int i) { return texelFetch(uFace, ivec2(i, 0), 0); }
vec3 drawFace(vec3 col, vec2 p, float aa) {
  int n = int(faceT(0).x + 0.5);
  float cov[FACE_MAX_LAYERS];
  for (int i = 0; i < FACE_MAX_LAYERS; i++) {
    if (i >= n) break;
    cov[i] = 0.0;
    int L = 1 + i * FACE_LT;
    vec4 box = faceT(L + 4);
    if (p.x < box.x - aa || p.y < box.y - aa || p.x > box.z + aa || p.y > box.w + aa) continue;
    vec4 t0 = faceT(L), t6 = faceT(L + 6), el = faceT(L + 5);
    int kind = int(t0.x + 0.5);
    float aL = aa + t6.w;
    float c = 0.0;
    if (kind <= 1) {
      int start = int(t0.y + 0.5), count = int(t0.z + 0.5);
      int segs = kind == 0 ? count / 2 : (count - 1) / 2;
      float d = 1e9, tb = 0.0;
      bool inside = false;
      for (int s = 0; s < FACE_MAX_SEGMENTS; s++) {
        if (s >= segs) break;
        int i0 = start + 2 * s;
        vec2 a = faceT(i0).xy, cc = faceT(i0 + 1).xy, b = faceT(start + (2 * s + 2) % count).xy;
        vec2 q = a;
        for (int j = 1; j <= FACE_SAMPLES; j++) {
          float t = float(j) / float(FACE_SAMPLES), u = 1.0 - t;
          vec2 r = u * u * a + 2.0 * u * t * cc + t * t * b;
          vec2 e = r - q, w = p - q;
          float h = clamp(dot(w, e) / max(dot(e, e), 1e-12), 0.0, 1.0);
          float dd = length(w - e * h);
          if (dd < d) { d = dd; tb = (float(s) + (float(j - 1) + h) / float(FACE_SAMPLES)) / float(segs); }
          if ((q.y > p.y) != (r.y > p.y) && p.x < e.x * (p.y - q.y) / e.y + q.x) inside = !inside;
          q = r;
        }
      }
      if (kind == 0) c = clamp(0.5 + (inside ? d : -d) / aL, 0.0, 1.0);
      else {
        vec4 t2 = faceT(L + 2);
        float wd = tb < 0.5 ? mix(t2.y, t2.z, tb * 2.0) : mix(t2.z, t2.w, tb * 2.0 - 1.0);
        c = clamp(0.5 + (wd * 0.5 - d) / aL, 0.0, 1.0);
      }
    } else if (kind <= 3) {
      vec2 dv = p - el.xy;
      vec2 q = vec2(t6.x * dv.x + t6.y * dv.y, -t6.y * dv.x + t6.x * dv.y);
      float k0 = length(q / el.zw), k1 = length(q / (el.zw * el.zw));
      float d = k1 > 0.0 ? k0 * (k0 - 1.0) / k1 : -min(el.z, el.w);
      c = kind == 2 ? clamp(0.5 - d / aL, 0.0, 1.0) : clamp(0.5 + (t6.z * 0.5 - abs(d)) / aL, 0.0, 1.0);
    } else {
      // gota: círculo de raio r embaixo e ponta fina a h acima (sdUnevenCapsule)
      float r1 = el.z, h = el.w, r2 = r1 * 0.06;
      vec2 v = vec2(abs(p.x - el.x), p.y - el.y);
      float b = (r1 - r2) / h, a = sqrt(1.0 - b * b), k = dot(v, vec2(-b, a));
      float d = k < 0.0 ? length(v) - r1 : k > a * h ? length(v - vec2(0.0, h)) - r2 : dot(v, vec2(a, b)) - r1;
      c = clamp(0.5 - d / aL, 0.0, 1.0);
    }
    int clip = int(floor(t0.w + 0.5));
    if (clip >= 0) c *= cov[clip];
    cov[i] = c;
    vec4 t2 = faceT(L + 2), t3 = faceT(L + 3), t1 = faceT(L + 1);
    float al = t2.x * c;
    if (t3.z != 0.0 || t3.w != 0.0) al *= 1.0 - clamp(dot(p - t3.xy, t3.zw), 0.0, 1.0);
    if (al <= 0.0) continue;
    col = mix(col, t1.w > 0.5 ? uIris * t1.x : t1.rgb, al);
  }
  return col;
}`;

/**
 * Pele e rosto do crachá. A pele é a da textura em escala de cor (cor do crachá sobre a cor média da
 * pele pintada): o rosado das bochechas e a sombra continuam, no tom escolhido; a fralda fica como veio.
 * Depois o rosto vetorial é desenhado na frente da cabeça, com a íris na cor de olho do crachá. Tudo é
 * medido na pose de amarração do corpo antigo: lift é quanto o osso root subiu no corpo atual.
 */
function tintBody(material: THREE.MeshStandardMaterial, skin: THREE.Color, iris: THREE.Color, face: THREE.DataTexture, lift: number): void {
  const uniforms = {
    uLift: { value: lift },
    uSkinScale: { value: new THREE.Vector3(skin.r / SKIN_BASE.r, skin.g / SKIN_BASE.g, skin.b / SKIN_BASE.b) },
    uIris: { value: iris },
    uFace: { value: face },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBindPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBindPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nuniform vec3 uSkinScale; uniform vec3 uIris; uniform float uLift; uniform highp sampler2D uFace;\nvarying vec3 vBindPos;\n${FACE_GLSL}`,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>
{
  vec3 lin = diffuseColor.rgb;
  vec3 srgb = pow(max(lin, 0.0), vec3(1.0 / 2.2));
  float mx = max(srgb.r, max(srgb.g, srgb.b)), sat = mx > 0.0 ? (mx - min(srgb.r, min(srgb.g, srgb.b))) / mx : 0.0;
  vec3 p = vBindPos - vec3(0.0, uLift, 0.0);
  bool diaper = (srgb.b > srgb.r + 0.08 && srgb.b > srgb.g) || (p.y > 0.25 && p.y < 0.52 && sat < 0.25 && mx < 0.45);
  vec3 col = diaper ? lin : lin * uSkinScale;
  // tamanho do pixel no rosto (fora do if: as derivadas pedem todos os pixels juntos)
  float aa = length(fwidth(p.xy)) * 0.75;
  if (p.y > 0.9 && p.y < 1.36 && p.z > 0.2 && abs(p.x) < 0.34) col = drawFace(col, p.xy, aa);
  diffuseColor.rgb = col;
}`,
      );
  };
  material.customProgramCacheKey = () => "bebe-corpo-vetor";
}

/**
 * Grupos de peças que as animações ligam por cima do rosto: as pálpebras do piscar e a cara brava do
 * arremesso. O rosto do crachá fica parado, então elas não aparecem.
 */
const FACE_OVERLAYS = ["piscar", "cara_brava"];

/** Altura do osso root na pose de amarração: 0 no corpo antigo, onde o rosto e as faixas foram medidos. */
function rootLift(body: THREE.SkinnedMesh): number {
  const bones = body.skeleton?.bones ?? [];
  const i = bones.findIndex((b) => b.name === "root");
  if (i < 0) return 0;
  return new THREE.Vector3().setFromMatrixPosition(body.skeleton.boneInverses[i].clone().invert()).y;
}

/**
 * Veste pele, olhos e rosto do crachá no boneco (inner, já clonado): a expressão escolhida desenhada
 * no shader do corpo, com a pele e o olho do crachá.
 */
export function dressFace(inner: THREE.Object3D, dna: AvatarDNA, mats: THREE.Material[]): void {
  for (const name of FACE_OVERLAYS) inner.getObjectByName(name)?.traverse((o) => (o.visible = false));
  const body = inner.getObjectByName("boneco") as THREE.SkinnedMesh | undefined;
  if (!body?.isMesh) return;
  const m = (body.material as THREE.MeshStandardMaterial).clone();
  tintBody(
    m,
    new THREE.Color(SKINS[dna.skin] ?? SKINS[0]),
    new THREE.Color(EYE_COLORS[dna.eyes] ?? EYE_COLORS[0]),
    faceTexture(dna.face),
    rootLift(body),
  );
  body.material = m;
  mats.push(m);
}
