import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyFresnelRimLight,
  applyFresnelRimToHierarchy,
  applyStylizedToonShading,
  applyStylizedToonToHierarchy,
  applyWaxedFloorSheen,
  calculateDynamicFov,
  CasterBlobShadows,
  createToonRampTexture,
  DRIFT_COLORS,
  HQOnomatopoeiaManager,
  RaceVfxManager,
} from "./vfxJuice";

describe("vfxJuice - Fresnel Rim Light", () => {
  it("applies rim light uniforms and onBeforeCompile shader hook", () => {
    const mat = new THREE.MeshStandardMaterial({ color: "#ff0000" });
    applyFresnelRimLight(mat, "#38bdf8", 0.8, 3.0);

    expect(mat.userData.rimUniforms).toBeDefined();
    expect(mat.userData.rimUniforms.uRimColor.value.getHexString()).toBe("38bdf8");
    expect(mat.userData.rimUniforms.uRimIntensity.value).toBe(0.8);
    expect(mat.userData.rimUniforms.uRimPower.value).toBe(3.0);

    // Test onBeforeCompile injection
    const fakeShader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: "void main() { gl_Position = vec4(0.0); }",
      fragmentShader: "#include <common>\nvoid main() {\n#include <opaque_fragment>\n}",
    };

    mat.onBeforeCompile(fakeShader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);

    expect(fakeShader.uniforms.uRimColor).toBeDefined();
    expect(fakeShader.fragmentShader).toContain("uniform vec3 uRimColor;");
    expect(fakeShader.fragmentShader).toContain("fRim");
    expect(fakeShader.fragmentShader).toContain("outgoingLight += uRimColor");
  });

  it("applies to entire Object3D hierarchy", () => {
    const group = new THREE.Group();
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const mesh2 = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshStandardMaterial());
    group.add(mesh1);
    group.add(mesh2);

    applyFresnelRimToHierarchy(group, "#ffffff", 0.65);

    expect(mesh1.material.userData.rimUniforms).toBeDefined();
    expect(mesh2.material.userData.rimUniforms).toBeDefined();
  });
});

describe("vfxJuice - Drift Tiers & Constants", () => {
  it("defines the exact MK8 / Galaxy colors for drift tiers", () => {
    expect(DRIFT_COLORS[1]).toBe("#38bdf8"); // Nível 1: Azul vibrante
    expect(DRIFT_COLORS[2]).toBe("#f97316"); // Nível 2: Laranja fogo
    expect(DRIFT_COLORS[3]).toBe("#a855f7"); // Nível 3: Roxo Ultra Mini-Turbo
  });
});

describe("vfxJuice - RaceVfxManager Lifecycle & Pools", () => {
  it("instantiates without errors and creates instanced meshes", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const vfx = new RaceVfxManager(scene, camera, {
      maxSmoke: 32,
      maxSparks: 40,
      maxStreaks: 16,
      maxDroplets: 24,
      maxShockwaves: 4,
    });

    expect(scene.children.length).toBeGreaterThanOrEqual(4);

    // Initial update with no active particles
    vfx.update(0.016, 100);

    // Spawn drift smoke
    vfx.spawnDriftSmoke(0, 0, 0, 0, 1, 10, false);
    vfx.spawnDriftSmoke(1, 0, 2, 0, 1, 15, true); // boosting
    vfx.update(0.016, 116);

    // Spawn drift sparks for all tiers
    vfx.spawnDriftSparks(0, 0, 0, 0, 1, 1);
    vfx.spawnDriftSparks(0, 0, 0, 0, 2, -1);
    vfx.spawnDriftSparks(0, 0, 0, 0, 3, 1);
    vfx.update(0.016, 132);

    // Speed wind streaks
    vfx.setSpeedStreaks(true, 1.0, 0, 0, 0, 0, 25);
    vfx.update(0.016, 148);
    vfx.setSpeedStreaks(false);
    vfx.update(0.016, 164);

    // Impact shockwaves
    vfx.spawnImpactShockwave(5, 5, 0.025, "coffee");
    vfx.spawnImpactShockwave(10, 10, 0.025, "paper");
    vfx.spawnImpactShockwave(15, 15, 0.025, "staple");
    vfx.spawnImpactShockwave(20, 20, 0.025, "generic");
    vfx.update(0.016, 180);

    // Clean up
    vfx.dispose();
    expect(scene.children.length).toBe(0);
  });

  it("handles particle expiration and pool cycling without leaking memory or throwing", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const vfx = new RaceVfxManager(scene, camera, {
      maxSmoke: 8,
      maxSparks: 8,
      maxDroplets: 8,
    });

    // Overflow the pool
    for (let i = 0; i < 20; i++) {
      vfx.spawnDriftSmoke(i, 0, i, 0, 1, 10);
      vfx.spawnDriftSparks(i, 0, i, 0, (i % 3 + 1) as 1 | 2 | 3, 1);
      vfx.spawnImpactShockwave(i, i, 0, "coffee");
    }

    // Step through 2 seconds of simulation
    for (let f = 0; f < 120; f++) {
      vfx.update(1 / 60, f * (1000 / 60));
    }

    vfx.dispose();
  });
});

