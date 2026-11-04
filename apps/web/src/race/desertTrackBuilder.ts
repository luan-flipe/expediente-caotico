import * as THREE from "three";
import { heightAt, pointAt, progressOf, sideNormal, type Track } from "@ec/shared";
import {
  desertGroundHeight,
  DESERT_SCALE,
  MH,
  MW,
  natural,
} from "./desertHeightmap";
import desertoJpgUrl from "../assets/itens/deserto.jpg";
import arquibancadaGlbUrl from "../assets/itens/arquibancada.glb?url";
import { createGltfLoader } from "../game/gltfLoader";

/**
 * Construtor completo do cenário oficial da Pista do Deserto.
 * Portado diretamente de assets-src/pistas/3-pista-deserto/index.html com fidelidade total:
 * - Terreno 3D texturizado com 'deserto.jpg', dunas e serras
 * - Maciço rochoso monumental sobre o túnel saca-rolhas
 * - Céu desértico com sol baixo, gradiente quente e névoa de areia
 * - Muretas de concreto com listras alternadas vermelhas e cinzas
 * - Vilarejos de adobe com vigas de madeira, portas, janelas azul-turquesa, varandas e vasos
 * - Caveiras de boi com chifres longos na areia e em postes com travessas
 * - Vegetação oficial instanciada (saguaros de múltiplos braços, cactos-bola com flores, palmas, capim dourado, rochas e arbustos secos)
 * - Cânion do salto com paredões rochosos e barreiras zebradas amarelas/pretas
 * - Poço de lama viscosa borbulhante no fundo do abismo
 * - Arquibancadas de torcedores viradas para a pista
 */

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

/** Céu quente do deserto com sol baixo e névoa de areia */
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
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), m);
  sky.renderOrder = -1;
  scene.add(sky);
  return sky;
}

/** Terreno com a imagem fotográfica 'deserto.jpg' mapeada e elevações naturais de dunas e cânion */
export function buildDesertTerrain(track: Track, desertoTex: THREE.Texture): THREE.Mesh {
  const w = MW * 1.9 * DESERT_SCALE;
  const h = MH * 1.9 * DESERT_SCALE;
  const tg = new THREE.PlaneGeometry(w, h, 280, 210);
  tg.rotateX(-Math.PI / 2);
  const P = tg.attributes.position;
  const UV = tg.attributes.uv;

  const gap = track.ramps.find((r) => r.path === -1 && r.gap)?.gap;
  const sStartTun = track.corkscrew?.sStart ?? track.ctrlS[14] ?? -1;
  const sEndTun = track.corkscrew?.sEnd ?? track.ctrlS[20] ?? -1;

  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i);
    const z = P.getZ(i);
    const ux = x / DESERT_SCALE;
    const uz = z / DESERT_SCALE;

    const pr = progressOf(track, { x, z });
    const unscaledDist = pr.dist / DESERT_SCALE;
    const roadY = heightAt(track, pr.s) / DESERT_SCALE;
    const inTun = sStartTun >= 0 && sEndTun >= 0 && pr.s >= sStartTun - 2 && pr.s <= sEndTun + 2;

    let canyonFactor = 0;
    if (gap) {
      const midGap = (gap.sFrom + gap.sTo) / 2;
      const dS = Math.abs(pr.s - midGap);
      const gapSpan = (gap.sTo - gap.sFrom) / 2;
      const sm = (v: number) => {
        const t = Math.max(0, Math.min(1, v));
        return t * t * (3 - 2 * t);
      };
      canyonFactor = (1 - sm((dS - gapSpan - 1) / 12)) * (1 - sm((pr.dist - 14) / 18));
    }

    const groundH = desertGroundHeight(ux, uz, unscaledDist, roadY, inTun, canyonFactor);
    P.setY(i, groundH * DESERT_SCALE);
    UV.setXY(i, ux / MW + 0.5, 1 - (uz / MH + 0.5));
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

