import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { branchEdges, corkscrewRoll, gridSlots, heightAt, pathProgress, pointAt, progressOf, sideNormal, trackEdges, RACE, type Ramp, type Track, type Vec2 } from "@ec/shared";
import { applyWaxedFloorSheen } from "./vfxJuice";
import parqueUrl from "../assets/itens/parque-ipanema-3d.glb?url";
import rampGlbUrl from "../assets/itens/ramp-jump.glb?url";
import { createGltfLoader } from "../game/gltfLoader";

let parqueModel: THREE.Group | null = null;
let parquePromise: Promise<THREE.Group | null> | null = null;

export function preloadParque(): Promise<THREE.Group | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(null);
  if (parqueModel) return Promise.resolve(parqueModel);
  parquePromise ??= createGltfLoader()
    .loadAsync(parqueUrl)
    .then((gltf) => {
      parqueModel = gltf.scene;
      return gltf.scene;
    })
    .catch((err) => {
      console.warn("parque-ipanema-3d.glb não carregou", err);
      return null;
    });
  return parquePromise;
}

let rampModel: THREE.Group | null = null;
let rampPromise: Promise<THREE.Group | null> | null = null;

export function preloadRamp(): Promise<THREE.Group | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(null);
  if (rampModel) return Promise.resolve(rampModel);
  rampPromise ??= createGltfLoader()
    .loadAsync(rampGlbUrl)
    .then((gltf) => {
      rampModel = gltf.scene;
      return gltf.scene;
    })
    .catch((err) => {
      console.warn("ramp-jump.glb não carregou", err);
      return null;
    });
  return rampPromise;
}

/** Piso de cada ambiente (nomes de track.rooms, de todas as pistas). */
const ROOM_FLOOR: Record<string, string> = {
  Recepção: "#d48148",
  Corredor: "#3a7fbe",
  "Ilhas de mesas": "#2a5499",
  Copa: "#e5a72f",
  "Sala de reunião": "#8b45be",
  TI: "#1c8c65",
  Cancela: "#6b6f74",
  Vagas: "#56595e",
  Rampa: "#7b7f86",
  Pilares: "#4f5358",
  "Vagas do fundo": "#56595e",
  Balcão: "#d9cfb8",
  Mesas: "#c3b79c",
  Geladeira: "#b8c4c8",
  Cafeteira: "#a88b6c",
  Arquibancadas: "#474b54",
  "Orla do Lago": "#3c4854",
  "Reta das Palmeiras": "#3e4d44",
  "Reta dos Ipês": "#4d424b",
  "Curva do Mirante": "#3d4a46",
  Moinho: "#4c463f",
  Caramanchão: "#463e4c",
  Bosque: "#3d4b42",
  "Largada do Cânion": "#d29b68",
  "Oásis do Sertão": "#387d70",
  "Dunas Escaldantes": "#dfaa6b",
  "Maciço Rochoso": "#8b6852",
  "Túnel da Caverna": "#4a382c",
  "Salto do Abismo": "#a65d38",
  "Vilarejo de Adobe": "#b8774e",
};
const ROOM_WALL: Record<string, string> = {
  Recepção: "#fff5ea",
  Corredor: "#f0f5fb",
  "Ilhas de mesas": "#e2ecf7",
  Copa: "#fdf8ee",
  "Sala de reunião": "glass",
  TI: "#e6f5ef",
  Cancela: "#f2c230",
  Vagas: "#f2c230",
  Rampa: "#f2c230",
  Pilares: "#f2c230",
  "Vagas do fundo": "#f2c230",
  Balcão: "#ece6da",
  Mesas: "#e3d8c3",
  Geladeira: "#ece6da",
  Cafeteira: "#8a6a4a",
  Arquibancadas: "#27ae60",
  "Orla do Lago": "#27ae60",
  "Reta das Palmeiras": "#27ae60",
  "Reta dos Ipês": "#27ae60",
  "Curva do Mirante": "#27ae60",
  Moinho: "#27ae60",
  Caramanchão: "#27ae60",
  Bosque: "#27ae60",
  "Largada do Cânion": "#f0dfcc",
  "Oásis do Sertão": "#d8ece6",
  "Dunas Escaldantes": "#f7ebd8",
  "Maciço Rochoso": "#d9c8bd",
  "Túnel da Caverna": "#826c5f",
  "Salto do Abismo": "#edd4c7",
  "Vilarejo de Adobe": "#f3dfd1",
};

function roomAt(track: Track, s: number): string {
  const L = track.length;
  const ss = ((s % L) + L) % L;
  let name = track.rooms[0].name;
  for (const r of track.rooms) if (ss >= track.ctrlS[r.ctrl]) name = r.name;
  return name;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Placa de sinalização: subtítulo pequeno e o nome do ambiente em destaque. */
function textSprite(text: string, textures: THREE.Texture[], subtitle = "Setor corporativo", isDeserto = false): THREE.Sprite {
  if (typeof document === "undefined") {
    const data = new Uint8Array([255, 255, 255, 255]);
    const map = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    textures.push(map);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map }));
    s.scale.set(4.8, 1.5, 1);
    return s;
  }
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 160;
  const g = c.getContext("2d")!;
  g.fillStyle = isDeserto ? "#3e2718" : "#1e2430";
  g.fillRect(0, 0, 512, 160);
  g.fillStyle = isDeserto ? "#d9a566" : "#ffd23f";
  g.fillRect(8, 8, 496, 144);
  g.fillStyle = isDeserto ? "#3e2718" : "#1e2430";
  g.textAlign = "center";
  g.font = "800 24px 'Bricolage Grotesque', sans-serif";
  g.fillText(subtitle.toUpperCase(), 256, 42);
  g.font = "900 52px 'Bricolage Grotesque', sans-serif";
  g.fillText(text.toUpperCase(), 256, 105);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  textures.push(map);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map }));
  s.scale.set(4.8, 1.5, 1);
  return s;
}

function checkerTexture(textures: THREE.Texture[]): THREE.CanvasTexture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([255, 255, 255, 255]);
    const t = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat) as unknown as THREE.CanvasTexture;
    textures.push(t);
    return t;
  }
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
  textures.push(t);
  return t;
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, textures: THREE.Texture[]): THREE.CanvasTexture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([255, 255, 255, 255]);
    const t = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat) as unknown as THREE.CanvasTexture;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    textures.push(t);
    return t;
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  textures.push(t);
  return t;
}

/** Piso da pista em placas desencontradas, rejunte escuro, faixas de borracha e granulado (branco: a cor do ambiente vem dos vértices). */
function trackTexture(textures: THREE.Texture[]): THREE.CanvasTexture {
  return canvasTexture(
    512,
    512,
    (g) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 512, 512);
      const colW = 256;
      const rowH = 128;
      for (let r = 0; r < 4; r++) {
        const offsetX = r % 2 === 1 ? colW / 2 : 0;
        for (let c = -1; c <= 3; c++) {
          const x = c * colW + offsetX;
          const y = r * rowH;
          g.fillStyle = (r + Math.floor((x + 1024) / colW)) % 2 === 0 ? "#f2f4f8" : "#ffffff";
          g.fillRect(x + 3, y + 3, colW - 6, rowH - 6);
          g.fillStyle = "rgba(255, 255, 255, 0.45)";
          g.fillRect(x + 3, y + 3, colW - 6, 2);
          g.fillRect(x + 3, y + 3, 2, rowH - 6);
          g.fillStyle = "rgba(20, 25, 35, 0.15)";
          g.fillRect(x + 3, y + rowH - 5, colW - 6, 2);
          g.fillRect(x + colW - 5, y + 3, 2, rowH - 6);
        }
      }
      g.fillStyle = "#343d4c";
      for (let r = 0; r <= 4; r++) g.fillRect(0, r * rowH - 2, 512, 4);
      for (let r = 0; r < 4; r++) {
        const offsetX = r % 2 === 1 ? colW / 2 : 0;
        for (let c = -1; c <= 3; c++) g.fillRect((((c * colW + offsetX) % 512) + 512) % 512 - 2, r * rowH, 4, rowH);
      }
      const rubber = g.createLinearGradient(0, 0, 0, 512);
      for (const [at, a] of [[0, 0], [0.18, 0.16], [0.35, 0], [0.5, 0.05], [0.65, 0], [0.82, 0.16], [1, 0]]) rubber.addColorStop(at, `rgba(20, 24, 32, ${a})`);
      g.fillStyle = rubber;
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 900; i++) {
        const a = Math.random() * 0.045 + 0.01;
        g.fillStyle = Math.random() > 0.4 ? `rgba(255,255,255,${a * 1.5})` : `rgba(0,0,0,${a})`;
        g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
      }
    },
    textures,
  );
}

