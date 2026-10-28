import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import {
  pointAt,
  progressOf,
  sideNormal,
  TRACK,
  TRACK_ROOMS,
  trackEdges,
  gridSlots,
  RACE,
  type Vec2,
} from "@ec/shared";

/** Cores cartoon sofisticadas com identidade arquitetônica moderna para cada setor da pista */
const ROOM_FLOOR: Record<string, string> = {
  Recepção: "#d48148", // Madeira âmbar / terracota nobre
  Corredor: "#3a7fbe", // Azul clássico de alta velocidade
  "Ilhas de mesas": "#2a5499", // Azul royal corporativo
  Copa: "#e5a72f", // Amarelo damasco aconchegante
  "Sala de reunião": "#8b45be", // Violeta executivo
  TI: "#1c8c65", // Verde esmeralda tech
};

const ROOM_WALL: Record<string, string> = {
  Recepção: "#fff5ea",
  Corredor: "#f0f5fb",
  "Ilhas de mesas": "#e2ecf7",
  Copa: "#fdf8ee",
  "Sala de reunião": "glass",
  TI: "#e6f5ef",
};

const wrap = (i: number, max: number) => ((i % max) + max) % max;

function roomAt(s: number): string {
  const L = TRACK.length;
  const ss = ((s % L) + L) % L;
  let name = TRACK_ROOMS[0].name;
  for (const r of TRACK_ROOMS) if (ss >= TRACK.ctrlS[r.ctrl]) name = r.name;
  return name;
}

/** Placa de sinalização de setor com design gráfico limpo estilo arcade */
function roomSignSprite(text: string, subtitle = "SETOR CORPORATIVO"): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 160;
  const g = c.getContext("2d")!;

  // Moldura externa escura com cantos chanfrados
  g.fillStyle = "#1e2430";
  g.fillRect(0, 0, 512, 160);

  // Placa interna amarela vibrante
  g.fillStyle = "#ffd23f";
  g.fillRect(8, 8, 496, 144);

  // Faixa de cabeçalho sutil
  g.fillStyle = "#1e2430";
  g.font = "800 24px 'Bricolage Grotesque', sans-serif";
  g.textAlign = "center";
  g.letterSpacing = "2px";
  g.fillText(subtitle.toUpperCase(), 256, 42);

  // Título do ambiente em caixa alta de alto impacto
  g.font = "900 52px 'Bricolage Grotesque', sans-serif";
  g.fillText(text.toUpperCase(), 256, 105);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  s.scale.set(4.8, 1.5, 1);
  return s;
}

