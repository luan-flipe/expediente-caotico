import * as THREE from "three";
import {
  EMERGENCY_BUTTON_POS,
  SABOTAGE_FIX_POSITIONS,
  SECTORS,
  SUSPEITO_WALLS,
  TASK_STATIONS,
  type SuspeitoBody,
  type SuspeitoPrivate,
  type SuspeitoSnapshot,
} from "@ec/shared";
import { createCharacter, type Character } from "../game/character";
import { createRoomFloorMaterial } from "../game/floorTextures";

function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  shadow = true
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** Cria textura de placa de identificação de setor legível no chão */
function createSectorLabelTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  // Fundo com bordas arredondadas e contraste escuro
  ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 112, 22);
  ctx.fill();

  // Borda colorida característica do setor
  ctx.lineWidth = 8;
  ctx.strokeStyle = color;
  ctx.stroke();

  // Faixa lateral decorativa
  ctx.fillStyle = color;
  ctx.fillRect(24, 28, 10, 72);
  ctx.fillRect(478, 28, 10, 72);

  // Texto em caixa alta
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 31px 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), 256, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/** Textura de exclamação amarela (!) flutuante para estações com tarefas ativas */
function createExclamationTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 7;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 78px 'Arial Black', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", 64, 68);

  return new THREE.CanvasTexture(canvas);
}

/** Textura de alerta de sabotagem (⚠️) */
function createSabotageAlertTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ef4444";
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 7;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⚠️", 64, 70);

  return new THREE.CanvasTexture(canvas);
}

/** Textura de alerta de corpo caído (💀) */
function createBodyAlertTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "rgba(185, 28, 28, 0.92)";
  ctx.beginPath();
  ctx.arc(64, 64, 48, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 5;
  ctx.strokeStyle = "#fecaca";
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 56px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("💀", 64, 68);

  return new THREE.CanvasTexture(canvas);
}

function floorArchetypeName(sectorId: string, sectorName: string): string {
  if (sectorId === "diretoria" || sectorId === "reuniao") return `Gestão Executiva ${sectorName}`;
  if (sectorId === "copa") return `Cozinha ${sectorName}`;
  if (sectorId === "servidores" || sectorId === "infra") return `Elevador Técnico ${sectorName}`;
  if (sectorId === "recepcao") return `Corredor ${sectorName}`;
  return sectorName;
}

export class SuspeitoSceneManager {
  scene: THREE.Scene;
  bodyMeshes = new Map<string, { grp: THREE.Group; char: Character }>();
  taskBeaconGroup = new THREE.Group();
  private beacons = new Map<string, THREE.Group>();
  private stationScreens = new Map<string, THREE.Mesh>();
  private fixBeacon: THREE.Group;
  private killTargetRing: THREE.Mesh;
  private interactHighlightRing: THREE.Mesh;
  private emergencyPulseLight: THREE.PointLight;

