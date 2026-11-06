import * as THREE from "three";
import {
  EMERGENCY_BUTTON_POS,
  SECTORS,
  SUSPEITO_WALLS,
  TASK_STATIONS,
  type SuspeitoBody,
  type SuspeitoSnapshot,
  type SuspeitoTask,
} from "@ec/shared";

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
  ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 112, 20);
  ctx.fill();

  // Borda colorida característica do setor
  ctx.lineWidth = 8;
  ctx.strokeStyle = color;
  ctx.stroke();

  // Texto em caixa alta
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), 256, 64);

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

  // Círculo amarelo brilhante
  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 6;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  // Exclamação preta nítida
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 78px 'Arial Black', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", 64, 68);

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
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

  ctx.lineWidth = 6;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⚠️", 64, 70);

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

interface StationVisual {
  stationId: string;
  pos: { x: number; z: number };
  ringMesh: THREE.Mesh;
  screenMesh: THREE.Mesh;
  sprite: THREE.Sprite;
  baseRingMat: THREE.MeshStandardMaterial;
  activeRingMat: THREE.MeshStandardMaterial;
}

export class SuspeitoSceneManager {
  scene: THREE.Scene;
  bodyMeshes = new Map<string, THREE.Group>();
  stationVisuals = new Map<string, StationVisual>();
  sabotageSprite: THREE.Sprite;
  dirLight: THREE.DirectionalLight;
  ambientLight: THREE.AmbientLight;
  private animTime = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Iluminação balanceada
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xfff7e6, 1.1);
    this.dirLight.position.set(15, 30, 20);
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
    scene.add(this.dirLight);

    // Sprite flutuante de alerta de sabotagem
    const saboMat = new THREE.SpriteMaterial({
      map: createSabotageAlertTexture(),
      depthTest: false,
    });
    this.sabotageSprite = new THREE.Sprite(saboMat);
    this.sabotageSprite.scale.set(1.5, 1.5, 1);
    this.sabotageSprite.visible = false;
    scene.add(this.sabotageSprite);

    this.buildOfficeLayout();
    this.buildTaskStationsVisuals();
  }

  private buildOfficeLayout(): void {
    // 1. Chão geral do escritório (corredores e base)
    const baseFloorMat = new THREE.MeshStandardMaterial({
      color: "#d7d2cc",
      roughness: 0.8,
    });
    const baseFloor = mesh(new THREE.PlaneGeometry(70, 55), baseFloorMat, 0, -0.01, 0, false);
    baseFloor.rotation.x = -Math.PI / 2;
    this.scene.add(baseFloor);

    // 2. Setores individuais com piso, rodapé e placa no piso
    const borderMat = new THREE.MeshStandardMaterial({ color: "#78909c", roughness: 0.7 });
    for (const sector of Object.values(SECTORS)) {
      const sectorFloorMat = new THREE.MeshStandardMaterial({
        color: sector.floorColor,
        roughness: 0.6,
      });
      const floor = mesh(new THREE.PlaneGeometry(sector.w - 0.2, sector.d - 0.2), sectorFloorMat, sector.x, 0.01, sector.z, false);
      floor.rotation.x = -Math.PI / 2;
      this.scene.add(floor);

      // Linha de borda do setor
      const border = mesh(new THREE.BoxGeometry(sector.w, 0.04, sector.d), borderMat, sector.x, 0.02, sector.z, false);
      this.scene.add(border);

      // Placa de identificação do setor impressa no chão para navegação imediata
      const signTex = createSectorLabelTexture(sector.name, sector.color);
      const signMat = new THREE.MeshBasicMaterial({
        map: signTex,
        transparent: true,
        opacity: 0.95,
      });
      const signPlane = mesh(new THREE.PlaneGeometry(4.2, 1.1), signMat, sector.x, 0.03, sector.z - sector.d / 2 + 1.2, false);
      signPlane.rotation.x = -Math.PI / 2;
      this.scene.add(signPlane);

      this.buildSectorProps(sector);
    }

    // 3. Mesa de conferência central e Botão de Emergência
    const tableMat = new THREE.MeshStandardMaterial({ color: "#4e342e", roughness: 0.5 });
    const tableW = 7.0;
    const tableD = 3.6;
    const tableX = -4.0;
    const tableZ = 0;
    const table = mesh(new THREE.BoxGeometry(tableW, 0.75, tableD), tableMat, tableX, 0.375, tableZ);
    this.scene.add(table);

    // Botão de emergência vermelho no centro da mesa
    const btnBaseMat = new THREE.MeshStandardMaterial({ color: "#212121", roughness: 0.3 });
    const btnRedMat = new THREE.MeshStandardMaterial({
      color: "#d32f2f",
      emissive: "#b71c1c",
      roughness: 0.2,
    });
    const btnBase = mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.15, 16), btnBaseMat, EMERGENCY_BUTTON_POS.x, 0.75, EMERGENCY_BUTTON_POS.z);
    const btnCap = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 16), btnRedMat, EMERGENCY_BUTTON_POS.x, 0.85, EMERGENCY_BUTTON_POS.z);
    this.scene.add(btnBase);
    this.scene.add(btnCap);

    // 4. Paredes físicas e visuais construídas diretamente a partir de SUSPEITO_WALLS
    const wallMat = new THREE.MeshStandardMaterial({ color: "#90a4ae", roughness: 0.85 });
    const wallTrimMat = new THREE.MeshStandardMaterial({ color: "#455a64", roughness: 0.7 });
    const wallH = 1.9;

    for (const wall of SUSPEITO_WALLS) {
      if (wall.minX === -7.5 && wall.maxX === -0.5 && wall.minZ === -1.8 && wall.maxZ === 1.8) {
        continue;
      }

      const w = Math.max(0.2, wall.maxX - wall.minX);
      const d = Math.max(0.2, wall.maxZ - wall.minZ);
      const cx = (wall.minX + wall.maxX) / 2;
      const cz = (wall.minZ + wall.maxZ) / 2;

      const wallMesh = mesh(new THREE.BoxGeometry(w, wallH, d), wallMat, cx, wallH / 2, cz);
      this.scene.add(wallMesh);

      const trimMesh = mesh(new THREE.BoxGeometry(w + 0.05, 0.1, d + 0.05), wallTrimMat, cx, wallH + 0.05, cz, false);
      this.scene.add(trimMesh);
    }
  }

  private buildSectorProps(sector: typeof SECTORS[keyof typeof SECTORS]): void {
    const pcMat = new THREE.MeshStandardMaterial({ color: "#263238", roughness: 0.4 });

    if (sector.id === "servidores") {
      const rackMat = new THREE.MeshStandardMaterial({ color: "#1c2833", roughness: 0.4 });
      const ledMat = new THREE.MeshStandardMaterial({ color: "#00e676", emissive: "#00e676", emissiveIntensity: 0.9 });
      for (let i = -3; i <= 3; i += 3) {
        const rack = mesh(new THREE.BoxGeometry(1.5, 2.2, 1.0), rackMat, sector.x + i, 1.1, sector.z);
        const led = mesh(new THREE.BoxGeometry(1.2, 0.1, 0.05), ledMat, sector.x + i, 1.5, sector.z + 0.51);
        this.scene.add(rack);
        this.scene.add(led);
      }
    } else if (sector.id === "copa") {
      const counterMat = new THREE.MeshStandardMaterial({ color: "#8d6e63", roughness: 0.5 });
      const counter = mesh(new THREE.BoxGeometry(4, 0.8, 1.2), counterMat, sector.x, 0.4, sector.z);
      const coffeeMachine = mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6), pcMat, sector.x, 0.95, sector.z);
      this.scene.add(counter);
      this.scene.add(coffeeMachine);
    } else if (sector.id === "impressao") {
      const printerMat = new THREE.MeshStandardMaterial({ color: "#f5f5f5", roughness: 0.5 });
      const printer = mesh(new THREE.BoxGeometry(1.6, 1.1, 1.4), printerMat, sector.x, 0.55, sector.z);
      this.scene.add(printer);
    }
  }

  /**
   * Constrói estações de trabalho 3D reais com terminais, anéis de piso e marcadores flutuantes (!)
   */
  private buildTaskStationsVisuals(): void {
    const exclamationTex = createExclamationTexture();
    const deskMat = new THREE.MeshStandardMaterial({ color: "#37474f", roughness: 0.5 });
    const screenBaseMat = new THREE.MeshStandardMaterial({ color: "#263238", roughness: 0.3 });

    for (const station of TASK_STATIONS) {
      const group = new THREE.Group();
      group.position.set(station.pos.x, 0, station.pos.z);

      // 1. Mesa / pedestal da estação
      const desk = mesh(new THREE.BoxGeometry(1.4, 0.75, 0.9), deskMat, 0, 0.375, 0);
      group.add(desk);

      // 2. Monitor da estação
      const monBase = mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.25, 8), screenBaseMat, 0, 0.85, 0);
      group.add(monBase);

      const screenMat = new THREE.MeshStandardMaterial({
        color: "#0284c7",
        emissive: "#0369a1",
        emissiveIntensity: 0.4,
      });
      const screen = mesh(new THREE.BoxGeometry(0.85, 0.55, 0.08), screenMat, 0, 1.15, 0);
      group.add(screen);

      // 3. Anel indicador no chão
      const baseRingMat = new THREE.MeshStandardMaterial({
        color: "#607d8b",
        transparent: true,
        opacity: 0.4,
      });
      const activeRingMat = new THREE.MeshStandardMaterial({
        color: "#ffeb3b",
        emissive: "#fbc02d",
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.85,
      });
      const ringMesh = mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.03, 24), baseRingMat, 0, 0.02, 0, false);
      group.add(ringMesh);

      // 4. Marcador flutuante (!) com Sprite billboard
      const spriteMat = new THREE.SpriteMaterial({
        map: exclamationTex,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(0, 2.2, 0);
      sprite.scale.set(1.1, 1.1, 1);
      sprite.visible = false;
      group.add(sprite);

      this.scene.add(group);

      this.stationVisuals.set(station.id, {
        stationId: station.id,
        pos: { ...station.pos },
        ringMesh,
        screenMesh: screen,
        sprite,
        baseRingMat,
        activeRingMat,
      });
    }
  }

  /**
   * Atualiza visualmente quais estações pertencem às tarefas pendentes do jogador local
   */
  updateTaskBeacons(
    myTasks: SuspeitoTask[] | undefined,
    nearbyInteractableId: string | null | undefined,
    snap: SuspeitoSnapshot | null
  ): void {
    const pendingTaskMap = new Map<string, SuspeitoTask>();
    if (myTasks) {
      for (const t of myTasks) {
        if (!t.completed) pendingTaskMap.set(t.id, t);
      }
    }

    for (const [id, visual] of this.stationVisuals.entries()) {
      const isMyPendingTask = pendingTaskMap.has(id);
      const isNearby = nearbyInteractableId === id;

      if (isMyPendingTask) {
        visual.sprite.visible = true;
        visual.ringMesh.material = visual.activeRingMat;
        // Se o jogador estiver exatamente no alcance de interagir, realça ainda mais
        if (isNearby) {
          visual.sprite.scale.set(1.4, 1.4, 1);
          (visual.screenMesh.material as THREE.MeshStandardMaterial).emissive.set("#ffeb3b");
          (visual.screenMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9;
        } else {
          visual.sprite.scale.set(1.1, 1.1, 1);
          (visual.screenMesh.material as THREE.MeshStandardMaterial).emissive.set("#0284c7");
          (visual.screenMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4;
        }
      } else {
        visual.sprite.visible = false;
        visual.ringMesh.material = visual.baseRingMat;
        (visual.screenMesh.material as THREE.MeshStandardMaterial).emissive.set("#111827");
        (visual.screenMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.1;
      }
    }

    // Alerta de sabotagem ativa
    if (snap?.sabotage?.active) {
      this.sabotageSprite.visible = true;
      this.sabotageSprite.position.set(snap.sabotage.fixPos.x, 2.4, snap.sabotage.fixPos.z);
    } else {
      this.sabotageSprite.visible = false;
    }
  }

  /**
   * Animação contínua de pulso e bobbing dos ícones flutuantes
   */
  updateAnimation(dt: number): void {
    this.animTime += dt;
    const bob = Math.sin(this.animTime * 4) * 0.12;

    for (const visual of this.stationVisuals.values()) {
      if (visual.sprite.visible) {
        visual.sprite.position.y = 2.2 + bob;
      }
    }

    if (this.sabotageSprite.visible) {
      this.sabotageSprite.position.y = 2.4 + bob * 1.5;
      const s = 1.4 + Math.sin(this.animTime * 8) * 0.2;
      this.sabotageSprite.scale.set(s, s, 1);
    }
  }

  updateBodies(bodies: SuspeitoBody[], visibleBodyIds?: string[]): void {
    const activeIds = new Set(bodies.map((b) => b.id));

    // Remove corpos que sumiram
    for (const [id, grp] of this.bodyMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(grp);
        this.bodyMeshes.delete(id);
      }
    }

    // Adiciona novos corpos caídos no chão
    const bodyMat = new THREE.MeshStandardMaterial({ color: "#78909c", roughness: 0.8 });
    const redMarkMat = new THREE.MeshStandardMaterial({ color: "#c62828", roughness: 0.5 });

    for (const b of bodies) {
      if (!this.bodyMeshes.has(b.id)) {
        const grp = new THREE.Group();
        grp.position.set(b.pos.x, 0.1, b.pos.z);

        const torso = mesh(new THREE.BoxGeometry(0.8, 0.25, 0.4), bodyMat, 0, 0.12, 0);
        torso.rotation.y = Math.random() * Math.PI;
        const mark = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.02, 12), redMarkMat, 0, 0.01, 0, false);
        grp.add(torso);
        grp.add(mark);

        this.scene.add(grp);
        this.bodyMeshes.set(b.id, grp);
      }

      // Visibilidade estrita: só exibe corpos desobstruídos no campo de visão
      const grp = this.bodyMeshes.get(b.id);
      if (grp) {
        grp.visible = visibleBodyIds ? visibleBodyIds.includes(b.id) : true;
      }
    }
  }

  updateLighting(snap: SuspeitoSnapshot): void {
    if (snap.sabotage?.active && snap.sabotage.type === "falha_energia") {
      this.ambientLight.intensity = 0.2;
      this.dirLight.intensity = 0.3;
    } else {
      this.ambientLight.intensity = 0.75;
      this.dirLight.intensity = 1.2;
    }
  }

  dispose(): void {
    for (const grp of this.bodyMeshes.values()) {
      this.scene.remove(grp);
    }
    this.bodyMeshes.clear();
    this.scene.remove(this.sabotageSprite);
  }
}