/** Textura quadriculada preto e branco para linha de chegada e pórticos */
function checkerTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 4; y++) {
      g.fillStyle = (x + y) % 2 ? "#181d24" : "#ffffff";
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Textura procedural de alta definição para a pista de corrida (Mario Kart 8 / Pixar style):
 * - Paginação de placas modulares (running bond / amarração desencontrada)
 * - Variação tonal sutil entre placas adjacentes para leitura geométrica imediata
 * - Rejunte escuro de alto contraste com chanfro/bisel iluminado
 * - Faixas de desgaste de borracha (racing line) onde as rodas passam
 * - Micro-granulação tátil de acabamento epóxi/porcelanato acetinado
 */
function createStylizedTrackTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d")!;

  // 1. Base branca neutra
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 512, 512);

  // 2. Ladrilhos modulares em amarração (2 placas no comprimento U x 4 na largura V)
  const cols = 2;
  const rows = 4;
  const colW = 512 / cols; // 256px
  const rowH = 512 / rows; // 128px

  for (let r = 0; r < rows; r++) {
    const offsetX = r % 2 === 1 ? colW / 2 : 0;
    for (let cIdx = -1; cIdx <= cols + 1; cIdx++) {
      const tileX = cIdx * colW + offsetX;
      const tileY = r * rowH;

      // Alternância de tom entre ladrilhos adjacentes (100% vs 90% claridade)
      const isAlt = (r + Math.floor((tileX + 1024) / colW)) % 2 === 0;
      g.fillStyle = isAlt ? "#f2f4f8" : "#ffffff";
      g.fillRect(tileX + 3, tileY + 3, colW - 6, rowH - 6);

      // Chanfro iluminado superior e esquerdo
      g.fillStyle = "rgba(255, 255, 255, 0.45)";
      g.fillRect(tileX + 3, tileY + 3, colW - 6, 2);
      g.fillRect(tileX + 3, tileY + 3, 2, rowH - 6);

      // Chanfro de sombra inferior e direito
      g.fillStyle = "rgba(20, 25, 35, 0.15)";
      g.fillRect(tileX + 3, tileY + rowH - 5, colW - 6, 2);
      g.fillRect(tileX + colW - 5, tileY + 3, 2, rowH - 6);
    }
  }

  // 3. Rejunte escuro e definido entre as placas
  // Juntas longitudinais (ao longo da pista)
  g.fillStyle = "#343d4c";
  for (let r = 0; r <= rows; r++) {
    const y = r * rowH;
    g.fillRect(0, y - 2, 512, 4);
  }

  // Juntas transversais
  for (let r = 0; r < rows; r++) {
    const offsetX = r % 2 === 1 ? colW / 2 : 0;
    const y = r * rowH;
    for (let cIdx = -1; cIdx <= cols + 1; cIdx++) {
      const x = ((cIdx * colW + offsetX) % 512 + 512) % 512;
      g.fillRect(x - 2, y, 4, rowH);
    }
  }

  // 4. Marcas de borracha / Racing Line nas faixas de rolamento
  const rubberGradient = g.createLinearGradient(0, 0, 0, 512);
  rubberGradient.addColorStop(0.0, "rgba(20, 24, 32, 0.0)");
  rubberGradient.addColorStop(0.18, "rgba(20, 24, 32, 0.16)"); // Roda esquerda
  rubberGradient.addColorStop(0.35, "rgba(20, 24, 32, 0.0)");
  rubberGradient.addColorStop(0.5, "rgba(20, 24, 32, 0.05)");  // Centro
  rubberGradient.addColorStop(0.65, "rgba(20, 24, 32, 0.0)");
  rubberGradient.addColorStop(0.82, "rgba(20, 24, 32, 0.16)"); // Roda direita
  rubberGradient.addColorStop(1.0, "rgba(20, 24, 32, 0.0)");
  g.fillStyle = rubberGradient;
  g.fillRect(0, 0, 512, 512);

  // 5. Micro-granulação tátil estilo epóxi corporativo
  for (let i = 0; i < 900; i++) {
    const rx = Math.random() * 512;
    const ry = Math.random() * 512;
    const a = Math.random() * 0.045 + 0.01;
    g.fillStyle = Math.random() > 0.4 ? `rgba(255,255,255,${a * 1.5})` : `rgba(0,0,0,${a})`;
    g.fillRect(rx, ry, 2, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Textura para a guia/margeador branco lateral contínuo da pista */
function createCurbTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;

  // Base branca limpa
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 256, 64);

  // Junta de dilatação a cada 2 metros
  for (const x of [0, 128]) {
    g.fillStyle = "rgba(30, 35, 45, 0.28)";
    g.fillRect(x, 0, 4, 64);
    g.fillStyle = "rgba(255, 255, 255, 0.6)";
    g.fillRect(x + 4, 0, 3, 64);
  }

  // Faixa de borracha divisória escura na junção com o piso da pista
  g.fillStyle = "#27303d";
  g.fillRect(0, 56, 256, 8);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Textura procedural de carpete modular corporativo para o piso fora da pista */
function carpetTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#242c38";
  g.fillRect(0, 0, 256, 256);

  // Placas alternadas de 1m x 1m
  for (let x = 0; x < 2; x++) {
    for (let y = 0; y < 2; y++) {
      if ((x + y) % 2 === 0) {
        g.fillStyle = "#2a3442";
        g.fillRect(x * 128, y * 128, 128, 128);
      }
    }
  }

  // Costuras de encaixe das placas
  g.fillStyle = "rgba(0, 0, 0, 0.35)";
  g.fillRect(0, 0, 256, 3);
  g.fillRect(0, 126, 256, 3);
  g.fillRect(0, 0, 3, 256);
  g.fillRect(126, 0, 3, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 25);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Textura de edifícios estilizados no horizonte estilo Metro Kingdom */
function cartoonSkylineTexture(primaryColor: string, windowColor: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = primaryColor;
  g.fillRect(0, 0, 128, 256);

  for (let y = 10; y < 256; y += 18) {
    for (let x = 8; x < 128; x += 16) {
      const rnd = Math.sin(x * 37 + y * 53);
      if (rnd > -0.2) {
        g.fillStyle = windowColor;
        g.fillRect(x, y, 9, 10);
      } else {
        g.fillStyle = "rgba(0, 0, 0, 0.22)";
        g.fillRect(x, y, 9, 10);
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Faixa no chão entre duas listas de pontos com mapeamento UV preciso e cores de vértices */
function ribbon(
  a: Vec2[],
  b: Vec2[],
  y: number,
  colors: THREE.Color[] | null,
  closed: boolean,
  uScale = 0.25,
): THREE.BufferGeometry {
  const n = a.length;
  const pos: number[] = [];
  const col: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  let dist = 0;

  for (let i = 0; i < n; i++) {
    pos.push(a[i].x, y, a[i].z, b[i].x, y, b[i].z);
    if (colors) col.push(colors[i].r, colors[i].g, colors[i].b, colors[i].r, colors[i].g, colors[i].b);
    if (i > 0) {
      dist += Math.hypot(a[i].x - a[i - 1].x, a[i].z - a[i - 1].z);
    }
    // U ao longo do percurso (escala definida por uScale), V de 0 a 1 transversalmente
    uvs.push(dist * uScale, 0, dist * uScale, 1);
  }

  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (colors) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();

  if (g.attributes.normal.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

function commitMerged(
  scene: THREE.Scene,
  geos: THREE.BufferGeometry[],
  mat: THREE.Material,
  shadow = true,
): void {
  if (geos.length === 0) return;
  const merged = BufferGeometryUtils.mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return;
  const m = new THREE.Mesh(merged, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  scene.add(m);
}

function addTransformed(
  list: THREE.BufferGeometry[],
  geo: THREE.BufferGeometry,
  pos: { x: number; y: number; z: number },
  ry = 0,
): void {
  if (ry !== 0) geo.rotateY(ry);
  geo.translate(pos.x, pos.y, pos.z);
  list.push(geo);
}

/** Monta o Circuito Corporativo com o equilíbrio perfeito entre sofisticação tátil e o estilo dinâmico de Mario Kart */
export function buildTrack(scene: THREE.Scene): void {
  const n = TRACK.points.length;

  // 1. Piso externo com textura de placas de carpete corporativo
  const groundTex = carpetTexture();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 200),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.85, metalness: 0.0 }),
  );
  ground.position.set(0, -0.02, 0);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 2. Geometria da pista subdividida em Faixas Laterais Brancas + Pista de Corrida Central
  const edges = trackEdges(TRACK);
  const curbW = 0.45; // 45 cm de margeador branco em ambas as margens
  const innerPlus: Vec2[] = [];
  const innerMinus: Vec2[] = [];
  const shadowPlus: Vec2[] = [];
  const shadowMinus: Vec2[] = [];

  for (let i = 0; i < n; i++) {
    const a = TRACK.points[wrap(i - 1, n)];
    const b = TRACK.points[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const nrm = sideNormal((b.x - a.x) / len, (b.z - a.z) / len);
    const hw = TRACK.widths[i] / 2;
    const p = TRACK.points[i];

    innerPlus.push({ x: p.x + nrm.x * (hw - curbW), z: p.z + nrm.z * (hw - curbW) });
    innerMinus.push({ x: p.x - nrm.x * (hw - curbW), z: p.z - nrm.z * (hw - curbW) });

    // Sombras de contato sob as muretas (largura 22cm)
    shadowPlus.push({ x: p.x + nrm.x * (hw - 0.22), z: p.z + nrm.z * (hw - 0.22) });
    shadowMinus.push({ x: p.x - nrm.x * (hw - 0.22), z: p.z - nrm.z * (hw - 0.22) });
  }

  // 3. Pista de Corrida Central: Paginação de placas ricas com as cores dos setores e acabamento acetinado
  const colors = TRACK.cum.map((s) => new THREE.Color(ROOM_FLOOR[roomAt(s)]));
  const trackTex = createStylizedTrackTexture();
  const floorMat = new THREE.MeshStandardMaterial({
    map: trackTex,
    vertexColors: true,
    roughness: 0.48, // Brilho acetinado difuso elegante (zero reflexo cegante de sol)
    metalness: 0.03,
  });
  const floor = new THREE.Mesh(ribbon(innerPlus, innerMinus, 0.01, colors, true, 0.25), floorMat);
  floor.receiveShadow = true;
  scene.add(floor);

  // 4. Margeadores / Guias Laterais Brancas Contínuas (não são manchadas pela cor da sala!)
  const curbTex = createCurbTexture();
  const curbMat = new THREE.MeshStandardMaterial({
    map: curbTex,
    roughness: 0.42,
    metalness: 0.05,
  });
  const leftCurb = new THREE.Mesh(ribbon(edges.plus, innerPlus, 0.016, null, true, 0.5), curbMat);
  leftCurb.receiveShadow = true;
  scene.add(leftCurb);

  const rightCurb = new THREE.Mesh(ribbon(innerMinus, edges.minus, 0.016, null, true, 0.5), curbMat);
  rightCurb.receiveShadow = true;
  scene.add(rightCurb);

  // 5. Sombras de contato de oclusão de ambiente (AO) nas bases das paredes
  const aoMat = new THREE.MeshBasicMaterial({
    color: "#0a0f18",
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const leftAo = new THREE.Mesh(ribbon(edges.plus, shadowPlus, 0.018, null, true, 0.1), aoMat);
  const rightAo = new THREE.Mesh(ribbon(shadowMinus, edges.minus, 0.018, null, true, 0.1), aoMat);
  scene.add(leftAo);
  scene.add(rightAo);

  // 6. Fita amarela tracejada central chanfrada e vibrante
  const tapeGeos: THREE.BufferGeometry[] = [];
  for (let s = 4; s < TRACK.length - 2; s += 4) {
    const at = pointAt(TRACK, s);
    addTransformed(tapeGeos, new THREE.BoxGeometry(0.24, 0.024, 1.9), { x: at.pos.x, y: 0.02, z: at.pos.z }, at.heading);
  }
  const tapeMat = new THREE.MeshStandardMaterial({ color: "#ffd23f", roughness: 0.45, metalness: 0.05 });
  commitMerged(scene, tapeGeos, tapeMat, false);

  // 7. Grid oficial de largada estilo Mario Kart (demarcações brancas dos 8 pilotos)
  const gridGeos: THREE.BufferGeometry[] = [];
  const slots = gridSlots(TRACK, 8);
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    // Linha frontal de largada da baia
    addTransformed(gridGeos, new THREE.BoxGeometry(1.5, 0.022, 0.14), { x: slot.pos.x, y: 0.022, z: slot.pos.z }, slot.heading);
    // Marcadores laterais da baia
    const cos = Math.cos(slot.heading);
    const sin = Math.sin(slot.heading);
    for (const side of [-0.75, 0.75]) {
      const px = slot.pos.x + cos * side;
      const pz = slot.pos.z - sin * side;
      addTransformed(gridGeos, new THREE.BoxGeometry(0.12, 0.022, 1.4), { x: px, y: 0.022, z: pz }, slot.heading);
    }
    // Chevron apontando para frente
    addTransformed(gridGeos, new THREE.BoxGeometry(0.55, 0.022, 0.12), { x: slot.pos.x, y: 0.022, z: slot.pos.z + 0.35 }, slot.heading);
  }
  const gridMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4, metalness: 0.1 });
  commitMerged(scene, gridGeos, gridMat, false);

  // 8. Zebras 3D sólidas em Vermelho e Branco com grama sintética nas curvas (estilo clássico Mario Kart)
  const redKerbGeos: THREE.BufferGeometry[] = [];
  const whiteKerbGeos: THREE.BufferGeometry[] = [];
  const grassGeos: THREE.BufferGeometry[] = [];

  for (const c of TRACK.carpet) {
    const len = c.to >= c.from ? c.to - c.from : c.to + TRACK.length - c.from;
    const step = 1.1; // Blocos de 1.1m alternados
    let blockIdx = 0;

    for (let d = 0; d < len; d += step) {
      const dMid = Math.min(len, d + step / 2);
      const at = pointAt(TRACK, c.from + dMid);
      const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));

      const kerbWidth = 0.65;
      const grassWidth = RACE.carpetWidth - kerbWidth;

      // 1. Bloco 3D sólido da zebra vermelha/branca elevado em 4.5cm com faces tangíveis
      const rKerb = at.halfWidth - kerbWidth / 2;
      const kPos = {
        x: at.pos.x + nrm.x * rKerb * c.side,
        y: 0.038,
        z: at.pos.z + nrm.z * rKerb * c.side,
      };
      const kerbBox = new THREE.BoxGeometry(kerbWidth, 0.048, step * 1.04);
      if (blockIdx % 2 === 0) addTransformed(redKerbGeos, kerbBox, kPos, at.heading);
      else addTransformed(whiteKerbGeos, kerbBox, kPos, at.heading);

      // 2. Gramado sintético verde vibrante atrás da zebra
      const rGrass = at.halfWidth - kerbWidth - grassWidth / 2;
      const gPos = {
        x: at.pos.x + nrm.x * rGrass * c.side,
        y: 0.028,
        z: at.pos.z + nrm.z * rGrass * c.side,
      };
      addTransformed(grassGeos, new THREE.BoxGeometry(grassWidth, 0.032, step * 1.04), gPos, at.heading);

      blockIdx++;
    }
  }

  const redKerbMat = new THREE.MeshStandardMaterial({ color: "#e74c3c", roughness: 0.5, metalness: 0.05 });
  const whiteKerbMat = new THREE.MeshStandardMaterial({ color: "#f8f9fa", roughness: 0.5, metalness: 0.05 });
  const grassMat = new THREE.MeshStandardMaterial({ color: "#27ae60", roughness: 0.85, metalness: 0.0 });

  commitMerged(scene, redKerbGeos, redKerbMat, true);
  commitMerged(scene, whiteKerbGeos, whiteKerbMat, true);
  commitMerged(scene, grassGeos, grassMat, false);

  // 9. Paredes e divisórias ricas: rodapé ardósia + painel arquitetônico + faixa temática esportiva + corrimão de alumínio
  const wallGeosByRoom = new Map<string, THREE.BufferGeometry[]>();
  const accentStripesByRoom = new Map<string, THREE.BufferGeometry[]>();
  const baseboardGeos: THREE.BufferGeometry[] = [];
  const capGeos: THREE.BufferGeometry[] = [];
  const columnGeos: THREE.BufferGeometry[] = [];
  const reflectorGeos: THREE.BufferGeometry[] = [];

  for (const side of [edges.plus, edges.minus]) {
    for (let i = 0; i < n; i++) {
      const a = side[i];
      const b = side[(i + 1) % n];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const ry = Math.atan2(b.x - a.x, b.z - a.z);
      const room = roomAt(TRACK.cum[i]);

      let roomList = wallGeosByRoom.get(room);
      if (!roomList) {
        roomList = [];
        wallGeosByRoom.set(room, roomList);
      }
      let stripeList = accentStripesByRoom.get(room);
      if (!stripeList) {
        stripeList = [];
        accentStripesByRoom.set(room, stripeList);
      }

      // Painel principal da mureta (off-white / neutro claro)
      addTransformed(roomList, new THREE.BoxGeometry(0.24, 0.95, len + 0.02), { x: mid.x, y: 0.475, z: mid.z }, ry);

      // Faixa esportiva horizontal do departamento correndo pelo meio da parede
      addTransformed(stripeList, new THREE.BoxGeometry(0.26, 0.22, len + 0.02), { x: mid.x, y: 0.56, z: mid.z }, ry);

      // Rodapé estrutural escuro na base
      addTransformed(baseboardGeos, new THREE.BoxGeometry(0.28, 0.16, len + 0.02), { x: mid.x, y: 0.08, z: mid.z }, ry);

      // Corrimão protetor no topo em alumínio escovado
      addTransformed(capGeos, new THREE.BoxGeometry(0.3, 0.08, len + 0.02), { x: mid.x, y: 0.98, z: mid.z }, ry);

      // Pilares arquitetônicos verticais a cada ~6 metros
      if (i % 4 === 0) {
        addTransformed(columnGeos, new THREE.BoxGeometry(0.34, 1.08, 0.34), { x: a.x, y: 0.54, z: a.z }, ry);
        addTransformed(reflectorGeos, new THREE.BoxGeometry(0.36, 0.1, 0.36), { x: a.x, y: 0.78, z: a.z }, ry);
      }
    }
  }

  for (const [room, geos] of wallGeosByRoom) {
    const c = ROOM_WALL[room];
    const mat =
      c === "glass"
        ? new THREE.MeshStandardMaterial({
            color: "#80d0ff",
            transparent: true,
            opacity: 0.38,
            roughness: 0.15,
            metalness: 0.1,
          })
        : new THREE.MeshStandardMaterial({
            color: c,
            roughness: 0.65,
            metalness: 0.03,
          });
    commitMerged(scene, geos, mat, c !== "glass");
  }

  for (const [room, geos] of accentStripesByRoom) {
    const mat = new THREE.MeshStandardMaterial({
      color: ROOM_FLOOR[room],
      roughness: 0.5,
      metalness: 0.05,
    });
    commitMerged(scene, geos, mat, false);
  }

  // Rodapé em ardósia nobre escura
  const baseboardMat = new THREE.MeshStandardMaterial({ color: "#18202c", roughness: 0.75, metalness: 0.1 });
  commitMerged(scene, baseboardGeos, baseboardMat, false);

  // Topo protetor com perfil de alumínio acetinado
  const capMat = new THREE.MeshStandardMaterial({ color: "#eef2f7", roughness: 0.35, metalness: 0.45 });
  commitMerged(scene, capGeos, capMat, false);

  // Pilares arquitetônicos verticais
  const columnMat = new THREE.MeshStandardMaterial({ color: "#222a36", roughness: 0.6, metalness: 0.2 });
  commitMerged(scene, columnGeos, columnMat, true);

  // Faixas refletivas de segurança nos pilares
  const reflectorMat = new THREE.MeshBasicMaterial({ color: "#ffd23f" });
  commitMerged(scene, reflectorGeos, reflectorMat, false);

  // 10. Luminárias suspensas modernas ao longo de todo o circuito
  const lampBodyGeos: THREE.BufferGeometry[] = [];
  const ledStripGeos: THREE.BufferGeometry[] = [];
  const cableGeos: THREE.BufferGeometry[] = [];

  for (let s = 2; s < TRACK.length; s += 9) {
    const at = pointAt(TRACK, s);
    const yLamp = 3.8;
    addTransformed(lampBodyGeos, new THREE.BoxGeometry(0.24, 0.1, 3.4), { x: at.pos.x, y: yLamp, z: at.pos.z }, at.heading);
    addTransformed(ledStripGeos, new THREE.BoxGeometry(0.14, 0.03, 3.3), { x: at.pos.x, y: yLamp - 0.05, z: at.pos.z }, at.heading);

    const cos = Math.cos(at.heading);
    const sin = Math.sin(at.heading);
    for (const dz of [-1.3, 1.3]) {
      const cx = at.pos.x + sin * dz;
      const cz = at.pos.z + cos * dz;
      addTransformed(cableGeos, new THREE.CylinderGeometry(0.012, 0.012, 2.8, 6), { x: cx, y: yLamp + 1.4, z: cz });
    }
  }

  const lampBodyMat = new THREE.MeshStandardMaterial({ color: "#2c3e50", roughness: 0.6, metalness: 0.3 });
  commitMerged(scene, lampBodyGeos, lampBodyMat, false);

  const ledStripMat = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#eaf4fc", emissiveIntensity: 0.9 });
  commitMerged(scene, ledStripGeos, ledStripMat, false);

  const cableMat = new THREE.MeshStandardMaterial({ color: "#8b98a5", roughness: 0.6, metalness: 0.4 });
  commitMerged(scene, cableGeos, cableMat, false);

  // 11. Fachada envidraçada panorâmica e skyline estilizado da metrópole
  buildPanoramicWindows(scene);
  buildSkyline(scene);

  // 12. Linha de largada com acabamento quadriculado nítido
  const start = pointAt(TRACK, 0);
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(start.halfWidth * 2, 1.4),
    new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.5, metalness: 0.05 }),
  );
  line.position.set(start.pos.x, 0.03, start.pos.z);
  line.rotation.set(-Math.PI / 2, 0, 0);
  line.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), start.heading);
  line.receiveShadow = true;
  scene.add(line);

  // 13. Pórtico de largada moderno com semáforo de 3 cores estilo Mario Kart
  buildStartGantry(scene, start);

  // 14. Placas de sinalização dos ambientes
  for (const r of TRACK_ROOMS.slice(1, -1)) {
    const at = pointAt(TRACK, TRACK.ctrlS[r.ctrl] + 4);
    const sign = roomSignSprite(r.name);
    sign.position.set(at.pos.x, 3.6, at.pos.z);
    scene.add(sign);
  }

  // 15. Decoração viva de mobiliário de escritório
  decorate(scene);
}

