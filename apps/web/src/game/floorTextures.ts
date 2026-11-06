import * as THREE from "three";
import type { Room } from "@ec/shared";

interface FloorMaterialSet {
  material: THREE.MeshStandardMaterial;
}

interface TextureSet {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  roughnessMap?: THREE.CanvasTexture;
}

// Cache de texturas geradas para evitar recriação desnecessária
const textureCache = new Map<string, TextureSet>();
const singleTexCache = new Map<string, THREE.CanvasTexture>();

/** Cria um canvas com configurações padrão para texturas procedurais (compatível com SSR/testes) */
function createCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  if (typeof document === "undefined") {
    return [{} as HTMLCanvasElement, null];
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  return [canvas, ctx];
}

function makeCanvasTex(canvas: HTMLCanvasElement, isColor = true, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  if (typeof document === "undefined" || !canvas.width) {
    const data = new Uint8Array([200, 200, 200, 255]);
    const t = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat) as unknown as THREE.CanvasTexture;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    if (isColor) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const tex = new THREE.CanvasTexture(canvas);
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

/** PRNG determinístico para que as texturas fiquem consistentes e sem custo de Math.random excessivo */
function createRng(seed = 1337): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
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
 * Placas modulares com trama têxtil bouclé cruzada, micro-relevo e juntas de encaixe.
 */
function generateCarpetTextures(baseColor: string): TextureSet {
  const cacheKey = `carpet_${baseColor}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const S = 512;
  const [mapCanvas, mapCtx] = createCanvas(S, S);
  const [bumpCanvas, bumpCtx] = createCanvas(S, S);
  const rng = createRng(101);

  if (mapCtx && bumpCtx) {
    mapCtx.fillStyle = baseColor;
    mapCtx.fillRect(0, 0, S, S);

    bumpCtx.fillStyle = "#808080";
    bumpCtx.fillRect(0, 0, S, S);

    const half = S / 2;
    const quads = [
      { x: 0, y: 0, dir: "h" },
      { x: half, y: 0, dir: "v" },
      { x: 0, y: half, dir: "v" },
      { x: half, y: half, dir: "h" },
    ];

    for (const q of quads) {
      const toneMod = (rng() - 0.5) * 7;
      mapCtx.fillStyle = shadeColor(baseColor, toneMod);
      mapCtx.fillRect(q.x + 2, q.y + 2, half - 4, half - 4);

      // Trama de tecido bouclé (linhas principais e cruzadas)
      const step = 4;
      for (let i = 0; i < half; i += step) {
        const alpha = 0.06 + rng() * 0.07;
        mapCtx.strokeStyle = rng() > 0.48 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 1.15})`;
        mapCtx.lineWidth = 1.6;
        mapCtx.beginPath();
        if (q.dir === "h") {
          mapCtx.moveTo(q.x, q.y + i);
          mapCtx.lineTo(q.x + half, q.y + i);
        } else {
          mapCtx.moveTo(q.x + i, q.y);
          mapCtx.lineTo(q.x + i, q.y + half);
        }
        mapCtx.stroke();

        // Relevo correspondente no bump map
        bumpCtx.strokeStyle = i % 8 === 0 ? "#9c9c9c" : "#666666";
        bumpCtx.lineWidth = 1.4;
        bumpCtx.beginPath();
        if (q.dir === "h") {
          bumpCtx.moveTo(q.x, q.y + i);
          bumpCtx.lineTo(q.x + half, q.y + i);
        } else {
          bumpCtx.moveTo(q.x + i, q.y);
          bumpCtx.lineTo(q.x + i, q.y + half);
        }
        bumpCtx.stroke();
      }
    }

    // Micro-ruído de fibra têxtil
    const imgData = mapCtx.getImageData(0, 0, S, S);
    const bumpData = bumpCtx.getImageData(0, 0, S, S);
    const data = imgData.data;
    const bData = bumpData.data;
    for (let i = 0; i < data.length; i += 4) {
      const grain = (rng() - 0.5) * 18;
      data[i] = Math.min(255, Math.max(0, data[i] + grain));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
      const bVal = Math.min(255, Math.max(0, bData[i] + grain * 1.8));
      bData[i] = bVal;
      bData[i + 1] = bVal;
      bData[i + 2] = bVal;
    }
    mapCtx.putImageData(imgData, 0, 0);
    bumpCtx.putImageData(bumpData, 0, 0);

    // Juntas entre placas de carpete com chanfro sutil
    mapCtx.strokeStyle = "rgba(0, 0, 0, 0.28)";
    mapCtx.lineWidth = 2.2;
    mapCtx.strokeRect(0, 0, S, S);
    mapCtx.beginPath();
    mapCtx.moveTo(half, 0);
    mapCtx.lineTo(half, S);
    mapCtx.moveTo(0, half);
    mapCtx.lineTo(S, half);
    mapCtx.stroke();

    bumpCtx.strokeStyle = "#1c1c1c";
    bumpCtx.lineWidth = 3;
    bumpCtx.strokeRect(0, 0, S, S);
    bumpCtx.beginPath();
    bumpCtx.moveTo(half, 0);
    bumpCtx.lineTo(half, S);
    bumpCtx.moveTo(0, half);
    bumpCtx.lineTo(S, half);
    bumpCtx.stroke();
  }

  const res: TextureSet = {
    map: makeCanvasTex(mapCanvas, true),
    bump: makeCanvasTex(bumpCanvas, false),
  };
  textureCache.set(cacheKey, res);
  return res;
}

/**
 * Textura 2: Piso Vinílico / Madeira Nobre (Réguas com Veios, Nós e Mapa de Rugosidade)
 */
