import * as THREE from "three";
import type { Room } from "@ec/shared";

interface FloorMaterialSet {
  material: THREE.MeshStandardMaterial;
}

// Cache de texturas geradas para evitar recriação desnecessária
const textureCache = new Map<string, { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }>();

/** Cria um canvas com configurações padrão para texturas procedurais */
function createCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  return [canvas, ctx];
}

/** Converte hex "#rrggbb" em objeto { r, g, b } de 0 a 255 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/** Clareia ou escurece uma cor hex */
function shadeColor(hex: string, percent: number): string {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 + percent / 100;
  const nr = Math.min(255, Math.max(0, Math.round(r * factor)));
  const ng = Math.min(255, Math.max(0, Math.round(g * factor)));
  const nb = Math.min(255, Math.max(0, Math.round(b * factor)));
  return `rgb(${nr}, ${ng}, ${nb})`;
}

/**
 * Textura 1: Carpete Corporativo Modular (Carpet Tiles 50x50cm)
 * Apresenta placas modulares com trama têxtil cruzada realista e juntas de encaixe.
 */
function generateCarpetTextures(baseColor: string): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const cacheKey = `carpet_${baseColor}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const S = 256;
  const [mapCanvas, mapCtx] = createCanvas(S, S);
  const [bumpCanvas, bumpCtx] = createCanvas(S, S);

  // Fundo base
  mapCtx.fillStyle = baseColor;
  mapCtx.fillRect(0, 0, S, S);

  bumpCtx.fillStyle = "#888888";
  bumpCtx.fillRect(0, 0, S, S);

  const half = S / 2;
  const quads = [
    { x: 0, y: 0, dir: "h" },
    { x: half, y: 0, dir: "v" },
    { x: 0, y: half, dir: "v" },
    { x: half, y: half, dir: "h" },
  ];

  // Placas com direções de trama alternadas (padrão de instalação corporativa)
  for (const q of quads) {
    // Variação sutil de tom entre as placas
    const toneMod = (Math.random() - 0.5) * 8;
    mapCtx.fillStyle = shadeColor(baseColor, toneMod);
    mapCtx.fillRect(q.x + 1, q.y + 1, half - 2, half - 2);

    // Trama de tecido
    const step = 4;
    for (let i = 0; i < half; i += step) {
      const alpha = 0.08 + Math.random() * 0.06;
      mapCtx.strokeStyle = Math.random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
      mapCtx.lineWidth = 1.5;
      mapCtx.beginPath();
      if (q.dir === "h") {
        mapCtx.moveTo(q.x, q.y + i);
        mapCtx.lineTo(q.x + half, q.y + i);
      } else {
        mapCtx.moveTo(q.x + i, q.y);
        mapCtx.lineTo(q.x + i, q.y + half);
      }
      mapCtx.stroke();
    }
  }

  // Micro-ruído de granulação de carpete
  const imgData = mapCtx.getImageData(0, 0, S, S);
  const bumpData = bumpCtx.getImageData(0, 0, S, S);
  const data = imgData.data;
  const bData = bumpData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 16;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
    bData[i] = Math.min(255, Math.max(0, 128 + grain * 2));
    bData[i + 1] = bData[i];
    bData[i + 2] = bData[i];
  }
  mapCtx.putImageData(imgData, 0, 0);
  bumpCtx.putImageData(bumpData, 0, 0);

  // Juntas entre placas de carpete
  mapCtx.strokeStyle = "rgba(0, 0, 0, 0.22)";
  mapCtx.lineWidth = 1.5;
  mapCtx.strokeRect(0, 0, S, S);
  mapCtx.beginPath();
  mapCtx.moveTo(half, 0);
  mapCtx.lineTo(half, S);
  mapCtx.moveTo(0, half);
  mapCtx.lineTo(S, half);
  mapCtx.stroke();

  bumpCtx.strokeStyle = "#222222";
  bumpCtx.lineWidth = 2;
  bumpCtx.strokeRect(0, 0, S, S);
  bumpCtx.beginPath();
  bumpCtx.moveTo(half, 0);
  bumpCtx.lineTo(half, S);
  bumpCtx.moveTo(0, half);
  bumpCtx.lineTo(S, half);
  bumpCtx.stroke();

  const map = new THREE.CanvasTexture(mapCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;

  const res = { map, bump };
  textureCache.set(cacheKey, res);
  return res;
}

/**
 * Textura 2: Piso Vinílico / Madeira Nobre (Réguas com Veios)
 * Para Sala Executiva, Sala do Comandante e Sala de Gestão.
 */
function generateWoodPlankTextures(baseColor: string): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const cacheKey = `wood_${baseColor}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const W = 512;
  const H = 256;
  const [mapCanvas, mapCtx] = createCanvas(W, H);
  const [bumpCanvas, bumpCtx] = createCanvas(W, H);

  mapCtx.fillStyle = baseColor;
  mapCtx.fillRect(0, 0, W, H);

  bumpCtx.fillStyle = "#a0a0a0";
  bumpCtx.fillRect(0, 0, W, H);

  const numPlanks = 4;
  const plankH = H / numPlanks;

  for (let p = 0; p < numPlanks; p++) {
    const py = p * plankH;
    // Variação de cor da régua
    const plankColor = shadeColor(baseColor, (p % 2 === 0 ? 5 : -4) + (Math.random() * 4 - 2));
    mapCtx.fillStyle = plankColor;
    mapCtx.fillRect(0, py, W, plankH);

    // Veios de madeira orgânicos
    const grainCount = 12;
    for (let g = 0; g < grainCount; g++) {
      const gy = py + Math.random() * plankH;
      const alpha = 0.04 + Math.random() * 0.06;
      mapCtx.strokeStyle = Math.random() > 0.4 ? `rgba(40, 20, 5, ${alpha})` : `rgba(255, 245, 230, ${alpha * 0.8})`;
      mapCtx.lineWidth = 1 + Math.random() * 1.5;
      mapCtx.beginPath();
      mapCtx.moveTo(0, gy);
      mapCtx.bezierCurveTo(W * 0.3, gy + (Math.random() - 0.5) * 8, W * 0.7, gy + (Math.random() - 0.5) * 8, W, gy);
      mapCtx.stroke();
    }

    // Juntas verticais desencontradas
    const seamX = (p * (W * 0.38) + W * 0.25) % W;
    mapCtx.strokeStyle = "rgba(20, 10, 0, 0.4)";
    mapCtx.lineWidth = 1.5;
    mapCtx.beginPath();
    mapCtx.moveTo(seamX, py);
    mapCtx.lineTo(seamX, py + plankH);
    mapCtx.stroke();

    bumpCtx.strokeStyle = "#333333";
    bumpCtx.lineWidth = 2;
    bumpCtx.beginPath();
    bumpCtx.moveTo(seamX, py);
    bumpCtx.lineTo(seamX, py + plankH);
    bumpCtx.stroke();
  }

  // Linhas horizontais entre réguas (chanfros / bisotê)
  for (let p = 0; p <= numPlanks; p++) {
    const py = p * plankH;
    // Sombra do bisotê
    mapCtx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    mapCtx.lineWidth = 1.8;
    mapCtx.beginPath();
    mapCtx.moveTo(0, py);
    mapCtx.lineTo(W, py);
    mapCtx.stroke();

    // Relevo no bump
    bumpCtx.strokeStyle = "#202020";
    bumpCtx.lineWidth = 2.5;
    bumpCtx.beginPath();
    bumpCtx.moveTo(0, py);
    bumpCtx.lineTo(W, py);
    bumpCtx.stroke();
  }

  const map = new THREE.CanvasTexture(mapCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;

  const res = { map, bump };
  textureCache.set(cacheKey, res);
  return res;
}