/** Textura de asfalto outdoor com marcas de pneus e granulação de cascalho para o Parque Ipanema. */
function parkRoadTexture(textures: THREE.Texture[]): THREE.CanvasTexture {
  return canvasTexture(
    512,
    512,
    (g) => {
      g.fillStyle = "#353940";
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 1800; i++) {
        const a = Math.random() * 0.08 + 0.02;
        g.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.6})`;
        g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
      }
      const rubber = g.createLinearGradient(0, 0, 0, 512);
      for (const [at, a] of [
        [0, 0],
        [0.18, 0.22],
        [0.35, 0.05],
        [0.5, 0.12],
        [0.65, 0.05],
        [0.82, 0.22],
        [1, 0],
      ]) {
        rubber.addColorStop(at, `rgba(15, 18, 24, ${a})`);
      }
      g.fillStyle = rubber;
      g.fillRect(0, 0, 512, 512);
    },
    textures,
  );
}

/** Guia branca na beira da pista, com junta a cada 2 m e borracha escura do lado de dentro. */
function curbTexture(textures: THREE.Texture[]): THREE.CanvasTexture {
  const t = canvasTexture(
    256,
    64,
    (g) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 256, 64);
      for (const x of [0, 128]) {
        g.fillStyle = "rgba(30, 35, 45, 0.28)";
        g.fillRect(x, 0, 4, 64);
        g.fillStyle = "rgba(255, 255, 255, 0.6)";
        g.fillRect(x + 4, 0, 3, 64);
      }
      g.fillStyle = "#27303d";
      g.fillRect(0, 56, 256, 8);
    },
    textures,
  );
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Asfalto rústico avermelhado/arenoso com marcas de desgaste e poeira do deserto. */
function desertRoadTexture(textures: THREE.Texture[]): THREE.CanvasTexture {
  return canvasTexture(
    512,
    512,
    (g) => {
      g.fillStyle = "#4a3a32";
      g.fillRect(0, 0, 512, 512);

      // Granulação de cascalho e areia
      for (let i = 0; i < 2000; i++) {
        const a = Math.random() * 0.12 + 0.03;
        const roll = Math.random();
        if (roll < 0.4) {
          g.fillStyle = `rgba(217, 165, 102, ${a * 1.5})`;
        } else if (roll < 0.7) {
          g.fillStyle = `rgba(139, 87, 56, ${a * 1.8})`;
        } else {
          g.fillStyle = `rgba(20, 15, 12, ${a * 2})`;
        }
        g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
      }

      // Faixas de borracha queimada no traçado
      const rubber = g.createLinearGradient(0, 0, 0, 512);
      for (const [at, a] of [
        [0, 0],
        [0.18, 0.22],
        [0.35, 0.06],
        [0.5, 0.14],
        [0.65, 0.06],
        [0.82, 0.22],
        [1, 0],
      ]) {
        rubber.addColorStop(at, `rgba(25, 18, 14, ${a})`);
      }
      g.fillStyle = rubber;
      g.fillRect(0, 0, 512, 512);

      // Névoa e rastros suaves de areia varrida pelo vento
      for (let y = 30; y < 512; y += 70) {
        g.fillStyle = "rgba(226, 180, 122, 0.07)";
        g.fillRect(0, y, 512, 14);
      }
    },
    textures,
  );
}

/** Zebras de concreto desgastado pelo sol e areia do deserto. */
function desertCurbTexture(textures: THREE.Texture[]): THREE.CanvasTexture {
  const t = canvasTexture(
    256,
    64,
    (g) => {
      // Concreto envelhecido
      g.fillStyle = "#dfd5c4";
      g.fillRect(0, 0, 256, 64);
      // Blocos desgastados avermelhados pelo sol
      g.fillStyle = "#a64938";
      g.fillRect(0, 0, 128, 64);

      // Poeira e desgaste
      for (const x of [0, 128]) {
        g.fillStyle = "rgba(45, 30, 20, 0.35)";
        g.fillRect(x, 0, 4, 64);
        g.fillStyle = "rgba(255, 240, 220, 0.4)";
        g.fillRect(x + 4, 0, 3, 64);
      }
      // Marcas de poeira e borracha na borda
      g.fillStyle = "#634735";
      g.fillRect(0, 56, 256, 8);

      // Granulado de erosão
      for (let i = 0; i < 400; i++) {
        const a = Math.random() * 0.15 + 0.03;
        g.fillStyle = `rgba(70, 45, 25, ${a})`;
        g.fillRect(Math.random() * 256, Math.random() * 64, 2, 2);
      }
    },
    textures,
  );
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Terreno arenoso em tons quentes de dunas (#d9a566 / #e2b47a com acabamento áspero). */
function desertSandTexture(textures: THREE.Texture[]): THREE.CanvasTexture {
  const t = canvasTexture(
    512,
    512,
    (g) => {
      g.fillStyle = "#d9a566";
      g.fillRect(0, 0, 512, 512);

      // Ondulações de dunas de areia
      for (let y = 0; y < 512; y += 32) {
        g.fillStyle = y % 64 === 0 ? "#e2b47a" : "#ce9a5b";
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= 512; x += 32) {
          const cy = y + Math.sin((x / 512) * Math.PI * 4) * 8;
          g.lineTo(x, cy);
        }
        g.lineTo(512, y + 20);
        g.lineTo(0, y + 20);
        g.closePath();
        g.fill();
      }

      // Granulado de areia áspera
      for (let i = 0; i < 2500; i++) {
        const a = Math.random() * 0.09 + 0.02;
        g.fillStyle = Math.random() > 0.5 ? `rgba(255, 235, 200, ${a})` : `rgba(138, 92, 50, ${a * 1.5})`;
        g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
      }
    },
    textures,
  );
  t.repeat.set(0.15, 0.15);
  return t;
}

/** Moldura listrada de perigo (amarelo e preto). */
function hazardStripeTexture(textures: THREE.Texture[]): THREE.CanvasTexture {
  const t = canvasTexture(
    128,
    128,
    (g) => {
      g.fillStyle = "#ffd23f";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#181818";
      const w = 24;
      for (let i = -128; i < 256; i += w * 2) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + w, 0);
        g.lineTo(i + w + 128, 128);
        g.lineTo(i + 128, 128);
        g.closePath();
        g.fill();
      }
    },
    textures,
  );
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Carpete em placas de 1 m para o chão fora da pista. */
function carpetTexture(textures: THREE.Texture[]): THREE.CanvasTexture {
  const t = canvasTexture(
    256,
    256,
    (g) => {
      g.fillStyle = "#242c38";
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = "#2a3442";
      g.fillRect(0, 0, 128, 128);
      g.fillRect(128, 128, 128, 128);
      g.fillStyle = "rgba(0, 0, 0, 0.35)";
      g.fillRect(0, 0, 256, 3);
      g.fillRect(0, 126, 256, 3);
      g.fillRect(0, 0, 3, 256);
      g.fillRect(126, 0, 3, 256);
    },
    textures,
  );
  // a ShapeGeometry do chão tem UV em metros: uma repetição a cada 2 m
  t.repeat.set(0.5, 0.5);
  return t;
}

/** Janelas de prédio para o horizonte. */
function skylineTexture(textures: THREE.Texture[]): THREE.CanvasTexture {
  const t = canvasTexture(
    128,
    256,
    (g) => {
      g.fillStyle = "#2b4c7e";
      g.fillRect(0, 0, 128, 256);
      for (let y = 10; y < 256; y += 18) {
        for (let x = 8; x < 128; x += 16) {
          g.fillStyle = Math.sin(x * 37 + y * 53) > -0.2 ? "#ffeaa7" : "rgba(0, 0, 0, 0.22)";
          g.fillRect(x, y, 9, 10);
        }
      }
    },
    textures,
  );
  t.repeat.set(2, 5);
  return t;
}

/** Textura de papelão pardo com fita adesiva e carimbo "ARQUIVO MORTO 2008" */
function archiveBoxTexture(textures: THREE.Texture[]): THREE.CanvasTexture {
  return canvasTexture(
    256,
    256,
    (g) => {
      g.fillStyle = "#c29b68";
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = "rgba(0, 0, 0, 0.08)";
      g.fillRect(0, 0, 256, 16);
      g.fillRect(0, 240, 256, 16);
      // Fita adesiva larga horizontal parda/brilhante
      g.fillStyle = "#d8b27c";
      g.fillRect(0, 80, 256, 42);
      g.fillStyle = "rgba(255, 255, 255, 0.3)";
      g.fillRect(0, 82, 256, 4);
      g.fillStyle = "rgba(0, 0, 0, 0.12)";
      g.fillRect(0, 118, 256, 4);
      // Carimbo Stencil vermelho "ARQUIVO MORTO"
      g.save();
      g.translate(128, 165);
      g.rotate(-0.06);
      g.fillStyle = "#8b1e1e";
      g.font = "900 22px 'Bricolage Grotesque', sans-serif";
      g.textAlign = "center";
      g.fillText("ARQUIVO MORTO", 0, 0);
      g.font = "800 34px 'Bricolage Grotesque', sans-serif";
      g.fillText("2008", 0, 32);
      g.strokeStyle = "#8b1e1e";
      g.lineWidth = 3;
      g.strokeRect(-90, -22, 180, 62);
      g.restore();
      // Alça recortada oval escura na lateral
      g.fillStyle = "#3e2723";
      g.beginPath();
      g.ellipse(128, 48, 28, 12, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#6d4c41";
      g.beginPath();
      g.ellipse(128, 51, 26, 9, 0, 0, Math.PI * 2);
      g.fill();
    },
    textures,
  );
}

/** Quadro satírico 1: "BATA A META ANTES QUE A META BATA EM VOCÊ!" */
function posterMetaTexture(textures: THREE.Texture[]): THREE.CanvasTexture {
  return canvasTexture(
    512,
    320,
    (g) => {
      g.fillStyle = "#c0392b";
      g.fillRect(0, 0, 512, 320);
      g.fillStyle = "#e74c3c";
      for (let i = 0; i < 512; i += 40) {
        g.beginPath();
        g.moveTo(256, 160);
        g.lineTo(i, 0);
        g.lineTo(i + 20, 0);
        g.closePath();
        g.fill();
      }
      g.strokeStyle = "#ffd23f";
      g.lineWidth = 12;
      g.strokeRect(10, 10, 492, 300);

      g.fillStyle = "#1e2430";
      g.fillRect(20, 20, 472, 42);
      g.fillStyle = "#ffd23f";
      g.font = "800 20px 'Bricolage Grotesque', sans-serif";
      g.textAlign = "center";
      g.fillText("MOTIVAÇÃO EXTREMA RH", 256, 48);

      g.fillStyle = "#ffffff";
      g.font = "900 42px 'Bricolage Grotesque', sans-serif";
      g.fillText("BATA A META!", 256, 125);

      g.fillStyle = "#ffd23f";
      g.font = "900 27px 'Bricolage Grotesque', sans-serif";
      g.fillText("ANTES QUE A META", 256, 185);
      g.fillText("BATA EM VOCÊ!", 256, 225);

      g.fillStyle = "#1e2430";
      g.font = "800 16px 'Bricolage Grotesque', sans-serif";
      g.fillText("★ EXPEDIENTE CAÓTICO - SETOR DE RESULTADOS ★", 256, 280);
    },
    textures,
  );
}

/** Quadro satírico 2: "DESPESAS COM CAFÉ vs LUCRO" (Gráfico de pizza despencando) */
function posterCafeTexture(textures: THREE.Texture[]): THREE.CanvasTexture {
  return canvasTexture(
    512,
    320,
    (g) => {
      g.fillStyle = "#1e293b";
      g.fillRect(0, 0, 512, 320);
      g.strokeStyle = "rgba(255, 255, 255, 0.08)";
      g.lineWidth = 1;
      for (let x = 0; x < 512; x += 32) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, 320);
        g.stroke();
      }
      for (let y = 0; y < 320; y += 32) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(512, y);
        g.stroke();
      }
      g.strokeStyle = "#00bcd4";
      g.lineWidth = 8;
      g.strokeRect(10, 10, 492, 300);

      g.fillStyle = "#ffffff";
      g.font = "900 26px 'Bricolage Grotesque', sans-serif";
      g.textAlign = "center";
      g.fillText("DESPESAS COM CAFÉ vs LUCRO", 256, 50);

      // Gráfico de pizza 3D
      const cx = 160;
      const cy = 180;
      const r = 78;
      // Fatia de Café (95%)
      g.fillStyle = "#5d4037";
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, r, -0.3, Math.PI * 1.85);
      g.closePath();
      g.fill();
      g.strokeStyle = "#3e2723";
      g.lineWidth = 4;
      g.stroke();

      // Fatia minúscula de Lucro (5%) despencando
      g.fillStyle = "#2ecc71";
      g.beginPath();
      g.moveTo(cx + 25, cy + 25);
      g.arc(cx + 25, cy + 25, r * 0.9, Math.PI * 1.85, Math.PI * 2 - 0.3);
      g.closePath();
      g.fill();
      g.strokeStyle = "#27ae60";
      g.lineWidth = 3;
      g.stroke();

      // Legendas
      g.textAlign = "left";
      g.fillStyle = "#d7ccc8";
      g.font = "800 24px 'Bricolage Grotesque', sans-serif";
      g.fillText("■ CAFÉ (95%)", 280, 140);
      g.fillStyle = "#2ecc71";
      g.fillText("■ LUCRO (5%...)", 280, 185);

      g.fillStyle = "#e74c3c";
      g.font = "800 18px 'Bricolage Grotesque', sans-serif";
      g.fillText("▼ LUCRO DESPENCANDO!", 280, 225);

      g.fillStyle = "#94a3b8";
      g.font = "600 15px 'Bricolage Grotesque', sans-serif";
      g.fillText("Fonte: Cafeteira da firma", 280, 260);
    },
    textures,
  );
}

/** Quadro satírico 3: "CUIDADO: ESTAGIÁRIOS NA PISTA" */
function posterEstagiariosTexture(textures: THREE.Texture[]): THREE.CanvasTexture {
  return canvasTexture(
    512,
    320,
    (g) => {
      g.fillStyle = "#f1c40f";
      g.fillRect(0, 0, 512, 320);

      // Faixas zebradas pretas e amarelas na borda
      const stripeW = 24;
      g.fillStyle = "#1e2430";
      for (let i = -30; i < 540; i += stripeW * 2) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + stripeW, 0);
        g.lineTo(i + stripeW - 20, 32);
        g.lineTo(i - 20, 32);
        g.fill();

        g.beginPath();
        g.moveTo(i, 288);
        g.lineTo(i + stripeW, 288);
        g.lineTo(i + stripeW - 20, 320);
        g.lineTo(i - 20, 320);
        g.fill();
      }

      // Losango de perigo no centro
      g.fillStyle = "#1e2430";
      g.beginPath();
      g.moveTo(110, 160);
      g.lineTo(170, 95);
      g.lineTo(230, 160);
      g.lineTo(170, 225);
      g.closePath();
      g.fill();

      // Ponto de exclamação
      g.fillStyle = "#f1c40f";
      g.font = "900 68px 'Bricolage Grotesque', sans-serif";
      g.textAlign = "center";
      g.fillText("!", 170, 185);

      // Textos
      g.fillStyle = "#1e2430";
      g.textAlign = "left";
      g.font = "900 38px 'Bricolage Grotesque', sans-serif";
      g.fillText("CUIDADO!", 255, 115);

      g.fillStyle = "#c0392b";
      g.font = "900 27px 'Bricolage Grotesque', sans-serif";
      g.fillText("ESTAGIÁRIOS", 255, 158);
      g.fillText("NA PISTA!", 255, 198);

      g.fillStyle = "#1e2430";
      g.font = "800 17px 'Bricolage Grotesque', sans-serif";
      g.fillText("VELOCIDADE: MÁXIMA PERMITIDA", 255, 245);
    },
    textures,
  );
}

/** Quadro satírico 4: "REUNIÃO QUE PODERIA SER UM E-MAIL" */
function posterReuniaoTexture(textures: THREE.Texture[]): THREE.CanvasTexture {
  return canvasTexture(
    512,
    320,
    (g) => {
      g.fillStyle = "#311b92";
      g.fillRect(0, 0, 512, 320);
      g.strokeStyle = "#b388ff";
      g.lineWidth = 10;
      g.strokeRect(10, 10, 492, 300);

      g.fillStyle = "#ffffff";
      g.font = "900 28px 'Bricolage Grotesque', sans-serif";
      g.textAlign = "center";
      g.fillText("ESTA REUNIÃO PODERIA", 256, 70);
      g.fillStyle = "#ffd23f";
      g.fillText("TER SIDO UM E-MAIL!", 256, 115);

      // Gráficos comparativos de barras
      g.textAlign = "left";
      g.fillStyle = "#e74c3c";
      g.fillRect(45, 160, 360, 34);
      g.fillStyle = "#ffffff";
      g.font = "800 17px 'Bricolage Grotesque', sans-serif";
      g.fillText("REUNIÃO DE 3 HORAS: 0% DECISÕES", 55, 184);

      g.fillStyle = "#2ecc71";
      g.fillRect(45, 215, 180, 34);
      g.fillStyle = "#ffffff";
      g.fillText("1 E-MAIL: 100% RESOLVIDO", 55, 239);

      // Carimbo vermelho
      g.save();
      g.translate(380, 240);
      g.rotate(-0.15);
      g.fillStyle = "#ff5252";
      g.font = "900 22px 'Bricolage Grotesque', sans-serif";
      g.fillText("CANCELADA!", -50, 0);
      g.strokeStyle = "#ff5252";
      g.lineWidth = 3;
      g.strokeRect(-65, -24, 140, 32);
      g.restore();
    },
    textures,
  );
}

/** Geometria de zebra com perfil chanfrado e rampa suave de entrada */
function createKerbGeometry(width: number, height: number, length: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const rampW = width * 0.22;
  const fallW = width * 0.15;
  shape.moveTo(-width / 2, 0);
  shape.lineTo(-width / 2 + rampW, height);
  shape.lineTo(width / 2 - fallW, height);
  shape.lineTo(width / 2, height * 0.35);
  shape.lineTo(width / 2, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.006,
    bevelThickness: 0.006,
  });
  geo.center();
  return geo;
}

/** Bebedouro completo de galão azul 20L invertido com torneiras e dispenser de copos */
function buildWaterCooler(
  whiteMat: THREE.Material,
  dispenserMat: THREE.Material,
  darkMat: THREE.Material,
  blueTapMat: THREE.Material,
  redTapMat: THREE.Material,
  steelMat: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  // Coluna vertical e base
  g.add(mesh(new THREE.CylinderGeometry(0.20, 0.21, 0.88, 16), whiteMat, 0, 0.44, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.04, 16), darkMat, 0, 0.02, 0));
  // Bandeja de gotejamento / nicho para copos
  g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 14), steelMat, 0, 0.52, 0.08));
  // Torneirinhas azul (gelada) e vermelha (quente)
  g.add(mesh(new THREE.BoxGeometry(0.035, 0.055, 0.06), blueTapMat, -0.045, 0.65, 0.13));
  g.add(mesh(new THREE.BoxGeometry(0.035, 0.055, 0.06), redTapMat, 0.045, 0.65, 0.13));
  // Suporte do galão
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.20, 0.05, 16), whiteMat, 0, 0.90, 0));
  // Galão de 20L invertido
  g.add(mesh(new THREE.CylinderGeometry(0.17, 0.09, 0.08, 16), dispenserMat, 0, 0.96, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.36, 16), dispenserMat, 0, 1.18, 0));
  g.add(mesh(new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), dispenserMat, 0, 1.36, 0));
  // Dispenser com copinhos plásticos brancos empilhados
  g.add(mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.52, 10), dispenserMat, 0.23, 0.72, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.026, 0.46, 10), whiteMat, 0.23, 0.70, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.03, 10), darkMat, 0.23, 0.99, 0));
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.04, 0.05), steelMat, 0.18, 0.72, 0));
  return g;
}

/** Ficus estilizado volumétrico estilo Mario Odyssey */
function buildFicus(
  potMat: THREE.Material,
  soilMat: THREE.Material,
  trunkMat: THREE.Material,
  leafMats: THREE.Material[],
): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.55, 16), potMat, 0, 0.275, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 16), potMat, 0, 0.52, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.04, 14), soilMat, 0, 0.51, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.65, 8), trunkMat, 0, 0.80, 0));
  // Folhagem volumétrica arredondada em camadas
  g.add(mesh(new THREE.IcosahedronGeometry(0.38, 1), leafMats[0], 0, 1.15, 0));
  g.add(mesh(new THREE.IcosahedronGeometry(0.28, 1), leafMats[1], 0.18, 1.05, 0.12));
  g.add(mesh(new THREE.IcosahedronGeometry(0.26, 1), leafMats[1], -0.16, 1.10, -0.14));
  g.add(mesh(new THREE.IcosahedronGeometry(0.30, 1), leafMats[2], 0, 1.42, 0));
  return g;
}

/** Samambaia pendente de escritório com folhas em leque */
function buildFern(
  potMat: THREE.Material,
  soilMat: THREE.Material,
  leafMat: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.34, 0.22, 0.45, 16), potMat, 0, 0.225, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 14), soilMat, 0, 0.42, 0));
  g.add(mesh(new THREE.SphereGeometry(0.24, 8, 8), leafMat, 0, 0.48, 0));
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    const leaf = mesh(new THREE.CylinderGeometry(0.02, 0.08, 0.55, 6), leafMat, cosA * 0.22, 0.44, sinA * 0.22);
    leaf.rotation.set(sinA * 0.65, ang, -cosA * 0.65);
    g.add(leaf);
  }
  return g;
}

/** Pilha de caixas de papelão pardo "ARQUIVO MORTO 2008" com desalinho natural */
function buildArchiveBoxStack(boxMat: THREE.Material, count = 2): THREE.Group {
  const g = new THREE.Group();
  const boxW = 0.55;
  const boxH = 0.36;
  const boxD = 0.42;
  const b1 = mesh(new THREE.BoxGeometry(boxW, boxH, boxD), boxMat, 0, boxH / 2, 0);
  g.add(b1);
  if (count >= 2) {
    const b2 = mesh(new THREE.BoxGeometry(boxW, boxH, boxD), boxMat, 0.02, boxH + boxH / 2, -0.02, 0.14);
    g.add(b2);
  }
  if (count >= 3) {
    const b3 = mesh(new THREE.BoxGeometry(boxW, boxH, boxD), boxMat, -0.03, boxH * 2 + boxH / 2, 0.01, -0.20);
    g.add(b3);
  }
  return g;
}

/** Quadro emoldurado com suportes para paredes da pista */
function buildFramedPoster(
  texture: THREE.CanvasTexture,
  frameMat: THREE.Material,
  x: number,
  y: number,
  z: number,
  ry: number,
  w = 2.4,
  h = 1.5,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  const frameGeo = new THREE.BoxGeometry(w, h, 0.08);
  const frameMesh = new THREE.Mesh(frameGeo, frameMat);
  frameMesh.castShadow = true;
  g.add(frameMesh);
  const posterGeo = new THREE.PlaneGeometry(w - 0.12, h - 0.12);
  const posterMat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.38,
    metalness: 0.05,
  });
  const posterMesh = new THREE.Mesh(posterGeo, posterMat);
  posterMesh.position.z = 0.045;
  g.add(posterMesh);
  const poleMat = new THREE.MeshStandardMaterial({ color: "#2d3748", roughness: 0.5, metalness: 0.5 });
  for (const px of [-w * 0.35, w * 0.35]) {
    const pole = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8), poleMat, px, -h / 2 - 0.3, 0);
    g.add(pole);
  }
  return g;
}

/**
 * Junta as malhas estáticas do grupo em uma malha por material (e sombra), em coordenadas de mundo.
 * Centenas de paredes, fitas e móveis viram poucas chamadas de desenho, em qualquer pista.
 */
function mergeStatic(group: THREE.Group): THREE.Mesh[] {
  group.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.Material;
    const key = `${mat.uuid}:${m.castShadow}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat, cast: m.castShadow, geos: [] }));
    b.geos.push(m.geometry.clone().applyMatrix4(m.matrixWorld));
  });
  const used = new Set<THREE.BufferGeometry>();
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) used.add(m.geometry);
  });
  used.forEach((g) => g.dispose());
  const out: THREE.Mesh[] = [];
  for (const b of buckets.values()) {
    // caixas e cilindros são indexados, o icosaedro não: mistura vira tudo não indexado
    const mixed = b.geos.some((g) => !g.index) && b.geos.some((g) => g.index);
    const geos = mixed ? b.geos.map((g) => (g.index ? g.toNonIndexed() : g)) : b.geos;
    const merged = mergeGeometries(geos, false);
    b.geos.forEach((g) => g.dispose());
    if (mixed) geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    out.push(mesh);
  }
  return out;
}