function generateWoodPlankTextures(baseColor: string): TextureSet {
  const cacheKey = `wood_${baseColor}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const W = 512;
  const H = 512;
  const [mapCanvas, mapCtx] = createCanvas(W, H);
  const [bumpCanvas, bumpCtx] = createCanvas(W, H);
  const [roughCanvas, roughCtx] = createCanvas(W, H);
  const rng = createRng(202);

  if (mapCtx && bumpCtx && roughCtx) {
    mapCtx.fillStyle = baseColor;
    mapCtx.fillRect(0, 0, W, H);

    bumpCtx.fillStyle = "#989898";
    bumpCtx.fillRect(0, 0, W, H);

    // Rugosidade base envernizada (cinza médio = reflexo acetinado)
    roughCtx.fillStyle = "#787878";
    roughCtx.fillRect(0, 0, W, H);

    const numPlanks = 6;
    const plankH = H / numPlanks;

    for (let p = 0; p < numPlanks; p++) {
      const py = p * plankH;
      const plankVariation = (p % 2 === 0 ? 5 : -5) + (rng() * 6 - 3);
      const plankColor = shadeColor(baseColor, plankVariation);
      mapCtx.fillStyle = plankColor;
      mapCtx.fillRect(0, py, W, plankH);

      // Variação de brilho por régua no roughnessMap
      const rShade = Math.round(115 + (rng() - 0.5) * 24);
      roughCtx.fillStyle = `rgb(${rShade},${rShade},${rShade})`;
      roughCtx.fillRect(0, py, W, plankH);

      // Gradiente suave longitudinal na régua
      const grad = mapCtx.createLinearGradient(0, py, 0, py + plankH);
      grad.addColorStop(0, "rgba(255,255,255,0.05)");
      grad.addColorStop(0.5, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.07)");
      mapCtx.fillStyle = grad;
      mapCtx.fillRect(0, py, W, plankH);

      // Veios de madeira orgânicos em múltiplas camadas
      const grainCount = 22;
      for (let g = 0; g < grainCount; g++) {
        const gy = py + rng() * plankH;
        const alpha = 0.04 + rng() * 0.08;
        const isDark = rng() > 0.35;
        mapCtx.strokeStyle = isDark ? `rgba(35, 16, 4, ${alpha})` : `rgba(255, 242, 220, ${alpha * 0.75})`;
        mapCtx.lineWidth = 0.8 + rng() * 1.8;
        const c1y = gy + (rng() - 0.5) * 12;
        const c2y = gy + (rng() - 0.5) * 12;
        mapCtx.beginPath();
        mapCtx.moveTo(0, gy);
        mapCtx.bezierCurveTo(W * 0.33, c1y, W * 0.66, c2y, W, gy);
        mapCtx.stroke();

        // Micro-poros no bump e roughness
        if (isDark) {
          bumpCtx.strokeStyle = "rgba(70,70,70,0.35)";
          bumpCtx.lineWidth = 1.2;
          bumpCtx.beginPath();
          bumpCtx.moveTo(0, gy);
          bumpCtx.bezierCurveTo(W * 0.33, c1y, W * 0.66, c2y, W, gy);
          bumpCtx.stroke();

          roughCtx.strokeStyle = "rgba(175,175,175,0.3)";
          roughCtx.lineWidth = 1.2;
          roughCtx.beginPath();
          roughCtx.moveTo(0, gy);
          roughCtx.bezierCurveTo(W * 0.33, c1y, W * 0.66, c2y, W, gy);
          roughCtx.stroke();
        }
      }

      // Pequeno nó natural ocasional na madeira
      if (p % 2 === 1) {
        const kx = W * (0.2 + rng() * 0.6);
        const ky = py + plankH * (0.3 + rng() * 0.4);
        const kGrad = mapCtx.createRadialGradient(kx, ky, 1, kx, ky, 14);
        kGrad.addColorStop(0, "rgba(30, 14, 4, 0.28)");
        kGrad.addColorStop(0.6, "rgba(45, 22, 8, 0.12)");
        kGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        mapCtx.fillStyle = kGrad;
        mapCtx.beginPath();
        mapCtx.ellipse(kx, ky, 16, 7, 0, 0, Math.PI * 2);
        mapCtx.fill();
      }

      // Juntas verticais desencontradas entre tábuas
      const seamX = Math.round((p * (W * 0.37) + W * 0.19) % W);
      mapCtx.strokeStyle = "rgba(18, 8, 0, 0.48)";
      mapCtx.lineWidth = 2;
      mapCtx.beginPath();
      mapCtx.moveTo(seamX, py);
      mapCtx.lineTo(seamX, py + plankH);
      mapCtx.stroke();

      bumpCtx.strokeStyle = "#1f1f1f";
      bumpCtx.lineWidth = 3;
      bumpCtx.beginPath();
      bumpCtx.moveTo(seamX, py);
      bumpCtx.lineTo(seamX, py + plankH);
      bumpCtx.stroke();

      roughCtx.strokeStyle = "#e8e8e8";
      roughCtx.lineWidth = 3;
      roughCtx.beginPath();
      roughCtx.moveTo(seamX, py);
      roughCtx.lineTo(seamX, py + plankH);
      roughCtx.stroke();
    }

    // Linhas horizontais entre réguas (chanfros / bisotê)
    for (let p = 0; p <= numPlanks; p++) {
      const py = p * plankH;
      mapCtx.strokeStyle = "rgba(10, 5, 0, 0.42)";
      mapCtx.lineWidth = 2;
      mapCtx.beginPath();
      mapCtx.moveTo(0, py);
      mapCtx.lineTo(W, py);
      mapCtx.stroke();

      mapCtx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      mapCtx.lineWidth = 1;
      mapCtx.beginPath();
      mapCtx.moveTo(0, py + 2);
      mapCtx.lineTo(W, py + 2);
      mapCtx.stroke();

      bumpCtx.strokeStyle = "#181818";
      bumpCtx.lineWidth = 3;
      bumpCtx.beginPath();
      bumpCtx.moveTo(0, py);
      bumpCtx.lineTo(W, py);
      bumpCtx.stroke();

      roughCtx.strokeStyle = "#f0f0f0";
      roughCtx.lineWidth = 3;
      roughCtx.beginPath();
      roughCtx.moveTo(0, py);
      roughCtx.lineTo(W, py);
      roughCtx.stroke();
    }
  }

  const res: TextureSet = {
    map: makeCanvasTex(mapCanvas, true),
    bump: makeCanvasTex(bumpCanvas, false),
    roughnessMap: makeCanvasTex(roughCanvas, false),
  };
  textureCache.set(cacheKey, res);
  return res;
}

/**
 * Textura 3: Porcelanato Retificado Marmorizado de Grande Formato
 * Apresenta veios minerais suaves estilo Calacatta/Carrara, borda chanfrada e reflexo polido.
 */
function generatePorcelainTextures(baseColor: string): TextureSet {
  const cacheKey = `porcelain_${baseColor}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const S = 512;
  const [mapCanvas, mapCtx] = createCanvas(S, S);
  const [bumpCanvas, bumpCtx] = createCanvas(S, S);
  const [roughCanvas, roughCtx] = createCanvas(S, S);
  const rng = createRng(303);

  if (mapCtx && bumpCtx && roughCtx) {
    mapCtx.fillStyle = baseColor;
    mapCtx.fillRect(0, 0, S, S);

    bumpCtx.fillStyle = "#d8d8d8";
    bumpCtx.fillRect(0, 0, S, S);

    // Superfície polida acetinada (baixa rugosidade nas placas, alta no rejunte)
    roughCtx.fillStyle = "#585858";
    roughCtx.fillRect(0, 0, S, S);

    // Nuances minerais nebulosas
    for (let i = 0; i < 10; i++) {
      const cx = rng() * S;
      const cy = rng() * S;
      const r = 60 + rng() * 140;
      const grad = mapCtx.createRadialGradient(cx, cy, 8, cx, cy, r);
      grad.addColorStop(0, "rgba(255, 255, 255, 0.08)");
      grad.addColorStop(0.5, "rgba(180, 175, 168, 0.04)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      mapCtx.fillStyle = grad;
      mapCtx.beginPath();
      mapCtx.arc(cx, cy, r, 0, Math.PI * 2);
      mapCtx.fill();
    }

    // Veios sutis de mármore/porcelanato
    for (let v = 0; v < 5; v++) {
      const startX = rng() * S;
      const startY = rng() * S;
      mapCtx.strokeStyle = v % 2 === 0 ? "rgba(120, 115, 108, 0.11)" : "rgba(255, 255, 255, 0.16)";
      mapCtx.lineWidth = 1.2 + rng() * 2;
      mapCtx.beginPath();
      mapCtx.moveTo(startX, startY);
      mapCtx.bezierCurveTo(
        startX + (rng() - 0.3) * 180,
        startY + (rng() - 0.5) * 140,
        startX + (rng() - 0.3) * 320,
        startY + (rng() - 0.5) * 240,
        startX + 220,
        startY + 180,
      );
      mapCtx.stroke();
    }

    // Divisão 2x2 placas grandes no tile 512x512 para variedade
    const half = S / 2;
    // Bisotê iluminado nas bordas internas
    mapCtx.strokeStyle = "rgba(255, 255, 255, 0.32)";
    mapCtx.lineWidth = 2;
    mapCtx.strokeRect(3, 3, half - 6, half - 6);
    mapCtx.strokeRect(half + 3, 3, half - 6, half - 6);
    mapCtx.strokeRect(3, half + 3, half - 6, half - 6);
    mapCtx.strokeRect(half + 3, half + 3, half - 6, half - 6);

    // Rejunte ultrafino retificado
    const drawGrout = (ctx: CanvasRenderingContext2D, style: string, width: number) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.strokeRect(0, 0, S, S);
      ctx.beginPath();
      ctx.moveTo(half, 0);
      ctx.lineTo(half, S);
      ctx.moveTo(0, half);
      ctx.lineTo(S, half);
      ctx.stroke();
    };

    drawGrout(mapCtx, "rgba(75, 70, 65, 0.42)", 2.2);
    drawGrout(bumpCtx, "#282828", 3.2);
    drawGrout(roughCtx, "#f2f2f2", 3.5);
  }

  const res: TextureSet = {
    map: makeCanvasTex(mapCanvas, true),
    bump: makeCanvasTex(bumpCanvas, false),
    roughnessMap: makeCanvasTex(roughCanvas, false),
  };
  textureCache.set(cacheKey, res);
  return res;
}