/**
 * Textura 3: Porcelanato Retificado de Grande Formato
 * Para Corredor Central e Hall de Entrada.
 */
function generatePorcelainTextures(baseColor: string): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const cacheKey = `porcelain_${baseColor}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const S = 256;
  const [mapCanvas, mapCtx] = createCanvas(S, S);
  const [bumpCanvas, bumpCtx] = createCanvas(S, S);

  mapCtx.fillStyle = baseColor;
  mapCtx.fillRect(0, 0, S, S);

  bumpCtx.fillStyle = "#cccccc";
  bumpCtx.fillRect(0, 0, S, S);

  // Nuances suaves minerais (marmorizado suave acetinado)
  for (let i = 0; i < 6; i++) {
    const cx = Math.random() * S;
    const cy = Math.random() * S;
    const r = 40 + Math.random() * 80;
    const grad = mapCtx.createRadialGradient(cx, cy, 5, cx, cy, r);
    grad.addColorStop(0, "rgba(255, 255, 255, 0.07)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0.04)");
    mapCtx.fillStyle = grad;
    mapCtx.beginPath();
    mapCtx.arc(cx, cy, r, 0, Math.PI * 2);
    mapCtx.fill();
  }

  // Rejunte ultrafino retificado (1.5px) com acabamento premium
  mapCtx.strokeStyle = "rgba(90, 85, 80, 0.35)";
  mapCtx.lineWidth = 1.5;
  mapCtx.strokeRect(0, 0, S, S);

  bumpCtx.strokeStyle = "#444444";
  bumpCtx.lineWidth = 2;
  bumpCtx.strokeRect(0, 0, S, S);

  const map = new THREE.CanvasTexture(mapCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;

  const res = { map, bump };
  textureCache.set(cacheKey, res);
  return res;
}

/**
 * Textura 4: Cerâmica / Azulejos Geométricos
 * Para Banheiros e Cozinha.
 */
function generateCeramicTextures(baseColor: string, isKitchen = false): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const cacheKey = `ceramic_${baseColor}_${isKitchen}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const S = 256;
  const [mapCanvas, mapCtx] = createCanvas(S, S);
  const [bumpCanvas, bumpCtx] = createCanvas(S, S);

  mapCtx.fillStyle = baseColor;
  mapCtx.fillRect(0, 0, S, S);

  bumpCtx.fillStyle = "#dddddd";
  bumpCtx.fillRect(0, 0, S, S);

  const tiles = 4; // 4x4 azulejos por repetição
  const size = S / tiles;

  for (let x = 0; x < tiles; x++) {
    for (let y = 0; y < tiles; y++) {
      const px = x * size;
      const py = y * size;

      // Se for cozinha, faz um tabuleiro contemporâneo sutil
      if (isKitchen && (x + y) % 2 === 1) {
        mapCtx.fillStyle = shadeColor(baseColor, -5);
        mapCtx.fillRect(px + 1, py + 1, size - 2, size - 2);
      }

      // Brilho suave no centro do azulejo
      const grad = mapCtx.createRadialGradient(px + size / 2, py + size / 2, 2, px + size / 2, py + size / 2, size * 0.6);
      grad.addColorStop(0, "rgba(255, 255, 255, 0.12)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0.05)");
      mapCtx.fillStyle = grad;
      mapCtx.fillRect(px + 1, py + 1, size - 2, size - 2);

      // Rejunte cerâmico
      mapCtx.strokeStyle = "rgba(50, 60, 70, 0.38)";
      mapCtx.lineWidth = 1.8;
      mapCtx.strokeRect(px, py, size, size);

      bumpCtx.strokeStyle = "#303030";
      bumpCtx.lineWidth = 2.5;
      bumpCtx.strokeRect(px, py, size, size);
    }
  }

  const map = new THREE.CanvasTexture(mapCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;

  const res = { map, bump };
  textureCache.set(cacheKey, res);
  return res;
}