/** Posição 3D de um ponto da seção transversal da pista (deslocamento lateral e altura relativa ao piso). */
function trackPoint3D(track: Track, s: number, off: number, yRel = 0): THREE.Vector3 {
  const at = pointAt(track, s);
  const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
  const baseY = heightAt(track, s);
  const phi = corkscrewRoll(track, s);
  let finalOff = off;
  let finalY = yRel;
  if (phi !== 0) {
    const TAX = track.corkscrew?.axisY ?? 9.4;
    const v = yRel - TAX;
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    finalOff = off * c - v * sn;
    finalY = off * sn + v * c + TAX;
  }
  return new THREE.Vector3(
    at.pos.x + nrm.x * finalOff,
    baseY + finalY,
    at.pos.z + nrm.z * finalOff,
  );
}

/** Faixa no chão entre duas listas de pontos (mesmo tamanho). UV: u ao longo do caminho (uScale por metro), v de a para b. */
function ribbon(
  a: (Vec2 | THREE.Vector3)[],
  b: (Vec2 | THREE.Vector3)[],
  y: number | number[],
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
    const yi = Array.isArray(y) ? y[i] : y;
    const ai = a[i];
    const ax = ai.x;
    const ay = ai instanceof THREE.Vector3 ? ai.y : yi;
    const az = ai.z;

    const bi = b[i];
    const bx = bi.x;
    const by = bi instanceof THREE.Vector3 ? bi.y : yi;
    const bz = bi.z;

    pos.push(ax, ay, az, bx, by, bz);
    if (colors) col.push(colors[i].r, colors[i].g, colors[i].b, colors[i].r, colors[i].g, colors[i].b);
    if (i > 0) {
      const prevA = a[i - 1];
      const prevAy = prevA instanceof THREE.Vector3 ? prevA.y : (Array.isArray(y) ? y[i - 1] : y);
      const prevAz = prevA.z;
      dist += Math.hypot(ax - prevA.x, ay - prevAy, az - prevAz);
    }
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
  // a ordem dos vértices depende do lado; o piso precisa sempre apontar para cima
  if (g.attributes.normal.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

/** Ponto do caminho path na medida d da rampa (s da principal, ou bs do próprio atalho). */
function along(track: Track, path: number, d: number): { pos: Vec2; heading: number; halfWidth: number } {
  const b = track.branches[path];
  if (!b) return pointAt(track, d);
  const n = b.points.length;
  const i = Math.max(0, Math.min(n - 2, Math.floor(d / b.spacing)));
  const t = Math.max(0, Math.min(1, (d - b.cum[i]) / b.spacing));
  const p = b.points[i];
  const q = b.points[i + 1];
  return { pos: { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t }, heading: Math.atan2(q.x - p.x, q.z - p.z), halfWidth: (b.widths[i] + (b.widths[i + 1] - b.widths[i]) * t) / 2 };
}

/** Bordas (lado +1 e -1) do caminho entre d0 e d1, a cada step. */
function edgesBetween(track: Track, path: number, d0: number, d1: number, step = 0.5): { plus: Vec2[]; minus: Vec2[]; at: ReturnType<typeof along>[] } {
  const plus: Vec2[] = [];
  const minus: Vec2[] = [];
  const at: ReturnType<typeof along>[] = [];
  const count = Math.max(1, Math.ceil((d1 - d0) / step));
  for (let k = 0; k <= count; k++) {
    const a = along(track, path, d0 + ((d1 - d0) * k) / count);
    const nrm = sideNormal(Math.sin(a.heading), Math.cos(a.heading));
    plus.push({ x: a.pos.x + nrm.x * a.halfWidth, z: a.pos.z + nrm.z * a.halfWidth });
    minus.push({ x: a.pos.x - nrm.x * a.halfWidth, z: a.pos.z - nrm.z * a.halfWidth });
    at.push(a);
  }
  return { plus, minus, at };
}

/** Rampa como cunha: tampo cinza subindo até height, laterais e a queda do topo em faixas amarelas e pretas. */
function rampMesh(track: Track, r: Ramp): THREE.Mesh {
  const e = edgesBetween(track, r.path, r.sFrom, r.sTo, 0.5);
  const n = e.plus.length;
  const pos: number[] = [];
  const col: number[] = [];
  const gray = new THREE.Color("#8d9096");
  const stripe = (i: number) => new THREE.Color(i % 2 ? "#1d1d1d" : "#f2c230");
  const quad = (a: number[], b: number[], c: number[], d: number[], color: THREE.Color) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let k = 0; k < 6; k++) col.push(color.r, color.g, color.b);
  };
  const base = (i: number) => {
    const s = r.sFrom + ((r.sTo - r.sFrom) * i) / (n - 1);
    return r.path === -1 ? heightAt(track, s) : 0;
  };
  const h = (i: number) => base(i) + (r.height * i) / (n - 1) + 0.02;
  for (let i = 0; i + 1 < n; i++) {
    const [p0, p1, m0, m1] = [e.plus[i], e.plus[i + 1], e.minus[i], e.minus[i + 1]];
    quad([p0.x, h(i), p0.z], [p1.x, h(i + 1), p1.z], [m1.x, h(i + 1), m1.z], [m0.x, h(i), m0.z], gray);
    quad([p0.x, base(i), p0.z], [p1.x, base(i + 1), p1.z], [p1.x, h(i + 1), p1.z], [p0.x, h(i), p0.z], stripe(i));
    quad([m0.x, base(i), m0.z], [m1.x, base(i + 1), m1.z], [m1.x, h(i + 1), m1.z], [m0.x, h(i), m0.z], stripe(i));
  }
  // queda do topo: faixas em diagonal
  const top = n - 1;
  const parts = 8;
  for (let k = 0; k < parts; k++) {
    const a = { x: e.plus[top].x + ((e.minus[top].x - e.plus[top].x) * k) / parts, z: e.plus[top].z + ((e.minus[top].z - e.plus[top].z) * k) / parts };
    const b = { x: e.plus[top].x + ((e.minus[top].x - e.plus[top].x) * (k + 1)) / parts, z: e.plus[top].z + ((e.minus[top].z - e.plus[top].z) * (k + 1)) / parts };
    quad([a.x, base(top), a.z], [b.x, base(top), b.z], [b.x, h(top), b.z], [a.x, h(top), a.z], stripe(k));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Monta a rampa GLB 3D posicionada e orientada no trecho sFrom -> sTo da pista */
function buildRampGlb(track: Track, r: Ramp, template: THREE.Group): THREE.Group {
  const clone = template.clone(true);
  const start = along(track, r.path, r.sFrom);
  const end = along(track, r.path, r.sTo);
  const dx = end.pos.x - start.pos.x;
  const dz = end.pos.z - start.pos.z;
  const rampLen = Math.hypot(dx, dz);
  const heading = Math.atan2(dx, dz);

  const baseY = r.path === -1 ? heightAt(track, r.sFrom) : 0;
  clone.position.set(start.pos.x, baseY, start.pos.z);
  clone.rotation.y = heading;

  // Dimensões originais do modelo GLB (ramp-jump.glb): Z: ~5.84 m, Y: ~1.86 m, X: ~7.47 m
  const scaleZ = rampLen / 5.84;
  const scaleY = r.height / 1.86;
  const targetWidth = Math.max(5.0, Math.min(start.halfWidth * 1.85, 10.0));
  const scaleX = targetWidth / 7.47;

  clone.scale.set(scaleX, scaleY, scaleZ);

  clone.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  return clone;
}

/** Vão: buraco no piso com paredes descendo até o subsolo (estacionamento) ou cânion escarpado com lama (deserto). */
function gapPit(track: Track, r: Ramp): { group: THREE.Group; outline: Vec2[] } {
  const gap = r.gap!;
  const e = edgesBetween(track, r.path, gap.sFrom, gap.sTo, 0.5);
  const outline = [...e.plus, ...[...e.minus].reverse()];
  const group = new THREE.Group();
  const isDeserto = track.id === "deserto";
  const depth = isDeserto ? 6.5 : 3;

  if (isDeserto) {
    // Paredes de penhasco rochoso escarpado descendo até o fundo do cânion
    const cliffMat = new THREE.MeshStandardMaterial({
      color: "#6b4530",
      roughness: 0.95,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const cliffPos: number[] = [];
    const count = outline.length;
    const bottomY = -depth;

    for (let i = 0; i < count; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % count];
      const prA = progressOf(track, a);
      const prB = progressOf(track, b);
      const topYA = heightAt(track, prA.s);
      const topYB = heightAt(track, prB.s);

      cliffPos.push(
        a.x, topYA, a.z,
        b.x, topYB, b.z,
        b.x, bottomY, b.z,

        a.x, topYA, a.z,
        b.x, bottomY, b.z,
        a.x, bottomY, a.z,
      );
    }
    const cliffGeo = new THREE.BufferGeometry();
    cliffGeo.setAttribute("position", new THREE.Float32BufferAttribute(cliffPos, 3));
    cliffGeo.computeVertexNormals();
    group.add(new THREE.Mesh(cliffGeo, cliffMat));

    // Poço de lama viscosa escura no fundo (#3d2817, roughness 0.2, levemente reflexivo)
    const mudMat = new THREE.MeshStandardMaterial({
      color: "#3d2817",
      roughness: 0.2,
      metalness: 0.15,
    });
    const mudFloor = new THREE.Mesh(ribbon(e.plus, e.minus, bottomY, null, false), mudMat);
    group.add(mudFloor);

    // Bolhas e ondulações viscosas
    const bubbleMat = new THREE.MeshStandardMaterial({
      color: "#2a1b10",
      roughness: 0.15,
      metalness: 0.2,
    });
    for (let k = 1; k < e.at.length - 1; k += 2) {
      const at = e.at[k];
      const bubble = mesh(new THREE.SphereGeometry(0.65 + (k % 3) * 0.2, 8, 6), bubbleMat, at.pos.x + ((k % 2) - 0.5) * 2, bottomY + 0.12, at.pos.z);
      bubble.scale.set(1.4, 0.25, 1.4);
      group.add(bubble);
    }

    // Estacas e avisos de madeira rústica na beira do abismo
    const woodPostMat = new THREE.MeshStandardMaterial({ color: "#422818", roughness: 0.9 });
    const warnMat = new THREE.MeshStandardMaterial({ color: "#d97724", roughness: 0.7 });
    for (const side of [e.plus, e.minus]) {
      for (let i = 0; i < side.length; i += 3) {
        const p = side[i];
        const pr = progressOf(track, p);
        const py = heightAt(track, pr.s);
        const post = mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.2, 8), woodPostMat, p.x, py + 0.6, p.z);
        group.add(post);
        const sign = mesh(new THREE.BoxGeometry(0.8, 0.25, 0.06), warnMat, p.x, py + 0.9, p.z, Math.atan2(p.x, p.z));
        group.add(sign);
      }
    }
    return { group, outline };
  }

  const wallMat = new THREE.MeshStandardMaterial({ color: "#4a4b4f", roughness: 1, side: THREE.DoubleSide });
  const pos: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    pos.push(a.x, 0.012, a.z, b.x, 0.012, b.z, b.x, -depth, b.z, a.x, 0.012, a.z, b.x, -depth, b.z, a.x, -depth, a.z);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  wg.computeVertexNormals();
  group.add(new THREE.Mesh(wg, wallMat));
  // piso do subsolo, escuro, com uma faixa de vaga
  const floor = new THREE.Mesh(ribbon(e.plus, e.minus, -depth, null, false), new THREE.MeshStandardMaterial({ color: "#26272b", roughness: 1 }));
  group.add(floor);
  const mid = e.at[Math.floor(e.at.length / 2)];
  const line = mesh(new THREE.BoxGeometry(0.15, 0.02, mid.halfWidth * 1.6), new THREE.MeshStandardMaterial({ color: "#d8d8d0" }), mid.pos.x, -depth + 0.02, mid.pos.z, mid.heading + Math.PI / 2);
  group.add(line);
  // borda amarela de aviso na beira
  const edge = new THREE.MeshStandardMaterial({ color: "#f2c230", roughness: 0.6 });
  for (const side of [e.plus, e.minus]) {
    for (let i = 0; i + 1 < side.length; i++) {
      const a = side[i];
      const b = side[i + 1];
      group.add(mesh(new THREE.BoxGeometry(0.2, 0.06, Math.hypot(b.x - a.x, b.z - a.z) + 0.05), edge, (a.x + b.x) / 2, 0.03, (a.z + b.z) / 2, Math.atan2(b.x - a.x, b.z - a.z)));
    }
  }
  return { group, outline };
}

/** Placa de Dash (Boost Pad) de aço com moldura listrada de perigo e chevrons fluorescentes. */
function buildBoostPad(track: Track, s: number, textures: THREE.Texture[], laneOffset?: number, width?: number): THREE.Group {
  const at = pointAt(track, s);
  const y = heightAt(track, s);
  const heading = at.heading;
  const padW = width ?? (laneOffset !== undefined ? 2.8 : Math.max(5.5, Math.min(8.0, at.halfWidth * 1.1)));
  const padLen = 4.2;
  const group = new THREE.Group();
  const nrm = sideNormal(Math.sin(heading), Math.cos(heading));
  const posX = laneOffset !== undefined ? at.pos.x + nrm.x * laneOffset : at.pos.x;
  const posZ = laneOffset !== undefined ? at.pos.z + nrm.z * laneOffset : at.pos.z;
  group.position.set(posX, y + 0.025, posZ);
  group.rotation.y = heading;

  // 1. Chapa de base de aço/ferrugem
  const baseMat = new THREE.MeshStandardMaterial({
    color: "#524339",
    roughness: 0.65,
    metalness: 0.55,
  });
  const baseMesh = mesh(new THREE.BoxGeometry(padW, 0.03, padLen), baseMat, 0, 0.015, 0);
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  // 2. Moldura listrada de perigo (amarelo/preto)
  const stripeTex = hazardStripeTexture(textures);
  const frameMat = new THREE.MeshStandardMaterial({
    map: stripeTex,
    roughness: 0.5,
    metalness: 0.2,
  });
  const borderThick = 0.28;
  const h = 0.04;
  const sideGeo = new THREE.BoxGeometry(borderThick, h, padLen);
  group.add(mesh(sideGeo, frameMat, -padW / 2 + borderThick / 2, h / 2, 0));
  group.add(mesh(sideGeo, frameMat, padW / 2 - borderThick / 2, h / 2, 0));
  const endGeo = new THREE.BoxGeometry(padW, h, borderThick);
  group.add(mesh(endGeo, frameMat, 0, h / 2, -padLen / 2 + borderThick / 2));
  group.add(mesh(endGeo, frameMat, 0, h / 2, padLen / 2 - borderThick / 2));

  // 3. Chevrons / setas fluorescentes em relevo que brilham com emissive verde/laranja
  const chevronGreenMat = new THREE.MeshStandardMaterial({
    color: "#39ff4a",
    emissive: "#39ff4a",
    emissiveIntensity: 1.6,
    roughness: 0.25,
    metalness: 0.1,
  });
  const chevronOrangeMat = new THREE.MeshStandardMaterial({
    color: "#ff4a1f",
    emissive: "#ff4a1f",
    emissiveIntensity: 1.6,
    roughness: 0.25,
    metalness: 0.1,
  });

  const numChevrons = 3;
  const zStep = (padLen * 0.6) / numChevrons;
  const arrowW = (padW - borderThick * 2) * 0.72;
  const armLen = arrowW * 0.58;
  const armThickness = 0.32;
  const armH = 0.055;
  const chevronArmGeo = new THREE.BoxGeometry(armThickness, armH, armLen);

  for (let c = 0; c < numChevrons; c++) {
    const cz = -padLen * 0.3 + c * zStep;
    const isOrange = c === 1;
    const mat = isOrange ? chevronOrangeMat : chevronGreenMat;
    const angle = 0.6;
    const halfSpan = (armLen * Math.sin(angle)) / 2;

    const leftArm = mesh(chevronArmGeo, mat, -halfSpan, 0.03 + armH / 2, cz, angle);
    const rightArm = mesh(chevronArmGeo, mat, halfSpan, 0.03 + armH / 2, cz, -angle);
    group.add(leftArm);
    group.add(rightArm);
  }

  return group;
}

/** Arco/abóbada de rochas escuras cobrindo a pista como uma caverna natural escavada no maciço rochoso. */
function buildCaveTunnel(track: Track): THREE.Group {
  const group = new THREE.Group();
  const sStart = track.ctrlS[22] ?? 0;
  const sEnd = track.ctrlS[26] ?? sStart + 40;
  const step = 1.4;
  const numSteps = Math.max(2, Math.ceil((sEnd - sStart) / step));

  const rockMat = new THREE.MeshStandardMaterial({
    color: "#3a2b22",
    roughness: 0.95,
    flatShading: true,
    side: THREE.DoubleSide,
  });

  const numRadial = 10;
  const positions: number[] = [];
  const rings: THREE.Vector3[][] = [];

  for (let i = 0; i <= numSteps; i++) {
    const s = sStart + ((sEnd - sStart) * i) / numSteps;
    const at = pointAt(track, s);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    const baseY = heightAt(track, s);
    const hw = at.halfWidth + 0.8;
    const ring: THREE.Vector3[] = [];

    for (let j = 0; j <= numRadial; j++) {
      const theta = (j / numRadial) * Math.PI;
      const u = Math.cos(theta);
      const v = Math.sin(theta);
      const noise = Math.sin(s * 1.3 + j * 2.1) * 0.35 + Math.cos(s * 0.8 + j * 1.7) * 0.25;
      const rx = hw + 0.4 + noise;
      const ry = 6.2 + noise * 1.2;

      const px = at.pos.x - nrm.x * u * rx;
      const pz = at.pos.z - nrm.z * u * rx;
      const py = baseY + Math.max(-0.2, v * ry);

      ring.push(new THREE.Vector3(px, py, pz));
    }
    rings.push(ring);
  }

  for (let i = 0; i < numSteps; i++) {
    const r0 = rings[i];
    const r1 = rings[i + 1];
    for (let j = 0; j < numRadial; j++) {
      const p00 = r0[j];
      const p01 = r0[j + 1];
      const p10 = r1[j];
      const p11 = r1[j + 1];

      positions.push(
        p00.x, p00.y, p00.z,
        p10.x, p10.y, p10.z,
        p11.x, p11.y, p11.z,

        p00.x, p00.y, p00.z,
        p11.x, p11.y, p11.z,
        p01.x, p01.y, p01.z,
      );
    }
  }

  const caveGeo = new THREE.BufferGeometry();
  caveGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  caveGeo.computeVertexNormals();
  group.add(new THREE.Mesh(caveGeo, rockMat));

  // Pilares rochosos nos portais da caverna
  const boulderMat = new THREE.MeshStandardMaterial({ color: "#48362c", roughness: 0.95, flatShading: true });
  for (const s of [sStart, sEnd]) {
    const at = pointAt(track, s);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    const by = heightAt(track, s);
    for (const side of [-1, 1]) {
      const bx = at.pos.x + nrm.x * (at.halfWidth + 2.2) * side;
      const bz = at.pos.z + nrm.z * (at.halfWidth + 2.2) * side;
      const pillar = mesh(new THREE.DodecahedronGeometry(2.4, 1), boulderMat, bx, by + 2.2, bz);
      pillar.scale.set(1.1, 2.0, 1.2);
      group.add(pillar);
    }
    const topPillar = mesh(new THREE.DodecahedronGeometry(2.2, 1), boulderMat, at.pos.x, by + 6.8, at.pos.z);
    topPillar.scale.set(at.halfWidth * 0.9, 0.8, 1.4);
    group.add(topPillar);
  }

  // Estalactites e lanternas nas paredes
  const stalactiteGeo = new THREE.ConeGeometry(0.4, 2.2, 6);
  const lanternMat = new THREE.MeshStandardMaterial({
    color: "#ffaa33",
    emissive: "#ff8800",
    emissiveIntensity: 1.8,
  });
  for (let s = sStart + 3; s < sEnd - 2; s += 6) {
    const at = pointAt(track, s);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    const by = heightAt(track, s);

    const stX = at.pos.x + ((s % 3) - 1) * 1.8;
    const stZ = at.pos.z + ((s % 2) - 0.5) * 1.2;
    const st = mesh(stalactiteGeo, rockMat, stX, by + 5.6, stZ);
    st.rotation.x = Math.PI;
    group.add(st);

    for (const side of [-1, 1]) {
      const lx = at.pos.x + nrm.x * (at.halfWidth + 0.4) * side;
      const lz = at.pos.z + nrm.z * (at.halfWidth + 0.4) * side;
      const torch = mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.35, 6), lanternMat, lx, by + 2.2, lz);
      group.add(torch);
    }
  }

  return group;
}

