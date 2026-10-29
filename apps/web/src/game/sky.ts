import * as THREE from "three";

export interface SkyOptions {
  /** Posição angular do sol na cena. */
  sunPosition?: THREE.Vector3;
  /** Intensidade da luz do sol (padrão: 2.2). */
  sunIntensity?: number;
  /** Velocidade das nuvens (padrão: 1.0). */
  cloudSpeed?: number;
  /** Densidade da cobertura de nuvens (0.0 a 1.0, padrão: 0.42). */
  cloudCoverage?: number;
  /** Projeção suave de sombras de nuvens no solo (padrão: true). */
  groundCloudShadows?: boolean;
  /** Tamanho do plano de sombra no solo (padrão: 240). */
  groundSize?: number;
  /** Altura do plano de sombra do solo (padrão: 0.035). */
  groundY?: number;
}

export interface DynamicSky {
  dome: THREE.Mesh;
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  shadowPlane?: THREE.Mesh;
  update: (dt: number, cameraPos?: THREE.Vector3) => void;
  dispose: () => void;
}

const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vViewDir;
  varying vec3 vSunDirection;
  uniform vec3 uSunPosition;

  void main() {
    // Como a esfera acompanha a câmera, a posição local é exatamente a direção de visão
    vViewDir = normalize(position);
    vSunDirection = normalize(uSunPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vViewDir;
  varying vec3 vSunDirection;

  uniform float uTime;
  uniform float uCoverage;

  // Hash 2D sem senos (Dave Hoskins, robusto e livre de erros de tipo)
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Ruído suave interpolado
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  // Fractional Brownian Motion (FBM) para nuvens procedurais naturais
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = rot * p * 2.0 + vec2(15.0);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vViewDir);
    float height = dir.y;

    // Gradiente atmosférico contínuo (Rayleigh scattering)
    vec3 zenithColor   = vec3(0.22, 0.52, 0.90); // Azul celeste vivo
    vec3 midSkyColor   = vec3(0.50, 0.72, 0.95); // Transição suave
    vec3 horizonColor  = vec3(0.78, 0.88, 0.98); // Horizonte suave e límpido
    vec3 belowHorizon  = vec3(0.68, 0.74, 0.80); // Transição abaixo do horizonte

    vec3 skyColor;
    if (height > 0.0) {
      float hFactor = clamp(height * 2.0, 0.0, 1.0);
      skyColor = mix(horizonColor, mix(midSkyColor, zenithColor, clamp((height - 0.15) * 1.4, 0.0, 1.0)), hFactor);
    } else {
      skyColor = mix(horizonColor, belowHorizon, clamp(-height * 4.0, 0.0, 1.0));
    }

    // Sol com corona luminosa e disco solar nítido
    vec3 sunDir = normalize(vSunDirection);
    float cosTheta = clamp(dot(dir, sunDir), -1.0, 1.0);
    float sunGlow = pow(max(0.0, cosTheta), 24.0) * 0.45;
    float sunDisk = smoothstep(0.9982, 0.9995, cosTheta) * 1.8;
    vec3 sunColor = vec3(1.0, 0.95, 0.80);
    skyColor += sunColor * (sunGlow + sunDisk);

    // Nuvens procedurais no hemisfério superior
    if (height > 0.03) {
      // Projeção polar estabilizada para a cúpula celeste
      vec2 skyCoord = dir.xz / (height + 0.4);

      // Duas camadas de nuvens com ventos em velocidades diferentes
      vec2 wind1 = vec2(uTime * 0.015, uTime * 0.008);
      vec2 wind2 = vec2(-uTime * 0.010, uTime * 0.018);

      float n1 = fbm(skyCoord * 2.2 + wind1);
      float n2 = fbm(skyCoord * 4.4 + wind2) * 0.45;
      float cloudVal = n1 + n2;

      // Densidade com bordas suaves
      float threshold = 1.0 - clamp(uCoverage, 0.05, 0.95);
      float density = smoothstep(threshold - 0.12, threshold + 0.22, cloudVal);

      // Iluminação e sombreamento das nuvens pelo sol
      float lightFacing = max(0.0, dot(sunDir, vec3(dir.x, height * 1.4, dir.z)));
      vec3 cloudSunLit = vec3(1.0, 1.0, 0.98);   // Topo iluminado pelo sol
      vec3 cloudShadow = vec3(0.68, 0.76, 0.86); // Base sombreada cinza-azulada
      vec3 cloudColor  = mix(cloudShadow, cloudSunLit, clamp(lightFacing * 0.65 + (n1 * 0.35), 0.0, 1.0));

      // Suavização no horizonte para fundir perfeitamente com a névoa
      float horizonFade = smoothstep(0.03, 0.20, height);
      density *= horizonFade;

      skyColor = mix(skyColor, cloudColor, density * 0.92);
    }

    gl_FragColor = vec4(skyColor, 1.0);
  }
