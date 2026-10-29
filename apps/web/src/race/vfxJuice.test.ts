import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyFresnelRimLight,
  applyFresnelRimToHierarchy,
  DRIFT_COLORS,
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