/** Túnel monumental com tubo cilíndrico envolvente (TR = 14, TAX = 9.4), anéis de néon, luzes âmbar, portais de perigo e morro externo. */
function buildDesertTunnel(track: Track, textures: THREE.Texture[]): THREE.Group {
  const group = new THREE.Group();
  const sStart = track.ctrlS[14] ?? 0;
  const sEnd = track.ctrlS[20] ?? sStart + 110;
  const TR = 14;
  const TAX = 9.4;
  const Wo = 36;
  const step = 1.5;
  const numSteps = Math.max(8, Math.ceil((sEnd - sStart) / step));
  const numRadial = 32;

  // 1. Tubo interno cilíndrico de concreto
  const tubePositions: number[] = [];
  const tubeColors: number[] = [];
  const tubeIndices: number[] = [];

  // 2. Maciço rochoso externo cobrindo o túnel por cima
  const hillPositions: number[] = [];
  const hillIndices: number[] = [];
  const numHillX = 24;

  for (let i = 0; i <= numSteps; i++) {
    const s = sStart + ((sEnd - sStart) * i) / numSteps;
    const at = pointAt(track, s);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    const baseY = heightAt(track, s);
    const band = Math.floor(i / 4) % 2 === 0 ? 0.82 : 1.0;

    // Vértices do tubo interno (raio TR em torno de TAX)
    for (let j = 0; j <= numRadial; j++) {
      const theta = (j / numRadial) * Math.PI * 2;
      const lat = Math.cos(theta) * TR;
      const h = TAX + Math.sin(theta) * TR;
      tubePositions.push(at.pos.x + nrm.x * lat, baseY + h, at.pos.z + nrm.z * lat);
      tubeColors.push(band, band, band);
    }

    // Vértices do maciço rochoso externo
    const R2 = TR + 2.8;
    const ax = baseY + TAX;
    for (let j = 0; j <= numHillX; j++) {
      const u = j / numHillX;
      const lat = -Wo + 2 * Wo * u;
      const absLat = Math.abs(lat);
      const roof = absLat <= R2 ? ax + Math.sqrt(Math.max(0, R2 * R2 - absLat * absLat)) : ax - (absLat - R2) * 1.15;
      const noise = Math.sin(s * 0.12 + lat * 0.15) * 1.8 + Math.cos(s * 0.28 + lat * 0.08) * 1.2;
      const py = Math.max(baseY - 1.5, roof + noise);
      hillPositions.push(at.pos.x + nrm.x * lat, py, at.pos.z + nrm.z * lat);
    }
  }

  // Índices para o tubo interno (normais para dentro)
  for (let i = 0; i < numSteps; i++) {
    for (let j = 0; j < numRadial; j++) {
      const a = i * (numRadial + 1) + j;
      const b = (i + 1) * (numRadial + 1) + j;
      tubeIndices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  // Índices para o morro externo (normais para fora)
  for (let i = 0; i < numSteps; i++) {
    for (let j = 0; j < numHillX; j++) {
      const a = i * (numHillX + 1) + j;
      const b = (i + 1) * (numHillX + 1) + j;
      hillIndices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }

  const tubeGeo = new THREE.BufferGeometry();
  tubeGeo.setAttribute("position", new THREE.Float32BufferAttribute(tubePositions, 3));
  tubeGeo.setAttribute("color", new THREE.Float32BufferAttribute(tubeColors, 3));
  tubeGeo.setIndex(tubeIndices);
  tubeGeo.computeVertexNormals();

  const tubeMat = new THREE.MeshStandardMaterial({
    color: "#8a847c",
    vertexColors: true,
    roughness: 0.9,
    side: THREE.DoubleSide,
    emissive: "#1a1612",
  });
  const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
  tubeMesh.receiveShadow = true;
  group.add(tubeMesh);

  const hillGeo = new THREE.BufferGeometry();
  hillGeo.setAttribute("position", new THREE.Float32BufferAttribute(hillPositions, 3));
  hillGeo.setIndex(hillIndices);
  hillGeo.computeVertexNormals();

  const hillMat = new THREE.MeshStandardMaterial({
    color: "#8b5840",
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const hillMesh = new THREE.Mesh(hillGeo, hillMat);
  hillMesh.castShadow = true;
  hillMesh.receiveShadow = true;
  group.add(hillMesh);

  // 3. Anéis de néon circundando o tubo a cada poucos metros
  const ringGeo = new THREE.TorusGeometry(TR - 0.05, 0.1, 8, 48);
  const ringMat = new THREE.MeshStandardMaterial({
    color: "#ffcf6e",
    emissive: "#ffaa33",
    emissiveIntensity: 2.2,
    roughness: 0.25,
  });
  for (let s = sStart + 5; s < sEnd - 4; s += 6.5) {
    const at = pointAt(track, s);
    const by = heightAt(track, s);
    const ring = mesh(ringGeo, ringMat, at.pos.x, by + TAX, at.pos.z, at.heading);
    group.add(ring);
  }

  // 4. Luzes pontuais internas âmbar
  for (const frac of [0.15, 0.35, 0.55, 0.75, 0.9]) {
    const s = sStart + (sEnd - sStart) * frac;
    const at = pointAt(track, s);
    const by = heightAt(track, s);
    const pl = new THREE.PointLight("#ffd9a0", 1.8, 80);
    pl.position.set(at.pos.x, by + TAX, at.pos.z);
    group.add(pl);
  }

  // 5. Portais de concreto monumentais nas duas entradas do túnel (pontos 14 e 20) com listras de perigo
  const stripeTex = hazardStripeTexture(textures);
  const hazardMat = new THREE.MeshStandardMaterial({
    map: stripeTex,
    color: "#f2c21b",
    roughness: 0.5,
    metalness: 0.2,
  });
  const portalMat = new THREE.MeshStandardMaterial({
    color: "#9c8466",
    roughness: 0.88,
  });
  const portalW = 34;
  const portalH = TAX + TR + 3.2;

  const shape = new THREE.Shape();
  shape.moveTo(-portalW / 2, -1);
  shape.lineTo(portalW / 2, -1);
  shape.lineTo(portalW / 2, portalH);
  shape.lineTo(-portalW / 2, portalH);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(TR, TAX);
  for (let a = 1; a < 32; a++) {
    const th = (2 * Math.PI * a) / 32;
    hole.lineTo(Math.cos(th) * TR, TAX + Math.sin(th) * TR);
  }
  hole.closePath();
  shape.holes.push(hole);

  const portalGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.8, bevelEnabled: false });
  portalGeo.translate(0, 0, -0.9);

  const archRingGeo = new THREE.TorusGeometry(TR + 0.35, 0.45, 8, 48);

  for (const [sPortal, dirSign] of [[sStart, -1], [sEnd, 1]]) {
    const at = pointAt(track, sPortal);
    const by = heightAt(track, sPortal);

    const portal = mesh(portalGeo, portalMat, at.pos.x, by, at.pos.z, at.heading);
    portal.castShadow = true;
    portal.receiveShadow = true;
    group.add(portal);

    const archRing = mesh(archRingGeo, hazardMat, at.pos.x, by + TAX, at.pos.z, at.heading);
    archRing.translateZ(dirSign * 0.95);
    group.add(archRing);
  }

  // 6. Placas de boost no túnel em todas as faixas para os karts entrarem velozes no saca-rolhas
  for (const sPad of [sStart + 5.0, sStart + 10.5]) {
    const at = pointAt(track, sPad);
    for (const f of [-0.6, -0.2, 0.2, 0.6]) {
      group.add(buildBoostPad(track, sPad, textures, f * at.halfWidth, 2.6));
    }
  }

  return group;
}

function safeMerge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geos.length === 0) return null;
  const prepared = geos.map((g) => {
    const nonIdx = g.index ? g.toNonIndexed() : g.clone();
    if (!nonIdx.getAttribute("normal")) nonIdx.computeVertexNormals();
    if (!nonIdx.getAttribute("uv")) {
      const posCount = nonIdx.getAttribute("position").count;
      nonIdx.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(posCount * 2), 2));
    }
    return nonIdx;
  });
  const res = mergeGeometries(prepared, false);
  prepared.forEach((g) => g.dispose());
  return res;
}

