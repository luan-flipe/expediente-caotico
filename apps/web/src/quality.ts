import * as THREE from "three";
import type { Quality } from "./settings";

/** Leve: resolução 1x (sem contar a densidade da tela). Alta: até 2x, como sempre foi. */
export function pixelRatioFor(q: Quality): number {
  return q === "leve" ? 1 : Math.min(devicePixelRatio, 2);
}

/**
 * Aplica a qualidade gráfica ao vivo: sombras (renderizador e luz do sol) e resolução.
 * Trocar o estado das sombras exige recompilar os shaders, por isso os materiais da cena são marcados.
 */
export function applyQuality(renderer: THREE.WebGLRenderer, scene: THREE.Scene, sun: THREE.DirectionalLight, q: Quality): void {
  const shadows = q !== "leve";
  renderer.setPixelRatio(pixelRatioFor(q));
  renderer.shadowMap.enabled = shadows;
  sun.castShadow = shadows;
  scene.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) m.needsUpdate = true;
  });
}