/** Fachada envidraçada do andar panorâmico */
function buildPanoramicWindows(scene: THREE.Scene): void {
  const mullionGeos: THREE.BufferGeometry[] = [];
  const glassGeos: THREE.BufferGeometry[] = [];

  const minX = -68, maxX = 68;
  const minZ = -52, maxZ = 52;
  const h = 7.5;

  const addFacade = (x1: number, z1: number, x2: number, z2: number) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const midX = (x1 + x2) / 2;
    const midZ = (z1 + z2) / 2;
    const ry = Math.atan2(x2 - x1, z2 - z1);

    addTransformed(glassGeos, new THREE.BoxGeometry(0.1, h, len), { x: midX, y: h / 2, z: midZ }, ry);
    addTransformed(mullionGeos, new THREE.BoxGeometry(0.28, 0.32, len), { x: midX, y: 0.16, z: midZ }, ry);
    addTransformed(mullionGeos, new THREE.BoxGeometry(0.28, 0.32, len), { x: midX, y: h - 0.16, z: midZ }, ry);

    const segs = Math.floor(len / 4.8);
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const px = x1 + (x2 - x1) * u;
      const pz = z1 + (z2 - z1) * u;
      addTransformed(mullionGeos, new THREE.BoxGeometry(0.26, h, 0.26), { x: px, y: h / 2, z: pz }, ry);
    }
  };

  addFacade(minX, minZ, maxX, minZ);
  addFacade(maxX, minZ, maxX, maxZ);
  addFacade(maxX, maxZ, minX, maxZ);
  addFacade(minX, maxZ, minX, minZ);

  const mullionMat = new THREE.MeshStandardMaterial({ color: "#242d38", roughness: 0.5, metalness: 0.4 });
  commitMerged(scene, mullionGeos, mullionMat, false);

  const glassMat = new THREE.MeshStandardMaterial({
    color: "#a0d8ef",
    transparent: true,
    opacity: 0.22,
    roughness: 0.2,
    metalness: 0.1,
  });
  commitMerged(scene, glassGeos, glassMat, false);
}