/** Cactos Saguaro arredondados, cactos bola com flores desabrochadas, palmas (orelha-de-padre) e tufos de capim dourado. */
function buildDesertVegetation(track: Track): THREE.Group {
  const group = new THREE.Group();
  const saguaroGeos: THREE.BufferGeometry[] = [];
  const barrelGeos: THREE.BufferGeometry[] = [];
  const pearGeos: THREE.BufferGeometry[] = [];
  const flowerMagentaGeos: THREE.BufferGeometry[] = [];
  const flowerGoldGeos: THREE.BufferGeometry[] = [];
  const flowerOrangeGeos: THREE.BufferGeometry[] = [];
  const grassGeos: THREE.BufferGeometry[] = [];

  const free = (p: Vec2, r: number) => {
    const pr = progressOf(track, p);
    return pr.dist > pr.halfWidth + r + 0.6;
  };

  const sTunnelStart = track.ctrlS[14] ?? -1;
  const sTunnelEnd = track.ctrlS[20] ?? -1;
  const sCaveStart = track.ctrlS[22] ?? -1;
  const sCaveEnd = track.ctrlS[26] ?? -1;
  const mainGap = track.ramps.find((r) => r.path === -1 && r.gap)?.gap;

  const inTunnelOrGap = (s: number) => {
    if (sTunnelStart >= 0 && sTunnelEnd >= 0 && s >= sTunnelStart - 3 && s <= sTunnelEnd + 3) return true;
    if (sCaveStart >= 0 && sCaveEnd >= 0 && s >= sCaveStart - 2 && s <= sCaveEnd + 2) return true;
    if (mainGap && s >= mainGap.sFrom - 5 && s <= mainGap.sTo + 5) return true;
    return false;
  };

  // Helper para adicionar cacto saguaro cilíndrico suave com domo semiesférico e braços orgânicos
  const addSaguaro = (px: number, pz: number, baseY: number, heading: number, s: number, side: number) => {
    const trunkH = 3.6 + ((s * 3.7) % 4) * 0.45;
    const trunkGeo = new THREE.CylinderGeometry(0.38, 0.42, trunkH, 14);
    trunkGeo.translate(px, baseY + trunkH / 2, pz);
    saguaroGeos.push(trunkGeo);

    // Topo arredondado com domo semiesférico
    const capGeo = new THREE.SphereGeometry(0.38, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    capGeo.translate(px, baseY + trunkH, pz);
    saguaroGeos.push(capGeo);

    const nrm = sideNormal(Math.sin(heading), Math.cos(heading));

    // Braço primário curvo orgânico: cotovelo horizontal cilíndrico + segmento vertical + cúpula semiesférica no topo
    const armH1 = trunkH * 0.52;
    const elbowR1 = 0.22;
    const elbowLen1 = 0.85;
    const armHBar1 = new THREE.CylinderGeometry(elbowR1, elbowR1, elbowLen1, 14);
    armHBar1.rotateZ(Math.PI / 2);
    armHBar1.rotateY(heading);
    armHBar1.translate(px + nrm.x * (elbowLen1 / 2 + 0.18) * side, baseY + armH1, pz + nrm.z * (elbowLen1 / 2 + 0.18) * side);
    saguaroGeos.push(armHBar1);

    const vertLen1 = 1.6 + ((s * 2) % 3) * 0.3;
    const armX1 = px + nrm.x * (elbowLen1 + 0.18) * side;
    const armZ1 = pz + nrm.z * (elbowLen1 + 0.18) * side;
    const armVBar1 = new THREE.CylinderGeometry(elbowR1, elbowR1 * 1.05, vertLen1, 14);
    armVBar1.translate(armX1, baseY + armH1 + vertLen1 / 2, armZ1);
    saguaroGeos.push(armVBar1);

    const armCap1 = new THREE.SphereGeometry(elbowR1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    armCap1.translate(armX1, baseY + armH1 + vertLen1, armZ1);
    saguaroGeos.push(armCap1);

    // Segundo braço do lado oposto para cactos mais altos
    if (trunkH > 4.0) {
      const armH2 = trunkH * 0.38;
      const elbowR2 = 0.20;
      const elbowLen2 = 0.75;
      const armHBar2 = new THREE.CylinderGeometry(elbowR2, elbowR2, elbowLen2, 14);
      armHBar2.rotateZ(-Math.PI / 2);
      armHBar2.rotateY(heading);
      armHBar2.translate(px - nrm.x * (elbowLen2 / 2 + 0.18) * side, baseY + armH2, pz - nrm.z * (elbowLen2 / 2 + 0.18) * side);
      saguaroGeos.push(armHBar2);

      const vertLen2 = 1.3 + ((s * 5) % 2) * 0.3;
      const armX2 = px - nrm.x * (elbowLen2 + 0.18) * side;
      const armZ2 = pz - nrm.z * (elbowLen2 + 0.18) * side;
      const armVBar2 = new THREE.CylinderGeometry(elbowR2, elbowR2 * 1.05, vertLen2, 14);
      armVBar2.translate(armX2, baseY + armH2 + vertLen2 / 2, armZ2);
      saguaroGeos.push(armVBar2);

      const armCap2 = new THREE.SphereGeometry(elbowR2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      armCap2.translate(armX2, baseY + armH2 + vertLen2, armZ2);
      saguaroGeos.push(armCap2);
    }
  };

  // Helper para adicionar cacto-bola suave com flores desabrochadas coloridas no topo
  const addBarrel = (px: number, pz: number, baseY: number, s: number) => {
    const bRad = 0.65 + ((s * 2.3) % 4) * 0.12;
    const barrelGeo = new THREE.SphereGeometry(bRad, 14, 12);
    barrelGeo.scale(1, 1.15, 1);
    barrelGeo.translate(px, baseY + bRad * 1.0, pz);
    barrelGeos.push(barrelGeo);

    // Flores desabrochadas coloridas no topo dos cactos-bola (5 pequenas pétalas semiesféricas)
    const flowerColorChoice = Math.floor(s * 1.9) % 3;
    const targetFlowerList = flowerColorChoice === 0 ? flowerMagentaGeos : flowerColorChoice === 1 ? flowerGoldGeos : flowerOrangeGeos;
    const petalRad = 0.12;
    const crownRad = bRad * 0.32;
    const topY = baseY + bRad * 2.12;
    for (let k = 0; k < 5; k++) {
      const angle = (k * 2 * Math.PI) / 5;
      const petalGeo = new THREE.SphereGeometry(petalRad, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      petalGeo.translate(px + Math.cos(angle) * crownRad, topY, pz + Math.sin(angle) * crownRad);
      targetFlowerList.push(petalGeo);
    }
  };

  // Helper para adicionar Palmas / Cacto Orelha-de-padre (Prickly Pear) em leques angulados
  const addPricklyPear = (px: number, pz: number, baseY: number, s: number) => {
    const rot = (s * 3.1) % (Math.PI * 2);
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    const trans = (geo: THREE.BufferGeometry, lx: number, ly: number, lz: number) => {
      const rx = lx * c - lz * sn;
      const rz = lx * sn + lz * c;
      geo.translate(px + rx, baseY + ly, pz + rz);
      pearGeos.push(geo);
    };

    // Palma base
    const p1 = new THREE.SphereGeometry(0.5, 12, 10);
    p1.scale(1, 1.2, 0.22);
    trans(p1, 0, 0.55, 0);

    // Palmas em leque angulado
    const p2 = new THREE.SphereGeometry(0.42, 12, 10);
    p2.scale(1, 1.15, 0.2);
    p2.rotateZ(-0.45);
    trans(p2, 0.38, 1.15, 0.05);

    const p3 = new THREE.SphereGeometry(0.4, 12, 10);
    p3.scale(1, 1.15, 0.2);
    p3.rotateZ(0.4);
    trans(p3, -0.35, 1.1, -0.05);

    if ((s * 7) % 3 > 1) {
      const p4 = new THREE.SphereGeometry(0.34, 12, 10);
      p4.scale(1, 1.15, 0.2);
      p4.rotateZ(-0.15);
      trans(p4, 0.12, 1.65, 0.02);
    }
  };

  // Helper para adicionar tufos de capim dourado do sertão
  const addGoldenGrass = (px: number, pz: number, baseY: number, s: number) => {
    const numStems = 7;
    for (let g = 0; g < numStems; g++) {
      const stemAngle = (g * 2 * Math.PI) / numStems + ((s * 2.7) % 1);
      const stemH = 0.85 + ((g * 13) % 4) * 0.15;
      const grassCone = new THREE.ConeGeometry(0.06, stemH, 6);
      grassCone.translate(0, stemH / 2, 0);
      grassCone.rotateZ(0.32 + ((g * 11) % 3) * 0.08);
      grassCone.rotateY(stemAngle);
      grassCone.translate(px, baseY, pz);
      grassGeos.push(grassCone);
    }
  };

  // 1. Distribuição regular e abundante ao longo das laterais da pista
  for (let s = 6; s < track.length - 6; s += 4.5) {
    if (inTunnelOrGap(s)) continue;
    const at = pointAt(track, s);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    const baseY = heightAt(track, s);

    for (const side of [-1, 1]) {
      const distOff = at.halfWidth + 2.4 + ((s * 5.3 + (side > 0 ? 3 : 0)) % 6) * 1.1;
      const px = at.pos.x + nrm.x * distOff * side;
      const pz = at.pos.z + nrm.z * distOff * side;
      if (!free({ x: px, z: pz }, 1.2)) continue;

      const type = (Math.floor(s * 1.5) + (side > 0 ? 2 : 0)) % 5;
      if (type === 0 || type === 3) {
        addSaguaro(px, pz, baseY, at.heading, s, side);
      } else if (type === 1) {
        addBarrel(px, pz, baseY, s);
      } else if (type === 2) {
        addPricklyPear(px, pz, baseY, s);
      } else {
        addGoldenGrass(px, pz, baseY, s);
      }
    }
  }

  // 2. Distribuição orgânica adicional nas dunas e colinas ao redor
  let seed = 42;
  const pseudoRand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const xs = track.points.map((p) => p.x);
  const zs = track.points.map((p) => p.z);
  const minX = Math.min(...xs) - 30;
  const maxX = Math.max(...xs) + 30;
  const minZ = Math.min(...zs) - 30;
  const maxZ = Math.max(...zs) + 30;

  for (let i = 0; i < 90; i++) {
    const rx = minX + pseudoRand() * (maxX - minX);
    const rz = minZ + pseudoRand() * (maxZ - minZ);
    const pr = progressOf(track, { x: rx, z: rz });
    if (pr.dist < pr.halfWidth + 8) continue;
    if (inTunnelOrGap(pr.s)) continue;

    const baseY = heightAt(track, pr.s);
    const t = Math.floor(pseudoRand() * 5);
    if (t === 0 || t === 1) {
      addSaguaro(rx, rz, baseY, 0, i * 7, 1);
    } else if (t === 2) {
      addBarrel(rx, rz, baseY, i * 7);
    } else if (t === 3) {
      addPricklyPear(rx, rz, baseY, i * 7);
    } else {
      addGoldenGrass(rx, rz, baseY, i * 7);
    }
  }

  // Meshes combinados com materiais orgânicos (flatShading: false, alta suavidade)
  if (saguaroGeos.length > 0) {
    const mergedSaguaro = safeMerge(saguaroGeos);
    if (mergedSaguaro) {
      const saguaroMat = new THREE.MeshStandardMaterial({
        color: "#2f6b36",
        roughness: 0.85,
        flatShading: false,
      });
      const saguaroMesh = new THREE.Mesh(mergedSaguaro, saguaroMat);
      saguaroMesh.castShadow = true;
      saguaroMesh.receiveShadow = true;
      group.add(saguaroMesh);
    }
  }

  if (barrelGeos.length > 0) {
    const mergedBarrel = safeMerge(barrelGeos);
    if (mergedBarrel) {
      const barrelMat = new THREE.MeshStandardMaterial({
        color: "#3d7a42",
        roughness: 0.85,
        flatShading: false,
      });
      const barrelMesh = new THREE.Mesh(mergedBarrel, barrelMat);
      barrelMesh.castShadow = true;
      barrelMesh.receiveShadow = true;
      group.add(barrelMesh);
    }
  }

  if (pearGeos.length > 0) {
    const mergedPear = safeMerge(pearGeos);
    if (mergedPear) {
      const pearMat = new THREE.MeshStandardMaterial({
        color: "#346e38",
        roughness: 0.85,
        flatShading: false,
      });
      const pearMesh = new THREE.Mesh(mergedPear, pearMat);
      pearMesh.castShadow = true;
      pearMesh.receiveShadow = true;
      group.add(pearMesh);
    }
  }

  // Flores coloridas nos cactos-bola
  const addFlowerMesh = (geos: THREE.BufferGeometry[], hex: string) => {
    if (geos.length === 0) return;
    const merged = safeMerge(geos);
    if (merged) {
      const mat = new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.6,
        flatShading: false,
      });
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = false;
      m.receiveShadow = true;
      group.add(m);
    }
  };
  addFlowerMesh(flowerMagentaGeos, "#f06aa0");
  addFlowerMesh(flowerGoldGeos, "#f7c23a");
  addFlowerMesh(flowerOrangeGeos, "#f0884a");

  if (grassGeos.length > 0) {
    const mergedGrass = safeMerge(grassGeos);
    if (mergedGrass) {
      const grassMat = new THREE.MeshStandardMaterial({
        color: "#c9a866",
        roughness: 0.95,
        flatShading: false,
      });
      const grassMesh = new THREE.Mesh(mergedGrass, grassMat);
      grassMesh.castShadow = false;
      grassMesh.receiveShadow = true;
      group.add(grassMesh);
    }
  }

  return group;
}

/** Palmeiras e espelho d'água perto do Oásis do Sertão. */
function buildOasis(track: Track): THREE.Group {
  const group = new THREE.Group();
  const sOasis = track.ctrlS[4] ?? 40;
  const at = pointAt(track, sOasis);
  const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
  const baseY = heightAt(track, sOasis);

  const poolCenter = {
    x: at.pos.x + nrm.x * 20,
    z: at.pos.z + nrm.z * 20,
  };

  const poolMat = new THREE.MeshStandardMaterial({
    color: "#26a69a",
    roughness: 0.1,
    metalness: 0.35,
    transparent: true,
    opacity: 0.85,
  });
  const waterMesh = mesh(new THREE.CircleGeometry(11, 24), poolMat, poolCenter.x, baseY + 0.08, poolCenter.z);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.receiveShadow = true;
  group.add(waterMesh);

  const oasisGrassMat = new THREE.MeshStandardMaterial({ color: "#3d9154", roughness: 0.85 });
  const oasisRing = mesh(new THREE.RingGeometry(10.5, 13.5, 24), oasisGrassMat, poolCenter.x, baseY + 0.06, poolCenter.z);
  oasisRing.rotation.x = -Math.PI / 2;
  oasisRing.receiveShadow = true;
  group.add(oasisRing);

  const trunkMat = new THREE.MeshStandardMaterial({ color: "#6d472c", roughness: 0.85 });
  const leafMat = new THREE.MeshStandardMaterial({ color: "#2d7d32", roughness: 0.6, flatShading: true });

  const numPalms = 8;
  for (let p = 0; p < numPalms; p++) {
    const angle = (p / numPalms) * Math.PI * 2;
    const r = 12 + (p % 3) * 1.5;
    const px = poolCenter.x + Math.cos(angle) * r;
    const pz = poolCenter.z + Math.sin(angle) * r;
    const palmH = 6.5 + (p % 3) * 1.2;

    const palm = new THREE.Group();
    palm.position.set(px, baseY, pz);
    const trunkSegs = 4;
    for (let s = 0; s < trunkSegs; s++) {
      const segH = palmH / trunkSegs;
      const seg = mesh(new THREE.CylinderGeometry(0.24 - s * 0.03, 0.28 - s * 0.03, segH, 8), trunkMat, Math.sin(s * 0.3) * 0.3, s * segH + segH / 2, Math.cos(s * 0.3) * 0.3);
      palm.add(seg);
    }

    const crownY = palmH;
    const numLeaves = 7;
    for (let l = 0; l < numLeaves; l++) {
      const la = (l / numLeaves) * Math.PI * 2;
      const leafGeo = new THREE.BoxGeometry(0.35, 0.08, 3.2);
      const leaf = mesh(leafGeo, leafMat, Math.cos(la) * 1.2, crownY - 0.4, Math.sin(la) * 1.2, -la);
      leaf.rotation.x = 0.45;
      palm.add(leaf);
    }
    group.add(palm);
  }

  return group;
}

/** Casinhas rústicas de adobe com vigas de madeira no setor "Vilarejo de Adobe". */
function buildAdobeVillage(track: Track): THREE.Group {
  const group = new THREE.Group();
  const adobeMat = new THREE.MeshStandardMaterial({
    color: "#ba7850",
    roughness: 0.92,
  });
  const beamMat = new THREE.MeshStandardMaterial({
    color: "#3e2716",
    roughness: 0.85,
  });
  const darkDoorMat = new THREE.MeshStandardMaterial({
    color: "#22140c",
    roughness: 0.9,
  });
  const potMat = new THREE.MeshStandardMaterial({
    color: "#9c4a2a",
    roughness: 0.8,
  });

  const villageCtrls = [33, 34, 35, 36];
  for (const ctrlIdx of villageCtrls) {
    const s = track.ctrlS[ctrlIdx];
    if (s === undefined) continue;
    const at = pointAt(track, s);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    const baseY = heightAt(track, s);

    for (const side of [-1, 1]) {
      const dist = at.halfWidth + 4.5 + ((ctrlIdx * 5) % 3);
      const hx = at.pos.x + nrm.x * dist * side;
      const hz = at.pos.z + nrm.z * dist * side;

      const house = new THREE.Group();
      house.position.set(hx, baseY, hz);
      house.rotation.y = at.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2);

      const w = 4.4 + (ctrlIdx % 2) * 1.0;
      const h = 3.2 + (ctrlIdx % 3) * 0.4;
      const d = 4.2;

      const body = mesh(new THREE.BoxGeometry(w, h, d), adobeMat, 0, h / 2, 0);
      house.add(body);

      // Vigas de madeira salientes no topo da parede
      const numBeams = 5;
      for (let b = 0; b < numBeams; b++) {
        const bx = -w / 2 + 0.6 + (b * (w - 1.2)) / (numBeams - 1);
        const beam = mesh(new THREE.CylinderGeometry(0.12, 0.12, d + 0.9, 8), beamMat, bx, h - 0.25, 0);
        beam.rotation.x = Math.PI / 2;
        house.add(beam);
      }

      // Porta rústica e janelas
      const doorH = 2.0;
      const doorW = 0.95;
      const door = mesh(new THREE.BoxGeometry(doorW, doorH, 0.1), darkDoorMat, 0.4, doorH / 2, d / 2 + 0.02);
      house.add(door);

      for (const jx of [-1.2, 1.2]) {
        const win = mesh(new THREE.BoxGeometry(0.65, 0.65, 0.1), darkDoorMat, jx, 1.9, d / 2 + 0.02);
        house.add(win);
      }

      // Vasos de barro na frente
      const pot1 = mesh(new THREE.CylinderGeometry(0.3, 0.18, 0.65, 8), potMat, -w / 2 - 0.4, 0.32, d / 2 + 0.3);
      const pot2 = mesh(new THREE.CylinderGeometry(0.25, 0.15, 0.5, 8), potMat, -w / 2 - 0.9, 0.25, d / 2 + 0.2);
      house.add(pot1);
      house.add(pot2);

      group.add(house);
    }
  }

  return group;
}

/** Paredões rochosos do cânion e chapadas/dunas distantes no horizonte. */
function buildDesertCliffsAndMesas(stat: THREE.Group, track: Track, _textures: THREE.Texture[]): void {
  const rockMat = new THREE.MeshStandardMaterial({
    color: "#8b5840",
    roughness: 0.95,
    flatShading: true,
  });
  const darkRockMat = new THREE.MeshStandardMaterial({
    color: "#6b422e",
    roughness: 0.95,
    flatShading: true,
  });

  for (let s = 2; s < track.length; s += 8) {
    const room = roomAt(track, s);
    const isCanyonOrMacico = room === "Largada do Cânion" || room === "Maciço Rochoso" || room === "Salto do Abismo";
    if (!isCanyonOrMacico) continue;

    // Não colocar rochas soltas dentro do túnel cilíndrico do maciço rochoso
    const sTunStart = track.ctrlS[14] ?? -1;
    const sTunEnd = track.ctrlS[20] ?? -1;
    if (sTunStart >= 0 && sTunEnd >= 0 && s >= sTunStart - 2 && s <= sTunEnd + 2) continue;

    const at = pointAt(track, s);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    const by = heightAt(track, s);

    for (const side of [-1, 1]) {
      const dist = at.halfWidth + 3.2 + ((s * 3) % 4);
      const cx = at.pos.x + nrm.x * dist * side;
      const cz = at.pos.z + nrm.z * dist * side;
      const cliffH = 4.5 + ((s * 7) % 5) * 1.2;

      const rock = mesh(new THREE.DodecahedronGeometry(2.6, 1), (s % 2 === 0 ? rockMat : darkRockMat), cx, by + cliffH / 2, cz);
      rock.scale.set(1.4, cliffH / 2.6, 1.6);
      stat.add(rock);
    }
  }

  const xs = track.points.map((p) => p.x);
  const zs = track.points.map((p) => p.z);
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const midZ = (Math.min(...zs) + Math.max(...zs)) / 2;
  const horizonR = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2 + 55;

  const mesaMat = new THREE.MeshStandardMaterial({
    color: "#b07252",
    roughness: 0.95,
    flatShading: true,
  });
  const duneHorizonMat = new THREE.MeshStandardMaterial({
    color: "#d9a566",
    roughness: 0.95,
  });

  const count = 28;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const dist = horizonR + ((i % 5) * 12);
    const mx = midX + Math.cos(angle) * dist;
    const mz = midZ + Math.sin(angle) * dist;
    const isMesa = i % 2 === 0;

    if (isMesa) {
      const mw = 28 + (i % 3) * 10;
      const mh = 18 + (i % 4) * 8;
      const mesa = mesh(new THREE.CylinderGeometry(mw * 0.75, mw, mh, 7), mesaMat, mx, mh / 2 - 2, mz, angle);
      stat.add(mesa);
    } else {
      const dw = 35 + (i % 3) * 12;
      const dh = 14 + (i % 4) * 6;
      const dune = mesh(new THREE.ConeGeometry(dw, dh, 6), duneHorizonMat, mx, dh / 2 - 2, mz, angle);
      stat.add(dune);
    }
  }
}

