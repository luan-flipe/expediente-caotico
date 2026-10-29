import * as THREE from "three";

/**
 * ============================================================================
 * VFX & JUICE SYSTEM - EXPEDIENTE CAÓTICO
 * Stylized visuals inspired by Super Mario Odyssey, Super Mario Galaxy & Mario Kart 8.
 *
 * Core Tenets:
 * 1. Zero dynamic allocations in update loops (pre-allocated pools, circular buffers).
 * 2. Distinctive Nintendo tactile styling (Fresnel rim, chunky cartoon squash & stretch).
 * 3. 60 FPS rock-solid performance on desktop and mobile browsers.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. REUSABLE SCRATCH OBJECTS (ZERO GARBAGE COLLECTION)
// ----------------------------------------------------------------------------
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m0 = new THREE.Matrix4();
const _q0 = new THREE.Quaternion();
const _euler0 = new THREE.Euler();
const _col0 = new THREE.Color();
const _scale0 = new THREE.Vector3();

// ----------------------------------------------------------------------------
// 2. CONSTANTS & DRIFT TIERS
// ----------------------------------------------------------------------------
export const DRIFT_COLORS = {
  1: "#38bdf8", // Nível 1: Azul vibrante (Mini-Turbo)
  2: "#f97316", // Nível 2: Laranja fogo (Super Mini-Turbo)
  3: "#a855f7", // Nível 3: Roxo Ultra Mini-Turbo (Ultra Mini-Turbo MK8 Deluxe)
} as const;

export type DriftLevel = 0 | 1 | 2 | 3;
export type ImpactKind = "coffee" | "paper" | "staple" | "generic";

// ----------------------------------------------------------------------------
// 3. FRESNEL RIM LIGHTING (SUPER MARIO ODYSSEY / GALAXY SILHOUETTE OUTLINE)
// ----------------------------------------------------------------------------

export interface RimUniforms {
  uRimColor: { value: THREE.Color };
  uRimIntensity: { value: number };
  uRimPower: { value: number };
}

/**
 * Applies a smooth stylized Fresnel rim light to a MeshStandardMaterial (or compatible material).
 * Creates the signature soft luminous silhouette glow seen in Super Mario Odyssey and Mario Galaxy.
 *
 * @param material Target standard material to enhance with Fresnel rim shader code.
 * @param rimColor Outline color (defaults to glowing white).
 * @param intensity Brightness factor of the rim contour.
 * @param power Falloff exponent (higher = thinner silhouette edge, lower = softer wrap).
 */
export function applyFresnelRimLight(
  material: THREE.MeshStandardMaterial,
  rimColor: string | THREE.ColorRepresentation = "#ffffff",
  intensity = 0.65,
  power = 2.5
): THREE.MeshStandardMaterial {
  if (material.userData.hasFresnelRim) {
    if (material.userData.rimUniforms) {
      material.userData.rimUniforms.uRimColor.value.set(rimColor);
      material.userData.rimUniforms.uRimIntensity.value = intensity;
      material.userData.rimUniforms.uRimPower.value = power;
    }
    return material;
  }
  material.userData.hasFresnelRim = true;

  const uniforms: RimUniforms = {
    uRimColor: { value: new THREE.Color(rimColor) },
    uRimIntensity: { value: intensity },
    uRimPower: { value: power },
  };

  material.userData.rimUniforms = uniforms;
  material.customProgramCacheKey = () => `fresnelRim_${material.uuid}`;

  const prevOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevOnBeforeCompile) {
      prevOnBeforeCompile(shader, renderer);
    }

    if (shader.fragmentShader.includes("uRimColor")) {
      return;
    }

    shader.uniforms.uRimColor = uniforms.uRimColor;
    shader.uniforms.uRimIntensity = uniforms.uRimIntensity;
    shader.uniforms.uRimPower = uniforms.uRimPower;

    // Inject uniform declarations
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      /* glsl */ `
      #include <common>
      uniform vec3 uRimColor;
      uniform float uRimIntensity;
      uniform float uRimPower;
      `
    );

    // Inject rim lighting accumulation before tone mapping and output
    const rimCalculation = /* glsl */ `
      // Stylized Fresnel silhouette term (Mario Odyssey / Galaxy)
      vec3 rimViewDir = normalize( vViewPosition );
      vec3 rimNorm = normalize( normal );
      #ifdef DOUBLE_SIDED
      if ( ! gl_FrontFacing ) rimNorm = - rimNorm;
      #endif
      float fRim = pow( 1.0 - clamp( dot( rimViewDir, rimNorm ), 0.0, 1.0 ), uRimPower );
      outgoingLight += uRimColor * ( fRim * uRimIntensity );
    `;

    if (shader.fragmentShader.includes("#include <opaque_fragment>")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        `${rimCalculation}\n#include <opaque_fragment>`
      );
    } else {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `${rimCalculation}\n#include <dithering_fragment>`
      );
    }
  };

  material.needsUpdate = true;
  return material;
}

/**
 * Traverses a 3D hierarchy and applies Fresnel rim lighting to all standard materials found.
 */
export function applyFresnelRimToHierarchy(
  root: THREE.Object3D,
  rimColor: string | THREE.ColorRepresentation = "#ffffff",
  intensity = 0.65,
  power = 2.5
): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material) {
      if (Array.isArray(obj.material)) {
        for (const mat of obj.material) {
          if (mat instanceof THREE.MeshStandardMaterial) {
            applyFresnelRimLight(mat, rimColor, intensity, power);
          }
        }
      } else if (obj.material instanceof THREE.MeshStandardMaterial) {
        applyFresnelRimLight(obj.material, rimColor, intensity, power);
      }
    }
  });
}



// ----------------------------------------------------------------------------
// 3.1. CEL / TOON SHADING COM RAMP DE CORES QUENTES (SUPER MARIO ODYSSEY / MK8)
// ----------------------------------------------------------------------------

export type ToonTintMode = "cobalt" | "lavender" | "warm";

export interface ToonRampOptions {
  tintMode?: ToonTintMode;
  shadowColor?: string | THREE.ColorRepresentation;
  midColor?: string | THREE.ColorRepresentation;
  lightColor?: string | THREE.ColorRepresentation;
  width?: number;
  height?: number;
}

/**
 * Cria textura de rampa cartoon 1D/2D com bandas suaves e tonalidades quentes/vibrantes.
 * Sombras tingidas de azul-cobalto ou lavanda corporativo no estilo Mario Odyssey.
 */
