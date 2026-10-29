import * as THREE from "three";
import { pointAt, progressOf, sideNormal, type Track, type Vec2 } from "@ec/shared";

/**
 * Módulo de Cenário Interativo e Coletáveis no estilo Super Mario Odyssey e Super Mario Galaxy.
 *
 * Funcionalidades:
 * 1. Papéis e Post-its Voando das Mesas com Deslocamento de Ar:
 *    - Quando qualquer kart passa em alta velocidade (> 10 m/s) a menos de 3.8m de uma mesa,
 *      folhas de sulfite branco e post-its vibrantes (amarelo, rosa, ciano) saem voando para cima
 *      com turbulência caótica e rodopios 3D, descendo suavemente e repousando de volta.
 *    - Implementado via THREE.InstancedMesh para máxima taxa de quadros (60 FPS contínuos).
 * 2. Caixas de Itens Galaxy:
 *    - Respiração senoidal com squash & stretch sutil.
 *    - Rotação giroscópica contínua em múltiplos eixos com inclinação dinâmica.
 *    - Halo de brilho pulsante emissivo suave (brilho celestial estelar).
 * 3. Xícaras de Café com Vapor Cartoon e Pulso de Aroma:
 *    - Xícaras flutuantes com bobbing senoidal e rotação elegante.
 *    - Anel de pulso de aroma subindo em ondas quentes.
 *    - Espirais de nuvenzinhas de vapor cartoon subindo em trajetória ondulada com
 *      opacidade e escala decrescentes via THREE.InstancedMesh.
 *
 * Critérios de Performance:
 * - Zero alocações no loop update(dt, karts).
 * - Objetos matemáticos e buffers pré-alocados em escopo de módulo/classe.
 */

export interface KartInteractiveInfo {
  pos: { x: number; z: number };
  speed: number;
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

export interface TrackInteractiveOptions {
  track?: Track;
  deskPositions?: { x: number; z: number; heading?: number }[];
  paperPerDesk?: number;
  postitPerDesk?: number;
  maxSteamPuffsPerCup?: number;
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

// Cores vivas estilo Nintendo (Super Mario Odyssey / Galaxy)
const COLOR_PAPER_WHITE = new THREE.Color("#f8fafc");
const COLOR_POSTIT_YELLOW = new THREE.Color("#ffe600");
const COLOR_POSTIT_PINK = new THREE.Color("#ff2a85");
const COLOR_POSTIT_CYAN = new THREE.Color("#00e5ff");
const COLOR_STEAM_WHITE = new THREE.Color("#ffffff");

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

  // Gradiente de fundo cósmico / dourado translúcido
  const grad = ctx.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, "#ffbe3b");
  grad.addColorStop(0.5, "#f39c12");
  grad.addColorStop(1, "#d35400");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  // Borda chanfrada estilo Mario Kart
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeRect(6, 6, 116, 116);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#f1c40f";
  ctx.strokeRect(12, 12, 104, 104);

  // Ponto central de interrogação (?) com sombra energética
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

  // Buffers planos SoA (Structure of Arrays) para física de papéis
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
  private paperState = new Uint8Array(0); // 0 = resting, 1 = flying, 2 = settling
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

  // Caixas de item gerenciadas
  private managedBoxes = new Map<number, ManagedItemBox>();
  private nextBoxId = 1;

  // Xícaras de café gerenciadas
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

  // Recursos para descarte
  private disposables: { dispose: () => void }[] = [];
  private galaxyBoxTexture: THREE.Texture | null = null;

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
   * Descobre mesas, configura InstancedMeshes para papéis e vapor, e prepara coletáveis.
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