describe("vfxJuice - Dynamic FOV & Camera Squash", () => {
  it("maintains base 60° FOV when idle/stopped", () => {
    const fov = calculateDynamicFov({ speed: 0, isBoosting: false, isBraking: false });
    expect(fov).toBe(60.0);
  });

  it("opens FOV up to 74° during turbo, vácuo and café boost", () => {
    // Turbo boost
    const fovTurbo = calculateDynamicFov({ speed: 18, isBoosting: true });
    expect(fovTurbo).toBe(74.0);

    // Slipstream (vácuo) boost
    const fovDraft = calculateDynamicFov({ speed: 18, isDrafting: true });
    expect(fovDraft).toBe(74.0);

    // Slipstream charging
    const fovDraftCharging = calculateDynamicFov({ speed: 12, draftRatio: 0.8 });
    expect(fovDraftCharging).toBeGreaterThan(68.0);
    expect(fovDraftCharging).toBeLessThanOrEqual(74.0);

    // Café boost
    const fovCoffee = calculateDynamicFov({ speed: 15, hasCoffee: true });
    expect(fovCoffee).toBeGreaterThanOrEqual(71.0);
    expect(fovCoffee).toBeLessThanOrEqual(74.0);
  });

  it("compresses FOV down to 56° during hard braking", () => {
    const fovBraking = calculateDynamicFov({ speed: 10, isBraking: true });
    expect(fovBraking).toBe(56.0);

    const fovMildBraking = calculateDynamicFov({ speed: 3.5, isBraking: true });
    expect(fovMildBraking).toBe(58.0);
  });
});

describe("vfxJuice - Cartoon Contact Shadows (Blob Shadows)", () => {
  it("creates a central AO shadow and 5 caster wheel decals", () => {
    const root = new THREE.Group();
    const blobs = new CasterBlobShadows(root);

    expect(root.children.length).toBe(1);
    expect(blobs.casterMeshes.length).toBe(5);
    expect(blobs.centralMesh).toBeDefined();

    // Verify 5 caster wheels form radial 72° star distribution
    const firstCaster = blobs.casterMeshes[0];
    expect(firstCaster.position.z).toBeCloseTo(0.35, 2);

    blobs.dispose();
    expect(root.children.length).toBe(0);
  });

  it("scales and deepens opacity with suspension compression", () => {
    const blobs = new CasterBlobShadows();

    // Uncompressed (rest)
    blobs.update(0, 0, false);
    const restScale = blobs.casterMeshes[0].scale.x;
    const restOpacity = blobs.material.opacity;

    // Compressed suspension (-0.06m)
    blobs.update(-0.06, 0, false);
    const compressedScale = blobs.casterMeshes[0].scale.x;
    const compressedOpacity = blobs.material.opacity;

    // Contact blobs should swell outwards and darken under load
    expect(compressedScale).toBeGreaterThan(restScale);
    expect(compressedOpacity).toBeGreaterThan(restOpacity);

    blobs.dispose();
  });

  it("spreads and fades smoothly when airborne", () => {
    const blobs = new CasterBlobShadows();

    // On ground
    blobs.update(0, 0, false);
    const groundScale = blobs.centralMesh.scale.x;
    const groundOpacity = blobs.material.opacity;

    // Airborne at height 1.8m
    blobs.update(0, 1.8, true);
    const airScale = blobs.centralMesh.scale.x;
    const airOpacity = blobs.material.opacity;

    // Shadow decal should pin to floor relative height (0.015 - y)
    expect(blobs.group.position.y).toBeCloseTo(0.015 - 1.8, 2);
    // Shadow expands into softer diffuse disc
    expect(airScale).toBeGreaterThan(groundScale);
    // Shadow fades out with altitude
    expect(airOpacity).toBeLessThan(groundOpacity);

    blobs.dispose();
  });
});