/** Maciço rochoso irregular com picos cobrindo a curva do túnel saca-rolhas */
export function buildDesertTunnelMountain(track: Track, desertoTex: THREE.Texture): THREE.Mesh | null {
  const sStart = track.corkscrew?.sStart ?? track.ctrlS[14];
  const sEnd = track.corkscrew?.sEnd ?? track.ctrlS[20];
  if (sStart === undefined || sEnd === undefined) return null;

  const len = sEnd - sStart;
  const numSteps = Math.ceil(len / 1.5);
  const NO = 36;
  const Wo = 36;
  const TR = 14 * DESERT_SCALE;
  const TAX = 9.4 * DESERT_SCALE;
  const R2 = TR + 2.8 * DESERT_SCALE;

  const outerP: number[] = [];
  const outerUV: number[] = [];

  for (let k = 0; k <= numSteps; k++) {
    const s = sStart + (len * k) / numSteps;
    const at = pointAt(track, s);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    const baseY = heightAt(track, s);
    const ax = baseY + TAX;

    for (let a = 0; a <= NO; a++) {
      const u = a / NO;
      const lat = -Wo + 2 * Wo * u;
      const absLat = Math.abs(lat);
      const roof = absLat <= R2 ? ax + Math.sqrt(Math.max(0, R2 * R2 - absLat * absLat)) : ax - (absLat - R2) * 1.1;

      const px = at.pos.x + nrm.x * lat;
      const pz = at.pos.z + nrm.z * lat;
      const ux = px / DESERT_SCALE;
      const uz = pz / DESERT_SCALE;
      const natH = natural(ux, uz) * DESERT_SCALE;
      const py = Math.max(natH - 0.15, roof);

      outerP.push(px, py, pz);
      outerUV.push(ux / MW + 0.5, 1 - (uz / MH + 0.5));
    }
  }

  const indices: number[] = [];
  for (let k = 0; k < numSteps; k++) {
    for (let a = 0; a < NO; a++) {
      const q = k * (NO + 1) + a;
      const r = q + NO + 1;
      indices.push(q, r, q + 1, q + 1, r, r + 1);
    }
  }

  const gOut = new THREE.BufferGeometry();
  gOut.setAttribute("position", new THREE.Float32BufferAttribute(outerP, 3));
  gOut.setAttribute("uv", new THREE.Float32BufferAttribute(outerUV, 2));
  gOut.setIndex(indices);
  gOut.computeVertexNormals();

  const hill = new THREE.Mesh(
    gOut,
    new THREE.MeshStandardMaterial({
      map: desertoTex,
      roughness: 1,
      side: THREE.DoubleSide,
    })
  );
  hill.castShadow = true;
  hill.receiveShadow = true;
  return hill;
}

