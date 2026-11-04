import * as THREE from "three";
import { corkscrewRoll, heightAt, pointAt, sideNormal, type Track } from "@ec/shared";
import { createDesertGround, MH, MW, natural } from "./desertHeightmap";
import desertoJpgUrl from "../assets/itens/deserto.jpg";
import arquibancadaGlbUrl from "../assets/itens/arquibancada.glb?url";
import { createGltfLoader } from "../game/gltfLoader";

/**
 * Construtor oficial e estritamente detalhado da Pista do Deserto.
 * Portado 1:1 de assets-src/pistas/3-pista-deserto/index.html:
 * - Terreno de alta resolução 560x420 com deserto.jpg e mapeamento UV exato
 * - Pista de 17m (4 faixas) com acostamentos de terra, zebras vermelhas/creme e asfalto com linhas neon
 * - Pulso aditivo de energia percorrendo as faixas
 * - Muretas de concreto com listras alternadas vermelhas e cinzas que acompanham o giro 360° do saca-rolhas
 * - Túnel cilíndrico interno (TR=14, TAX=9.4), anéis de néon âmbar, 3 luzes pontuais e portais com sinalização de perigo
 * - Maciço rochoso monumental modelado e texturizado sobre o túnel
 * - Cânion do salto com rampas, muretas zebradas e poço de lama borbulhante com bolhas procedurais
 * - Pórtico de Largada com quadriculado e faixa "LARGADA"
 * - Vilarejos de adobe com vigas de madeira, janelas azul-turquesa, varandas e vasos de barro
 * - Caveiras de boi com chifres longos na areia e em postes
 * - Vegetação oficial instanciada (saguaros de 2 e 3 braços, cactos-bola com flores, palmas e capim dourado)
 * - Pedras e arbustos secos para conferir escala natural
 * - Dinâmicas vivas: redemoinhos de areia (dust devils), urubus planando e placas de impulso com faíscas
 */

const mat = (c: number, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.9 }, o));


function makeCanvas(w: number, h: number): HTMLCanvasElement {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  const baseProps: Record<string, any> = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textAlign: "",
    textBaseline: "",
    shadowColor: "",
    shadowBlur: 0,
    measureText: () => ({ width: 50 }),
    createImageData: () => ({ data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => null,
  };
  const dummyCtx = new Proxy(baseProps, {
    get(target, prop) {
      if (typeof prop === "string" && prop in target) return target[prop];
      return () => {};
    },
    set(target, prop, value) {
      if (typeof prop === "string") target[prop] = value;
      return true;
    },
  });
  return {
    width: w,
    height: h,
    getContext: () => dummyCtx,
  } as unknown as HTMLCanvasElement;
}

let cachedDesertTex: THREE.Texture | null = null;
export function getDesertTexture(): THREE.Texture {
  if (cachedDesertTex) return cachedDesertTex;
  if (typeof document === "undefined") {
    const data = new Uint8Array([215, 175, 125, 255]);
    cachedDesertTex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    return cachedDesertTex;
  }
  const loader = new THREE.TextureLoader();
  cachedDesertTex = loader.load(desertoJpgUrl);
  cachedDesertTex.colorSpace = THREE.SRGBColorSpace;
  cachedDesertTex.wrapS = cachedDesertTex.wrapT = THREE.ClampToEdgeWrapping;
  cachedDesertTex.anisotropy = 8;
  return cachedDesertTex;
}

/** Céu quente do deserto com sol baixo, névoa e gradiente de cor fiel a index.html */
export function buildDesertSky(scene: THREE.Scene, sunPos: THREE.Vector3): THREE.Mesh {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { s: { value: sunPos.clone().normalize() } },
    vertexShader: `varying vec3 d;void main(){d=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 s;varying vec3 d;void main(){vec3 hz=vec3(.91,.81,.66),mid=vec3(.62,.75,.86),top=vec3(.32,.52,.78);
      float y=d.y;vec3 c=mix(hz,mid,smoothstep(-.02,.25,y));c=mix(c,top,smoothstep(.2,.9,y));float k=max(dot(normalize(d),normalize(s)),0.);
      c+=vec3(1.,.8,.55)*(pow(k,8.)*.25+pow(k,200.)*1.2);gl_FragColor=vec4(pow(c,vec3(2.2)),1.);gl_FragColor=linearToOutputTexel(gl_FragColor);}`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 32, 16), m);
  sky.renderOrder = -1;
  scene.add(sky);
  return sky;
}

/** Terreno em alta resolução 560x420 cobrindo 1900x1416m mapeado perfeitamente com deserto.jpg */
export function buildDesertTerrain(track: Track, desertoTex: THREE.Texture): THREE.Mesh {
  const { ground } = createDesertGround(track);
  const tg = new THREE.PlaneGeometry(MW * 1.9, MH * 1.9, 560, 420);
  tg.rotateX(-Math.PI / 2);
  const P = tg.attributes.position;
  const UV = tg.attributes.uv;

  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i);
    const z = P.getZ(i);
    P.setY(i, ground(x, z));
    UV.setXY(i, x / MW + 0.5, 1 - (z / MH + 0.5));
  }
  tg.computeVertexNormals();

  const terrain = new THREE.Mesh(
    tg,
    new THREE.MeshStandardMaterial({
      map: desertoTex,
      roughness: 1.0,
    })
  );
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  return terrain;
}

// Uniforms e estado global para loops de animação
export const desertAnimationState = {
  pulseU: { uT: { value: 0 } },
  mudUpdate: null as ((dt: number, now: number) => void) | null,
  devilUpdate: null as ((dt: number, now: number) => void) | null,
  birdsUpdate: null as ((dt: number, now: number, carProgress: number, speed: number) => void) | null,
  padsUpdate: null as ((dt: number, now: number) => void) | null,
  sparksUpdate: null as ((dt: number) => void) | null,
};