`;

const GROUND_SHADOW_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GROUND_SHADOW_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uCoverage;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 3; i++) {
      v += a * noise(p);
      p = rot * p * 2.0 + vec2(20.0);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = (vUv - 0.5) * 6.0;
    vec2 wind = vec2(uTime * 0.015, uTime * 0.008);
    float n = fbm(uv + wind);

    float threshold = 1.0 - clamp(uCoverage, 0.05, 0.95);
    float shadow = smoothstep(threshold, threshold + 0.30, n);

    float alpha = shadow * 0.18;
    gl_FragColor = vec4(0.05, 0.08, 0.15, alpha);
  }
`;

/**
 * Cria a cúpula de céu realista, garantindo que o domo esteja sempre centrado na câmera
 * e dentro do raio de visão para nunca sofrer cortes no horizonte ou ao olhar para cima.
 */
export function createDynamicSky(scene: THREE.Scene, opts: SkyOptions = {}): DynamicSky {
  const sunPos = opts.sunPosition ?? new THREE.Vector3(25, 45, 18);
  const cloudSpeed = opts.cloudSpeed ?? 1.0;
  const cloudCoverage = opts.cloudCoverage ?? 0.42;
  const sunIntensity = opts.sunIntensity ?? 2.2;

  // 1. Cor de Fundo Oficial da Cena: Garante que NUNCA exista fundo preto
  const skyHorizonColor = new THREE.Color("#7da8d8");
  scene.background = skyHorizonColor;

  // 2. Cúpula Celeste (Raio 160m - bem menor que o far plane de 400m da câmera)
  const domeGeo = new THREE.SphereGeometry(160, 40, 28);
  const skyUniforms = {
    uTime: { value: 0 },
    uCoverage: { value: cloudCoverage },
    uSunPosition: { value: sunPos.clone().normalize() },
  };

  const domeMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });

  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = -100;
  scene.add(dome);

  // 3. Luz Solar Direcional com Sombras
  const sunLight = new THREE.DirectionalLight("#fff6e5", sunIntensity);
  sunLight.position.copy(sunPos);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 160;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight);

  // 4. Luz Hemisférica: Iluminação suave do céu e solo
  const hemiLight = new THREE.HemisphereLight("#88b8f2", "#666254", 1.5);
  scene.add(hemiLight);

  // 5. Névoa integrada com o horizonte do céu
  scene.fog = new THREE.Fog("#7da8d8", 60, 140);

  // 6. Projeção de Sombras de Nuvens no Solo
  let shadowPlane: THREE.Mesh | undefined;
  let shadowUniforms: { uTime: { value: number }; uCoverage: { value: number } } | undefined;

  if (opts.groundCloudShadows !== false) {
    const groundSize = opts.groundSize ?? 240;
    const shadowGeo = new THREE.PlaneGeometry(groundSize, groundSize);
    shadowUniforms = {
      uTime: { value: 0 },
      uCoverage: { value: cloudCoverage },
    };
    const shadowMat = new THREE.ShaderMaterial({
      vertexShader: GROUND_SHADOW_VERTEX,
      fragmentShader: GROUND_SHADOW_FRAGMENT,
      uniforms: shadowUniforms,
      transparent: true,
      depthWrite: false,
    });
    shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = opts.groundY ?? 0.035;
    shadowPlane.renderOrder = 2;
    scene.add(shadowPlane);
  }

  let totalTime = 0;

  const update = (dt: number, cameraPos?: THREE.Vector3) => {
    totalTime += dt * cloudSpeed;
    skyUniforms.uTime.value = totalTime;

    if (shadowUniforms) {
      shadowUniforms.uTime.value = totalTime;
    }

    // A cúpula acompanha EXATAMENTE a câmera para que o céu seja infinito e nunca sofra corte
    if (cameraPos) {
      dome.position.copy(cameraPos);
      if (shadowPlane) {
        shadowPlane.position.x = cameraPos.x;
        shadowPlane.position.z = cameraPos.z;
      }
    }
  };

  const dispose = () => {
    scene.remove(dome);
    domeGeo.dispose();
    domeMat.dispose();

    scene.remove(sunLight);
    scene.remove(hemiLight);

    if (shadowPlane) {
      scene.remove(shadowPlane);
      shadowPlane.geometry.dispose();
      (shadowPlane.material as THREE.Material).dispose();
    }
  };

  return {
    dome,
    sunLight,
    hemiLight,
    shadowPlane,
    update,
    dispose,
  };
}