function decorateDeserto(scene: THREE.Scene, stat: THREE.Group, track: Track, textures: THREE.Texture[]): void {
  scene.add(buildDesertVegetation(track));
  scene.add(buildOasis(track));
  scene.add(buildAdobeVillage(track));
  scene.add(buildDesertTunnel(track, textures));
  scene.add(buildCaveTunnel(track));
  buildDesertCliffsAndMesas(stat, track, textures);
}

/**
 * Monta a pista a partir do traçado (o mesmo da simulação do servidor).
 * Devolve a função que libera as texturas de canvas (placas e faixa de largada); geometrias e materiais saem com a cena.
 */
export function buildTrack(scene: THREE.Scene, track: Track): () => void {
  const textures: THREE.Texture[] = [];
  const n = track.points.length;
  // tudo que não se mexe e não tem textura própria entra aqui e é unido no fim
  const stat = new THREE.Group();
  const parking = track.id === "estacionamento";
  const isParque = track.id === "parque";
  const isDeserto = track.id === "deserto";

  // Iluminação e Névoa para o Deserto
  if (isDeserto) {
    scene.fog = new THREE.Fog("#e7cfa8", 50, 220);
    if (scene.background instanceof THREE.Color) {
      scene.background.set("#e7cfa8");
    }
    let hasDir = false;
    scene.traverse((obj) => {
      if (obj instanceof THREE.DirectionalLight) {
        hasDir = true;
        obj.color.set("#ffe2b8");
      } else if (obj instanceof THREE.HemisphereLight) {
        obj.color.set("#ffe2b8");
        obj.groundColor.set("#d29b68");
      }
    });
    if (!hasDir) {
      const sun = new THREE.DirectionalLight("#ffe2b8", 1.8);
      sun.position.set(45, 65, 30);
      sun.castShadow = true;
      scene.add(sun);
      const hemi = new THREE.HemisphereLight("#ffe2b8", "#d29b68", 1.2);
      scene.add(hemi);
    }
  }

  // chão em volta do traçado, com folga para a decoração
  const xs = track.points.map((p) => p.x);
  const zs = track.points.map((p) => p.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const gw = Math.max(...xs) - Math.min(...xs) + (isDeserto ? 80 : 50);
  const gd = Math.max(...zs) - Math.min(...zs) + (isDeserto ? 80 : 50);
  // vãos das rampas viram buracos no chão (o piso em volta é recortado)
  const pits = track.ramps.filter((r) => r.gap).map((r) => gapPit(track, r));
  const groundShape = new THREE.Shape([new THREE.Vector2(-gw / 2, -gd / 2), new THREE.Vector2(gw / 2, -gd / 2), new THREE.Vector2(gw / 2, gd / 2), new THREE.Vector2(-gw / 2, gd / 2)]);
  // o plano deitado (rotation.x = -90 graus) leva o y local para -z do mundo
  for (const p of pits) groundShape.holes.push(new THREE.Path(p.outline.map((q) => new THREE.Vector2(q.x - cx, -(q.z - cz)))));
  // escritório: carpete em placas; estacionamento: concreto com a grade de sempre; parque: gramado verdejante; deserto: terreno arenoso
  const groundMat = isDeserto
    ? new THREE.MeshStandardMaterial({ color: "#d9a566", map: desertSandTexture(textures), roughness: 0.95 })
    : isParque
      ? new THREE.MeshStandardMaterial({ color: "#2d7a38", roughness: 0.9 })
      : parking
        ? new THREE.MeshStandardMaterial({ color: "#9a9c9f", roughness: 1 })
        : new THREE.MeshStandardMaterial({ map: carpetTexture(textures), roughness: 0.85 });
  const ground = mesh(new THREE.ShapeGeometry(groundShape), groundMat, cx, -0.02, cz);
  ground.rotation.x = -Math.PI / 2;
  for (const p of pits) scene.add(p.group);
  for (const r of track.ramps) {
    if (rampModel) {
      scene.add(buildRampGlb(track, r, rampModel));
    } else {
      const fallback = rampMesh(track, r);
      scene.add(fallback);
      void preloadRamp().then((model) => {
        if (model) {
          scene.remove(fallback);
          fallback.geometry.dispose();
          (fallback.material as THREE.Material).dispose();
          scene.add(buildRampGlb(track, r, model));
        }
      });
    }
  }
  ground.castShadow = false;
  if (!isParque) scene.add(ground);
  if (parking) {
    const grid = new THREE.GridHelper(Math.max(gw, gd), Math.round(Math.max(gw, gd) / 2), "#000000", "#000000");
    grid.position.set(cx, 0, cz);
    (grid.material as THREE.Material).opacity = 0.06;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);
  }

  if (isParque) {
    const addParqueModel = (model: THREE.Group) => {
      const clone = model.clone(true);
      clone.position.set(0, 0, 0);
      scene.add(clone);
    };
    if (parqueModel) {
      addParqueModel(parqueModel);
    } else {
      void preloadParque().then((m) => {
        if (m) addParqueModel(m);
      });
    }
  }

  const edges = trackEdges(track);
  const colors = track.cum.map((s) => new THREE.Color(ROOM_FLOOR[roomAt(track, s)]));
  // escritório: placas acetinadas tingidas pela cor do ambiente; estacionamento continua liso; parque: asfalto esportivo; deserto: asfalto rústico
  const tiles = isDeserto
    ? desertRoadTexture(textures)
    : isParque
      ? parkRoadTexture(textures)
      : parking
        ? null
        : trackTexture(textures);
  const floorMat = () => {
    if (tiles) {
      const mat = new THREE.MeshStandardMaterial({
        map: tiles,
        vertexColors: true,
        roughness: isDeserto ? 0.92 : isParque ? 0.65 : 0.28,
        metalness: 0.05,
        side: isDeserto ? THREE.DoubleSide : THREE.FrontSide,
      });
      if (!isParque && !isDeserto) applyWaxedFloorSheen(mat, { sheenIntensity: 0.85, neonColor: "#e0f2fe" });
      return mat;
    }
    return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  };
  // guia de 45 cm nas duas beiradas e sombra de contato no pé das paredes
  const curbW = 0.45;
  const innerPlus: Vec2[] = [];
  const innerMinus: Vec2[] = [];
  const aoPlus: Vec2[] = [];
  const aoMinus: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p = track.points[i];
    const dx = edges.plus[i].x - p.x;
    const dz = edges.plus[i].z - p.z;
    const hw = Math.hypot(dx, dz) || 1;
    const at = (d: number, s: number) => ({ x: p.x + (dx / hw) * d * s, z: p.z + (dz / hw) * d * s });
    innerPlus.push(at(hw - curbW, 1));
    innerMinus.push(at(hw - curbW, -1));
    aoPlus.push(at(hw - 0.22, 1));
    aoMinus.push(at(hw - 0.22, -1));
  }
  if (!isParque) {
    const mainGap = track.ramps.find((r) => r.path === -1 && r.gap)?.gap;
    const curbMat = new THREE.MeshStandardMaterial({
      map: isDeserto ? desertCurbTexture(textures) : curbTexture(textures),
      roughness: isDeserto ? 0.85 : 0.42,
      metalness: 0.05,
      side: isDeserto ? THREE.DoubleSide : THREE.FrontSide,
    });

    if (mainGap) {
      // Quando há vão na pista principal, o asfalto não cruza o abismo
      const afterGap: number[] = [];
      const beforeGap: number[] = [];
      for (let i = 0; i < n; i++) {
        const s = track.cum[i];
        if (s > mainGap.sTo) afterGap.push(i);
        else if (s < mainGap.sFrom) beforeGap.push(i);
      }
      const order = [...afterGap, ...beforeGap];

      if (isDeserto && track.corkscrew) {
        // No deserto com saca-rolhas (corkscrew loop), geramos os pontos 3D da malha com rotação e amostragem fina
        const sDense: number[] = [mainGap.sTo];
        for (let idx = 0; idx < order.length; idx++) {
          const s = track.cum[order[idx]];
          const prev = sDense[sDense.length - 1];
          const inCorkZone = s >= track.corkscrew.sStart - 6 && s <= track.corkscrew.sEnd + 6;
          const maxStep = inCorkZone ? 1.25 : 5.5;
          if (s > prev + maxStep && s - prev < 25) {
            const count = Math.ceil((s - prev) / maxStep);
            for (let k = 1; k < count; k++) {
              sDense.push(prev + ((s - prev) * k) / count);
            }
          }
          sDense.push(s);
        }
        sDense.push(mainGap.sFrom);

        const inP: THREE.Vector3[] = [];
        const inM: THREE.Vector3[] = [];
        const edgeP: THREE.Vector3[] = [];
        const edgeM: THREE.Vector3[] = [];
        const inCurbP: THREE.Vector3[] = [];
        const inCurbM: THREE.Vector3[] = [];
        const cList: THREE.Color[] = [];

        for (const s of sDense) {
          const at = pointAt(track, s);
          const hw = at.halfWidth;
          inP.push(trackPoint3D(track, s, hw - curbW, 0.01));
          inM.push(trackPoint3D(track, s, -(hw - curbW), 0.01));
          edgeP.push(trackPoint3D(track, s, hw, 0.016));
          edgeM.push(trackPoint3D(track, s, -hw, 0.016));
          inCurbP.push(trackPoint3D(track, s, hw - curbW, 0.016));
          inCurbM.push(trackPoint3D(track, s, -(hw - curbW), 0.016));
          cList.push(new THREE.Color(ROOM_FLOOR[roomAt(track, s)]));
        }

        const floor = new THREE.Mesh(ribbon(inP, inM, 0, cList, false), floorMat());
        floor.receiveShadow = true;
        scene.add(floor);

        const leftCurb = new THREE.Mesh(ribbon(edgeP, inCurbP, 0, null, false, 0.5), curbMat);
        leftCurb.receiveShadow = true;
        scene.add(leftCurb);

        const rightCurb = new THREE.Mesh(ribbon(inCurbM, edgeM, 0, null, false, 0.5), curbMat);
        rightCurb.receiveShadow = true;
        scene.add(rightCurb);
      } else {
        const atTo = pointAt(track, mainGap.sTo);
        const nrmTo = sideNormal(Math.sin(atTo.heading), Math.cos(atTo.heading));
        const atFrom = pointAt(track, mainGap.sFrom);
        const nrmFrom = sideNormal(Math.sin(atFrom.heading), Math.cos(atFrom.heading));

        const inP = [
          { x: atTo.pos.x + nrmTo.x * (atTo.halfWidth - curbW), z: atTo.pos.z + nrmTo.z * (atTo.halfWidth - curbW) },
          ...order.map((i) => innerPlus[i]),
          { x: atFrom.pos.x + nrmFrom.x * (atFrom.halfWidth - curbW), z: atFrom.pos.z + nrmFrom.z * (atFrom.halfWidth - curbW) },
        ];
        const inM = [
          { x: atTo.pos.x - nrmTo.x * (atTo.halfWidth - curbW), z: atTo.pos.z - nrmTo.z * (atTo.halfWidth - curbW) },
          ...order.map((i) => innerMinus[i]),
          { x: atFrom.pos.x - nrmFrom.x * (atFrom.halfWidth - curbW), z: atFrom.pos.z - nrmFrom.z * (atFrom.halfWidth - curbW) },
        ];
        const sList = [mainGap.sTo, ...order.map((i) => track.cum[i]), mainGap.sFrom];
        const cList = sList.map((s) => new THREE.Color(ROOM_FLOOR[roomAt(track, s)]));
        const yFloor = sList.map((s) => heightAt(track, s) + 0.01);
        const yCurb = sList.map((s) => heightAt(track, s) + 0.016);

        const floor = new THREE.Mesh(ribbon(inP, inM, yFloor, cList, false), floorMat());
        floor.receiveShadow = true;
        scene.add(floor);

        const edgeP = [
          { x: atTo.pos.x + nrmTo.x * atTo.halfWidth, z: atTo.pos.z + nrmTo.z * atTo.halfWidth },
          ...order.map((i) => edges.plus[i]),
          { x: atFrom.pos.x + nrmFrom.x * atFrom.halfWidth, z: atFrom.pos.z + nrmFrom.z * atFrom.halfWidth },
        ];
        const edgeM = [
          { x: atTo.pos.x - nrmTo.x * atTo.halfWidth, z: atTo.pos.z - nrmTo.z * atTo.halfWidth },
          ...order.map((i) => edges.minus[i]),
          { x: atFrom.pos.x - nrmFrom.x * atFrom.halfWidth, z: atFrom.pos.z - nrmFrom.z * atFrom.halfWidth },
        ];

        for (const [a, b] of [[edgeP, inP], [inM, edgeM]]) {
          const curb = new THREE.Mesh(ribbon(a, b, yCurb, null, false, 0.5), curbMat);
          curb.receiveShadow = true;
          scene.add(curb);
        }
      }
    } else {
      const yFloor = track.heights ? track.cum.map((s) => heightAt(track, s) + 0.01) : 0.01;
      const floor = new THREE.Mesh(ribbon(innerPlus, innerMinus, yFloor, colors, true), floorMat());
      floor.receiveShadow = true;
      scene.add(floor);
      const yCurb = track.heights ? track.cum.map((s) => heightAt(track, s) + 0.016) : 0.016;
      for (const [a, b] of [[edges.plus, innerPlus], [innerMinus, edges.minus]]) {
        const curb = new THREE.Mesh(ribbon(a, b, yCurb, null, true, 0.5), curbMat);
        curb.receiveShadow = true;
        scene.add(curb);
      }
      const yAo = track.heights ? track.cum.map((s) => heightAt(track, s) + 0.018) : 0.018;
      const aoMat = new THREE.MeshBasicMaterial({ color: "#0a0f18", transparent: true, opacity: 0.38, depthWrite: false });
      scene.add(new THREE.Mesh(ribbon(edges.plus, aoPlus, yAo, null, true, 0.1), aoMat));
      scene.add(new THREE.Mesh(ribbon(aoMinus, edges.minus, yAo, null, true, 0.1), aoMat));
    }
  }
  // atalhos: piso um pouco acima da principal para não brigar com ela nas bocas
  track.branches.forEach((br, j) => {
    const e = branchEdges(track, j);
    const cols = br.sOff.map((o) => new THREE.Color(ROOM_FLOOR[roomAt(track, br.sFrom + o)]).multiplyScalar(0.9));
    const gap = track.ramps.find((r) => r.path === j && r.gap)?.gap;
    // com vão, o piso do atalho para na beira dele e recomeça do outro lado
    const pieces = gap
      ? [
          { from: 0, to: Math.floor(gap.sFrom / br.spacing), endAt: gap.sFrom, startAt: null as number | null },
          { from: Math.ceil(gap.sTo / br.spacing), to: br.points.length - 1, endAt: null as number | null, startAt: gap.sTo },
        ]
      : [{ from: 0, to: br.points.length - 1, endAt: null, startAt: null }];
    for (const pc of pieces) {
      const plus = e.plus.slice(pc.from, pc.to + 1);
      const minus = e.minus.slice(pc.from, pc.to + 1);
      const cc = cols.slice(pc.from, pc.to + 1);
      if (pc.startAt !== null) {
        const ed = edgesBetween(track, j, pc.startAt, pc.startAt, 1);
        plus.unshift(ed.plus[0]);
        minus.unshift(ed.minus[0]);
        cc.unshift(cc[0]);
      }
      if (pc.endAt !== null) {
        const ed = edgesBetween(track, j, pc.endAt, pc.endAt, 1);
        plus.push(ed.plus[0]);
        minus.push(ed.minus[0]);
        cc.push(cc[cc.length - 1]);
      }
      const yFrom = heightAt(track, br.sFrom);
      const yTo = heightAt(track, br.sTo);
      const hy = isParque
        ? plus.map((_, idx) => yFrom + (yTo - yFrom) * (idx / Math.max(1, plus.length - 1)) + 0.03)
        : 0.012;
      const m = new THREE.Mesh(ribbon(plus, minus, hy, cc, false), floorMat());
      m.receiveShadow = true;
      scene.add(m);
    }
  });

  // Placas de Dash (Boost Pads)
  if (track.boostPads) {
    for (const s of track.boostPads) {
      scene.add(buildBoostPad(track, s, textures));
    }
  }

  if (!isParque) {
    // fita amarela tracejada no meio
    const mainGap = track.ramps.find((r) => r.path === -1 && r.gap)?.gap;
    const tape = new THREE.MeshStandardMaterial({ color: isDeserto ? "#e6be44" : "#ffd23f", roughness: isDeserto ? 0.85 : 0.45, metalness: 0.05 });
    const tapeGeo = new THREE.BoxGeometry(0.24, 0.024, 1.9);
    for (let s = 4; s < track.length - 2; s += 4) {
      const inGap = mainGap && s >= mainGap.sFrom && s <= mainGap.sTo;
      if (inGap) continue;
      if (track.corkscrew && s >= track.corkscrew.sStart - 2 && s <= track.corkscrew.sEnd + 2) continue;
      const at = pointAt(track, s);
      const tapeY = heightAt(track, s) + 0.02;
      const m = mesh(tapeGeo, tape, at.pos.x, tapeY, at.pos.z, at.heading);
      m.castShadow = false;
      stat.add(m);
    }
  }

  // marcas brancas do grid de largada (mesmas posições da simulação)
  const gridMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4, metalness: 0.1 });
  for (const slot of gridSlots(track, 8)) {
    const g = new THREE.Group();
    const slotY = heightAt(track, slot.s);
    g.position.set(slot.pos.x, slotY + 0.022, slot.pos.z);
    g.rotation.y = slot.heading;
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.022, 0.14), gridMat, 0, 0, 0));
    for (const x of [-0.75, 0.75]) g.add(mesh(new THREE.BoxGeometry(0.12, 0.022, 1.4), gridMat, x, 0, 0));
    g.add(mesh(new THREE.BoxGeometry(0.55, 0.022, 0.12), gridMat, 0, 0, 0.35));
    g.traverse((o) => (o.castShadow = false));
    stat.add(g);
  }

  if (!isParque) {
    // curvas fechadas: zebra e área de escape (grama sintética no escritório/parque, terra/areia no deserto)
    const kerbRed = new THREE.MeshStandardMaterial({ color: isDeserto ? "#a64938" : "#e74c3c", roughness: isDeserto ? 0.85 : 0.5, metalness: 0.05 });
    const kerbWhite = new THREE.MeshStandardMaterial({ color: isDeserto ? "#dfd5c4" : "#f8f9fa", roughness: isDeserto ? 0.85 : 0.5, metalness: 0.05 });
    const grass = new THREE.MeshStandardMaterial({ color: isDeserto ? "#c29b68" : "#27ae60", roughness: isDeserto ? 0.95 : 0.85 });
    const kerbW = 0.65;
    const grassW = RACE.carpetWidth - kerbW;
    const step = 1.1;
    const kerbGeo = createKerbGeometry(kerbW, 0.048, step * 1.04);
    for (const c of track.carpet) {
      const len = c.to >= c.from ? c.to - c.from : c.to + track.length - c.from;
      let k = 0;
      for (let d = 0; d < len; d += step) {
        const at = pointAt(track, c.from + Math.min(len, d + step / 2));
        const kpY = heightAt(track, c.from + Math.min(len, d + step / 2));
        const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
        const off = (r: number) => ({ x: at.pos.x + nrm.x * r * c.side, z: at.pos.z + nrm.z * r * c.side });
        const kp = off(at.halfWidth - kerbW / 2);
        const kerbHeading = at.heading + (c.side === 1 ? 0 : Math.PI);
        stat.add(mesh(kerbGeo, k++ % 2 === 0 ? kerbRed : kerbWhite, kp.x, kpY + 0.038, kp.z, kerbHeading));
        const gp = off(at.halfWidth - kerbW - grassW / 2);
        const gm = mesh(new THREE.BoxGeometry(grassW, 0.032, step * 1.04), grass, gp.x, kpY + 0.028, gp.z, at.heading);
        gm.castShadow = false;
        stat.add(gm);
      }
    }
  }

  // paredes nas bordas: divisórias, vidro na sala de reunião, racks na TI (apenas indoor)
  const wallMats = new Map<string, THREE.Material>();
  const wallMat = (room: string) => {
    let m = wallMats.get(room);
    if (!m) {
      const c = ROOM_WALL[room];
      m =
        c === "glass"
          ? new THREE.MeshStandardMaterial({ color: "#80d0ff", transparent: true, opacity: 0.38, roughness: 0.15, metalness: 0.1 })
          : new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, metalness: 0.03 });
      wallMats.set(room, m);
    }
    return m;
  };
  // faixa no meio da parede com a cor do piso do ambiente
  const stripeMats = new Map<string, THREE.Material>();
  const stripeMat = (room: string) => {
    let m = stripeMats.get(room);
    if (!m) stripeMats.set(room, (m = new THREE.MeshStandardMaterial({ color: ROOM_FLOOR[room], roughness: 0.5, metalness: 0.05 })));
    return m;
  };
  const cap = new THREE.MeshStandardMaterial({ color: "#eef2f7", roughness: 0.35, metalness: 0.45 });
  const baseboard = new THREE.MeshStandardMaterial({ color: "#18202c", roughness: 0.75, metalness: 0.1 });
  const column = new THREE.MeshStandardMaterial({ color: "#222a36", roughness: 0.6, metalness: 0.2 });
  const reflector = new THREE.MeshBasicMaterial({ color: "#ffd23f" });
  // parede de a até b, sem os trechos que caem dentro de outro corredor (boca do atalho fica aberta)
  const wall = (a: Vec2, b: Vec2, room: string, open: (p: Vec2) => boolean) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const parts = Math.max(1, Math.ceil(len / 0.8));
    const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    let from = -1;
    for (let k = 0; k <= parts; k++) {
      const keep = k < parts && !open(at((k + 0.5) / parts));
      if (keep && from < 0) from = k;
      if (!keep && from >= 0) {
        const p = at(from / parts);
        const q = at(k / parts);
        const l = Math.hypot(q.x - p.x, q.z - p.z);
        const ry = Math.atan2(q.x - p.x, q.z - p.z);
        const mx = (p.x + q.x) / 2;
        const mz = (p.z + q.z) / 2;
        stat.add(mesh(new THREE.BoxGeometry(0.24, 0.95, l + 0.25), wallMat(room), mx, 0.475, mz, ry));
        if (ROOM_WALL[room] !== "glass") stat.add(mesh(new THREE.BoxGeometry(0.26, 0.22, l + 0.25), stripeMat(room), mx, 0.56, mz, ry));
        stat.add(mesh(new THREE.BoxGeometry(0.28, 0.16, l + 0.25), baseboard, mx, 0.08, mz, ry));
        const capGeo = new THREE.CylinderGeometry(0.065, 0.065, l + 0.25, 12);
        capGeo.rotateX(Math.PI / 2);
        stat.add(mesh(capGeo, cap, mx, 0.97, mz, ry));
        from = -1;
      }
    }
  };
  const inPath = (path: number, p: Vec2) => {
    const pr = pathProgress(track, path, p);
    return pr.dist < pr.halfWidth - 0.15;
  };
  const inBranch = (p: Vec2) => track.branches.some((_, j) => inPath(j, p));
  if (!isParque && !isDeserto) {
    for (const side of [edges.plus, edges.minus]) {
      for (let i = 0; i < n; i++) {
        wall(side[i], side[(i + 1) % n], roomAt(track, track.cum[i]), inBranch);
        // pilar com faixa refletiva a cada 4 pontos do traçado, fora das bocas de atalho
        if (i % 4 === 0 && !inBranch(side[i])) {
          stat.add(mesh(new THREE.CylinderGeometry(0.20, 0.22, 1.08, 14), column, side[i].x, 0.54, side[i].z));
          const r = mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.12, 14), reflector, side[i].x, 0.78, side[i].z);
          r.castShadow = false;
          stat.add(r);
        }
      }
    }
    track.branches.forEach((br, j) => {
      const e = branchEdges(track, j);
      const room = roomAt(track, br.sFrom + br.sOff[Math.floor(br.points.length / 2)]);
      const open = (p: Vec2) => inPath(-1, p) || track.branches.some((_, o) => o !== j && inPath(o, p));
      for (const side of [e.plus, e.minus]) {
        for (let k = 0; k + 1 < side.length; k++) wall(side[k], side[k + 1], room, open);
      }
    });
  }

  // largada
  const start = pointAt(track, 0);
  const startY = heightAt(track, 0);
  const line = mesh(new THREE.PlaneGeometry(start.halfWidth * 2, 1.4), new THREE.MeshStandardMaterial({ map: checkerTexture(textures), roughness: 0.5, metalness: 0.05 }), start.pos.x, startY + 0.03, start.pos.z);
  line.rotation.set(-Math.PI / 2, 0, 0);
  line.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), start.heading);
  line.castShadow = false;
  scene.add(line);
  startGantry(scene, stat, start, textures, isParque, startY, isDeserto);

  for (const r of track.rooms.slice(1, -1)) {
    const s = track.ctrlS[r.ctrl] + 4;
    const at = pointAt(track, s);
    const signY = heightAt(track, s);
    const sign = textSprite(r.name, textures, isParque ? "Parque Ipanema" : isDeserto ? "Rally do Sertão" : "Setor corporativo", isDeserto);
    sign.position.set(at.pos.x, signY + 3.6, at.pos.z);
    scene.add(sign);
  }

  // luminárias suspensas ao longo do traçado (apenas em ambientes internos)
  if (!isParque && !isDeserto) {
    const lampBody = new THREE.MeshStandardMaterial({ color: "#2c3e50", roughness: 0.6, metalness: 0.3 });
    const led = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#eaf4fc", emissiveIntensity: 0.9 });
    const cable = new THREE.MeshStandardMaterial({ color: "#8b98a5", roughness: 0.6, metalness: 0.4 });
    for (let s = 2; s < track.length; s += 9) {
      const at = pointAt(track, s);
      const g = new THREE.Group();
      g.position.set(at.pos.x, 3.8, at.pos.z);
      g.rotation.y = at.heading;
      g.add(mesh(new THREE.BoxGeometry(0.24, 0.1, 3.4), lampBody, 0, 0, 0));
      g.add(mesh(new THREE.BoxGeometry(0.14, 0.03, 3.3), led, 0, -0.05, 0));
      for (const z of [-1.3, 1.3]) g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.8, 6), cable, 0, 1.4, z));
      g.traverse((o) => (o.castShadow = false));
      stat.add(g);
    }
  }

  // Quadros e Banners Satíricos Corporativos nas paredes do circuito (apenas escritório)
  if (!isParque && !isDeserto) {
    const frameMat = new THREE.MeshStandardMaterial({ color: "#1e2430", roughness: 0.5, metalness: 0.35 });
    const posterTextures = [
      posterMetaTexture(textures),
      posterCafeTexture(textures),
      posterEstagiariosTexture(textures),
      posterReuniaoTexture(textures),
    ];
    let posterIdx = 0;
    for (let s = 10; s < track.length - 8; s += 14) {
      const at = pointAt(track, s);
      const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
      const side = posterIdx % 2 === 0 ? 1 : -1;
      const wallDist = at.halfWidth + 0.14;
      const px = at.pos.x + nrm.x * wallDist * side;
      const pz = at.pos.z + nrm.z * wallDist * side;
      const room = roomAt(track, s);
      if (ROOM_WALL[room] !== "glass" && !inBranch({ x: px, z: pz })) {
        const posterTex = posterTextures[posterIdx % posterTextures.length];
        const posterHeading = at.heading + (side === 1 ? -Math.PI / 2 : Math.PI / 2);
        const poster = buildFramedPoster(posterTex, frameMat, px, 1.34, pz, posterHeading, 2.2, 1.38);
        scene.add(poster);
        posterIdx++;
      }
    }
  }

  // escritório: fachada de vidro em volta e prédios no horizonte (parque e deserto são céu aberto)
  if (!parking && !isParque && !isDeserto) facade(stat, cx, cz, gw / 2 - 1, gd / 2 - 1);
  if (!isParque && !isDeserto) skyline(stat, cx, cz, Math.max(gw, gd) / 2 + 12, textures);

  // Cenário específico do deserto
  if (isDeserto) {
    decorateDeserto(scene, stat, track, textures);
  }

  decorate(stat, track, textures);
  for (const m of mergeStatic(stat)) scene.add(m);
  return () => textures.forEach((t) => t.dispose());
}