/** Pista oficial de 17m com acostamentos, zebras, asfalto neon e muretas listradas vermelho/cinza */
export function buildDesertRoadMesh(track: Track, textures: THREE.Texture[]): THREE.Group {
  const group = new THREE.Group();
  const pts = track.points;
  const N = pts.length;
  const ROAD = 17;
  const KERB = 1.1;
  const WALL_H = 1.1;
  const WALL_W = 0.6;
  const TR = 14;
  const TAX = 9.4;
  const WMAX = 10.25;
  const H = ROAD / 2;

  const { inTunnel } = createDesertGround(track);

  // Tangentes uniformes da pista
  const tan: THREE.Vector2[] = [];
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N];
    const b = pts[(i + 1) % N];
    tan.push(new THREE.Vector2(b.x - a.x, b.z - a.z).normalize());
  }

  const gap = track.ramps.find((r) => r.path === -1 && r.gap)?.gap;
  const gapQ = (k: number) => {
    if (!gap) return false;
    const s = track.cum[k];
    return s >= gap.sFrom && s <= gap.sTo;
  };

  // Posição no espaço aplicando giro do saca-rolhas (phi) e altura
  function xs(k: number, off: number, y: number, out?: THREE.Vector3): THREE.Vector3 {
    const p = pts[k];
    const t = tan[k];
    const nx = -t.y;
    const nz = t.x;
    const s = track.cum[k];
    if (inTunnel(s, 1)) {
      off = Math.max(-WMAX, Math.min(WMAX, off));
      y = Math.max(y, 0);
    }
    const ph = corkscrewRoll(track, s);
    if (ph !== 0) {
      const c = Math.cos(ph);
      const sn = Math.sin(ph);
      const v = y - TAX;
      const L = off * c - v * sn;
      y = off * sn + v * c + TAX;
      off = L;
    }
    const res = out || new THREE.Vector3();
    const baseY = track.heights?.[k] ?? heightAt(track, s);
    return res.set(p.x + nx * off, baseY + y, p.z + nz * off);
  }

  function strip(
    offA: number,
    offB: number,
    yA: number,
    yB: number,
    vScale: number,
    material: THREE.Material,
    lift = 0
  ): THREE.Mesh {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let dist = 0;
    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    for (let i = 0; i <= N; i++) {
      const k = i % N;
      if (i > 0) dist += Math.hypot(pts[k].x - pts[(k - 1 + N) % N].x, pts[k].z - pts[(k - 1 + N) % N].z);
      xs(k, offA, yA + lift, va);
      xs(k, offB, yB + lift, vb);
      pos.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
      uv.push(0, dist / vScale, 1, dist / vScale);
      if (i < N && !gapQ(k)) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    group.add(m);
    return m;
  }

  // Texturas de asfalto com grão e linhas de neon (rosa, ciano, violeta, amarelo)
  const ac = makeCanvas(256, 512);
  const a = ac.getContext("2d")!;
  a.fillStyle = "#4a4a4c";
  a.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 9000; i++) {
    const gr = (60 + Math.random() * 40) | 0;
    a.fillStyle = `rgb(${gr},${gr},${gr + 2})`;
    a.fillRect(Math.random() * 256, Math.random() * 512, 1.5, 1.5);
  }

  const nLines = (g: CanvasRenderingContext2D) => {
    g.fillStyle = "#ff3fa4";
    g.fillRect(4, 0, 8, 512);
    g.fillStyle = "#2ef2ff";
    g.fillRect(244, 0, 8, 512);
    for (const [lx, lc] of [
      [61, "#b35cff"],
      [124, "#ffe14d"],
      [187, "#b35cff"],
    ] as const) {
      g.fillStyle = lc;
      g.fillRect(lx, 40, 8, 190);
      g.fillRect(lx, 296, 8, 190);
    }
  };
  nLines(a);

  const ec = makeCanvas(256, 512);
  const eg = ec.getContext("2d")!;
  eg.fillStyle = "#000000";
  eg.fillRect(0, 0, 256, 512);
  nLines(eg);

  const atEm = new THREE.CanvasTexture(ec);
  atEm.wrapS = atEm.wrapT = THREE.RepeatWrapping;
  atEm.colorSpace = THREE.SRGBColorSpace;
  textures.push(atEm);

  const at = new THREE.CanvasTexture(ac);
  at.wrapS = at.wrapT = THREE.RepeatWrapping;
  at.colorSpace = THREE.SRGBColorSpace;
  at.anisotropy = 8;
  textures.push(at);

  // Zebras vermelhas e creme
  const kc = makeCanvas(16, 64);
  const k = kc.getContext("2d")!;
  k.fillStyle = "#d23b2c";
  k.fillRect(0, 0, 16, 32);
  k.fillStyle = "#f5f2ec";
  k.fillRect(0, 32, 16, 32);
  const kt = new THREE.CanvasTexture(kc);
  kt.wrapS = kt.wrapT = THREE.RepeatWrapping;
  kt.colorSpace = THREE.SRGBColorSpace;
  textures.push(kt);

  // 1. Acostamentos de terra
  strip(-H - KERB - 2.2, -H - KERB, -1.2, 0.02, 10, mat(0x8f6b48, { side: THREE.DoubleSide }));
  strip(H + KERB, H + KERB + 2.2, 0.02, -1.2, 10, mat(0x8f6b48, { side: THREE.DoubleSide }));

  // 2. Zebras
  strip(-H - KERB, -H, 0.06, 0.1, 3, new THREE.MeshStandardMaterial({ map: kt, roughness: 0.6, side: THREE.DoubleSide }));
  strip(H, H + KERB, 0.1, 0.06, 3, new THREE.MeshStandardMaterial({ map: kt, roughness: 0.6, side: THREE.DoubleSide }));

  // 3. Asfalto principal
  strip(
    -H,
    H,
    0.1,
    0.1,
    ROAD,
    new THREE.MeshStandardMaterial({
      map: at,
      emissiveMap: atEm,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.2,
      roughness: 0.85,
      side: THREE.DoubleSide,
    })
  );

  // 4. Pulso de energia aditivo correndo pelas linhas
  strip(
    -H,
    H,
    0.13,
    0.13,
    ROAD,
    new THREE.ShaderMaterial({
      uniforms: desertAnimationState.pulseU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: `varying vec2 vu;void main(){vu=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float uT;varying vec2 vu;void main(){float v=vu.y*17.0;float p=fract(v*.04-uT*.55);float band=smoothstep(.0,.06,p)*(1.-smoothstep(.06,.22,p));
        float lane=0.;for(int k=1;k<4;k++){lane=max(lane,1.-smoothstep(.0,.035,abs(vu.x-float(k)*.25)));}lane=max(lane,1.-smoothstep(.0,.05,min(vu.x,1.-vu.x)));
        vec3 c=mix(vec3(1.,.2,.65),vec3(.15,.95,1.),vu.x);float a=band*(.25+lane*1.4)+lane*.06;gl_FragColor=vec4(c*a,a);}`,
    })
  );

  // 5. Mureta de concreto nas duas bordas com faixa vermelha no topo
  function wall(off: number) {
    const pos: number[] = [];
    const idx: number[] = [];
    const col: number[] = [];
    const hw = WALL_W / 2;
    const red = new THREE.Color(0xc8372d);
    const gray = new THREE.Color(0xd9d4ca);
    for (let i = 0; i <= N; i++) {
      const k = i % N;
      const A0 = xs(k, off - hw, -0.6);
      const A1 = xs(k, off - hw, 0.1 + WALL_H);
      const B1 = xs(k, off + hw, 0.1 + WALL_H);
      const B0 = xs(k, off + hw, -0.6);
      pos.push(A0.x, A0.y, A0.z, A1.x, A1.y, A1.z, B1.x, B1.y, B1.z, B0.x, B0.y, B0.z);
      const stripe = Math.floor(i / 6) % 2 ? red : gray;
      [gray, stripe, stripe, gray].forEach((c) => col.push(c.r, c.g, c.b));
      if (i < N && !gapQ(k)) {
        const a = i * 4;
        const b = a + 4;
        idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2, a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  wall(-(H + KERB + WALL_W / 2 + 0.1));
  wall(H + KERB + WALL_W / 2 + 0.1);

  // 6. Laterais do aterro onde a pista passa acima do terreno
  strip(-H - KERB - 2.2, -H - KERB - 2.2, -6, -1.2, 10, mat(0x7d5c3c, { side: THREE.DoubleSide }));
  strip(H + KERB + 2.2, H + KERB + 2.2, -1.2, -6, 10, mat(0x7d5c3c, { side: THREE.DoubleSide }));

  return group;
}

/** Túnel monumental com morro por cima, anéis de néon e portais de perigo */
export function buildDesertTunnel(track: Track, desertoTex: THREE.Texture, textures: THREE.Texture[]): THREE.Group {
  const group = new THREE.Group();
  const pts = track.points;
  const N = pts.length;
  const TR = 14;
  const TAX = 9.4;
  const Wo = 40;
  const R2 = TR + 3;
  const NA = 40;
  const NO = 48;

  const cork = track.corkscrew;
  const sStart = cork ? cork.sStart - 55 : (track.ctrlS[22] ?? 505);
  const sEnd = cork ? cork.sEnd + 70 : (track.ctrlS[31] ?? 820);

  let iStart = 0;
  let iEnd = 0;
  for (let i = 0; i < N; i++) {
    if (track.cum[i] >= sStart && track.cum[(i - 1 + N) % N] < sStart) iStart = i;
    if (track.cum[i] <= sEnd && track.cum[(i + 1) % N] > sEnd) iEnd = i;
  }
  const tLen = (iEnd - iStart + N) % N;
  if (tLen < 10) return group;

  const tan: THREE.Vector2[] = [];
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N];
    const b = pts[(i + 1) % N];
    tan.push(new THREE.Vector2(b.x - a.x, b.z - a.z).normalize());
  }

  const frame = (i: number) => {
    const p = pts[i];
    const t = tan[i];
    const yVal = track.heights?.[i] ?? heightAt(track, track.cum[i]);
    return { p, nx: -t.y, nz: t.x, y: yVal };
  };

  const outerY = (f: { p: { x: number; z: number }; nx: number; nz: number; y: number }, lat: number) => {
    const x = f.p.x + f.nx * lat;
    const z = f.p.z + f.nz * lat;
    const ax = f.y + TAX;
    const roof = Math.abs(lat) <= R2 ? ax + Math.sqrt(R2 * R2 - lat * lat) : ax - (Math.abs(lat) - R2) * 1.1;
    return Math.max(natural(x, z) - 0.3, roof);
  };

  const idx = [...Array(tLen + 1).keys()].map((k) => (iStart + k) % N);
  const innerP: number[] = [];
  const innerC: number[] = [];
  const outerP: number[] = [];
  const outerUV: number[] = [];

  idx.forEach((i, k) => {
    const f = frame(i);
    const band = Math.floor(k / 7) % 2 ? 0.78 : 1;
    for (let a = 0; a <= NA; a++) {
      const th = (2 * Math.PI * a) / NA;
      const lat = Math.cos(th) * TR;
      const h = TAX + Math.sin(th) * TR;
      innerP.push(f.p.x + f.nx * lat, f.y + h, f.p.z + f.nz * lat);
      innerC.push(band, band, band);
    }
    for (let a = 0; a <= NO; a++) {
      const u = a / NO;
      const lat = -Wo + 2 * Wo * u;
      const y = outerY(f, lat);
      const x = f.p.x + f.nx * lat;
      const z = f.p.z + f.nz * lat;
      outerP.push(x, y, z);
      outerUV.push(x / MW + 0.5, 1 - (z / MH + 0.5));
    }
  });

  const grid = (cols: number, rows: number, flip: boolean) => {
    const out: number[] = [];
    for (let k = 0; k < rows; k++) {
      for (let a = 0; a < cols; a++) {
        const q = k * (cols + 1) + a;
        const r = q + cols + 1;
        if (flip) out.push(q, q + 1, r, r, q + 1, r + 1);
        else out.push(q, r, q + 1, q + 1, r, r + 1);
      }
    }
    return out;
  };

  // Tubo cilíndrico interno de concreto
  const gIn = new THREE.BufferGeometry();
  gIn.setAttribute("position", new THREE.Float32BufferAttribute(innerP, 3));
  gIn.setAttribute("color", new THREE.Float32BufferAttribute(innerC, 3));
  gIn.setIndex(grid(NA, tLen, true));
  gIn.computeVertexNormals();
  const tunnelIn = new THREE.Mesh(
    gIn,
    new THREE.MeshStandardMaterial({
      color: 0x8a847c,
      vertexColors: true,
      roughness: 0.9,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0x1a1612),
    })
  );
  tunnelIn.receiveShadow = true;
  group.add(tunnelIn);

  // Morro externo cobrindo o túnel com deserto.jpg
  const gOut = new THREE.BufferGeometry();
  gOut.setAttribute("position", new THREE.Float32BufferAttribute(outerP, 3));
  gOut.setAttribute("uv", new THREE.Float32BufferAttribute(outerUV, 2));
  gOut.setIndex(grid(NO, tLen, false));
  gOut.computeVertexNormals();
  const hill = new THREE.Mesh(gOut, new THREE.MeshStandardMaterial({ map: desertoTex, roughness: 1, side: THREE.DoubleSide }));
  hill.castShadow = hill.receiveShadow = true;
  group.add(hill);

  // Anéis de néon âmbar a cada 8 metros
  const rg = new THREE.TorusGeometry(TR - 0.02, 0.06, 6, 72);
  const rm = new THREE.MeshBasicMaterial({ color: 0xffcf6e, toneMapped: false });
  const imCount = Math.ceil(tLen / 8) + 1;
  const im = new THREE.InstancedMesh(rg, rm, imCount);
  const d = new THREE.Object3D();
  let ringIndex = 0;
  for (let k = 0; k <= tLen; k += 8) {
    const i = idx[k];
    const f = frame(i);
    const t = tan[i];
    d.position.set(f.p.x, f.y + TAX, f.p.z);
    d.rotation.set(0, Math.atan2(t.x, t.y), 0);
    d.updateMatrix();
    im.setMatrixAt(ringIndex++, d.matrix);
  }
  im.count = ringIndex;
  group.add(im);

  // 3 Luzes âmbar pontuais no interior do túnel
  for (const fr of [0.15, 0.5, 0.85]) {
    const f = frame(idx[Math.round(tLen * fr)]);
    const pl = new THREE.PointLight(0xffd9a0, 1.6, 110, 1.4);
    pl.position.set(f.p.x, f.y + TAX, f.p.z);
    group.add(pl);
  }

  // Portais com faixas de perigo nas extremidades
  const hzc = makeCanvas(64, 16);
  const hx = hzc.getContext("2d")!;
  hx.fillStyle = "#f2c21b";
  hx.fillRect(0, 0, 64, 16);
  hx.fillStyle = "#16130f";
  for (let i = -16; i < 80; i += 16) {
    hx.beginPath();
    hx.moveTo(i, 0);
    hx.lineTo(i + 8, 0);
    hx.lineTo(i, 16);
    hx.lineTo(i - 8, 16);
    hx.fill();
  }
  const hzTex = new THREE.CanvasTexture(hzc);
  hzTex.wrapS = THREE.RepeatWrapping;
  hzTex.repeat.set(10, 1);
  hzTex.colorSpace = THREE.SRGBColorSpace;
  textures.push(hzTex);

  for (const [k, s] of [
    [0, -1],
    [tLen, 1],
  ] as const) {
    const f = frame(idx[k]);
    const sh = new THREE.Shape();
    for (let a = 0; a <= NO; a++) {
      const sx = -Wo + (2 * Wo * a) / NO;
      const y = outerY(f, -sx) - f.y;
      if (a) sh.lineTo(sx, y);
      else sh.moveTo(sx, y);
    }
    sh.lineTo(Wo, -9);
    sh.lineTo(-Wo, -9);
    sh.closePath();

    const hole = new THREE.Path();
    hole.moveTo(TR, TAX);
    for (let a = 1; a < NA; a++) {
      const th = (2 * Math.PI * a) / NA;
      hole.lineTo(Math.cos(th) * TR, TAX + Math.sin(th) * TR);
    }
    hole.closePath();
    sh.holes.push(hole);

    const pg = new THREE.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: false, curveSegments: 4 });
    pg.translate(0, 0, -0.6);
    const portal = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: 0x9c8466, roughness: 0.9 }));
    portal.position.set(f.p.x, f.y, f.p.z);
    portal.rotation.set(0, Math.atan2(tan[idx[k]].x, tan[idx[k]].y), 0);
    portal.castShadow = portal.receiveShadow = true;
    group.add(portal);

    const ringPts: THREE.Vector3[] = [];
    for (let a = 0; a < NA; a++) {
      const th = (2 * Math.PI * a) / NA;
      ringPts.push(new THREE.Vector3(Math.cos(th) * (TR + 0.35), TAX + Math.sin(th) * (TR + 0.35), 0));
    }
    const ring = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ringPts, true), 80, 0.35, 6, true),
      new THREE.MeshStandardMaterial({ map: hzTex, roughness: 0.6 })
    );
    ring.position.copy(portal.position);
    ring.rotation.copy(portal.rotation);
    ring.translateZ(-s * 0.65);
    group.add(ring);
  }

  return group;
}