/**
 * Textura 5: Piso Técnico Industrial / Chapa Metálica Antiderrapante
 * Para os Elevadores e Áreas Técnicas.
 */
function generateMetalFloorTextures(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const cacheKey = "metal_elevator";
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const S = 256;
  const [mapCanvas, mapCtx] = createCanvas(S, S);
  const [bumpCanvas, bumpCtx] = createCanvas(S, S);

  mapCtx.fillStyle = "#8d959e";
  mapCtx.fillRect(0, 0, S, S);

  bumpCtx.fillStyle = "#777777";
  bumpCtx.fillRect(0, 0, S, S);

  // Micro-estrias de metal escovado
  for (let i = 0; i < S; i += 2) {
    const alpha = 0.06 + Math.random() * 0.06;
    mapCtx.strokeStyle = Math.random() > 0.5 ? `rgba(255, 255, 255, ${alpha})` : `rgba(0, 0, 0, ${alpha})`;
    mapCtx.lineWidth = 1;
    mapCtx.beginPath();
    mapCtx.moveTo(0, i);
    mapCtx.lineTo(S, i);
    mapCtx.stroke();
  }

  // Padrão de losangos/chapa xadrez antiderrapante
  const step = 32;
  bumpCtx.fillStyle = "#ffffff";
  mapCtx.fillStyle = "rgba(230, 240, 250, 0.4)";
  for (let x = 8; x < S; x += step) {
    for (let y = 8; y < S; y += step) {
      // Pequeno relevo duplo
      const isAlt = ((x + y) / step) % 2 === 0;
      const angle = isAlt ? Math.PI / 4 : -Math.PI / 4;

      mapCtx.save();
      mapCtx.translate(x, y);
      mapCtx.rotate(angle);
      mapCtx.fillRect(-5, -1.5, 10, 3);
      mapCtx.restore();

      bumpCtx.save();
      bumpCtx.translate(x, y);
      bumpCtx.rotate(angle);
      bumpCtx.fillRect(-5, -1.5, 10, 3);
      bumpCtx.restore();
    }
  }

  // Divisão em placas metálicas com parafusos
  mapCtx.strokeStyle = "rgba(20, 25, 30, 0.5)";
  mapCtx.lineWidth = 2;
  mapCtx.strokeRect(0, 0, S, S);

  bumpCtx.strokeStyle = "#111111";
  bumpCtx.lineWidth = 3;
  bumpCtx.strokeRect(0, 0, S, S);

  const map = new THREE.CanvasTexture(mapCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;

  const res = { map, bump };
  textureCache.set(cacheKey, res);
  return res;
}

/**
 * Textura 6: Gramado e Piso Externo
 * Para o entorno externo do prédio.
 */
export function createOutdoorGroundMaterial(): THREE.MeshStandardMaterial {
  const S = 256;
  const [mapCanvas, mapCtx] = createCanvas(S, S);
  const [bumpCanvas, bumpCtx] = createCanvas(S, S);

  mapCtx.fillStyle = "#5c6b4e";
  mapCtx.fillRect(0, 0, S, S);

  bumpCtx.fillStyle = "#888888";
  bumpCtx.fillRect(0, 0, S, S);

  // Variações orgânicas de grama/terra
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = Math.random() * 2;
    const isLight = Math.random() > 0.45;
    mapCtx.fillStyle = isLight ? "rgba(110, 138, 88, 0.25)" : "rgba(65, 78, 52, 0.25)";
    mapCtx.fillRect(x, y, r, r);
  }

  const map = new THREE.CanvasTexture(mapCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(24, 18);

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(24, 18);

  return new THREE.MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.03,
    roughness: 0.96,
  });
}

