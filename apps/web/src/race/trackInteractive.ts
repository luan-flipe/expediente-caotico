import * as THREE from "three";
import { heightAt, pointAt, progressOf, sideNormal, type Track, type Vec2 } from "@ec/shared";

/**
 * Módulo de Cenário Interativo e Obstáculos de Pista no estilo Nintendo (Super Mario Odyssey / Galaxy / Mario Kart 8).
 *
 * Funcionalidades:
 * 1. O FAMOSO "CAFÉ COADO NA CALCINHA" (DONA NEIDE 2.0 - VISUAL CHUNKY & TÁTIL PBR):
 *    - Posicionado na lateral da pista logo após a linha de largada / arco inicial (S ≈ 18m).
 *    - Mesinha de copa de fórmica vintage com cantos arredondados (bevels/fillet) e pernas curvas elegantes cromadas.
 *    - Garrafa térmica retrô bojuda vermelha esmaltada, tampa cromada brilhante, bico curvado e manômetro analógico redondo com ponteiro "FERVENDO",
 *      além do clássico bilhete amarelo com fita crepe: "Café da Dona Neide - NÃO MEXER! (ou levará bronca)".
 *    - Suporte de arame com coador de calcinha anatômico com curvas suaves, babadinhos 3D ao redor das pernas, textura nítida de renda com poás rosa,
 *      e laço tridimensional fofinho na frente em cetim vermelho.
 *    - Fio contínuo de café cartoon escorrendo pelo fundo até a Caneca da Vovó em cerâmica/esmalte lascada com café ondulante
 *      e nuvenzinhas de vapor cartoon volumétricas estilo metaball/esferas conectadas flutuando suavemente.
 *    - Reatividade: Karts a >10 m/s fazem a calcinha balançar intensamente no vórtex de ar.
 *    - Ao raspar / passar muito perto (<2.2m), a calcinha dá uma estilingada elástica (BOING!) com squash & stretch vigoroso,
 *      soltando um jato de café que concede um mini boost turbo com aroma dourado de cafeína para o piloto e espirra gotículas no chão!
 *
 * 2. ASPIRADOR ROBÔ ("ROOMBA DA FIRMA" COM EXPRESSÕES LED MATRIX):
 *    - Aspirador autônomo gordinho com display digital frontal em matriz de pontos LED animada:
 *      * (^‿^) Sorriso fofo durante a patrulha normal.
 *      * (>_<) Olhos de dor/rodopio quando atropelado ou ao dar bumper no kart.
 *      * (O_O) Olhos arregalados e espantados ao ser raspado velozmente por um kart.
 *    - Cone de trânsito amassadinho no topo em laranja fluorescente com faixas reflexivas vivas.
 *    - Duas vassourinhas giratórias dianteiras com cerdas individuais visíveis.
 *    - Patrulha corredores largos em movimento de vai-e-vem com rotação suave ao inverter rota.
 *    - Colisão cartoon tipo pinball: ao bater de frente, a cadeira quica/gira com impulso de ricochete, e o Roomba
 *      squasha indignado, pisca alerta vermelho furioso e inverte imediatamente a rota!
 *
 * 3. PORTAS AUTOMÁTICAS DE VIDRO:
 *    - Portas de correr corporativas com batentes estruturais e faixas de segurança jateadas/zebradas corporativas.
 *    - Ciclo periódico de abertura/fechamento com LEDs indicadores verde (aberto) e vermelho (fechando/fechado).
 *    - Bloqueio físico: quando fechadas, karts colidem com impacto elástico de vidro e shudder de vibração.
 *
 * 4. GRELHAS DE VENTILAÇÃO NO CHÃO (AIR CUSHION BOOST VENTS):
 *    - Grelhas de metal no chão com aletas industriais emitindo coluna de ar translúcida e partículas azuis cintilantes.
 *    - Quando o kart passa sobre a grelha, ganha sustentação (almofada de ar / hovercraft lift) e leve aceleração turbo.
 *
 * 5. Papéis e Post-its Voando das Mesas com Deslocamento de Ar (via InstancedMesh).
 * 6. Caixas de Itens Galaxy com rotação giroscópica, halo pulsante e respiração cósmica.
 * 7. Xícaras de Café com ondas de aroma e vapor cartoon via InstancedMesh.
 *
 * Critérios Técnicos:
 * - Zero alocações de memória no loop update(dt, karts) -> 60 FPS estáveis garantidos.
 * - Objetos matemáticos e buffers pré-alocados em escopo de módulo / classe.
 */

export interface KartInteractiveInfo {
  pos: { x: number; z: number };
  speed: number;
  id?: string;
  isLocalPlayer?: boolean;
  heading?: number;
  y?: number;
}

export interface KartInteractionOutput {
  boost: boolean;
  boostSpeed?: number;
  boostDuration?: number;
  aromaBoost?: boolean;
  airCushionLift?: number;
  bonk: boolean;
  bonkImpulse?: { x: number; z: number };
  spin?: boolean;
  spinUntil?: number;
  slip?: boolean;
  slipUntil?: number;
  speedMultiplier?: number;
  shake?: number;
  soundCue?: "coffee_slingshot" | "roomba_honk" | "door_bonk" | "vent_woosh" | "sand_tornado" | "vulture_startle" | "cactus_bonk" | "mud_splash";
}

export interface DeskIsland {
  x: number;
  z: number;
  heading: number;
  width?: number;
  depth?: number;
}

export interface ManagedItemBox {
  id: number;
  baseY: number;
  phase: number;
  yaw: number;
  mesh: THREE.Object3D;
  innerBox?: THREE.Object3D;
  halo?: THREE.Mesh;
  haloMat?: THREE.MeshBasicMaterial;
}

export interface ManagedCup {
  id: number;
  baseY: number;
  phase: number;
  group: THREE.Object3D;
  aromaMesh?: THREE.Mesh;
  aromaMat?: THREE.MeshBasicMaterial;
}

export interface CoffeeCalcinhaObstacle {
  id: number;
  pos: { x: number; y: number; z: number };
  heading: number;
  group: THREE.Group;
  calcinhaPivot: THREE.Group;
  calcinhaMesh: THREE.Mesh;
  streamMesh: THREE.Mesh;
  thermosMesh: THREE.Group;
  mugGroup: THREE.Group;
  mugLiquidMesh?: THREE.Mesh;
  mugSteamCluster?: THREE.Group;
  bowMesh: THREE.Group;
  manometerMesh?: THREE.Mesh;
  swingAngle: number;
  swingVelocity: number;
  elasticStretch: number;
  elasticVelocity: number;
  boostCooldown: number;
  dropletTimer: number;
  splashActive: boolean;
}

export interface RoombaObstacle {
  id: number;
  pos: { x: number; y: number; z: number };
  heading: number;
  group: THREE.Group;
  ledMesh: THREE.Mesh;
  ledMat: THREE.MeshBasicMaterial;
  coneGroup: THREE.Group;
  brushL: THREE.Object3D;
  brushR: THREE.Object3D;
  patrolStart: { x: number; z: number };
  patrolEnd: { x: number; z: number };
  patrolT: number;
  patrolDir: 1 | -1;
  patrolSpeed: number;
  state: "patrol" | "turning" | "bonked";
  emotion: "happy" | "bonked" | "surprised";
  surprisedTimer: number;
  bonkTimer: number;
  squashFactor: number;
  radius: number;
}

export interface AutomaticDoorObstacle {
  id: number;
  pos: { x: number; y: number; z: number };
  heading: number;
  group: THREE.Group;
  leftDoor: THREE.Mesh;
  rightDoor: THREE.Mesh;
  sensorLed: THREE.Mesh;
  sensorLedMat: THREE.MeshBasicMaterial;
  width: number;
  halfWidth: number;
  slideDistance: number;
  currentOpen: number; // 0 = fechado, 1 = aberto
  state: "open" | "closing" | "closed" | "opening";
  stateTimer: number;
  shudder: number;
  durations: { open: number; closing: number; closed: number; opening: number };
}

export interface AirVentObstacle {
  id: number;
  pos: { x: number; y: number; z: number };
  heading: number;
  width: number;
  length: number;
  group: THREE.Group;
  streamMesh: THREE.Mesh;
  streamMat: THREE.MeshBasicMaterial;
  boostStrength: number;
  liftHeight: number;
  particleOffset: number;
  particleCount: number;
}

export interface DustDevilObstacle {
  id: number;
  s: number;
  basePos: { x: number; y: number; z: number };
  currentPos: { x: number; y: number; z: number };
  normal: { x: number; z: number };
  halfWidth: number;
  patrolSpeed: number;
  patrolPhase: number;
  group: THREE.Group;
  layers: THREE.Mesh[];
  radius: number;
  hitCooldown: number;
}

export interface VultureObstacle {
  id: number;
  flockId: number;
  group: THREE.Group;
  leftWing: THREE.Group;
  rightWing: THREE.Group;
  pos: { x: number; y: number; z: number };
  heading: number;
  orbitRadius: number;
  orbitPhase: number;
  state: "thermal" | "cross" | "startle";
  stateTimer: number;
  diveDuration: number;
  diveStartPos: THREE.Vector3;
  diveCrossPos: THREE.Vector3;
  diveEndPos: THREE.Vector3;
}

export interface VultureFlock {
  id: number;
  center: { x: number; y: number; z: number };
  trackS: number;
  crossingPoint: { x: number; y: number; z: number };
  orbitSpeed: number;
  diveCooldown: number;
  leadIdx: number;
  vultures: VultureObstacle[];
}

export interface CactusObstacle {
  id: number;
  s?: number;
  pos: { x: number; y: number; z: number };
  heading: number;
  group: THREE.Group;
  trunkMesh: THREE.Mesh;
  arms: THREE.Mesh[];
  radius: number;
  isBroken: boolean;
  breakTimer: number;
  wobbleTimer: number;
  wobbleAngle: number;
}

export interface MudPitArea {
  id: number;
  sFrom: number;
  sTo: number;
  minY: number;
  maxY: number;
  center: { x: number; y: number; z: number };
  radius: number;
  splashCooldown: number;
}

export interface TrackInteractiveOptions {
  track?: Track;
  deskPositions?: { x: number; z: number; heading?: number }[];
  paperPerDesk?: number;
  postitPerDesk?: number;
  maxSteamPuffsPerCup?: number;
  enableCoffeeCalcinha?: boolean;
  coffeeCalcinhaPosition?: { x: number; y?: number; z: number; heading?: number };
  enableRoombas?: boolean;
  roombaPositions?: { start: { x: number; z: number }; end: { x: number; z: number }; speed?: number }[];
  enableAutomaticDoors?: boolean;
  doorPositions?: { x: number; z: number; heading: number; width?: number }[];
  enableAirVents?: boolean;
  airVentPositions?: { x: number; z: number; heading: number; width?: number; length?: number }[];
  enableDustDevils?: boolean;
  dustDevilPositions?: { s?: number; x?: number; y?: number; z?: number; heading?: number; halfWidth?: number; speed?: number; phase?: number }[];
  enableVultures?: boolean;
  vultureFlocks?: { x?: number; y?: number; z?: number; radius?: number; count?: number; trackS?: number }[];
  enableCacti?: boolean;
  cactusPositions?: { s?: number; x?: number; y?: number; z?: number; heading?: number; radius?: number }[];
  enableMudPit?: boolean;
}

// ============================================================================
// OBJETOS REUTILIZÁVEIS DE ESCOPO DE MÓDULO (ZERO GC NO LOOP DE RENDERIZAÇÃO)
// ============================================================================
const _vecA = new THREE.Vector3();
const _scaleVec = new THREE.Vector3(1, 1, 1);
const _quatA = new THREE.Quaternion();
const _eulerA = new THREE.Euler(0, 0, 0, "YXZ");
const _mat4A = new THREE.Matrix4();
const _colorA = new THREE.Color();

// Cores vivas estilo Nintendo (Super Mario Odyssey / Galaxy / Mario Kart 8)
const COLOR_PAPER_WHITE = new THREE.Color("#f8fafc");
const COLOR_POSTIT_YELLOW = new THREE.Color("#ffe600");
const COLOR_POSTIT_PINK = new THREE.Color("#ff2a85");
const COLOR_POSTIT_CYAN = new THREE.Color("#00e5ff");
const COLOR_STEAM_WHITE = new THREE.Color("#ffffff");
const COLOR_COFFEE_BROWN = new THREE.Color("#2c1609");
const COLOR_VENT_CYAN = new THREE.Color("#38bdf8");

const POSTIT_COLORS = [COLOR_POSTIT_YELLOW, COLOR_POSTIT_PINK, COLOR_POSTIT_CYAN];

// Posições padrão para o Circuito Corporativo (chicane das ilhas de mesas)
const DEFAULT_CORPORATIVO_DESKS: DeskIsland[] = [
  { x: 44.5, z: -11.0, heading: -0.1 },
  { x: 49.5, z: -5.0, heading: 0.15 },
  { x: 45.2, z: 2.0, heading: -0.2 },
  { x: 50.8, z: 9.0, heading: 0.25 },
  { x: 46.0, z: 16.0, heading: -0.1 },
];

function roomAtTrack(track: Track, s: number): string {
  const L = track.length;
  const ss = ((s % L) + L) % L;
  let name = track.rooms[0]?.name ?? "Ilhas de mesas";
  for (const r of track.rooms) if (ss >= track.ctrlS[r.ctrl]) name = r.name;
  return name;
}

function freeDesk(track: Track, p: Vec2, r: number): boolean {
  const pr = progressOf(track, p);
  return pr.dist > pr.halfWidth + r + 0.6;
}

/** Extrai as posições das ilhas de mesas diretamente da definição da pista */
export function extractDesksFromTrack(track: Track): DeskIsland[] {
  const desks: DeskIsland[] = [];
  const every = track.id === "estacionamento" ? 8 : track.id === "copa" ? 7 : 11;
  for (let s = 6; s < track.length; s += every) {
    const room = roomAtTrack(track, s);
    if (room === "Ilhas de mesas") {
      const at = pointAt(track, s);
      const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
      for (const side of [-1, 1]) {
        const off = at.halfWidth + 2.6;
        const p: Vec2 = { x: at.pos.x + nrm.x * off * side, z: at.pos.z + nrm.z * off * side };
        if (freeDesk(track, p, 1.6)) {
          desks.push({ x: p.x, z: p.z, heading: at.heading });
        }
      }
    }
  }
  return desks;
}