/** Skyline de edifícios estilizados no horizonte */
function buildSkyline(scene: THREE.Scene): void {
  const towerGeos: THREE.BufferGeometry[] = [];
  const roofGeos: THREE.BufferGeometry[] = [];
  const beaconGeos: THREE.BufferGeometry[] = [];

  const buildingThemes = [
    { primary: "#2b4c7e", win: "#ffeaa7" }, // Azul royal
    { primary: "#c0392b", win: "#fff3cd" }, // Terracota aconchegante
    { primary: "#16a085", win: "#e8f8f5" }, // Menta vibrante
    { primary: "#2c3e50", win: "#f9e79f" }, // Ardósia clássica
  ];

  const count = 38;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const dist = 82 + (i % 5) * 8 + (i % 3) * 6;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const w = 14 + (i % 4) * 4;
    const d = 14 + ((i + 2) % 4) * 4;
    const h = 26 + (i % 7) * 9 + ((i * 3) % 5) * 6;

    addTransformed(towerGeos, new THREE.BoxGeometry(w, h, d), { x, y: h / 2 - 8, z }, angle);

    const rh = 3.5 + (i % 3) * 2;
    addTransformed(roofGeos, new THREE.BoxGeometry(w * 0.5, rh, d * 0.5), { x, y: h - 8 + rh / 2, z }, angle);
    addTransformed(beaconGeos, new THREE.SphereGeometry(0.55, 8, 8), { x, y: h - 8 + rh + 0.6, z }, 0);
  }

  const theme = buildingThemes[0];
  const towerMat = new THREE.MeshStandardMaterial({
    map: cartoonSkylineTexture(theme.primary, theme.win),
    roughness: 0.65,
    metalness: 0.1,
  });
  const roofMat = new THREE.MeshStandardMaterial({ color: "#1f2937", roughness: 0.7 });
  const beaconMat = new THREE.MeshBasicMaterial({ color: "#ff4757" });

  commitMerged(scene, towerGeos, towerMat, false);
  commitMerged(scene, roofGeos, roofMat, false);
  commitMerged(scene, beaconGeos, beaconMat, false);
}