/**
 * Cria o material customizado de piso para uma determinada sala do mapa de tiroteio.
 * Seleciona a textura ideal baseada no propósito arquitetônico da sala.
 */
export function createRoomFloorMaterial(room: Room): FloorMaterialSet {
  const name = room.name.toLowerCase();
  const baseColor = room.floor;

  let textures: { map: THREE.CanvasTexture; bump: THREE.CanvasTexture };
  let roughness: number;
  let metalness = 0.02;
  let bumpScale: number;
  let unitScale: number; // Quantos metros cada repetição da textura cobre

  if (name.includes("executiva") || name.includes("comandante") || name.includes("gestão")) {
    // Madeira corporativa / vinílico nobre
    textures = generateWoodPlankTextures(baseColor);
    roughness = 0.58;
    bumpScale = 0.035;
    unitScale = 1.5;
  } else if (name.includes("banheiro")) {
    // Cerâmica clara de banheiro
    textures = generateCeramicTextures(baseColor, false);
    roughness = 0.28;
    bumpScale = 0.03;
    unitScale = 0.8;
  } else if (name.includes("cozinha")) {
    // Cerâmica xadrez contemporânea da copa/cozinha
    textures = generateCeramicTextures(baseColor, true);
    roughness = 0.42;
    bumpScale = 0.025;
    unitScale = 0.9;
  } else if (name.includes("corredor")) {
    // Porcelanato acetinado do corredor central
    textures = generatePorcelainTextures(baseColor);
    roughness = 0.45;
    bumpScale = 0.02;
    unitScale = 1.4;
  } else if (name.includes("elevador")) {
    // Chapa metálica antiderrapante do elevador
    textures = generateMetalFloorTextures();
    roughness = 0.35;
    metalness = 0.72;
    bumpScale = 0.045;
    unitScale = 1.0;
  } else {
    // Carpete modular corporativo (Salas dos devs, infra, suporte, reuniões)
    textures = generateCarpetTextures(baseColor);
    roughness = 0.92;
    bumpScale = 0.03;
    unitScale = 1.1;
  }

  // Clona a textura para permitir escala (repeat) proporcional às dimensões exatas desta sala
  const roomMap = textures.map.clone();
  roomMap.repeat.set(room.w / unitScale, room.d / unitScale);
  roomMap.needsUpdate = true;

  const roomBump = textures.bump.clone();
  roomBump.repeat.set(room.w / unitScale, room.d / unitScale);
  roomBump.needsUpdate = true;

  const material = new THREE.MeshStandardMaterial({
    map: roomMap,
    bumpMap: roomBump,
    bumpScale,
    roughness,
    metalness,
  });

  return { material };
}