/** Pórtico de largada: pilares, travessa alta, semáforo de 3 luzes e a faixa do Rally. */
function startGantry(scene: THREE.Scene, stat: THREE.Group, start: ReturnType<typeof pointAt>, textures: THREE.Texture[], isParque = false, startY = 0, isDeserto = false): void {
  const truss = isDeserto
    ? new THREE.MeshStandardMaterial({ color: "#422818", roughness: 0.85 })
    : new THREE.MeshStandardMaterial({ color: "#1d4ed8", roughness: 0.45, metalness: 0.25 });
  const deco = isDeserto
    ? new THREE.MeshStandardMaterial({ color: "#222222", roughness: 0.5, metalness: 0.7 })
    : new THREE.MeshStandardMaterial({ color: "#f59e0b", roughness: 0.5, metalness: 0.1 });
  const housing = isDeserto
    ? new THREE.MeshStandardMaterial({ color: "#261e18", roughness: 0.7, metalness: 0.4 })
    : new THREE.MeshStandardMaterial({ color: "#181d24", roughness: 0.6, metalness: 0.2 });
  const span = start.halfWidth + 0.6;
  const g = new THREE.Group();
  g.position.set(start.pos.x, startY, start.pos.z);
  g.rotation.y = start.heading;
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(0.42, 5.2, 0.42), truss, span * s, 2.6, 0));
    g.add(mesh(new THREE.BoxGeometry(0.8, 0.25, 0.8), deco, span * s, 0.125, 0));
  }
  g.add(mesh(new THREE.BoxGeometry(span * 2 + 0.7, 0.42, 0.42), truss, 0, 5.15, 0));
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.45, 0.28), housing, 0, 4.65, 0));
  stat.add(g);
  // as lâmpadas têm material próprio (emissivo), ficam fora da junção
  const lamps = new THREE.Group();
  lamps.position.copy(g.position);
  lamps.rotation.y = start.heading;
  ["#ff4757", "#ffa502", "#2ed573"].forEach((color, i) => {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.85, roughness: 0.2 }));
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set((i - 1) * 0.45, 4.65, 0.15);
    lamps.add(lamp);
  });
  scene.add(lamps);
  const banner = textSprite(isDeserto ? "GP do Deserto" : isParque ? "Parque Ipanema" : "Rally da Firma", textures, isDeserto ? "Rally do Sertão" : isParque ? "Grande Prêmio da Cidade" : "Grande prêmio", isDeserto);
  // a faixa termina logo abaixo da caixa do semáforo (base em 4.42 m)
  const bannerH = start.halfWidth * 0.48;
  banner.position.set(start.pos.x, startY + 4.35 - bannerH / 2, start.pos.z);
  banner.scale.set(start.halfWidth * 1.9, bannerH, 1);
  scene.add(banner);
}

