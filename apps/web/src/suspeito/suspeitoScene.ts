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
import {
  createBushMaterial,
  createFabricMaterial,
  createMonitorScreenMaterial,
  createOutdoorGroundMaterial,
  createRoomFloorMaterial,
  createServerRackMaterial,
  createWallMaterial,
  createWoodMaterial,
} from "../game/floorTextures";
import { juntarMalhas } from "../game/juntarMalhas";

function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  shadow = true,
): THREE.Mesh {
  geo.clearGroups();
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** Cria textura de placa de identificação de setor legível no chão com acabamento metálico chanfrado */
function createSectorLabelTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  // Fundo escuro metálico com gradiente
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "rgba(15, 23, 42, 0.95)");
  grad.addColorStop(1, "rgba(9, 14, 26, 0.96)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 112, 22);
  ctx.fill();

  // Brilho interno sutil no topo
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(14, 14, 484, 100, 18);
  ctx.stroke();

  // Borda colorida característica do setor
  ctx.lineWidth = 7;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 112, 22);
  ctx.stroke();

  // Faixas laterais decorativas
  ctx.fillStyle = color;
  ctx.fillRect(24, 28, 10, 72);
  ctx.fillRect(478, 28, 10, 72);

  // Texto em caixa alta com sombra leve
  ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 31px 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), 256, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
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

function createPropMaterials() {
  return {
    darkMetal: new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.35, metalness: 0.5 }),
    lightDesk: createWoodMaterial("#d7ccc8", 0.35, 2, 1),
    woodMat: createWoodMaterial("#6d4c41", 0.3, 2, 1),
    mahoganyMat: createWoodMaterial("#4e342e", 0.24, 2, 1),
    plantPotMat: new THREE.MeshStandardMaterial({ color: "#9a3412", roughness: 0.55 }),
    plantSoilMat: new THREE.MeshStandardMaterial({ color: "#271c19", roughness: 0.95 }),
    plantTrunkMat: createWoodMaterial("#5d4037", 0.75, 1, 1),
    plantLeafMat: createBushMaterial("#15803d", 2, 2),
    plantLeafLightMat: createBushMaterial("#22c55e", 2, 2),
    codeScreenMat: createMonitorScreenMaterial("code"),
    chartScreenMat: createMonitorScreenMaterial("chart"),
    dashScreenMat: createMonitorScreenMaterial("dashboard"),
    secScreenMat: createMonitorScreenMaterial("security"),
  };
}