/** Mureta de concreto nas duas bordas da pista com topo listrado em vermelho e cinza */
export function buildDesertWalls(track: Track): THREE.Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const red = new THREE.Color(0xc8372d);
  const gray = new THREE.Color(0xd9d4ca);

  const numPoints = track.points.length;
  const WALL_W = 0.5;
  const WALL_H = 1.0;
  const gap = track.ramps.find((r) => r.path === -1 && r.gap)?.gap;
  const inGap = (s: number) => gap && s >= gap.sFrom - 0.5 && s <= gap.sTo + 0.5;

  let vCount = 0;
  for (const sideSign of [-1, 1]) {
    for (let i = 0; i < numPoints; i++) {
      const s = track.cum[i];
      if (inGap(s)) continue;
      const nextI = (i + 1) % numPoints;
      const nextS = track.cum[nextI];
      if (inGap(nextS)) continue;

      const atA = pointAt(track, s);
      const nrmA = sideNormal(Math.sin(atA.heading), Math.cos(atA.heading));
      const byA = heightAt(track, s);
      const offA = (atA.halfWidth + 0.2 + WALL_W / 2) * sideSign;

      const atB = pointAt(track, nextS);
      const nrmB = sideNormal(Math.sin(atB.heading), Math.cos(atB.heading));
      const byB = heightAt(track, nextS);
      const offB = (atB.halfWidth + 0.2 + WALL_W / 2) * sideSign;

      const A1 = { x: atA.pos.x + nrmA.x * (offA - WALL_W / 2), y: byA + WALL_H, z: atA.pos.z + nrmA.z * (offA - WALL_W / 2) };
      const B1 = { x: atA.pos.x + nrmA.x * (offA + WALL_W / 2), y: byA + WALL_H, z: atA.pos.z + nrmA.z * (offA + WALL_W / 2) };

      const NA1 = { x: atB.pos.x + nrmB.x * (offB - WALL_W / 2), y: byB + WALL_H, z: atB.pos.z + nrmB.z * (offB - WALL_W / 2) };
      const NB1 = { x: atB.pos.x + nrmB.x * (offB + WALL_W / 2), y: byB + WALL_H, z: atB.pos.z + nrmB.z * (offB + WALL_W / 2) };

      const stripe = Math.floor(i / 5) % 2 === 0 ? red : gray;

      // Top face
      const o = vCount;
      [A1, NA1, NB1, B1].forEach((p) => {
        pos.push(p.x, p.y, p.z);
        col.push(stripe.r, stripe.g, stripe.b);
      });
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
      vCount += 4;

      // Inside face
      const inPtA = sideSign > 0 ? A1 : B1;
      const inPtA0 = { x: inPtA.x, y: byA - 0.35, z: inPtA.z };
      const inPtB = sideSign > 0 ? NA1 : NB1;
      const inPtB0 = { x: inPtB.x, y: byB - 0.35, z: inPtB.z };

      const oIn = vCount;
      [inPtA, inPtB, inPtB0, inPtA0].forEach((p) => {
        pos.push(p.x, p.y, p.z);
        col.push(gray.r, gray.g, gray.b);
      });
      idx.push(oIn, oIn + 1, oIn + 2, oIn, oIn + 2, oIn + 3);
      vCount += 4;
    }
  }

  const bg = new THREE.BufferGeometry();
  bg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  bg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  bg.setIndex(idx);
  bg.computeVertexNormals();

  const mesh = new THREE.Mesh(
    bg,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      side: THREE.DoubleSide,
    })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Cânion do salto: corpo das rampas até o fundo e barreiras zebradas de perigo */
export function buildDesertCanyonRampBody(track: Track): THREE.Group {
  const group = new THREE.Group();
  const gap = track.ramps.find((r) => r.path === -1 && r.gap)?.gap;
  if (!gap) return group;

  const at0 = pointAt(track, gap.sFrom);
  const by0 = heightAt(track, gap.sFrom);
  const at1 = pointAt(track, gap.sTo);
  const by1 = heightAt(track, gap.sTo);

  // Barreira zebrada de perigo na borda do abismo
  let hzt: THREE.Texture;
  if (typeof document === "undefined") {
    const data = new Uint8Array([242, 194, 27, 255]);
    hzt = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  } else {
    const hzc = document.createElement("canvas");
    hzc.width = 128;
    hzc.height = 16;
    const hx = hzc.getContext("2d");
    if (hx) {
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
    }
    const ct = new THREE.CanvasTexture(hzc);
    ct.wrapS = THREE.RepeatWrapping;
    ct.repeat.set(3, 1);
    ct.colorSpace = THREE.SRGBColorSpace;
    hzt = ct;
  }

  const barMat = new THREE.MeshStandardMaterial({ map: hzt, roughness: 0.6 });

  for (const [at, by] of [[at0, by0], [at1, by1]] as const) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(at.halfWidth * 2 + 1.2, 0.9, 0.35), barMat);
    bar.position.set(at.pos.x, by + 0.45, at.pos.z);
    bar.rotation.y = at.heading + Math.PI / 2;
    bar.castShadow = true;
    group.add(bar);

    // Paredão vertical descendo até o fundo do abismo
    const wallGeo = new THREE.BoxGeometry(at.halfWidth * 2 + 2.0, 12.0, 0.5);
    const wallMesh = new THREE.Mesh(
      wallGeo,
      new THREE.MeshStandardMaterial({
        color: "#6b4530",
        roughness: 0.95,
        flatShading: true,
      })
    );
    wallMesh.position.set(at.pos.x, by - 5.5, at.pos.z);
    wallMesh.rotation.y = at.heading + Math.PI / 2;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    group.add(wallMesh);
  }

  return group;
}