  private beaconMat = new THREE.MeshStandardMaterial({
    color: "#ffeb3b",
    emissive: "#fbc02d",
    emissiveIntensity: 0.75,
    transparent: true,
    opacity: 0.82,
  });
  private blockedBeaconMat = new THREE.MeshStandardMaterial({
    color: "#9e9e9e",
    emissive: "#424242",
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.6,
  });
  private screenIdleMat = new THREE.MeshStandardMaterial({
    color: "#0284c7",
    emissive: "#0369a1",
    emissiveIntensity: 0.45,
    roughness: 0.2,
  });
  private screenActiveMat = new THREE.MeshStandardMaterial({
    color: "#facc15",
    emissive: "#eab308",
    emissiveIntensity: 0.95,
    roughness: 0.2,
  });
  private screenBlockedMat = new THREE.MeshStandardMaterial({
    color: "#ef4444",
    emissive: "#b91c1c",
    emissiveIntensity: 0.65,
    roughness: 0.3,
  });
  private exclamationTex = createExclamationTexture();
  private alertTex = createSabotageAlertTexture();
  private bodyAlertTex = createBodyAlertTexture();
  private redMarkMat = new THREE.MeshStandardMaterial({
    color: "#b71c1c",
    emissive: "#7f1d1d",
    emissiveIntensity: 0.35,
    roughness: 0.55,
  });
  private fixMat = new THREE.MeshStandardMaterial({
    color: "#ff1744",
    emissive: "#d50000",
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.85,
  });
  dirLight: THREE.DirectionalLight;
  ambientLight: THREE.AmbientLight;
  hemiLight: THREE.HemisphereLight;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Iluminação arquitetônica de escritório com luz hemisférica suave
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.58);
    scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xf8fafc, 0xcbd5e1, 0.42);
    this.hemiLight.position.set(0, 25, 0);
    scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff8eb, 1.15);
    this.dirLight.position.set(16, 32, 22);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 100;
    const d = 36;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0005;
    scene.add(this.dirLight);

    this.emergencyPulseLight = new THREE.PointLight(0xff1744, 0, 24);
    this.emergencyPulseLight.position.set(-4, 4.5, 0);
    scene.add(this.emergencyPulseLight);

    this.buildOfficeLayout();
    this.buildTaskStationTerminals();

    this.scene.add(this.taskBeaconGroup);
    this.fixBeacon = this.makeBeacon(this.fixMat, this.alertTex, 1.05, 2.2);
    this.fixBeacon.visible = false;
    this.scene.add(this.fixBeacon);

    // Anel 3D sob os pés do alvo de eliminação (exclusivo para o Sabotador)
    const killRingGeo = new THREE.RingGeometry(0.58, 0.86, 32);
    const killRingMat = new THREE.MeshBasicMaterial({
      color: "#ff1744",
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    this.killTargetRing = new THREE.Mesh(killRingGeo, killRingMat);
    this.killTargetRing.rotation.x = -Math.PI / 2;
    this.killTargetRing.position.y = 0.06;
    this.killTargetRing.visible = false;
    this.scene.add(this.killTargetRing);

    // Anel 3D para destacar estação/botão/corpo ao alcance imediato
    const interactRingGeo = new THREE.RingGeometry(0.75, 1.02, 32);
    const interactRingMat = new THREE.MeshBasicMaterial({
      color: "#00e676",
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    this.interactHighlightRing = new THREE.Mesh(interactRingGeo, interactRingMat);
    this.interactHighlightRing.rotation.x = -Math.PI / 2;
    this.interactHighlightRing.position.y = 0.065;
    this.interactHighlightRing.visible = false;
    this.scene.add(this.interactHighlightRing);
  }

  private makeBeacon(mat: THREE.Material, tex: THREE.Texture, radius = 0.72, height = 1.25): THREE.Group {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(radius, radius, 0.05, 24), mat, 0, 0.03, 0, false));
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, height, 10), mat, 0, height / 2, 0, false));
    const tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    tip.name = "tip";
    tip.position.y = height + 0.45;
    tip.scale.set(1.15, 1.15, 1);
    g.add(tip);
    return g;
  }

  private buildOfficeLayout(): void {
    // 1. Piso de porcelanato corporativo nos corredores gerais
    const corridorMat = createRoomFloorMaterial({
      name: "Corredor Principal",
      x: 0,
      z: 0,
      w: 64,
      d: 48,
      floor: "#d8d4ce",
    }).material;
    const baseFloor = mesh(new THREE.PlaneGeometry(68, 52), corridorMat, 0, -0.01, 0, false);
    baseFloor.rotation.x = -Math.PI / 2;
    this.scene.add(baseFloor);

    // Moldura externa escura ao redor do prédio
    const outerSurroundMat = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.95 });
    const outerGround = mesh(new THREE.PlaneGeometry(130, 110), outerSurroundMat, 0, -0.04, 0, false);
    outerGround.rotation.x = -Math.PI / 2;
    this.scene.add(outerGround);

    // 2. Setores individuais com texturas procedurais (carpete, madeira, cerâmica, chapa metálica)
    for (const sector of Object.values(SECTORS)) {
      const { material: sectorFloorMat } = createRoomFloorMaterial({
        name: floorArchetypeName(sector.id, sector.name),
        x: sector.x,
        z: sector.z,
        w: sector.w,
        d: sector.d,
        floor: sector.floorColor,
      });

      const floor = mesh(
        new THREE.PlaneGeometry(sector.w - 0.2, sector.d - 0.2),
        sectorFloorMat,
        sector.x,
        0.045,
        sector.z,
        false
      );
      floor.rotation.x = -Math.PI / 2;
      this.scene.add(floor);

      // Faixa de borda na cor do setor
      const sectorBorderMat = new THREE.MeshStandardMaterial({
        color: sector.color,
        roughness: 0.5,
      });
      const border = mesh(
        new THREE.BoxGeometry(sector.w, 0.04, sector.d),
        sectorBorderMat,
        sector.x,
        0.02,
        sector.z,
        false
      );
      this.scene.add(border);

      // Placa de identificação do setor impressa no chão
      const signTex = createSectorLabelTexture(sector.name, sector.color);
      const signMat = new THREE.MeshBasicMaterial({
        map: signTex,
        transparent: true,
        opacity: 0.95,
      });
      const signZ =
        sector.z < -5
          ? sector.z + sector.d / 2 - 1.25
          : sector.z > 5
            ? sector.z - sector.d / 2 + 1.25
            : sector.z - sector.d / 2 + 1.25;
      const signPlane = mesh(
        new THREE.PlaneGeometry(4.4, 1.12),
        signMat,
        sector.x,
        0.056,
        signZ,
        false
      );
      signPlane.rotation.x = -Math.PI / 2;
      this.scene.add(signPlane);

      this.buildSectorProps(sector);
    }

    // 3. Mesa de conferência central, cadeiras e Botão de Emergência
    this.buildConferenceCenter();

    // 4. Paredes físicas e visuais com rodapé e acabamento superior
    const wallMat = new THREE.MeshStandardMaterial({ color: "#b0bec5", roughness: 0.78 });
    const wallBaseboardMat = new THREE.MeshStandardMaterial({ color: "#263238", roughness: 0.6 });
    const wallTrimMat = new THREE.MeshStandardMaterial({ color: "#37474f", roughness: 0.5, metalness: 0.2 });
    const wallH = 1.95;

    for (const wall of SUSPEITO_WALLS) {
      // Pula o colisor da mesa de reunião (já desenhada em buildConferenceCenter)
      if (wall.minX === -7.5 && wall.maxX === -0.5 && wall.minZ === -1.8 && wall.maxZ === 1.8) {
        continue;
      }

      const w = Math.max(0.2, wall.maxX - wall.minX);
      const d = Math.max(0.2, wall.maxZ - wall.minZ);
      const cx = (wall.minX + wall.maxX) / 2;
      const cz = (wall.minZ + wall.maxZ) / 2;

      const wallMesh = mesh(new THREE.BoxGeometry(w, wallH, d), wallMat, cx, wallH / 2, cz);
      this.scene.add(wallMesh);

      // Rodapé escuro
      const baseMesh = mesh(
        new THREE.BoxGeometry(w + 0.04, 0.16, d + 0.04),
        wallBaseboardMat,
        cx,
        0.08,
        cz,
        false
      );
      this.scene.add(baseMesh);

      // Moldura superior
      const trimMesh = mesh(
        new THREE.BoxGeometry(w + 0.06, 0.1, d + 0.06),
        wallTrimMat,
        cx,
        wallH + 0.05,
        cz,
        false
      );
      this.scene.add(trimMesh);
    }
  }

  private buildConferenceCenter(): void {
    const tableX = -4.0;
    const tableZ = 0;
    const tableW = 7.0;
    const tableD = 3.6;

    const woodTopMat = new THREE.MeshStandardMaterial({ color: "#5d4037", roughness: 0.38 });
    const woodEdgeMat = new THREE.MeshStandardMaterial({ color: "#3e2723", roughness: 0.45 });
    const metalLegMat = new THREE.MeshStandardMaterial({ color: "#263238", roughness: 0.4, metalness: 0.5 });
    const chairSeatMat = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.65 });

    // Base e tampo chanfrado da mesa central
    this.scene.add(mesh(new THREE.BoxGeometry(tableW - 0.6, 0.68, tableD - 0.6), metalLegMat, tableX, 0.34, tableZ));
    this.scene.add(mesh(new THREE.BoxGeometry(tableW + 0.1, 0.1, tableD + 0.1), woodEdgeMat, tableX, 0.7, tableZ));
    this.scene.add(mesh(new THREE.BoxGeometry(tableW - 0.1, 0.06, tableD - 0.1), woodTopMat, tableX, 0.76, tableZ));

    // Cadeiras executivas encaixadas rente à mesa (dentro da sombra do colisor)
    const chairOffsetsX = [-2.2, -0.7, 0.7, 2.2];
    for (const ox of chairOffsetsX) {
      for (const side of [-1, 1]) {
        const cz = tableZ + side * (tableD / 2 - 0.15);
        this.scene.add(mesh(new THREE.BoxGeometry(0.65, 0.45, 0.55), chairSeatMat, tableX + ox, 0.25, cz, false));
        this.scene.add(
          mesh(new THREE.BoxGeometry(0.65, 0.45, 0.12), chairSeatMat, tableX + ox, 0.65, cz + side * 0.22, false)
        );
      }
    }

    // Botão de Emergência no centro da mesa com anel de alerta e cúpula translúcida
    const hazardMat = new THREE.MeshStandardMaterial({ color: "#facc15", roughness: 0.35 });
    const btnBaseMat = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.3, metalness: 0.4 });
    const btnRedMat = new THREE.MeshStandardMaterial({
      color: "#ef4444",
      emissive: "#dc2626",
      emissiveIntensity: 0.75,
      roughness: 0.2,
    });
    const domeMat = new THREE.MeshStandardMaterial({
      color: "#e0f2fe",
      transparent: true,
      opacity: 0.28,
      roughness: 0.1,
    });

    this.scene.add(
      mesh(new THREE.CylinderGeometry(0.68, 0.72, 0.06, 24), hazardMat, EMERGENCY_BUTTON_POS.x, 0.8, EMERGENCY_BUTTON_POS.z, false)
    );
    this.scene.add(
      mesh(new THREE.CylinderGeometry(0.52, 0.58, 0.14, 24), btnBaseMat, EMERGENCY_BUTTON_POS.x, 0.86, EMERGENCY_BUTTON_POS.z)
    );
    this.scene.add(
      mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.22, 24), btnRedMat, EMERGENCY_BUTTON_POS.x, 0.98, EMERGENCY_BUTTON_POS.z)
    );
    this.scene.add(
      mesh(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, EMERGENCY_BUTTON_POS.x, 0.9, EMERGENCY_BUTTON_POS.z, false)
    );
  }

  /** Constrói terminais físicos 3D para cada estação de tarefa e ponto de conserto de sabotagem */
  private buildTaskStationTerminals(): void {
    const kioskBodyMat = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.45, metalness: 0.3 });
    const kioskBaseMat = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.6 });

    for (const st of TASK_STATIONS) {
      // Desloca o totem 0.45m em direção à parede mais próxima para não atrapalhar a parada do boneco
      const offsetZ = st.pos.z < 0 ? -0.42 : 0.42;
      const kx = st.pos.x;
      const kz = st.pos.z + offsetZ;

      const kiosk = new THREE.Group();
      kiosk.position.set(kx, 0, kz);
      if (offsetZ > 0) kiosk.rotation.y = Math.PI;

      // Pedestal e painel do terminal corporativo
      kiosk.add(mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.08, 16), kioskBaseMat, 0, 0.04, 0, false));
      kiosk.add(mesh(new THREE.BoxGeometry(0.56, 1.15, 0.34), kioskBodyMat, 0, 0.58, 0));

      const screen = mesh(new THREE.BoxGeometry(0.48, 0.36, 0.06), this.screenIdleMat, 0, 1.02, 0.16, false);
      screen.rotation.x = -0.25;
      kiosk.add(screen);
      this.stationScreens.set(st.id, screen);

      this.scene.add(kiosk);
    }

    // Painéis de emergência nas posições de conserto de sabotagem
    const sabBoxMat = new THREE.MeshStandardMaterial({ color: "#7f1d1d", roughness: 0.45 });
    const sabStripeMat = new THREE.MeshStandardMaterial({ color: "#facc15", emissive: "#ca8a04", emissiveIntensity: 0.35 });
    for (const fix of Object.values(SABOTAGE_FIX_POSITIONS)) {
      const fz = fix.pos.z + (fix.pos.z < 0 ? -0.45 : 0.45);
      this.scene.add(mesh(new THREE.BoxGeometry(0.75, 1.35, 0.35), sabBoxMat, fix.pos.x, 0.68, fz));
      this.scene.add(mesh(new THREE.BoxGeometry(0.6, 0.14, 0.38), sabStripeMat, fix.pos.x, 1.15, fz, false));
    }
  }

  private buildSectorProps(sector: (typeof SECTORS)[keyof typeof SECTORS]): void {
    const darkMetal = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.4, metalness: 0.35 });
    const lightDesk = new THREE.MeshStandardMaterial({ color: "#e2e8f0", roughness: 0.55 });
    const woodMat = new THREE.MeshStandardMaterial({ color: "#6d4c41", roughness: 0.5 });
    const plantPotMat = new THREE.MeshStandardMaterial({ color: "#78350f", roughness: 0.7 });
    const plantLeafMat = new THREE.MeshStandardMaterial({ color: "#15803d", roughness: 0.65 });
    const screenCyanMat = new THREE.MeshStandardMaterial({ color: "#38bdf8", emissive: "#0284c7", emissiveIntensity: 0.65 });
    const screenGreenMat = new THREE.MeshStandardMaterial({ color: "#4ade80", emissive: "#16a34a", emissiveIntensity: 0.65 });

    const addPlant = (px: number, pz: number) => {
      this.scene.add(mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.42, 12), plantPotMat, px, 0.21, pz, false));
      this.scene.add(mesh(new THREE.DodecahedronGeometry(0.42, 0), plantLeafMat, px, 0.68, pz));
    };

    switch (sector.id) {
      case "arquivo": {
        // Estantes metálicas de arquivo encostadas na parede norte/oeste com caixas coloridas
        const shelfMat = new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.6 });
        const boxColors = ["#eab308", "#3b82f6", "#ef4444", "#22c55e"];
        for (let i = -3.5; i <= 3.5; i += 3.5) {
          this.scene.add(mesh(new THREE.BoxGeometry(2.2, 1.75, 0.7), shelfMat, sector.x + i, 0.88, sector.z - 4.1));
          const boxMat = new THREE.MeshStandardMaterial({ color: boxColors[Math.abs(Math.round(i)) % boxColors.length] });
          this.scene.add(mesh(new THREE.BoxGeometry(1.8, 0.35, 0.74), boxMat, sector.x + i, 1.25, sector.z - 4.1, false));
        }
        break;
      }
      case "servidores": {
        // Racks de servidores de alta densidade com fileiras de LEDs verdes/azuis
        const rackMat = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.35, metalness: 0.4 });
        const ledMat = new THREE.MeshStandardMaterial({ color: "#00e676", emissive: "#00e676", emissiveIntensity: 0.95 });
        for (const offset of [-4.2, 4.2]) {
          this.scene.add(mesh(new THREE.BoxGeometry(1.6, 1.85, 0.9), rackMat, sector.x + offset, 0.92, sector.z - 3.9));
          this.scene.add(mesh(new THREE.BoxGeometry(1.3, 0.1, 0.94), ledMat, sector.x + offset, 1.45, sector.z - 3.9, false));
          this.scene.add(mesh(new THREE.BoxGeometry(1.3, 0.1, 0.94), screenCyanMat, sector.x + offset, 1.1, sector.z - 3.9, false));
        }
        break;
      }
      case "infra": {
        // Quadros elétricos e banco de baterias Nobreak nas laterais
        const panelMat = new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.5 });
        const warnMat = new THREE.MeshStandardMaterial({ color: "#f59e0b", emissive: "#d97706", emissiveIntensity: 0.4 });
        this.scene.add(mesh(new THREE.BoxGeometry(1.6, 1.7, 0.6), panelMat, sector.x - 4.5, 0.85, sector.z - 3.9));
        this.scene.add(mesh(new THREE.BoxGeometry(1.6, 1.7, 0.6), panelMat, sector.x + 4.5, 0.85, sector.z - 3.9));
        this.scene.add(mesh(new THREE.BoxGeometry(0.9, 0.25, 0.64), warnMat, sector.x - 4.5, 1.3, sector.z - 3.9, false));
        this.scene.add(mesh(new THREE.BoxGeometry(0.9, 0.25, 0.64), warnMat, sector.x + 4.5, 1.3, sector.z - 3.9, false));
        break;
      }
      case "desenvolvimento": {
        // Ilhas de programação com múltiplos monitores brilhantes
        for (const ox of [-3.6, 3.8]) {
          this.scene.add(mesh(new THREE.BoxGeometry(2.2, 0.74, 1.0), lightDesk, sector.x + ox, 0.37, sector.z - 3.6));
          this.scene.add(mesh(new THREE.BoxGeometry(0.85, 0.48, 0.08), screenCyanMat, sector.x + ox - 0.45, 0.98, sector.z - 3.7, false));
          this.scene.add(mesh(new THREE.BoxGeometry(0.85, 0.48, 0.08), screenGreenMat, sector.x + ox + 0.45, 0.98, sector.z - 3.7, false));
        }
        break;
      }
      case "diretoria": {
        // Mesa executiva de mogno na parede oeste, cofre e plantas ornamentais
        this.scene.add(mesh(new THREE.BoxGeometry(1.3, 0.78, 3.4), woodMat, sector.x - 4.2, 0.39, sector.z - 1.5));
        this.scene.add(mesh(new THREE.BoxGeometry(0.1, 0.5, 0.9), screenCyanMat, sector.x - 4.2, 1.02, sector.z - 1.5, false));
        addPlant(sector.x - 4.8, sector.z - 4.8);
        addPlant(sector.x - 4.8, sector.z + 4.8);
        break;
      }
      case "suporte": {
        // Baias de atendimento técnico encostadas na parede leste
        for (const oz of [-3.5, 3.5]) {
          this.scene.add(mesh(new THREE.BoxGeometry(1.2, 0.75, 2.0), lightDesk, sector.x + 3.6, 0.38, sector.z + oz));
          this.scene.add(mesh(new THREE.BoxGeometry(0.1, 0.46, 0.8), screenCyanMat, sector.x + 3.7, 0.98, sector.z + oz, false));
        }
        break;
      }
      case "impressao": {
        // Impressoras multifuncionais industriais e pilhas de papel A4
        const printerMat = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.45 });
        const paperMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 });
        this.scene.add(mesh(new THREE.BoxGeometry(1.5, 1.15, 1.2), printerMat, sector.x + 3.4, 0.58, sector.z - 4.0));
        this.scene.add(mesh(new THREE.BoxGeometry(1.3, 0.18, 1.0), darkMetal, sector.x + 3.4, 1.2, sector.z - 4.0, false));
        this.scene.add(mesh(new THREE.BoxGeometry(0.9, 0.7, 0.7), paperMat, sector.x + 3.5, 0.35, sector.z + 4.0));
        break;
      }
      case "financeiro": {
        // Bancadas de auditoria contábil com telas verdes de balanço
        for (const ox of [-3.5, 3.5]) {
          this.scene.add(mesh(new THREE.BoxGeometry(2.2, 0.75, 1.0), woodMat, sector.x + ox, 0.38, sector.z + 3.8));
          this.scene.add(mesh(new THREE.BoxGeometry(0.9, 0.48, 0.08), screenGreenMat, sector.x + ox, 0.98, sector.z + 3.9, false));
        }
        break;
      }
      case "rh": {
        // Sala de entrevistas e recrutamento com sofá e mesa
        const sofaMat = new THREE.MeshStandardMaterial({ color: "#be185d", roughness: 0.65 });
        this.scene.add(mesh(new THREE.BoxGeometry(2.8, 0.55, 1.0), sofaMat, sector.x - 3.2, 0.28, sector.z + 3.8));
        this.scene.add(mesh(new THREE.BoxGeometry(2.2, 0.75, 1.0), lightDesk, sector.x + 3.2, 0.38, sector.z + 3.8));
        addPlant(sector.x - 4.8, sector.z + 3.8);
        break;
      }
      case "copa": {
        // Balcão de café, cafeteira expresso, geladeira inox e bebedouro
        const counterMat = new THREE.MeshStandardMaterial({ color: "#78350f", roughness: 0.5 });
        const fridgeMat = new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.3, metalness: 0.4 });
        const waterJugMat = new THREE.MeshStandardMaterial({
          color: "#38bdf8",
          transparent: true,
          opacity: 0.75,
          roughness: 0.15,
        });
        this.scene.add(mesh(new THREE.BoxGeometry(4.2, 0.85, 1.1), counterMat, sector.x - 1.5, 0.42, sector.z + 3.9));
        this.scene.add(mesh(new THREE.BoxGeometry(0.75, 0.62, 0.6), darkMetal, sector.x - 0.8, 1.12, sector.z + 3.9));
        this.scene.add(mesh(new THREE.BoxGeometry(1.1, 1.8, 1.0), fridgeMat, sector.x - 4.4, 0.9, sector.z + 3.8));
        // Bebedouro
        this.scene.add(mesh(new THREE.BoxGeometry(0.55, 0.95, 0.55), fridgeMat, sector.x + 4.5, 0.48, sector.z + 3.9));
        this.scene.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 14), waterJugMat, sector.x + 4.5, 1.2, sector.z + 3.9, false));
        break;
      }
      case "recepcao": {
        // Balcão de recepção, sofá de espera e plantas de boas-vindas
        const sofaMat = new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.65 });
        this.scene.add(mesh(new THREE.BoxGeometry(3.0, 0.95, 1.0), woodMat, sector.x + 2.5, 0.48, sector.z + 3.8));
        this.scene.add(mesh(new THREE.BoxGeometry(2.6, 0.52, 1.0), sofaMat, sector.x - 3.2, 0.26, sector.z + 3.8));
        addPlant(sector.x + 4.8, sector.z + 3.8);
        addPlant(sector.x - 4.8, sector.z + 3.8);
        break;
      }
    }
  }

  /** Só as estações do próprio jogador que ainda faltam; cinza quando a sabotagem bloqueia. */
  updateTaskBeacons(me: SuspeitoPrivate | null, snap: SuspeitoSnapshot): void {
    const wanted = new Map<string, { x: number; z: number; blocked: boolean; stationId: string }>();
    if (me && snap.phase === "working") {
      for (const t of me.tasks) {
        if (t.completed) continue;
        const blocked =
          !!snap.sabotage?.active &&
          ((snap.sabotage.type === "queda_rede" && (t.type === "termo" || t.type === "conexo" || t.type === "contexto")) ||
            (snap.sabotage.type === "impressora_travada" && t.sector === "impressao"));
        // Extrai ID da estação base (ex: task_termo_rh_p1 -> task_termo_rh)
        const stationMatch = TASK_STATIONS.find((s) => t.id.startsWith(s.id));
        wanted.set(t.id, { x: t.pos.x, z: t.pos.z, blocked, stationId: stationMatch?.id ?? "" });
      }
    }

    // Atualiza cor das telas físicas dos terminais 3D
    const activeStationIds = new Map<string, boolean>();
    for (const w of wanted.values()) {
      if (w.stationId) activeStationIds.set(w.stationId, w.blocked);
    }
    for (const [stId, screenMesh] of this.stationScreens.entries()) {
      if (activeStationIds.has(stId)) {
        screenMesh.material = activeStationIds.get(stId) ? this.screenBlockedMat : this.screenActiveMat;
      } else {
        screenMesh.material = this.screenIdleMat;
      }
    }

    for (const [id, g] of this.beacons) {
      if (!wanted.has(id)) {
        this.taskBeaconGroup.remove(g);
        this.beacons.delete(id);
      }
    }
    for (const [id, w] of wanted) {
      let g = this.beacons.get(id);
      if (!g) {
        g = this.makeBeacon(this.beaconMat, this.exclamationTex);
        g.position.set(w.x, 0, w.z);
        this.taskBeaconGroup.add(g);
        this.beacons.set(id, g);
      }
      const mat = w.blocked ? this.blockedBeaconMat : this.beaconMat;
      g.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mat;
        if ((o as THREE.Sprite).isSprite) ((o as THREE.Sprite).material as THREE.SpriteMaterial).color.set(w.blocked ? "#9e9e9e" : "#ffffff");
      });
    }

    const sab = snap.sabotage;
    this.fixBeacon.visible = !!sab?.active && snap.phase === "working";
    if (sab?.active) this.fixBeacon.position.set(sab.fixPos.x, 0, sab.fixPos.z);

    // Atualiza anel de alvo de eliminação e anel de interação no piso
    this.updateHighlightRings(me, snap);
  }

  private updateHighlightRings(me: SuspeitoPrivate | null, snap: SuspeitoSnapshot): void {
    // 1. Anel de mira sob a vítima do Sabotador
    if (me?.canKill && me.killTargetId && snap.phase === "working") {
      const target = snap.players.find((p) => p.id === me.killTargetId);
      if (target && target.alive) {
        this.killTargetRing.visible = true;
        this.killTargetRing.position.set(target.pos.x, 0.06, target.pos.z);
      } else {
        this.killTargetRing.visible = false;
      }
    } else {
      this.killTargetRing.visible = false;
    }

    // 2. Anel sob a estação / botão / corpo interagível
    const near = me?.nearbyInteractable;
    if (near && !near.blocked && snap.phase === "working") {
      let pos: { x: number; z: number } | null = null;
      if (near.kind === "emergency") {
        pos = EMERGENCY_BUTTON_POS;
      } else if (near.kind === "sabotage" && snap.sabotage?.active) {
        pos = snap.sabotage.fixPos;
      } else if (near.kind === "task") {
        const t = me?.tasks.find((x) => x.id === near.id);
        if (t) pos = t.pos;
      } else if (near.kind === "body") {
        const b = snap.bodies.find((x) => x.id === near.id);
        if (b) pos = b.pos;
      }

      if (pos) {
        this.interactHighlightRing.visible = true;
        this.interactHighlightRing.position.set(pos.x, 0.065, pos.z);
      } else {
        this.interactHighlightRing.visible = false;
      }
    } else {
      this.interactHighlightRing.visible = false;
    }
  }

  animate(now: number): void {
    const bob = Math.sin(now / 280) * 0.12;
    for (const g of this.beacons.values()) {
      const tip = g.getObjectByName("tip");
      if (tip) tip.position.y = 1.65 + bob;
    }
    const tip = this.fixBeacon.getObjectByName("tip");
    if (tip) {
      tip.position.y = 2.65 + bob * 1.5;
      const sc = 1.4 + Math.sin(now / 125) * 0.2;
      tip.scale.set(sc, sc, 1);
    }
    this.fixMat.emissiveIntensity = 0.6 + Math.abs(Math.sin(now / 240)) * 0.85;

    // Pulso dos anéis de alvo e interação
    if (this.killTargetRing.visible) {
      const s = 1 + Math.sin(now / 110) * 0.14;
      this.killTargetRing.scale.set(s, s, 1);
    }
    if (this.interactHighlightRing.visible) {
      const s = 1 + Math.sin(now / 150) * 0.1;
      this.interactHighlightRing.scale.set(s, s, 1);
    }
  }

  updateBodies(bodies: SuspeitoBody[], visibleBodyIds?: string[]): void {
    const activeIds = new Set(bodies.map((b) => b.id));

    // Remove corpos que sumiram
    for (const [id, item] of this.bodyMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(item.grp);
        item.char.dispose();
        this.bodyMeshes.delete(id);
      }
    }

    const paperMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 });

    // Adiciona novos corpos caídos no chão
    for (const b of bodies) {
      let item = this.bodyMeshes.get(b.id);
      if (!item) {
        const grp = new THREE.Group();
        grp.position.set(b.pos.x, 0, b.pos.z);

        // Boneco da vítima deitado de costas, para dar para reconhecer quem caiu
        const char = createCharacter(b.avatar);
        char.root.rotation.set(-Math.PI / 2, 0, 0);
        char.root.position.y = 0.18;
        const holder = new THREE.Group();
        holder.rotation.y = (b.pos.x * 7.3 + b.pos.z * 3.1) % (Math.PI * 2);
        holder.add(char.root);
        grp.add(holder);

        // Poça/marca de alerta + folhas de relatório espalhadas ao redor do corpo
        const mark = mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.02, 24), this.redMarkMat, 0, 0.015, 0, false);
        grp.add(mark);

        for (let i = 0; i < 3; i++) {
          const angle = i * 2.1 + 0.4;
          const sheet = mesh(
            new THREE.PlaneGeometry(0.32, 0.42),
            paperMat,
            Math.cos(angle) * 0.65,
            0.025 + i * 0.002,
            Math.sin(angle) * 0.65,
            false
          );
          sheet.rotation.x = -Math.PI / 2;
          sheet.rotation.z = angle * 1.7;
          grp.add(sheet);
        }

        // Ícone flutuante discreto de ocorrência (💀)
        const skullSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: this.bodyAlertTex, depthTest: false })
        );
        skullSprite.position.set(0, 1.35, 0);
        skullSprite.scale.set(0.85, 0.85, 1);
        grp.add(skullSprite);

        this.scene.add(grp);
        item = { grp, char };
        this.bodyMeshes.set(b.id, item);
      }

      // Visibilidade estrita: só exibe corpos desobstruídos no campo de visão
      item.grp.visible = visibleBodyIds ? visibleBodyIds.includes(b.id) : true;
    }
  }

  updateLighting(snap: SuspeitoSnapshot, me: SuspeitoPrivate | null): void {
    const lightsOut = snap.sabotage?.active && snap.sabotage.type === "falha_energia";
    const criticalSab = snap.sabotage?.active && snap.sabotage.critical;

    if (lightsOut && me?.role !== "sabotador") {
      this.ambientLight.intensity = 0.22;
      this.hemiLight.intensity = 0.15;
      this.dirLight.intensity = 0.28;
    } else if (lightsOut) {
      this.ambientLight.intensity = 0.45;
      this.hemiLight.intensity = 0.25;
      this.dirLight.intensity = 0.68;
    } else {
      this.ambientLight.intensity = 0.68;
      this.hemiLight.intensity = 0.42;
      this.dirLight.intensity = 1.18;
    }

    this.emergencyPulseLight.intensity = criticalSab ? 1.8 : 0;
  }

  dispose(): void {
    for (const item of this.bodyMeshes.values()) {
      this.scene.remove(item.grp);
      item.char.dispose();
    }
    this.bodyMeshes.clear();
    this.scene.remove(this.taskBeaconGroup);
    this.scene.remove(this.fixBeacon);
    this.scene.remove(this.killTargetRing);
    this.scene.remove(this.interactHighlightRing);
    this.exclamationTex.dispose();
    this.alertTex.dispose();
    this.bodyAlertTex.dispose();
  }
}
