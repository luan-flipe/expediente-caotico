import * as THREE from "three";

export interface SkyOptions {
  /** Posição angular do sol na cena (vetor normalizado ou direção). */
  sunPosition?: THREE.Vector3;
  /** Intensidade da luz do sol (padrão: 2.2). */
  sunIntensity?: number;
  /** Velocidade das nuvens (padrão: 1.0). */
  cloudSpeed?: number;
  /** Densidade da cobertura de nuvens (0.0 = limpo, 1.0 = encoberto, padrão: 0.45). */
  cloudCoverage?: number;
  /** Adicionar projeção sutil de sombras de nuvens no solo (padrão: true). */
  groundCloudShadows?: boolean;
  /** Tamanho do plano de sombra no solo (padrão: 260). */
  groundSize?: number;
  /** Altura do plano de sombra do solo (padrão: 0.04). */
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
  varying vec3 vWorldPosition;
  varying vec3 vSunDirection;
  uniform vec3 uSunPosition;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vSunDirection = normalize(uSunPosition);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vWorldPosition;
  varying vec3 vSunDirection;

  uniform float uTime;
  uniform float uCoverage;
  uniform vec3 uSunPosition;

  // Ruído procedural 2D rápido para o FBM de nuvens
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
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

  // Fractional Brownian Motion (3 oitavas para excelente performance a 60fps)
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = rot * p * 2.0 + vec2(100.0);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vWorldPosition);
    float height = dir.y;

    // Cores do céu atmosférico com Rayleigh scattering simulado
    vec3 zenithColor = vec3(0.18, 0.48, 0.86);   // Azul celeste vivo
    vec3 midSkyColor = vec3(0.48, 0.70, 0.94);   // Transição suave
    vec3 horizonColor = vec3(0.76, 0.86, 0.96);  // Horizonte límpido com névoa
    vec3 sunGlowColor = vec3(1.0, 0.92, 0.75);   // Brilho quente do sol
    vec3 belowHorizon = vec3(0.62, 0.68, 0.74);  // Suave abaixo do horizonte

    // Gradiente vertical do céu
    vec3 skyColor;
    if (height > 0.0) {
      float hFactor = clamp(height * 2.2, 0.0, 1.0);
      skyColor = mix(horizonColor, mix(midSkyColor, zenithColor, clamp((height - 0.2) * 1.5, 0.0, 1.0)), hFactor);
    } else {
      skyColor = mix(horizonColor, belowHorizon, clamp(-height * 3.0, 0.0, 1.0));
    }

    // Cálculo do Sol e Corona solar (Mie Scattering)
    vec3 sunDir = normalize(vSunDirection);
    float cosTheta = dot(dir, sunDir);
    float sunGlow = pow(max(0.0, cosTheta), 32.0) * 0.45;
    float sunDisk = smoothstep(0.9982, 0.9994, cosTheta) * 2.0;

    skyColor += sunGlowColor * (sunGlow + sunDisk);

    // Mapeamento hemisférico de nuvens (só acima do horizonte)
    if (height > 0.02) {
      // Projeção polar/planar para nuvens no topo da abóbada
      vec2 skyCoord = dir.xz / (height + 0.35);

      // Duas camadas com direções e velocidades de vento diferentes
      vec2 wind1 = vec2(uTime * 0.012, uTime * 0.007);
      vec2 wind2 = vec2(-uTime * 0.008, uTime * 0.015);

      float n1 = fbm(skyCoord * 1.8 + wind1);
      float n2 = fbm(skyCoord * 3.6 + wind2) * 0.5;
      float cloudVal = n1 + n2 * 0.5;

      // Controle de cobertura e densidade
      float threshold = 1.0 - uCoverage;
      float density = smoothstep(threshold - 0.15, threshold + 0.25, cloudVal);

      // Auto-sombreamento realista da nuvem (luz do sol versus face sombreada)
      float lightFacing = max(0.0, dot(sunDir, vec3(dir.x, height * 1.5, dir.z)));
      vec3 cloudSunLit = vec3(1.0, 0.98, 0.94);     // Topo iluminado
      vec3 cloudShadow = vec3(0.55, 0.63, 0.73);    // Base sombreada cinza-azulada
      vec3 cloudColor = mix(cloudShadow, cloudSunLit, clamp(lightFacing * 0.7 + (n1 * 0.4), 0.0, 1.0));

      // Atenuação suave na linha do horizonte para transição natural
      float horizonFade = smoothstep(0.02, 0.22, height);
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
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const GROUND_SHADOW_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uCoverage;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
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
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 3; i++) {
      v += a * noise(p);
      p = rot * p * 2.0 + vec2(40.0);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // Escala de coordenadas do solo com vento correspondente ao céu
    vec2 uv = (vUv - 0.5) * 8.0;
    vec2 wind = vec2(uTime * 0.012, uTime * 0.007);
    float n = fbm(uv + wind);

    float threshold = 1.0 - uCoverage;
    float shadow = smoothstep(threshold, threshold + 0.35, n);

    // Sombra suave translúcida que escurece o piso sob as nuvens
    float alpha = shadow * 0.22;
    gl_FragColor = vec4(0.05, 0.08, 0.14, alpha);
  }
`;

/**
 * Cria e configura uma cúpula de céu dinâmico realista com nuvens em movimento,
 * sol com corona e sombras suaves integradas na cena Three.js.
 */
export function createDynamicSky(scene: THREE.Scene, opts: SkyOptions = {}): DynamicSky {
  const sunPos = opts.sunPosition ?? new THREE.Vector3(25, 45, 18);
  const cloudSpeed = opts.cloudSpeed ?? 1.0;
  const cloudCoverage = opts.cloudCoverage ?? 0.46;
  const sunIntensity = opts.sunIntensity ?? 2.3;

  // 1. Cúpula Celeste (Skydome) com ShaderMaterial
  const domeGeo = new THREE.SphereGeometry(320, 32, 24);
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
  });

  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = -100;
  scene.add(dome);

  // 2. Luz Solar Direcional com Sombras Otimizadas
  const sunLight = new THREE.DirectionalLight("#fff5e0", sunIntensity);
  sunLight.position.copy(sunPos);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 160;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight);

  // 3. Luz Hemisférica: Céu azul celeste em cima, tom de solo quente em baixo
  const hemiLight = new THREE.HemisphereLight("#88baf5", "#6c6656", 1.55);
  scene.add(hemiLight);

  // 4. Configuração de Névoa integrada com o horizonte do céu
  scene.fog = new THREE.Fog("#8eb5dc", 50, 130);

  // 5. Projeção de Sombras de Nuvens no Solo
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
    shadowPlane.position.y = opts.groundY ?? 0.04;
    shadowPlane.renderOrder = 1;
    scene.add(shadowPlane);
  }

  let totalTime = 0;

  const update = (dt: number, cameraPos?: THREE.Vector3) => {
    totalTime += dt * cloudSpeed;
    skyUniforms.uTime.value = totalTime;

    if (shadowUniforms) {
      shadowUniforms.uTime.value = totalTime;
    }

    // A cúpula do céu acompanha a câmera para que o horizonte permaneça infinito
    if (cameraPos) {
      dome.position.set(cameraPos.x, cameraPos.y * 0.4, cameraPos.z);
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