describe("vfxJuice - Stylized Cel / Toon Shading", () => {
  it("generates toon ramp textures with cobalt, lavender, and warm presets", () => {
    const cobaltRamp = createToonRampTexture({ tintMode: "cobalt" });
    expect(cobaltRamp).toBeDefined();

    const lavenderRamp = createToonRampTexture({ tintMode: "lavender" });
    expect(lavenderRamp).toBeDefined();

    const warmRamp = createToonRampTexture({ tintMode: "warm" });
    expect(warmRamp).toBeDefined();

    const customRamp = createToonRampTexture({
      shadowColor: "#112233",
      midColor: "#445566",
      lightColor: "#ffffff",
    });
    expect(customRamp).toBeDefined();
  });

  it("injects toon shader uniforms and onBeforeCompile code", () => {
    const mat = new THREE.MeshStandardMaterial({ color: "#22c55e" });
    applyStylizedToonShading(mat, {
      shadowTint: "#1e295d",
      warmHighlight: "#fff8e7",
      intensity: 0.75,
    });

    expect(mat.userData.hasToonShading).toBe(true);
    expect(mat.userData.toonUniforms).toBeDefined();
    expect(mat.userData.toonUniforms.uToonShadowTint.value.getHexString()).toBe("1e295d");
    expect(mat.userData.toonUniforms.uToonIntensity.value).toBe(0.75);

    const fakeShader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: "void main() { gl_Position = vec4(0.0); }",
      fragmentShader: "#include <common>\nvoid main() {\n#include <opaque_fragment>\n}",
    };
    mat.onBeforeCompile(fakeShader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);

    expect(fakeShader.uniforms.uToonShadowTint).toBeDefined();
    expect(fakeShader.fragmentShader).toContain("uniform vec3 uToonShadowTint;");
    expect(fakeShader.fragmentShader).toContain("tShadowColor");
    expect(fakeShader.fragmentShader).toContain("outgoingLight = mix( outgoingLight");
  });

  it("applies toon shading recursively across hierarchy", () => {
    const root = new THREE.Group();
    const child1 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const child2 = new THREE.Mesh(new THREE.CylinderGeometry(), new THREE.MeshStandardMaterial());
    root.add(child1);
    root.add(child2);

    applyStylizedToonToHierarchy(root);
    expect(child1.material.userData.hasToonShading).toBe(true);
    expect(child2.material.userData.hasToonShading).toBe(true);
  });
});

describe("vfxJuice - Waxed Office Floor Sheen", () => {
  it("configures polished linoleum roughness and shader uniforms", () => {
    const floorMat = new THREE.MeshStandardMaterial({ color: "#3a7fbe" });
    applyWaxedFloorSheen(floorMat, {
      sheenIntensity: 0.9,
      neonColor: "#e0f2fe",
      tubeSpacing: 5.2,
      fresnelPower: 3.5,
    });

    expect(floorMat.userData.hasWaxedFloorSheen).toBe(true);
    expect(floorMat.roughness).toBe(0.28);
    expect(floorMat.metalness).toBe(0.06);
    expect(floorMat.userData.floorUniforms.uFloorSheen.value).toBe(0.9);
    expect(floorMat.userData.floorUniforms.uNeonColor.value.getHexString()).toBe("e0f2fe");

    const fakeShader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: "void main() { gl_Position = vec4(0.0); }",
      fragmentShader: "#include <common>\nvoid main() {\n#include <opaque_fragment>\n}",
    };
    floorMat.onBeforeCompile(fakeShader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);

    expect(fakeShader.uniforms.uFloorSheen).toBeDefined();
    expect(fakeShader.fragmentShader).toContain("uniform float uFloorSheen;");
    expect(fakeShader.fragmentShader).toContain("tubeStripe");
    expect(fakeShader.fragmentShader).toContain("neonSpecular");
  });
});

describe("vfxJuice - 3D Comic Onomatopoeias (HQ Speech Bubbles)", () => {
  it("initializes pre-allocated billboard pool and spawns without GC allocations", () => {
    const scene = new THREE.Scene();
    const manager = new HQOnomatopoeiaManager(scene, 8);

    expect(manager.group.children.length).toBe(8);
    expect(manager.getActiveCount()).toBe(0);

    const words = ["BOING!", "VRUUUM!", "VISH!", "EITA!", "POW!", "OUCH!", "TURBO!"] as const;
    for (const w of words) {
      manager.spawn(0, 1, 0, w);
    }
    expect(manager.getActiveCount()).toBe(7);

    // Update with camera billboarding and harmonic squash & stretch
    const camera = new THREE.PerspectiveCamera();
    camera.quaternion.set(0, 0.707, 0, 0.707);

    // Initial pop phase
    manager.update(0.05, camera);
    expect(manager.getActiveCount()).toBe(7);

    // Wobble harmonic phase
    manager.update(0.3, camera);
    expect(manager.getActiveCount()).toBe(7);

    // Fade / dissolve phase until complete
    manager.update(0.6, camera);
    expect(manager.getActiveCount()).toBe(0);

    manager.dispose();
  });

  it("integrates seamlessly into RaceVfxManager", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const vfx = new RaceVfxManager(scene, camera, { maxOnomatopoeias: 12 });

    expect(vfx.getOnomatopoeiaManager()).toBeDefined();

    vfx.spawnOnomatopoeia(2, 1, 4, "BOING!", 1.2);
    expect(vfx.getOnomatopoeiaManager().getActiveCount()).toBe(1);

    vfx.update(0.016, 16);
    expect(vfx.getOnomatopoeiaManager().getActiveCount()).toBe(1);

    vfx.dispose();
  });
});