export function createToonRampTexture(options: ToonRampOptions = {}): THREE.Texture {
  const width = options.width ?? 256;
  const height = options.height ?? 16;
  const tintMode = options.tintMode ?? "cobalt";

  let shadowHex = tintMode === "lavender" ? "#2d244a" : tintMode === "warm" ? "#3b1e10" : "#1e295d";
  let midHex = tintMode === "lavender" ? "#a855f7" : tintMode === "warm" ? "#f97316" : "#38bdf8";
  let lightHex = "#fffdf5";

  if (options.shadowColor) {
    shadowHex = typeof options.shadowColor === "string" ? options.shadowColor : "#" + new THREE.Color(options.shadowColor).getHexString();
  }
  if (options.midColor) {
    midHex = typeof options.midColor === "string" ? options.midColor : "#" + new THREE.Color(options.midColor).getHexString();
  }
  if (options.lightColor) {
    lightHex = typeof options.lightColor === "string" ? options.lightColor : "#" + new THREE.Color(options.lightColor).getHexString();
  }

  if (typeof document === "undefined") {
    // Node / Vitest fallback
    const c1 = new THREE.Color(shadowHex);
    const data = new Uint8Array([Math.floor(c1.r * 255), Math.floor(c1.g * 255), Math.floor(c1.b * 255), 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, width, 0);
    // Smooth Nintendo stepped cel ramp
    grad.addColorStop(0.0, shadowHex);
    grad.addColorStop(0.28, shadowHex);
    grad.addColorStop(0.32, midHex);
    grad.addColorStop(0.68, midHex);
    grad.addColorStop(0.72, lightHex);
    grad.addColorStop(1.0, lightHex);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

export interface StylizedToonOptions {
  shadowTint?: string | THREE.ColorRepresentation;
  warmHighlight?: string | THREE.ColorRepresentation;
  intensity?: number;
}

/**
 * Aplica toon/cel shading com sombras quentes tingidas de azul-cobalto ou lavanda corporativo
 * a um MeshStandardMaterial via hook onBeforeCompile.
 */
export function applyStylizedToonShading(
  material: THREE.MeshStandardMaterial,
  options: StylizedToonOptions = {}
): THREE.MeshStandardMaterial {
  if (material.userData.hasToonShading) {
    if (material.userData.toonUniforms) {
      if (options.shadowTint) material.userData.toonUniforms.uToonShadowTint.value.set(options.shadowTint);
      if (options.warmHighlight) material.userData.toonUniforms.uToonWarmHighlight.value.set(options.warmHighlight);
      if (options.intensity !== undefined) material.userData.toonUniforms.uToonIntensity.value = options.intensity;
    }
    return material;
  }
  material.userData.hasToonShading = true;

  const shadowTint = options.shadowTint ?? "#1e295d"; // Azul cobalto corporativo
  const warmHighlight = options.warmHighlight ?? "#fff8e7";
  const intensity = options.intensity ?? 0.65;

  const uniforms = {
    uToonShadowTint: { value: new THREE.Color(shadowTint) },
    uToonWarmHighlight: { value: new THREE.Color(warmHighlight) },
    uToonIntensity: { value: intensity },
  };

  material.userData.toonUniforms = uniforms;
  const prevCustomKey = material.customProgramCacheKey ? material.customProgramCacheKey() : "";
  material.customProgramCacheKey = () => `toonShade_${material.uuid}_${prevCustomKey}`;

  const prevOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevOnBeforeCompile) {
      prevOnBeforeCompile(shader, renderer);
    }

    if (shader.fragmentShader.includes("uToonShadowTint")) {
      return;
    }

    shader.uniforms.uToonShadowTint = uniforms.uToonShadowTint;
    shader.uniforms.uToonWarmHighlight = uniforms.uToonWarmHighlight;
    shader.uniforms.uToonIntensity = uniforms.uToonIntensity;

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      /* glsl */ `
      #include <common>
      uniform vec3 uToonShadowTint;
      uniform vec3 uToonWarmHighlight;
      uniform float uToonIntensity;
      `
    );

    const toonCalculation = /* glsl */ `
      // Stylized Cel / Toon Shading (Nintendo Odyssey / MK8 palette)
      vec3 toonKeyDir = normalize( vec3( 0.35, 0.9, 0.45 ) );
      vec3 toonNorm = normalize( normal );
      #ifdef DOUBLE_SIDED
      if ( ! gl_FrontFacing ) toonNorm = - toonNorm;
      #endif
      float tNdotL = clamp( dot( toonNorm, toonKeyDir ), 0.0, 1.0 );
      float tBand1 = smoothstep( 0.22, 0.30, tNdotL );
      float tBand2 = smoothstep( 0.58, 0.66, tNdotL );
      float tRamp = tBand1 * 0.45 + tBand2 * 0.55;
      vec3 tShadowColor = mix( uToonShadowTint, vec3( 1.0 ), tRamp );
      outgoingLight = mix( outgoingLight, outgoingLight * tShadowColor, uToonIntensity );
      outgoingLight += uToonWarmHighlight * ( smoothstep( 0.80, 1.0, tNdotL ) * 0.16 * uToonIntensity );
    `;

    if (shader.fragmentShader.includes("#include <opaque_fragment>")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        `${toonCalculation}\n#include <opaque_fragment>`
      );
    } else {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `${toonCalculation}\n#include <dithering_fragment>`
      );
    }
  };

  material.needsUpdate = true;
  return material;
}

/**
 * Aplica toon-shading a toda a hierarquia de objetos 3D.
 */
export function applyStylizedToonToHierarchy(
  root: THREE.Object3D,
  options: StylizedToonOptions = {}
): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material) {
      if (Array.isArray(obj.material)) {
        for (const mat of obj.material) {
          if (mat instanceof THREE.MeshStandardMaterial) {
            applyStylizedToonShading(mat, options);
          }
        }
      } else if (obj.material instanceof THREE.MeshStandardMaterial) {
        applyStylizedToonShading(obj.material, options);
      }
    }
  });
}

// ----------------------------------------------------------------------------
// 3.2. PISO ENCERADO DE ESCRITÓRIO (GLOSSY CORPORATE FLOOR SHEEN)
// ----------------------------------------------------------------------------

export interface WaxedFloorOptions {
  sheenIntensity?: number;
  neonColor?: string | THREE.ColorRepresentation;
  tubeSpacing?: number;
  fresnelPower?: number;
  roughness?: number;
  metalness?: number;
}

/**
 * Adiciona brilho de linóleo/madeira encerada polida com reflexos estéticos
 * (specular Fresnel highlight + reflexo de faixas de luz de teto neon).
 */
export function applyWaxedFloorSheen(
  material: THREE.MeshStandardMaterial,
  options: WaxedFloorOptions = {}
): THREE.MeshStandardMaterial {
  if (material.userData.hasWaxedFloorSheen) {
    if (material.userData.floorUniforms) {
      if (options.sheenIntensity !== undefined) material.userData.floorUniforms.uFloorSheen.value = options.sheenIntensity;
      if (options.neonColor) material.userData.floorUniforms.uNeonColor.value.set(options.neonColor);
      if (options.tubeSpacing !== undefined) material.userData.floorUniforms.uTubeSpacing.value = options.tubeSpacing;
      if (options.fresnelPower !== undefined) material.userData.floorUniforms.uFloorFresnelPower.value = options.fresnelPower;
    }
    return material;
  }
  material.userData.hasWaxedFloorSheen = true;

  material.roughness = options.roughness ?? 0.28;
  material.metalness = options.metalness ?? 0.06;

  const uniforms = {
    uFloorSheen: { value: options.sheenIntensity ?? 0.85 },
    uNeonColor: { value: new THREE.Color(options.neonColor ?? "#e0f2fe") },
    uTubeSpacing: { value: options.tubeSpacing ?? 4.8 },
    uFloorFresnelPower: { value: options.fresnelPower ?? 3.2 },
  };

  material.userData.floorUniforms = uniforms;
  const prevCustomKey = material.customProgramCacheKey ? material.customProgramCacheKey() : "";
  material.customProgramCacheKey = () => `waxedFloor_${material.uuid}_${prevCustomKey}`;

  const prevOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevOnBeforeCompile) {
      prevOnBeforeCompile(shader, renderer);
    }

    if (shader.fragmentShader.includes("uFloorSheen")) {
      return;
    }

    shader.uniforms.uFloorSheen = uniforms.uFloorSheen;
    shader.uniforms.uNeonColor = uniforms.uNeonColor;
    shader.uniforms.uTubeSpacing = uniforms.uTubeSpacing;
    shader.uniforms.uFloorFresnelPower = uniforms.uFloorFresnelPower;

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      /* glsl */ `
      #include <common>
      uniform float uFloorSheen;
      uniform vec3 uNeonColor;
      uniform float uTubeSpacing;
      uniform float uFloorFresnelPower;
      `
    );

    const floorCalculation = /* glsl */ `
      // Polished Office Linoleum Floor Sheen & Neon Ceiling Tube Reflections
      vec3 flrView = normalize( vViewPosition );
      vec3 flrNorm = normalize( normal );
      #ifdef DOUBLE_SIDED
      if ( ! gl_FrontFacing ) flrNorm = - flrNorm;
      #endif
      float flrFresnel = pow( 1.0 - clamp( dot( flrNorm, flrView ), 0.0, 1.0 ), uFloorFresnelPower );
      
      // Procedural neon ceiling fluorescent tube light reflection streaks
      vec3 flrRefl = reflect( - flrView, flrNorm );
      float tubeMod = abs( mod( vViewPosition.x * 0.75 + 2.0, uTubeSpacing ) - ( uTubeSpacing * 0.5 ) );
      float tubeStripe = exp( - tubeMod * tubeMod * 8.5 ) * max( 0.0, flrRefl.y );
      float neonSpecular = pow( clamp( tubeStripe, 0.0, 1.0 ), 5.0 ) * smoothstep( 0.12, 0.82, flrRefl.y );

      outgoingLight += ( uNeonColor * ( neonSpecular * 0.78 ) + vec3( 1.0 ) * ( flrFresnel * 0.32 ) ) * uFloorSheen;
    `;

    if (shader.fragmentShader.includes("#include <opaque_fragment>")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        `${floorCalculation}\n#include <opaque_fragment>`
      );
    } else {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `${floorCalculation}\n#include <dithering_fragment>`
      );
    }
  };

  material.needsUpdate = true;
  return material;
}

