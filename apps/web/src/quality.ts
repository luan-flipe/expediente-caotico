import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Quality } from "./settings";

const envCache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

/**
 * Configura iluminação baseada em imagem (IBL) procedural usando RoomEnvironment + PMREMGenerator.
 * Permite que materiais PBR (porcelanato polido, madeira envernizada, vidro, inox e metais)
 * apresentem reflexos especulares realistas sem precisar baixar arquivos HDR externos.
 */
export function setupSceneEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  intensity = 0.5,
): void {
  try {
    let envMap = envCache.get(renderer);
    if (!envMap) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const roomEnv = new RoomEnvironment();
      envMap = pmrem.fromScene(roomEnv, 0.04).texture;
      roomEnv.dispose();
      pmrem.dispose();
      envCache.set(renderer, envMap);
    }
    scene.environment = envMap;
    scene.environmentIntensity = intensity;
  } catch {
    // Fallback seguro caso o contexto WebGL seja mockado em testes
  }
}

/** Leve: resolução 1x (sem contar a densidade da tela). Alta: até 2x, como sempre foi. */
export function pixelRatioFor(q: Quality): number {
  return q === "leve" ? 1 : Math.min(devicePixelRatio, 2);
}

/**
 * Aplica a qualidade gráfica ao vivo: sombras (renderizador e luz do sol), IBL e resolução.
 * Trocar o estado das sombras exige recompilar os shaders, por isso os materiais da cena são marcados.
 */
export function applyQuality(renderer: THREE.WebGLRenderer, scene: THREE.Scene, sun: THREE.DirectionalLight, q: Quality): void {
  const shadows = q !== "leve";
  renderer.setPixelRatio(pixelRatioFor(q));
  renderer.shadowMap.enabled = shadows;
  sun.castShadow = shadows;
  if (!scene.environment) {
    setupSceneEnvironment(renderer, scene, 0.45);
  }
  scene.environmentIntensity = shadows ? 0.48 : 0.25;
  scene.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) m.needsUpdate = true;
  });
}