/** Fachada de vidro com caixilhos em volta do andar (retângulo de meia largura hw e meia profundidade hd). */
function facade(stat: THREE.Group, cx: number, cz: number, hw: number, hd: number): void {
  const mullion = new THREE.MeshStandardMaterial({ color: "#242d38", roughness: 0.5, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: "#a0d8ef", transparent: true, opacity: 0.22, roughness: 0.2, metalness: 0.1 });
  const h = 7.5;
  const corners = [
    [cx - hw, cz - hd],
    [cx + hw, cz - hd],
    [cx + hw, cz + hd],
    [cx - hw, cz + hd],
  ];
  corners.forEach(([x1, z1], i) => {
    const [x2, z2] = corners[(i + 1) % 4];
    const len = Math.hypot(x2 - x1, z2 - z1);
    const mx = (x1 + x2) / 2;
    const mz = (z1 + z2) / 2;
    const ry = Math.atan2(x2 - x1, z2 - z1);
    const pane = mesh(new THREE.BoxGeometry(0.1, h, len), glass, mx, h / 2, mz, ry);
    pane.castShadow = false;
    stat.add(pane);
    for (const y of [0.16, h - 0.16]) stat.add(mesh(new THREE.BoxGeometry(0.28, 0.32, len), mullion, mx, y, mz, ry));
    const segs = Math.max(1, Math.floor(len / 4.8));
    for (let s = 0; s <= segs; s++) stat.add(mesh(new THREE.BoxGeometry(0.26, h, 0.26), mullion, x1 + ((x2 - x1) * s) / segs, h / 2, z1 + ((z2 - z1) * s) / segs, ry));
  });
}

/** Prédios estilizados num anel em volta da pista, a partir do raio r. */
function skyline(stat: THREE.Group, cx: number, cz: number, r: number, textures: THREE.Texture[]): void {
  const tower = new THREE.MeshStandardMaterial({ map: skylineTexture(textures), roughness: 0.65, metalness: 0.1 });
  const roof = new THREE.MeshStandardMaterial({ color: "#1f2937", roughness: 0.7 });
  const beacon = new THREE.MeshBasicMaterial({ color: "#ff4757" });
  const count = 38;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const dist = r + (i % 5) * 8 + (i % 3) * 6;
    const x = cx + Math.cos(angle) * dist;
    const z = cz + Math.sin(angle) * dist;
    const w = 14 + (i % 4) * 4;
    const d = 14 + ((i + 2) % 4) * 4;
    const h = 26 + (i % 7) * 9 + ((i * 3) % 5) * 6;
    const rh = 3.5 + (i % 3) * 2;
    const parts = [
      mesh(new THREE.BoxGeometry(w, h, d), tower, x, h / 2 - 8, z, angle),
      mesh(new THREE.BoxGeometry(w * 0.5, rh, d * 0.5), roof, x, h - 8 + rh / 2, z, angle),
      mesh(new THREE.SphereGeometry(0.55, 8, 8), beacon, x, h - 8 + rh + 0.6, z),
    ];
    for (const m of parts) {
      m.castShadow = false;
      m.receiveShadow = false;
      stat.add(m);
    }
  }
}

/** Móveis fora da pista, por ambiente. Só entram onde não encostam em nenhum trecho. */
function decorate(scene: THREE.Group, track: Track, textures: THREE.Texture[]): void {
  if (track.id === "parque" || track.id === "deserto") return;
  const wood = new THREE.MeshStandardMaterial({ color: "#d97736", roughness: 0.55, metalness: 0.05 });
  const white = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.55, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: "#2d3748", roughness: 0.6, metalness: 0.2 });
  const screen = new THREE.MeshStandardMaterial({ color: "#1a202c", emissive: "#3182ce", emissiveIntensity: 0.7 });
  const potWhite = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.35 });
  const potTerracotta = new THREE.MeshStandardMaterial({ color: "#c0392b", roughness: 0.65 });
  const soilMat = new THREE.MeshStandardMaterial({ color: "#2d1810", roughness: 0.95 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: "#6d4c41", roughness: 0.8 });
  const leafDark = new THREE.MeshStandardMaterial({ color: "#2e7d32", roughness: 0.6, flatShading: true });
  const leafMid = new THREE.MeshStandardMaterial({ color: "#43a047", roughness: 0.55, flatShading: true });
  const leafLight = new THREE.MeshStandardMaterial({ color: "#7cb342", roughness: 0.5, flatShading: true });
  const blueTap = new THREE.MeshBasicMaterial({ color: "#00b0ff" });
  const redTap = new THREE.MeshBasicMaterial({ color: "#ff1744" });
  const waterBlue = new THREE.MeshStandardMaterial({ color: "#00b4d8", transparent: true, opacity: 0.65, roughness: 0.12, metalness: 0.08 });
  const archiveBoxMat = new THREE.MeshStandardMaterial({ map: archiveBoxTexture(textures), roughness: 0.85 });
  const led = new THREE.MeshBasicMaterial({ color: "#5cff8a" });
  const sofa = new THREE.MeshStandardMaterial({ color: "#0284c7", roughness: 0.7 });
  const paper = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 });
  const concrete = new THREE.MeshStandardMaterial({ color: "#b7b4ad", roughness: 0.95, flatShading: true });
  const yellow = new THREE.MeshStandardMaterial({ color: "#f2c230", roughness: 0.6 });
  const paint = new THREE.MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: "#2b3a4a", roughness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: "#d6dadf", roughness: 0.35, metalness: 0.3 });
  const red = new THREE.MeshBasicMaterial({ color: "#ff5a3d" });
  const cars = ["#c0392b", "#2e6da4", "#e8e4dc", "#2b2f36", "#7f8c8d", "#d4a017"].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, flatShading: true }));
  let carIdx = 0;
  let plantToggle = 0;

  const free = (p: Vec2, r: number) => {
    const pr = progressOf(track, p);
    return pr.dist > pr.halfWidth + r + 0.6;
  };
  const put = (room: string, p: Vec2, ry: number) => {
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.rotation.y = ry;
    switch (room) {
      case "Ilhas de mesas": {
        g.name = "desk-island";
        g.userData.isDeskIsland = true;
        g.add(mesh(new THREE.BoxGeometry(2.4, 0.08, 1.2), wood, 0, 0.74, 0));
        for (const x of [-1.1, 1.1]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.74, 1.1), dark, x, 0.37, 0));
        for (const x of [-0.6, 0.6]) g.add(mesh(new THREE.BoxGeometry(0.55, 0.36, 0.04), screen, x, 1.0, -0.3));
        g.add(mesh(new THREE.BoxGeometry(0.3, 0.12, 0.22), paper, 0.7, 0.84, 0.2));
        const deskBoxStack = buildArchiveBoxStack(archiveBoxMat, 2);
        deskBoxStack.position.set(-1.3, 0, 0.3);
        g.add(deskBoxStack);
        break;
      }
      case "TI": {
        g.add(mesh(new THREE.BoxGeometry(0.9, 2.1, 1.0), dark, 0, 1.05, 0));
        for (let y = 0; y < 6; y++) g.add(mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), led, 0.3 - (y % 2) * 0.2, 0.4 + y * 0.28, 0.51));
        const tiBoxStack = buildArchiveBoxStack(archiveBoxMat, 3);
        tiBoxStack.position.set(0.85, 0, 0.2);
        g.add(tiBoxStack);
        break;
      }
      case "Copa":
      case "Balcão": {
        g.add(mesh(new THREE.BoxGeometry(2.6, 0.95, 0.8), white, 0, 0.47, 0));
        g.add(mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), dark, 0.7, 1.2, 0));
        // bebedouro de coluna com galão azul 20L
        const cooler = buildWaterCooler(white, waterBlue, dark, blueTap, redTap, steel);
        cooler.position.set(-0.75, 0, 0.65);
        g.add(cooler);
        const copaBoxStack = buildArchiveBoxStack(archiveBoxMat, 2);
        copaBoxStack.position.set(0.85, 0, 0.65);
        g.add(copaBoxStack);
        break;
      }
      case "Sala de reunião": {
        g.add(mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.08, 24), wood, 0, 0.74, 0));
        g.add(mesh(new THREE.CylinderGeometry(0.15, 0.3, 0.74, 10), dark, 0, 0.37, 0));
        const meetFicus = buildFicus(potWhite, soilMat, trunkMat, [leafDark, leafMid, leafLight]);
        meetFicus.position.set(-1.6, 0, 0);
        g.add(meetFicus);
        const meetFern = buildFern(potTerracotta, soilMat, leafDark);
        meetFern.position.set(1.6, 0, 0);
        g.add(meetFern);
        break;
      }
      case "Recepção": {
        g.add(mesh(new THREE.BoxGeometry(2.2, 0.7, 0.9), sofa, 0, 0.35, 0));
        g.add(mesh(new THREE.BoxGeometry(2.2, 0.6, 0.25), sofa, 0, 0.8, -0.35));
        const recepCooler = buildWaterCooler(white, waterBlue, dark, blueTap, redTap, steel);
        recepCooler.position.set(-1.45, 0, 0.2);
        g.add(recepCooler);
        const recepPlant = buildFicus(potWhite, soilMat, trunkMat, [leafDark, leafMid, leafLight]);
        recepPlant.position.set(1.45, 0, 0.2);
        g.add(recepPlant);
        break;
      }
      // estacionamento: carros nas vagas (com a faixa branca), pilares, cones e a guarita da cancela
      case "Vagas":
      case "Vagas do fundo": {
        const body = cars[carIdx++ % cars.length];
        g.add(mesh(new THREE.BoxGeometry(1.8, 0.7, 4.0), body, 0, 0.55, 0));
        g.add(mesh(new THREE.BoxGeometry(1.6, 0.6, 2.0), glass, 0, 1.15, -0.2));
        for (const [x, z] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) g.add(mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.25, 10), dark, x, 0.33, z, 0).rotateZ(Math.PI / 2));
        for (const x of [-1.35, 1.35]) g.add(mesh(new THREE.BoxGeometry(0.12, 0.02, 4.8), paint, x, 0.03, 0));
        break;
      }
      case "Pilares":
        g.add(mesh(new THREE.BoxGeometry(0.9, 3.2, 0.9), concrete, 0, 1.6, 0));
        for (const y of [0.25, 0.75]) g.add(mesh(new THREE.BoxGeometry(0.94, 0.25, 0.94), y === 0.25 ? yellow : dark, 0, y, 0));
        break;
      case "Rampa":
        for (const x of [-0.8, 0, 0.8]) {
          g.add(mesh(new THREE.ConeGeometry(0.25, 0.7, 10), red, x, 0.35, 0));
          g.add(mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.1, 10), paint, x, 0.4, 0));
        }
        break;
      case "Cancela":
        g.add(mesh(new THREE.BoxGeometry(1.6, 2.3, 1.6), paint, 0, 1.15, 0));
        g.add(mesh(new THREE.BoxGeometry(1.64, 0.7, 1.64), glass, 0, 1.5, 0));
        g.add(mesh(new THREE.BoxGeometry(1.9, 0.12, 1.9), yellow, 0, 2.35, 0));
        break;
      // copa: mesinhas com banquetas, geladeira e máquina de café
      case "Mesas":
        g.add(mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 16), white, 0, 0.75, 0));
        g.add(mesh(new THREE.CylinderGeometry(0.06, 0.25, 0.75, 8), steel, 0, 0.37, 0));
        for (const x of [-1, 1]) {
          g.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 12), wood, x, 0.48, 0));
          g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.46, 6), steel, x, 0.23, 0));
        }
        break;
      case "Geladeira":
        g.add(mesh(new THREE.BoxGeometry(0.9, 1.9, 0.75), steel, 0, 0.95, 0));
        g.add(mesh(new THREE.BoxGeometry(0.92, 0.03, 0.77), dark, 0, 1.3, 0));
        g.add(mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), dark, 0.35, 1.55, 0.4));
        g.add(mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), dark, 0.35, 0.9, 0.4));
        break;
      case "Cafeteira":
        g.add(mesh(new THREE.BoxGeometry(1.6, 0.95, 0.7), wood, 0, 0.47, 0));
        g.add(mesh(new THREE.BoxGeometry(0.55, 0.7, 0.45), dark, -0.3, 1.3, 0));
        g.add(mesh(new THREE.BoxGeometry(0.1, 0.06, 0.02), red, -0.3, 1.5, 0.23));
        g.add(mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.12, 10), white, 0.4, 1.01, 0.1));
        break;
      default:
        if (plantToggle++ % 2 === 0) {
          g.add(buildFicus(potWhite, soilMat, trunkMat, [leafDark, leafMid, leafLight]));
        } else {
          g.add(buildFern(potTerracotta, soilMat, leafDark));
        }
        break;
    }
    scene.add(g);
  };

  // estacionamento enche mais as laterais; a copa é apertada e já tem bastante coisa perto
  const every = track.id === "estacionamento" ? 8 : track.id === "copa" ? 7 : 11;
  for (let s = 6; s < track.length; s += every) {
    const at = pointAt(track, s);
    const room = roomAt(track, s);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    for (const side of [-1, 1]) {
      const off = at.halfWidth + 2.6;
      const p = { x: at.pos.x + nrm.x * off * side, z: at.pos.z + nrm.z * off * side };
      if (free(p, 1.6)) put(room, p, at.heading);
    }
  }
  // beira dos atalhos: mesas baixas no escritório, prateleiras na despensa, cones na garagem
  for (const br of track.branches) {
    for (let k = 1; k < br.points.length - 1; k += 2) {
      const a = br.points[k - 1];
      const b = br.points[k + 1];
      const h = Math.atan2(b.x - a.x, b.z - a.z);
      const nrm = sideNormal(Math.sin(h), Math.cos(h));
      for (const side of [-1, 1]) {
        const off = br.widths[k] / 2 + 1;
        const p = { x: br.points[k].x + nrm.x * off * side, z: br.points[k].z + nrm.z * off * side };
        if (!free(p, 0.6)) continue;
        const g = new THREE.Group();
        g.position.set(p.x, 0, p.z);
        g.rotation.y = h;
        if (track.id === "copa") {
          g.add(mesh(new THREE.BoxGeometry(0.4, 1.6, 1.4), wood, 0, 0.8, 0));
          for (const y of [0.5, 1.0, 1.45]) g.add(mesh(new THREE.BoxGeometry(0.3, 0.18, 0.3), cars[(k + Math.round(y * 2)) % cars.length], 0.05, y + 0.12, 0.3 - y * 0.3));
        } else if (track.id === "estacionamento") {
          g.add(mesh(new THREE.ConeGeometry(0.25, 0.7, 8), cars[0], 0, 0.35, 0));
          g.add(mesh(new THREE.BoxGeometry(0.2, 0.08, 0.5), paint, 0, 0.45, 0));
        } else {
          g.add(mesh(new THREE.BoxGeometry(1.2, 0.06, 0.8), wood, 0, 0.45, 0));
          for (const x of [-0.5, 0.5]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.45, 0.7), dark, x, 0.22, 0));
          const branchBoxStack = buildArchiveBoxStack(archiveBoxMat, k % 2 === 0 ? 2 : 3);
          branchBoxStack.position.set(0.65, 0, 0);
          g.add(branchBoxStack);
        }
        scene.add(g);
      }
    }
  }
  // mesa de reunião grande no miolo da curva larga (só no Circuito Corporativo)
  if (track.id !== "corporativo") return;
  const meet = pointAt(track, track.ctrlS[14]);
  const nrm = sideNormal(Math.sin(meet.heading), Math.cos(meet.heading));
  const c = track.carpet[2];
  const p = { x: meet.pos.x + nrm.x * (meet.halfWidth + 5) * c.side, z: meet.pos.z + nrm.z * (meet.halfWidth + 5) * c.side };
  if (free(p, 2)) put("Sala de reunião", p, 0);
}