// ----------------------------------------------------------------------------
// 3.3. SISTEMA DE ONOMATOPEIAS 3D ESTILO HQ (COMIC SPEECH BUBBLES)
// ----------------------------------------------------------------------------

export type ComicWord = "BOING!" | "VRUUUM!" | "VISH!" | "EITA!" | "POW!" | "OUCH!" | "TURBO!";

export interface OnomatopoeiaInstance {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  active: boolean;
  age: number;
  duration: number;
  baseScale: number;
  x: number;
  y: number;
  z: number;
  vy: number;
}

const COMIC_PALETTES: Record<string, { bg: string; text: string; stroke: string; burst: boolean }> = {
  "BOING!": { bg: "#84cc16", text: "#fef08a", stroke: "#0f172a", burst: true },
  "VRUUUM!": { bg: "#ea580c", text: "#fff7ed", stroke: "#450a0a", burst: false },
  "VISH!": { bg: "#7c3aed", text: "#38bdf8", stroke: "#1e1b4b", burst: true },
  "EITA!": { bg: "#dc2626", text: "#fde047", stroke: "#450a0a", burst: true },
  "POW!": { bg: "#e11d48", text: "#fef08a", stroke: "#020617", burst: true },
  "OUCH!": { bg: "#f59e0b", text: "#ffffff", stroke: "#451a03", burst: true },
  "TURBO!": { bg: "#0284c7", text: "#f0fdf4", stroke: "#082f49", burst: false },
};

function createComicWordTexture(word: string): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([255, 220, 40, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();

  const pal = COMIC_PALETTES[word] ?? { bg: "#f59e0b", text: "#ffffff", stroke: "#0f172a", burst: true };

  const cx = 128;
  const cy = 64;

  ctx.clearRect(0, 0, 256, 128);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.06);

  if (pal.burst) {
    // Jagged comic starburst explosion
    const points = 16;
    const outerR = 60;
    const innerR = 44;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (i / (points * 2)) * Math.PI * 2;
      const px = Math.cos(a) * (r * 1.6);
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else {
    // Dynamic tilted action pill with rounded edges
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(-98, -44, 196, 88, 22);
    } else {
      ctx.rect(-98, -44, 196, 88);
    }
    ctx.closePath();
  }

  // 3D Drop shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fill();

  // Offset up-left for fill & thick border
  ctx.translate(-4, -4);
  ctx.fillStyle = pal.bg;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = pal.stroke;
  ctx.stroke();

  // Bold slanted comic text with multi-layer shadow
  ctx.font = "900 42px 'Impact', 'Arial Black', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Black block shadow
  ctx.fillStyle = pal.stroke;
  for (let offset = 4; offset >= 1; offset--) {
    ctx.fillText(word, offset, offset);
  }

  // White inner rim
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(word, 0, 0);

  // Gradient fill
  const textGrad = ctx.createLinearGradient(0, -20, 0, 20);
  textGrad.addColorStop(0, "#ffffff");
  textGrad.addColorStop(0.3, pal.text);
  textGrad.addColorStop(1, pal.text);
  ctx.fillStyle = textGrad;
  ctx.fillText(word, 0, 0);

  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

export class HQOnomatopoeiaManager {
  public group = new THREE.Group();
  private pool: OnomatopoeiaInstance[] = [];
  private poolIdx = 0;
  private maxBubbles: number;
  private geometry: THREE.PlaneGeometry;
  private textureCache = new Map<string, THREE.Texture>();

  constructor(scene?: THREE.Scene, maxBubbles = 16) {
    this.maxBubbles = maxBubbles;
    this.geometry = new THREE.PlaneGeometry(1.9, 0.95);
    this.group.name = "onomatopoeias";

    for (let i = 0; i < this.maxBubbles; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.geometry, mat);
      mesh.visible = false;
      this.group.add(mesh);

      this.pool.push({
        mesh,
        active: false,
        age: 0,
        duration: 0.75,
        baseScale: 1.0,
        x: 0,
        y: 0,
        z: 0,
        vy: 1.5,
      });
    }

    if (scene) {
      scene.add(this.group);
    }
  }

  private getTexture(word: string): THREE.Texture {
    let tex = this.textureCache.get(word);
    if (!tex) {
      tex = createComicWordTexture(word);
      this.textureCache.set(word, tex);
    }
    return tex;
  }

  public spawn(
    x: number,
    y: number,
    z: number,
    text: ComicWord | string = "BOING!",
    scale = 1.0,
    duration = 0.78
  ): void {
    const inst = this.pool[this.poolIdx];
    this.poolIdx = (this.poolIdx + 1) % this.maxBubbles;

    inst.active = true;
    inst.age = 0;
    inst.duration = duration;
    inst.baseScale = scale;
    inst.x = x;
    inst.y = y;
    inst.z = z;
    inst.vy = 1.4 + Math.random() * 0.6;

    inst.mesh.material.map = this.getTexture(text);
    inst.mesh.material.needsUpdate = true;
    inst.mesh.position.set(x, y, z);
    inst.mesh.scale.set(0.01, 0.01, 1);
    inst.mesh.material.opacity = 1;
    inst.mesh.visible = true;
  }

  public update(dt: number, camera?: THREE.Camera): void {
    for (let i = 0; i < this.maxBubbles; i++) {
      const inst = this.pool[i];
      if (!inst.active) continue;

      inst.age += dt;
      if (inst.age >= inst.duration) {
        inst.active = false;
        inst.mesh.visible = false;
        continue;
      }

      const p = inst.age / inst.duration;

      // Float upwards gently
      inst.y += inst.vy * dt;
      inst.vy = Math.max(0.3, inst.vy - 1.2 * dt);
      inst.mesh.position.set(inst.x, inst.y, inst.z);

      // Billboard facing camera
      if (camera) {
        inst.mesh.quaternion.copy(camera.quaternion);
      }

      // Harmonic Squash & Stretch Animation:
      // Phase 1 (0..0.22): Explosive pop with horizontal squash
      // Phase 2 (0.22..0.68): Elastic harmonic oscillation (wobble)
      // Phase 3 (0.68..1.0): Dissolve & float away
      let scaleX = inst.baseScale;
      let scaleY = inst.baseScale;

      if (p < 0.22) {
        const pop = Math.sin((p / 0.22) * Math.PI * 0.5);
        scaleX *= pop * 1.35;
        scaleY *= pop * 0.82;
        inst.mesh.material.opacity = 1.0;
      } else if (p < 0.68) {
        const wobblePhase = (p - 0.22) / 0.46;
        const wobble = Math.sin(wobblePhase * Math.PI * 4.0) * Math.exp(-wobblePhase * 3.0) * 0.28;
        scaleX *= (1.0 + wobble);
        scaleY *= (1.0 - wobble);
        inst.mesh.material.opacity = 1.0;
      } else {
        const fadePhase = (p - 0.68) / 0.32;
        const fade = 1.0 - fadePhase;
        scaleX *= (1.0 + (1.0 - fade) * 0.2) * fade;
        scaleY *= (1.0 + (1.0 - fade) * 0.2) * fade;
        inst.mesh.material.opacity = Math.max(0, fade);
      }

      inst.mesh.scale.set(scaleX, scaleY, 1);
    }
  }

  public getActiveCount(): number {
    let count = 0;
    for (const b of this.pool) if (b.active) count++;
    return count;
  }

  public dispose(): void {
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    this.geometry.dispose();
    for (const b of this.pool) {
      b.mesh.material.dispose();
    }
    for (const tex of this.textureCache.values()) {
      tex.dispose();
    }
    this.textureCache.clear();
  }
}