/** Cria textura estilizada de interrogação cósmica para a caixa de item Galaxy */
function createGalaxyBoxTexture(): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([255, 190, 59, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, "#ffbe3b");
  grad.addColorStop(0.5, "#f39c12");
  grad.addColorStop(1, "#d35400");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  ctx.lineWidth = 10;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeRect(6, 6, 116, 116);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#f1c40f";
  ctx.strokeRect(12, 12, 104, 104);

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 52px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 8;
  ctx.fillText("?", 64, 62);

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

/** Textura do bilhete amarelo preso por fita: "Café da Dona Neide - NÃO MEXER" */
function createDonaNeideTexture(): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([255, 235, 59, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  // Papel amarelo post-it
  ctx.fillStyle = "#ffe033";
  ctx.fillRect(16, 24, 224, 216);

  // Fita adesiva translúcida no topo
  ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
  ctx.fillRect(72, 12, 112, 32);

  // Texto manuscrito corporativo marcante
  ctx.fillStyle = "#1e1e24";
  ctx.font = "bold 26px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("☕ CAFÉ DA", 128, 75);

  ctx.fillStyle = "#b91c1c";
  ctx.font = "900 28px sans-serif";
  ctx.fillText("DONA NEIDE", 128, 115);

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText("NÃO MEXER!", 128, 160);

  // Faixa de alerta / aviso
  ctx.fillStyle = "#dc2626";
  ctx.fillRect(36, 180, 184, 4);

  ctx.font = "italic bold 16px sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText("(ou levará bronca)", 128, 210);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Textura de mostrador/manômetro analógico com ponteiro vermelho apontando na zona fervendo */
function createManometerTexture(): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([255, 50, 50, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  // Aro metálico chanfrado
  ctx.fillStyle = "#cbd5e1";
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fill();

  // Fundo bege clássico de instrumento retrô
  ctx.fillStyle = "#fffbeb";
  ctx.beginPath();
  ctx.arc(64, 64, 48, 0, Math.PI * 2);
  ctx.fill();

  // Arco térmico: verde -> amarelo -> vermelho fervendo
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#22c55e";
  ctx.beginPath();
  ctx.arc(64, 64, 38, Math.PI * 0.75, Math.PI * 1.15);
  ctx.stroke();

  ctx.strokeStyle = "#eab308";
  ctx.beginPath();
  ctx.arc(64, 64, 38, Math.PI * 1.15, Math.PI * 1.6);
  ctx.stroke();

  ctx.strokeStyle = "#ef4444";
  ctx.beginPath();
  ctx.arc(64, 64, 38, Math.PI * 1.6, Math.PI * 2.25);
  ctx.stroke();

  // Texto
  ctx.fillStyle = "#334155";
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("FERVENDO", 64, 84);
  ctx.fillText("°C", 64, 98);

  // Ponteiro apontando no vermelho fervendo
  ctx.strokeStyle = "#dc2626";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(64, 64);
  ctx.lineTo(88, 42);
  ctx.stroke();

  // Rebite central de latão
  ctx.fillStyle = "#b45309";
  ctx.beginPath();
  ctx.arc(64, 64, 5, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Textura sutil de fórmica vintage com granulação orgânica e borda chanfrada */
function createFormicaTableTexture(): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([248, 250, 252, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#f8f9fa";
  ctx.fillRect(0, 0, 256, 256);

  // Granulação sutil linho / fórmica
  ctx.fillStyle = "rgba(148, 163, 184, 0.16)";
  for (let y = 0; y < 256; y += 4) {
    for (let x = (y % 8 === 0 ? 0 : 2); x < 256; x += 4) {
      ctx.fillRect(x, y, 1.8, 1.8);
    }
  }

  ctx.strokeStyle = "rgba(100, 116, 139, 0.25)";
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 248);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Textura de caneca de cerâmica/esmalte com lasquinhas na borda */
function createEnamelMugTexture(): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([56, 189, 248, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  // Esmalte azul celeste vintage
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(0, 0, 128, 128);

  // Borda esmaltada lascada vintage no topo
  ctx.fillStyle = "#0369a1";
  ctx.fillRect(0, 0, 128, 10);

  // Lascas pretas de ferrugem / esmalte descascado
  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.arc(32, 6, 6, 0, Math.PI * 2);
  ctx.arc(76, 5, 5, 0, Math.PI * 2);
  ctx.arc(104, 7, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#78350f";
  ctx.beginPath();
  ctx.arc(32, 6, 3, 0, Math.PI * 2);
  ctx.arc(104, 7, 3.5, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Textura estilizada de bolinhas e renda nítida para a calcinha coadora */
function createCalcinhaTexture(): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([255, 117, 143, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  // Fundo rosa suave retrô
  ctx.fillStyle = "#ff758f";
  ctx.fillRect(0, 0, 128, 128);

  // Bolinhas brancas delicadas (polka dots)
  ctx.fillStyle = "#ffffff";
  const step = 24;
  for (let y = 12; y < 128; y += step) {
    const offsetX = (Math.floor(y / step) % 2) * (step / 2);
    for (let x = 12; x < 128; x += step) {
      ctx.beginPath();
      ctx.arc(x + offsetX, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Babado rendado no topo
  ctx.fillStyle = "#fff0f3";
  ctx.fillRect(0, 0, 128, 10);
  for (let x = 6; x < 128; x += 12) {
    ctx.beginPath();
    ctx.arc(x, 10, 6, 0, Math.PI);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Cria display digital frontal em matriz de pontos LED simulada com emoções cartoon */
function createRoombaFaceTexture(emotion: "happy" | "bonked" | "surprised"): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([0, 240, 255, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#080a10";
  ctx.fillRect(0, 0, 256, 64);

  // Matriz de pontos LED apagados de fundo
  ctx.fillStyle = "rgba(30, 41, 59, 0.4)";
  for (let x = 6; x < 256; x += 10) {
    for (let y = 6; y < 64; y += 10) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (emotion === "happy") {
    // (^‿^) - Sorriso fofo durante a patrulha em Ciano Neon
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#38bdf8";
    ctx.font = "900 34px sans-serif";
    ctx.fillText("( ^ ‿ ^ )", 128, 32);
  } else if (emotion === "bonked") {
    // (>_<) - Olhos de dor/rodopio quando atropelado em Vermelho Alerta
    ctx.shadowColor = "#ef4444";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#f87171";
    ctx.font = "900 34px sans-serif";
    ctx.fillText("( > _ < )", 128, 32);
  } else {
    // (O_O) - Olhos arregalados e espantados ao ser raspado velozmente em Amarelo/Ouro
    ctx.shadowColor = "#fbbf24";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#fde047";
    ctx.font = "900 34px sans-serif";
    ctx.fillText("( O _ O )", 128, 32);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Textura de faixas de segurança corporativas jateadas das portas de vidro */
function createDoorStripesTexture(): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([255, 200, 0, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, 256, 64);

  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.fillRect(0, 12, 256, 40);

  for (let x = -32; x < 288; x += 32) {
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.moveTo(x, 52);
    ctx.lineTo(x + 16, 52);
    ctx.lineTo(x + 32, 12);
    ctx.lineTo(x + 16, 12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.moveTo(x + 16, 52);
    ctx.lineTo(x + 32, 52);
    ctx.lineTo(x + 48, 12);
    ctx.lineTo(x + 32, 12);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Textura para topo do Roomba da firma com botão Clean e aro corporativo */
function createRoombaTopTexture(): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([30, 41, 59, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#1e2430";
  ctx.fillRect(0, 0, 256, 256);

  ctx.lineWidth = 14;
  ctx.strokeStyle = "#475569";
  ctx.beginPath();
  ctx.arc(128, 128, 110, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.arc(128, 128, 54, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 6;
  ctx.strokeStyle = "#10b981";
  ctx.beginPath();
  ctx.arc(128, 128, 44, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CLEAN", 128, 128);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText("ROOMBA DA FIRMA #01", 128, 205);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Textura da grelha de ventilação metálica no piso */
function createVentGrateTexture(): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([51, 65, 85, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = "#090d16";
  for (let y = 8; y < 128; y += 16) {
    ctx.fillRect(8, y, 112, 8);
  }

  ctx.fillStyle = "#475569";
  for (let y = 6; y < 128; y += 16) {
    ctx.fillRect(8, y, 112, 2);
  }

  ctx.lineWidth = 6;
  ctx.strokeStyle = "#64748b";
  ctx.strokeRect(3, 3, 122, 122);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class TrackInteractiveManager {
  private scene: THREE.Scene | null = null;
  private track: Track | null = null;
  private clock = 0;

  // Mesas e partículas de papéis
  private desks: DeskIsland[] = [];
  private paperPerDesk: number;
  private postitPerDesk: number;

  private totalPapers = 0;
  private totalPostits = 0;

  private paperMesh: THREE.InstancedMesh | null = null;
  private postitMesh: THREE.InstancedMesh | null = null;

  // Buffers planos SoA para papéis
  private paperPosX = new Float32Array(0);
  private paperPosY = new Float32Array(0);
  private paperPosZ = new Float32Array(0);
  private paperVelX = new Float32Array(0);
  private paperVelY = new Float32Array(0);
  private paperVelZ = new Float32Array(0);
  private paperRotX = new Float32Array(0);
  private paperRotY = new Float32Array(0);
  private paperRotZ = new Float32Array(0);
  private paperAngX = new Float32Array(0);
  private paperAngY = new Float32Array(0);
  private paperAngZ = new Float32Array(0);
  private paperRestX = new Float32Array(0);
  private paperRestY = new Float32Array(0);
  private paperRestZ = new Float32Array(0);
  private paperRestRotY = new Float32Array(0);
  private paperState = new Uint8Array(0);
  private paperAge = new Float32Array(0);
  private paperFlutterFreq = new Float32Array(0);
  private paperDeskIdx = new Uint16Array(0);

  // Buffers planos SoA para post-its
  private postitPosX = new Float32Array(0);
  private postitPosY = new Float32Array(0);
  private postitPosZ = new Float32Array(0);
  private postitVelX = new Float32Array(0);
  private postitVelY = new Float32Array(0);
  private postitVelZ = new Float32Array(0);
  private postitRotX = new Float32Array(0);
  private postitRotY = new Float32Array(0);
  private postitRotZ = new Float32Array(0);
  private postitAngX = new Float32Array(0);
  private postitAngY = new Float32Array(0);
  private postitAngZ = new Float32Array(0);
  private postitRestX = new Float32Array(0);
  private postitRestY = new Float32Array(0);
  private postitRestZ = new Float32Array(0);
  private postitRestRotY = new Float32Array(0);
  private postitState = new Uint8Array(0);
  private postitAge = new Float32Array(0);
  private postitFlutterFreq = new Float32Array(0);
  private postitDeskIdx = new Uint16Array(0);

  // Caixas de item e xícaras de café
  private managedBoxes = new Map<number, ManagedItemBox>();
  private nextBoxId = 1;
  private managedCups = new Map<number, ManagedCup>();
  private nextCupId = 1;

  // Nuvenzinhas de vapor cartoon das xícaras de café
  private maxPuffsPerCup: number;
  private totalSteamPuffs = 0;
  private steamMesh: THREE.InstancedMesh | null = null;
  private steamAge = new Float32Array(0);
  private steamLife = new Float32Array(0);
  private steamCupIdx = new Uint16Array(0);
  private steamSpiralAngle = new Float32Array(0);
  private steamSpeed = new Float32Array(0);

  // ==========================================================================
  // NOVOS OBSTÁCULOS E CENÁRIOS INTERATIVOS
  // ==========================================================================
  private _coffeeCalcinhas: CoffeeCalcinhaObstacle[] = [];
  private _roombas: RoombaObstacle[] = [];
  private _automaticDoors: AutomaticDoorObstacle[] = [];
  private _airVents: AirVentObstacle[] = [];
  private _dustDevils: DustDevilObstacle[] = [];
  private _vultureFlocks: VultureFlock[] = [];
  private _vultures: VultureObstacle[] = [];
  private _cacti: CactusObstacle[] = [];
  private _mudPits: MudPitArea[] = [];

  // Partículas de dispersão de areia dos redemoinhos
  private MAX_DUST_DEVIL_BURSTS = 64;
  private dustBurstMesh: THREE.InstancedMesh | null = null;
  private dustBurstPosX = new Float32Array(0);
  private dustBurstPosY = new Float32Array(0);
  private dustBurstPosZ = new Float32Array(0);
  private dustBurstVelX = new Float32Array(0);
  private dustBurstVelY = new Float32Array(0);
  private dustBurstVelZ = new Float32Array(0);
  private dustBurstAge = new Float32Array(0);
  private dustBurstLife = new Float32Array(0);
  private dustBurstIdx = 0;

  // Partículas de penas e poeira do urubu
  private MAX_FEATHER_PARTICLES = 32;
  private featherMesh: THREE.InstancedMesh | null = null;
  private featherPosX = new Float32Array(0);
  private featherPosY = new Float32Array(0);
  private featherPosZ = new Float32Array(0);
  private featherVelX = new Float32Array(0);
  private featherVelY = new Float32Array(0);
  private featherVelZ = new Float32Array(0);
  private featherRotX = new Float32Array(0);
  private featherRotY = new Float32Array(0);
  private featherRotZ = new Float32Array(0);
  private featherAge = new Float32Array(0);
  private featherLife = new Float32Array(0);
  private featherIdx = 0;

  // Partículas de pedaços e espinhos de cacto
  private MAX_CACTUS_PARTICLES = 64;
  private cactusParticleMesh: THREE.InstancedMesh | null = null;
  private cactusPosX = new Float32Array(0);
  private cactusPosY = new Float32Array(0);
  private cactusPosZ = new Float32Array(0);
  private cactusVelX = new Float32Array(0);
  private cactusVelY = new Float32Array(0);
  private cactusVelZ = new Float32Array(0);
  private cactusRotX = new Float32Array(0);
  private cactusRotY = new Float32Array(0);
  private cactusRotZ = new Float32Array(0);
  private cactusAge = new Float32Array(0);
  private cactusLife = new Float32Array(0);
  private cactusIdx = 0;

  // Partículas de lama borbulhante e respingos do cânion
  private MAX_MUD_PARTICLES = 64;
  private mudSplashMesh: THREE.InstancedMesh | null = null;
  private mudPosX = new Float32Array(0);
  private mudPosY = new Float32Array(0);
  private mudPosZ = new Float32Array(0);
  private mudVelX = new Float32Array(0);
  private mudVelY = new Float32Array(0);
  private mudVelZ = new Float32Array(0);
  private mudScale = new Float32Array(0);
  private mudAge = new Float32Array(0);
  private mudLife = new Float32Array(0);
  private mudIdx = 0;

  // Partículas de gotículas e jato de café (Café coado na calcinha)
  private MAX_SPLASH_DROPS = 32;
  private splashMesh: THREE.InstancedMesh | null = null;
  private splashPosX = new Float32Array(0);
  private splashPosY = new Float32Array(0);
  private splashPosZ = new Float32Array(0);
  private splashVelX = new Float32Array(0);
  private splashVelY = new Float32Array(0);
  private splashVelZ = new Float32Array(0);
  private splashAge = new Float32Array(0);
  private splashLife = new Float32Array(0);

  // Partículas azuis de fluxo ascendente das grelhas de ventilação
  private MAX_VENT_PARTICLES = 64;
  private ventParticleMesh: THREE.InstancedMesh | null = null;
  private ventParticlePosX = new Float32Array(0);
  private ventParticlePosY = new Float32Array(0);
  private ventParticlePosZ = new Float32Array(0);
  private ventParticleVelY = new Float32Array(0);
  private ventParticleAge = new Float32Array(0);
  private ventParticleLife = new Float32Array(0);
  private ventParticleVentIdx = new Uint16Array(0);

  // Array pré-alocado para os resultados de interação dos karts por quadro (Zero GC)
  private kartOutputs: KartInteractionOutput[] = [];

  // Texturas procedurais compartilhadas
  private galaxyBoxTexture: THREE.Texture | null = null;
  private donaNeideTexture: THREE.Texture | null = null;
  private manometerTexture: THREE.Texture | null = null;
  private formicaTableTexture: THREE.Texture | null = null;
  private enamelMugTexture: THREE.Texture | null = null;
  private calcinhaTexture: THREE.Texture | null = null;
  private doorStripesTexture: THREE.Texture | null = null;
  private roombaTopTexture: THREE.Texture | null = null;
  private roombaFaces: {
    happy: THREE.Texture;
    bonked: THREE.Texture;
    surprised: THREE.Texture;
  } | null = null;
  private ventGrateTexture: THREE.Texture | null = null;

  // Recursos para descarte
  private disposables: { dispose: () => void }[] = [];

  constructor(options?: TrackInteractiveOptions) {
    this.track = options?.track ?? null;
    this.paperPerDesk = options?.paperPerDesk ?? 10;
    this.postitPerDesk = options?.postitPerDesk ?? 18;
    this.maxPuffsPerCup = options?.maxSteamPuffsPerCup ?? 12;

    if (options?.deskPositions && options.deskPositions.length > 0) {
      this.desks = options.deskPositions.map((d) => ({
        x: d.x,
        z: d.z,
        heading: d.heading ?? 0,
      }));
    }
  }

  /**
   * Inicializa o gerenciador na cena.
   * Descobre mesas, configura InstancedMeshes para papéis, vapor, café e grelhas,
   * e posiciona o Café Coado na Calcinha, Roombas, Portas e Vents.
   */
  public init(scene: THREE.Scene, options?: TrackInteractiveOptions): void {
    this.scene = scene;
    if (options?.track) this.track = options.track;
    if (options?.paperPerDesk) this.paperPerDesk = options.paperPerDesk;
    if (options?.postitPerDesk) this.postitPerDesk = options.postitPerDesk;
    if (options?.maxSteamPuffsPerCup) this.maxPuffsPerCup = options.maxSteamPuffsPerCup;

    if (options?.deskPositions && options.deskPositions.length > 0) {
      this.desks = options.deskPositions.map((d) => ({
        x: d.x,
        z: d.z,
        heading: d.heading ?? 0,
      }));
    }

    if (this.desks.length === 0 && this.track) {
      const trackDesks = extractDesksFromTrack(this.track);
      if (trackDesks.length > 0) this.desks = trackDesks;
    }
    if (this.desks.length === 0) {
      this.discoverDesksFromScene(scene);
    }
    if (this.desks.length === 0) {
      this.desks = [...DEFAULT_CORPORATIVO_DESKS];
    }

    this.initPapersAndPostits();
    this.initSteamSystem();
    this.initCoffeeSplashes();
    this.initVentParticles();
    this.initDustBurstParticles();
    this.initFeatherParticles();

    const isDeserto = this.track?.id === "deserto";
    const isParque = this.track?.id === "parque";
    const isCorporate = !isDeserto && !isParque;

    // Obstáculos corporativos (apenas se habilitados ou em pistas corporativas)
    if (options?.enableCoffeeCalcinha ?? isCorporate) {
      this.initCoffeeCalcinhaSystem(options);
    }
    if (options?.enableRoombas ?? isCorporate) {
      this.initRoombasSystem(options);
    }
    if (options?.enableAutomaticDoors ?? isCorporate) {
      this.initAutomaticDoorsSystem(options);
    }
    if (options?.enableAirVents ?? isCorporate) {
      this.initAirVentsSystem(options);
    }

    // Obstáculos do Deserto: Redemoinhos de Areia, Urubus Rasantes, Cactos Quebráveis e Poço de Lama
    if (options?.enableDustDevils ?? isDeserto) {
      this.initDustDevilsSystem(options);
    }
    if (options?.enableVultures ?? isDeserto) {
      this.initVulturesSystem(options);
    }
    if (options?.enableCacti ?? isDeserto) {
      this.initCactiSystem(options);
    }
    if (options?.enableMudPit ?? isDeserto) {
      this.initMudPitSystem(options);
    }
  }

  /** Varre a cena procurando nós de ilhas de mesas marcados */
  private discoverDesksFromScene(scene: THREE.Scene): void {
    const discovered: DeskIsland[] = [];
    scene.traverse((obj) => {
      if (obj.name === "desk-island" || obj.userData?.isDeskIsland) {
        discovered.push({
          x: obj.position.x,
          z: obj.position.z,
          heading: obj.rotation.y,
        });
      }
    });
    if (discovered.length > 0) {
      this.desks = discovered;
    }
  }

  /** Configura as instâncias de papéis sulfite e post-its coloridos */
  private initPapersAndPostits(): void {
    if (!this.scene) return;

    const numDesks = this.desks.length;
    this.totalPapers = numDesks * this.paperPerDesk;
    this.totalPostits = numDesks * this.postitPerDesk;

    this.paperPosX = new Float32Array(this.totalPapers);
    this.paperPosY = new Float32Array(this.totalPapers);
    this.paperPosZ = new Float32Array(this.totalPapers);
    this.paperVelX = new Float32Array(this.totalPapers);
    this.paperVelY = new Float32Array(this.totalPapers);
    this.paperVelZ = new Float32Array(this.totalPapers);
    this.paperRotX = new Float32Array(this.totalPapers);
    this.paperRotY = new Float32Array(this.totalPapers);
    this.paperRotZ = new Float32Array(this.totalPapers);
    this.paperAngX = new Float32Array(this.totalPapers);
    this.paperAngY = new Float32Array(this.totalPapers);
    this.paperAngZ = new Float32Array(this.totalPapers);
    this.paperRestX = new Float32Array(this.totalPapers);
    this.paperRestY = new Float32Array(this.totalPapers);
    this.paperRestZ = new Float32Array(this.totalPapers);
    this.paperRestRotY = new Float32Array(this.totalPapers);
    this.paperState = new Uint8Array(this.totalPapers);
    this.paperAge = new Float32Array(this.totalPapers);
    this.paperFlutterFreq = new Float32Array(this.totalPapers);
    this.paperDeskIdx = new Uint16Array(this.totalPapers);

    this.postitPosX = new Float32Array(this.totalPostits);
    this.postitPosY = new Float32Array(this.totalPostits);
    this.postitPosZ = new Float32Array(this.totalPostits);
    this.postitVelX = new Float32Array(this.totalPostits);
    this.postitVelY = new Float32Array(this.totalPostits);
    this.postitVelZ = new Float32Array(this.totalPostits);
    this.postitRotX = new Float32Array(this.totalPostits);
    this.postitRotY = new Float32Array(this.totalPostits);
    this.postitRotZ = new Float32Array(this.totalPostits);
    this.postitAngX = new Float32Array(this.totalPostits);
    this.postitAngY = new Float32Array(this.totalPostits);
    this.postitAngZ = new Float32Array(this.totalPostits);
    this.postitRestX = new Float32Array(this.totalPostits);
    this.postitRestY = new Float32Array(this.totalPostits);
    this.postitRestZ = new Float32Array(this.totalPostits);
    this.postitRestRotY = new Float32Array(this.totalPostits);
    this.postitState = new Uint8Array(this.totalPostits);
    this.postitAge = new Float32Array(this.totalPostits);
    this.postitFlutterFreq = new Float32Array(this.totalPostits);
    this.postitDeskIdx = new Uint16Array(this.totalPostits);

    const paperGeo = new THREE.PlaneGeometry(0.22, 0.31);
    const paperMat = new THREE.MeshStandardMaterial({
      color: COLOR_PAPER_WHITE,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    this.paperMesh = new THREE.InstancedMesh(paperGeo, paperMat, this.totalPapers);
    this.paperMesh.castShadow = true;
    this.paperMesh.receiveShadow = true;

    const postitGeo = new THREE.PlaneGeometry(0.09, 0.09);
    const postitMat = new THREE.MeshStandardMaterial({
      roughness: 0.88,
      side: THREE.DoubleSide,
    });
    this.postitMesh = new THREE.InstancedMesh(postitGeo, postitMat, this.totalPostits);
    this.postitMesh.castShadow = true;
    this.postitMesh.receiveShadow = true;

    this.disposables.push(paperGeo, paperMat, this.paperMesh, postitGeo, postitMat, this.postitMesh);

    let pIdx = 0;
    let sIdx = 0;

    for (let d = 0; d < numDesks; d++) {
      const desk = this.desks[d];
      const cosH = Math.cos(desk.heading);
      const sinH = Math.sin(desk.heading);

      for (let p = 0; p < this.paperPerDesk; p++) {
        const stackSide = p % 2 === 0 ? -0.45 : 0.45;
        const stackY = 0.785 + Math.floor(p / 2) * 0.003;
        const localX = stackSide + (Math.random() - 0.5) * 0.08;
        const localZ = 0.15 + (Math.random() - 0.5) * 0.08;

        const worldX = desk.x + localX * cosH - localZ * sinH;
        const worldZ = desk.z + localX * sinH + localZ * cosH;
        const worldRotY = desk.heading + (Math.random() - 0.5) * 0.35;

        this.paperRestX[pIdx] = worldX;
        this.paperRestY[pIdx] = stackY;
        this.paperRestZ[pIdx] = worldZ;
        this.paperRestRotY[pIdx] = worldRotY;

        this.paperPosX[pIdx] = worldX;
        this.paperPosY[pIdx] = stackY;
        this.paperPosZ[pIdx] = worldZ;
        this.paperRotX[pIdx] = -Math.PI / 2;
        this.paperRotY[pIdx] = worldRotY;
        this.paperRotZ[pIdx] = 0;

        this.paperDeskIdx[pIdx] = d;
        this.paperState[pIdx] = 0;
        this.paperFlutterFreq[pIdx] = 10.0 + Math.random() * 6.0;

        _vecA.set(worldX, stackY, worldZ);
        _eulerA.set(-Math.PI / 2, worldRotY, 0, "YXZ");
        _quatA.setFromEuler(_eulerA);
        _mat4A.compose(_vecA, _quatA, _scaleVec);
        this.paperMesh.setMatrixAt(pIdx, _mat4A);

        pIdx++;
      }

      for (let s = 0; s < this.postitPerDesk; s++) {
        const padIdx = s % 3;
        const padX = -0.75 + padIdx * 0.15;
        const padZ = -0.35 + (Math.random() - 0.5) * 0.05;
        const padY = 0.786 + Math.floor(s / 3) * 0.0018;

        const worldX = desk.x + padX * cosH - padZ * sinH;
        const worldZ = desk.z + padX * sinH + padZ * cosH;
        const worldRotY = desk.heading + (Math.random() - 0.5) * 0.2;

        this.postitRestX[sIdx] = worldX;
        this.postitRestY[sIdx] = padY;
        this.postitRestZ[sIdx] = worldZ;
        this.postitRestRotY[sIdx] = worldRotY;

        this.postitPosX[sIdx] = worldX;
        this.postitPosY[sIdx] = padY;
        this.postitPosZ[sIdx] = worldZ;
        this.postitRotX[sIdx] = -Math.PI / 2;
        this.postitRotY[sIdx] = worldRotY;
        this.postitRotZ[sIdx] = 0;

        this.postitDeskIdx[sIdx] = d;
        this.postitState[sIdx] = 0;
        this.postitFlutterFreq[sIdx] = 14.0 + Math.random() * 8.0;

        _vecA.set(worldX, padY, worldZ);
        _eulerA.set(-Math.PI / 2, worldRotY, 0, "YXZ");
        _quatA.setFromEuler(_eulerA);
        _mat4A.compose(_vecA, _quatA, _scaleVec);
        this.postitMesh.setMatrixAt(sIdx, _mat4A);

        const color = POSTIT_COLORS[padIdx];
        this.postitMesh.setColorAt(sIdx, color);

        sIdx++;
      }
    }

    this.paperMesh.instanceMatrix.needsUpdate = true;
    this.postitMesh.instanceMatrix.needsUpdate = true;
    if (this.postitMesh.instanceColor) this.postitMesh.instanceColor.needsUpdate = true;

    this.scene.add(this.paperMesh);
    this.scene.add(this.postitMesh);
  }

  /** Inicializa o sistema de nuvenzinhas de vapor cartoon das xícaras de café */
  private initSteamSystem(): void {
    if (!this.scene) return;

    const MAX_SUPPORTED_CUPS = 16;
    this.totalSteamPuffs = MAX_SUPPORTED_CUPS * this.maxPuffsPerCup;

    this.steamAge = new Float32Array(this.totalSteamPuffs);
    this.steamLife = new Float32Array(this.totalSteamPuffs);
    this.steamCupIdx = new Uint16Array(this.totalSteamPuffs);
    this.steamSpiralAngle = new Float32Array(this.totalSteamPuffs);
    this.steamSpeed = new Float32Array(this.totalSteamPuffs);

    const puffGeo = new THREE.IcosahedronGeometry(0.045, 1);
    const puffMat = new THREE.MeshStandardMaterial({
      color: COLOR_STEAM_WHITE,
      roughness: 0.25,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });

    this.steamMesh = new THREE.InstancedMesh(puffGeo, puffMat, this.totalSteamPuffs);
    this.steamMesh.castShadow = false;
    this.steamMesh.receiveShadow = false;

    this.disposables.push(puffGeo, puffMat, this.steamMesh);

    for (let i = 0; i < this.totalSteamPuffs; i++) {
      this.steamLife[i] = 1.3 + Math.random() * 0.4;
      this.steamAge[i] = Math.random() * this.steamLife[i];
      this.steamCupIdx[i] = Math.floor(i / this.maxPuffsPerCup);
      this.steamSpiralAngle[i] = Math.random() * Math.PI * 2;
      this.steamSpeed[i] = 0.55 + Math.random() * 0.25;

      _mat4A.makeScale(0, 0, 0);
      this.steamMesh.setMatrixAt(i, _mat4A);
      this.steamMesh.setColorAt(i, COLOR_STEAM_WHITE);
    }

    this.steamMesh.instanceMatrix.needsUpdate = true;
    if (this.steamMesh.instanceColor) this.steamMesh.instanceColor.needsUpdate = true;

    this.scene.add(this.steamMesh);
  }

  /** Inicializa as gotículas e respingos do jato de café */
  private initCoffeeSplashes(): void {
    if (!this.scene) return;

    this.splashPosX = new Float32Array(this.MAX_SPLASH_DROPS);
    this.splashPosY = new Float32Array(this.MAX_SPLASH_DROPS);
    this.splashPosZ = new Float32Array(this.MAX_SPLASH_DROPS);
    this.splashVelX = new Float32Array(this.MAX_SPLASH_DROPS);
    this.splashVelY = new Float32Array(this.MAX_SPLASH_DROPS);
    this.splashVelZ = new Float32Array(this.MAX_SPLASH_DROPS);
    this.splashAge = new Float32Array(this.MAX_SPLASH_DROPS);
    this.splashLife = new Float32Array(this.MAX_SPLASH_DROPS);

    const splashGeo = new THREE.IcosahedronGeometry(0.045, 1);
    const splashMat = new THREE.MeshStandardMaterial({
      color: COLOR_COFFEE_BROWN,
      roughness: 0.15,
      metalness: 0.1,
    });
    this.splashMesh = new THREE.InstancedMesh(splashGeo, splashMat, this.MAX_SPLASH_DROPS);

    for (let i = 0; i < this.MAX_SPLASH_DROPS; i++) {
      this.splashLife[i] = 0.7;
      this.splashAge[i] = 0.7;
      _mat4A.makeScale(0, 0, 0);
      this.splashMesh.setMatrixAt(i, _mat4A);
    }
    this.splashMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.splashMesh);
    this.disposables.push(splashGeo, splashMat, this.splashMesh);
  }

  /** Inicializa partículas azuis de fluxo das grelhas de ventilação */
  private initVentParticles(): void {
    if (!this.scene) return;

    this.ventParticlePosX = new Float32Array(this.MAX_VENT_PARTICLES);
    this.ventParticlePosY = new Float32Array(this.MAX_VENT_PARTICLES);
    this.ventParticlePosZ = new Float32Array(this.MAX_VENT_PARTICLES);
    this.ventParticleVelY = new Float32Array(this.MAX_VENT_PARTICLES);
    this.ventParticleAge = new Float32Array(this.MAX_VENT_PARTICLES);
    this.ventParticleLife = new Float32Array(this.MAX_VENT_PARTICLES);
    this.ventParticleVentIdx = new Uint16Array(this.MAX_VENT_PARTICLES);

    const ventPGeo = new THREE.IcosahedronGeometry(0.038, 1);
    const ventPMat = new THREE.MeshBasicMaterial({
      color: COLOR_VENT_CYAN,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    this.ventParticleMesh = new THREE.InstancedMesh(ventPGeo, ventPMat, this.MAX_VENT_PARTICLES);

    for (let i = 0; i < this.MAX_VENT_PARTICLES; i++) {
      this.ventParticleLife[i] = 0.8 + Math.random() * 0.4;
      this.ventParticleAge[i] = Math.random() * this.ventParticleLife[i];
      this.ventParticleVelY[i] = 2.8 + Math.random() * 1.5;
      _mat4A.makeScale(0, 0, 0);
      this.ventParticleMesh.setMatrixAt(i, _mat4A);
    }
    this.ventParticleMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.ventParticleMesh);
    this.disposables.push(ventPGeo, ventPMat, this.ventParticleMesh);
  }

  // ==========================================================================
  // 1. SISTEMA: O FAMOSO "CAFÉ COADO NA CALCINHA" (DONA NEIDE 2.0)
  // ==========================================================================
  private initCoffeeCalcinhaSystem(options?: TrackInteractiveOptions): void {
    if (options?.enableCoffeeCalcinha === false) return;

    let posX = 12.0;
    let posZ = -34.0;
    let heading = 0;

    if (options?.coffeeCalcinhaPosition) {
      posX = options.coffeeCalcinhaPosition.x;
      posZ = options.coffeeCalcinhaPosition.z;
      heading = options.coffeeCalcinhaPosition.heading ?? 0;
    } else if (this.track) {
      // Exigência: Posicionado logo após a linha de largada / arco inicial (S ≈ 18m)
      const at = pointAt(this.track, 18);
      const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
      const shoulderOff = at.halfWidth + 2.2;
      posX = at.pos.x + nrm.x * shoulderOff;
      posZ = at.pos.z + nrm.z * shoulderOff;
      heading = at.heading + Math.PI;
    }

    this.registerCoffeeCalcinha({ x: posX, y: 0, z: posZ, heading });
  }

  /**
   * Constrói e registra o Café Coado na Calcinha da Dona Neide 2.0 (Redesign Orgânico, Chunky & Tátil).
   */
  public registerCoffeeCalcinha(pos: {
    x: number;
    y?: number;
    z: number;
    heading?: number;
  }): CoffeeCalcinhaObstacle {
    const group = new THREE.Group();
    const y0 = pos.y ?? 0;
    group.position.set(pos.x, y0, pos.z);
    group.rotation.y = pos.heading ?? 0;

    if (!this.donaNeideTexture) {
      this.donaNeideTexture = createDonaNeideTexture();
      this.disposables.push(this.donaNeideTexture);
    }
    if (!this.manometerTexture) {
      this.manometerTexture = createManometerTexture();
      this.disposables.push(this.manometerTexture);
    }
    if (!this.formicaTableTexture) {
      this.formicaTableTexture = createFormicaTableTexture();
      this.disposables.push(this.formicaTableTexture);
    }
    if (!this.enamelMugTexture) {
      this.enamelMugTexture = createEnamelMugTexture();
      this.disposables.push(this.enamelMugTexture);
    }
    if (!this.calcinhaTexture) {
      this.calcinhaTexture = createCalcinhaTexture();
      this.disposables.push(this.calcinhaTexture);
    }

    const chromeMat = new THREE.MeshStandardMaterial({
      color: "#f1f5f9",
      metalness: 0.92,
      roughness: 0.16,
    });
    this.disposables.push(chromeMat);

    // ------------------------------------------------------------------------
    // 1. MESA DE COPA 2.0 (Tampo chanfrado com bevels e pés em curvas elegantes)
    // ------------------------------------------------------------------------
    const tableGroup = new THREE.Group();

    // Tampo central com cantos arredondados (fillets)
    const topCenterGeo = new THREE.BoxGeometry(1.36, 0.07, 0.81);
    const topMat = new THREE.MeshStandardMaterial({
      map: this.formicaTableTexture,
      roughness: 0.38,
      metalness: 0.08,
    });
    const tableTop = new THREE.Mesh(topCenterGeo, topMat);
    tableTop.position.y = 0.74;
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    tableGroup.add(tableTop);

    // 4 cantos arredondados (fillets verticais suaves)
    const cornerGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.07, 12);
    for (const cx of [-0.635, 0.635]) {
      for (const cz of [-0.36, 0.36]) {
        const cMesh = new THREE.Mesh(cornerGeo, topMat);
        cMesh.position.set(cx, 0.74, cz);
        tableGroup.add(cMesh);
      }
    }

    // Borda chanfrada emborrachada vintage escurecida
    const rimGeo = new THREE.BoxGeometry(1.42, 0.035, 0.87);
    const rimMat = new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.55 });
    const tableRim = new THREE.Mesh(rimGeo, rimMat);
    tableRim.position.y = 0.74;
    tableGroup.add(tableRim);

    // Pernas tubulares com curvas elegantes retrô (splayed / flared)
    const legUpperGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.32, 12);
    const legLowerGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.44, 12);
    const footSphereGeo = new THREE.SphereGeometry(0.038, 10, 8);
    const footRubberGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.018, 10);
    const rubberMat = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.8 });
    const stretcherGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.72, 8);

    for (const lx of [-0.58, 0.58]) {
      // Barra de reforço horizontal conectando as pernas dianteiras e traseiras
      const stretcher = new THREE.Mesh(stretcherGeo, chromeMat);
      stretcher.position.set(lx, 0.22, 0);
      stretcher.rotation.x = Math.PI / 2;
      tableGroup.add(stretcher);

      for (const lz of [-0.32, 0.32]) {
        const legGroup = new THREE.Group();
        legGroup.position.set(lx, 0, lz);

        const upper = new THREE.Mesh(legUpperGeo, chromeMat);
        upper.position.y = 0.55;
        legGroup.add(upper);

        const lower = new THREE.Mesh(legLowerGeo, chromeMat);
        // Curvatura suave para fora
        const tiltX = lx > 0 ? 0.11 : -0.11;
        const tiltZ = lz > 0 ? 0.09 : -0.09;
        lower.position.set(tiltX * 0.22, 0.20, tiltZ * 0.22);
        lower.rotation.z = -tiltX;
        lower.rotation.x = tiltZ;
        legGroup.add(lower);

        // Sapata de borracha e esfera cromada retrô no chão
        const footSphere = new THREE.Mesh(footSphereGeo, chromeMat);
        footSphere.position.set(tiltX * 0.45, 0.03, tiltZ * 0.45);
        legGroup.add(footSphere);

        const footRubber = new THREE.Mesh(footRubberGeo, rubberMat);
        footRubber.position.set(tiltX * 0.45, 0.009, tiltZ * 0.45);
        legGroup.add(footRubber);

        tableGroup.add(legGroup);
      }
    }
    group.add(tableGroup);

    // ------------------------------------------------------------------------
    // 2. GARRAFA TÉRMICA RETRÔ 2.0 (Corpo bojudo arredondado, bico curvado, manômetro)
    // ------------------------------------------------------------------------
    const thermosGroup = new THREE.Group();
    thermosGroup.position.set(-0.42, 0.78, 0.05);

    const redJugMat = new THREE.MeshStandardMaterial({
      color: "#d90429",
      roughness: 0.24,
      metalness: 0.22,
    });

    // Base cromada em anel chanfrado
    const thermosBaseGeo = new THREE.CylinderGeometry(0.18, 0.19, 0.04, 24);
    const thermosBase = new THREE.Mesh(thermosBaseGeo, chromeMat);
    thermosBase.position.y = 0.02;
    thermosGroup.add(thermosBase);

    // Bojo inferior bojudo e orgânico arredondado retrô
    const bulbGeo = new THREE.SphereGeometry(0.21, 24, 18);
    const bulbMesh = new THREE.Mesh(bulbGeo, redJugMat);
    bulbMesh.scale.set(1.0, 0.82, 1.0);
    bulbMesh.position.y = 0.18;
    bulbMesh.castShadow = true;
    thermosGroup.add(bulbMesh);

    // Cone de transição do ombro afunilando para o pescoço
    const shoulderGeo = new THREE.CylinderGeometry(0.13, 0.21, 0.18, 24);
    const shoulderMesh = new THREE.Mesh(shoulderGeo, redJugMat);
    shoulderMesh.position.y = 0.32;
    thermosGroup.add(shoulderMesh);

    // Colar de pescoço em anel cromado
    const neckGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.06, 24);
    const neckMesh = new THREE.Mesh(neckGeo, chromeMat);
    neckMesh.position.y = 0.43;
    thermosGroup.add(neckMesh);

    // Cúpula da tampa em domo cromado polido brilhante
    const domeGeo = new THREE.SphereGeometry(0.115, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const domeMesh = new THREE.Mesh(domeGeo, chromeMat);
    domeMesh.position.y = 0.46;
    thermosGroup.add(domeMesh);

    // Botão de pressão com botão preto no topo
    const plungerGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16);
    const plungerMat = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.5 });
    const plunger = new THREE.Mesh(plungerGeo, plungerMat);
    plunger.position.y = 0.52;
    thermosGroup.add(plunger);

    // Bico curvado retro saindo do topo apontando suavemente para a calcinha
    const spoutGeo = new THREE.CylinderGeometry(0.024, 0.038, 0.12, 12);
    const spout = new THREE.Mesh(spoutGeo, redJugMat);
    spout.position.set(0.11, 0.46, 0.05);
    spout.rotation.z = -Math.PI * 0.32;
    spout.rotation.y = Math.PI * 0.15;
    thermosGroup.add(spout);

    // Alça retrô curva clássica em arco estilizada
    const handleGeo = new THREE.TorusGeometry(0.14, 0.022, 8, 20, Math.PI);
    const handle = new THREE.Mesh(handleGeo, chromeMat);
    handle.position.set(-0.16, 0.28, 0);
    handle.rotation.z = Math.PI * 0.5;
    handle.rotation.y = -Math.PI * 0.5;
    thermosGroup.add(handle);

    // Manômetro/termômetro analógico redondo com ponteirinho pintado no bojo frontal
    const manoBezelGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.018, 20);
    const manoBezel = new THREE.Mesh(manoBezelGeo, chromeMat);
    manoBezel.rotation.x = Math.PI * 0.5;
    manoBezel.position.set(0, 0.22, 0.198);

    const manoFaceGeo = new THREE.CircleGeometry(0.056, 20);
    const manoMat = new THREE.MeshBasicMaterial({
      map: this.manometerTexture,
      side: THREE.DoubleSide,
    });
    const manometerMesh = new THREE.Mesh(manoFaceGeo, manoMat);
    manometerMesh.position.z = 0.01;
    manoBezel.add(manometerMesh);
    thermosGroup.add(manoBezel);

    // Bilhete amarelo da Dona Neide preso por fita com ligeira inclinação orgânica
    const noteGeo = new THREE.PlaneGeometry(0.19, 0.19);
    const noteMat = new THREE.MeshBasicMaterial({
      map: this.donaNeideTexture,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const noteMesh = new THREE.Mesh(noteGeo, noteMat);
    noteMesh.position.set(-0.06, 0.26, 0.185);
    noteMesh.rotation.y = -0.15;
    noteMesh.rotation.z = 0.06;
    thermosGroup.add(noteMesh);

    group.add(thermosGroup);

    // ------------------------------------------------------------------------
    // 3. SUPORTE DE ARAME CROMADO
    // ------------------------------------------------------------------------
    const standGroup = new THREE.Group();
    standGroup.position.set(0.18, 0.78, 0);

    const wireUprightGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.48, 10);
    const wireUpright = new THREE.Mesh(wireUprightGeo, chromeMat);
    wireUpright.position.set(-0.16, 0.24, 0);
    standGroup.add(wireUpright);

    const wireRingGeo = new THREE.TorusGeometry(0.18, 0.014, 8, 24);
    const wireRing = new THREE.Mesh(wireRingGeo, chromeMat);
    wireRing.rotation.x = -Math.PI / 2;
    wireRing.position.set(0, 0.48, 0);
    standGroup.add(wireRing);

    group.add(standGroup);

    // ------------------------------------------------------------------------
    // 4. COADOR DE CALCINHA RIQUÍSSIMO 2.0 (Curvas anatômicas, babadinhos 3D, laço fofinho)
    // ------------------------------------------------------------------------
    const calcinhaPivot = new THREE.Group();
    calcinhaPivot.position.set(0.18, 1.26, 0);

    // Cós elástico franzido no topo
    const waistGeo = new THREE.TorusGeometry(0.18, 0.016, 8, 24);
    const waistMat = new THREE.MeshStandardMaterial({ color: "#fff0f3", roughness: 0.5 });
    const waistMesh = new THREE.Mesh(waistGeo, waistMat);
    waistMesh.rotation.x = -Math.PI / 2;
    calcinhaPivot.add(waistMesh);

    // Corpo de tecido com curvas anatômicas suaves e recorte
    const calcinhaGeo = new THREE.CylinderGeometry(0.178, 0.042, 0.29, 24, 2, true);
    const calcinhaMat = new THREE.MeshStandardMaterial({
      map: this.calcinhaTexture,
      roughness: 0.78,
      side: THREE.DoubleSide,
    });
    const calcinhaMesh = new THREE.Mesh(calcinhaGeo, calcinhaMat);
    calcinhaMesh.position.y = -0.145;
    calcinhaMesh.castShadow = true;
    calcinhaPivot.add(calcinhaMesh);

    // Babadinhos 3D franzidos ao redor das aberturas das pernas (3D Ruffles)
    const ruffleMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    const ruffleLGeo = new THREE.TorusGeometry(0.08, 0.014, 6, 16);
    const ruffleL = new THREE.Mesh(ruffleLGeo, ruffleMat);
    ruffleL.position.set(-0.11, -0.14, 0);
    ruffleL.rotation.y = Math.PI * 0.42;
    ruffleL.rotation.z = Math.PI * 0.2;
    calcinhaPivot.add(ruffleL);

    const ruffleRGeo = new THREE.TorusGeometry(0.08, 0.014, 6, 16);
    const ruffleR = new THREE.Mesh(ruffleRGeo, ruffleMat);
    ruffleR.position.set(0.11, -0.14, 0);
    ruffleR.rotation.y = -Math.PI * 0.42;
    ruffleR.rotation.z = -Math.PI * 0.2;
    calcinhaPivot.add(ruffleR);

    // Laço tridimensional fofinho na frente (chubby satin bow)
    const bowGroup = new THREE.Group();
    bowGroup.position.set(0, 0, 0.182);

    const bowMat = new THREE.MeshStandardMaterial({
      color: "#e11d48",
      roughness: 0.35,
      metalness: 0.1,
    });
    const bowKnotGeo = new THREE.SphereGeometry(0.028, 12, 10);
    const bowKnot = new THREE.Mesh(bowKnotGeo, bowMat);
    bowGroup.add(bowKnot);

    const bowWingGeo = new THREE.SphereGeometry(0.038, 10, 8);
    const bowLeft = new THREE.Mesh(bowWingGeo, bowMat);
    bowLeft.scale.set(1.6, 0.9, 0.6);
    bowLeft.rotation.z = Math.PI * 0.18;
    bowLeft.position.set(-0.046, 0.01, 0);
    bowGroup.add(bowLeft);

    const bowRight = new THREE.Mesh(bowWingGeo, bowMat);
    bowRight.scale.set(1.6, 0.9, 0.6);
    bowRight.rotation.z = -Math.PI * 0.18;
    bowRight.position.set(0.046, 0.01, 0);
    bowGroup.add(bowRight);

    // Caimentos de fita ondulantes
    const ribbonTailGeo = new THREE.BoxGeometry(0.018, 0.075, 0.006);
    const tailL = new THREE.Mesh(ribbonTailGeo, bowMat);
    tailL.position.set(-0.02, -0.045, 0.005);
    tailL.rotation.z = 0.22;
    bowGroup.add(tailL);

    const tailR = new THREE.Mesh(ribbonTailGeo, bowMat);
    tailR.position.set(0.02, -0.045, 0.005);
    tailR.rotation.z = -0.22;
    bowGroup.add(tailR);

    calcinhaPivot.add(bowGroup);
    group.add(calcinhaPivot);

    // ------------------------------------------------------------------------
    // 5. FIO CONTÍNUO DE CAFÉ CARTOON ESCORRENDO
    // ------------------------------------------------------------------------
    const streamGeo = new THREE.CylinderGeometry(0.012, 0.018, 0.22, 10);
    const streamMat = new THREE.MeshStandardMaterial({
      color: COLOR_COFFEE_BROWN,
      roughness: 0.08,
      metalness: 0.15,
    });
    const streamMesh = new THREE.Mesh(streamGeo, streamMat);
    streamMesh.position.set(0.18, 0.90, 0);
    group.add(streamMesh);

    // ------------------------------------------------------------------------
    // 6. CANECA DA VOVÓ 2.0 (Cerâmica/esmalte lascada, café ondulante, vapor metaball)
    // ------------------------------------------------------------------------
    const mugGroup = new THREE.Group();
    mugGroup.position.set(0.18, 0.78, 0);

    const mugBodyGeo = new THREE.CylinderGeometry(0.095, 0.082, 0.16, 20);
    const mugMat = new THREE.MeshStandardMaterial({
      map: this.enamelMugTexture,
      roughness: 0.32,
      metalness: 0.1,
    });
    const mugBody = new THREE.Mesh(mugBodyGeo, mugMat);
    mugBody.position.y = 0.08;
    mugBody.castShadow = true;
    mugGroup.add(mugBody);

    const mugRimGeo = new THREE.TorusGeometry(0.095, 0.012, 8, 20);
    const mugRimMat = new THREE.MeshStandardMaterial({ color: "#0369a1", roughness: 0.4 });
    const mugRim = new THREE.Mesh(mugRimGeo, mugRimMat);
    mugRim.rotation.x = -Math.PI / 2;
    mugRim.position.y = 0.16;
    mugGroup.add(mugRim);

    const mugHandleGeo = new THREE.TorusGeometry(0.052, 0.018, 8, 16, Math.PI);
    const mugHandle = new THREE.Mesh(mugHandleGeo, mugMat);
    mugHandle.position.set(0.10, 0.08, 0);
    mugHandle.rotation.y = Math.PI / 2;
    mugGroup.add(mugHandle);

    const liquidGeo = new THREE.CircleGeometry(0.088, 16);
    const liquidMat = new THREE.MeshStandardMaterial({
      color: COLOR_COFFEE_BROWN,
      roughness: 0.08,
    });
    const mugLiquidMesh = new THREE.Mesh(liquidGeo, liquidMat);
    mugLiquidMesh.rotation.x = -Math.PI / 2;
    mugLiquidMesh.position.y = 0.155;
    mugGroup.add(mugLiquidMesh);

    // Nuvenzinhas de vapor cartoon volumétricas estilo metaball/esferas conectadas
    const mugSteamCluster = new THREE.Group();
    mugSteamCluster.position.set(0, 0.22, 0);

    const steamCloudMat = new THREE.MeshStandardMaterial({
      color: COLOR_STEAM_WHITE,
      roughness: 0.3,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });

    const puffCenterGeo = new THREE.IcosahedronGeometry(0.065, 1);
    const puffCenter = new THREE.Mesh(puffCenterGeo, steamCloudMat);
    mugSteamCluster.add(puffCenter);

    const puffLGeo = new THREE.IcosahedronGeometry(0.048, 1);
    const puffL = new THREE.Mesh(puffLGeo, steamCloudMat);
    puffL.position.set(-0.045, -0.015, 0.02);
    mugSteamCluster.add(puffL);

    const puffRGeo = new THREE.IcosahedronGeometry(0.052, 1);
    const puffR = new THREE.Mesh(puffRGeo, steamCloudMat);
    puffR.position.set(0.04, 0.02, -0.018);
    mugSteamCluster.add(puffR);

    const puffTGeo = new THREE.IcosahedronGeometry(0.038, 1);
    const puffT = new THREE.Mesh(puffTGeo, steamCloudMat);
    puffT.position.set(0.02, 0.06, 0.015);
    mugSteamCluster.add(puffT);

    const puffT2Geo = new THREE.IcosahedronGeometry(0.032, 1);
    const puffT2 = new THREE.Mesh(puffT2Geo, steamCloudMat);
    puffT2.position.set(-0.025, 0.075, -0.01);
    mugSteamCluster.add(puffT2);

    mugGroup.add(mugSteamCluster);
    group.add(mugGroup);

    this.disposables.push(
      topCenterGeo, topMat, cornerGeo, rimGeo, rimMat,
      legUpperGeo, legLowerGeo, footSphereGeo, footRubberGeo, rubberMat, stretcherGeo,
      thermosBaseGeo, bulbGeo, redJugMat, shoulderGeo, neckGeo, domeGeo,
      plungerGeo, plungerMat, spoutGeo, handleGeo, manoBezelGeo, manoFaceGeo, manoMat,
      noteGeo, noteMat, wireUprightGeo, wireRingGeo, waistGeo, waistMat, calcinhaGeo, calcinhaMat,
      ruffleMat, ruffleLGeo, ruffleRGeo, bowMat, bowKnotGeo, bowWingGeo, ribbonTailGeo,
      streamGeo, streamMat, mugBodyGeo, mugMat, mugRimGeo, mugRimMat, mugHandleGeo, liquidGeo, liquidMat,
      steamCloudMat, puffCenterGeo, puffLGeo, puffRGeo, puffTGeo, puffT2Geo
    );

    const obstacle: CoffeeCalcinhaObstacle = {
      id: 100 + this._coffeeCalcinhas.length,
      pos: { x: pos.x, y: y0, z: pos.z },
      heading: pos.heading ?? 0,
      group,
      calcinhaPivot,
      calcinhaMesh,
      streamMesh,
      thermosMesh: thermosGroup,
      mugGroup,
      mugLiquidMesh,
      mugSteamCluster,
      bowMesh: bowGroup,
      manometerMesh,
      swingAngle: 0,
      swingVelocity: 0,
      elasticStretch: 0,
      elasticVelocity: 0,
      boostCooldown: 0,
      dropletTimer: 0,
      splashActive: false,
    };

    this._coffeeCalcinhas.push(obstacle);
    if (this.scene) this.scene.add(group);

    return obstacle;
  }

  // ==========================================================================
  // 2. SISTEMA: ASPIRADOR ROBÔ ("ROOMBA DA FIRMA" COM LED MATRIX FACE)
  // ==========================================================================
  private initRoombasSystem(options?: TrackInteractiveOptions): void {
    if (options?.enableRoombas === false) return;

    if (options?.roombaPositions && options.roombaPositions.length > 0) {
      for (const r of options.roombaPositions) {
        this.registerRoomba(r.start, r.end, r.speed);
      }
      return;
    }

    if (this.track) {
      const at1 = pointAt(this.track, 36);
      const at2 = pointAt(this.track, 50);
      this.registerRoomba(
        { x: at1.pos.x, z: at1.pos.z },
        { x: at2.pos.x, z: at2.pos.z },
        2.2
      );
    } else {
      this.registerRoomba({ x: 22.0, z: -35.5 }, { x: 34.0, z: -35.5 }, 2.2);
    }
  }

  /**
   * Constrói e registra o Roomba da Firma com expressões dinâmicas em LED Matrix (^‿^, >_<, O_O).
   */
  public registerRoomba(
    start: { x: number; z: number },
    end: { x: number; z: number },
    speed = 2.2
  ): RoombaObstacle {
    const group = new THREE.Group();
    group.position.set(start.x, 0, start.z);

    const heading = Math.atan2(end.x - start.x, end.z - start.z);
    group.rotation.y = heading;

    if (!this.roombaTopTexture) {
      this.roombaTopTexture = createRoombaTopTexture();
      this.disposables.push(this.roombaTopTexture);
    }

    if (!this.roombaFaces) {
      this.roombaFaces = {
        happy: createRoombaFaceTexture("happy"),
        bonked: createRoombaFaceTexture("bonked"),
        surprised: createRoombaFaceTexture("surprised"),
      };
      this.disposables.push(this.roombaFaces.happy, this.roombaFaces.bonked, this.roombaFaces.surprised);
    }

    // 1. Corpo cilíndrico robusto e gordinho
    const bodyGeo = new THREE.CylinderGeometry(0.55, 0.58, 0.22, 28);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: "#22252a",
      roughness: 0.45,
      metalness: 0.18,
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.11;
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    // Topo decorado com textura de painel e botão Clean
    const topGeo = new THREE.CircleGeometry(0.54, 28);
    const topMat = new THREE.MeshStandardMaterial({
      map: this.roombaTopTexture,
      roughness: 0.4,
    });
    const topMesh = new THREE.Mesh(topGeo, topMat);
    topMesh.rotation.x = -Math.PI / 2;
    topMesh.position.y = 0.222;
    group.add(topMesh);

    // 2. Para-choque frontal emborrachado com Display LED Matrix
    const bumperGeo = new THREE.CylinderGeometry(0.57, 0.60, 0.16, 16, 1, false, 0, Math.PI);
    const bumperMat = new THREE.MeshStandardMaterial({ color: "#0f1115", roughness: 0.7 });
    const bumper = new THREE.Mesh(bumperGeo, bumperMat);
    bumper.position.y = 0.10;
    group.add(bumper);

    // Display digital frontal em matriz de pontos LED
    const ledGeo = new THREE.CylinderGeometry(0.585, 0.595, 0.08, 24, 1, false, 0.2, Math.PI - 0.4);
    const ledMat = new THREE.MeshBasicMaterial({
      map: this.roombaFaces.happy,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const ledMesh = new THREE.Mesh(ledGeo, ledMat);
    ledMesh.position.y = 0.12;
    group.add(ledMesh);

    // 3. Topper cômico: Cone de trânsito cartoon amassadinho no topo
    const coneGroup = new THREE.Group();
    coneGroup.position.set(0, 0.22, 0);

    const coneBaseGeo = new THREE.BoxGeometry(0.36, 0.03, 0.36);
    const coneBaseMat = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.6 });
    const coneBase = new THREE.Mesh(coneBaseGeo, coneBaseMat);
    coneBase.position.y = 0.015;
    coneGroup.add(coneBase);

    // Geometria de cone com vinco/amassadinha cômica cartoon em um dos lados
    const coneGeo = new THREE.ConeGeometry(0.18, 0.48, 16);
    const posAttr = coneGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      // Amassadinha de impacto cartoon no terço médio-superior
      if (y > 0.04 && y < 0.32 && x > 0.02) {
        const dent = 0.74 + (y - 0.18) * (y - 0.18);
        posAttr.setX(i, x * dent);
        posAttr.setZ(i, z * dent);
      }
    }
    coneGeo.computeVertexNormals();

    const coneMat = new THREE.MeshStandardMaterial({
      color: "#ff5500",
      roughness: 0.32,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.y = 0.255;
    cone.castShadow = true;
    coneGroup.add(cone);

    // 2 faixas reflexivas brancas bem vivas
    const stripe1Geo = new THREE.CylinderGeometry(0.11, 0.14, 0.08, 16);
    const stripeMat = new THREE.MeshBasicMaterial({ color: "#f8fafc" });
    const stripe1 = new THREE.Mesh(stripe1Geo, stripeMat);
    stripe1.position.y = 0.21;
    coneGroup.add(stripe1);

    const stripe2Geo = new THREE.CylinderGeometry(0.065, 0.085, 0.06, 16);
    const stripe2 = new THREE.Mesh(stripe2Geo, stripeMat);
    stripe2.position.y = 0.32;
    coneGroup.add(stripe2);

    group.add(coneGroup);

    // 4. Vassourinhas giratórias dianteiras com cerdas individuais visíveis
    const hubGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.018, 10);
    const hubMat = new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.5 });
    const bristleGeo = new THREE.BoxGeometry(0.085, 0.006, 0.012);
    const bristleMat = new THREE.MeshBasicMaterial({ color: "#f8fafc" });

    const createBrush = (bx: number, bz: number): THREE.Group => {
      const brush = new THREE.Group();
      brush.position.set(bx, 0.015, bz);

      const hub = new THREE.Mesh(hubGeo, hubMat);
      brush.add(hub);

      // 5 feixes de cerdas individuais visíveis saindo radialmente
      for (let b = 0; b < 5; b++) {
        const angle = (b / 5) * Math.PI * 2;
        const spoke = new THREE.Mesh(bristleGeo, bristleMat);
        spoke.position.set(Math.cos(angle) * 0.052, 0, Math.sin(angle) * 0.052);
        spoke.rotation.y = -angle;
        brush.add(spoke);
      }
      return brush;
    };

    const brushL = createBrush(-0.35, 0.35);
    group.add(brushL);

    const brushR = createBrush(0.35, 0.35);
    group.add(brushR);

    this.disposables.push(
      bodyGeo, bodyMat, topGeo, topMat, bumperGeo, bumperMat,
      ledGeo, ledMat, coneBaseGeo, coneBaseMat, coneGeo, coneMat,
      stripe1Geo, stripe2Geo, stripeMat, hubGeo, hubMat, bristleGeo, bristleMat
    );

    const obstacle: RoombaObstacle = {
      id: 200 + this._roombas.length,
      pos: { x: start.x, y: 0, z: start.z },
      heading,
      group,
      ledMesh,
      ledMat,
      coneGroup,
      brushL,
      brushR,
      patrolStart: { x: start.x, z: start.z },
      patrolEnd: { x: end.x, z: end.z },
      patrolT: 0,
      patrolDir: 1,
      patrolSpeed: speed,
      state: "patrol",
      emotion: "happy",
      surprisedTimer: 0,
      bonkTimer: 0,
      squashFactor: 1.0,
      radius: 0.58,
    };

    this._roombas.push(obstacle);
    if (this.scene) this.scene.add(group);

    return obstacle;
  }

  // ==========================================================================
  // 3. SISTEMA: PORTAS AUTOMÁTICAS DE VIDRO
  // ==========================================================================
  private initAutomaticDoorsSystem(options?: TrackInteractiveOptions): void {
    if (options?.enableAutomaticDoors === false) return;

    if (options?.doorPositions && options.doorPositions.length > 0) {
      for (const d of options.doorPositions) {
        this.registerAutomaticDoor({ x: d.x, z: d.z, heading: d.heading }, d.width);
      }
      return;
    }

    if (this.track) {
      const at = pointAt(this.track, 112);
      this.registerAutomaticDoor({ x: at.pos.x, z: at.pos.z, heading: at.heading }, at.halfWidth * 2.0);
    } else {
      this.registerAutomaticDoor({ x: 26.0, z: 12.0, heading: 0 }, 4.6);
    }
  }

  /**
   * Constrói e registra uma porta automática de vidro de correr com faixas zebradas corporativas.
   */
  public registerAutomaticDoor(
    pos: { x: number; y?: number; z: number; heading?: number },
    width = 4.6
  ): AutomaticDoorObstacle {
    const group = new THREE.Group();
    const y0 = pos.y ?? 0;
    group.position.set(pos.x, y0, pos.z);
    group.rotation.y = pos.heading ?? 0;

    if (!this.doorStripesTexture) {
      this.doorStripesTexture = createDoorStripesTexture();
      this.disposables.push(this.doorStripesTexture);
    }

    const frameMat = new THREE.MeshStandardMaterial({
      color: "#64748b",
      metalness: 0.7,
      roughness: 0.3,
    });

    const colGeo = new THREE.BoxGeometry(0.24, 3.2, 0.28);
    const colL = new THREE.Mesh(colGeo, frameMat);
    colL.position.set(-width / 2 - 0.12, 1.6, 0);
    group.add(colL);

    const colR = new THREE.Mesh(colGeo, frameMat);
    colR.position.set(width / 2 + 0.12, 1.6, 0);
    group.add(colR);

    const headerGeo = new THREE.BoxGeometry(width + 0.48, 0.32, 0.32);
    const header = new THREE.Mesh(headerGeo, frameMat);
    header.position.set(0, 3.04, 0);
    group.add(header);

    const ledGeo = new THREE.BoxGeometry(0.18, 0.08, 0.06);
    const sensorLedMat = new THREE.MeshBasicMaterial({ color: "#22c55e" });
    const sensorLed = new THREE.Mesh(ledGeo, sensorLedMat);
    sensorLed.position.set(0, 2.82, 0.165);
    group.add(sensorLed);

    const floorGuideGeo = new THREE.BoxGeometry(width, 0.02, 0.24);
    const floorGuide = new THREE.Mesh(floorGuideGeo, frameMat);
    floorGuide.position.y = 0.01;
    group.add(floorGuide);

    const doorLeafWidth = width * 0.52;
    const doorGeo = new THREE.BoxGeometry(doorLeafWidth, 2.7, 0.06);
    const glassMat = new THREE.MeshStandardMaterial({
      color: "#a5f3fc",
      transparent: true,
      opacity: 0.45,
      roughness: 0.1,
      metalness: 0.1,
    });

    const leftDoor = new THREE.Mesh(doorGeo, glassMat);
    leftDoor.position.set(-doorLeafWidth * 0.5, 1.45, -0.02);
    group.add(leftDoor);

    const rightDoor = new THREE.Mesh(doorGeo, glassMat);
    rightDoor.position.set(doorLeafWidth * 0.5, 1.45, 0.02);
    group.add(rightDoor);

    const stripeGeo = new THREE.PlaneGeometry(doorLeafWidth, 0.36);
    const stripeMat = new THREE.MeshBasicMaterial({
      map: this.doorStripesTexture,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });

    const stripeL = new THREE.Mesh(stripeGeo, stripeMat);
    stripeL.position.set(0, -0.2, 0.035);
    leftDoor.add(stripeL);

    const stripeR = new THREE.Mesh(stripeGeo, stripeMat);
    stripeR.position.set(0, -0.2, -0.035);
    rightDoor.add(stripeR);

    this.disposables.push(
      colGeo, frameMat, headerGeo, ledGeo, sensorLedMat,
      floorGuideGeo, doorGeo, glassMat, stripeGeo, stripeMat
    );

    const obstacle: AutomaticDoorObstacle = {
      id: 300 + this._automaticDoors.length,
      pos: { x: pos.x, y: y0, z: pos.z },
      heading: pos.heading ?? 0,
      group,
      leftDoor,
      rightDoor,
      sensorLed,
      sensorLedMat,
      width,
      halfWidth: width / 2,
      slideDistance: doorLeafWidth * 0.85,
      currentOpen: 1.0,
      state: "open",
      stateTimer: 0,
      shudder: 0,
      durations: { open: 2.8, closing: 0.8, closed: 2.0, opening: 0.8 },
    };

    this._automaticDoors.push(obstacle);
    if (this.scene) this.scene.add(group);

    return obstacle;
  }

  // ==========================================================================
  // 4. SISTEMA: GRELHAS DE VENTILAÇÃO NO CHÃO (AIR CUSHION BOOST VENTS)
  // ==========================================================================
  private initAirVentsSystem(options?: TrackInteractiveOptions): void {
    if (options?.enableAirVents === false) return;

    if (options?.airVentPositions && options.airVentPositions.length > 0) {
      for (const v of options.airVentPositions) {
        this.registerAirVent({ x: v.x, z: v.z, heading: v.heading }, v.width, v.length);
      }
      return;
    }

    if (this.track) {
      const at1 = pointAt(this.track, 28);
      this.registerAirVent({ x: at1.pos.x, z: at1.pos.z, heading: at1.heading }, 3.8, 2.2);

      const at2 = pointAt(this.track, 90);
      this.registerAirVent({ x: at2.pos.x, z: at2.pos.z, heading: at2.heading }, 3.8, 2.2);
    } else {
      this.registerAirVent({ x: 14.0, z: -36.0, heading: Math.PI / 2 }, 3.8, 2.2);
    }
  }

  /**
   * Constrói e registra uma grelha de ventilação no chão com sustentação de ar e boost turbo.
   */
  public registerAirVent(
    pos: { x: number; y?: number; z: number; heading?: number },
    width = 3.8,
    length = 2.2
  ): AirVentObstacle {
    const group = new THREE.Group();
    const y0 = pos.y ?? 0;
    group.position.set(pos.x, y0, pos.z);
    group.rotation.y = pos.heading ?? 0;

    if (!this.ventGrateTexture) {
      this.ventGrateTexture = createVentGrateTexture();
      this.disposables.push(this.ventGrateTexture);
    }

    const frameGeo = new THREE.BoxGeometry(width, 0.035, length);
    const frameMat = new THREE.MeshStandardMaterial({
      map: this.ventGrateTexture,
      roughness: 0.35,
      metalness: 0.75,
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.y = 0.015;
    frame.receiveShadow = true;
    group.add(frame);

    const streamGeo = new THREE.BoxGeometry(width * 0.9, 1.6, length * 0.9);
    const streamMat = new THREE.MeshBasicMaterial({
      color: COLOR_VENT_CYAN,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const streamMesh = new THREE.Mesh(streamGeo, streamMat);
    streamMesh.position.y = 0.82;
    group.add(streamMesh);

    this.disposables.push(frameGeo, frameMat, streamGeo, streamMat);

    const ventIdx = this._airVents.length;
    const obstacle: AirVentObstacle = {
      id: 400 + ventIdx,
      pos: { x: pos.x, y: y0, z: pos.z },
      heading: pos.heading ?? 0,
      width,
      length,
      group,
      streamMesh,
      streamMat,
      boostStrength: 22.0,
      liftHeight: 0.22,
      particleOffset: ventIdx * 16,
      particleCount: 16,
    };

    const startP = obstacle.particleOffset;
    const endP = Math.min(startP + obstacle.particleCount, this.MAX_VENT_PARTICLES);
    for (let p = startP; p < endP; p++) {
      this.ventParticleVentIdx[p] = ventIdx;
    }

    this._airVents.push(obstacle);
    if (this.scene) this.scene.add(group);

    return obstacle;
  }

  /** Registra uma ilha de mesas explicitamente */
  public registerDesk(x: number, z: number, heading = 0): void {
    this.desks.push({ x, z, heading });
  }

  /** Registra uma caixa de item na cena para receber animação Galaxy */
  public registerItemBox(meshOrGroup: THREE.Object3D, baseY = 0.9): ManagedItemBox {
    const id = this.nextBoxId++;
    const phase = Math.random() * Math.PI * 2;

    const haloGeo = new THREE.RingGeometry(0.52, 0.76, 28);
    const haloMat = new THREE.MeshBasicMaterial({
      color: "#ffd43f",
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0;
    meshOrGroup.add(halo);

    this.disposables.push(haloGeo, haloMat);

    const managed: ManagedItemBox = {
      id,
      baseY,
      phase,
      yaw: Math.random() * Math.PI * 2,
      mesh: meshOrGroup,
      innerBox: meshOrGroup,
      halo,
      haloMat,
    };

    this.managedBoxes.set(id, managed);
    return managed;
  }

  /** Constrói e registra uma nova Caixa de Itens completa no estilo Super Mario Galaxy */
  public createItemBox(pos: { x: number; y?: number; z: number; id?: number }): THREE.Group {
    const group = new THREE.Group();
    const baseY = pos.y ?? 0.9;
    group.position.set(pos.x, baseY, pos.z);

    if (!this.galaxyBoxTexture) {
      this.galaxyBoxTexture = createGalaxyBoxTexture();
      this.disposables.push(this.galaxyBoxTexture);
    }

    const boxGeo = new THREE.BoxGeometry(0.78, 0.78, 0.78);
    const boxMat = new THREE.MeshStandardMaterial({
      map: this.galaxyBoxTexture,
      roughness: 0.4,
      metalness: 0.15,
      emissive: "#ff9900",
      emissiveIntensity: 0.25,
    });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.castShadow = true;
    group.add(boxMesh);

    this.disposables.push(boxGeo, boxMat);

    const id = pos.id ?? this.nextBoxId++;
    const phase = Math.random() * Math.PI * 2;

    const haloGeo = new THREE.RingGeometry(0.55, 0.82, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: "#ffd700",
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    group.add(halo);

    this.disposables.push(haloGeo, haloMat);

    const managed: ManagedItemBox = {
      id,
      baseY,
      phase,
      yaw: Math.random() * Math.PI * 2,
      mesh: group,
      innerBox: boxMesh,
      halo,
      haloMat,
    };

    this.managedBoxes.set(id, managed);
    if (this.scene) this.scene.add(group);

    return group;
  }

  /** Registra uma xícara de café para receber rotação, bobbing, aroma e vapor */
  public registerCup(group: THREE.Object3D, baseY = 0.38): ManagedCup {
    const id = this.nextCupId++;
    const phase = Math.random() * Math.PI * 2;

    const aromaGeo = new THREE.RingGeometry(0.18, 0.24, 20);
    const aromaMat = new THREE.MeshBasicMaterial({
      color: "#ffc83b",
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const aromaMesh = new THREE.Mesh(aromaGeo, aromaMat);
    aromaMesh.rotation.x = -Math.PI / 2;
    aromaMesh.position.y = 0.145;
    group.add(aromaMesh);

    this.disposables.push(aromaGeo, aromaMat);

    const managed: ManagedCup = {
      id,
      baseY,
      phase,
      group,
      aromaMesh,
      aromaMat,
    };

    this.managedCups.set(id, managed);
    return managed;
  }

  /** Remove uma caixa de itens */
  public removeBox(id: number): void {
    const box = this.managedBoxes.get(id);
    if (!box) return;
    if (box.halo && box.halo.parent) {
      box.halo.parent.remove(box.halo);
    }
    this.managedBoxes.delete(id);
  }

  /** Remove uma xícara de café */
  public removeCup(id: number): void {
    const cup = this.managedCups.get(id);
    if (!cup) return;
    if (cup.aromaMesh && cup.aromaMesh.parent) {
      cup.aromaMesh.parent.remove(cup.aromaMesh);
    }
    this.managedCups.delete(id);
  }

  /** Dispara rajada aerodinâmica turbulenta sobre uma ilha de mesas */
  public triggerDeskAirBlast(
    deskIdx: number,
    kartX: number,
    kartZ: number,
    kartSpeed: number,
    dist: number,
  ): void {
    if (deskIdx < 0 || deskIdx >= this.desks.length) return;
    const desk = this.desks[deskIdx];

    const distFactor = Math.max(0.1, (3.8 - dist) / 3.8);
    const speedFactor = Math.min(2.5, 1.0 + (kartSpeed - 10) * 0.16);
    const gust = distFactor * speedFactor;

    let dirX = desk.x - kartX;
    let dirZ = desk.z - kartZ;
    const len = Math.hypot(dirX, dirZ) || 1;
    dirX /= len;
    dirZ /= len;

    const pStart = deskIdx * this.paperPerDesk;
    const pEnd = pStart + this.paperPerDesk;
    for (let i = pStart; i < pEnd; i++) {
      if (this.paperState[i] === 0 || this.paperState[i] === 2) {
        this.paperState[i] = 1;
        this.paperAge[i] = 0;
        this.paperVelY[i] = 3.6 + Math.random() * 2.8 * gust;
        this.paperVelX[i] = dirX * (1.6 + Math.random() * 1.8) * gust + (Math.random() - 0.5) * 2.2;
        this.paperVelZ[i] = dirZ * (1.6 + Math.random() * 1.8) * gust + (Math.random() - 0.5) * 2.2;
        this.paperAngX[i] = (Math.random() - 0.5) * 16.0;
        this.paperAngY[i] = (Math.random() - 0.5) * 18.0;
        this.paperAngZ[i] = (Math.random() - 0.5) * 14.0;
      } else {
        this.paperVelY[i] += 1.8 * gust;
        this.paperAngY[i] += (Math.random() - 0.5) * 12.0;
      }
    }

    const sStart = deskIdx * this.postitPerDesk;
    const sEnd = sStart + this.postitPerDesk;
    for (let i = sStart; i < sEnd; i++) {
      if (this.postitState[i] === 0 || this.postitState[i] === 2) {
        this.postitState[i] = 1;
        this.postitAge[i] = 0;
        this.postitVelY[i] = 4.4 + Math.random() * 3.6 * gust;
        this.postitVelX[i] = dirX * (2.0 + Math.random() * 2.2) * gust + (Math.random() - 0.5) * 2.6;
        this.postitVelZ[i] = dirZ * (2.0 + Math.random() * 2.2) * gust + (Math.random() - 0.5) * 2.6;
        this.postitAngX[i] = (Math.random() - 0.5) * 24.0;
        this.postitAngY[i] = (Math.random() - 0.5) * 28.0;
        this.postitAngZ[i] = (Math.random() - 0.5) * 22.0;
      } else {
        this.postitVelY[i] += 2.2 * gust;
        this.postitAngY[i] += (Math.random() - 0.5) * 16.0;
      }
    }
  }

  /**
   * Atualização principal a cada quadro a 60 FPS (Zero GC).
   * Processa física de papéis, caixas, xícaras, o café na calcinha, roombas com display LED matrix, portas e grelhas.
   * Retorna os eventos e impulsos de interação calculados para cada kart.
   */
  public update(dt: number, karts: KartInteractiveInfo[]): readonly KartInteractionOutput[] {
    if (dt <= 0) return this.kartOutputs;
    this.clock += dt;

    const numKarts = karts.length;

    while (this.kartOutputs.length < numKarts) {
      this.kartOutputs.push({
        boost: false,
        bonk: false,
        spin: false,
        slip: false,
      });
    }

    for (let k = 0; k < numKarts; k++) {
      const out = this.kartOutputs[k];
      out.boost = false;
      out.boostSpeed = undefined;
      out.boostDuration = undefined;
      out.aromaBoost = false;
      out.airCushionLift = undefined;
      out.bonk = false;
      out.bonkImpulse = undefined;
      out.spin = false;
      out.spinUntil = undefined;
      out.slip = false;
      out.slipUntil = undefined;
      out.speedMultiplier = undefined;
      out.shake = undefined;
      out.soundCue = undefined;
    }

    // 1. Checagem de passagem dos karts perto das mesas de papéis
    const numDesks = this.desks.length;
    for (let d = 0; d < numDesks; d++) {
      const desk = this.desks[d];
      for (let k = 0; k < numKarts; k++) {
        const kart = karts[k];
        if (kart.speed <= 10) continue;

        const dx = kart.pos.x - desk.x;
        const dz = kart.pos.z - desk.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < 3.8 * 3.8) {
          const dist = Math.sqrt(distSq);
          this.triggerDeskAirBlast(d, kart.pos.x, kart.pos.z, kart.speed, dist);
          break;
        }
      }
    }

    // 2. Física e animação dos papéis e post-its
    this.updatePapersPhysics(dt);
    this.updatePostitsPhysics(dt);

    // 3. Caixas de itens Galaxy e xícaras de café
    this.updateItemBoxes(dt);
    this.updateCoffeeCupsAndSteam(dt);

    // 4. Café Coado na Calcinha 2.0 (Vórtex de vento, estilingada e vapor volumétrico)
    this.updateCoffeeCalcinhas(dt, karts);

    // 5. Roombas da Firma com Expressão LED Matrix (Patrulha, rotação e colisão pinball)
    this.updateRoombas(dt, karts);

    // 6. Portas Automáticas de Vidro (Ciclos de abertura e bloqueio físico)
    this.updateAutomaticDoors(dt, karts);

    // 7. Grelhas de Ventilação no Chão (Almofada de ar e partículas)
    this.updateAirVents(dt, karts);

    // 8. Redemoinhos de Areia do Deserto
    this.updateDustDevils(dt, karts);

    // 9. Urubus do Deserto (Planando e Rasantes)
    this.updateVultures(dt, karts);

    // 10. Cactos Quebráveis na Borda da Pista
    this.updateCacti(dt, karts);

    // 11. Poço de Lama no Fundo do Cânion
    this.updateMudPit(dt, karts);

    return this.kartOutputs;
  }

  // ==========================================================================
  // ATUALIZAÇÃO: CAFÉ COADO NA CALCINHA 2.0
  // ==========================================================================
  private updateCoffeeCalcinhas(dt: number, karts: KartInteractiveInfo[]): void {
    const numCalcinhas = this._coffeeCalcinhas.length;
    const numKarts = karts.length;

    for (let c = 0; c < numCalcinhas; c++) {
      const item = this._coffeeCalcinhas[c];

      if (item.boostCooldown > 0) {
        item.boostCooldown -= dt;
      }

      // 1. Detecção de passagem e proximidade dos karts
      for (let k = 0; k < numKarts; k++) {
        const kart = karts[k];
        const dx = kart.pos.x - item.pos.x;
        const dz = kart.pos.z - item.pos.z;
        const distSq = dx * dx + dz * dz;

        // Vórtex de ar: Karts a > 10 m/s fazem a calcinha balançar intensamente
        if (kart.speed > 10 && distSq < 4.8 * 4.8) {
          const dist = Math.sqrt(distSq);
          const gust = (1.0 - dist / 4.8) * Math.min(2.5, (kart.speed - 10) * 0.15);
          item.swingVelocity += gust * 8.5;
        }

        // Proximidade extrema / raspar (< 2.2m): estilingada elástica (BOING!) e mini boost de café
        if (distSq < 2.2 * 2.2 && item.boostCooldown <= 0) {
          item.boostCooldown = 3.0;
          item.elasticVelocity = 14.0;
          item.swingVelocity += (Math.random() - 0.5) * 12.0;

          this.triggerCoffeeSplash(item.pos.x + 0.18, item.pos.z);

          const out = this.kartOutputs[k];
          out.boost = true;
          out.boostSpeed = 24.5;
          out.boostDuration = 1.25;
          out.aromaBoost = true;
          out.soundCue = "coffee_slingshot";
        }
      }

      // 2. Física pendular elástica da calcinha (amortecimento harmônico suave)
      const springK = 32.0;
      const damping = 3.2;
      item.swingVelocity += (-springK * item.swingAngle - damping * item.swingVelocity) * dt;
      item.swingAngle += item.swingVelocity * dt;

      const idleSway = Math.sin(this.clock * 2.5 + item.id) * 0.04;
      item.calcinhaPivot.rotation.z = item.swingAngle + idleSway;
      item.calcinhaPivot.rotation.x = item.swingAngle * 0.35;

      // 3. Squash & Stretch elástico da calcinha (estilingada)
      const stretchK = 55.0;
      const stretchDamp = 6.0;
      item.elasticVelocity += (-stretchK * item.elasticStretch - stretchDamp * item.elasticVelocity) * dt;
      item.elasticStretch += item.elasticVelocity * dt;

      const scaleY = 1.0 + item.elasticStretch;
      const scaleXZ = 1.0 / Math.max(0.6, Math.sqrt(scaleY));
      item.calcinhaMesh.scale.set(scaleXZ, scaleY, scaleXZ);

      // Fio contínuo de café cartoon: oscilação na espessura
      const streamPulse = 1.0 + Math.sin(this.clock * 14.0) * 0.12;
      item.streamMesh.scale.set(streamPulse, 1.0, streamPulse);

      // Leve ondulação na superfície do café da caneca
      if (item.mugLiquidMesh) {
        const liquidWave = 1.0 + Math.sin(this.clock * 8.0) * 0.04;
        item.mugLiquidMesh.scale.set(liquidWave, liquidWave, liquidWave);
      }

      // Nuvenzinhas de vapor cartoon volumétricas estilo metaball/esferas conectadas
      if (item.mugSteamCluster) {
        const t = this.clock * 2.2 + item.id;
        const bob = Math.sin(t) * 0.03;
        item.mugSteamCluster.position.y = 0.22 + bob;
        const puffScale = 1.0 + Math.sin(t * 1.5) * 0.08;
        item.mugSteamCluster.scale.set(puffScale, puffScale * 1.08, puffScale);
        item.mugSteamCluster.rotation.y += dt * 0.8;
      }
    }

    this.updateCoffeeSplashes(dt);
  }

  /** Dispara respingos e gotículas de café cartoon no chão ao redor da mesa */
  private triggerCoffeeSplash(centerX: number, centerZ: number): void {
    if (!this.splashMesh) return;

    for (let i = 0; i < this.MAX_SPLASH_DROPS; i++) {
      this.splashAge[i] = 0;
      this.splashLife[i] = 0.55 + Math.random() * 0.25;
      this.splashPosX[i] = centerX;
      this.splashPosY[i] = 0.85;
      this.splashPosZ[i] = centerZ;

      const angle = Math.random() * Math.PI * 2;
      const speed = 2.4 + Math.random() * 2.6;
      this.splashVelX[i] = Math.cos(angle) * speed;
      this.splashVelZ[i] = Math.sin(angle) * speed;
      this.splashVelY[i] = 1.8 + Math.random() * 2.2;
    }
  }

  /** Atualização da física das gotículas de café */
  private updateCoffeeSplashes(dt: number): void {
    if (!this.splashMesh) return;

    for (let i = 0; i < this.MAX_SPLASH_DROPS; i++) {
      if (this.splashAge[i] >= this.splashLife[i]) {
        _mat4A.makeScale(0, 0, 0);
        this.splashMesh.setMatrixAt(i, _mat4A);
        continue;
      }

      this.splashAge[i] += dt;
      const u = this.splashAge[i] / this.splashLife[i];

      this.splashVelY[i] -= 12.0 * dt;
      this.splashPosX[i] += this.splashVelX[i] * dt;
      this.splashPosY[i] += this.splashVelY[i] * dt;
      this.splashPosZ[i] += this.splashVelZ[i] * dt;

      if (this.splashPosY[i] <= 0.02) {
        this.splashPosY[i] = 0.02;
        this.splashVelX[i] *= 0.8;
        this.splashVelZ[i] *= 0.8;
      }

      const scale = (1.0 - u) * 1.2;
      _vecA.set(this.splashPosX[i], this.splashPosY[i], this.splashPosZ[i]);
      _scaleVec.set(scale, scale * 0.7, scale);
      _mat4A.compose(_vecA, _quatA.identity(), _scaleVec);
      this.splashMesh.setMatrixAt(i, _mat4A);
    }

    this.splashMesh.instanceMatrix.needsUpdate = true;
  }

  // ==========================================================================
  // ATUALIZAÇÃO: ASPIRADOR ROBÔ ("ROOMBA DA FIRMA" COM LED MATRIX FACE)
  // ==========================================================================
  private updateRoombas(dt: number, karts: KartInteractiveInfo[]): void {
    const numRoombas = this._roombas.length;
    const numKarts = karts.length;

    for (let r = 0; r < numRoombas; r++) {
      const roomba = this._roombas[r];

      // Vassourinhas dianteiras girando velozmente
      roomba.brushL.rotation.y += dt * 18.0;
      roomba.brushR.rotation.y -= dt * 18.0;

      // Bobbing sutil do cone de trânsito em cima
      roomba.coneGroup.rotation.z = Math.sin(this.clock * 6.0) * 0.04;

      const collisionRadius = roomba.radius + 0.65;

      // Checa se algum kart passou veloz (> 10 m/s) a menos de 2.5m (deixa o Roomba surpreso!)
      for (let k = 0; k < numKarts; k++) {
        const kart = karts[k];
        if (kart.speed > 10) {
          const dx = kart.pos.x - roomba.pos.x;
          const dz = kart.pos.z - roomba.pos.z;
          const distSq = dx * dx + dz * dz;
          if (distSq < 2.5 * 2.5 && distSq >= collisionRadius * collisionRadius && roomba.bonkTimer <= 0) {
            roomba.surprisedTimer = 1.0;
            break;
          }
        }
      }

      // 1. Gerenciamento de Expressão da Matriz de Pontos LED
      if (roomba.bonkTimer > 0) {
        roomba.bonkTimer -= dt;
        roomba.emotion = "bonked";

        if (this.roombaFaces && roomba.ledMat.map !== this.roombaFaces.bonked) {
          roomba.ledMat.map = this.roombaFaces.bonked;
          roomba.ledMat.needsUpdate = true;
        }

        // Pisca LED vermelho furioso a 14 Hz
        const blink = Math.sin(this.clock * 28.0) > 0;
        roomba.ledMat.color.setHex(blink ? 0xffffff : 0x882222);

        // Retorna o squash do impacto suavemente ao normal
        roomba.squashFactor += (1.0 - roomba.squashFactor) * (1.0 - Math.exp(-dt * 8.0));
        roomba.group.scale.set(roomba.squashFactor, 1.0 / roomba.squashFactor, roomba.squashFactor);
      } else if (roomba.surprisedTimer > 0) {
        roomba.surprisedTimer -= dt;
        roomba.emotion = "surprised";

        if (this.roombaFaces && roomba.ledMat.map !== this.roombaFaces.surprised) {
          roomba.ledMat.map = this.roombaFaces.surprised;
          roomba.ledMat.needsUpdate = true;
        }

        const pulse = 0.8 + Math.sin(this.clock * 12.0) * 0.2;
        roomba.ledMat.color.setRGB(pulse, pulse, pulse);
        roomba.group.scale.set(1, 1, 1);
      } else {
        roomba.emotion = "happy";

        if (this.roombaFaces && roomba.ledMat.map !== this.roombaFaces.happy) {
          roomba.ledMat.map = this.roombaFaces.happy;
          roomba.ledMat.needsUpdate = true;
        }

        const pulse = 0.75 + Math.sin(this.clock * 4.0) * 0.25;
        roomba.ledMat.color.setRGB(pulse, pulse, pulse);
        roomba.group.scale.set(1, 1, 1);
      }

      // 2. Movimento autônomo de patrulha vai-e-vem
      const segDx = roomba.patrolEnd.x - roomba.patrolStart.x;
      const segDz = roomba.patrolEnd.z - roomba.patrolStart.z;
      const segLen = Math.hypot(segDx, segDz) || 1;

      const stepT = (roomba.patrolSpeed * dt) / segLen;
      roomba.patrolT += stepT * roomba.patrolDir;

      // Inversão nas pontas da rota com giro suave de 180°
      if (roomba.patrolT >= 1.0) {
        roomba.patrolT = 1.0;
        roomba.patrolDir = -1;
        roomba.heading = Math.atan2(-segDx, -segDz);
        roomba.group.rotation.y = roomba.heading;
      } else if (roomba.patrolT <= 0) {
        roomba.patrolT = 0;
        roomba.patrolDir = 1;
        roomba.heading = Math.atan2(segDx, segDz);
        roomba.group.rotation.y = roomba.heading;
      }

      roomba.pos.x = roomba.patrolStart.x + segDx * roomba.patrolT;
      roomba.pos.z = roomba.patrolStart.z + segDz * roomba.patrolT;
      roomba.group.position.set(roomba.pos.x, 0, roomba.pos.z);

      // 3. Colisão cartoon tipo pinball com karts
      for (let k = 0; k < numKarts; k++) {
        const kart = karts[k];
        const dx = kart.pos.x - roomba.pos.x;
        const dz = kart.pos.z - roomba.pos.z;
        const dist = Math.hypot(dx, dz);

        if (dist < collisionRadius && dist > 0.001) {
          const nx = dx / dist;
          const nz = dz / dist;

          const out = this.kartOutputs[k];
          out.bonk = true;
          out.spin = true;
          out.bonkImpulse = { x: nx * 14.5, z: nz * 14.5 };
          out.soundCue = "roomba_honk";

          // Roomba reage indignado: squasha, apita e inverte a rota imediatamente!
          roomba.bonkTimer = 0.85;
          roomba.squashFactor = 1.45;
          roomba.emotion = "bonked";
          roomba.surprisedTimer = 0;
          if (this.roombaFaces && roomba.ledMat.map !== this.roombaFaces.bonked) {
            roomba.ledMat.map = this.roombaFaces.bonked;
            roomba.ledMat.needsUpdate = true;
          }
          roomba.patrolDir = (roomba.patrolDir === 1 ? -1 : 1);
          roomba.heading = (roomba.heading + Math.PI) % (Math.PI * 2);
          roomba.group.rotation.y = roomba.heading;
        }
      }
    }
  }

  // ==========================================================================
  // ATUALIZAÇÃO: PORTAS AUTOMÁTICAS DE VIDRO
  // ==========================================================================
  private updateAutomaticDoors(dt: number, karts: KartInteractiveInfo[]): void {
    const numDoors = this._automaticDoors.length;
    const numKarts = karts.length;

    for (let d = 0; d < numDoors; d++) {
      const door = this._automaticDoors[d];

      door.stateTimer += dt;

      if (door.state === "open") {
        if (door.stateTimer >= door.durations.open) {
          door.state = "closing";
          door.stateTimer -= door.durations.open;
        } else {
          door.currentOpen = 1.0;
          door.sensorLedMat.color.setHex(0x22c55e);
        }
      }

      if (door.state === "closing") {
        if (door.stateTimer >= door.durations.closing) {
          door.state = "closed";
          door.stateTimer -= door.durations.closing;
          door.currentOpen = 0.0;
          door.sensorLedMat.color.setHex(0xef4444);
        } else {
          const u = Math.min(1.0, Math.max(0.02, door.stateTimer / door.durations.closing));
          door.currentOpen = 1.0 - (u * u * (3 - 2 * u));
          const blink = Math.sin(this.clock * 20.0) > 0;
          door.sensorLedMat.color.setHex(blink ? 0xef4444 : 0x450a0a);
        }
      }

      if (door.state === "closed") {
        if (door.stateTimer >= door.durations.closed) {
          door.state = "opening";
          door.stateTimer -= door.durations.closed;
        } else {
          door.currentOpen = 0.0;
          door.sensorLedMat.color.setHex(0xef4444);
        }
      }

      if (door.state === "opening") {
        if (door.stateTimer >= door.durations.opening) {
          door.state = "open";
          door.stateTimer -= door.durations.opening;
          door.currentOpen = 1.0;
          door.sensorLedMat.color.setHex(0x22c55e);
        } else {
          const u = Math.min(1.0, Math.max(0.02, door.stateTimer / door.durations.opening));
          door.currentOpen = u * u * (3 - 2 * u);
          const blink = Math.sin(this.clock * 20.0) > 0;
          door.sensorLedMat.color.setHex(blink ? 0x22c55e : 0x052e16);
        }
      }

      if (door.shudder > 0) {
        door.shudder *= Math.exp(-dt * 6.5);
      }
      const shudderVib = Math.sin(this.clock * 42.0) * door.shudder * 0.12;

      const slideX = door.slideDistance * door.currentOpen;
      door.leftDoor.position.x = -door.halfWidth * 0.5 - slideX;
      door.rightDoor.position.x = door.halfWidth * 0.5 + slideX;
      door.leftDoor.position.z = -0.02 + shudderVib;
      door.rightDoor.position.z = 0.02 - shudderVib;

      if (door.currentOpen < 0.65) {
        const cosH = Math.cos(door.heading);
        const sinH = Math.sin(door.heading);

        for (let k = 0; k < numKarts; k++) {
          const kart = karts[k];

          const dx = kart.pos.x - door.pos.x;
          const dz = kart.pos.z - door.pos.z;
          const localX = dx * cosH + dz * sinH;
          const localZ = -dx * sinH + dz * cosH;

          if (Math.abs(localZ) < 0.65 && Math.abs(localX) < door.halfWidth + 0.2) {
            const out = this.kartOutputs[k];
            out.bonk = true;
            out.soundCue = "door_bonk";

            const pushSign = localZ >= 0 ? 1 : -1;
            out.bonkImpulse = {
              x: -sinH * pushSign * 11.5,
              z: cosH * pushSign * 11.5,
            };

            door.shudder = 0.24;
          }
        }
      }
    }
  }

  // ==========================================================================
  // ATUALIZAÇÃO: GRELHAS DE VENTILAÇÃO NO CHÃO (AIR CUSHION BOOST VENTS)
  // ==========================================================================
  private updateAirVents(dt: number, karts: KartInteractiveInfo[]): void {
    const numVents = this._airVents.length;
    const numKarts = karts.length;

    for (let v = 0; v < numVents; v++) {
      const vent = this._airVents[v];

      const cosH = Math.cos(vent.heading);
      const sinH = Math.sin(vent.heading);
      let kartOverVent = false;

      for (let k = 0; k < numKarts; k++) {
        const kart = karts[k];
        const dx = kart.pos.x - vent.pos.x;
        const dz = kart.pos.z - vent.pos.z;

        const localX = dx * cosH + dz * sinH;
        const localZ = -dx * sinH + dz * cosH;

        if (Math.abs(localX) <= vent.width * 0.52 && Math.abs(localZ) <= vent.length * 0.52) {
          kartOverVent = true;

          const out = this.kartOutputs[k];
          out.airCushionLift = vent.liftHeight;
          out.boost = true;
          out.boostSpeed = vent.boostStrength;
          out.boostDuration = 0.45;
          out.soundCue = "vent_woosh";
        }
      }

      const targetOpacity = kartOverVent ? 0.38 : 0.16 + Math.sin(this.clock * 4.0) * 0.05;
      vent.streamMat.opacity += (targetOpacity - vent.streamMat.opacity) * (1 - Math.exp(-dt * 6.0));
    }

    if (!this.ventParticleMesh) return;

    for (let i = 0; i < this.MAX_VENT_PARTICLES; i++) {
      const ventIdx = this.ventParticleVentIdx[i];
      if (ventIdx >= numVents) continue;

      const vent = this._airVents[ventIdx];
      this.ventParticleAge[i] += dt;

      if (this.ventParticleAge[i] >= this.ventParticleLife[i]) {
        this.ventParticleAge[i] = 0;
        this.ventParticleLife[i] = 0.7 + Math.random() * 0.4;

        const cosH = Math.cos(vent.heading);
        const sinH = Math.sin(vent.heading);
        const localX = (Math.random() - 0.5) * vent.width * 0.85;
        const localZ = (Math.random() - 0.5) * vent.length * 0.85;

        this.ventParticlePosX[i] = vent.pos.x + localX * cosH - localZ * sinH;
        this.ventParticlePosZ[i] = vent.pos.z + localX * sinH + localZ * cosH;
        this.ventParticlePosY[i] = vent.pos.y + 0.04;
        this.ventParticleVelY[i] = 2.6 + Math.random() * 1.6;
      }

      const u = this.ventParticleAge[i] / this.ventParticleLife[i];
      this.ventParticlePosY[i] += this.ventParticleVelY[i] * dt;

      const scale = Math.sin(u * Math.PI) * 1.1;
      _vecA.set(this.ventParticlePosX[i], this.ventParticlePosY[i], this.ventParticlePosZ[i]);
      _scaleVec.set(scale, scale, scale);
      _mat4A.compose(_vecA, _quatA.identity(), _scaleVec);
      this.ventParticleMesh.setMatrixAt(i, _mat4A);
    }

    this.ventParticleMesh.instanceMatrix.needsUpdate = true;
  }

  // ==========================================================================
  // ATUALIZAÇÃO: FÍSICA DE PAPÉIS SULFITE E POST-ITS
  // ==========================================================================
  private updatePapersPhysics(dt: number): void {
    if (!this.paperMesh) return;

    const drag = Math.pow(0.88, dt * 60);
    const rotDrag = Math.pow(0.92, dt * 60);

    for (let i = 0; i < this.totalPapers; i++) {
      const state = this.paperState[i];

      if (state === 1) {
        this.paperAge[i] += dt;
        const age = this.paperAge[i];

        this.paperVelX[i] *= drag;
        this.paperVelZ[i] *= drag;

        const flutterLift = Math.sin(age * this.paperFlutterFreq[i] + i) * 1.5;
        this.paperVelY[i] += (-4.2 + flutterLift) * dt;

        if (this.paperVelY[i] < -1.5) this.paperVelY[i] = -1.5;

        this.paperPosX[i] += this.paperVelX[i] * dt;
        this.paperPosY[i] += this.paperVelY[i] * dt;
        this.paperPosZ[i] += this.paperVelZ[i] * dt;

        this.paperRotX[i] += this.paperAngX[i] * dt;
        this.paperRotY[i] += this.paperAngY[i] * dt;
        this.paperRotZ[i] += this.paperAngZ[i] * dt;

        this.paperAngX[i] *= rotDrag;
        this.paperAngY[i] *= rotDrag;
        this.paperAngZ[i] *= rotDrag;

        const restY = this.paperRestY[i];
        if (this.paperPosY[i] <= restY + 0.08 && this.paperVelY[i] < 0 && age > 0.4) {
          this.paperState[i] = 2;
        }
      } else if (state === 2) {
        const restX = this.paperRestX[i];
        const restY = this.paperRestY[i];
        const restZ = this.paperRestZ[i];
        const restRotY = this.paperRestRotY[i];

        const lerpFactor = 1 - Math.exp(-dt * 4.5);
        this.paperPosX[i] += (restX - this.paperPosX[i]) * lerpFactor;
        this.paperPosY[i] += (restY - this.paperPosY[i]) * lerpFactor;
        this.paperPosZ[i] += (restZ - this.paperPosZ[i]) * lerpFactor;

        this.paperRotX[i] += (-Math.PI / 2 - this.paperRotX[i]) * lerpFactor;
        this.paperRotY[i] += (restRotY - this.paperRotY[i]) * lerpFactor;
        this.paperRotZ[i] += (0 - this.paperRotZ[i]) * lerpFactor;

        const dPos = Math.hypot(
          this.paperPosX[i] - restX,
          this.paperPosY[i] - restY,
          this.paperPosZ[i] - restZ,
        );
        if (dPos < 0.015) {
          this.paperPosX[i] = restX;
          this.paperPosY[i] = restY;
          this.paperPosZ[i] = restZ;
          this.paperRotX[i] = -Math.PI / 2;
          this.paperRotY[i] = restRotY;
          this.paperRotZ[i] = 0;
          this.paperState[i] = 0;
        }
      }

      _vecA.set(this.paperPosX[i], this.paperPosY[i], this.paperPosZ[i]);
      _eulerA.set(this.paperRotX[i], this.paperRotY[i], this.paperRotZ[i], "YXZ");
      _quatA.setFromEuler(_eulerA);
      _mat4A.compose(_vecA, _quatA, _scaleVec);
      this.paperMesh.setMatrixAt(i, _mat4A);
    }

    this.paperMesh.instanceMatrix.needsUpdate = true;
  }

  /** Atualização de voo caótico, flutter e repouso dos post-its coloridos */
  private updatePostitsPhysics(dt: number): void {
    if (!this.postitMesh) return;

    const drag = Math.pow(0.85, dt * 60);
    const rotDrag = Math.pow(0.90, dt * 60);

    for (let i = 0; i < this.totalPostits; i++) {
      const state = this.postitState[i];

      if (state === 1) {
        this.postitAge[i] += dt;
        const age = this.postitAge[i];

        this.postitVelX[i] *= drag;
        this.postitVelZ[i] *= drag;

        const flutterLift = Math.sin(age * this.postitFlutterFreq[i] + i) * 1.8;
        this.postitVelY[i] += (-3.8 + flutterLift) * dt;

        if (this.postitVelY[i] < -1.2) this.postitVelY[i] = -1.2;

        this.postitPosX[i] += this.postitVelX[i] * dt;
        this.postitPosY[i] += this.postitVelY[i] * dt;
        this.postitPosZ[i] += this.postitVelZ[i] * dt;

        this.postitRotX[i] += this.postitAngX[i] * dt;
        this.postitRotY[i] += this.postitAngY[i] * dt;
        this.postitRotZ[i] += this.postitAngZ[i] * dt;

        this.postitAngX[i] *= rotDrag;
        this.postitAngY[i] *= rotDrag;
        this.postitAngZ[i] *= rotDrag;

        const restY = this.postitRestY[i];
        if (this.postitPosY[i] <= restY + 0.08 && this.postitVelY[i] < 0 && age > 0.4) {
          this.postitState[i] = 2;
        }
      } else if (state === 2) {
        const restX = this.postitRestX[i];
        const restY = this.postitRestY[i];
        const restZ = this.postitRestZ[i];
        const restRotY = this.postitRestRotY[i];

        const lerpFactor = 1 - Math.exp(-dt * 4.5);
        this.postitPosX[i] += (restX - this.postitPosX[i]) * lerpFactor;
        this.postitPosY[i] += (restY - this.postitPosY[i]) * lerpFactor;
        this.postitPosZ[i] += (restZ - this.postitPosZ[i]) * lerpFactor;

        this.postitRotX[i] += (-Math.PI / 2 - this.postitRotX[i]) * lerpFactor;
        this.postitRotY[i] += (restRotY - this.postitRotY[i]) * lerpFactor;
        this.postitRotZ[i] += (0 - this.postitRotZ[i]) * lerpFactor;

        const dPos = Math.hypot(
          this.postitPosX[i] - restX,
          this.postitPosY[i] - restY,
          this.postitPosZ[i] - restZ,
        );
        if (dPos < 0.015) {
          this.postitPosX[i] = restX;
          this.postitPosY[i] = restY;
          this.postitPosZ[i] = restZ;
          this.postitRotX[i] = -Math.PI / 2;
          this.postitRotY[i] = restRotY;
          this.postitRotZ[i] = 0;
          this.postitState[i] = 0;
        }
      }

      _vecA.set(this.postitPosX[i], this.postitPosY[i], this.postitPosZ[i]);
      _eulerA.set(this.postitRotX[i], this.postitRotY[i], this.postitRotZ[i], "YXZ");
      _quatA.setFromEuler(_eulerA);
      _mat4A.compose(_vecA, _quatA, _scaleVec);
      this.postitMesh.setMatrixAt(i, _mat4A);
    }

    this.postitMesh.instanceMatrix.needsUpdate = true;
  }

  /** Caixas de Itens estilo Super Mario Galaxy */
  private updateItemBoxes(dt: number): void {
    const t = this.clock;

    for (const box of this.managedBoxes.values()) {
      if (!box.mesh.visible) continue;

      const bob = Math.sin(t * 2.4 + box.phase) * 0.12;
      box.mesh.position.y = box.baseY + bob;

      const breath = 1.0 + Math.sin(t * 3.4 + box.phase) * 0.045;

      if (box.innerBox) {
        box.innerBox.scale.set(breath, breath, breath);

        box.yaw += dt * 2.3;
        const tiltPitch = 0.22 + Math.sin(t * 1.5 + box.phase) * 0.14;
        const tiltRoll = Math.cos(t * 1.2 + box.phase) * 0.16;

        _eulerA.set(tiltPitch, box.yaw, tiltRoll, "YXZ");
        box.innerBox.quaternion.setFromEuler(_eulerA);
      } else {
        box.yaw += dt * 2.3;
        const tiltPitch = 0.22 + Math.sin(t * 1.5 + box.phase) * 0.14;
        const tiltRoll = Math.cos(t * 1.2 + box.phase) * 0.16;
        _eulerA.set(tiltPitch, box.yaw, tiltRoll, "YXZ");
        box.mesh.quaternion.setFromEuler(_eulerA);
      }

      if (box.halo && box.haloMat) {
        const pulse = 0.45 + Math.sin(t * 4.2 + box.phase) * 0.25;
        box.haloMat.opacity = pulse;
        box.halo.rotation.z -= dt * 1.1;
        const haloScale = breath * (1.0 + Math.sin(t * 4.2 + box.phase) * 0.08);
        box.halo.scale.set(haloScale, haloScale, haloScale);
      }
    }
  }

  /** Xícaras de Café, ondas de aroma e vapor cartoon */
  private updateCoffeeCupsAndSteam(dt: number): void {
    const t = this.clock;
    const cupList = Array.from(this.managedCups.values());
    const numCups = cupList.length;

    for (let c = 0; c < numCups; c++) {
      const cup = cupList[c];
      if (!cup.group.visible) continue;

      const bob = Math.sin(t * 2.8 + cup.phase) * 0.06;
      cup.group.position.y = cup.baseY + bob;
      cup.group.rotation.y += dt * 2.6;

      if (cup.aromaMesh && cup.aromaMat) {
        const aromaWave = (t * 1.2 + cup.phase) % 1.0;
        cup.aromaMesh.scale.setScalar(1.0 + aromaWave * 0.55);
        cup.aromaMat.opacity = Math.sin(aromaWave * Math.PI) * 0.5;
        cup.aromaMesh.position.y = 0.145 + aromaWave * 0.12;
      }
    }

    if (!this.steamMesh) return;

    for (let i = 0; i < this.totalSteamPuffs; i++) {
      const cupIdx = this.steamCupIdx[i];
      if (cupIdx >= numCups) {
        _mat4A.makeScale(0, 0, 0);
        this.steamMesh.setMatrixAt(i, _mat4A);
        continue;
      }

      const cup = cupList[cupIdx];
      if (!cup.group.visible) {
        _mat4A.makeScale(0, 0, 0);
        this.steamMesh.setMatrixAt(i, _mat4A);
        continue;
      }

      this.steamAge[i] += dt;
      if (this.steamAge[i] >= this.steamLife[i]) {
        this.steamAge[i] -= this.steamLife[i];
        this.steamSpiralAngle[i] = Math.random() * Math.PI * 2;
      }

      const u = this.steamAge[i] / this.steamLife[i];

      const angle = this.steamSpiralAngle[i] + u * Math.PI * 3.6;
      const radius = 0.03 + u * 0.09;
      const puffX = cup.group.position.x + Math.sin(angle) * radius;
      const puffZ = cup.group.position.z + Math.cos(angle) * radius;
      const puffY = cup.group.position.y + 0.16 + u * 0.72;

      let scale: number;
      if (u < 0.22) {
        scale = (u / 0.22) * 1.0;
      } else if (u < 0.65) {
        scale = 1.0 + ((u - 0.22) / 0.43) * 0.35;
      } else {
        scale = (1.0 - (u - 0.65) / 0.35) * 1.35;
      }

      const alpha = Math.sin(u * Math.PI);
      _colorA.setRGB(alpha, alpha, alpha);
      this.steamMesh.setColorAt(i, _colorA);

      _vecA.set(puffX, puffY, puffZ);
      _scaleVec.set(scale, scale, scale);
      _mat4A.compose(_vecA, _quatA.identity(), _scaleVec);
      this.steamMesh.setMatrixAt(i, _mat4A);
    }

    this.steamMesh.instanceMatrix.needsUpdate = true;
    if (this.steamMesh.instanceColor) this.steamMesh.instanceColor.needsUpdate = true;
  }

  // ==========================================================================
  // GETTERS PÚBLICOS DOS OBSTÁCULOS E ELEMENTOS
  // ==========================================================================

  // ==========================================================================
  // FASE 3: REDEMOINHOS DE AREIA (DUST DEVILS) & URUBUS RASANTES DO DESERTO
  // ==========================================================================

  private initDustBurstParticles(): void {
    if (!this.scene) return;
    this.dustBurstPosX = new Float32Array(this.MAX_DUST_DEVIL_BURSTS);
    this.dustBurstPosY = new Float32Array(this.MAX_DUST_DEVIL_BURSTS);
    this.dustBurstPosZ = new Float32Array(this.MAX_DUST_DEVIL_BURSTS);
    this.dustBurstVelX = new Float32Array(this.MAX_DUST_DEVIL_BURSTS);
    this.dustBurstVelY = new Float32Array(this.MAX_DUST_DEVIL_BURSTS);
    this.dustBurstVelZ = new Float32Array(this.MAX_DUST_DEVIL_BURSTS);
    this.dustBurstAge = new Float32Array(this.MAX_DUST_DEVIL_BURSTS);
    this.dustBurstLife = new Float32Array(this.MAX_DUST_DEVIL_BURSTS);

    const geo = new THREE.SphereGeometry(0.25, 7, 6);
    const mat = new THREE.MeshStandardMaterial({
      color: "#d9a566",
      transparent: true,
      opacity: 0.75,
      roughness: 0.9,
      depthWrite: false,
    });
    this.dustBurstMesh = new THREE.InstancedMesh(geo, mat, this.MAX_DUST_DEVIL_BURSTS);
    this.dustBurstMesh.frustumCulled = false;
    this.dustBurstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    _mat4A.makeScale(0, 0, 0);
    for (let i = 0; i < this.MAX_DUST_DEVIL_BURSTS; i++) {
      this.dustBurstMesh.setMatrixAt(i, _mat4A);
      this.dustBurstAge[i] = 999;
      this.dustBurstLife[i] = 1;
    }
    this.dustBurstMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.dustBurstMesh);
    this.disposables.push(geo, mat);
  }

  private triggerDustDevilBurst(x: number, y: number, z: number): void {
    if (!this.dustBurstMesh) return;
    const count = 16;
    for (let i = 0; i < count; i++) {
      const idx = (this.dustBurstIdx + i) % this.MAX_DUST_DEVIL_BURSTS;
      this.dustBurstPosX[idx] = x + (Math.random() - 0.5) * 0.6;
      this.dustBurstPosY[idx] = y + Math.random() * 0.8;
      this.dustBurstPosZ[idx] = z + (Math.random() - 0.5) * 0.6;

      const angle = Math.random() * Math.PI * 2;
      const speed = 3.5 + Math.random() * 4.5;
      this.dustBurstVelX[idx] = Math.cos(angle) * speed;
      this.dustBurstVelY[idx] = 2.5 + Math.random() * 3.5;
      this.dustBurstVelZ[idx] = Math.sin(angle) * speed;

      this.dustBurstAge[idx] = 0;
      this.dustBurstLife[idx] = 0.5 + Math.random() * 0.35;
    }
    this.dustBurstIdx = (this.dustBurstIdx + count) % this.MAX_DUST_DEVIL_BURSTS;
  }

  private updateDustBurstParticles(dt: number): void {
    if (!this.dustBurstMesh) return;
    let needsUpdate = false;
    for (let i = 0; i < this.MAX_DUST_DEVIL_BURSTS; i++) {
      if (this.dustBurstAge[i] >= this.dustBurstLife[i]) {
        continue;
      }
      this.dustBurstAge[i] += dt;
      if (this.dustBurstAge[i] >= this.dustBurstLife[i]) {
        _mat4A.makeScale(0, 0, 0);
        this.dustBurstMesh.setMatrixAt(i, _mat4A);
        needsUpdate = true;
        continue;
      }

      this.dustBurstVelY[i] -= 9.8 * dt;
      this.dustBurstVelX[i] *= 0.95;
      this.dustBurstVelZ[i] *= 0.95;

      this.dustBurstPosX[i] += this.dustBurstVelX[i] * dt;
      this.dustBurstPosY[i] = Math.max(0.05, this.dustBurstPosY[i] + this.dustBurstVelY[i] * dt);
      this.dustBurstPosZ[i] += this.dustBurstVelZ[i] * dt;

      const progress = this.dustBurstAge[i] / this.dustBurstLife[i];
      const scale = (1.0 - progress) * (0.8 + Math.sin(progress * Math.PI) * 0.4);

      _vecA.set(this.dustBurstPosX[i], this.dustBurstPosY[i], this.dustBurstPosZ[i]);
      _scaleVec.set(scale, scale, scale);
      _mat4A.compose(_vecA, _quatA.identity(), _scaleVec);
      this.dustBurstMesh.setMatrixAt(i, _mat4A);
      needsUpdate = true;
    }
    if (needsUpdate) {
      this.dustBurstMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private initDustDevilsSystem(options?: TrackInteractiveOptions): void {
    if (options?.enableDustDevils === false) return;

    if (options?.dustDevilPositions && options.dustDevilPositions.length > 0) {
      for (let i = 0; i < options.dustDevilPositions.length; i++) {
        const d = options.dustDevilPositions[i];
        if (d.s !== undefined && this.track) {
          const at = pointAt(this.track, d.s);
          const y = heightAt(this.track, d.s);
          const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
          this.registerDustDevil({
            s: d.s,
            basePos: { x: at.pos.x, y, z: at.pos.z },
            normal: { x: nrm.x, z: nrm.z },
            halfWidth: d.halfWidth ?? at.halfWidth,
            speed: d.speed ?? (1.3 + (i % 3) * 0.25),
            phase: d.phase ?? (i * 1.57),
          });
        } else {
          this.registerDustDevil({
            s: d.s ?? 0,
            basePos: { x: d.x ?? 0, y: d.y ?? 0, z: d.z ?? 0 },
            normal: { x: 1, z: 0 },
            halfWidth: d.halfWidth ?? 6.5,
            speed: d.speed ?? (1.3 + (i % 3) * 0.25),
            phase: d.phase ?? (i * 1.57),
          });
        }
      }
      return;
    }

    // Padrão: 4 redemoinhos de areia posicionados ao longo dos setores abertos e dunas da pista (s ~180, ~280, ~440, ~610)
    const defaultS = [180, 280, 440, 610];
    if (this.track) {
      for (let i = 0; i < defaultS.length; i++) {
        const s = defaultS[i];
        const at = pointAt(this.track, s);
        const y = heightAt(this.track, s);
        const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
        this.registerDustDevil({
          s,
          basePos: { x: at.pos.x, y, z: at.pos.z },
          normal: { x: nrm.x, z: nrm.z },
          halfWidth: at.halfWidth,
          speed: 1.3 + (i % 3) * 0.25,
          phase: i * 1.57,
        });
      }
    } else {
      const fallbackPositions = [
        { x: 20, y: 0, z: 30, s: 180 },
        { x: 50, y: 0, z: 70, s: 280 },
        { x: 90, y: 0, z: 120, s: 440 },
        { x: 140, y: 0, z: 180, s: 610 },
      ];
      for (let i = 0; i < fallbackPositions.length; i++) {
        const p = fallbackPositions[i];
        this.registerDustDevil({
          s: p.s,
          basePos: { x: p.x, y: p.y, z: p.z },
          normal: { x: 1, z: 0 },
          halfWidth: 6.5,
          speed: 1.3 + (i % 3) * 0.25,
          phase: i * 1.57,
        });
      }
    }
  }

  public registerDustDevil(config: {
    s: number;
    basePos: { x: number; y: number; z: number };
    normal?: { x: number; z: number };
    halfWidth?: number;
    speed?: number;
    phase?: number;
  }): DustDevilObstacle {
    const group = new THREE.Group();
    group.name = `dust-devil-${config.s}`;
    group.position.set(config.basePos.x, config.basePos.y, config.basePos.z);

    // Visual: Geometrias cônicas/cilíndricas de areia translúcida em camadas (#d9a566, #e8c49a)
    const layers: THREE.Mesh[] = [];

    // Camada 1: Vórtice inferior estreito
    const geo0 = new THREE.CylinderGeometry(0.85, 0.35, 1.4, 16, 1, true);
    geo0.translate(0, 0.7, 0);
    const mat0 = new THREE.MeshStandardMaterial({
      color: "#d9a566",
      transparent: true,
      opacity: 0.65,
      roughness: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const layer0 = new THREE.Mesh(geo0, mat0);
    group.add(layer0);
    layers.push(layer0);

    // Camada 2: Funil intermediário em expansão
    const geo1 = new THREE.CylinderGeometry(1.65, 0.8, 1.8, 16, 1, true);
    geo1.translate(0, 2.0, 0);
    const mat1 = new THREE.MeshStandardMaterial({
      color: "#e8c49a",
      transparent: true,
      opacity: 0.55,
      roughness: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const layer1 = new THREE.Mesh(geo1, mat1);
    group.add(layer1);
    layers.push(layer1);

    // Camada 3: Flare superior amplo
    const geo2 = new THREE.CylinderGeometry(2.4, 1.5, 1.6, 16, 1, true);
    geo2.translate(0, 3.4, 0);
    const mat2 = new THREE.MeshStandardMaterial({
      color: "#d9a566",
      transparent: true,
      opacity: 0.45,
      roughness: 0.75,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const layer2 = new THREE.Mesh(geo2, mat2);
    group.add(layer2);
    layers.push(layer2);

    // Camada 4: Véu espiral externo
    const geo3 = new THREE.CylinderGeometry(2.65, 0.5, 4.4, 14, 1, true);
    geo3.translate(0, 2.2, 0);
    const mat3 = new THREE.MeshStandardMaterial({
      color: "#e8c49a",
      transparent: true,
      opacity: 0.35,
      roughness: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const layer3 = new THREE.Mesh(geo3, mat3);
    group.add(layer3);
    layers.push(layer3);

    // Poeira em espiral
    const satGeo = new THREE.SphereGeometry(0.18, 6, 5);
    const satMat = new THREE.MeshStandardMaterial({ color: "#d9a566", roughness: 0.9 });
    for (let i = 0; i < 6; i++) {
      const satMesh = new THREE.Mesh(satGeo, satMat);
      const theta = (i / 6) * Math.PI * 2;
      const h = 0.6 + i * 0.55;
      const r = 0.5 + (h / 4.4) * 1.8;
      satMesh.position.set(Math.cos(theta) * r, h, Math.sin(theta) * r);
      layer0.add(satMesh);
    }

    if (this.scene) {
      this.scene.add(group);
    }
    this.disposables.push(geo0, mat0, geo1, mat1, geo2, mat2, geo3, mat3, satGeo, satMat);

    const normal = config.normal ?? { x: 1, z: 0 };
    const obstacle: DustDevilObstacle = {
      id: this._dustDevils.length + 1,
      s: config.s,
      basePos: { ...config.basePos },
      currentPos: { ...config.basePos },
      normal: { x: normal.x, z: normal.z },
      halfWidth: config.halfWidth ?? 6.5,
      patrolSpeed: config.speed ?? 1.4,
      patrolPhase: config.phase ?? 0,
      group,
      layers,
      radius: 2.6,
      hitCooldown: 0,
    };

    this._dustDevils.push(obstacle);
    return obstacle;
  }

  private updateDustDevils(dt: number, karts: KartInteractiveInfo[]): void {
    const numDevils = this._dustDevils.length;
    const numKarts = karts.length;

    for (let i = 0; i < numDevils; i++) {
      const devil = this._dustDevils[i];
      if (devil.hitCooldown > 0) devil.hitCooldown -= dt;

      // 1. Rotação rápida contínua das camadas de areia e espiral
      devil.layers[0].rotation.y += dt * 10.0;
      devil.layers[1].rotation.y -= dt * 8.5;
      devil.layers[2].rotation.y += dt * 12.0;
      devil.layers[3].rotation.y -= dt * 6.5;

      // 2. Movimento: Patrulham a largura da pista oscilando lateralmente em onda senoidal suave:
      // lateral = Math.sin(time * speed + phase) * (halfWidth * 0.65)
      const lateral = Math.sin(this.clock * devil.patrolSpeed + devil.patrolPhase) * (devil.halfWidth * 0.65);
      devil.currentPos.x = devil.basePos.x + devil.normal.x * lateral;
      devil.currentPos.z = devil.basePos.z + devil.normal.z * lateral;
      devil.currentPos.y = devil.basePos.y;
      devil.group.position.set(devil.currentPos.x, devil.currentPos.y, devil.currentPos.z);

      // Leve inclinação cartoon com base na velocidade lateral
      const latVel = Math.cos(this.clock * devil.patrolSpeed + devil.patrolPhase) * devil.patrolSpeed;
      devil.group.rotation.z = -latVel * 0.05;

      // 3. Reatividade e Colisão: kart a menos de 2.6 metros do redemoinho
      for (let k = 0; k < numKarts; k++) {
        const kart = karts[k];
        const dx = kart.pos.x - devil.currentPos.x;
        const dz = kart.pos.z - devil.currentPos.z;
        const dist = Math.hypot(dx, dz);

        if (dist < devil.radius) {
          const out = this.kartOutputs[k];
          out.spin = true;
          out.bonk = true;
          out.spinUntil = 1200;
          out.speedMultiplier = 0.55;
          out.shake = 0.6;
          const nx = dist > 0.001 ? dx / dist : 1;
          const nz = dist > 0.001 ? dz / dist : 0;
          out.bonkImpulse = { x: (nx * 0.7 + devil.normal.x * 0.7) * 14.0, z: (nz * 0.7 + devil.normal.z * 0.7) * 14.0 };
          out.soundCue = "sand_tornado";

          if (devil.hitCooldown <= 0) {
            devil.hitCooldown = 0.5;
            this.triggerDustDevilBurst(devil.currentPos.x, devil.currentPos.y + 0.8, devil.currentPos.z);
          }
        }
      }
    }

    this.updateDustBurstParticles(dt);
  }

  // ==========================================================================
  // URUBUS DO DESERTO (VULTURES)
  // ==========================================================================

  private initFeatherParticles(): void {
    if (!this.scene) return;
    this.featherPosX = new Float32Array(this.MAX_FEATHER_PARTICLES);
    this.featherPosY = new Float32Array(this.MAX_FEATHER_PARTICLES);
    this.featherPosZ = new Float32Array(this.MAX_FEATHER_PARTICLES);
    this.featherVelX = new Float32Array(this.MAX_FEATHER_PARTICLES);
    this.featherVelY = new Float32Array(this.MAX_FEATHER_PARTICLES);
    this.featherVelZ = new Float32Array(this.MAX_FEATHER_PARTICLES);
    this.featherRotX = new Float32Array(this.MAX_FEATHER_PARTICLES);
    this.featherRotY = new Float32Array(this.MAX_FEATHER_PARTICLES);
    this.featherRotZ = new Float32Array(this.MAX_FEATHER_PARTICLES);
    this.featherAge = new Float32Array(this.MAX_FEATHER_PARTICLES);
    this.featherLife = new Float32Array(this.MAX_FEATHER_PARTICLES);

    const geo = new THREE.BoxGeometry(0.14, 0.02, 0.26);
    const mat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.9,
      metalness: 0.1,
    });
    this.featherMesh = new THREE.InstancedMesh(geo, mat, this.MAX_FEATHER_PARTICLES);
    this.featherMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.MAX_FEATHER_PARTICLES * 3), 3);
    this.featherMesh.frustumCulled = false;
    this.featherMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    _mat4A.makeScale(0, 0, 0);
    for (let i = 0; i < this.MAX_FEATHER_PARTICLES; i++) {
      this.featherMesh.setMatrixAt(i, _mat4A);
      this.featherAge[i] = 999;
      this.featherLife[i] = 1;
    }
    this.featherMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.featherMesh);
    this.disposables.push(geo, mat);
  }

  private triggerFeatherBurst(x: number, y: number, z: number): void {
    if (!this.featherMesh) return;
    const count = 12;
    const darkFeather = new THREE.Color("#1c1c1c");
    const lightFeather = new THREE.Color("#e5e0d8");
    for (let i = 0; i < count; i++) {
      const idx = (this.featherIdx + i) % this.MAX_FEATHER_PARTICLES;
      this.featherPosX[idx] = x + (Math.random() - 0.5) * 0.4;
      this.featherPosY[idx] = y + Math.random() * 0.5;
      this.featherPosZ[idx] = z + (Math.random() - 0.5) * 0.4;

      const angle = Math.random() * Math.PI * 2;
      const speed = 2.0 + Math.random() * 3.0;
      this.featherVelX[idx] = Math.cos(angle) * speed;
      this.featherVelY[idx] = 1.8 + Math.random() * 2.5;
      this.featherVelZ[idx] = Math.sin(angle) * speed;

      this.featherRotX[idx] = Math.random() * Math.PI * 2;
      this.featherRotY[idx] = Math.random() * Math.PI * 2;
      this.featherRotZ[idx] = Math.random() * Math.PI * 2;

      this.featherAge[idx] = 0;
      this.featherLife[idx] = 0.8 + Math.random() * 0.4;

      const col = (i % 2 === 0) ? darkFeather : lightFeather;
      this.featherMesh.setColorAt(idx, col);
    }
    if (this.featherMesh.instanceColor) {
      this.featherMesh.instanceColor.needsUpdate = true;
    }
    this.featherIdx = (this.featherIdx + count) % this.MAX_FEATHER_PARTICLES;
  }

  private updateFeatherParticles(dt: number): void {
    if (!this.featherMesh) return;
    let needsUpdate = false;
    for (let i = 0; i < this.MAX_FEATHER_PARTICLES; i++) {
      if (this.featherAge[i] >= this.featherLife[i]) continue;

      this.featherAge[i] += dt;
      if (this.featherAge[i] >= this.featherLife[i]) {
        _mat4A.makeScale(0, 0, 0);
        this.featherMesh.setMatrixAt(i, _mat4A);
        needsUpdate = true;
        continue;
      }

      this.featherVelY[i] -= 3.5 * dt;
      this.featherVelX[i] *= 0.94;
      this.featherVelZ[i] *= 0.94;

      this.featherPosX[i] += this.featherVelX[i] * dt + Math.sin(this.clock * 6.0 + i) * 0.02;
      this.featherPosY[i] = Math.max(0.04, this.featherPosY[i] + this.featherVelY[i] * dt);
      this.featherPosZ[i] += this.featherVelZ[i] * dt + Math.cos(this.clock * 6.0 + i) * 0.02;

      this.featherRotX[i] += dt * 4.0;
      this.featherRotY[i] += dt * 3.0;

      const progress = this.featherAge[i] / this.featherLife[i];
      const scale = (1.0 - progress * 0.5) * 1.0;

      _vecA.set(this.featherPosX[i], this.featherPosY[i], this.featherPosZ[i]);
      _quatA.setFromEuler(_eulerA.set(this.featherRotX[i], this.featherRotY[i], this.featherRotZ[i]));
      _scaleVec.set(scale, scale, scale);
      _mat4A.compose(_vecA, _quatA, _scaleVec);
      this.featherMesh.setMatrixAt(i, _mat4A);
      needsUpdate = true;
    }
    if (needsUpdate) {
      this.featherMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private initVulturesSystem(options?: TrackInteractiveOptions): void {
    if (options?.enableVultures === false) return;

    if (options?.vultureFlocks && options.vultureFlocks.length > 0) {
      for (let i = 0; i < options.vultureFlocks.length; i++) {
        const f = options.vultureFlocks[i];
        const trackS = f.trackS ?? (i === 0 ? 75 : i === 1 ? 380 : 620);
        let crossX = f.x ?? 0;
        let crossY = 0;
        let crossZ = f.z ?? 0;
        if (this.track) {
          const at = pointAt(this.track, trackS);
          crossX = at.pos.x;
          crossY = heightAt(this.track, trackS);
          crossZ = at.pos.z;
        }
        this.registerVultureFlock({
          id: i + 1,
          center: { x: f.x ?? crossX, y: f.y ?? 24, z: f.z ?? crossZ },
          trackS,
          crossingPoint: { x: crossX, y: crossY, z: crossZ },
          count: f.count ?? 3,
        });
      }
      return;
    }

    // Padrão: 3 bandos de urubus pretos planando em círculos térmicos no céu
    // sobre o maciço rochoso e o cânion
    const flockConfigs = [
      { trackS: 75, skyY: 22 },  // Cânion inicial
      { trackS: 380, skyY: 25 }, // Maciço rochoso
      { trackS: 620, skyY: 23 }, // Cânion da rampa / salto do abismo
    ];

    for (let i = 0; i < flockConfigs.length; i++) {
      const cfg = flockConfigs[i];
      let cx: number;
      let cy: number;
      let cz: number;
      if (this.track) {
        const at = pointAt(this.track, cfg.trackS);
        cx = at.pos.x;
        cy = heightAt(this.track, cfg.trackS);
        cz = at.pos.z;
      } else {
        const fallbacks = [
          { x: -45, y: 0, z: 40 },
          { x: -15, y: 0, z: 160 },
          { x: 80, y: 0, z: 60 },
        ];
        cx = fallbacks[i].x;
        cy = fallbacks[i].y;
        cz = fallbacks[i].z;
      }

      this.registerVultureFlock({
        id: i + 1,
        center: { x: cx, y: cfg.skyY, z: cz },
        trackS: cfg.trackS,
        crossingPoint: { x: cx, y: cy, z: cz },
        count: 3,
      });
    }
  }

  public registerVultureFlock(config: {
    id: number;
    center: { x: number; y: number; z: number };
    trackS: number;
    crossingPoint: { x: number; y: number; z: number };
    orbitSpeed?: number;
    count?: number;
  }): VultureFlock {
    const flock: VultureFlock = {
      id: config.id,
      center: { ...config.center },
      trackS: config.trackS,
      crossingPoint: { ...config.crossingPoint },
      orbitSpeed: config.orbitSpeed ?? 0.42,
      diveCooldown: 2.0,
      leadIdx: 0,
      vultures: [],
    };

    const count = config.count ?? 3;
    const bodyMat = new THREE.MeshStandardMaterial({
      color: "#181818",
      roughness: 0.85,
      metalness: 0.1,
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: "#8a2424",
      roughness: 0.7,
    });
    const beakMat = new THREE.MeshStandardMaterial({
      color: "#eab308",
      roughness: 0.35,
    });
    this.disposables.push(bodyMat, headMat, beakMat);

    for (let v = 0; v < count; v++) {
      const vGroup = new THREE.Group();
      vGroup.name = `vulture-${config.id}-${v}`;

      // Geometria estilizada: corpo preto fosco, bico curvado e asas abertas em V que planam suavemente
      const bodyGeo = new THREE.ConeGeometry(0.28, 1.1, 7);
      bodyGeo.rotateX(Math.PI / 2);
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      vGroup.add(bodyMesh);

      // Cabeça estilizada avermelhada
      const headGeo = new THREE.SphereGeometry(0.17, 7, 6);
      const headMesh = new THREE.Mesh(headGeo, headMat);
      headMesh.position.set(0, 0.1, 0.55);
      vGroup.add(headMesh);

      // Bico curvado amarelo/âmbar
      const beakGeo = new THREE.ConeGeometry(0.09, 0.32, 5);
      beakGeo.rotateX(Math.PI * 0.7);
      const beakMesh = new THREE.Mesh(beakGeo, beakMat);
      beakMesh.position.set(0, 0.04, 0.76);
      vGroup.add(beakMesh);

      // Cauda preta fosca
      const tailGeo = new THREE.BoxGeometry(0.32, 0.03, 0.38);
      tailGeo.translate(0, 0.04, -0.58);
      const tailMesh = new THREE.Mesh(tailGeo, bodyMat);
      vGroup.add(tailMesh);

      // Asas abertas em V conectadas a pivôs laterais
      const leftWing = new THREE.Group();
      leftWing.position.set(-0.2, 0.06, 0.05);
      const wingGeoL = new THREE.BoxGeometry(0.9, 0.03, 0.35);
      wingGeoL.translate(-0.45, 0, 0);
      const leftWingMesh = new THREE.Mesh(wingGeoL, bodyMat);
      leftWing.add(leftWingMesh);
      leftWing.rotation.z = -0.18; // Postura em V
      vGroup.add(leftWing);

      const rightWing = new THREE.Group();
      rightWing.position.set(0.2, 0.06, 0.05);
      const wingGeoR = new THREE.BoxGeometry(0.9, 0.03, 0.35);
      wingGeoR.translate(0.45, 0, 0);
      const rightWingMesh = new THREE.Mesh(wingGeoR, bodyMat);
      rightWing.add(rightWingMesh);
      rightWing.rotation.z = 0.18; // Postura em V
      vGroup.add(rightWing);

      this.disposables.push(bodyGeo, headGeo, beakGeo, tailGeo, wingGeoL, wingGeoR);

      if (this.scene) {
        this.scene.add(vGroup);
      }

      const orbitRadius = 11 + v * 3.5;
      const orbitPhase = (v * Math.PI * 2) / count;
      const initX = config.center.x + Math.cos(orbitPhase) * orbitRadius;
      const initZ = config.center.z + Math.sin(orbitPhase) * orbitRadius;
      const initY = config.center.y;
      vGroup.position.set(initX, initY, initZ);

      const vulture: VultureObstacle = {
        id: this._vultures.length + 1,
        flockId: config.id,
        group: vGroup,
        leftWing,
        rightWing,
        pos: { x: initX, y: initY, z: initZ },
        heading: orbitPhase + Math.PI / 2,
        orbitRadius,
        orbitPhase,
        state: "thermal",
        stateTimer: 0,
        diveDuration: 2.4,
        diveStartPos: new THREE.Vector3(initX, initY, initZ),
        diveCrossPos: new THREE.Vector3(config.crossingPoint.x, config.crossingPoint.y + 0.65, config.crossingPoint.z),
        diveEndPos: new THREE.Vector3(initX, initY, initZ),
      };

      flock.vultures.push(vulture);
      this._vultures.push(vulture);
    }

    this._vultureFlocks.push(flock);
    return flock;
  }

  private updateVultures(dt: number, karts: KartInteractiveInfo[]): void {
    const numFlocks = this._vultureFlocks.length;
    const numKarts = karts.length;

    for (let f = 0; f < numFlocks; f++) {
      const flock = this._vultureFlocks[f];
      if (flock.diveCooldown > 0) flock.diveCooldown -= dt;

      // Checa se algum kart se aproxima a menos de 55 metros do ponto de cruzamento da pista
      let kartNear = false;
      for (let k = 0; k < numKarts; k++) {
        const kart = karts[k];
        const dx = kart.pos.x - flock.crossingPoint.x;
        const dz = kart.pos.z - flock.crossingPoint.z;
        if (dx * dx + dz * dz < 55 * 55) {
          kartNear = true;
          break;
        }
      }

      // Se um kart se aproximar a menos de 55m, um dos urubus entra em estado de rasante (cross)
      if (kartNear && flock.diveCooldown <= 0) {
        const candidate = flock.vultures.find((v) => v.state === "thermal");
        if (candidate) {
          candidate.state = "cross";
          candidate.stateTimer = 0;
          candidate.diveDuration = 2.4;
          flock.diveCooldown = 5.5;

          candidate.diveStartPos.set(candidate.pos.x, candidate.pos.y, candidate.pos.z);
          candidate.diveCrossPos.set(flock.crossingPoint.x, flock.crossingPoint.y + 0.65, flock.crossingPoint.z);

          // Ponto de saída do mergulho: sobe de volta para o céu no lado oposto
          const fwdX = flock.crossingPoint.x - candidate.pos.x;
          const fwdZ = flock.crossingPoint.z - candidate.pos.z;
          const fwdLen = Math.hypot(fwdX, fwdZ) || 1;
          const exitX = flock.crossingPoint.x + (fwdX / fwdLen) * 28;
          const exitZ = flock.crossingPoint.z + (fwdZ / fwdLen) * 28;
          candidate.diveEndPos.set(exitX, flock.center.y, exitZ);
        }
      }

      // Atualiza cada urubu do bando
      for (let v = 0; v < flock.vultures.length; v++) {
        const vulture = flock.vultures[v];

        if (vulture.state === "thermal") {
          // Planando em círculos térmicos suaves no céu
          const angle = this.clock * flock.orbitSpeed + vulture.orbitPhase;
          vulture.pos.x = flock.center.x + Math.cos(angle) * vulture.orbitRadius;
          vulture.pos.z = flock.center.z + Math.sin(angle) * vulture.orbitRadius;
          vulture.pos.y = flock.center.y + Math.sin(this.clock * 0.9 + vulture.id) * 1.4;
          vulture.heading = angle + Math.PI / 2;

          vulture.group.position.set(vulture.pos.x, vulture.pos.y, vulture.pos.z);
          vulture.group.rotation.y = vulture.heading;
          vulture.group.rotation.x = 0;
          vulture.group.rotation.z = Math.sin(angle) * 0.16; // banking suave na térmica

          // Asas abertas em V com leve ondulação aerodinâmica
          const soarFlap = Math.sin(this.clock * 1.5 + vulture.id) * 0.05;
          vulture.leftWing.rotation.z = -0.18 + soarFlap;
          vulture.rightWing.rotation.z = 0.18 - soarFlap;
        } else if (vulture.state === "cross") {
          // Estado de rasante: mergulho rápido rente ao asfalto cortando a pista na frente dos pilotos!
          vulture.stateTimer += dt;
          const u = Math.min(1.0, vulture.stateTimer / vulture.diveDuration);

          // Posição horizontal interpolada (cortando a pista)
          const curX = vulture.diveStartPos.x + (vulture.diveEndPos.x - vulture.diveStartPos.x) * u;
          const curZ = vulture.diveStartPos.z + (vulture.diveEndPos.z - vulture.diveStartPos.z) * u;

          // Parábola vertical: mergulho rente ao asfalto em u = 0.5 (Y ~ 0.65m), subindo para a saída
          const baseLerpY = vulture.diveStartPos.y + (vulture.diveEndPos.y - vulture.diveStartPos.y) * u;
          const dipDepth = (flock.center.y - vulture.diveCrossPos.y);
          const curY = baseLerpY - 4 * u * (1 - u) * dipDepth;

          const dx = vulture.diveEndPos.x - vulture.diveStartPos.x;
          const dz = vulture.diveEndPos.z - vulture.diveStartPos.z;
          vulture.heading = Math.atan2(dx, dz);

          vulture.pos.x = curX;
          vulture.pos.y = curY;
          vulture.pos.z = curZ;
          vulture.group.position.set(curX, curY, curZ);
          vulture.group.rotation.y = vulture.heading;

          // Mergulho e subida (pitch)
          const pitch = (0.5 - u) * 0.7;
          vulture.group.rotation.x = pitch;
          vulture.group.rotation.z = 0;

          // Asas ligeiramente recolhidas no mergulho veloz
          vulture.leftWing.rotation.z = -0.32;
          vulture.rightWing.rotation.z = 0.32;

          // Colisão com a ave rasante: se kart colidir rente ao chão (< 2.5m)
          if (curY < 2.5) {
            for (let k = 0; k < numKarts; k++) {
              const kart = karts[k];
              const kx = kart.pos.x - curX;
              const kz = kart.pos.z - curZ;
              const ky = (kart.y ?? 0) - curY;
              const distSq = kx * kx + kz * kz;

              if (distSq < 2.5 * 2.5 && Math.abs(ky) < 2.2) {
                // A ave bate as asas assustada fugindo para o céu (startle)
                // e causa um solavanco/skid no kart com faíscas e penas/poeira
                vulture.state = "startle";
                vulture.stateTimer = 0;

                const out = this.kartOutputs[k];
                out.bonk = true;
                out.spin = true;
                out.spinUntil = 900;
                out.slip = true;
                out.slipUntil = 800;
                out.speedMultiplier = 0.75;
                out.shake = 0.5;
                out.bonkImpulse = { x: (Math.random() - 0.5) * 12.0, z: (Math.random() - 0.5) * 12.0 };
                out.soundCue = "vulture_startle";

                this.triggerFeatherBurst(curX, curY, curZ);
                this.triggerDustDevilBurst(curX, curY, curZ);
                break;
              }
            }
          }

          if (u >= 1.0) {
            vulture.state = "thermal";
            vulture.group.rotation.x = 0;
          }
        } else if (vulture.state === "startle") {
          // Bate as asas assustada fugindo para o céu
          vulture.stateTimer += dt;
          const flap = Math.sin(vulture.stateTimer * 26.0) * 0.85;
          vulture.leftWing.rotation.z = flap;
          vulture.rightWing.rotation.z = -flap;

          vulture.pos.y += 18.0 * dt;
          vulture.pos.x += Math.sin(vulture.heading) * 6.0 * dt;
          vulture.pos.z += Math.cos(vulture.heading) * 6.0 * dt;

          vulture.group.position.set(vulture.pos.x, vulture.pos.y, vulture.pos.z);
          vulture.group.rotation.x = -0.55; // empinando o nariz para o céu

          if (vulture.pos.y >= flock.center.y) {
            vulture.state = "thermal";
            vulture.group.rotation.x = 0;
          }
        }
      }
    }

    this.updateFeatherParticles(dt);
  }

  public get monitoredDesks(): readonly DeskIsland[] {
    return this.desks;
  }

  public get activeBoxes(): readonly ManagedItemBox[] {
    return Array.from(this.managedBoxes.values());
  }

  public get activeCups(): readonly ManagedCup[] {
    return Array.from(this.managedCups.values());
  }

  public get coffeeCalcinhas(): readonly CoffeeCalcinhaObstacle[] {
    return this._coffeeCalcinhas;
  }

  public get roombas(): readonly RoombaObstacle[] {
    return this._roombas;
  }

  public get automaticDoors(): readonly AutomaticDoorObstacle[] {
    return this._automaticDoors;
  }

  public get airVents(): readonly AirVentObstacle[] {
    return this._airVents;
  }

  public get dustDevils(): readonly DustDevilObstacle[] {
    return this._dustDevils;
  }

  public get vultures(): readonly VultureObstacle[] {
    return this._vultures;
  }

  public get vultureFlocks(): readonly VultureFlock[] {
    return this._vultureFlocks;
  }

  // ==========================================================================
  // CACTOS QUEBRÁVEIS / INTERATIVOS NA BORDA DA PISTA
  // ==========================================================================

  private initCactusParticles(): void {
    if (!this.scene) return;
    this.cactusPosX = new Float32Array(this.MAX_CACTUS_PARTICLES);
    this.cactusPosY = new Float32Array(this.MAX_CACTUS_PARTICLES);
    this.cactusPosZ = new Float32Array(this.MAX_CACTUS_PARTICLES);
    this.cactusVelX = new Float32Array(this.MAX_CACTUS_PARTICLES);
    this.cactusVelY = new Float32Array(this.MAX_CACTUS_PARTICLES);
    this.cactusVelZ = new Float32Array(this.MAX_CACTUS_PARTICLES);
    this.cactusRotX = new Float32Array(this.MAX_CACTUS_PARTICLES);
    this.cactusRotY = new Float32Array(this.MAX_CACTUS_PARTICLES);
    this.cactusRotZ = new Float32Array(this.MAX_CACTUS_PARTICLES);
    this.cactusAge = new Float32Array(this.MAX_CACTUS_PARTICLES);
    this.cactusLife = new Float32Array(this.MAX_CACTUS_PARTICLES);

    const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const mat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.85,
      metalness: 0.05,
    });
    this.cactusParticleMesh = new THREE.InstancedMesh(geo, mat, this.MAX_CACTUS_PARTICLES);
    this.cactusParticleMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.MAX_CACTUS_PARTICLES * 3), 3);
    this.cactusParticleMesh.frustumCulled = false;
    this.cactusParticleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    _mat4A.makeScale(0, 0, 0);
    for (let i = 0; i < this.MAX_CACTUS_PARTICLES; i++) {
      this.cactusParticleMesh.setMatrixAt(i, _mat4A);
      this.cactusAge[i] = 999;
      this.cactusLife[i] = 1;
    }
    this.cactusParticleMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.cactusParticleMesh);
    this.disposables.push(geo, mat);
  }

  public triggerCactusBreakParticles(x: number, y: number, z: number): void {
    if (!this.cactusParticleMesh) return;
    const count = 16;
    const colors = [
      new THREE.Color("#2d7a3e"),
      new THREE.Color("#4ade80"),
      new THREE.Color("#15803d"),
      new THREE.Color("#fde047"),
    ];

    for (let i = 0; i < count; i++) {
      const idx = (this.cactusIdx + i) % this.MAX_CACTUS_PARTICLES;
      this.cactusPosX[idx] = x + (Math.random() - 0.5) * 0.35;
      this.cactusPosY[idx] = y + Math.random() * 0.6;
      this.cactusPosZ[idx] = z + (Math.random() - 0.5) * 0.35;

      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 4.5;
      this.cactusVelX[idx] = Math.cos(angle) * speed;
      this.cactusVelY[idx] = 2.4 + Math.random() * 3.6;
      this.cactusVelZ[idx] = Math.sin(angle) * speed;

      this.cactusRotX[idx] = Math.random() * Math.PI * 2;
      this.cactusRotY[idx] = Math.random() * Math.PI * 2;
      this.cactusRotZ[idx] = Math.random() * Math.PI * 2;

      this.cactusAge[idx] = 0;
      this.cactusLife[idx] = 0.75 + Math.random() * 0.35;

      this.cactusParticleMesh.setColorAt(idx, colors[i % colors.length]);
    }
    if (this.cactusParticleMesh.instanceColor) {
      this.cactusParticleMesh.instanceColor.needsUpdate = true;
    }
    this.cactusIdx = (this.cactusIdx + count) % this.MAX_CACTUS_PARTICLES;
  }

  private updateCactusParticles(dt: number): void {
    if (!this.cactusParticleMesh) return;
    let needsUpdate = false;
    for (let i = 0; i < this.MAX_CACTUS_PARTICLES; i++) {
      if (this.cactusAge[i] >= this.cactusLife[i]) continue;

      this.cactusAge[i] += dt;
      if (this.cactusAge[i] >= this.cactusLife[i]) {
        _mat4A.makeScale(0, 0, 0);
        this.cactusParticleMesh.setMatrixAt(i, _mat4A);
        needsUpdate = true;
        continue;
      }

      this.cactusVelY[i] -= 16.0 * dt;
      this.cactusVelX[i] *= 0.95;
      this.cactusVelZ[i] *= 0.95;

      this.cactusPosX[i] += this.cactusVelX[i] * dt;
      this.cactusPosY[i] = Math.max(0.04, this.cactusPosY[i] + this.cactusVelY[i] * dt);
      this.cactusPosZ[i] += this.cactusVelZ[i] * dt;

      this.cactusRotX[i] += dt * 12.0;
      this.cactusRotY[i] += dt * 9.0;
      this.cactusRotZ[i] += dt * 8.0;

      const progress = this.cactusAge[i] / this.cactusLife[i];
      const scale = (1.0 - progress) * 1.0;

      _vecA.set(this.cactusPosX[i], this.cactusPosY[i], this.cactusPosZ[i]);
      _quatA.setFromEuler(_eulerA.set(this.cactusRotX[i], this.cactusRotY[i], this.cactusRotZ[i]));
      _scaleVec.set(scale, scale, scale);
      _mat4A.compose(_vecA, _quatA, _scaleVec);
      this.cactusParticleMesh.setMatrixAt(i, _mat4A);
      needsUpdate = true;
    }
    if (needsUpdate) {
      this.cactusParticleMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private initCactiSystem(options?: TrackInteractiveOptions): void {
    if (options?.enableCacti === false) return;
    this.initCactusParticles();

    if (options?.cactusPositions && options.cactusPositions.length > 0) {
      for (let i = 0; i < options.cactusPositions.length; i++) {
        const c = options.cactusPositions[i];
        this.registerCactus({
          id: i + 1,
          s: c.s,
          pos: { x: c.x ?? 0, y: c.y ?? 0, z: c.z ?? 0 },
          heading: c.heading ?? 0,
          radius: c.radius ?? 1.35,
        });
      }
      return;
    }

    // Padrão: cactos saguaros interativos colocados nas margens da pista do deserto
    const defaultS = [45, 95, 150, 210, 260, 320, 390, 460, 520, 580, 640];
    if (this.track) {
      for (let i = 0; i < defaultS.length; i++) {
        const s = defaultS[i];
        const at = pointAt(this.track, s);
        const y = heightAt(this.track, s);
        const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
        // Alterna entre margem esquerda e direita
        const side = (i % 2 === 0) ? -1 : 1;
        const distOff = at.halfWidth + 1.25;

        this.registerCactus({
          id: i + 1,
          s,
          pos: {
            x: at.pos.x + nrm.x * distOff * side,
            y,
            z: at.pos.z + nrm.z * distOff * side,
          },
          heading: at.heading,
          radius: 1.35,
        });
      }
    } else {
      const fallbackPositions = [
        { x: -10, y: 0, z: 20 },
        { x: 15, y: 0, z: 45 },
        { x: -25, y: 0, z: 80 },
        { x: 30, y: 0, z: 110 },
        { x: -15, y: 0, z: 150 },
        { x: 40, y: 0, z: 190 },
      ];
      for (let i = 0; i < fallbackPositions.length; i++) {
        const p = fallbackPositions[i];
        this.registerCactus({
          id: i + 1,
          pos: { x: p.x, y: p.y, z: p.z },
          heading: 0,
          radius: 1.35,
        });
      }
    }
  }

  public registerCactus(config: {
    id: number;
    s?: number;
    pos: { x: number; y: number; z: number };
    heading?: number;
    radius?: number;
  }): CactusObstacle {
    const group = new THREE.Group();
    group.name = `cactus-${config.id}`;
    group.position.set(config.pos.x, config.pos.y, config.pos.z);
    group.rotation.y = config.heading ?? 0;

    const cactusMat = new THREE.MeshStandardMaterial({
      color: "#2d7a3e",
      roughness: 0.85,
      metalness: 0.08,
    });
    this.disposables.push(cactusMat);

    // Tronco principal do saguaro com ponta arredondada
    const trunkH = 2.4;
    const trunkGeo = new THREE.CylinderGeometry(0.26, 0.3, trunkH, 8);
    trunkGeo.translate(0, trunkH / 2, 0);
    const trunkMesh = new THREE.Mesh(trunkGeo, cactusMat);
    group.add(trunkMesh);

    const capGeo = new THREE.SphereGeometry(0.26, 8, 6);
    capGeo.translate(0, trunkH, 0);
    const capMesh = new THREE.Mesh(capGeo, cactusMat);
    group.add(capMesh);

    const arms: THREE.Mesh[] = [];

    // Braço esquerdo do cacto
    const armHGeoL = new THREE.CylinderGeometry(0.14, 0.14, 0.6, 7);
    armHGeoL.rotateZ(Math.PI / 2);
    armHGeoL.translate(-0.35, trunkH * 0.52, 0);
    const armHMeshL = new THREE.Mesh(armHGeoL, cactusMat);
    group.add(armHMeshL);
    arms.push(armHMeshL);

    const armVGeoL = new THREE.CylinderGeometry(0.14, 0.16, 0.9, 7);
    armVGeoL.translate(-0.65, trunkH * 0.52 + 0.45, 0);
    const armVMeshL = new THREE.Mesh(armVGeoL, cactusMat);
    group.add(armVMeshL);
    arms.push(armVMeshL);

    // Braço direito em altura diferente (se id ímpar)
    if (config.id % 2 !== 0) {
      const armHGeoR = new THREE.CylinderGeometry(0.14, 0.14, 0.55, 7);
      armHGeoR.rotateZ(Math.PI / 2);
      armHGeoR.translate(0.32, trunkH * 0.68, 0);
      const armHMeshR = new THREE.Mesh(armHGeoR, cactusMat);
      group.add(armHMeshR);
      arms.push(armHMeshR);

      const armVGeoR = new THREE.CylinderGeometry(0.14, 0.16, 0.8, 7);
      armVGeoR.translate(0.6, trunkH * 0.68 + 0.4, 0);
      const armVMeshR = new THREE.Mesh(armVGeoR, cactusMat);
      group.add(armVMeshR);
      arms.push(armVMeshR);

      this.disposables.push(armHGeoR, armVGeoR);
    }

    this.disposables.push(trunkGeo, capGeo, armHGeoL, armVGeoL);

    if (this.scene) {
      this.scene.add(group);
    }

    const obstacle: CactusObstacle = {
      id: config.id,
      s: config.s,
      pos: { ...config.pos },
      heading: config.heading ?? 0,
      group,
      trunkMesh,
      arms,
      radius: config.radius ?? 1.35,
      isBroken: false,
      breakTimer: 0,
      wobbleTimer: 0,
      wobbleAngle: 0,
    };

    this._cacti.push(obstacle);
    return obstacle;
  }

  private updateCacti(dt: number, karts: KartInteractiveInfo[]): void {
    const numCacti = this._cacti.length;
    const numKarts = karts.length;

    for (let c = 0; c < numCacti; c++) {
      const cactus = this._cacti[c];

      // Balanço / oscilação suave quando kart passa perto com deslocamento de ar
      if (cactus.wobbleTimer > 0) {
        cactus.wobbleTimer -= dt;
        cactus.group.rotation.z = Math.sin((0.5 - cactus.wobbleTimer) * 24.0) * cactus.wobbleAngle;
        if (cactus.wobbleTimer <= 0) {
          cactus.group.rotation.z = 0;
        }
      }

      // Respawn do cacto quebrado após alguns segundos
      if (cactus.isBroken) {
        cactus.breakTimer -= dt;
        if (cactus.breakTimer <= 0) {
          cactus.isBroken = false;
          cactus.group.scale.set(1, 1, 1);
        }
        continue;
      }

      // Colisão do kart com o cacto
      for (let k = 0; k < numKarts; k++) {
        const kart = karts[k];
        const dx = kart.pos.x - cactus.pos.x;
        const dz = kart.pos.z - cactus.pos.z;
        const dist = Math.hypot(dx, dz);
        const dy = Math.abs((kart.y ?? 0) - cactus.pos.y);

        if (dist < cactus.radius && dy < 2.2) {
          // Kart bateu no cacto! O cacto quebra espalhando pedaços verdes e espinhos
          cactus.isBroken = true;
          cactus.breakTimer = 4.0;
          cactus.group.scale.set(0.01, 0.01, 0.01);

          this.triggerCactusBreakParticles(cactus.pos.x, cactus.pos.y + 0.8, cactus.pos.z);

          const out = this.kartOutputs[k];
          out.bonk = true;
          out.speedMultiplier = 0.65;
          const h = kart.heading ?? 0;
          out.bonkImpulse = { x: -Math.sin(h) * 8.0, z: -Math.cos(h) * 8.0 };
          out.shake = 0.45;
          out.soundCue = "cactus_bonk";
          break;
        } else if (dist < cactus.radius + 1.2 && kart.speed > 8.0 && cactus.wobbleTimer <= 0) {
          // Kart raspou / passou perto em alta velocidade: cacto balança no vácuo
          cactus.wobbleTimer = 0.45;
          cactus.wobbleAngle = 0.16;
        }
      }
    }

    this.updateCactusParticles(dt);
  }

  // ==========================================================================
  // POÇO DE LAMA NO FUNDO DO CÂNION
  // ==========================================================================

  private initMudParticles(): void {
    if (!this.scene) return;
    this.mudPosX = new Float32Array(this.MAX_MUD_PARTICLES);
    this.mudPosY = new Float32Array(this.MAX_MUD_PARTICLES);
    this.mudPosZ = new Float32Array(this.MAX_MUD_PARTICLES);
    this.mudVelX = new Float32Array(this.MAX_MUD_PARTICLES);
    this.mudVelY = new Float32Array(this.MAX_MUD_PARTICLES);
    this.mudVelZ = new Float32Array(this.MAX_MUD_PARTICLES);
    this.mudScale = new Float32Array(this.MAX_MUD_PARTICLES);
    this.mudAge = new Float32Array(this.MAX_MUD_PARTICLES);
    this.mudLife = new Float32Array(this.MAX_MUD_PARTICLES);

    const geo = new THREE.SphereGeometry(0.22, 7, 5);
    const mat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.25,
      metalness: 0.15,
    });
    this.mudSplashMesh = new THREE.InstancedMesh(geo, mat, this.MAX_MUD_PARTICLES);
    this.mudSplashMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.MAX_MUD_PARTICLES * 3), 3);
    this.mudSplashMesh.frustumCulled = false;
    this.mudSplashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    _mat4A.makeScale(0, 0, 0);
    for (let i = 0; i < this.MAX_MUD_PARTICLES; i++) {
      this.mudSplashMesh.setMatrixAt(i, _mat4A);
      this.mudAge[i] = 999;
      this.mudLife[i] = 1;
    }
    this.mudSplashMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.mudSplashMesh);
    this.disposables.push(geo, mat);
  }

  public triggerMudSplash(x: number, y: number, z: number): void {
    if (!this.mudSplashMesh) return;
    const count = 16;
    const mudColors = [
      new THREE.Color("#3d2817"),
      new THREE.Color("#5a3820"),
      new THREE.Color("#2a1b10"),
      new THREE.Color("#4a2c18"),
    ];

    for (let i = 0; i < count; i++) {
      const idx = (this.mudIdx + i) % this.MAX_MUD_PARTICLES;
      this.mudPosX[idx] = x + (Math.random() - 0.5) * 0.7;
      this.mudPosY[idx] = y + 0.1 + Math.random() * 0.25;
      this.mudPosZ[idx] = z + (Math.random() - 0.5) * 0.7;

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.8 + Math.random() * 3.4;
      this.mudVelX[idx] = Math.cos(angle) * speed;
      this.mudVelY[idx] = 2.8 + Math.random() * 3.8;
      this.mudVelZ[idx] = Math.sin(angle) * speed;

      this.mudScale[idx] = 0.8 + Math.random() * 0.6;
      this.mudAge[idx] = 0;
      this.mudLife[idx] = 0.6 + Math.random() * 0.4;

      this.mudSplashMesh.setColorAt(idx, mudColors[i % mudColors.length]);
    }
    if (this.mudSplashMesh.instanceColor) {
      this.mudSplashMesh.instanceColor.needsUpdate = true;
    }
    this.mudIdx = (this.mudIdx + count) % this.MAX_MUD_PARTICLES;
  }

  private updateMudParticles(dt: number): void {
    if (!this.mudSplashMesh) return;
    let needsUpdate = false;
    for (let i = 0; i < this.MAX_MUD_PARTICLES; i++) {
      if (this.mudAge[i] >= this.mudLife[i]) continue;

      this.mudAge[i] += dt;
      if (this.mudAge[i] >= this.mudLife[i]) {
        _mat4A.makeScale(0, 0, 0);
        this.mudSplashMesh.setMatrixAt(i, _mat4A);
        needsUpdate = true;
        continue;
      }

      this.mudVelY[i] -= 12.0 * dt;
      this.mudVelX[i] *= 0.92;
      this.mudVelZ[i] *= 0.92;

      this.mudPosX[i] += this.mudVelX[i] * dt;
      this.mudPosY[i] = this.mudPosY[i] + this.mudVelY[i] * dt;
      this.mudPosZ[i] += this.mudVelZ[i] * dt;

      const progress = this.mudAge[i] / this.mudLife[i];
      const scale = this.mudScale[i] * (progress < 0.3 ? (0.6 + progress * 1.5) : (1.05 - (progress - 0.3) * 0.9));

      _vecA.set(this.mudPosX[i], this.mudPosY[i], this.mudPosZ[i]);
      _quatA.identity();
      _scaleVec.set(scale * 1.2, scale * 0.7, scale * 1.2);
      _mat4A.compose(_vecA, _quatA, _scaleVec);
      this.mudSplashMesh.setMatrixAt(i, _mat4A);
      needsUpdate = true;
    }
    if (needsUpdate) {
      this.mudSplashMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private initMudPitSystem(options?: TrackInteractiveOptions): void {
    if (options?.enableMudPit === false) return;
    this.initMudParticles();

    // Identifica vão do cânion nas rampas da pista
    const gapRamp = this.track?.ramps?.find((r) => r.gap);
    if (gapRamp && gapRamp.gap) {
      const sMid = (gapRamp.gap.sFrom + gapRamp.gap.sTo) / 2;
      const at = pointAt(this.track!, sMid);
      this._mudPits.push({
        id: 1,
        sFrom: gapRamp.gap.sFrom,
        sTo: gapRamp.gap.sTo,
        minY: -10.0,
        maxY: -2.0,
        center: { x: at.pos.x, y: -6.5, z: at.pos.z },
        radius: 28.0,
        splashCooldown: 0,
      });
    } else {
      // Fallback
      this._mudPits.push({
        id: 1,
        sFrom: 600,
        sTo: 660,
        minY: -10.0,
        maxY: -2.0,
        center: { x: 80, y: -6.5, z: 60 },
        radius: 35.0,
        splashCooldown: 0,
      });
    }
  }

  private updateMudPit(dt: number, karts: KartInteractiveInfo[]): void {
    const numPits = this._mudPits.length;
    const numKarts = karts.length;

    for (let p = 0; p < numPits; p++) {
      const pit = this._mudPits[p];
      if (pit.splashCooldown > 0) pit.splashCooldown -= dt;

      for (let k = 0; k < numKarts; k++) {
        const kart = karts[k];
        const ky = kart.y ?? 0;

        // Se o kart cair no vão do cânion (altitude negativa profunda no poço)
        if (ky < pit.maxY) {
          const dx = kart.pos.x - pit.center.x;
          const dz = kart.pos.z - pit.center.z;
          const dist = Math.hypot(dx, dz);

          if (dist < pit.radius) {
            const out = this.kartOutputs[k];
            out.bonk = true;
            // Desaceleração profunda na lama viscosa até o resgate pelo drone
            out.speedMultiplier = 0.2;
            out.shake = 0.35;
            out.soundCue = "mud_splash";

            if (pit.splashCooldown <= 0) {
              pit.splashCooldown = 0.55;
              this.triggerMudSplash(kart.pos.x, ky, kart.pos.z);
            }
          }
        }
      }
    }

    this.updateMudParticles(dt);
  }

  public get cacti(): readonly CactusObstacle[] {
    return this._cacti;
  }

  public get mudPits(): readonly MudPitArea[] {
    return this._mudPits;
  }

  /**
   * Libera todos os recursos WebGL, geometrias e texturas criadas pelo gerenciador.
   */
  public dispose(): void {
    if (this.scene) {
      if (this.paperMesh) this.scene.remove(this.paperMesh);
      if (this.postitMesh) this.scene.remove(this.postitMesh);
      if (this.steamMesh) this.scene.remove(this.steamMesh);
      if (this.splashMesh) this.scene.remove(this.splashMesh);
      if (this.ventParticleMesh) this.scene.remove(this.ventParticleMesh);

      for (const c of this._coffeeCalcinhas) this.scene.remove(c.group);
      for (const r of this._roombas) this.scene.remove(r.group);
      for (const d of this._automaticDoors) this.scene.remove(d.group);
      for (const v of this._airVents) this.scene.remove(v.group);
      for (const dd of this._dustDevils) this.scene.remove(dd.group);
      for (const vu of this._vultures) this.scene.remove(vu.group);
      for (const ca of this._cacti) this.scene.remove(ca.group);
      if (this.dustBurstMesh) this.scene.remove(this.dustBurstMesh);
      if (this.featherMesh) this.scene.remove(this.featherMesh);
      if (this.cactusParticleMesh) this.scene.remove(this.cactusParticleMesh);
      if (this.mudSplashMesh) this.scene.remove(this.mudSplashMesh);
    }

    if (this.roombaFaces) {
      try {
        this.roombaFaces.happy.dispose();
        this.roombaFaces.bonked.dispose();
        this.roombaFaces.surprised.dispose();
      } catch {
        // noop
      }
      this.roombaFaces = null;
    }

    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        // noop
      }
    }
    this.disposables = [];

    this.managedBoxes.clear();
    this.managedCups.clear();
    this._coffeeCalcinhas = [];
    this._roombas = [];
    this._automaticDoors = [];
    this._airVents = [];
    this._dustDevils = [];
    this._vultureFlocks = [];
    this._vultures = [];
    this._cacti = [];
    this._mudPits = [];
    this.desks = [];
    this.kartOutputs = [];
    this.scene = null;
  }
}