type PropMaterials = ReturnType<typeof createPropMaterials>;

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
  private statics = new THREE.Group();
  private beacons = new Map<string, THREE.Group>();
  private beaconGeos = new Map<string, { base: THREE.BufferGeometry; pole: THREE.BufferGeometry }>();
  private bodyMarkGeo = new THREE.CylinderGeometry(0.92, 0.92, 0.02, 24);
  private paperGeo = new THREE.PlaneGeometry(0.32, 0.42);
  private paperMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 });
  private stationScreens = new Map<string, THREE.Mesh>();
  private fixBeacon: THREE.Group;
  private killTargetRing: THREE.Mesh;
  private interactHighlightRing: THREE.Mesh;
  private emergencyPulseLight: THREE.PointLight;
  private sectorAccentLights: { light: THREE.PointLight; baseIntensity: number }[] = [];

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
  private contactAoMat = new THREE.MeshBasicMaterial({
    color: "#090d16",
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  dirLight: THREE.DirectionalLight;
  ambientLight: THREE.AmbientLight;
  hemiLight: THREE.HemisphereLight;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Iluminação arquitetônica de escritório com contraste quente/frio e luz hemisférica
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.54);
    scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xf8fafc, 0x94a3b8, 0.48);
    this.hemiLight.position.set(0, 25, 0);
    scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff6e5, 1.25);
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
    this.dirLight.shadow.bias = -0.0004;
    this.dirLight.shadow.normalBias = 0.02;
    scene.add(this.dirLight);

    this.emergencyPulseLight = new THREE.PointLight(0xff1744, 0, 24);
    this.emergencyPulseLight.position.set(-4, 4.5, 0);
    scene.add(this.emergencyPulseLight);

    // Luzes de acento arquitetônicas (sem sombra dinâmica para custo zero de GPU)
    const addAccentLight = (color: number, intensity: number, dist: number, x: number, y: number, z: number) => {
      const l = new THREE.PointLight(color, intensity, dist);
      l.position.set(x, y, z);
      scene.add(l);
      this.sectorAccentLights.push({ light: l, baseIntensity: intensity });
    };
    addAccentLight(0xfff1d6, 0.9, 18, -4.0, 4.2, 0); // Mesa de Reunião Central (quente)
    addAccentLight(0x38bdf8, 0.75, 14, -7.5, 3.2, -16.5); // Servidores (azul ciano)
    addAccentLight(0xffe4b5, 0.65, 14, -7.5, 3.2, 16.5); // Copa (quente aconchegante)
    addAccentLight(0xffedd5, 0.65, 14, -22.5, 3.2, 0); // Diretoria (executivo quente)

    this.buildOfficeLayout();
    this.buildTaskStationTerminals();
    juntarMalhas(this.statics, this.stationScreens.values());
    this.statics.updateMatrixWorld(true);
    this.statics.traverse((o) => {
      o.matrixAutoUpdate = false;
    });
    this.scene.add(this.statics);

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
    const key = `${radius}|${height}`;
    let geos = this.beaconGeos.get(key);
    if (!geos) {
      geos = {
        base: new THREE.CylinderGeometry(radius, radius, 0.05, 24),
        pole: new THREE.CylinderGeometry(0.07, 0.07, height, 10),
      };
      this.beaconGeos.set(key, geos);
    }
    const g = new THREE.Group();
    g.add(mesh(geos.base, mat, 0, 0.03, 0, false));
    g.add(mesh(geos.pole, mat, 0, height / 2, 0, false));
    const tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    tip.name = "tip";
    tip.position.y = height + 0.45;
    tip.scale.set(1.15, 1.15, 1);
    g.add(tip);
    return g;
  }

  private buildOfficeLayout(): void {
    // 1. Piso de porcelanato corporativo marmorizado nos corredores gerais
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
    this.statics.add(baseFloor);

    // Calçada arquitetônica externa e gramado noturno ao redor do prédio
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.85, metalness: 0.08 });
    const sidewalk = mesh(new THREE.PlaneGeometry(74, 58), sidewalkMat, 0, -0.025, 0, false);
    sidewalk.rotation.x = -Math.PI / 2;
    this.statics.add(sidewalk);

    const outerSurroundMat = createOutdoorGroundMaterial({
      repeatX: 28,
      repeatY: 24,
      baseColor: "#1b2e22",
    });
    const outerGround = mesh(new THREE.PlaneGeometry(140, 120), outerSurroundMat, 0, -0.04, 0, false);
    outerGround.rotation.x = -Math.PI / 2;
    this.statics.add(outerGround);

    // 2. Setores individuais com texturas PBR procedurais (carpete, madeira, cerâmica, porcelanato, chapa metálica)
    const propMats = createPropMaterials();
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
        false,
      );
      floor.rotation.x = -Math.PI / 2;
      this.statics.add(floor);

      // Soleira e faixa de borda metálica na cor do setor
      const sectorBorderMat = new THREE.MeshStandardMaterial({
        color: sector.color,
        roughness: 0.38,
        metalness: 0.22,
      });
      const border = mesh(
        new THREE.BoxGeometry(sector.w, 0.04, sector.d),
        sectorBorderMat,
        sector.x,
        0.02,
        sector.z,
        false,
      );
      this.statics.add(border);

      // Placa de identificação do setor impressa no chão
      const signTex = createSectorLabelTexture(sector.name, sector.color);
      const signMat = new THREE.MeshBasicMaterial({
        map: signTex,
        transparent: true,
        opacity: 0.96,
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
        false,
      );
      signPlane.rotation.x = -Math.PI / 2;
      this.statics.add(signPlane);

      this.buildSectorProps(sector, propMats);
    }

    // 3. Mesa de conferência central, tapete executivo, cadeiras e Botão de Emergência
    this.buildConferenceCenter();

    // 4. Paredes físicas e visuais com textura de painel arquitetônico, sombra de contato AO, rodapé e moldura superior
    const wallBaseboardMat = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.48, metalness: 0.2 });
    const wallRailMat = new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.42, metalness: 0.35 });
    const wallTrimMat = new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.38, metalness: 0.42 });
    const wallH = 1.95;
    const wallMat = createWallMaterial("#cbd5e1");

    for (const wall of SUSPEITO_WALLS) {
      // Pula o colisor da mesa de reunião (já desenhada em buildConferenceCenter)
      if (wall.minX === -7.5 && wall.maxX === -0.5 && wall.minZ === -1.8 && wall.maxZ === 1.8) {
        continue;
      }

      const w = Math.max(0.2, wall.maxX - wall.minX);
      const d = Math.max(0.2, wall.maxZ - wall.minZ);
      const cx = (wall.minX + wall.maxX) / 2;
      const cz = (wall.minZ + wall.maxZ) / 2;

      // repetição da textura na UV, não no material: assim todas as paredes dividem um material e viram uma malha só
      const repX = Math.max(1, Math.round(Math.max(w, d) / 2.6));
      const wallGeo = new THREE.BoxGeometry(w, wallH, d);
      const uv = wallGeo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * repX);

      const wallMesh = mesh(wallGeo, wallMat, cx, wallH / 2, cz);
      this.statics.add(wallMesh);

      // Sombra de contato (Ambient Occlusion) suave no piso ao redor da parede
      const aoMesh = mesh(
        new THREE.PlaneGeometry(w + 0.38, d + 0.38),
        this.contactAoMat,
        cx,
        0.049,
        cz,
        false,
      );
      aoMesh.rotation.x = -Math.PI / 2;
      this.statics.add(aoMesh);

      // Rodapé escuro
      const baseMesh = mesh(
        new THREE.BoxGeometry(w + 0.05, 0.16, d + 0.05),
        wallBaseboardMat,
        cx,
        0.08,
        cz,
        false,
      );
      this.statics.add(baseMesh);

      // Friso metálico intermediário (bate-maca / acabamento corporativo)
      const railMesh = mesh(
        new THREE.BoxGeometry(w + 0.04, 0.05, d + 0.04),
        wallRailMat,
        cx,
        0.82,
        cz,
        false,
      );
      this.statics.add(railMesh);

      // Moldura superior
      const trimMesh = mesh(
        new THREE.BoxGeometry(w + 0.07, 0.1, d + 0.07),
        wallTrimMat,
        cx,
        wallH + 0.05,
        cz,
        false,
      );
      this.statics.add(trimMesh);
    }
  }

  private buildConferenceCenter(): void {
    const tableX = -4.0;
    const tableZ = 0;
    const tableW = 7.0;
    const tableD = 3.6;

    const woodTopMat = createWoodMaterial("#5d4037", 0.25, 3, 2);
    const woodEdgeMat = createWoodMaterial("#3e2723", 0.35, 3, 1);
    const metalLegMat = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.32, metalness: 0.65 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.25, metalness: 0.8 });
    const chairSeatMat = createFabricMaterial("#1e293b", 2, 2);
    const rugMat = createFabricMaterial("#1e3a5f", 4, 3);
    const rugBorderMat = new THREE.MeshStandardMaterial({ color: "#d97706", roughness: 0.65, metalness: 0.15 });

    // Tapete executivo sob a mesa de conferência com borda dourada
    this.statics.add(mesh(new THREE.BoxGeometry(tableW + 2.2, 0.016, tableD + 2.0), rugBorderMat, tableX, 0.048, tableZ, false));
    this.statics.add(mesh(new THREE.BoxGeometry(tableW + 1.9, 0.02, tableD + 1.7), rugMat, tableX, 0.05, tableZ, false));

    // Sombra de contato (AO) sob a mesa central
    const tableAo = mesh(new THREE.PlaneGeometry(tableW + 0.3, tableD + 0.3), this.contactAoMat, tableX, 0.053, tableZ, false);
    tableAo.rotation.x = -Math.PI / 2;
    this.statics.add(tableAo);

    // Base e tampo chanfrado de madeira nobre envernizada da mesa central
    this.statics.add(mesh(new THREE.BoxGeometry(tableW - 0.8, 0.68, tableD - 0.8), metalLegMat, tableX, 0.34, tableZ));
    this.statics.add(mesh(new THREE.BoxGeometry(tableW + 0.12, 0.09, tableD + 0.12), woodEdgeMat, tableX, 0.7, tableZ));
    this.statics.add(mesh(new THREE.BoxGeometry(tableW - 0.08, 0.06, tableD - 0.08), woodTopMat, tableX, 0.76, tableZ));
    // Calha central de tomadas/conectividade na mesa de reunião
    this.statics.add(mesh(new THREE.BoxGeometry(tableW - 2.4, 0.015, 0.28), metalLegMat, tableX, 0.792, tableZ, false));

    // Cadeiras executivas estofadas com base cromada e apoios de braço (dentro da sombra do colisor)
    const chairOffsetsX = [-2.2, -0.75, 0.75, 2.2];
    for (const ox of chairOffsetsX) {
      for (const side of [-1, 1]) {
        const cz = tableZ + side * (tableD / 2 - 0.14);
        // Pedestal cromado
        this.statics.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 8), chromeMat, tableX + ox, 0.12, cz, false));
        this.statics.add(mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.03, 10), metalLegMat, tableX + ox, 0.02, cz, false));
        // Assento e encosto estofados
        this.statics.add(mesh(new THREE.BoxGeometry(0.64, 0.12, 0.56), chairSeatMat, tableX + ox, 0.28, cz, false));
        this.statics.add(
          mesh(new THREE.BoxGeometry(0.62, 0.54, 0.12), chairSeatMat, tableX + ox, 0.58, cz + side * 0.22, false),
        );
        // Braços da poltrona
        this.statics.add(mesh(new THREE.BoxGeometry(0.06, 0.18, 0.42), metalLegMat, tableX + ox - 0.31, 0.41, cz, false));
        this.statics.add(mesh(new THREE.BoxGeometry(0.06, 0.18, 0.42), metalLegMat, tableX + ox + 0.31, 0.41, cz, false));
      }
    }

    // Notebooks e blocos de pauta sobre a mesa (nas pontas, longe do botão de emergência)
    const laptopMat = new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.3, metalness: 0.7 });
    const padMat = new THREE.MeshStandardMaterial({ color: "#fef9c3", roughness: 0.85 });
    for (const lx of [-2.2, 2.2]) {
      this.statics.add(mesh(new THREE.BoxGeometry(0.42, 0.02, 0.3), laptopMat, tableX + lx, 0.8, tableZ - 0.9, false));
      this.statics.add(mesh(new THREE.BoxGeometry(0.32, 0.015, 0.42), padMat, tableX + lx, 0.798, tableZ + 0.9, false));
    }

    // Botão de Emergência no centro da mesa com anel de alerta e cúpula translúcida
    const hazardMat = new THREE.MeshStandardMaterial({ color: "#facc15", roughness: 0.3, metalness: 0.2 });
    const btnBaseMat = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.28, metalness: 0.55 });
    const btnRedMat = new THREE.MeshStandardMaterial({
      color: "#ef4444",
      emissive: "#dc2626",
      emissiveIntensity: 0.8,
      roughness: 0.18,
    });
    const domeMat = new THREE.MeshStandardMaterial({
      color: "#e0f2fe",
      transparent: true,
      opacity: 0.3,
      roughness: 0.08,
      metalness: 0.1,
    });

    this.statics.add(
      mesh(
        new THREE.CylinderGeometry(0.68, 0.72, 0.06, 24),
        hazardMat,
        EMERGENCY_BUTTON_POS.x,
        0.8,
        EMERGENCY_BUTTON_POS.z,
        false,
      ),
    );
    this.statics.add(
      mesh(
        new THREE.CylinderGeometry(0.52, 0.58, 0.14, 24),
        btnBaseMat,
        EMERGENCY_BUTTON_POS.x,
        0.86,
        EMERGENCY_BUTTON_POS.z,
      ),
    );
    this.statics.add(
      mesh(
        new THREE.CylinderGeometry(0.36, 0.4, 0.22, 24),
        btnRedMat,
        EMERGENCY_BUTTON_POS.x,
        0.98,
        EMERGENCY_BUTTON_POS.z,
      ),
    );
    this.statics.add(
      mesh(
        new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        domeMat,
        EMERGENCY_BUTTON_POS.x,
        0.9,
        EMERGENCY_BUTTON_POS.z,
        false,
      ),
    );
  }

  /** Constrói terminais físicos 3D para cada estação de tarefa e ponto de conserto de sabotagem */
  private buildTaskStationTerminals(): void {
    const kioskBodyMat = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.36, metalness: 0.45 });
    const kioskBaseMat = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.5, metalness: 0.3 });
    const kioskTrimMat = new THREE.MeshStandardMaterial({ color: "#38bdf8", emissive: "#0284c7", emissiveIntensity: 0.4 });

    for (const st of TASK_STATIONS) {
      const offsetZ = st.pos.z < 0 ? -0.42 : 0.42;
      const kx = st.pos.x;
      const kz = st.pos.z + offsetZ;

      const kiosk = new THREE.Group();
      kiosk.position.set(kx, 0, kz);
      if (offsetZ > 0) kiosk.rotation.y = Math.PI;

      // Pedestal, coluna metálica e bandeja de teclado do totem corporativo
      kiosk.add(mesh(new THREE.CylinderGeometry(0.44, 0.5, 0.08, 18), kioskBaseMat, 0, 0.04, 0, false));
      kiosk.add(mesh(new THREE.BoxGeometry(0.56, 1.15, 0.34), kioskBodyMat, 0, 0.58, 0));
      kiosk.add(mesh(new THREE.BoxGeometry(0.58, 0.04, 0.36), kioskTrimMat, 0, 0.76, 0, false));

      const screen = mesh(new THREE.BoxGeometry(0.5, 0.38, 0.06), this.screenIdleMat, 0, 1.03, 0.16, false);
      screen.rotation.x = -0.25;
      kiosk.add(screen);
      this.stationScreens.set(st.id, screen);

      this.statics.add(kiosk);
    }

    // Painéis de emergência nas posições de conserto de sabotagem
    const sabBoxMat = new THREE.MeshStandardMaterial({ color: "#7f1d1d", roughness: 0.38, metalness: 0.3 });
    const sabStripeMat = new THREE.MeshStandardMaterial({
      color: "#facc15",
      emissive: "#ca8a04",
      emissiveIntensity: 0.45,
    });
    for (const fix of Object.values(SABOTAGE_FIX_POSITIONS)) {
      const fz = fix.pos.z + (fix.pos.z < 0 ? -0.45 : 0.45);
      this.statics.add(mesh(new THREE.BoxGeometry(0.78, 1.38, 0.36), sabBoxMat, fix.pos.x, 0.69, fz));
      this.statics.add(mesh(new THREE.BoxGeometry(0.64, 0.14, 0.4), sabStripeMat, fix.pos.x, 1.16, fz, false));
    }
  }

  private buildSectorProps(sector: (typeof SECTORS)[keyof typeof SECTORS], mats: PropMaterials): void {
    const {
      darkMetal,
      lightDesk,
      woodMat,
      mahoganyMat,
      plantPotMat,
      plantSoilMat,
      plantTrunkMat,
      plantLeafMat,
      plantLeafLightMat,
      codeScreenMat,
      chartScreenMat,
      dashScreenMat,
      secScreenMat,
    } = mats;

    const addPlant = (px: number, pz: number) => {
      this.statics.add(mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.44, 14), plantPotMat, px, 0.22, pz, false));
      this.statics.add(mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 14), plantPotMat, px, 0.42, pz, false));
      this.statics.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 12), plantSoilMat, px, 0.43, pz, false));
      this.statics.add(mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.45, 8), plantTrunkMat, px, 0.62, pz, false));
      this.statics.add(mesh(new THREE.IcosahedronGeometry(0.4, 1), plantLeafMat, px, 0.92, pz));
      this.statics.add(mesh(new THREE.IcosahedronGeometry(0.28, 1), plantLeafLightMat, px + 0.12, 1.16, pz - 0.08));
    };

    switch (sector.id) {
      case "arquivo": {
        // Estantes metálicas de arquivo em múltiplos níveis com caixas de papelão e pastas
        const shelfMat = new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.45, metalness: 0.45 });
        const kraftMat = createWoodMaterial("#b88655", 0.78, 1, 1);
        const boxColors = ["#eab308", "#3b82f6", "#ef4444", "#22c55e"];
        for (let i = -3.5; i <= 3.5; i += 3.5) {
          const sx = sector.x + i;
          const sz = sector.z - 4.1;
          this.statics.add(mesh(new THREE.BoxGeometry(2.2, 1.82, 0.72), shelfMat, sx, 0.91, sz));
          this.statics.add(mesh(new THREE.BoxGeometry(1.9, 0.34, 0.76), kraftMat, sx, 0.55, sz, false));
          const binderMat = new THREE.MeshStandardMaterial({
            color: boxColors[Math.abs(Math.round(i)) % boxColors.length],
            roughness: 0.5,
          });
          this.statics.add(mesh(new THREE.BoxGeometry(1.85, 0.36, 0.76), binderMat, sx, 1.28, sz, false));
        }
        break;
      }
      case "servidores": {
        // Racks de servidores 19" texturizados com painel colmeia e LEDs de atividade
        const rackBodyMat = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.32, metalness: 0.55 });
        const rackFaceMat = createServerRackMaterial();
        const ledMat = new THREE.MeshStandardMaterial({
          color: "#00e676",
          emissive: "#00e676",
          emissiveIntensity: 0.95,
        });
        for (const offset of [-4.2, 4.2]) {
          const rx = sector.x + offset;
          const rz = sector.z - 3.9;
          this.statics.add(mesh(new THREE.BoxGeometry(1.65, 1.88, 0.92), rackBodyMat, rx, 0.94, rz));
          this.statics.add(mesh(new THREE.BoxGeometry(1.52, 1.76, 0.95), rackFaceMat, rx, 0.94, rz, false));
          this.statics.add(mesh(new THREE.BoxGeometry(1.35, 0.08, 0.97), ledMat, rx, 1.55, rz, false));
        }
        break;
      }
      case "infra": {
        // Quadros elétricos industriais e bancos de baterias Nobreak com telemetria
        const panelMat = new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.42, metalness: 0.45 });
        const warnMat = new THREE.MeshStandardMaterial({
          color: "#f59e0b",
          emissive: "#d97706",
          emissiveIntensity: 0.45,
        });
        for (const side of [-4.5, 4.5]) {
          const ix = sector.x + side;
          const iz = sector.z - 3.9;
          this.statics.add(mesh(new THREE.BoxGeometry(1.65, 1.75, 0.62), panelMat, ix, 0.88, iz));
          this.statics.add(mesh(new THREE.BoxGeometry(0.95, 0.22, 0.66), warnMat, ix, 1.42, iz, false));
          this.statics.add(mesh(new THREE.BoxGeometry(0.75, 0.42, 0.66), secScreenMat, ix, 0.98, iz, false));
        }
        break;
      }
      case "desenvolvimento": {
        // Ilhas de programação com bancadas de madeira, múltiplos monitores com IDE de código e teclados
        for (const ox of [-3.6, 3.8]) {
          const dx = sector.x + ox;
          const dz = sector.z - 3.6;
          this.statics.add(mesh(new THREE.BoxGeometry(2.3, 0.74, 1.05), lightDesk, dx, 0.37, dz));
          this.statics.add(mesh(new THREE.BoxGeometry(0.88, 0.5, 0.07), codeScreenMat, dx - 0.48, 1.02, dz - 0.12, false));
          this.statics.add(mesh(new THREE.BoxGeometry(0.88, 0.5, 0.07), codeScreenMat, dx + 0.48, 1.02, dz - 0.12, false));
          // Suportes de monitor e teclados
          this.statics.add(mesh(new THREE.BoxGeometry(0.36, 0.02, 0.14), darkMetal, dx - 0.48, 0.76, dz + 0.18, false));
          this.statics.add(mesh(new THREE.BoxGeometry(0.36, 0.02, 0.14), darkMetal, dx + 0.48, 0.76, dz + 0.18, false));
        }
        break;
      }
      case "diretoria": {
        // Mesa executiva de mogno envernizado, tapete nobre, tela de balanço e plantas ornamentais
        const execRugMat = createFabricMaterial("#31102f", 3, 3);
        this.statics.add(
          mesh(new THREE.BoxGeometry(3.2, 0.018, 4.8), execRugMat, sector.x - 3.8, 0.05, sector.z - 1.5, false),
        );
        this.statics.add(mesh(new THREE.BoxGeometry(1.35, 0.78, 3.5), mahoganyMat, sector.x - 4.2, 0.39, sector.z - 1.5));
        this.statics.add(
          mesh(new THREE.BoxGeometry(0.1, 0.54, 1.05), chartScreenMat, sector.x - 4.2, 1.05, sector.z - 1.5, false),
        );
        addPlant(sector.x - 4.8, sector.z - 4.8);
        addPlant(sector.x - 4.8, sector.z + 4.8);
        break;
      }
      case "suporte": {
        // Baias de atendimento técnico com telas de fila de chamados
        for (const oz of [-3.5, 3.5]) {
          this.statics.add(mesh(new THREE.BoxGeometry(1.25, 0.75, 2.05), lightDesk, sector.x + 3.6, 0.38, sector.z + oz));
          this.statics.add(
            mesh(new THREE.BoxGeometry(0.1, 0.48, 0.85), dashScreenMat, sector.x + 3.7, 1.0, sector.z + oz, false),
          );
        }
        break;
      }
      case "impressao": {
        // Impressora multifuncional industrial detalhada e palete de resmas A4
        const printerMat = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.38, metalness: 0.15 });
        const paperMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.78 });
        const scanGlowMat = new THREE.MeshStandardMaterial({
          color: "#4ade80",
          emissive: "#22c55e",
          emissiveIntensity: 0.85,
        });
        const px = sector.x + 3.4;
        const pz = sector.z - 4.0;
        this.statics.add(mesh(new THREE.BoxGeometry(1.55, 1.15, 1.22), printerMat, px, 0.58, pz));
        this.statics.add(mesh(new THREE.BoxGeometry(1.35, 0.16, 1.02), darkMetal, px, 1.22, pz, false));
        this.statics.add(mesh(new THREE.BoxGeometry(1.1, 0.03, 0.75), scanGlowMat, px, 1.15, pz, false));
        // Palete de madeira com pilhas de papel A4
        this.statics.add(mesh(new THREE.BoxGeometry(1.05, 0.1, 0.85), woodMat, sector.x + 3.5, 0.05, sector.z + 4.0, false));
        this.statics.add(mesh(new THREE.BoxGeometry(0.92, 0.72, 0.72), paperMat, sector.x + 3.5, 0.45, sector.z + 4.0));
        break;
      }
      case "financeiro": {
        // Bancadas de auditoria contábil de madeira com telas de gráficos financeiros
        for (const ox of [-3.5, 3.5]) {
          const fx = sector.x + ox;
          const fz = sector.z + 3.8;
          this.statics.add(mesh(new THREE.BoxGeometry(2.25, 0.75, 1.05), woodMat, fx, 0.38, fz));
          this.statics.add(mesh(new THREE.BoxGeometry(0.92, 0.5, 0.08), chartScreenMat, fx, 1.02, fz + 0.12, false));
        }
        break;
      }
      case "rh": {
        // Sala de entrevistas com sofá estofado em tecido, tapete, mesa e planta
        const sofaMat = createFabricMaterial("#be185d", 2, 2);
        const rhRugMat = createFabricMaterial("#4c1d95", 3, 2);
        this.statics.add(
          mesh(new THREE.BoxGeometry(3.4, 0.018, 2.2), rhRugMat, sector.x - 3.2, 0.05, sector.z + 3.2, false),
        );
        // Assento, encosto e braços do sofá
        this.statics.add(mesh(new THREE.BoxGeometry(2.8, 0.42, 0.95), sofaMat, sector.x - 3.2, 0.21, sector.z + 3.8));
        this.statics.add(mesh(new THREE.BoxGeometry(2.8, 0.48, 0.24), sofaMat, sector.x - 3.2, 0.56, sector.z + 4.16, false));
        this.statics.add(mesh(new THREE.BoxGeometry(2.2, 0.75, 1.0), lightDesk, sector.x + 3.2, 0.38, sector.z + 3.8));
        this.statics.add(
          mesh(new THREE.BoxGeometry(0.78, 0.45, 0.07), dashScreenMat, sector.x + 3.2, 0.98, sector.z + 3.9, false),
        );
        addPlant(sector.x - 4.8, sector.z + 3.8);
        break;
      }
      case "copa": {
        // Balcão de marcenaria com tampo de granito claro, cafeteira expresso, geladeira inox e bebedouro
        const counterMat = createWoodMaterial("#78350f", 0.36, 2, 1);
        const graniteTopMat = new THREE.MeshStandardMaterial({ color: "#f1f5f9", roughness: 0.22, metalness: 0.1 });
        const fridgeMat = new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.24, metalness: 0.65 });
        const waterJugMat = new THREE.MeshStandardMaterial({
          color: "#38bdf8",
          transparent: true,
          opacity: 0.75,
          roughness: 0.12,
          metalness: 0.1,
        });
        this.statics.add(mesh(new THREE.BoxGeometry(4.2, 0.82, 1.1), counterMat, sector.x - 1.5, 0.41, sector.z + 3.9));
        this.statics.add(
          mesh(new THREE.BoxGeometry(4.3, 0.06, 1.16), graniteTopMat, sector.x - 1.5, 0.85, sector.z + 3.9, false),
        );
        // Máquina de café expresso profissional
        this.statics.add(mesh(new THREE.BoxGeometry(0.78, 0.62, 0.6), darkMetal, sector.x - 0.8, 1.18, sector.z + 3.9));
        // Geladeira Duplex Inox
        this.statics.add(mesh(new THREE.BoxGeometry(1.12, 1.85, 1.02), fridgeMat, sector.x - 4.4, 0.92, sector.z + 3.8));
        // Bebedouro de coluna com galão azul 20L
        this.statics.add(mesh(new THREE.BoxGeometry(0.55, 0.95, 0.55), fridgeMat, sector.x + 4.5, 0.48, sector.z + 3.9));
        this.statics.add(
          mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 16), waterJugMat, sector.x + 4.5, 1.2, sector.z + 3.9, false),
        );
        break;
      }
      case "recepcao": {
        // Balcão de recepção em madeira nobre e mármore, sofá de espera estofado, tapete e plantas
        const sofaMat = createFabricMaterial("#334155", 2, 2);
        const recepRugMat = createFabricMaterial("#1e3a5f", 3, 2);
        this.statics.add(
          mesh(new THREE.BoxGeometry(3.2, 0.018, 2.0), recepRugMat, sector.x - 3.2, 0.05, sector.z + 3.3, false),
        );
        this.statics.add(mesh(new THREE.BoxGeometry(3.0, 0.96, 1.02), woodMat, sector.x + 2.5, 0.48, sector.z + 3.8));
        this.statics.add(
          mesh(new THREE.BoxGeometry(0.82, 0.46, 0.07), dashScreenMat, sector.x + 2.5, 1.18, sector.z + 3.8, false),
        );
        this.statics.add(mesh(new THREE.BoxGeometry(2.6, 0.42, 0.96), sofaMat, sector.x - 3.2, 0.21, sector.z + 3.8));
        this.statics.add(
          mesh(new THREE.BoxGeometry(2.6, 0.46, 0.24), sofaMat, sector.x - 3.2, 0.54, sector.z + 4.16, false),
        );
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
          ((snap.sabotage.type === "queda_rede" &&
            (t.type === "termo" || t.type === "conexo" || t.type === "contexto")) ||
            (snap.sabotage.type === "impressora_travada" && t.sector === "impressao"));
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
        ((g.getObjectByName("tip") as THREE.Sprite).material as THREE.SpriteMaterial).dispose();
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
        if ((o as THREE.Sprite).isSprite)
          ((o as THREE.Sprite).material as THREE.SpriteMaterial).color.set(w.blocked ? "#9e9e9e" : "#ffffff");
      });
    }

    const sab = snap.sabotage;
    this.fixBeacon.visible = !!sab?.active && snap.phase === "working";
    if (sab?.active) this.fixBeacon.position.set(sab.fixPos.x, 0, sab.fixPos.z);

    this.updateHighlightRings(me, snap);
  }

  private updateHighlightRings(me: SuspeitoPrivate | null, snap: SuspeitoSnapshot): void {
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

    if (this.killTargetRing.visible) {
      const s = 1 + Math.sin(now / 110) * 0.14;
      this.killTargetRing.scale.set(s, s, 1);
    }
    if (this.interactHighlightRing.visible) {
      const s = 1 + Math.sin(now / 150) * 0.1;
      this.interactHighlightRing.scale.set(s, s, 1);
    }

    // Animação de queda de corpos recém-eliminados no escritório
    for (const item of this.bodyMeshes.values()) {
      const spawnedAt = item.grp.userData.spawnedAt as number | undefined;
      if (!spawnedAt) continue;
      const elapsed = now - spawnedAt;
      if (elapsed < 380) {
        const p = Math.min(1, elapsed / 340);
        const ease = 1 - Math.pow(1 - p, 3);
        item.char.root.rotation.x = -ease * (Math.PI / 2);
        item.char.root.position.y = ease * 0.18;
      } else {
        item.char.root.rotation.x = -Math.PI / 2;
        item.char.root.position.y = 0.18;
        delete item.grp.userData.spawnedAt;
      }
    }
  }

  updateBodies(bodies: SuspeitoBody[], visibleBodyIds?: string[]): void {
    const activeIds = new Set(bodies.map((b) => b.id));

    for (const [id, item] of this.bodyMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.removeBody(item);
        this.bodyMeshes.delete(id);
      }
    }

    for (const b of bodies) {
      let item = this.bodyMeshes.get(b.id);
      if (!item) {
        const grp = new THREE.Group();
        grp.position.set(b.pos.x, 0, b.pos.z);

        const char = createCharacter(b.avatar);
        char.root.rotation.set(-Math.PI / 2, 0, 0);
        char.root.position.y = 0.18;
        const holder = new THREE.Group();
        holder.rotation.y = (b.pos.x * 7.3 + b.pos.z * 3.1) % (Math.PI * 2);
        holder.add(char.root);
        grp.add(holder);

        const mark = mesh(this.bodyMarkGeo, this.redMarkMat, 0, 0.015, 0, false);
        grp.add(mark);

        for (let i = 0; i < 3; i++) {
          const angle = i * 2.1 + 0.4;
          const sheet = mesh(
            this.paperGeo,
            this.paperMat,
            Math.cos(angle) * 0.65,
            0.025 + i * 0.002,
            Math.sin(angle) * 0.65,
            false,
          );
          sheet.rotation.x = -Math.PI / 2;
          sheet.rotation.z = angle * 1.7;
          grp.add(sheet);
        }

        const skullSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: this.bodyAlertTex, depthTest: false }),
        );
        skullSprite.name = "skull";
        skullSprite.position.set(0, 1.35, 0);
        skullSprite.scale.set(0.85, 0.85, 1);
        grp.add(skullSprite);

        grp.userData.spawnedAt = performance.now();
        this.scene.add(grp);
        item = { grp, char };
        this.bodyMeshes.set(b.id, item);
      }

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
      this.scene.environmentIntensity = 0.15;
    } else if (lightsOut) {
      this.ambientLight.intensity = 0.45;
      this.hemiLight.intensity = 0.25;
      this.dirLight.intensity = 0.68;
      this.scene.environmentIntensity = 0.32;
    } else {
      this.ambientLight.intensity = 0.64;
      this.hemiLight.intensity = 0.46;
      this.dirLight.intensity = 1.22;
      this.scene.environmentIntensity = 0.55;
    }

    const accentScale = lightsOut ? 0.18 : 1.0;
    for (const item of this.sectorAccentLights) {
      item.light.intensity = item.baseIntensity * accentScale;
    }

    this.emergencyPulseLight.intensity = criticalSab ? 1.8 : 0;
  }

  private removeBody(item: { grp: THREE.Group; char: Character }): void {
    this.scene.remove(item.grp);
    item.char.dispose();
    ((item.grp.getObjectByName("skull") as THREE.Sprite).material as THREE.SpriteMaterial).dispose();
  }

  dispose(): void {
    for (const item of this.bodyMeshes.values()) this.removeBody(item);
    this.bodyMeshes.clear();
    this.scene.remove(this.statics);
    this.statics.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    for (const g of this.beaconGeos.values()) {
      g.base.dispose();
      g.pole.dispose();
    }
    this.bodyMarkGeo.dispose();
    this.paperGeo.dispose();
    this.paperMat.dispose();
    this.scene.remove(this.taskBeaconGroup);
    this.scene.remove(this.fixBeacon);
    this.scene.remove(this.killTargetRing);
    this.scene.remove(this.interactHighlightRing);
    this.exclamationTex.dispose();
    this.alertTex.dispose();
    this.bodyAlertTex.dispose();
  }
}