// ----------------------------------------------------------------------------
// 3.5. DYNAMIC FOV & CAMERA SQUASH (JUICE)
// ----------------------------------------------------------------------------

export interface DynamicFovOptions {
  speed: number;
  maxSpeed?: number;
  isBoosting?: boolean;
  isDrafting?: boolean;
  draftRatio?: number;
  isBraking?: boolean;
  hasCoffee?: boolean;
  baseFov?: number;
  minFov?: number;
  maxFov?: number;
}

/**
 * Interpolação elástica e dinâmica do FOV da câmera:
 * - Base: 60°
 * - Aceleração / velocidade de cruzeiro: 60° -> ~64°
 * - Turbo, Vácuo (Slipstream) e Café: abre suavemente até 74° (com fitas radiais nas bordas)
 * - Freadas bruscas: comprime com squash de câmera para 56°
 */
export function calculateDynamicFov(options: DynamicFovOptions): number {
  const baseFov = options.baseFov ?? 60.0;
  const minFov = options.minFov ?? 56.0;
  const maxFov = options.maxFov ?? 74.0;
  const maxSpeed = options.maxSpeed ?? 18.0;

  // 1. Freada brusca: comprime o FOV para 56°
  if (options.isBraking && options.speed > 1.5) {
    const brakeIntensity = Math.min(1.0, options.speed / 7.0);
    return baseFov - (baseFov - minFov) * brakeIntensity;
  }

  // 2. Velocidade normal de cruzeiro
  const speedRatio = Math.min(1.0, Math.max(0, (options.speed - 4.0) / (maxSpeed - 4.0)));
  let fov = baseFov + speedRatio * 4.0;

  // 3. Fatores estimulantes: Turbo, Vácuo e Café abrem até 74°
  let boostFactor = 0;
  if (options.isBoosting) {
    boostFactor = Math.max(boostFactor, 1.0);
  }
  if (options.isDrafting) {
    boostFactor = Math.max(boostFactor, 1.0);
  } else if (options.draftRatio && options.draftRatio > 0) {
    boostFactor = Math.max(boostFactor, options.draftRatio * 0.85);
  }
  if (options.hasCoffee) {
    boostFactor = Math.max(boostFactor, 0.75);
  }

  if (boostFactor > 0) {
    fov = Math.max(fov, 64.0 + (maxFov - 64.0) * boostFactor);
  }

  return Math.min(maxFov, Math.max(minFov, fov));
}

// ----------------------------------------------------------------------------
// 3.6. SOMBRAS DE CONTATO CARTOON (BLOB SHADOWS)
// ----------------------------------------------------------------------------

let _blobShadowTexture: THREE.Texture | null = null;