/** Pórtico moderno estilo derby corporativo elevado com semáforo de largada de 3 tempos */
function buildStartGantry(scene: THREE.Scene, start: ReturnType<typeof pointAt>): void {
  const trussGeos: THREE.BufferGeometry[] = [];
  const decoGeos: THREE.BufferGeometry[] = [];
  const lightHousingGeos: THREE.BufferGeometry[] = [];
  const nrm = sideNormal(Math.sin(start.heading), Math.cos(start.heading));
  const span = start.halfWidth + 0.6;

  for (const s of [-1, 1]) {
    const px = start.pos.x + nrm.x * span * s;
    const pz = start.pos.z + nrm.z * span * s;
    // Pilares estilizados
    addTransformed(trussGeos, new THREE.BoxGeometry(0.42, 5.2, 0.42), { x: px, y: 2.6, z: pz }, start.heading);
    addTransformed(decoGeos, new THREE.BoxGeometry(0.8, 0.25, 0.8), { x: px, y: 0.125, z: pz }, start.heading);
  }

  // Travessa superior estrutural elevada a 5.15m (longe da câmera de terceira pessoa)
  const bridgeX = start.pos.x;
  const bridgeZ = start.pos.z;
  addTransformed(trussGeos, new THREE.BoxGeometry(span * 2 + 0.7, 0.42, 0.42), { x: bridgeX, y: 5.15, z: bridgeZ }, start.heading);

  // Caixa do semáforo de largada suspensa no centro do pórtico
  addTransformed(lightHousingGeos, new THREE.BoxGeometry(1.6, 0.45, 0.28), { x: bridgeX, y: 4.65, z: bridgeZ }, start.heading);

  const trussMat = new THREE.MeshStandardMaterial({ color: "#1d4ed8", roughness: 0.45, metalness: 0.25 });
  commitMerged(scene, trussGeos, trussMat, true);

  const decoMat = new THREE.MeshStandardMaterial({ color: "#f59e0b", roughness: 0.5, metalness: 0.1 });
  commitMerged(scene, decoGeos, decoMat, false);

  const housingMat = new THREE.MeshStandardMaterial({ color: "#181d24", roughness: 0.6, metalness: 0.2 });
  commitMerged(scene, lightHousingGeos, housingMat, false);

  // 3 Lâmpadas circulares do semáforo de largada (Vermelho, Amarelo, Verde)
  const lightColors = ["#ff4757", "#ffa502", "#2ed573"];
  const cos = Math.cos(start.heading);
  const sin = Math.sin(start.heading);
  const lampOffset = 0.45;

  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * lampOffset;
    const lx = bridgeX + cos * off;
    const lz = bridgeZ - sin * off;
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16),
      new THREE.MeshStandardMaterial({
        color: lightColors[i],
        emissive: lightColors[i],
        emissiveIntensity: 0.85,
        roughness: 0.2,
      }),
    );
    lamp.rotation.x = Math.PI / 2;
    lamp.rotation.z = -start.heading;
    lamp.position.set(lx, 4.65, lz);
    scene.add(lamp);
  }

  // Painel principal de boas-vindas suspenso no pórtico
  const banner = roomSignSprite("Rally da Firma", "GRANDE PRÊMIO");
  banner.position.set(start.pos.x, 3.9, start.pos.z);
  banner.scale.set(start.halfWidth * 1.9, start.halfWidth * 0.48, 1);
  scene.add(banner);
}