    // Se mesas ainda não foram definidas, busca na pista, na cena ou usa padrões
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
  }

  /** Varre a cena procurando nós de ilhas de mesas marcados ou grupos característicos */
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

    // Alocação dos buffers SoA para papéis
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

    // Alocação dos buffers SoA para post-its
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

    // Geometrias e materiais instanciados
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

    // Inicialização do estado de repouso nas mesas (tampo da mesa em Y = 0.78m)
    let pIdx = 0;
    let sIdx = 0;

    for (let d = 0; d < numDesks; d++) {
      const desk = this.desks[d];
      const cosH = Math.cos(desk.heading);
      const sinH = Math.sin(desk.heading);

      // Posição de repouso das folhas sulfite (pilhas organizadas com leve desalinho orgânico)
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

      // Posição de repouso dos post-its (pequenos blocos coloridos nas beiradas da mesa)
      for (let s = 0; s < this.postitPerDesk; s++) {
        const padIdx = s % 3; // 0 = amarelo, 1 = rosa, 2 = ciano
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

        // Atribui a cor vibrante característica
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

    // Capacidade para até 16 xícaras de café na pista simultâneas
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

    // Inicializa puffs ocultos (escala 0)
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

  /**
   * Registra uma ilha de mesas explicitamente.
   */
  public registerDesk(x: number, z: number, heading = 0): void {
    this.desks.push({ x, z, heading });
  }

  /**
   * Registra uma caixa de item na cena para receber respiração, bobbing e rotação giroscópica Galaxy.
   */
  public registerItemBox(meshOrGroup: THREE.Object3D, baseY = 0.9): ManagedItemBox {
    const id = this.nextBoxId++;
    const phase = Math.random() * Math.PI * 2;

    // Cria halo pulsante estelar suave ao redor da caixa
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

  /**
   * Constrói e registra uma nova Caixa de Itens completa no estilo Super Mario Galaxy.
   */
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

    // Halo brilhante pulsante ao redor da caixa
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

  /**
   * Registra uma xícara de café para receber rotação, bobbing, pulso de aroma e vapor cartoon.
   */
  public registerCup(group: THREE.Object3D, baseY = 0.38): ManagedCup {
    const id = this.nextCupId++;
    const phase = Math.random() * Math.PI * 2;

    // Anel de pulso de aroma suave sobre a borda
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

  /** Remove uma caixa de itens do gerenciamento */
  public removeBox(id: number): void {
    const box = this.managedBoxes.get(id);
    if (!box) return;
    if (box.halo && box.halo.parent) {
      box.halo.parent.remove(box.halo);
    }
    this.managedBoxes.delete(id);
  }

  /** Remove uma xícara de café do gerenciamento */
  public removeCup(id: number): void {
    const cup = this.managedCups.get(id);
    if (!cup) return;
    if (cup.aromaMesh && cup.aromaMesh.parent) {
      cup.aromaMesh.parent.remove(cup.aromaMesh);
    }
    this.managedCups.delete(id);
  }

  /**
   * Dispara a rajada aerodinâmica turbulenta sobre uma ilha de mesas quando um kart passa veloz.
   * Regra: velocidade > 10 m/s e distância < 3.8m.
   */
  public triggerDeskAirBlast(
    deskIdx: number,
    kartX: number,
    kartZ: number,
    kartSpeed: number,
    dist: number,
  ): void {
    if (deskIdx < 0 || deskIdx >= this.desks.length) return;
    const desk = this.desks[deskIdx];

    // Intensidade da rajada baseada em velocidade e proximidade
    const distFactor = Math.max(0.1, (3.8 - dist) / 3.8);
    const speedFactor = Math.min(2.5, 1.0 + (kartSpeed - 10) * 0.16);
    const gust = distFactor * speedFactor;

    // Vetor de deslocamento do kart para a mesa
    let dirX = desk.x - kartX;
    let dirZ = desk.z - kartZ;
    const len = Math.hypot(dirX, dirZ) || 1;
    dirX /= len;
    dirZ /= len;

    // Disparo dos papéis sulfite
    const pStart = deskIdx * this.paperPerDesk;
    const pEnd = pStart + this.paperPerDesk;
    for (let i = pStart; i < pEnd; i++) {
      if (this.paperState[i] === 0 || this.paperState[i] === 2) {
        this.paperState[i] = 1; // voando
        this.paperAge[i] = 0;
        this.paperVelY[i] = 3.6 + Math.random() * 2.8 * gust;
        this.paperVelX[i] = dirX * (1.6 + Math.random() * 1.8) * gust + (Math.random() - 0.5) * 2.2;
        this.paperVelZ[i] = dirZ * (1.6 + Math.random() * 1.8) * gust + (Math.random() - 0.5) * 2.2;
        this.paperAngX[i] = (Math.random() - 0.5) * 16.0;
        this.paperAngY[i] = (Math.random() - 0.5) * 18.0;
        this.paperAngZ[i] = (Math.random() - 0.5) * 14.0;
      } else {
        // Papéis que já estão no ar recebem impulso extra de turbulência
        this.paperVelY[i] += 1.8 * gust;
        this.paperAngY[i] += (Math.random() - 0.5) * 12.0;
      }
    }

    // Disparo dos post-its coloridos (mais leves, sobem mais alto e rodopiam mais rápido)
    const sStart = deskIdx * this.postitPerDesk;
    const sEnd = sStart + this.postitPerDesk;
    for (let i = sStart; i < sEnd; i++) {
      if (this.postitState[i] === 0 || this.postitState[i] === 2) {
        this.postitState[i] = 1; // voando
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
   * @param dt Delta time em segundos
   * @param karts Posições e velocidades atuais dos karts na pista
   */
  public update(dt: number, karts: KartInteractiveInfo[]): void {
    if (dt <= 0) return;
    this.clock += dt;

    // 1. Checagem de passagem dos karts perto das mesas
    const numDesks = this.desks.length;
    const numKarts = karts.length;

    for (let d = 0; d < numDesks; d++) {
      const desk = this.desks[d];
      for (let k = 0; k < numKarts; k++) {
        const kart = karts[k];
        if (kart.speed <= 10) continue; // requisito: velocidade > 10 m/s

        const dx = kart.pos.x - desk.x;
        const dz = kart.pos.z - desk.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < 3.8 * 3.8) {
          // requisito: menos de 3.8m de uma ilha de mesas
          const dist = Math.sqrt(distSq);
          this.triggerDeskAirBlast(d, kart.pos.x, kart.pos.z, kart.speed, dist);
          break; // Disparado para esta mesa neste quadro
        }
      }
    }

    // 2. Física e atualização dos papéis sulfite voando e pousando
    this.updatePapersPhysics(dt);

    // 3. Física e atualização dos post-its voando e pousando
    this.updatePostitsPhysics(dt);

    // 4. Animação giroscópica Galaxy das Caixas de Itens
    this.updateItemBoxes(dt);

    // 5. Animação das xícaras de café, aroma e vapor cartoon
    this.updateCoffeeCupsAndSteam(dt);
  }

  /** Atualização de voo, sustentação aerodinâmica e repouso dos papéis sulfite */
  private updatePapersPhysics(dt: number): void {
    if (!this.paperMesh) return;

    const drag = Math.pow(0.88, dt * 60);
    const rotDrag = Math.pow(0.92, dt * 60);

    for (let i = 0; i < this.totalPapers; i++) {
      const state = this.paperState[i];

      if (state === 1) {
        // Em voo com sustentação e turbulência
        this.paperAge[i] += dt;
        const age = this.paperAge[i];

        // Arrasto aerodinâmico
        this.paperVelX[i] *= drag;
        this.paperVelZ[i] *= drag;

        // Gravidade com sustentação ondulante (folha planando no ar)
        const flutterLift = Math.sin(age * this.paperFlutterFreq[i] + i) * 1.5;
        this.paperVelY[i] += (-4.2 + flutterLift) * dt;

        // Velocidade terminal suave
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

        // Ao se aproximar da altura da mesa descendo, entra em repouso gradual
        const restY = this.paperRestY[i];
        if (this.paperPosY[i] <= restY + 0.08 && this.paperVelY[i] < 0 && age > 0.4) {
          this.paperState[i] = 2; // settling
        }
      } else if (state === 2) {
        // Acomodação suave de volta à posição de repouso na mesa
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
          this.paperState[i] = 0; // repousando completamente
        }
      }

      // Atualiza a matriz instanciada (Zero alocação)
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

        // Post-it é mais leve: flutter de alta frequência
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
          this.postitState[i] = 2; // settling
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

  /**
   * Caixas de Itens no estilo Super Mario Galaxy:
   * - Bobbing vertical senoidal suave.
   * - Respiração orgânica (squash & stretch sutil).
   * - Giro giroscópico contínuo em múltiplos eixos com inclinação dinâmica.
   * - Halo de brilho pulsante emissivo suave ao redor da caixa.
   */
  private updateItemBoxes(dt: number): void {
    const t = this.clock;

    for (const box of this.managedBoxes.values()) {
      if (!box.mesh.visible) continue;

      // 1. Bobbing vertical senoidal suave
      const bob = Math.sin(t * 2.4 + box.phase) * 0.12;
      box.mesh.position.y = box.baseY + bob;

      // 2. Respiração cósmica suave
      const breath = 1.0 + Math.sin(t * 3.4 + box.phase) * 0.045;
      if (box.innerBox) {
        box.innerBox.scale.set(breath, breath, breath);

        // 3. Rotação giroscópica contínua em múltiplos eixos com inclinação suave
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

      // 4. Halo de brilho pulsante emissivo suave
      if (box.halo && box.haloMat) {
        const pulse = 0.45 + Math.sin(t * 4.2 + box.phase) * 0.25;
        box.haloMat.opacity = pulse;
        box.halo.rotation.z -= dt * 1.1;
        const haloScale = breath * (1.0 + Math.sin(t * 4.2 + box.phase) * 0.08);
        box.halo.scale.set(haloScale, haloScale, haloScale);
      }
    }
  }

  /**
   * Xícaras de Café e Nuvenzinhas de Vapor Cartoon:
   * - Xícaras flutuantes com rotação suave e bobbing.
   * - Pulso de aroma saindo da borda.
   * - Pequenas espirais de vapor cartoon com opacidade e escala decrescentes.
   */
  private updateCoffeeCupsAndSteam(dt: number): void {
    const t = this.clock;
    const cupList = Array.from(this.managedCups.values());
    const numCups = cupList.length;

    // Atualiza xícaras de café e ondas de aroma
    for (let c = 0; c < numCups; c++) {
      const cup = cupList[c];
      if (!cup.group.visible) continue;

      // Bobbing vertical senoidal e rotação elegante
      const bob = Math.sin(t * 2.8 + cup.phase) * 0.06;
      cup.group.position.y = cup.baseY + bob;
      cup.group.rotation.y += dt * 2.6;

      // Pulso de aroma emanando da xícara em ondas
      if (cup.aromaMesh && cup.aromaMat) {
        const aromaWave = (t * 1.2 + cup.phase) % 1.0; // 0 a 1 em loop
        cup.aromaMesh.scale.setScalar(1.0 + aromaWave * 0.55);
        cup.aromaMat.opacity = Math.sin(aromaWave * Math.PI) * 0.5;
        cup.aromaMesh.position.y = 0.145 + aromaWave * 0.12;
      }
    }

    // Atualiza espirais de nuvenzinhas de vapor cartoon
    if (!this.steamMesh) return;

    for (let i = 0; i < this.totalSteamPuffs; i++) {
      const cupIdx = this.steamCupIdx[i];
      if (cupIdx >= numCups) {
        // Xícara inexistente: esconde o puff
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

      const u = this.steamAge[i] / this.steamLife[i]; // 0 a 1

      // Trajetória em espiral cartoon subindo da xícara
      const angle = this.steamSpiralAngle[i] + u * Math.PI * 3.6;
      const radius = 0.03 + u * 0.09;
      const puffX = cup.group.position.x + Math.sin(angle) * radius;
      const puffZ = cup.group.position.z + Math.cos(angle) * radius;
      const puffY = cup.group.position.y + 0.16 + u * 0.72;

      // Escala cartoon: pop-in rápido, expansão fofa e dissipação suave a zero
      let scale: number;
      if (u < 0.22) {
        scale = (u / 0.22) * 1.0;
      } else if (u < 0.65) {
        scale = 1.0 + ((u - 0.22) / 0.43) * 0.35;
      } else {
        scale = (1.0 - (u - 0.65) / 0.35) * 1.35;
      }

      // Modulação de cor/brilho no ciclo de vida
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

  /** Retorna a lista imutável de mesas monitoradas */
  public get monitoredDesks(): readonly DeskIsland[] {
    return this.desks;
  }

  /** Retorna as caixas de itens ativas */
  public get activeBoxes(): readonly ManagedItemBox[] {
    return Array.from(this.managedBoxes.values());
  }

  /** Retorna as xícaras de café ativas */
  public get activeCups(): readonly ManagedCup[] {
    return Array.from(this.managedCups.values());
  }

  /**
   * Libera todos os recursos WebGL, geometrias e texturas criadas pelo gerenciador.
   */
  public dispose(): void {
    if (this.scene) {
      if (this.paperMesh) this.scene.remove(this.paperMesh);
      if (this.postitMesh) this.scene.remove(this.postitMesh);
      if (this.steamMesh) this.scene.remove(this.steamMesh);
    }

    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        // noop se já foi descartado
      }
    }
    this.disposables = [];

    this.managedBoxes.clear();
    this.managedCups.clear();
    this.desks = [];
    this.scene = null;
  }
}