export function createBlobShadowTexture(): THREE.Texture {
  if (_blobShadowTexture) return _blobShadowTexture;
  if (typeof document === "undefined") {
    // Node / test fallback: 2x2 data texture
    const data = new Uint8Array([10, 12, 18, 220]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    _blobShadowTexture = tex;
    return tex;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    // Velvety soft ambient occlusion falloff
    grad.addColorStop(0.0, "rgba(8, 10, 16, 0.92)");
    grad.addColorStop(0.4, "rgba(8, 10, 16, 0.72)");
    grad.addColorStop(0.72, "rgba(8, 10, 16, 0.22)");
    grad.addColorStop(1.0, "rgba(8, 10, 16, 0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  _blobShadowTexture = tex;
  return tex;
}

export class CasterBlobShadows {
  public group: THREE.Group;
  public centralMesh: THREE.Mesh;
  public casterMeshes: THREE.Mesh[] = [];
  public material: THREE.MeshBasicMaterial;
  public geometry: THREE.BufferGeometry;

  constructor(parent?: THREE.Object3D) {
    this.group = new THREE.Group();
    this.group.name = "blobShadows";
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.material = new THREE.MeshBasicMaterial({
      map: createBlobShadowTexture(),
      color: 0x080a10,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });

    // 1. Central Ambient Occlusion Core Decal (under seat & piston)
    this.centralMesh = new THREE.Mesh(this.geometry, this.material);
    this.centralMesh.rotation.x = -Math.PI / 2;
    this.centralMesh.position.set(0, 0, 0);
    this.centralMesh.scale.set(0.68, 0.68, 1);
    this.group.add(this.centralMesh);

    // 2. 5 Caster Wheel Blobs (placed at the star base caster wheels)
    const wheelDist = 0.35;
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const offsetX = Math.sin(angle) * wheelDist;
      const offsetZ = Math.cos(angle) * wheelDist;

      const casterMesh = new THREE.Mesh(this.geometry, this.material);
      casterMesh.rotation.x = -Math.PI / 2;
      casterMesh.position.set(offsetX, 0, offsetZ);
      casterMesh.scale.set(0.24, 0.24, 1);
      this.group.add(casterMesh);
      this.casterMeshes.push(casterMesh);
    }

    if (parent) {
      parent.add(this.group);
    }
  }

  /**
   * Updates blob shadow scales and opacity according to suspension compression and height.
   * Zero GC allocations.
   *
   * @param pistonOffset suspension piston offset in meters (negative = compressed)
   * @param kartY world or relative height of kart above floor
   * @param inAir whether kart is airborne / jumping
   */
  public update(pistonOffset: number, kartY: number, inAir: boolean): void {
    if (kartY < -0.3) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    // Pin shadow to the track floor
    this.group.position.y = inAir || kartY > 0.02 ? 0.015 - kartY : 0.015;

    // Suspension compression: pistonOffset < 0
    const compression = Math.max(0, -pistonOffset);
    const airHeight = Math.max(0, kartY);

    if (inAir || airHeight > 0.06) {
      // Airborne: shadows spread out softly and fade
      const spread = 1.0 + airHeight * 0.75;
      const fade = Math.max(0.06, 0.58 - airHeight * 0.16);
      this.material.opacity = fade;

      const centralScale = 0.68 * spread;
      this.centralMesh.scale.set(centralScale, centralScale, 1);

      const casterScale = 0.24 * spread;
      for (let i = 0; i < 5; i++) {
        this.casterMeshes[i].scale.set(casterScale, casterScale, 1);
      }
    } else {
      // Grounded: compression squash & stretch
      // Under heavy load (landing, boosting), blobs swell outward and deepen darkness
      const squashScale = 1.0 + compression * 4.2;
      const groundOpacity = Math.min(0.88, 0.58 + compression * 2.8);
      this.material.opacity = groundOpacity;

      const centralScale = 0.68 * (1.0 + compression * 1.8);
      this.centralMesh.scale.set(centralScale, centralScale, 1);

      const casterScale = 0.24 * squashScale;
      for (let i = 0; i < 5; i++) {
        this.casterMeshes[i].scale.set(casterScale, casterScale, 1);
      }
    }
  }

  public dispose(): void {
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ----------------------------------------------------------------------------
// 4. PROCEDURAL GEOMETRIES
// ----------------------------------------------------------------------------

/**
 * Generates a faceted 3D diamond star spark geometry (16 triangles).
 * Emulates the crisp low-poly geometric sparks from Mario Kart 8 drift mini-turbos.
 */
function createStylizedStarGeometry(outerRadius = 0.22, innerRadius = 0.07, thickness = 0.05): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  // Vertices:
  // 0: Front Apex (+z)
  // 1: Back Apex (-z)
  // 2: North (0, outerR, 0)
  // 3: East (outerR, 0, 0)
  // 4: South (0, -outerR, 0)
  // 5: West (-outerR, 0, 0)
  // 6: NE (innerR, innerR, 0)
  // 7: SE (innerR, -innerR, 0)
  // 8: SW (-innerR, -innerR, 0)
  // 9: NW (-innerR, innerR, 0)
  const verts = [
    [0, 0, thickness], // 0
    [0, 0, -thickness], // 1
    [0, outerRadius, 0], // 2
    [outerRadius, 0, 0], // 3
    [0, -outerRadius, 0], // 4
    [-outerRadius, 0, 0], // 5
    [innerRadius, innerRadius, 0], // 6
    [innerRadius, -innerRadius, 0], // 7
    [-innerRadius, -innerRadius, 0], // 8
    [-innerRadius, innerRadius, 0], // 9
  ];

  for (const v of verts) {
    positions.push(v[0], v[1], v[2]);
  }

  // Front faces (Apex 0)
  indices.push(
    0, 2, 6,
    0, 6, 3,
    0, 3, 7,
    0, 7, 4,
    0, 4, 8,
    0, 8, 5,
    0, 5, 9,
    0, 9, 2
  );

  // Back faces (Apex 1 - inverted winding for outward normals)
  indices.push(
    1, 6, 2,
    1, 3, 6,
    1, 7, 3,
    1, 4, 7,
    1, 8, 4,
    1, 5, 8,
    1, 9, 5,
    1, 2, 9
  );

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates an aerodynamic double-tapered wind streak ribbon geometry.
 */
function createSpeedRibbonGeometry(length = 3.6, width = 0.045): THREE.BufferGeometry {
  // A sleek 4-vertex diamond ribbon
  // Front tip (0, 0, -L/2), Right waist (+w, 0, 0), Back tip (0, 0, +L/2), Left waist (-w, 0, 0)
  const halfL = length * 0.5;
  const halfW = width * 0.5;

  const positions = new Float32Array([
    0, 0, -halfL,
    halfW, 0, 0,
    0, 0, halfL,
    -halfW, 0, 0,
  ]);

  const indices = [0, 1, 2, 0, 2, 3];

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ----------------------------------------------------------------------------
// 5. INTERNAL DATA STRUCTURES FOR PARTICLES & POOLS
// ----------------------------------------------------------------------------

interface SmokeInstance {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  baseScale: number;
  stretch: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  rotSpeedX: number;
  rotSpeedY: number;
  rotSpeedZ: number;
  r: number;
  g: number;
  b: number;
  active: boolean;
}

interface SparkInstance {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  scale: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  rotSpeedX: number;
  rotSpeedY: number;
  rotSpeedZ: number;
  r: number;
  g: number;
  b: number;
  active: boolean;
}

interface DropletInstance {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  baseScale: number;
  groundY: number;
  hitFloor: boolean;
  floorTimer: number;
  r: number;
  g: number;
  b: number;
  active: boolean;
}

interface StreakInstance {
  relAngle: number;
  relRadius: number;
  relDist: number;
  speed: number;
  lengthScale: number;
  seed: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  active: boolean;
  age: number;
  duration: number;
  maxRadius: number;
  x: number;
  y: number;
  z: number;
}

export interface RaceVfxOptions {
  maxSmoke?: number;
  maxSparks?: number;
  maxStreaks?: number;
  maxDroplets?: number;
  maxShockwaves?: number;
  maxOnomatopoeias?: number;
}

// ----------------------------------------------------------------------------
// 6. MAIN CLASS: RaceVfxManager
// ----------------------------------------------------------------------------

export class RaceVfxManager {
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  // Capacities
  private maxSmoke: number;
  private maxSparks: number;
  private maxStreaks: number;
  private maxDroplets: number;
  private maxShockwaves: number;

  // Pools
  private smokePool: SmokeInstance[];
  private smokeIdx = 0;
  private smokeMesh: THREE.InstancedMesh;
  private smokeGeo: THREE.BufferGeometry;
  private smokeMat: THREE.MeshStandardMaterial;

  private sparkPool: SparkInstance[];
  private sparkIdx = 0;
  private sparkMesh: THREE.InstancedMesh;
  private sparkGeo: THREE.BufferGeometry;
  private sparkMat: THREE.MeshBasicMaterial;

  private dropletPool: DropletInstance[];
  private dropletIdx = 0;
  private dropletMesh: THREE.InstancedMesh;
  private dropletGeo: THREE.BufferGeometry;
  private dropletMat: THREE.MeshStandardMaterial;

  private streakPool: StreakInstance[];
  private streakMesh: THREE.InstancedMesh;
  private streakGeo: THREE.BufferGeometry;
  private streakMat: THREE.MeshBasicMaterial;
  private streaksActive = false;
  private streakIntensity = 0;
  private targetStreakIntensity = 0;
  private streakKartPos = new THREE.Vector3();
  private streakHeading = 0;
  private streakSpeed = 0;

  private shockwaves: ShockwaveRing[] = [];
  private shockwaveIdx = 0;
  private shockwaveGroup = new THREE.Group();
  private shockwaveGeo: THREE.RingGeometry;

  private onomatopoeias: HQOnomatopoeiaManager;

  constructor(scene: THREE.Scene, camera: THREE.Camera, options: RaceVfxOptions = {}) {
    this.scene = scene;
    this.camera = camera;

    this.maxSmoke = options.maxSmoke ?? 128;
    this.maxSparks = options.maxSparks ?? 160;
    this.maxStreaks = options.maxStreaks ?? 48;
    this.maxDroplets = options.maxDroplets ?? 96;
    this.maxShockwaves = options.maxShockwaves ?? 8;

    // --- Smoke System (Chunky Cartoon Marshmallow Clouds) ---
    this.smokePool = [];
    for (let i = 0; i < this.maxSmoke; i++) {
      this.smokePool.push({
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        age: 0, life: 0.4,
        baseScale: 1, stretch: 1,
        rotX: 0, rotY: 0, rotZ: 0,
        rotSpeedX: 0, rotSpeedY: 0, rotSpeedZ: 0,
        r: 1, g: 1, b: 1,
        active: false,
      });
    }

    this.smokeGeo = new THREE.SphereGeometry(0.32, 9, 7);
    this.smokeMat = new THREE.MeshStandardMaterial({
      color: "#faf6ed",
      roughness: 0.88,
      metalness: 0.05,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    // Add soft satin Fresnel rim to smoke puffs for stylized Mario Odyssey cloud texture
    applyFresnelRimLight(this.smokeMat, "#ffffff", 0.55, 2.2);

    this.smokeMesh = new THREE.InstancedMesh(this.smokeGeo, this.smokeMat, this.maxSmoke);
    this.smokeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.smokeMesh.instanceColor) {
      this.smokeMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.smokeMesh.frustumCulled = false;
    _m0.makeScale(0, 0, 0);
    for (let i = 0; i < this.maxSmoke; i++) {
      this.smokeMesh.setMatrixAt(i, _m0);
    }
    this.smokeMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.smokeMesh);

    // --- Spark System (Geometric Faceted Diamond Stars) ---
    this.sparkPool = [];
    for (let i = 0; i < this.maxSparks; i++) {
      this.sparkPool.push({
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        age: 0, life: 0.25,
        scale: 1,
        rotX: 0, rotY: 0, rotZ: 0,
        rotSpeedX: 0, rotSpeedY: 0, rotSpeedZ: 0,
        r: 1, g: 1, b: 1,
        active: false,
      });
    }

    this.sparkGeo = createStylizedStarGeometry(0.22, 0.07, 0.05);
    this.sparkMat = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });

    this.sparkMesh = new THREE.InstancedMesh(this.sparkGeo, this.sparkMat, this.maxSparks);
    this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.sparkMesh.instanceColor) {
      this.sparkMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.sparkMesh.frustumCulled = false;
    for (let i = 0; i < this.maxSparks; i++) {
      this.sparkMesh.setMatrixAt(i, _m0);
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.sparkMesh);

    // --- Cartoon Splash Droplet System ---
    this.dropletPool = [];
    for (let i = 0; i < this.maxDroplets; i++) {
      this.dropletPool.push({
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        age: 0, life: 0.5,
        baseScale: 1,
        groundY: 0.03,
        hitFloor: false,
        floorTimer: 0,
        r: 1, g: 1, b: 1,
        active: false,
      });
    }

    this.dropletGeo = new THREE.SphereGeometry(0.08, 8, 6);
    this.dropletMat = new THREE.MeshStandardMaterial({
      roughness: 0.35,
      metalness: 0.1,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.dropletMesh = new THREE.InstancedMesh(this.dropletGeo, this.dropletMat, this.maxDroplets);
    this.dropletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.dropletMesh.instanceColor) {
      this.dropletMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.dropletMesh.frustumCulled = false;
    for (let i = 0; i < this.maxDroplets; i++) {
      this.dropletMesh.setMatrixAt(i, _m0);
    }
    this.dropletMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.dropletMesh);

    // --- Speed Wind Streaks (Galaxy/MK8 Warp Ribbons) ---
    this.streakPool = [];
    for (let i = 0; i < this.maxStreaks; i++) {
      this.streakPool.push({
        relAngle: (i / this.maxStreaks) * Math.PI * 2 + Math.random() * 0.5,
        relRadius: 1.4 + Math.random() * 3.2,
        relDist: (Math.random() - 0.3) * 14,
        speed: 40 + Math.random() * 25,
        lengthScale: 0.8 + Math.random() * 0.6,
        seed: Math.random() * 100,
      });
    }

    this.streakGeo = createSpeedRibbonGeometry(3.6, 0.045);
    this.streakMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.streakMesh = new THREE.InstancedMesh(this.streakGeo, this.streakMat, this.maxStreaks);
    this.streakMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.streakMesh.frustumCulled = false;
    for (let i = 0; i < this.maxStreaks; i++) {
      this.streakMesh.setMatrixAt(i, _m0);
    }
    this.streakMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.streakMesh);

    // --- Impact Shockwave Rings ---
    this.shockwaveGeo = new THREE.RingGeometry(0.82, 1.0, 36);
    this.scene.add(this.shockwaveGroup);

    this.onomatopoeias = new HQOnomatopoeiaManager(this.scene, options.maxOnomatopoeias ?? 16);

    for (let i = 0; i < this.maxShockwaves; i++) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(this.shockwaveGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.visible = false;
      this.shockwaveGroup.add(ringMesh);

      this.shockwaves.push({
        mesh: ringMesh,
        active: false,
        age: 0,
        duration: 0.38,
        maxRadius: 3.2,
        x: 0, y: 0.025, z: 0,
      });
    }
  }

  // --------------------------------------------------------------------------
  // SPAWN METHODS
  // --------------------------------------------------------------------------

  /**
   * Spawns a stylized 3D comic speech bubble / sound effect ("BOING!", "VRUUUM!", "VISH!", "EITA!", "POW!").
   */
  public spawnOnomatopoeia(
    x: number,
    y: number,
    z: number,
    text: ComicWord | string = "BOING!",
    scale = 1.0,
    duration = 0.78
  ): void {
    this.onomatopoeias.spawn(x, y, z, text, scale, duration);
  }

  public getOnomatopoeiaManager(): HQOnomatopoeiaManager {
    return this.onomatopoeias;
  }

  /**
   * Spawns a chunky cartoon drift smoke puff with squash & stretch physics.
   */
  public spawnDriftSmoke(
    x: number,
    y: number,
    z: number,
    fwdX: number,
    fwdZ: number,
    speed: number,
    isBoosting = false,
    customColor?: string | THREE.ColorRepresentation
  ): void {
    const puff = this.smokePool[this.smokeIdx];
    this.smokeIdx = (this.smokeIdx + 1) % this.maxSmoke;

    puff.active = true;
    puff.age = 0;
    puff.life = isBoosting ? 0.35 + Math.random() * 0.12 : 0.44 + Math.random() * 0.15;
    puff.baseScale = isBoosting ? 1.15 + Math.random() * 0.3 : 0.85 + Math.random() * 0.3;
    puff.stretch = 1.35;

    puff.x = x;
    puff.y = Math.max(0.06, y);
    puff.z = z;

    // Backward velocity opposite to heading, with slight lateral dispersion & upward buoyancy
    const kickback = -speed * 0.22;
    puff.vx = fwdX * kickback + (Math.random() - 0.5) * 0.6;
    puff.vy = 0.55 + Math.random() * 0.55;
    puff.vz = fwdZ * kickback + (Math.random() - 0.5) * 0.6;

    puff.rotX = Math.random() * Math.PI * 2;
    puff.rotY = Math.random() * Math.PI * 2;
    puff.rotZ = Math.random() * Math.PI * 2;
    puff.rotSpeedX = (Math.random() - 0.5) * 4;
    puff.rotSpeedY = (Math.random() - 0.5) * 4;
    puff.rotSpeedZ = (Math.random() - 0.5) * 4;

    if (customColor) {
      _col0.set(customColor);
      puff.r = _col0.r;
      puff.g = _col0.g;
      puff.b = _col0.b;
    } else if (isBoosting) {
      puff.r = 0.98;
      puff.g = 0.92;
      puff.b = 0.82;
    } else {
      puff.r = 0.98;
      puff.g = 0.97;
      puff.b = 0.94;
    }
  }

  /**
   * Spawns stylized geometric faceted star sparks for drift mini-turbo tiers.
   *
   * @param x Kart wheel world X
   * @param y Kart wheel world Y
   * @param z Kart wheel world Z
   * @param heading Kart forward heading in radians
   * @param driftLevel 1 (Blue #38bdf8), 2 (Orange #f97316), or 3 (Purple #a855f7)
   * @param driftDir Drift direction (-1 left, +1 right)
   */
  public spawnDriftSparks(
    x: number,
    y: number,
    z: number,
    heading: number,
    driftLevel: DriftLevel,
    driftDir: number
  ): void {
    if (driftLevel <= 0) return;

    const count = driftLevel === 3 ? 3 : driftLevel === 2 ? 2 : 1;
    const colorHex = DRIFT_COLORS[driftLevel as 1 | 2 | 3] ?? DRIFT_COLORS[1];
    _col0.set(colorHex);

    const rightX = Math.cos(heading);
    const rightZ = -Math.sin(heading);

    for (let i = 0; i < count; i++) {
      const spark = this.sparkPool[this.sparkIdx];
      this.sparkIdx = (this.sparkIdx + 1) % this.maxSparks;

      spark.active = true;
      spark.age = 0;
      spark.life = 0.22 + Math.random() * 0.12;

      // Scale grows with drift tier
      const tierScale = driftLevel === 3 ? 1.4 : driftLevel === 2 ? 1.15 : 0.9;
      spark.scale = tierScale * (0.8 + Math.random() * 0.4);

      spark.x = x + rightX * (driftDir * -0.15 + (Math.random() - 0.5) * 0.1);
      spark.y = Math.max(0.08, y + 0.05 + Math.random() * 0.08);
      spark.z = z + rightZ * (driftDir * -0.15 + (Math.random() - 0.5) * 0.1);

      // Jet sparks backwards & outward from the drifting wheel
      const ejectSpeed = 3.5 + Math.random() * 3.5;
      const angleOffset = driftDir * -0.7 + (Math.random() - 0.5) * 0.6;
      const cosA = Math.cos(heading + Math.PI + angleOffset);
      const sinA = Math.sin(heading + Math.PI + angleOffset);

      spark.vx = sinA * ejectSpeed;
      spark.vy = 1.4 + Math.random() * 2.2;
      spark.vz = cosA * ejectSpeed;

      spark.rotX = Math.random() * Math.PI * 2;
      spark.rotY = Math.random() * Math.PI * 2;
      spark.rotZ = Math.random() * Math.PI * 2;
      spark.rotSpeedX = (Math.random() - 0.5) * 22;
      spark.rotSpeedY = (Math.random() - 0.5) * 22;
      spark.rotSpeedZ = (Math.random() - 0.5) * 22;

      spark.r = _col0.r;
      spark.g = _col0.g;
      spark.b = _col0.b;
    }
  }

  /**
   * Sets speed wind streaks (Galaxy/MK8 warp ribbons) state.
   */
  public setSpeedStreaks(
    active: boolean,
    intensity = 1.0,
    kartX = 0,
    kartY = 0,
    kartZ = 0,
    heading = 0,
    speed = 0
  ): void {
    this.streaksActive = active;
    this.targetStreakIntensity = active ? Math.min(1.0, Math.max(0, intensity)) : 0;
    this.streakKartPos.set(kartX, kartY, kartZ);
    this.streakHeading = heading;
    this.streakSpeed = speed;
  }

  /**
   * Spawns an expanding cartoon ground shockwave and splash droplet crown.
   */
  public spawnImpactShockwave(
    x: number,
    z: number,
    y = 0.025,
    kind: ImpactKind = "generic",
    radius = 3.2
  ): void {
    // 1. Shockwave ground ring
    const sw = this.shockwaves[this.shockwaveIdx];
    this.shockwaveIdx = (this.shockwaveIdx + 1) % this.maxShockwaves;

    sw.active = true;
    sw.age = 0;
    sw.duration = 0.36;
    sw.maxRadius = radius;
    sw.x = x;
    sw.y = y;
    sw.z = z;
    sw.mesh.position.set(x, y, z);
    sw.mesh.scale.set(0.01, 0.01, 1);
    sw.mesh.visible = true;

    // Item-specific ring coloration
    if (kind === "coffee") {
      sw.mesh.material.color.set("#c27830");
    } else if (kind === "paper") {
      sw.mesh.material.color.set("#ffffff");
    } else if (kind === "staple") {
      sw.mesh.material.color.set("#38bdf8");
    } else {
      sw.mesh.material.color.set("#ffffff");
    }

    // 2. Cartoon splash droplet crown
    const dropletCount = 14;
    for (let i = 0; i < dropletCount; i++) {
      const drop = this.dropletPool[this.dropletIdx];
      this.dropletIdx = (this.dropletIdx + 1) * 1 % this.maxDroplets;

      drop.active = true;
      drop.age = 0;
      drop.life = 0.45 + Math.random() * 0.18;
      drop.baseScale = 0.8 + Math.random() * 0.5;
      drop.groundY = y;
      drop.hitFloor = false;
      drop.floorTimer = 0;

      const angle = (i / dropletCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const hSpeed = 2.4 + Math.random() * 2.8;

      drop.x = x + Math.cos(angle) * 0.12;
      drop.y = y + 0.05;
      drop.z = z + Math.sin(angle) * 0.12;

      drop.vx = Math.cos(angle) * hSpeed;
      drop.vy = 3.6 + Math.random() * 2.8;
      drop.vz = Math.sin(angle) * hSpeed;

      if (kind === "coffee") {
        // Dark espresso brown with occasional crema speckles
        if (Math.random() > 0.3) {
          _col0.set("#3e1f0b");
        } else {
          _col0.set("#b37a3b");
        }
      } else if (kind === "paper") {
        if (Math.random() > 0.25) {
          _col0.set("#fafafa");
        } else {
          _col0.set("#dc2626"); // legal red stamp accent
        }
      } else if (kind === "staple") {
        _col0.set("#38bdf8");
      } else {
        _col0.set("#ffffff");
      }

      drop.r = _col0.r;
      drop.g = _col0.g;
      drop.b = _col0.b;
    }
  }

  // --------------------------------------------------------------------------
  // UPDATE LOOP (60 FPS ZERO DYNAMIC ALLOCATION)
  // --------------------------------------------------------------------------

  /**
   * Main per-frame update tick.
   * Call inside the game render loop before `renderer.render()`.
   */
  public update(dt: number, _now = 0, camera?: THREE.Camera): void {
    // ------------------------------------------------------------------------
    // 1. UPDATE SMOKE PUFFS (Squash & Stretch Cartoon Clouds)
    // ------------------------------------------------------------------------
    let smokeNeedsUpdate = false;
    for (let i = 0; i < this.maxSmoke; i++) {
      const p = this.smokePool[i];
      if (!p.active) continue;

      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        _m0.makeScale(0, 0, 0);
        this.smokeMesh.setMatrixAt(i, _m0);
        smokeNeedsUpdate = true;
        continue;
      }

      smokeNeedsUpdate = true;
      const progress = p.age / p.life;

      // Integrate motion
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Gentle upward buoyancy & atmospheric drag
      p.vx *= 0.94;
      p.vz *= 0.94;
      p.vy = Math.max(-0.1, p.vy - 0.35 * dt);

      // Tumble rotation
      p.rotX += p.rotSpeedX * dt;
      p.rotY += p.rotSpeedY * dt;
      p.rotZ += p.rotSpeedZ * dt;

      // Nintendo cartoon squash & stretch curve:
      // Rapid puff swelling pop, settling into a fluffy rounded sphere, then smooth dissolution
      let scaleX = p.baseScale;
      let scaleY = p.baseScale;
      let scaleZ = p.baseScale;

      if (progress < 0.22) {
        // Initial pop: squashed horizontally, expanding vertically
        const pop = Math.sin((progress / 0.22) * Math.PI * 0.5);
        const squash = 1.0 + (1.0 - pop) * 0.45;
        scaleX *= pop * (1.8 - squash);
        scaleY *= pop * squash * p.stretch;
        scaleZ *= pop * (1.8 - squash);
      } else if (progress < 0.72) {
        // Fluffy rounded expansion
        const expand = 1.0 + (progress - 0.22) * 0.55;
        scaleX *= expand;
        scaleY *= expand;
        scaleZ *= expand;
      } else {
        // Smooth cartoon shrink & fade
        const fade = (1.0 - progress) / 0.28;
        const expand = 1.0 + (0.72 - 0.22) * 0.55;
        scaleX *= expand * fade;
        scaleY *= expand * fade;
        scaleZ *= expand * fade;
      }

      _v0.set(p.x, p.y, p.z);
      _euler0.set(p.rotX, p.rotY, p.rotZ);
      _q0.setFromEuler(_euler0);
      _scale0.set(scaleX, scaleY, scaleZ);

      _m0.compose(_v0, _q0, _scale0);
      this.smokeMesh.setMatrixAt(i, _m0);

      _col0.setRGB(p.r, p.g, p.b);
      this.smokeMesh.setColorAt(i, _col0);
    }

    if (smokeNeedsUpdate) {
      this.smokeMesh.instanceMatrix.needsUpdate = true;
      if (this.smokeMesh.instanceColor) {
        this.smokeMesh.instanceColor.needsUpdate = true;
      }
    }

    // ------------------------------------------------------------------------
    // 2. UPDATE GEOMETRIC STAR SPARKS
    // ------------------------------------------------------------------------
    let sparksNeedUpdate = false;
    for (let i = 0; i < this.maxSparks; i++) {
      const s = this.sparkPool[i];
      if (!s.active) continue;

      s.age += dt;
      if (s.age >= s.life) {
        s.active = false;
        _m0.makeScale(0, 0, 0);
        this.sparkMesh.setMatrixAt(i, _m0);
        sparksNeedUpdate = true;
        continue;
      }

      sparksNeedUpdate = true;
      const progress = s.age / s.life;

      // Ballistic arc with gravity
      s.vy -= 14.0 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;

      // Ground bounce
      if (s.y < 0.05) {
        s.y = 0.05;
        s.vy = -s.vy * 0.45;
        s.vx *= 0.7;
        s.vz *= 0.7;
      }

      // Fast diamond tumbling
      s.rotX += s.rotSpeedX * dt;
      s.rotY += s.rotSpeedY * dt;
      s.rotZ += s.rotSpeedZ * dt;

      // Pop and rapid shrink
      let curScale = s.scale;
      if (progress < 0.15) {
        curScale *= progress / 0.15;
      } else {
        curScale *= Math.max(0, (1.0 - progress) / 0.85);
      }

      _v0.set(s.x, s.y, s.z);
      _euler0.set(s.rotX, s.rotY, s.rotZ);
      _q0.setFromEuler(_euler0);
      _scale0.set(curScale, curScale, curScale);

      _m0.compose(_v0, _q0, _scale0);
      this.sparkMesh.setMatrixAt(i, _m0);

      _col0.setRGB(s.r, s.g, s.b);
      this.sparkMesh.setColorAt(i, _col0);
    }

    if (sparksNeedUpdate) {
      this.sparkMesh.instanceMatrix.needsUpdate = true;
      if (this.sparkMesh.instanceColor) {
        this.sparkMesh.instanceColor.needsUpdate = true;
      }
    }

    // ------------------------------------------------------------------------
    // 3. UPDATE CARTOON SPLASH DROPLETS
    // ------------------------------------------------------------------------
    let dropletsNeedUpdate = false;
    for (let i = 0; i < this.maxDroplets; i++) {
      const d = this.dropletPool[i];
      if (!d.active) continue;

      dropletsNeedUpdate = true;

      if (!d.hitFloor) {
        d.age += dt;
        d.vy -= 16.5 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;

        if (d.y <= d.groundY + 0.02) {
          d.y = d.groundY + 0.015;
          d.hitFloor = true;
          d.floorTimer = 0;
        }

        // Airborne: stretch along trajectory vector
        const speedSq = d.vx * d.vx + d.vy * d.vy + d.vz * d.vz;
        const speed = Math.sqrt(speedSq);
        const stretch = 1.0 + Math.min(2.0, speed * 0.12);

        _v0.set(d.x, d.y, d.z);
        if (speed > 0.1) {
          _v1.set(d.vx / speed, d.vy / speed, d.vz / speed);
          _q0.setFromUnitVectors(_v2.set(0, 1, 0), _v1);
        } else {
          _q0.identity();
        }
        _scale0.set(d.baseScale * (1 / Math.sqrt(stretch)), d.baseScale * stretch, d.baseScale * (1 / Math.sqrt(stretch)));
      } else {
        // Splat on ground: flat pancake splash that evaporates
        d.floorTimer += dt;
        const splatDuration = 0.14;
        if (d.floorTimer >= splatDuration) {
          d.active = false;
          _m0.makeScale(0, 0, 0);
          this.dropletMesh.setMatrixAt(i, _m0);
          continue;
        }

        const splatProgress = d.floorTimer / splatDuration;
        const fade = 1.0 - splatProgress;
        const discScale = d.baseScale * (1.6 + splatProgress * 0.8) * fade;

        _v0.set(d.x, d.y, d.z);
        _q0.identity();
        _scale0.set(discScale, d.baseScale * 0.18 * fade, discScale);
      }

      _m0.compose(_v0, _q0, _scale0);
      this.dropletMesh.setMatrixAt(i, _m0);

      _col0.setRGB(d.r, d.g, d.b);
      this.dropletMesh.setColorAt(i, _col0);
    }

    if (dropletsNeedUpdate) {
      this.dropletMesh.instanceMatrix.needsUpdate = true;
      if (this.dropletMesh.instanceColor) {
        this.dropletMesh.instanceColor.needsUpdate = true;
      }
    }

    // ------------------------------------------------------------------------
    // 4. UPDATE SPEED WIND STREAKS (GALAXY / MK8 WARP RIBBONS)
    // ------------------------------------------------------------------------
    // Smooth intensity crossfade
    this.streakIntensity += (this.targetStreakIntensity - this.streakIntensity) * Math.min(1.0, dt * 9.0);
    this.streakMat.opacity = this.streakIntensity * 0.72;

    if (this.streakIntensity > 0.01) {
      const fwdX = Math.sin(this.streakHeading);
      const fwdZ = Math.cos(this.streakHeading);
      const rightX = Math.cos(this.streakHeading);
      const rightZ = -Math.sin(this.streakHeading);

      _v1.set(fwdX, 0, fwdZ); // Forward unit vector
      _q0.setFromUnitVectors(_v2.set(0, 0, 1), _v1); // Orientation aligned with forward

      const relativeSpeed = Math.max(30, this.streakSpeed + 38);

      for (let i = 0; i < this.maxStreaks; i++) {
        const s = this.streakPool[i];

        // Stream backwards relative to the kart
        s.relDist -= relativeSpeed * dt;

        // Wrap around when passing behind camera/kart
        if (s.relDist < -3.5) {
          s.relDist = 8.5 + Math.random() * 6.0;
          s.relAngle = Math.random() * Math.PI * 2;
          s.relRadius = 1.3 + Math.random() * 3.5;
        }

        // Cylindrical coordinates around kart motion axis
        const radialX = Math.cos(s.relAngle) * s.relRadius;
        const radialY = Math.sin(s.relAngle) * s.relRadius * 0.7 + 0.6; // Slight vertical flatten

        const posX = this.streakKartPos.x + fwdX * s.relDist + rightX * radialX;
        const posY = this.streakKartPos.y + radialY;
        const posZ = this.streakKartPos.z + fwdZ * s.relDist + rightZ * radialX;

        _v0.set(posX, posY, posZ);

        // Stretch ribbon with speed
        const lengthFactor = s.lengthScale * (1.0 + Math.min(2.0, this.streakSpeed * 0.05));
        _scale0.set(this.streakIntensity, this.streakIntensity, lengthFactor);

        _m0.compose(_v0, _q0, _scale0);
        this.streakMesh.setMatrixAt(i, _m0);
      }
      this.streakMesh.instanceMatrix.needsUpdate = true;
    } else {
      // Hide all streaks
      for (let i = 0; i < this.maxStreaks; i++) {
        _m0.makeScale(0, 0, 0);
        this.streakMesh.setMatrixAt(i, _m0);
      }
      this.streakMesh.instanceMatrix.needsUpdate = true;
    }

    // ------------------------------------------------------------------------
    // 5. UPDATE IMPACT SHOCKWAVES
    // ------------------------------------------------------------------------
    for (let i = 0; i < this.maxShockwaves; i++) {
      const sw = this.shockwaves[i];
      if (!sw.active) continue;

      sw.age += dt;
      if (sw.age >= sw.duration) {
        sw.active = false;
        sw.mesh.visible = false;
        continue;
      }

      const p = sw.age / sw.duration;
      // Cubic ease out expansion: rapid burst, soft deceleration
      const easeOut = 1.0 - Math.pow(1.0 - p, 3);
      const currentRadius = 0.2 + (sw.maxRadius - 0.2) * easeOut;

      // Smooth fade out
      const opacity = 0.9 * Math.pow(1.0 - p, 1.4);
      sw.mesh.material.opacity = opacity;

      sw.mesh.scale.set(currentRadius, currentRadius, 1);
    }

    // ------------------------------------------------------------------------
    // 6. UPDATE 3D COMIC ONOMATOPOEIAS (HQ Speech Bubbles)
    // ------------------------------------------------------------------------
    this.onomatopoeias.update(dt, camera ?? this.camera);
  }

  // --------------------------------------------------------------------------
  // CLEANUP & DISPOSAL
  // --------------------------------------------------------------------------

  public dispose(): void {
    this.scene.remove(this.onomatopoeias.group);
    this.onomatopoeias.dispose();

    this.scene.remove(this.smokeMesh);
    this.smokeGeo.dispose();
    this.smokeMat.dispose();

    this.scene.remove(this.sparkMesh);
    this.sparkGeo.dispose();
    this.sparkMat.dispose();

    this.scene.remove(this.dropletMesh);
    this.dropletGeo.dispose();
    this.dropletMat.dispose();

    this.scene.remove(this.streakMesh);
    this.streakGeo.dispose();
    this.streakMat.dispose();

    this.scene.remove(this.shockwaveGroup);
    this.shockwaveGeo.dispose();
    for (const sw of this.shockwaves) {
      sw.mesh.material.dispose();
    }
  }
}