/** Móveis e decorações táteis dos ambientes fora da pista */
function decorate(scene: THREE.Scene): void {
  const woodGeos: THREE.BufferGeometry[] = [];
  const whiteGeos: THREE.BufferGeometry[] = [];
  const darkGeos: THREE.BufferGeometry[] = [];
  const screenGeos: THREE.BufferGeometry[] = [];
  const leafGeos: THREE.BufferGeometry[] = [];
  const potGeos: THREE.BufferGeometry[] = [];
  const sofaGeos: THREE.BufferGeometry[] = [];
  const glassDispenserGeos: THREE.BufferGeometry[] = [];
  const paperStackGeos: THREE.BufferGeometry[] = [];

  const free = (p: Vec2, r: number) => {
    const pr = progressOf(TRACK, p);
    return pr.dist > pr.halfWidth + r + 0.6;
  };

  const put = (room: string, p: Vec2, ry: number) => {
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    const rot = (lx: number, lz: number) => ({ x: p.x + lx * cos + lz * sin, z: p.z - lx * sin + lz * cos });

    switch (room) {
      case "Ilhas de mesas":
        addTransformed(woodGeos, new THREE.BoxGeometry(2.4, 0.08, 1.2), { x: p.x, y: 0.74, z: p.z }, ry);
        for (const x of [-1.1, 1.1]) {
          const pt = rot(x, 0);
          addTransformed(darkGeos, new THREE.BoxGeometry(0.06, 0.74, 1.1), { x: pt.x, y: 0.37, z: pt.z }, ry);
        }
        for (const x of [-0.6, 0.6]) {
          const pt = rot(x, -0.3);
          addTransformed(screenGeos, new THREE.BoxGeometry(0.55, 0.36, 0.04), { x: pt.x, y: 1.0, z: pt.z }, ry);
        }
        // Pilha de papéis na mesa
        {
          const pt = rot(0.7, 0.2);
          addTransformed(paperStackGeos, new THREE.BoxGeometry(0.3, 0.12, 0.22), { x: pt.x, y: 0.84, z: pt.z }, ry);
        }
        break;

      case "TI":
        addTransformed(darkGeos, new THREE.BoxGeometry(0.9, 2.2, 1.0), { x: p.x, y: 1.1, z: p.z }, ry);
        // Luzes azuis indicativas nos servidores
        for (let y = 0.5; y <= 1.8; y += 0.3) {
          addTransformed(screenGeos, new THREE.BoxGeometry(0.7, 0.04, 0.04), { x: p.x, y, z: p.z + 0.51 }, ry);
        }
        break;

      case "Copa":
        addTransformed(whiteGeos, new THREE.BoxGeometry(2.6, 0.95, 0.8), { x: p.x, y: 0.47, z: p.z }, ry);
        {
          const pt = rot(0.7, 0);
          addTransformed(darkGeos, new THREE.BoxGeometry(0.42, 0.52, 0.42), { x: pt.x, y: 1.21, z: pt.z }, ry);
        }
        {
          const pt = rot(-0.7, 0);
          addTransformed(whiteGeos, new THREE.BoxGeometry(0.36, 0.9, 0.36), { x: pt.x, y: 0.45, z: pt.z }, ry);
          addTransformed(glassDispenserGeos, new THREE.CylinderGeometry(0.14, 0.14, 0.38, 12), { x: pt.x, y: 1.1, z: pt.z }, ry);
        }
        break;

      case "Sala de reunião":
        addTransformed(woodGeos, new THREE.CylinderGeometry(1.6, 1.6, 0.08, 24), { x: p.x, y: 0.74, z: p.z }, ry);
        addTransformed(darkGeos, new THREE.CylinderGeometry(0.15, 0.3, 0.74, 12), { x: p.x, y: 0.37, z: p.z }, ry);
        break;

      case "Recepção":
        addTransformed(sofaGeos, new THREE.BoxGeometry(2.2, 0.7, 0.9), { x: p.x, y: 0.35, z: p.z }, ry);
        {
          const pt = rot(0, -0.35);
          addTransformed(sofaGeos, new THREE.BoxGeometry(2.2, 0.6, 0.25), { x: pt.x, y: 0.8, z: pt.z }, ry);
        }
        break;

      default:
        // Vasos de plantas estilo contemporâneo
        addTransformed(potGeos, new THREE.CylinderGeometry(0.32, 0.24, 0.55, 12), { x: p.x, y: 0.275, z: p.z }, ry);
        addTransformed(leafGeos, new THREE.IcosahedronGeometry(0.58, 1), { x: p.x, y: 1.0, z: p.z }, ry);
    }
  };

  for (let s = 6; s < TRACK.length; s += 11) {
    const at = pointAt(TRACK, s);
    const room = roomAt(s);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    for (const side of [-1, 1]) {
      const off = at.halfWidth + 2.6;
      const p = { x: at.pos.x + nrm.x * off * side, z: at.pos.z + nrm.z * off * side };
      if (free(p, 1.6)) put(room, p, at.heading);
    }
  }

  const meet = pointAt(TRACK, TRACK.ctrlS[14]);
  const nrm = sideNormal(Math.sin(meet.heading), Math.cos(meet.heading));
  const c = TRACK.carpet[2];
  const p = { x: meet.pos.x + nrm.x * (meet.halfWidth + 5) * c.side, z: meet.pos.z + nrm.z * (meet.halfWidth + 5) * c.side };
  if (free(p, 2)) put("Sala de reunião", p, 0);

  const wood = new THREE.MeshStandardMaterial({ color: "#d97736", roughness: 0.55, metalness: 0.05 });
  const white = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.55, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: "#2d3748", roughness: 0.6, metalness: 0.2 });
  const screen = new THREE.MeshStandardMaterial({ color: "#1a202c", emissive: "#3182ce", emissiveIntensity: 0.7 });
  const leaf = new THREE.MeshStandardMaterial({ color: "#22c55e", roughness: 0.65, flatShading: true });
  const pot = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.35 });
  const sofa = new THREE.MeshStandardMaterial({ color: "#0284c7", roughness: 0.7 });
  const dispenser = new THREE.MeshStandardMaterial({ color: "#38bdf8", transparent: true, opacity: 0.6, roughness: 0.15 });
  const paper = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 });

  commitMerged(scene, woodGeos, wood, true);
  commitMerged(scene, whiteGeos, white, true);
  commitMerged(scene, darkGeos, dark, true);
  commitMerged(scene, screenGeos, screen, false);
  commitMerged(scene, leafGeos, leaf, true);
  commitMerged(scene, potGeos, pot, true);
  commitMerged(scene, sofaGeos, sofa, true);
  commitMerged(scene, glassDispenserGeos, dispenser, false);
  commitMerged(scene, paperStackGeos, paper, false);
}