/** Poço de lama viscosa no fundo do cânion com bolhas */
export function buildDesertMudPool(track: Track): THREE.Group {
  const group = new THREE.Group();
  const gap = track.ramps.find((r) => r.path === -1 && r.gap)?.gap;
  if (!gap) return group;

  const midS = (gap.sFrom + gap.sTo) / 2;
  const at = pointAt(track, midS);
  const bottomY = heightAt(track, midS) - 9.5;

  const mudGeo = new THREE.PlaneGeometry(75, 45, 1, 1);
  mudGeo.rotateX(-Math.PI / 2);
  const mudMat = new THREE.MeshStandardMaterial({
    color: "#3d2817",
    roughness: 0.2,
    metalness: 0.15,
  });
  const mudMesh = new THREE.Mesh(mudGeo, mudMat);
  mudMesh.position.set(at.pos.x, bottomY, at.pos.z);
  mudMesh.rotation.y = at.heading;
  mudMesh.receiveShadow = true;
  group.add(mudMesh);

  // Bolhas viscosas no poço de lama
  const bubGeo = new THREE.SphereGeometry(0.8, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const bubMat = new THREE.MeshStandardMaterial({
    color: "#4a3320",
    roughness: 0.25,
    metalness: 0.1,
  });
  const NB = 14;
  for (let i = 0; i < NB; i++) {
    const r = 0.4 + ((i * 13) % 7) * 0.12;
    const bMesh = new THREE.Mesh(bubGeo, bubMat);
    const ox = ((i * 17) % 30) - 15;
    const oz = ((i * 23) % 20) - 10;
    bMesh.position.set(at.pos.x + ox, bottomY - 0.05, at.pos.z + oz);
    bMesh.scale.set(r, r * 0.8, r);
    group.add(bMesh);
  }

  return group;
}

/**
 * Vilarejos de Adobe detalhados e Caveiras de Boi com chifres longos.
 * Fiel à função house() e skulls de 3-pista-deserto/index.html.
 */
export function buildDesertHousesAndSkulls(track: Track): THREE.Group {
  const group = new THREE.Group();
  let sd = 303;
  const r = () => {
    sd = (sd * 16807) % 2147483647;
    return sd / 2147483647;
  };

  const walls = [0xba7850, 0xc4683e, 0xcf8636, 0xc9775f, 0xb9925c, 0xe6dccb, 0x6b98bd, 0x7fb08f, 0xd9ab3a, 0xa8524a, 0xd88f70];
  const trims = [0x2f7f95, 0x2a9d8f, 0xc0392b, 0x6a4c93, 0x2f5f8a, 0xd98c1f];
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.2, metalness: 0.3 });
  const clay = new THREE.MeshStandardMaterial({ color: 0xb5603a, roughness: 0.8 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xece3cc, roughness: 0.8 });
  const horn = new THREE.MeshStandardMaterial({ color: 0xcbb98f, roughness: 0.6 });

  const wallM: Record<number, THREE.MeshStandardMaterial> = {};
  const trimM: Record<number, THREE.MeshStandardMaterial> = {};
  const wm = (c: number) => wallM[c] || (wallM[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
  const tm = (c: number) => trimM[c] || (trimM[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));

  const house = (x: number, z: number, lo: number, facingHeading: number) => {
    const w = 5.5 + r() * 3.0;
    const d = 4.5 + r() * 2.0;
    const h = 2.8 + r() * 0.7;
    const col = walls[(r() * walls.length) | 0]!;
    const trim = trims[(r() * trims.length) | 0]!;

    const g = new THREE.Group();
    g.position.set(x, lo, z);
    g.rotation.y = facingHeading;

    const add = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(px, py, pz);
      o.castShadow = true;
      o.receiveShadow = true;
      g.add(o);
      return o;
    };

    const W = wm(col);
    const base = 2.0;
    add(new THREE.BoxGeometry(w, h + base, d), W, 0, (h - base) / 2, 0);
    add(new THREE.BoxGeometry(w + 0.3, 0.3, d + 0.3), W, 0, h + 0.05, 0); // parapeito

    // Vigas de madeira salientes
    for (let k = 0; k < 5; k++) {
      const v = add(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6), wood, -w / 2 + 0.7 + (k * (w - 1.4)) / 4, h - 0.3, d / 2 + 0.22);
      v.rotation.x = Math.PI / 2;
    }

    // Porta e moldura
    add(new THREE.BoxGeometry(1.0, 1.9, 0.12), dark, -w * 0.18, 0.95, d / 2 + 0.03);
    add(new THREE.BoxGeometry(1.3, 0.16, 0.16), tm(trim), -w * 0.18, 2.0, d / 2 + 0.07);

    // Janelas de vidro com molduras coloridas
    for (const wx of [w * 0.22, w * 0.38]) {
      if (wx + 0.5 > w / 2) continue;
      add(new THREE.BoxGeometry(0.85, 0.85, 0.1), glass, wx, 1.5, d / 2 + 0.03);
      add(new THREE.BoxGeometry(1.05, 1.05, 0.06), tm(trim), wx, 1.5, d / 2 + 0.01);
    }

    // Segundo andar em 50% das casas
    if (r() < 0.5) {
      const w2 = w * 0.5;
      const d2 = d * 0.6;
      const h2 = 2.2;
      const sx = (r() < 0.5 ? -1 : 1) * (w - w2) / 2;
      add(new THREE.BoxGeometry(w2, h2, d2), W, sx, h + h2 / 2, -(d - d2) / 2);
      add(new THREE.BoxGeometry(w2 + 0.25, 0.25, d2 + 0.25), W, sx, h + h2, -(d - d2) / 2);
      add(new THREE.BoxGeometry(0.7, 0.7, 0.1), glass, sx, h + 1.2, -(d - d2) / 2 + d2 / 2 + 0.03);
    }

    // Varanda rústica (ramada)
    if (r() < 0.55) {
      const pw = w * 0.75;
      const pd = 2.0;
      for (const px of [-pw / 2 + 0.2, pw / 2 - 0.2]) {
        add(new THREE.CylinderGeometry(0.12, 0.13, 2.4, 7), wood, px, 1.2, d / 2 + pd);
      }
      add(new THREE.BoxGeometry(pw, 0.16, pd + 0.25), wood, 0, 2.45, d / 2 + pd / 2);
    }

    // Vasos de barro
    if (r() < 0.6) {
      for (let k = 0; k < 1 + ((r() * 3) | 0); k++) {
        add(new THREE.SphereGeometry(0.28, 8, 6).scale(1, 1.15, 1), clay, w * 0.05 + k * 0.65, 0.28, d / 2 + 0.55);
      }
    }

    // Caveira de boi no poste em frente a algumas casas
    if (r() < 0.45) {
      const postX = w / 2 + 0.8;
      const postZ = d / 2 + 1.2;
      add(new THREE.CylinderGeometry(0.1, 0.12, 2.2, 7), wood, postX, 1.1, postZ);
      add(new THREE.BoxGeometry(0.8, 0.1, 0.1), wood, postX, 1.5, postZ);

      // Crânio com chifres curvados
      add(new THREE.SphereGeometry(0.18, 8, 6).scale(1.15, 0.8, 1), bone, postX, 1.5, postZ + 0.15);
      for (const sg of [-1, 1]) {
        const c1 = new THREE.CatmullRomCurve3(
          [[0.18, 0.22, -0.02], [0.38, 0.25, -0.05], [0.55, 0.32, -0.03]].map(
            ([cx, cy, cz]) => new THREE.Vector3(sg * cx, cy, cz)
          )
        );
        const tube = new THREE.Mesh(new THREE.TubeGeometry(c1, 6, 0.045, 6, false), horn);
        tube.position.set(postX, 1.5, postZ + 0.15);
        g.add(tube);
      }
    }

    group.add(g);
  };

  // 1. Vilarejos e casas ao longo da pista (setor do vilarejo de adobe e retas)
  for (let s = 15; s < track.length - 15; s += 28) {
    const at = pointAt(track, s);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    const baseY = heightAt(track, s);

    for (const side of [-1, 1]) {
      if (r() < 0.35) continue;
      const dist = at.halfWidth + 6.0 + r() * 5.0;
      const hx = at.pos.x + nrm.x * dist * side;
      const hz = at.pos.z + nrm.z * dist * side;
      const faceAngle = Math.atan2(at.pos.x - hx, at.pos.z - hz);
      house(hx, hz, baseY - 0.1, faceAngle);
    }
  }

  // 2. Caveiras de boi espalhadas no chão na beira do deserto
  const numSkulls = 24;
  for (let i = 0; i < numSkulls; i++) {
    const s = 10 + r() * (track.length - 20);
    const at = pointAt(track, s);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    const baseY = heightAt(track, s);
    const side = r() < 0.5 ? -1 : 1;
    const dist = at.halfWidth + 2.5 + r() * 6.0;
    const sx = at.pos.x + nrm.x * dist * side;
    const sz = at.pos.z + nrm.z * dist * side;

    const skG = new THREE.Group();
    skG.position.set(sx, baseY + 0.05, sz);
    skG.rotation.y = r() * Math.PI * 2;
    const sc = 1.0 + r() * 0.4;
    skG.scale.set(sc, sc, sc);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6).scale(1.15, 0.8, 1), bone);
    skG.add(skull);

    for (const sg of [-1, 1]) {
      const c1 = new THREE.CatmullRomCurve3(
        [[0.18, 0.22, -0.02], [0.4, 0.26, -0.05], [0.6, 0.34, -0.03]].map(
          ([cx, cy, cz]) => new THREE.Vector3(sg * cx, cy, cz)
        )
      );
      const tube = new THREE.Mesh(new THREE.TubeGeometry(c1, 6, 0.045, 6, false), horn);
      skG.add(tube);
    }
    group.add(skG);
  }

  return group;
}