/** Cânion do salto com paredões, barreiras zebradas e poço de lama borbulhante */
export function buildDesertCanyon(track: Track): THREE.Group {
  const group = new THREE.Group();
  const gap = track.ramps.find((r) => r.path === -1 && r.gap)?.gap;
  if (!gap) return group;

  const pts = track.points;
  const N = pts.length;
  const ROAD = 17;
  const KERB = 1.1;
  const H = ROAD / 2;
  const W2 = H + KERB + 2.2;

  let g0 = 0;
  let g1 = 0;
  for (let i = 0; i < N; i++) {
    if (track.cum[i] <= gap.sFrom && track.cum[(i + 1) % N] > gap.sFrom) g0 = i;
    if (track.cum[i] >= gap.sTo && track.cum[(i - 1 + N) % N] < gap.sTo) g1 = i;
  }

  const tan: THREE.Vector2[] = [];
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N];
    const b = pts[(i + 1) % N];
    tan.push(new THREE.Vector2(b.x - a.x, b.z - a.z).normalize());
  }

  const xsSimple = (k: number, off: number, y: number) => {
    const p = pts[k];
    const t = tan[k];
    const yVal = track.heights?.[k] ?? heightAt(track, track.cum[k]);
    return new THREE.Vector3(p.x - t.y * off, yVal + y, p.z + t.x * off);
  };

  // Paredões da rampa até o fundo do abismo
  const pos: number[] = [];
  const idx: number[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    const o = pos.length / 3;
    [a, b, c, d].forEach((v) => pos.push(v.x, v.y, v.z));
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  };
  const down = (v: THREE.Vector3, k: number) => {
    const yVal = track.heights?.[k] ?? heightAt(track, track.cum[k]);
    return new THREE.Vector3(v.x, yVal - 21, v.z);
  };

  const side = (ka: number, count: number) => {
    for (let j = 0; j < count; j++) {
      const k = (ka + j) % N;
      const k2 = (k + 1) % N;
      for (const sg of [-1, 1]) {
        const t1 = xsSimple(k, sg * W2, -1.2);
        const t2 = xsSimple(k2, sg * W2, -1.2);
        quad(t1, t2, down(t2, k2), down(t1, k));
      }
    }
  };
  side(g1, 22);
  side((g0 - 22 + N) % N, 22);

  for (const k of [g0, g1]) {
    const l = xsSimple(k, -W2, 0.1);
    const r = xsSimple(k, W2, 0.1);
    quad(l, r, down(r, k), down(l, k));
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const body = new THREE.Mesh(g, mat(0x9c8466, { side: THREE.DoubleSide }));
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  // Barreiras zebradas amarelas/pretas nas bordas do abismo
  const hzc = makeCanvas(128, 16);
  const hx = hzc.getContext("2d")!;
  hx.fillStyle = "#f2c21b";
  hx.fillRect(0, 0, 128, 16);
  hx.fillStyle = "#16130f";
  for (let i = -16; i < 144; i += 16) {
    hx.beginPath();
    hx.moveTo(i, 0);
    hx.lineTo(i + 8, 0);
    hx.lineTo(i, 16);
    hx.lineTo(i - 8, 16);
    hx.fill();
  }
  const hzt = new THREE.CanvasTexture(hzc);
  hzt.wrapS = THREE.RepeatWrapping;
  hzt.repeat.set(3, 1);
  hzt.colorSpace = THREE.SRGBColorSpace;

  for (const k of [g0, g1]) {
    const l = xsSimple(k, -W2, 0.1);
    const r = xsSimple(k, W2, 0.1);
    const t = tan[k];
    const bMesh = new THREE.Mesh(new THREE.BoxGeometry(W2 * 2 + 0.2, 0.9, 0.3), new THREE.MeshStandardMaterial({ map: hzt, roughness: 0.6 }));
    bMesh.position.copy(l).add(r).multiplyScalar(0.5);
    bMesh.position.y -= 0.4;
    bMesh.rotation.y = Math.atan2(t.x, t.y);
    group.add(bMesh);
  }

  // Poço de lama viscosa no fundo com shader procedural e bolhas
  const gc = Math.round((g0 + (g1 - g0 + N) % N / 2) % N);
  const cPt = xsSimple(gc, 0, 0);
  const tMid = tan[gc];
  const yGc = track.heights?.[gc] ?? heightAt(track, track.cum[gc]);
  const MY = yGc - 17.4;
  const mu = { uT: { value: 0 } };

  const mud = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 90, 1, 1).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: mu,
      vertexShader: `varying vec3 w;void main(){vec4 p=modelMatrix*vec4(position,1.);w=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader: `uniform float uT;varying vec3 w;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
        float fb(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.1+vec2(3.1,1.7);a*=.5;}return v;}
        void main(){vec2 p=w.xz*.12;vec2 q=vec2(fb(p+uT*.03),fb(p+vec2(5.2,1.3)-uT*.025));float m=fb(p+2.*q+uT*.02);
          vec3 c=mix(vec3(.2,.13,.08),vec3(.42,.29,.17),m);c=mix(c,vec3(.45,.32,.19),smoothstep(.62,.8,m)*.6);
          vec3 v=normalize(cameraPosition-w);float sh=pow(1.-max(v.y,0.),3.)*.25+smoothstep(.7,.78,fb(p*3.-uT*.05))*.12;
          c+=vec3(.9,.8,.6)*sh;gl_FragColor=linearToOutputTexel(vec4(pow(c,vec3(2.2)),1.));}`,
    })
  );
  mud.position.set(cPt.x, MY, cPt.z);
  mud.rotation.y = Math.atan2(tMid.x, tMid.y);
  mud.receiveShadow = true;
  group.add(mud);

  // 26 Bolhas borbulhantes
  const NB = 26;
  const bub = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(0x4a3320, { roughness: 0.25, metalness: 0.1 }),
    NB
  );
  const bs: { a: number; l: number; ph: number; sp: number; r: number }[] = [];
  const nx = -tMid.y;
  const nz = tMid.x;
  for (let i = 0; i < NB; i++) {
    bs.push({
      a: (Math.random() - 0.5) * 36,
      l: (Math.random() - 0.5) * 50,
      ph: Math.random(),
      sp: 0.25 + Math.random() * 0.35,
      r: 0.4 + Math.random() * 0.9,
    });
  }
  group.add(bub);

  const dummy = new THREE.Object3D();
  desertAnimationState.mudUpdate = (dt: number, now: number) => {
    mu.uT.value = now * 0.001;
    bs.forEach((b, i) => {
      b.ph += dt * b.sp;
      if (b.ph > 1) {
        b.ph = 0;
        b.a = (Math.random() - 0.5) * 36;
        b.l = (Math.random() - 0.5) * 50;
      }
      const kFactor = b.ph < 0.85 ? b.ph / 0.85 : 0;
      dummy.position.set(cPt.x + tMid.x * b.a + nx * b.l, MY - 0.05, cPt.z + tMid.y * b.a + nz * b.l);
      dummy.scale.set(b.r * kFactor, b.r * kFactor * 0.8, b.r * kFactor);
      dummy.updateMatrix();
      bub.setMatrixAt(i, dummy.matrix);
    });
    bub.instanceMatrix.needsUpdate = true;
  };

  return group;
}

/** Pórtico de largada com faixa "LARGADA" e quadriculado na pista */
export function buildDesertStartGantry(track: Track, textures: THREE.Texture[]): THREE.Group {
  const g = new THREE.Group();
  const ROAD = 17;
  const KERB = 1.1;
  const H = ROAD / 2;

  const startPt = track.points[0];
  const nextPt = track.points[1];
  const startY = track.heights?.[0] ?? heightAt(track, 0);
  const heading = Math.atan2(nextPt.x - startPt.x, nextPt.z - startPt.z);

  g.position.set(startPt.x, startY + 0.1, startPt.z);
  g.rotation.y = heading;

  // Quadriculado preto e branco no asfalto
  const c = makeCanvas(320, 48);
  const x = c.getContext("2d")!;
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 3; j++) {
      x.fillStyle = (i + j) % 2 ? "#111111" : "#f7f7f2";
      x.fillRect(i * 16, j * 16, 16, 16);
    }
  }
  const ct = new THREE.CanvasTexture(c);
  ct.magFilter = THREE.NearestFilter;
  ct.colorSpace = THREE.SRGBColorSpace;
  textures.push(ct);

  const pl = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD, (ROAD * 3) / 20).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: ct, polygonOffset: true, polygonOffsetFactor: -2 })
  );
  pl.position.y = 0.02;
  g.add(pl);

  // Pilares do pórtico
  const pm = mat(0x2d3a40, { roughness: 0.5, metalness: 0.3 });
  for (const s of [-1, 1]) {
    const po = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), pm);
    po.position.set(s * (H + KERB + 0.6), 3.5, 0);
    po.castShadow = true;
    g.add(po);
  }

  // Faixa "LARGADA" em Bricolage Grotesque
  const bc = makeCanvas(1024, 128);
  const y = bc.getContext("2d")!;
  y.fillStyle = "#b4532a";
  y.fillRect(0, 0, 1024, 128);
  for (let i = 0; i < 64; i++) {
    y.fillStyle = i % 2 ? "#111111" : "#ffffff";
    y.fillRect(i * 16, 0, 16, 10);
    y.fillStyle = i % 2 ? "#ffffff" : "#111111";
    y.fillRect(i * 16, 118, 16, 10);
  }
  y.fillStyle = "#ffffff";
  y.font = '800 76px "Bricolage Grotesque", "Trebuchet MS", sans-serif';
  y.textAlign = "center";
  y.textBaseline = "middle";
  y.fillText("LARGADA", 512, 68);

  const bt = new THREE.CanvasTexture(bc);
  bt.colorSpace = THREE.SRGBColorSpace;
  textures.push(bt);

  const sd = mat(0xb4532a);
  const fc = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.7 });
  const ban = new THREE.Mesh(new THREE.BoxGeometry(ROAD + KERB * 2 + 1.6, 1.6, 0.3), [sd, sd, sd, sd, fc, fc]);
  ban.position.y = 6.6;
  ban.castShadow = true;
  g.add(ban);

  return g;
}

/** 16 setores de arquibancadas com torcedores viradas para o asfalto */
export async function buildDesertBleachers(track: Track): Promise<THREE.Group> {
  const group = new THREE.Group();
  const { ground, inTunnel, inJump, nearest } = createDesertGround(track);
  const pts = track.points;
  const N = pts.length;
  const ROAD = 17;
  const KERB = 1.1;
  const WALL_W = 0.6;
  const H = ROAD / 2;

  const SC = 1.7;
  const AW = 5.16 * SC;
  const SD = 3.12 * SC;
  const front = H + KERB + WALL_W + 0.9;

  const stands: { x: number; z: number; y: number; fx: number; fz: number }[] = [];

  const tryStand = (i: number, side: number) => {
    const s = track.cum[i];
    if (inTunnel(s, 25) || inJump(s, 14)) return false;
    const p = pts[i];
    const prev = pts[(i - 1 + N) % N];
    const next = pts[(i + 1) % N];
    const t = new THREE.Vector2(next.x - prev.x, next.z - prev.z).normalize();
    const nx = -t.y * side;
    const nz = t.x * side;
    const dDist = front + SD * 0.52;
    const x = p.x + nx * dDist;
    const z = p.z + nz * dDist;

    for (const [a, b] of [
      [-AW / 2, -SD / 2],
      [AW / 2, -SD / 2],
      [-AW / 2, SD / 2],
      [AW / 2, SD / 2],
    ]) {
      const cx = x + t.x * a + nx * b;
      const cz = z + t.y * a + nz * b;
      const n = nearest(cx, cz);
      if (n && n.d < front - 0.3) return false;
    }
    if (stands.some((st) => Math.hypot(st.x - x, st.z - z) < AW * 0.95)) return false;
    const yTrack = track.heights?.[i] ?? heightAt(track, track.cum[i]);
    const y = Math.max(yTrack - 0.15, ground(x, z) - 0.6);
    stands.push({ x, z, y, fx: p.x, fz: p.z });
    return true;
  };

  const sections = 16;
  const stepI = Math.max(1, Math.round(AW / (track.length / N)));
  for (let s = 0; s < sections; s++) {
    const i0 = Math.round((s * N) / sections) % N;
    for (const side of s % 3 === 0 ? [1, -1] : [1]) {
      for (let k = -1; k <= 1; k++) tryStand((i0 + k * stepI + N) % N, side);
    }
  }

  // Bases de concreto
  const bm = mat(0xb9ad98);
  stands.forEach((st) => {
    const h = st.y - (ground(st.x, st.z) - 2);
    const b = new THREE.Mesh(new THREE.BoxGeometry(AW * 0.98, h, SD * 0.98), bm);
    b.position.set(st.x, st.y - h / 2, st.z);
    b.lookAt(st.fx, st.y - h / 2, st.fz);
    b.castShadow = b.receiveShadow = true;
    group.add(b);
  });

  if (typeof window === "undefined" || typeof document === "undefined") {
    return group;
  }

  try {
    const loader = createGltfLoader();
    const gltf = await loader.loadAsync(arquibancadaGlbUrl);
    stands.forEach((st) => {
      const o = gltf.scene.clone(true);
      o.scale.setScalar(SC);
      o.position.set(st.x, st.y, st.z);
      o.lookAt(st.fx, st.y, st.fz);
      o.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });
      group.add(o);
    });
  } catch (err) {
    console.warn("Não foi possível carregar arquibancada.glb:", err);
  }

  return group;
}

/** Vilarejos de Adobe detalhados, caveiras de boi, cactos e pedras */
export function buildDesertScenery(track: Track): THREE.Group {
  const group = new THREE.Group();
  const { ground, inTunnel, inJump, nearest } = createDesertGround(track);
  const pts = track.points;
  const N = pts.length;
  const ROAD = 17;
  const KERB = 1.1;

  let sd = 303;
  const r = () => {
    sd = (sd * 16807) % 2147483647;
    return sd / 2147483647;
  };

  const walls = [0xc4683e, 0xcf8636, 0xc9775f, 0xb9925c, 0xe6dccb, 0x6b98bd, 0x7fb08f, 0xd9ab3a, 0xa8524a, 0xd88f70];
  const trims = [0x2f7f95, 0x2a9d8f, 0xc0392b, 0x6a4c93, 0x2f5f8a, 0xd98c1f];
  const wood = mat(0x6b4a2b, { roughness: 0.9 });
  const dark = mat(0x2a1d14, { roughness: 0.9 });
  const glass = mat(0x1b2a33, { roughness: 0.2, metalness: 0.3 });
  const clay = mat(0xb5603a, { roughness: 0.8 });

  const wallM: Record<number, THREE.MeshStandardMaterial> = {};
  const trimM: Record<number, THREE.MeshStandardMaterial> = {};
  const wm = (c: number) => wallM[c] || (wallM[c] = mat(c, { roughness: 0.95 }));
  const tm = (c: number) => trimM[c] || (trimM[c] = mat(c, { roughness: 0.6 }));

  const houses: { x: number; z: number; R: number }[] = [];
  const houseGroups: THREE.Group[] = [];

  const fits = (x: number, z: number, R: number, minD = 16) => {
    if (Math.abs(x) > MW * 0.46 || Math.abs(z) > MH * 0.46) return null;
    const n = nearest(x, z);
    if (n && (n.d < ROAD / 2 + KERB + minD + R || inTunnel(n.s, 30) || inJump(n.s, 30))) return null;
    if (houses.some((h) => Math.hypot(h.x - x, h.z - z) < h.R + R + 3)) return null;
    let lo = 1e9;
    let hi = -1e9;
    for (const [a, b] of [
      [-R, -R],
      [R, -R],
      [-R, R],
      [R, R],
      [0, 0],
    ]) {
      const g = ground(x + a, z + b);
      lo = Math.min(lo, g);
      hi = Math.max(hi, g);
    }
    return hi - lo < 2 ? lo - 0.2 : null;
  };

  function house(x: number, z: number, lo: number) {
    const w = 6 + r() * 3.5;
    const d = 5 + r() * 2.5;
    const h = 3 + r() * 0.8;
    const col = walls[(r() * walls.length) | 0];
    const trim = trims[(r() * trims.length) | 0];

    const g = new THREE.Group();
    g.position.set(x, lo, z);
    const n = nearest(x, z);
    g.rotation.y = n ? Math.atan2(pts[n.i].x - x, pts[n.i].z - z) : r() * 6.28;
    houseGroups.push(g);

    const add = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(px, py, pz);
      o.castShadow = o.receiveShadow = true;
      g.add(o);
      return o;
    };

    const W = wm(col);
    const base = 2.5;
    add(new THREE.BoxGeometry(w, h + base, d), W, 0, (h - base) / 2, 0);
    add(new THREE.BoxGeometry(w + 0.3, 0.35, d + 0.3), W, 0, h + 0.05, 0);
    add(new THREE.BoxGeometry(w - 0.6, 0.12, d - 0.6), wm(new THREE.Color(col).multiplyScalar(0.82).getHex()), 0, h + 0.2, 0);

    for (let k = 0; k < 5; k++) {
      const v = add(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 6), wood, -w / 2 + 0.8 + (k * (w - 1.6)) / 4, h - 0.35, d / 2 + 0.25);
      v.rotation.x = Math.PI / 2;
    }
    add(new THREE.BoxGeometry(1.1, 2.15, 0.12), dark, -w * 0.18, 1.07, d / 2 + 0.03);
    add(new THREE.BoxGeometry(1.4, 0.18, 0.18), tm(trim), -w * 0.18, 2.25, d / 2 + 0.08);

    for (const wx of [w * 0.2, w * 0.38]) {
      if (wx + 0.6 > w / 2) continue;
      add(new THREE.BoxGeometry(0.95, 0.95, 0.1), glass, wx, 1.7, d / 2 + 0.03);
      add(new THREE.BoxGeometry(1.15, 1.15, 0.06), tm(trim), wx, 1.7, d / 2 + 0.01);
    }
    if (r() < 0.5) {
      const w2 = w * 0.5;
      const d2 = d * 0.6;
      const h2 = 2.6;
      const sx = (r() < 0.5 ? -1 : 1) * ((w - w2) / 2);
      add(new THREE.BoxGeometry(w2, h2, d2), W, sx, h + h2 / 2, -(d - d2) / 2);
      add(new THREE.BoxGeometry(w2 + 0.25, 0.3, d2 + 0.25), W, sx, h + h2, -(d - d2) / 2);
    }
    if (r() < 0.55) {
      const pw = w * 0.75;
      const pd = 2.4;
      for (const px of [-pw / 2 + 0.2, pw / 2 - 0.2]) {
        add(new THREE.CylinderGeometry(0.13, 0.15, 2.6, 7), wood, px, 1.3, d / 2 + pd);
      }
      add(new THREE.BoxGeometry(pw, 0.18, pd + 0.3), wood, 0, 2.65, d / 2 + pd / 2);
    }
    if (r() < 0.6) {
      for (let k = 0; k < 1 + ((r() * 3) | 0); k++) {
        add(new THREE.SphereGeometry(0.32, 10, 8).scale(1, 1.15, 1), clay, w * 0.05 + k * 0.75, 0.32, d / 2 + 0.6);
      }
    }
    houses.push({ x, z, R: Math.max(w, d) / 2 + 2.4 });
  }

  // Casas ao longo da pista
  const STP = 32;
  for (let i0 = 0; i0 < N; i0 += STP) {
    for (const side of [1, -1]) {
      for (let tt = 0; tt < 6; tt++) {
        const i = (i0 + ((r() * STP * 0.6) | 0)) % N;
        const prev = pts[(i - 1 + N) % N];
        const next = pts[(i + 1) % N];
        const tg = new THREE.Vector2(next.x - prev.x, next.z - prev.z).normalize();
        const off = side * (ROAD / 2 + KERB + 10 + r() * 9);
        const x = pts[i].x - tg.y * off;
        const z = pts[i].z + tg.x * off;
        const lo = fits(x, z, 5.2, 4.5);
        if (lo === null) continue;
        house(x, z, lo);
        break;
      }
    }
  }

  // Vilarejos em núcleos no deserto
  for (let v = 0; v < 4; v++) {
    let cx = 0;
    let cz = 0;
    let okc = false;
    for (let t = 0; t < 1000 && !okc; t++) {
      cx = (r() - 0.5) * MW * 0.85;
      cz = (r() - 0.5) * MH * 0.85;
      okc = fits(cx, cz, 9) !== null;
    }
    if (!okc) continue;
    let nHouses = 0;
    for (let t = 0; t < 200 && nHouses < 5; t++) {
      const a = r() * 6.28;
      const rr = nHouses === 0 ? 0 : 9 + r() * 20;
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      const lo = fits(x, z, 6.5);
      if (lo === null) continue;
      house(x, z, lo);
      nHouses++;
    }
  }

  // Merging houses by material
  const houseBuckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  houseGroups.forEach((g) => {
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const m = o as THREE.Mesh;
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      geo.applyMatrix4(m.matrixWorld);
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const list = houseBuckets.get(m.material as THREE.Material) || [];
      list.push(geo);
      houseBuckets.set(m.material as THREE.Material, list);
    });
  });

  houseBuckets.forEach((list, matKey) => {
    let nVerts = 0;
    list.forEach((geo) => (nVerts += geo.attributes.position.count));
    const P = new Float32Array(nVerts * 3);
    const Nn = new Float32Array(nVerts * 3);
    let offset = 0;
    list.forEach((geo) => {
      P.set(geo.attributes.position.array, offset);
      Nn.set(geo.attributes.normal.array, offset);
      offset += geo.attributes.position.array.length;
    });
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(P, 3));
    bg.setAttribute("normal", new THREE.BufferAttribute(Nn, 3));
    bg.computeBoundingSphere();
    const mesh = new THREE.Mesh(bg, matKey);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  });

  // Vegetação Oficial: Cactos, palmas e capim dourado
  const mergeGeos = (list: THREE.BufferGeometry[]) => {
    let count = 0;
    const gs = list.map((geo) => {
      const nonIdx = geo.index ? geo.toNonIndexed() : geo;
      count += nonIdx.attributes.position.count;
      return nonIdx;
    });
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    let o = 0;
    gs.forEach((geo) => {
      geo.computeVertexNormals();
      pos.set(geo.attributes.position.array, o);
      nor.set(geo.attributes.normal.array, o);
      o += geo.attributes.position.array.length;
    });
    const mGeo = new THREE.BufferGeometry();
    mGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    mGeo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    return mGeo;
  };

  const cyl = (rRad: number, hH: number, px: number, py: number, pz: number, rz = 0) => {
    const geo = new THREE.CylinderGeometry(rRad, rRad * 1.05, hH, 10);
    geo.translate(0, hH / 2, 0);
    if (rz) geo.rotateZ(rz);
    geo.translate(px, py, pz);
    return geo;
  };
  const capMesh = (rRad: number, px: number, py: number, pz: number) => {
    const geo = new THREE.SphereGeometry(rRad, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    geo.translate(px, py, pz);
    return geo;
  };

  const sag1 = mergeGeos([
    cyl(0.45, 6, 0, 0, 0),
    capMesh(0.45, 0, 6, 0),
    cyl(0.3, 1.2, 0.4, 2.6, 0, -Math.PI / 2),
    cyl(0.3, 2, 1.55, 2.6, 0),
    capMesh(0.3, 1.55, 4.6, 0),
    cyl(0.3, 0.9, -0.4, 3.4, 0, Math.PI / 2),
    cyl(0.3, 1.4, -1.25, 3.4, 0),
    capMesh(0.3, -1.25, 4.8, 0),
  ]);
  const sag2 = mergeGeos([
    cyl(0.5, 7, 0, 0, 0),
    capMesh(0.5, 0, 7, 0),
    cyl(0.32, 1.3, 0.45, 3.2, 0, -Math.PI / 2),
    cyl(0.32, 2.4, 1.7, 3.2, 0),
    capMesh(0.32, 1.7, 5.6, 0),
  ]);
  const barrel = (() => {
    const geo = new THREE.SphereGeometry(0.7, 12, 10);
    geo.scale(1, 1.15, 1);
    geo.translate(0, 0.6, 0);
    return geo;
  })();
  const flower = mergeGeos(
    [0, 1, 2, 3, 4].map((kIdx) => {
      const geo = new THREE.SphereGeometry(0.12, 6, 4);
      geo.translate(Math.cos(kIdx * 1.26) * 0.2, 1.38, Math.sin(kIdx * 1.26) * 0.2);
      return geo;
    })
  );
  const pear = mergeGeos(
    [
      [0, 0.55, 0, 0],
      [0.45, 1.2, 0.1, -0.5],
      [-0.4, 1.15, -0.05, 0.45],
      [0.15, 1.75, 0, -0.15],
    ].map(([px, py, pz, rz]) => {
      const geo = new THREE.SphereGeometry(0.55, 10, 8);
      geo.scale(1, 1.15, 0.22);
      geo.rotateZ(rz);
      geo.translate(px, py, pz);
      return geo;
    })
  );
  const grass = mergeGeos(
    [...Array(9).keys()].map((kIdx) => {
      const geo = new THREE.ConeGeometry(0.06, 1 + ((kIdx * 37) % 5) * 0.15, 3);
      geo.translate(0, 0.5, 0);
      geo.rotateZ(0.35 + ((kIdx * 13) % 4) * 0.08);
      geo.rotateY(kIdx * 0.7);
      return geo;
    })
  );

  const vegTypes = [
    { g: sag1, c: 0x557a3a, n: 180 },
    { g: sag2, c: 0x4f7236, n: 140 },
    { g: barrel, c: 0x6b8a3e, n: 240 },
    { g: pear, c: 0x6f9a4a, n: 200 },
    { g: grass, c: 0xc9a866, n: 1200 },
  ];

  const okVeg = (x: number, z: number) => {
    const n = nearest(x, z);
    if (n && n.d < ROAD / 2 + KERB + 7) return false;
    if (n && inTunnel(n.s, 15) && n.d < 46) return false;
    if (n && inJump(n.s, 14) && n.d < 66) return false;
    if (houses.some((h) => Math.hypot(h.x - x, h.z - z) < h.R + 1.5)) return false;
    return true;
  };

  const dObj = new THREE.Object3D();
  const cColor = new THREE.Color();
  const flowers: THREE.Matrix4[] = [];

  vegTypes.forEach((T, ti) => {
    const mats: [number, number][] = [];
    let tries = 0;
    while (mats.length < T.n && tries < T.n * 12) {
      tries++;
      let x = (r() - 0.5) * MW * 0.95;
      let z = (r() - 0.5) * MH * 0.95;
      if (ti === 4 && mats.length && r() < 0.6) {
        const q = mats[(r() * mats.length) | 0];
        x = q[0] + (r() - 0.5) * 14;
        z = q[1] + (r() - 0.5) * 14;
      }
      if (!okVeg(x, z)) continue;
      mats.push([x, z]);
    }
    const im = new THREE.InstancedMesh(T.g, mat(T.c, { roughness: 0.85, flatShading: ti < 4 }), mats.length);
    mats.forEach(([x, z], i) => {
      const sc = ti < 2 ? 1.1 + r() * 0.8 : ti === 4 ? 0.9 + r() * 0.8 : 1 + r() * 0.8;
      dObj.position.set(x, ground(x, z) - 0.1, z);
      dObj.rotation.set((r() - 0.5) * 0.08, r() * 6.28, (r() - 0.5) * 0.08);
      dObj.scale.setScalar(sc);
      dObj.updateMatrix();
      im.setMatrixAt(i, dObj.matrix);
      im.setColorAt(i, cColor.setHex(T.c).offsetHSL((r() - 0.5) * 0.03, (r() - 0.5) * 0.1, (r() - 0.5) * 0.08));
      if (ti === 2 && r() < 0.6) flowers.push(dObj.matrix.clone());
    });
    im.castShadow = ti < 4;
    im.receiveShadow = true;
    group.add(im);
  });

  const fi = new THREE.InstancedMesh(flower, mat(0xf06aa0, { roughness: 0.6 }), flowers.length);
  flowers.forEach((mMat, i) => {
    fi.setMatrixAt(i, mMat);
    fi.setColorAt(i, cColor.setHex([0xf06aa0, 0xf7c23a, 0xf0884a][i % 3]));
  });
  group.add(fi);

  // Pedras e arbustos secos para escala natural
  const rocks: [number, number, number][] = [];
  const bush: [number, number, number][] = [];
  for (let i = 0; i < 5000 && rocks.length + bush.length < 1200; i++) {
    const x = (r() - 0.5) * MW * 0.96;
    const z = (r() - 0.5) * MH * 0.96;
    const n = nearest(x, z);
    if (n && n.d < ROAD / 2 + KERB + 6) continue;
    if (n && inTunnel(n.s, 10) && n.d < ROAD / 2 + 30) continue;
    (r() < 0.55 ? rocks : bush).push([x, z, ground(x, z)]);
  }

  const rg = new THREE.DodecahedronGeometry(1, 0);
  const ri = new THREE.InstancedMesh(rg, mat(0x7a5a3e, { flatShading: true }), rocks.length);
  rocks.forEach((p, i) => {
    const sc = 0.6 + r() * 2.6;
    dObj.position.set(p[0], p[2] + sc * 0.3, p[1]);
    dObj.rotation.set(r() * 3, r() * 3, r() * 3);
    dObj.scale.set(sc * (0.8 + r() * 0.6), sc * (0.5 + r() * 0.4), sc * (0.8 + r() * 0.6));
    dObj.updateMatrix();
    ri.setMatrixAt(i, dObj.matrix);
    ri.setColorAt(i, cColor.setHSL(0.07 + r() * 0.03, 0.35, 0.3 + r() * 0.15));
  });

  const bg = new THREE.IcosahedronGeometry(1, 0);
  const bi = new THREE.InstancedMesh(bg, mat(0x8a8450, { flatShading: true }), bush.length);
  bush.forEach((p, i) => {
    const sc = 0.5 + r() * 0.9;
    dObj.position.set(p[0], p[2] + sc * 0.4, p[1]);
    dObj.rotation.set(0, r() * 6, 0);
    dObj.scale.set(sc, sc * 0.7, sc);
    dObj.updateMatrix();
    bi.setMatrixAt(i, dObj.matrix);
    bi.setColorAt(i, cColor.setHSL(0.13 + r() * 0.05, 0.3, 0.32 + r() * 0.1));
  });
  ri.castShadow = bi.castShadow = true;
  ri.receiveShadow = true;
  group.add(ri, bi);

  return group;
}

/** Efeitos dinâmicos: Placas de dash com faíscas, redemoinhos de areia e urubus planando */
export function buildDesertDynamics(track: Track): THREE.Group {
  const group = new THREE.Group();
  const pts = track.points;
  const N = pts.length;
  const ROAD = 17;
  const LANE = ROAD / 4;
  const CAR_OFF = -ROAD * 0.125;
  const PAD = LANE * 1.75;

  const { inTunnel, inJump } = createDesertGround(track);

  const tan: THREE.Vector2[] = [];
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N];
    const b = pts[(i + 1) % N];
    tan.push(new THREE.Vector2(b.x - a.x, b.z - a.z).normalize());
  }

  const xsPt = (k: number, off: number, y: number) => {
    const p = pts[k];
    const t = tan[k];
    const yVal = track.heights?.[k] ?? heightAt(track, track.cum[k]);
    return new THREE.Vector3(p.x - t.y * off, yVal + y, p.z + t.x * off);
  };

  // 1. Placas de Dash (Impulso) com chapas de aço enferrujadas e moldura de perigo
  const padCanvas = makeCanvas(512, 512);
  const px = padCanvas.getContext("2d")!;
  px.fillStyle = "#f2c21b";
  px.fillRect(0, 0, 512, 512);
  px.save();
  px.beginPath();
  px.rect(0, 0, 512, 512);
  px.clip();
  px.fillStyle = "#16130f";
  for (let i = -512; i < 1024; i += 56) {
    px.beginPath();
    px.moveTo(i, 0);
    px.lineTo(i + 28, 0);
    px.lineTo(i + 28 - 512, 512);
    px.lineTo(i - 512, 512);
    px.fill();
  }
  px.restore();

  const pl = [
    [52, 52, 136, 200],
    [52, 260, 136, 200],
    [324, 52, 136, 200],
    [324, 260, 136, 200],
    [196, 52, 120, 408],
  ] as const;
  for (const [px0, py0, pw0, ph0] of pl) {
    const center = px0 === 196;
    const g = px.createLinearGradient(px0, py0, px0 + pw0, py0 + ph0);
    if (center) {
      g.addColorStop(0, "#2b2f33");
      g.addColorStop(1, "#1d2023");
    } else {
      g.addColorStop(0, "#7c8389");
      g.addColorStop(0.5, "#a3a9ae");
      g.addColorStop(1, "#6f767c");
    }
    px.fillStyle = g;
    px.fillRect(px0, py0, pw0, ph0);
    for (let k = 0; k < (center ? 25 : 140); k++) {
      const rx = px0 + Math.random() * pw0;
      const ry = py0 + Math.random() * ph0;
      px.fillStyle = `rgba(${110 + ((Math.random() * 60) | 0)},${45 + ((Math.random() * 30) | 0)},15,${0.12 + Math.random() * 0.25})`;
      px.beginPath();
      px.moveTo(rx, ry);
      for (let a = 0; a < 7; a++) {
        const rad = 1 + Math.random() * 7;
        px.lineTo(rx + Math.cos(a) * rad * 1.6, ry + Math.sin(a) * rad);
      }
      px.fill();
    }
    px.strokeStyle = "#4a4e52";
    px.lineWidth = 4;
    px.strokeRect(px0, py0, pw0, ph0);
  }
  const padTex = new THREE.CanvasTexture(padCanvas);
  padTex.colorSpace = THREE.SRGBColorSpace;
  padTex.anisotropy = 8;

  const chevCanvas = makeCanvas(256, 512);
  const cx = chevCanvas.getContext("2d")!;
  cx.clearRect(0, 0, 256, 512);
  const chevCols = ["#39ff4a", "#ff4a1f", "#39ff4a", "#ff4a1f"];
  chevCols.forEach((col, k) => {
    const y = 60 + k * 100;
    cx.save();
    cx.shadowColor = col;
    cx.shadowBlur = 26;
    cx.fillStyle = col;
    cx.strokeStyle = "#fff7c2";
    cx.lineWidth = 7;
    cx.beginPath();
    cx.moveTo(28, y + 70);
    cx.lineTo(128, y);
    cx.lineTo(228, y + 70);
    cx.lineTo(228, y + 100);
    cx.lineTo(128, y + 30);
    cx.lineTo(28, y + 100);
    cx.closePath();
    cx.fill();
    cx.stroke();
    cx.restore();
  });
  const chevTex = new THREE.CanvasTexture(chevCanvas);
  chevTex.colorSpace = THREE.SRGBColorSpace;

  const sparkCanvas = makeCanvas(64, 64);
  const sxContext = sparkCanvas.getContext("2d")!;
  const spkGrad = sxContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  spkGrad.addColorStop(0, "rgba(255,255,255,1)");
  spkGrad.addColorStop(0.25, "rgba(255,255,255,.8)");
  spkGrad.addColorStop(1, "rgba(255,255,255,0)");
  sxContext.fillStyle = spkGrad;
  sxContext.fillRect(0, 0, 64, 64);
  const sparkTex = new THREE.CanvasTexture(sparkCanvas);

  const pads: {
    chev: THREE.Mesh;
    lights: THREE.Mesh[];
    sparks: THREE.Points;
    vel: { life: number; x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number }[];
  }[] = [];

  const makePad = (best: number, lane: number, PW: number) => {
    const padG = new THREE.Group();
    padG.position.copy(xsPt(best, lane, 0.1));
    padG.lookAt(xsPt((best + 2) % N, lane, 0.1));
    group.add(padG);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(PW, 0.14, PW), [
      mat(0x5f6368),
      mat(0x5f6368),
      new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.55, metalness: 0.45 }),
      mat(0x5f6368),
      mat(0x5f6368),
      mat(0x5f6368),
    ]);
    slab.position.y = 0.07;
    slab.rotation.y = Math.PI;
    slab.receiveShadow = true;
    padG.add(slab);

    const chev = new THREE.Mesh(
      new THREE.PlaneGeometry(PW * 0.23, PW * 0.8).rotateX(-Math.PI / 2).rotateY(Math.PI),
      new THREE.MeshBasicMaterial({ map: chevTex, transparent: true, depthWrite: false, toneMapped: false })
    );
    chev.position.y = 0.155;
    padG.add(chev);

    const lights: THREE.Mesh[] = [];
    [
      [-1, -1, 0xff2b1a],
      [1, -1, 0x2bff3a],
      [-1, 1, 0xff2b1a],
      [1, 1, 0x2bff3a],
    ].forEach(([sx, sz, cHex]) => {
      const lMesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshBasicMaterial({ color: cHex, toneMapped: false }));
      lMesh.position.set(sx * PW * 0.44, 0.17, sz * PW * 0.44);
      padG.add(lMesh);
      lights.push(lMesh);
    });

    const NS = 50;
    const sp = new Float32Array(NS * 3);
    const sc = new Float32Array(NS * 3);
    const vel: { life: number; x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number }[] = [];
    const pal = [
      [1, 0.75, 0.25],
      [0.3, 1, 0.35],
      [1, 0.35, 0.2],
      [1, 0.95, 0.6],
      [0.8, 0.4, 1],
    ];
    for (let s = 0; s < NS; s++) {
      vel.push({ life: Math.random() });
      const cc = pal[s % pal.length];
      sc.set(cc, s * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    sg.setAttribute("color", new THREE.BufferAttribute(sc, 3));
    const sparks = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        size: 0.32,
        map: sparkTex,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    padG.add(sparks);
    pads.push({ chev, lights, sparks, vel });
  };

  const NP = 8;
  for (let k = 0; k < NP; k++) {
    const c0 = Math.round(((k + 0.5) * N) / NP) % N;
    const s = track.cum[c0];
    if (inTunnel(s, 10) || inJump(s, 25)) continue;
    makePad(c0, k % 2 === 0 ? CAR_OFF : -CAR_OFF, PAD);
  }

  desertAnimationState.padsUpdate = (dt: number, now: number) => {
    const tTime = now * 0.001;
    for (const pd of pads) {
      (pd.chev.material as THREE.MeshBasicMaterial).opacity = 0.75 + 0.25 * Math.sin(tTime * 9);
      pd.lights.forEach((l, k) => (l.visible = Math.sin(tTime * 6 + k * 1.6) > -0.3));
      const posAttr = pd.sparks.geometry.attributes.position as THREE.BufferAttribute;
      pd.vel.forEach((v, s) => {
        v.life += dt * (0.8 + ((s * 37) % 10) / 10);
        if (v.life >= 1) {
          v.life -= 1;
          v.x = (Math.random() - 0.5) * PAD * 0.25;
          v.z = (Math.random() - 0.5) * PAD * 0.7;
          v.vx = (Math.random() - 0.5) * 3;
          v.vz = (Math.random() - 0.5) * 3;
          v.vy = 2 + Math.random() * 4;
        }
        const a = v.life;
        posAttr.setXYZ(s, (v.x || 0) + (v.vx || 0) * a, 0.2 + (v.vy || 0) * a - 4.9 * a * a * 0.6, (v.z || 0) + (v.vz || 0) * a);
      });
      posAttr.needsUpdate = true;
    }
  };

  // 2. Redemoinhos de Areia (Dust Devils)
  const dvU = { uT: { value: 0 } };
  const coneM = new THREE.ShaderMaterial({
    uniforms: dvU,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: "varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader:
      "uniform float uT;varying vec2 vU;void main(){float a=vU.x*6.2832,y=vU.y;float b=0.5+0.5*sin(a*3.0+y*9.0-uT*7.0);float b2=0.5+0.5*sin(a*5.0-y*14.0-uT*9.5);" +
      "float al=(0.18+0.5*b*b+0.2*b2)*smoothstep(0.0,0.12,y)*(1.0-smoothstep(0.6,1.0,y))*0.75;gl_FragColor=vec4(mix(vec3(0.62,0.42,0.24),vec3(0.9,0.72,0.48),b2),al);}",
  });

  const devils: {
    i: number;
    g: THREE.Group;
    ring: THREE.Mesh;
    pr: { h: number; a: number; w: number; v: number; j: number }[];
    pos: Float32Array;
    pg: THREE.BufferGeometry;
    Hd: number;
    W: number;
    ph: number;
    sp: number;
    lat: number;
  }[] = [];

  const ND = 5;
  const KP = 120;
  for (let k = 0; k < ND; k++) {
    const c0 = Math.round(((k + 0.5) * N) / ND) % N;
    const s = track.cum[c0];
    if (inTunnel(s, 40) || inJump(s, 40)) continue;

    const Hd = 9 + Math.random() * 6;
    const dG = new THREE.Group();
    group.add(dG);

    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.35 + Hd * 0.3, 0.35, Hd, 24, 8, true), coneM);
    cone.position.y = Hd / 2;
    dG.add(cone);

    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xd9a566, transparent: true, depthWrite: false, opacity: 0.6 })
    );
    ring.position.y = 0.25;
    dG.add(ring);

    const pos = new Float32Array(KP * 3);
    const col = new Float32Array(KP * 3);
    const pr: { h: number; a: number; w: number; v: number; j: number }[] = [];
    for (let q = 0; q < KP; q++) {
      const sh = 0.75 + Math.random() * 0.3;
      col[q * 3] = 0.78 * sh;
      col[q * 3 + 1] = 0.56 * sh;
      col[q * 3 + 2] = 0.34 * sh;
      pr.push({ h: Math.random() * Hd, a: Math.random() * 6.283, w: 3 + Math.random() * 3, v: 1.5 + Math.random() * 2.5, j: Math.random() * 0.6 });
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    pg.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const ptsMesh = new THREE.Points(
      pg,
      new THREE.PointsMaterial({ size: 0.85, map: sparkTex, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false })
    );
    ptsMesh.frustumCulled = false;
    dG.add(ptsMesh);

    devils.push({
      i: c0,
      g: dG,
      ring,
      pr,
      pos,
      pg,
      Hd,
      W: ROAD / 2 - 2.2,
      ph: Math.random() * 6.283,
      sp: 0.35 + Math.random() * 0.25,
      lat: 0,
    });
  }

  const tmpVec = new THREE.Vector3();
  desertAnimationState.devilUpdate = (dt: number, now: number) => {
    const tTime = now * 0.001;
    dvU.uT.value = tTime;
    for (const d of devils) {
      d.lat = d.W * Math.sin(tTime * d.sp + d.ph);
      const fw = 0.9 * Math.sin(tTime * 0.7 + d.ph * 2);
      const p = xsPt(d.i, d.lat, 0);
      const tt = tan[d.i];
      d.g.position.set(p.x + tt.x * fw, p.y, p.z + tt.y * fw);
      d.ring.rotation.y = -tTime * 3;
      for (let q = 0; q < d.pr.length; q++) {
        const rItem = d.pr[q];
        rItem.h += rItem.v * dt;
        if (rItem.h > d.Hd) {
          rItem.h = 0;
          rItem.a = Math.random() * 6.283;
        }
        const rad = 0.35 + rItem.h * 0.3 + rItem.j;
        rItem.a += rItem.w * dt * (1.4 - (rItem.h / d.Hd) * 0.6);
        const sway = 0.5 * Math.sin(tTime * 1.3 + rItem.h * 0.35 + d.ph);
        d.pos[q * 3] = Math.cos(rItem.a) * rad + sway;
        d.pos[q * 3 + 1] = rItem.h;
        d.pos[q * 3 + 2] = Math.sin(rItem.a) * rad;
      }
      d.pg.attributes.position.needsUpdate = true;
    }
  };

  // 3. Urubus Planando em Círculos
  const NF = 4;
  const NB = 4;
  const FAR = 38;
  const plum = mat(0x2a2220, { roughness: 0.85 });
  const skin = mat(0xc0413a, { roughness: 0.6 });
  const boneMat = mat(0xe8dcc0, { roughness: 0.6 });
  const wingM = new THREE.MeshStandardMaterial({ color: 0x2a2220, roughness: 0.85, side: THREE.DoubleSide });

  const bird = () => {
    const bG = new THREE.Group();
    bG.add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8).scale(1, 0.85, 2.0), plum));
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), skin);
    hd.position.set(0, 0.14, 0.8);
    bG.add(hd);
    const bk = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 6).rotateX(Math.PI / 2), boneMat);
    bk.position.set(0, 0.1, 0.98);
    bG.add(bk);

    const wings: THREE.Group[] = [];
    const wShape = new THREE.Shape();
    wShape.moveTo(0, 0.3);
    wShape.lineTo(0.7, 0.34);
    wShape.lineTo(1.5, 0.26);
    wShape.lineTo(1.85, -0.12);
    wShape.lineTo(1.2, -0.3);
    wShape.lineTo(0, -0.3);
    wShape.closePath();
    const wingGeo = new THREE.ShapeGeometry(wShape).rotateX(-Math.PI / 2);

    for (const sg of [-1, 1]) {
      const pv = new THREE.Group();
      pv.position.set(sg * 0.22, 0.1, 0.05);
      const wMesh = new THREE.Mesh(wingGeo, wingM);
      wMesh.scale.x = sg;
      pv.add(wMesh);
      bG.add(pv);
      wings.push(pv);
    }
    group.add(bG);
    return { g: bG, wings };
  };

  const flocks: {
    i: number;
    birds: { g: THREE.Group; wings: THREE.Group[]; al: number; ring: number; dy: number; ph: number }[];
    side: number;
    t: number;
  }[] = [];

  for (let k = 0; k < NF; k++) {
    const c = Math.round(((k + 0.5) * N) / NF) % N;
    const s = track.cum[c];
    if (inTunnel(s, 30) || inJump(s, 30)) continue;
    const birdsList: { g: THREE.Group; wings: THREE.Group[]; al: number; ring: number; dy: number; ph: number }[] = [];
    for (let b = 0; b < NB; b++) {
      const o = bird();
      birdsList.push({
        ...o,
        al: (b % 2 ? 1 : -1) * Math.ceil(b / 2) * 2.4,
        ring: Math.random() * 6.28,
        dy: (Math.random() - 0.5) * 1.2,
        ph: Math.random() * 6.28,
      });
    }
    flocks.push({ i: c, birds: birdsList, side: Math.random() < 0.5 ? -1 : 1, t: Math.random() * 20 });
  }

  const P0 = new THREE.Vector3();
  const fwVec = new THREE.Vector3();
  desertAnimationState.birdsUpdate = (dt: number, now: number) => {
    const tt = now * 0.001;
    for (const f of flocks) {
      f.t += dt;
      const c = pts[f.i];
      const tn = tan[f.i];
      const nxVal = -tn.y;
      const nzVal = tn.x;
      const base = track.heights?.[f.i] ?? heightAt(track, track.cum[f.i]);
      for (const b of f.birds) {
        const a = f.t * 0.35 + b.ring;
        const R = 7 + b.al * 0.4;
        const ls = f.side * FAR + R * Math.cos(a);
        const la = R * Math.sin(a);
        const y = 13 + b.dy * 3 + Math.abs(b.al) * 0.6;
        P0.set(c.x + nxVal * ls + tn.x * la, base + y, c.z + nzVal * ls + tn.y * la);
        b.g.position.copy(P0);
        fwVec.set(-Math.sin(a) * nxVal + Math.cos(a) * tn.x, 0, -Math.sin(a) * nzVal + Math.cos(a) * tn.y);
        b.g.lookAt(tmpVec.copy(P0).add(fwVec));
        b.g.rotateZ(-0.35);
        const an = 0.1 + Math.sin(tt * 1.2 + b.ph) * 0.05;
        b.wings[0].rotation.z = an;
        b.wings[1].rotation.z = -an;
      }
    }
  };

  return group;
}

/** Executa todas as atualizações de animação viva do cenário oficial do deserto */
export function updateDesert(dt: number, now: number): void {
  desertAnimationState.pulseU.uT.value = now * 0.001;
  if (desertAnimationState.mudUpdate) desertAnimationState.mudUpdate(dt, now);
  if (desertAnimationState.devilUpdate) desertAnimationState.devilUpdate(dt, now);
  if (desertAnimationState.birdsUpdate) desertAnimationState.birdsUpdate(dt, now, 0, 0);
  if (desertAnimationState.padsUpdate) desertAnimationState.padsUpdate(dt, now);
}