/**
 * Textura 4: Cerâmica Esmaltada / Azulejos Geométricos
 * Para Banheiros e Cozinha/Copa.
 */
function generateCeramicTextures(baseColor: string, isKitchen = false): TextureSet {
  const cacheKey = `ceramic_${baseColor}_${isKitchen}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const S = 512;
  const [mapCanvas, mapCtx] = createCanvas(S, S);
  const [bumpCanvas, bumpCtx] = createCanvas(S, S);
  const [roughCanvas, roughCtx] = createCanvas(S, S);

  if (mapCtx && bumpCtx && roughCtx) {
    mapCtx.fillStyle = baseColor;
    mapCtx.fillRect(0, 0, S, S);

    bumpCtx.fillStyle = "#e0e0e0";
    bumpCtx.fillRect(0, 0, S, S);

    roughCtx.fillStyle = "#454545";
    roughCtx.fillRect(0, 0, S, S);

    const tiles = 4;
    const size = S / tiles;

    for (let x = 0; x < tiles; x++) {
      for (let y = 0; y < tiles; y++) {
        const px = x * size;
        const py = y * size;

        if (isKitchen && (x + y) % 2 === 1) {
          mapCtx.fillStyle = shadeColor(baseColor, -8);
          mapCtx.fillRect(px + 2, py + 2, size - 4, size - 4);
        } else {
          mapCtx.fillStyle = shadeColor(baseColor, ((x * 3 + y) % 3) - 1);
          mapCtx.fillRect(px + 2, py + 2, size - 4, size - 4);
        }

        // Brilho esmaltado suave no centro do azulejo
        const grad = mapCtx.createRadialGradient(
          px + size * 0.45,
          py + size * 0.45,
          4,
          px + size / 2,
          py + size / 2,
          size * 0.65,
        );
        grad.addColorStop(0, "rgba(255, 255, 255, 0.16)");
        grad.addColorStop(1, "rgba(0, 0, 0, 0.06)");
        mapCtx.fillStyle = grad;
        mapCtx.fillRect(px + 2, py + 2, size - 4, size - 4);

        // Borda chanfrada iluminada do azulejo
        mapCtx.strokeStyle = "rgba(255, 255, 255, 0.35)";
        mapCtx.lineWidth = 1.5;
        mapCtx.strokeRect(px + 3, py + 3, size - 6, size - 6);

        // Rejunte cerâmico
        mapCtx.strokeStyle = "rgba(45, 55, 65, 0.45)";
        mapCtx.lineWidth = 3;
        mapCtx.strokeRect(px, py, size, size);

        bumpCtx.strokeStyle = "#222222";
        bumpCtx.lineWidth = 4;
        bumpCtx.strokeRect(px, py, size, size);

        roughCtx.strokeStyle = "#efefef";
        roughCtx.lineWidth = 4.5;
        roughCtx.strokeRect(px, py, size, size);
      }
    }
  }

  const res: TextureSet = {
    map: makeCanvasTex(mapCanvas, true),
    bump: makeCanvasTex(bumpCanvas, false),
    roughnessMap: makeCanvasTex(roughCanvas, false),
  };
  textureCache.set(cacheKey, res);
  return res;
}

/**
 * Textura 5: Piso Técnico Industrial / Chapa Metálica Antiderrapante
 * Para Elevadores, Servidores e Infraestrutura.
 */
function generateMetalFloorTextures(): TextureSet {
  const cacheKey = "metal_elevator";
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)!;

  const S = 512;
  const [mapCanvas, mapCtx] = createCanvas(S, S);
  const [bumpCanvas, bumpCtx] = createCanvas(S, S);
  const [roughCanvas, roughCtx] = createCanvas(S, S);
  const rng = createRng(505);

  if (mapCtx && bumpCtx && roughCtx) {
    mapCtx.fillStyle = "#7e8791";
    mapCtx.fillRect(0, 0, S, S);

    bumpCtx.fillStyle = "#6e6e6e";
    bumpCtx.fillRect(0, 0, S, S);

    roughCtx.fillStyle = "#686868";
    roughCtx.fillRect(0, 0, S, S);

    // Micro-estrias de aço escovado
    for (let i = 0; i < S; i += 2) {
      const alpha = 0.05 + rng() * 0.06;
      mapCtx.strokeStyle = rng() > 0.5 ? `rgba(255, 255, 255, ${alpha})` : `rgba(0, 0, 0, ${alpha})`;
      mapCtx.lineWidth = 1;
      mapCtx.beginPath();
      mapCtx.moveTo(0, i);
      mapCtx.lineTo(S, i);
      mapCtx.stroke();
    }

    // Padrão de losangos/chapa xadrez antiderrapante
    const step = 32;
    for (let x = 16; x < S; x += step) {
      for (let y = 16; y < S; y += step) {
        const isAlt = ((x + y) / step) % 2 === 0;
        const angle = isAlt ? Math.PI / 4 : -Math.PI / 4;

        mapCtx.save();
        mapCtx.translate(x, y);
        mapCtx.rotate(angle);
        mapCtx.fillStyle = "rgba(235, 245, 255, 0.48)";
        mapCtx.fillRect(-7, -2.2, 14, 4.4);
        mapCtx.fillStyle = "rgba(20, 28, 36, 0.35)";
        mapCtx.fillRect(-7, 2.2, 14, 1.5);
        mapCtx.restore();

        bumpCtx.save();
        bumpCtx.translate(x, y);
        bumpCtx.rotate(angle);
        bumpCtx.fillStyle = "#ffffff";
        bumpCtx.fillRect(-7, -2.2, 14, 4.4);
        bumpCtx.restore();

        roughCtx.save();
        roughCtx.translate(x, y);
        roughCtx.rotate(angle);
        roughCtx.fillStyle = "#282828"; // Losangos polidos brilham mais
        roughCtx.fillRect(-7, -2.2, 14, 4.4);
        roughCtx.restore();
      }
    }

    // Divisão em 4 placas metálicas com parafusos nos cantos
    const half = S / 2;
    mapCtx.strokeStyle = "rgba(15, 20, 25, 0.65)";
    mapCtx.lineWidth = 3;
    mapCtx.strokeRect(0, 0, S, S);
    mapCtx.beginPath();
    mapCtx.moveTo(half, 0);
    mapCtx.lineTo(half, S);
    mapCtx.moveTo(0, half);
    mapCtx.lineTo(S, half);
    mapCtx.stroke();

    bumpCtx.strokeStyle = "#111111";
    bumpCtx.lineWidth = 4;
    bumpCtx.strokeRect(0, 0, S, S);
    bumpCtx.beginPath();
    bumpCtx.moveTo(half, 0);
    bumpCtx.lineTo(half, S);
    bumpCtx.moveTo(0, half);
    bumpCtx.lineTo(S, half);
    bumpCtx.stroke();
  }

  const res: TextureSet = {
    map: makeCanvasTex(mapCanvas, true),
    bump: makeCanvasTex(bumpCanvas, false),
    roughnessMap: makeCanvasTex(roughCanvas, false),
  };
  textureCache.set(cacheKey, res);
  return res;
}

/**
 * Textura 6: Gramado Natural Rico (Folhas de Grama, Trevo, Musgo e Micro-relevo)
 * Para o campo aberto do Tiroteio, platôs elevados e entorno externo.
 */
export function createOutdoorGroundMaterial(opts?: {
  repeatX?: number;
  repeatY?: number;
  baseColor?: string;
}): THREE.MeshStandardMaterial {
  const repeatX = opts?.repeatX ?? 24;
  const repeatY = opts?.repeatY ?? 18;
  const baseColor = opts?.baseColor ?? "#4e6e3a";
  const cacheKey = `outdoor_grass_${baseColor}`;

  let texSet = textureCache.get(cacheKey);
  if (!texSet) {
    const S = 512;
    const [mapCanvas, mapCtx] = createCanvas(S, S);
    const [bumpCanvas, bumpCtx] = createCanvas(S, S);
    const rng = createRng(606);

    if (mapCtx && bumpCtx) {
      mapCtx.fillStyle = baseColor;
      mapCtx.fillRect(0, 0, S, S);

      bumpCtx.fillStyle = "#787878";
      bumpCtx.fillRect(0, 0, S, S);

      // Manchas orgânicas suaves de solo úmido e grama mais clara/escura
      for (let i = 0; i < 28; i++) {
        const cx = rng() * S;
        const cy = rng() * S;
        const r = 35 + rng() * 95;
        const isLush = rng() > 0.45;
        const grad = mapCtx.createRadialGradient(cx, cy, 4, cx, cy, r);
        grad.addColorStop(0, isLush ? "rgba(118, 165, 68, 0.22)" : "rgba(52, 74, 36, 0.22)");
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        mapCtx.fillStyle = grad;
        mapCtx.beginPath();
        mapCtx.arc(cx, cy, r, 0, Math.PI * 2);
        mapCtx.fill();
      }

      // Milhares de tufos e lâminas de grama individuais
      for (let i = 0; i < 6500; i++) {
        const x = rng() * S;
        const y = rng() * S;
        const bladeH = 3 + rng() * 5;
        const tilt = (rng() - 0.5) * 2.5;
        const pick = rng();
        if (pick < 0.38) {
          mapCtx.strokeStyle = "rgba(130, 178, 75, 0.34)";
          bumpCtx.strokeStyle = "#b0b0b0";
        } else if (pick < 0.75) {
          mapCtx.strokeStyle = "rgba(62, 92, 42, 0.36)";
          bumpCtx.strokeStyle = "#525252";
        } else {
          mapCtx.strokeStyle = "rgba(168, 198, 86, 0.28)";
          bumpCtx.strokeStyle = "#d0d0d0";
        }
        mapCtx.lineWidth = 1.2;
        mapCtx.beginPath();
        mapCtx.moveTo(x, y);
        mapCtx.lineTo(x + tilt, y - bladeH);
        mapCtx.stroke();

        if (i % 2 === 0) {
          bumpCtx.lineWidth = 1.2;
          bumpCtx.beginPath();
          bumpCtx.moveTo(x, y);
          bumpCtx.lineTo(x + tilt, y - bladeH);
          bumpCtx.stroke();
        }
      }
    }

    texSet = {
      map: makeCanvasTex(mapCanvas, true),
      bump: makeCanvasTex(bumpCanvas, false),
    };
    textureCache.set(cacheKey, texSet);
  }

  const map = texSet.map.clone();
  map.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;

  const bump = texSet.bump.clone();
  bump.repeat.set(repeatX, repeatY);
  bump.needsUpdate = true;

  return new THREE.MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.04,
    roughness: 0.9,
    metalness: 0.02,
  });
}

/**
 * Textura 7: Parede Arquitetônica Corporativa (Gesso Acartonado / Painéis Acústicos + Sombra AO de Rodapé)
 */
export function createWallMaterial(baseColor = "#cfd8dc", repeatX = 1, repeatY = 1): THREE.MeshStandardMaterial {
  const cacheKey = `wall_${baseColor}`;
  let texSet = textureCache.get(cacheKey);
  if (!texSet) {
    const S = 512;
    const [mapCanvas, mapCtx] = createCanvas(S, S);
    const [bumpCanvas, bumpCtx] = createCanvas(S, S);
    const rng = createRng(707);

    if (mapCtx && bumpCtx) {
      mapCtx.fillStyle = baseColor;
      mapCtx.fillRect(0, 0, S, S);

      bumpCtx.fillStyle = "#808080";
      bumpCtx.fillRect(0, 0, S, S);

      // Gradiente vertical sutil: iluminação suave no topo e oclusão de ambiente (AO) na base
      const vGrad = mapCtx.createLinearGradient(0, 0, 0, S);
      vGrad.addColorStop(0, "rgba(255, 255, 255, 0.08)");
      vGrad.addColorStop(0.15, "rgba(255, 255, 255, 0)");
      vGrad.addColorStop(0.82, "rgba(0, 0, 0, 0)");
      vGrad.addColorStop(1, "rgba(15, 23, 42, 0.18)");
      mapCtx.fillStyle = vGrad;
      mapCtx.fillRect(0, 0, S, S);

      // Granulação fina de pintura acrílica / estuque veneziano
      for (let i = 0; i < 4500; i++) {
        const x = rng() * S;
        const y = rng() * S;
        const isLight = rng() > 0.5;
        mapCtx.fillStyle = isLight ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
        mapCtx.fillRect(x, y, 2, 2);
        bumpCtx.fillStyle = isLight ? "#8d8d8d" : "#737373";
        bumpCtx.fillRect(x, y, 2, 2);
      }

      // Frisos verticais de painéis arquitetônicos modulares
      for (const px of [128, 256, 384]) {
        mapCtx.strokeStyle = "rgba(30, 41, 59, 0.14)";
        mapCtx.lineWidth = 2;
        mapCtx.beginPath();
        mapCtx.moveTo(px, 0);
        mapCtx.lineTo(px, S);
        mapCtx.stroke();

        mapCtx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        mapCtx.lineWidth = 1;
        mapCtx.beginPath();
        mapCtx.moveTo(px + 2, 0);
        mapCtx.lineTo(px + 2, S);
        mapCtx.stroke();

        bumpCtx.strokeStyle = "#484848";
        bumpCtx.lineWidth = 2.5;
        bumpCtx.beginPath();
        bumpCtx.moveTo(px, 0);
        bumpCtx.lineTo(px, S);
        bumpCtx.stroke();
      }

      // Friso horizontal decorativo (wainscoting) no terço inferior
      const wy = Math.round(S * 0.62);
      mapCtx.strokeStyle = "rgba(30, 41, 59, 0.18)";
      mapCtx.lineWidth = 3;
      mapCtx.beginPath();
      mapCtx.moveTo(0, wy);
      mapCtx.lineTo(S, wy);
      mapCtx.stroke();

      bumpCtx.strokeStyle = "#383838";
      bumpCtx.lineWidth = 3.5;
      bumpCtx.beginPath();
      bumpCtx.moveTo(0, wy);
      bumpCtx.lineTo(S, wy);
      bumpCtx.stroke();
    }

    texSet = {
      map: makeCanvasTex(mapCanvas, true),
      bump: makeCanvasTex(bumpCanvas, false),
    };
    textureCache.set(cacheKey, texSet);
  }

  const map = texSet.map.clone();
  map.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;

  const bump = texSet.bump.clone();
  bump.repeat.set(repeatX, repeatY);
  bump.needsUpdate = true;

  return new THREE.MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.02,
    roughness: 0.72,
    metalness: 0.03,
  });
}

/**
 * Textura 8: Madeira Marcenaria / Rústica (Mesas Executivas, Bancadas, Degraus e Capas de Mureta)
 */
export function createWoodMaterial(
  baseColor = "#6d4c41",
  roughness = 0.42,
  repeatX = 1,
  repeatY = 1,
): THREE.MeshStandardMaterial {
  const textures = generateWoodPlankTextures(baseColor);
  const map = textures.map.clone();
  map.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;

  const bump = textures.bump.clone();
  bump.repeat.set(repeatX, repeatY);
  bump.needsUpdate = true;

  const rough = textures.roughnessMap?.clone();
  if (rough) {
    rough.repeat.set(repeatX, repeatY);
    rough.needsUpdate = true;
  }

  return new THREE.MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.025,
    roughnessMap: rough,
    roughness,
    metalness: 0.04,
  });
}

/**
 * Textura 9: Alvenaria de Pedra / Mureta Rústica com Rejunte Profundo
 */
export function createStoneMaterial(baseColor = "#757c82", repeatX = 2, repeatY = 1): THREE.MeshStandardMaterial {
  const cacheKey = `stone_${baseColor}`;
  let texSet = textureCache.get(cacheKey);
  if (!texSet) {
    const S = 512;
    const [mapCanvas, mapCtx] = createCanvas(S, S);
    const [bumpCanvas, bumpCtx] = createCanvas(S, S);
    const rng = createRng(808);

    if (mapCtx && bumpCtx) {
      mapCtx.fillStyle = baseColor;
      mapCtx.fillRect(0, 0, S, S);

      bumpCtx.fillStyle = "#b0b0b0";
      bumpCtx.fillRect(0, 0, S, S);

      const rows = 4;
      const rowH = S / rows;
      for (let r = 0; r < rows; r++) {
        const y = r * rowH;
        const cols = 3;
        const colW = S / cols;
        const offset = (r % 2) * (colW * 0.5);

        for (let c = -1; c <= cols; c++) {
          const x = c * colW + offset;
          const tone = (rng() - 0.5) * 18;
          mapCtx.fillStyle = shadeColor(baseColor, tone);
          mapCtx.fillRect(x + 4, y + 4, colW - 8, rowH - 8);

          // Luz na borda superior do bloco de pedra e sombra na inferior
          mapCtx.fillStyle = "rgba(255,255,255,0.16)";
          mapCtx.fillRect(x + 4, y + 4, colW - 8, 4);
          mapCtx.fillStyle = "rgba(0,0,0,0.22)";
          mapCtx.fillRect(x + 4, y + rowH - 8, colW - 8, 4);

          // Rejunte de argamassa entre pedras
          mapCtx.strokeStyle = "rgba(35, 38, 42, 0.65)";
          mapCtx.lineWidth = 5;
          mapCtx.strokeRect(x, y, colW, rowH);

          bumpCtx.strokeStyle = "#1a1a1a";
          bumpCtx.lineWidth = 7;
          bumpCtx.strokeRect(x, y, colW, rowH);
        }
      }

      // Granulação mineral nas pedras
      for (let i = 0; i < 3500; i++) {
        const gx = rng() * S;
        const gy = rng() * S;
        const isLight = rng() > 0.5;
        mapCtx.fillStyle = isLight ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)";
        mapCtx.fillRect(gx, gy, 2.5, 2.5);
        bumpCtx.fillStyle = isLight ? "#d4d4d4" : "#686868";
        bumpCtx.fillRect(gx, gy, 2.5, 2.5);
      }
    }

    texSet = {
      map: makeCanvasTex(mapCanvas, true),
      bump: makeCanvasTex(bumpCanvas, false),
    };
    textureCache.set(cacheKey, texSet);
  }

  const map = texSet.map.clone();
  map.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;

  const bump = texSet.bump.clone();
  bump.repeat.set(repeatX, repeatY);
  bump.needsUpdate = true;

  return new THREE.MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.05,
    roughness: 0.86,
    metalness: 0.04,
  });
}

/**
 * Textura 10: Terra Estratificada e Rocha (Encostas de Colinas / Platôs)
 */
export function createEarthMaterial(baseColor = "#54463a", repeatX = 3, repeatY = 1): THREE.MeshStandardMaterial {
  const cacheKey = `earth_${baseColor}`;
  let texSet = textureCache.get(cacheKey);
  if (!texSet) {
    const S = 512;
    const [mapCanvas, mapCtx] = createCanvas(S, S);
    const [bumpCanvas, bumpCtx] = createCanvas(S, S);
    const rng = createRng(909);

    if (mapCtx && bumpCtx) {
      mapCtx.fillStyle = baseColor;
      mapCtx.fillRect(0, 0, S, S);

      bumpCtx.fillStyle = "#808080";
      bumpCtx.fillRect(0, 0, S, S);

      // Camadas sedimentares onduladas
      for (let l = 0; l < 14; l++) {
        const ly = (l / 14) * S;
        mapCtx.strokeStyle = l % 2 === 0 ? "rgba(30, 20, 12, 0.25)" : "rgba(140, 115, 90, 0.18)";
        mapCtx.lineWidth = 6 + rng() * 10;
        mapCtx.beginPath();
        mapCtx.moveTo(0, ly);
        mapCtx.bezierCurveTo(S * 0.3, ly + (rng() - 0.5) * 28, S * 0.7, ly + (rng() - 0.5) * 28, S, ly);
        mapCtx.stroke();

        bumpCtx.strokeStyle = l % 2 === 0 ? "#454545" : "#b8b8b8";
        bumpCtx.lineWidth = 5;
        bumpCtx.beginPath();
        bumpCtx.moveTo(0, ly);
        bumpCtx.bezierCurveTo(S * 0.3, ly + (rng() - 0.5) * 28, S * 0.7, ly + (rng() - 0.5) * 28, S, ly);
        bumpCtx.stroke();
      }

      // Pedregulhos embutidos no solo
      for (let i = 0; i < 160; i++) {
        const px = rng() * S;
        const py = rng() * S;
        const r = 3 + rng() * 8;
        mapCtx.fillStyle = rng() > 0.5 ? "rgba(110, 105, 98, 0.45)" : "rgba(40, 30, 22, 0.45)";
        mapCtx.beginPath();
        mapCtx.arc(px, py, r, 0, Math.PI * 2);
        mapCtx.fill();

        bumpCtx.fillStyle = "#d8d8d8";
        bumpCtx.beginPath();
        bumpCtx.arc(px, py, r, 0, Math.PI * 2);
        bumpCtx.fill();
      }
    }

    texSet = {
      map: makeCanvasTex(mapCanvas, true),
      bump: makeCanvasTex(bumpCanvas, false),
    };
    textureCache.set(cacheKey, texSet);
  }

  const map = texSet.map.clone();
  map.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;

  const bump = texSet.bump.clone();
  bump.repeat.set(repeatX, repeatY);
  bump.needsUpdate = true;

  return new THREE.MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.055,
    roughness: 0.94,
  });
}

/**
 * Textura 11: Folhagem Densa de Sebes e Arbustos
 */
export function createBushMaterial(baseColor = "#3d6e32", repeatX = 2, repeatY = 2): THREE.MeshStandardMaterial {
  const cacheKey = `bush_${baseColor}`;
  let texSet = textureCache.get(cacheKey);
  if (!texSet) {
    const S = 256;
    const [mapCanvas, mapCtx] = createCanvas(S, S);
    const [bumpCanvas, bumpCtx] = createCanvas(S, S);
    const rng = createRng(1010);

    if (mapCtx && bumpCtx) {
      mapCtx.fillStyle = baseColor;
      mapCtx.fillRect(0, 0, S, S);

      bumpCtx.fillStyle = "#606060";
      bumpCtx.fillRect(0, 0, S, S);

      // Centenas de folhas sobrepostas com profundidade
      for (let i = 0; i < 420; i++) {
        const lx = rng() * S;
        const ly = rng() * S;
        const rx = 5 + rng() * 9;
        const ry = 3 + rng() * 5;
        const ang = rng() * Math.PI;
        const shade = (rng() - 0.42) * 28;

        mapCtx.save();
        mapCtx.translate(lx, ly);
        mapCtx.rotate(ang);
        mapCtx.fillStyle = shadeColor(baseColor, shade);
        mapCtx.beginPath();
        mapCtx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        mapCtx.fill();
        mapCtx.strokeStyle = "rgba(15, 35, 10, 0.35)";
        mapCtx.lineWidth = 1;
        mapCtx.stroke();
        mapCtx.restore();

        bumpCtx.save();
        bumpCtx.translate(lx, ly);
        bumpCtx.rotate(ang);
        bumpCtx.fillStyle = shade > 0 ? "#d0d0d0" : "#505050";
        bumpCtx.beginPath();
        bumpCtx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        bumpCtx.fill();
        bumpCtx.restore();
      }
    }

    texSet = {
      map: makeCanvasTex(mapCanvas, true),
      bump: makeCanvasTex(bumpCanvas, false),
    };
    textureCache.set(cacheKey, texSet);
  }

  const map = texSet.map.clone();
  map.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;

  const bump = texSet.bump.clone();
  bump.repeat.set(repeatX, repeatY);
  bump.needsUpdate = true;

  return new THREE.MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.045,
    roughness: 0.82,
  });
}

/**
 * Textura 12: Estofado de Tecido / Linho Corporativo (Sofás e Poltronas)
 */
export function createFabricMaterial(baseColor = "#334155", repeatX = 2, repeatY = 2): THREE.MeshStandardMaterial {
  const cacheKey = `fabric_${baseColor}`;
  let texSet = textureCache.get(cacheKey);
  if (!texSet) {
    const S = 256;
    const [mapCanvas, mapCtx] = createCanvas(S, S);
    const [bumpCanvas, bumpCtx] = createCanvas(S, S);

    if (mapCtx && bumpCtx) {
      mapCtx.fillStyle = baseColor;
      mapCtx.fillRect(0, 0, S, S);

      bumpCtx.fillStyle = "#808080";
      bumpCtx.fillRect(0, 0, S, S);

      for (let i = 0; i < S; i += 3) {
        mapCtx.fillStyle = i % 6 === 0 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
        mapCtx.fillRect(0, i, S, 1.5);
        mapCtx.fillRect(i, 0, 1.5, S);

        bumpCtx.fillStyle = i % 6 === 0 ? "#a8a8a8" : "#585858";
        bumpCtx.fillRect(0, i, S, 1.5);
        bumpCtx.fillRect(i, 0, 1.5, S);
      }
    }

    texSet = {
      map: makeCanvasTex(mapCanvas, true),
      bump: makeCanvasTex(bumpCanvas, false),
    };
    textureCache.set(cacheKey, texSet);
  }

  const map = texSet.map.clone();
  map.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;

  const bump = texSet.bump.clone();
  bump.repeat.set(repeatX, repeatY);
  bump.needsUpdate = true;

  return new THREE.MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.02,
    roughness: 0.78,
  });
}

/**
 * Textura 13: Telas de Monitores Corporativos (IDE de Código, Gráficos Financeiros, Dashboard de Suporte)
 */
export function createMonitorScreenMaterial(
  theme: "code" | "chart" | "dashboard" | "security",
): THREE.MeshStandardMaterial {
  const cacheKey = `screen_${theme}`;
  let tex = singleTexCache.get(cacheKey);
  if (!tex) {
    const W = 256;
    const H = 160;
    const [canvas, ctx] = createCanvas(W, H);
    const rng = createRng(theme.charCodeAt(0) * 97);

    if (ctx) {
      // Fundo dark mode da tela
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, W, H);

      // Barra superior da janela
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, W, 18);
      const dots = ["#ef4444", "#f59e0b", "#22c55e"];
      dots.forEach((c, idx) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(12 + idx * 12, 9, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });

      if (theme === "code") {
        // Sidebar
        ctx.fillStyle = "#131c31";
        ctx.fillRect(0, 18, 44, H - 18);
        for (let y = 26; y < H - 12; y += 10) {
          ctx.fillStyle = "#475569";
          ctx.fillRect(8, y, 22 + (y % 12), 4);
        }
        // Linhas de código coloridas
        const palette = ["#38bdf8", "#a78bfa", "#4ade80", "#f472b6", "#fbbf24", "#94a3b8"];
        for (let y = 26; y < H - 28; y += 9) {
          const indent = 54 + ((y * 7) % 3) * 12;
          let cx = indent;
          for (let seg = 0; seg < 3; seg++) {
            const w = 14 + Math.floor(rng() * 38);
            if (cx + w > W - 10) break;
            ctx.fillStyle = palette[Math.floor(rng() * palette.length)];
            ctx.fillRect(cx, y, w, 4.5);
            cx += w + 6;
          }
        }
        // Terminal inferior
        ctx.fillStyle = "#090d16";
        ctx.fillRect(44, H - 26, W - 44, 26);
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(52, H - 16, 85, 4);
      } else if (theme === "chart") {
        // Cards de KPI no topo
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = "#1e293b";
          ctx.fillRect(12 + i * 80, 26, 72, 28);
          ctx.fillStyle = i === 2 ? "#f87171" : "#4ade80";
          ctx.fillRect(18 + i * 80, 34, 42, 6);
          ctx.fillStyle = "#94a3b8";
          ctx.fillRect(18 + i * 80, 44, 54, 4);
        }
        // Gráfico de barras financeiras
        const barColors = ["#22c55e", "#10b981", "#38bdf8", "#4ade80", "#f59e0b", "#22c55e", "#34d399"];
        for (let b = 0; b < 7; b++) {
          const bh = 25 + ((b * 19 + 11) % 58);
          const bx = 20 + b * 31;
          ctx.fillStyle = barColors[b % barColors.length];
          ctx.fillRect(bx, H - 16 - bh, 20, bh);
        }
        // Linha de tendência ascendente
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(20, H - 35);
        ctx.lineTo(75, H - 55);
        ctx.lineTo(130, H - 48);
        ctx.lineTo(185, H - 78);
        ctx.lineTo(235, H - 92);
        ctx.stroke();
      } else if (theme === "dashboard") {
        // Painel de chamados e velocímetro de SLA
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(58, 86, 32, Math.PI * 0.8, Math.PI * 2.2);
        ctx.stroke();
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(44, 82, 28, 8);

        for (let r = 0; r < 5; r++) {
          const ry = 32 + r * 22;
          ctx.fillStyle = "#1e293b";
          ctx.fillRect(110, ry, 132, 16);
          ctx.fillStyle = r === 1 ? "#f59e0b" : "#38bdf8";
          ctx.fillRect(116, ry + 5, 68 + (r % 3) * 16, 6);
        }
      } else {
        // Security / Servidores Matrix
        ctx.strokeStyle = "rgba(0, 230, 118, 0.22)";
        ctx.lineWidth = 1;
        for (let x = 16; x < W; x += 24) {
          ctx.beginPath();
          ctx.moveTo(x, 20);
          ctx.lineTo(x, H);
          ctx.stroke();
        }
        for (let y = 26; y < H; y += 20) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
        }
        ctx.strokeStyle = "#00e676";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let x = 10; x < W - 10; x += 12) {
          const py = 90 + Math.sin(x * 0.15) * 28;
          if (x === 10) ctx.moveTo(x, py);
          else ctx.lineTo(x, py);
        }
        ctx.stroke();
      }
    }

    tex = makeCanvasTex(canvas, true);
    singleTexCache.set(cacheKey, tex);
  }

  return new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: new THREE.Color("#ffffff"),
    emissiveIntensity: 0.72,
    roughness: 0.18,
    metalness: 0.1,
  });
}

/**
 * Textura 14: Painel Frontal de Rack de Servidores com Grade Colmeia e LEDs
 */
export function createServerRackMaterial(): THREE.MeshStandardMaterial {
  const cacheKey = "server_rack_face";
  let tex = singleTexCache.get(cacheKey);
  if (!tex) {
    const W = 256;
    const H = 512;
    const [canvas, ctx] = createCanvas(W, H);

    if (ctx) {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, W, H);

      // Moldura metálica lateral do rack 19"
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, 18, H);
      ctx.fillRect(W - 18, 0, 18, H);

      // Baias de servidores blade (1U / 2U)
      for (let y = 16; y < H - 24; y += 36) {
        ctx.fillStyle = "#162032";
        ctx.fillRect(22, y, W - 44, 30);
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(22, y, W - 44, 30);

        // Grade de ventilação escura
        ctx.fillStyle = "#090d16";
        for (let gx = 30; gx < W - 85; gx += 12) {
          ctx.fillRect(gx, y + 6, 8, 18);
        }

        // LEDs de status e atividade de rede
        ctx.fillStyle = y % 72 === 0 ? "#38bdf8" : "#00e676";
        ctx.fillRect(W - 68, y + 11, 8, 8);
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(W - 54, y + 11, 8, 8);
        if (y % 108 === 16) {
          ctx.fillStyle = "#f59e0b";
          ctx.fillRect(W - 40, y + 11, 8, 8);
        }
      }
    }

    tex = makeCanvasTex(canvas, true);
    singleTexCache.set(cacheKey, tex);
  }

  return new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: new THREE.Color("#ffffff"),
    emissiveIntensity: 0.45,
    roughness: 0.35,
    metalness: 0.5,
  });
}

/**
 * Cria o material customizado de piso para uma determinada sala do mapa.
 * Seleciona a textura ideal (com map, bumpMap e roughnessMap) baseada no propósito arquitetônico da sala.
 */
export function createRoomFloorMaterial(room: Room): FloorMaterialSet {
  const name = room.name.toLowerCase();
  const baseColor = room.floor;

  let textures: TextureSet;
  let roughness: number;
  let metalness = 0.04;
  let bumpScale: number;
  let unitScale: number;

  if (name.includes("executiva") || name.includes("comandante") || name.includes("gestão")) {
    textures = generateWoodPlankTextures(baseColor);
    roughness = 0.42;
    bumpScale = 0.035;
    unitScale = 1.5;
  } else if (name.includes("banheiro")) {
    textures = generateCeramicTextures(baseColor, false);
    roughness = 0.24;
    bumpScale = 0.03;
    unitScale = 0.85;
  } else if (name.includes("cozinha") || name.includes("copa")) {
    textures = generateCeramicTextures(baseColor, true);
    roughness = 0.32;
    bumpScale = 0.028;
    unitScale = 0.95;
  } else if (name.includes("corredor") || name.includes("recepção")) {
    textures = generatePorcelainTextures(baseColor);
    roughness = 0.32;
    bumpScale = 0.022;
    unitScale = 1.6;
  } else if (name.includes("elevador") || name.includes("técnico")) {
    textures = generateMetalFloorTextures();
    roughness = 0.32;
    metalness = 0.72;
    bumpScale = 0.045;
    unitScale = 1.1;
  } else {
    textures = generateCarpetTextures(baseColor);
    roughness = 0.88;
    bumpScale = 0.032;
    unitScale = 1.15;
  }

  const rx = Math.max(1, room.w / unitScale);
  const ry = Math.max(1, room.d / unitScale);

  const roomMap = textures.map.clone();
  roomMap.repeat.set(rx, ry);
  roomMap.needsUpdate = true;

  const roomBump = textures.bump.clone();
  roomBump.repeat.set(rx, ry);
  roomBump.needsUpdate = true;

  const roomRough = textures.roughnessMap?.clone();
  if (roomRough) {
    roomRough.repeat.set(rx, ry);
    roomRough.needsUpdate = true;
  }

  const material = new THREE.MeshStandardMaterial({
    map: roomMap,
    bumpMap: roomBump,
    bumpScale,
    roughnessMap: roomRough,
    roughness,
    metalness,
  });

  return { material };
}