/**
 * Vegetação Oficial Orgânica via InstancedMesh.
 * Geometrias exatas de 3-pista-deserto/index.html:
 * sag1 (2 braços com copas arredondadas), sag2 (1 braço), barrel (cacto-bola),
 * flower (flores 5-pétalas), pear (palmas) e grass (tufos de capim).
 */
export function buildDesertVegetationOfficial(track: Track): THREE.Group {
  const group = new THREE.Group();

  const merge = (list: THREE.BufferGeometry[]) => {
    let n = 0;
    const gs = list.map((g) => {
      const nonIdx = g.index ? g.toNonIndexed() : g.clone();
      n += nonIdx.attributes.position.count;
      return nonIdx;
    });
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    let o = 0;
    gs.forEach((g) => {
      if (!g.attributes.normal) g.computeVertexNormals();
      pos.set(g.attributes.position.array, o);
      nor.set(g.attributes.normal.array, o);
      o += g.attributes.position.array.length;
      g.dispose();
    });
    const m = new THREE.BufferGeometry();
    m.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    m.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    return m;
  };

  const cyl = (r: number, h: number, x: number, y: number, z: number, rz = 0) => {
    const g = new THREE.CylinderGeometry(r, r * 1.05, h, 10);
    g.translate(0, h / 2, 0);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    return g;
  };

  const cap = (r: number, x: number, y: number, z: number) => {
    const g = new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    g.translate(x, y, z);
    return g;
  };

  // Cacto Saguaro 1: múltiplos braços com domo semiesférico
  const sag1 = merge([
    cyl(0.45, 6, 0, 0, 0),
    cap(0.45, 0, 6, 0),
    cyl(0.3, 1.2, 0.4, 2.6, 0, -Math.PI / 2),
    cyl(0.3, 2, 1.55, 2.6, 0),
    cap(0.3, 1.55, 4.6, 0),
    cyl(0.3, 0.9, -0.4, 3.4, 0, Math.PI / 2),
    cyl(0.3, 1.4, -1.25, 3.4, 0),
    cap(0.3, -1.25, 4.8, 0),
  ]);

  // Cacto Saguaro 2: um braço alto
  const sag2 = merge([
    cyl(0.5, 7, 0, 0, 0),
    cap(0.5, 0, 7, 0),
    cyl(0.32, 1.3, 0.45, 3.2, 0, -Math.PI / 2),
    cyl(0.32, 2.4, 1.7, 3.2, 0),
    cap(0.32, 1.7, 5.6, 0),
  ]);

  // Cacto bola
  const barrel = (() => {
    const g = new THREE.SphereGeometry(0.7, 12, 10);
    g.scale(1, 1.15, 1);
    g.translate(0, 0.6, 0);
    return g;
  })();

  // Flores 5 pétalas coloridas
  const flower = merge(
    [0, 1, 2, 3, 4].map((k) => {
      const g = new THREE.SphereGeometry(0.12, 6, 4);
      g.translate(Math.cos(k * 1.26) * 0.2, 1.38, Math.sin(k * 1.26) * 0.2);
      return g;
    })
  );

  // Palmas / Cacto Orelha-de-padre
  const pear = merge(
    [
      [0, 0.55, 0, 0],
      [0.45, 1.2, 0.1, -0.5],
      [-0.4, 1.15, -0.05, 0.45],
      [0.15, 1.75, 0, -0.15],
    ].map(([px, py, pz, pr]) => {
      const g = new THREE.SphereGeometry(0.55, 10, 8);
      g.scale(1, 1.15, 0.22);
      g.rotateZ(pr!);
      g.translate(px!, py!, pz!);
      return g;
    })
  );

  // Capim do sertão
  const grass = merge(
    [...Array(9).keys()].map((k) => {
      const g = new THREE.ConeGeometry(0.06, 1 + ((k * 37) % 5) * 0.15, 3);
      g.translate(0, 0.5, 0);
      g.rotateZ(0.35 + ((k * 13) % 4) * 0.08);
      g.rotateY(k * 0.7);
      return g;
    })
  );

  const types = [
    { g: sag1, c: 0x2f6b36, n: 120 },
    { g: sag2, c: 0x3d7a42, n: 90 },
    { g: barrel, c: 0x6b8a3e, n: 160 },
    { g: pear, c: 0x346e38, n: 130 },
    { g: grass, c: 0xc9a866, n: 600 },
  ];

  let sd = 21;
  const r = () => {
    sd = (sd * 16807) % 2147483647;
    return sd / 2147483647;
  };

  const dummy = new THREE.Object3D();
  const clr = new THREE.Color();
  const flowerMatrices: THREE.Matrix4[] = [];

  const xs = track.points.map((p) => p.x);
  const zs = track.points.map((p) => p.z);
  const minX = Math.min(...xs) - 25;
  const maxX = Math.max(...xs) + 25;
  const minZ = Math.min(...zs) - 25;
  const maxZ = Math.max(...zs) + 25;

  types.forEach((T, ti) => {
    const mats: [number, number, number][] = [];
    let tries = 0;
    while (mats.length < T.n && tries < T.n * 10) {
      tries++;
      let px = minX + r() * (maxX - minX);
      let pz = minZ + r() * (maxZ - minZ);

      // Agrupamento em touceiras para o capim
      if (ti === 4 && mats.length && r() < 0.6) {
        const q = mats[(r() * mats.length) | 0]!;
        px = q[0] + (r() - 0.5) * 8;
        pz = q[2] + (r() - 0.5) * 8;
      }

      const pr = progressOf(track, { x: px, z: pz });
      if (pr.dist < pr.halfWidth + 2.5) continue;
      const by = heightAt(track, pr.s);
      mats.push([px, by, pz]);
    }

    const im = new THREE.InstancedMesh(
      T.g,
      new THREE.MeshStandardMaterial({
        color: T.c,
        roughness: 0.85,
        flatShading: false,
      }),
      mats.length
    );

    mats.forEach(([px, py, pz], i) => {
      const sc = ti < 2 ? 0.9 + r() * 0.5 : ti === 4 ? 0.7 + r() * 0.5 : 0.8 + r() * 0.4;
      dummy.position.set(px, py - 0.05, pz);
      dummy.rotation.set((r() - 0.5) * 0.08, r() * 6.28, (r() - 0.5) * 0.08);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      im.setColorAt(i, clr.setHex(T.c).offsetHSL((r() - 0.5) * 0.03, (r() - 0.5) * 0.1, (r() - 0.5) * 0.08));

      if (ti === 2 && r() < 0.6) {
        flowerMatrices.push(dummy.matrix.clone());
      }
    });

    im.castShadow = ti < 4;
    im.receiveShadow = true;
    group.add(im);
  });

  // Flores nos cactos-bola (magenta #f06aa0, dourado #f7c23a, laranja #f0884a)
  if (flowerMatrices.length > 0) {
    const flowerMats = [
      new THREE.MeshStandardMaterial({ color: "#f06aa0", roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: "#f7c23a", roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: "#f0884a", roughness: 0.6 }),
    ];
    const buckets: THREE.Matrix4[][] = [[], [], []];
    flowerMatrices.forEach((m, i) => {
      buckets[i % 3].push(m);
    });

    buckets.forEach((mats, idx) => {
      if (mats.length === 0) return;
      const fi = new THREE.InstancedMesh(flower, flowerMats[idx], mats.length);
      mats.forEach((m, i) => {
        fi.setMatrixAt(i, m);
      });
      group.add(fi);
    });
  }

  return group;
}

