import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/** Shader de vinheta cinematográfica, contraste calibrado, saturação vibrante e linhas de velocidade */
export const ColorGradeShader = {
  name: "ColorGradeShader",
  uniforms: {
    tDiffuse: { value: null },
    vignetteIntensity: { value: 0.35 },
    vignetteRoundness: { value: 0.85 },
    contrast: { value: 1.07 },
    saturation: { value: 1.14 },
    speedEffect: { value: 0.0 },
    time: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float vignetteIntensity;
    uniform float vignetteRoundness;
    uniform float contrast;
    uniform float saturation;
    uniform float speedEffect;
    uniform float time;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      vec4 col;

      if (speedEffect > 0.02) {
        // Aberração cromática radial nas bordas durante turbo/vácuo
        vec2 dist = uv - 0.5;
        float r = length(dist);
        float shift = r * r * speedEffect * 0.009;
        float cr = texture2D(tDiffuse, uv - dist * shift).r;
        float cg = texture2D(tDiffuse, uv).g;
        float cb = texture2D(tDiffuse, uv + dist * shift).b;
        col = vec4(cr, cg, cb, 1.0);

        // Linhas de velocidade cinemáticas nas bordas
        if (r > 0.38) {
          float angle = atan(dist.y, dist.x);
          float lines = sin(angle * 64.0 + time * 32.0) * sin(angle * 32.0 - time * 20.0);
          if (lines > 0.55) {
            float lineAlpha = smoothstep(0.38, 0.72, r) * (lines - 0.55) * 2.2 * speedEffect;
            col.rgb += vec3(0.22, 0.28, 0.42) * lineAlpha;
          }
        }
      } else {
        col = texture2D(tDiffuse, uv);
      }

      // 1. Vinheta suave nas bordas da tela
      vec2 coord = (uv - 0.5) * vec2(1.0, 1.0 / vignetteRoundness);
      float rf = length(coord);
      float vig = smoothstep(0.32, 0.82, rf);
      col.rgb *= (1.0 - vignetteIntensity * vig);

      // 2. Contraste equilibrado
      col.rgb = (col.rgb - 0.5) * contrast + 0.5;

      // 3. Saturação para dar estética alegre estilo Pixar/Mario Kart
      float luma = dot(col.rgb, vec3(0.299, 0.587, 0.114));
      col.rgb = mix(vec3(luma), col.rgb, saturation);

      gl_FragColor = vec4(clamp(col.rgb, 0.0, 1.0), 1.0);
    }
  `,
};

export interface PostProcessingPipeline {
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
  colorGradePass: ShaderPass;
  setSize(w: number, h: number): void;
  setSpeedFx(target: number, dt: number): void;
  render(): void;
  dispose(): void;
}

/** Gera Environment Map de estúdio PBR para dar reflexos reais a todos os materiais da cena */
export function createEnvironmentMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const roomEnv = new RoomEnvironment();
  const envTex = pmrem.fromScene(roomEnv, 0.04).texture;
  roomEnv.dispose();
  pmrem.dispose();
  return envTex;
}

export function createPostProcessingPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): PostProcessingPipeline {
  const composer = new EffectComposer(renderer);
  composer.setSize(width, height);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Bloom seletivo apenas para faíscas neon, labaredas de boost e luzes do teto (threshold HDR)
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.32, // força suave do brilho
    0.28, // raio de espalhamento
    1.25, // limiar alto para não queimar superfícies brancas iluminadas
  );
  composer.addPass(bloomPass);

  // Converte HDR para espaço sRGB com ACES Filmic Tone Mapping do renderer
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // Color grade final no espaço sRGB calibrado
  const colorGradePass = new ShaderPass(ColorGradeShader);
  composer.addPass(colorGradePass);

  let currentSpeedFx = 0;

  return {
    composer,
    bloomPass,
    colorGradePass,
    setSize(w: number, h: number) {
      composer.setSize(w, h);
      bloomPass.resolution.set(w, h);
    },
    setSpeedFx(target: number, dt: number) {
      currentSpeedFx += (target - currentSpeedFx) * Math.min(1, dt * 7.5);
      colorGradePass.uniforms.speedEffect.value = currentSpeedFx;
      colorGradePass.uniforms.time.value += dt;
    },
    render() {
      composer.render();
    },
    dispose() {
      bloomPass.dispose();
      renderPass.dispose();
      colorGradePass.dispose();
      outputPass.dispose();
    },
  };
}