/** 16 setores de arquibancadas com bases de concreto apoiadas no terreno */
export function buildDesertBleachers(track: Track): Promise<THREE.Group> {
  const group = new THREE.Group();
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(group);
  }

  const baseMat = new THREE.MeshStandardMaterial({ color: 0xb9ad98, roughness: 0.9 });
  const SC = 1.2;
  const AW = 5.16 * SC;
  const SD = 3.12 * SC;

  const sections = 12;
  const stands: { x: number; z: number; y: number; fx: number; fz: number }[] = [];

  for (let s = 0; s < sections; s++) {
    const trackS = (s * track.length) / sections;
    const at = pointAt(track, trackS);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    const baseY = heightAt(track, trackS);

    const side = s % 2 === 0 ? 1 : -1;
    const dist = at.halfWidth + 3.8 + SD * 0.5;
    const sx = at.pos.x + nrm.x * dist * side;
    const sz = at.pos.z + nrm.z * dist * side;

    stands.push({
      x: sx,
      z: sz,
      y: baseY,
      fx: at.pos.x,
      fz: at.pos.z,
    });

    // Base de concreto apoiando a arquibancada
    const bMesh = new THREE.Mesh(new THREE.BoxGeometry(AW * 0.98, 1.2, SD * 0.98), baseMat);
    bMesh.position.set(sx, baseY - 0.6, sz);
    bMesh.lookAt(at.pos.x, baseY - 0.6, at.pos.z);
    bMesh.castShadow = true;
    bMesh.receiveShadow = true;
    group.add(bMesh);
  }

  return createGltfLoader()
    .loadAsync(arquibancadaGlbUrl)
    .then((gltf) => {
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
      return group;
    })
    .catch((err) => {
      console.warn("arquibancada.glb não carregou para o deserto", err);
      return group;
    });
}
