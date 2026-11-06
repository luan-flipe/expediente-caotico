import * as THREE from "three";
import {
  EMERGENCY_BUTTON_POS,
  SECTORS,
  SUSPEITO_WALLS,
  TASK_STATIONS,
  type SuspeitoBody,
  type SuspeitoSnapshot,
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

export class SuspeitoSceneManager {
  scene: THREE.Scene;
  bodyMeshes = new Map<string, THREE.Group>();
  taskBeaconGroup = new THREE.Group();
  dirLight: THREE.DirectionalLight;
  ambientLight: THREE.AmbientLight;

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

    this.buildOfficeLayout();
    this.buildTaskBeacons();
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

    // 2. Setores individuais com piso e rodapé temáticos
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

      this.buildSectorProps(sector);
    }

    // 3. Mesa de conferência central e Botão de Emergência
    const tableMat = new THREE.MeshStandardMaterial({ color: "#4e342e", roughness: 0.5 });
    // Mesa central: x in [-7.5, -0.5], z in [-1.8, 1.8]
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
      // Ignora o colisor da mesa pois a mesa já possui geometria própria customizada
      if (wall.minX === -7.5 && wall.maxX === -0.5 && wall.minZ === -1.8 && wall.maxZ === 1.8) {
        continue;
      }

      const w = Math.max(0.2, wall.maxX - wall.minX);
      const d = Math.max(0.2, wall.maxZ - wall.minZ);
      const cx = (wall.minX + wall.maxX) / 2;
      const cz = (wall.minZ + wall.maxZ) / 2;

      // Corpo da parede
      const wallMesh = mesh(new THREE.BoxGeometry(w, wallH, d), wallMat, cx, wallH / 2, cz);
      this.scene.add(wallMesh);

      // Moldura superior (rodapé de teto para contraste visual nítido)
      const trimMesh = mesh(new THREE.BoxGeometry(w + 0.05, 0.1, d + 0.05), wallTrimMat, cx, wallH + 0.05, cz, false);
      this.scene.add(trimMesh);
    }
  }

  private buildSectorProps(sector: typeof SECTORS[keyof typeof SECTORS]): void {
    const deskMat = new THREE.MeshStandardMaterial({ color: "#cfd8dc", roughness: 0.6 });
    const pcMat = new THREE.MeshStandardMaterial({ color: "#263238", roughness: 0.4 });
    const screenMat = new THREE.MeshStandardMaterial({
      color: "#00e676",
      emissive: "#00b0ff",
      emissiveIntensity: 0.5,
    });

    if (sector.id === "desenvolvimento" || sector.id === "suporte" || sector.id === "financeiro") {
      // Mesas com computadores
      const d1 = mesh(new THREE.BoxGeometry(2.4, 0.7, 1.2), deskMat, sector.x - 2, 0.35, sector.z);
      const d2 = mesh(new THREE.BoxGeometry(2.4, 0.7, 1.2), deskMat, sector.x + 2, 0.35, sector.z);
      this.scene.add(d1);
      this.scene.add(d2);

      const mon1 = mesh(new THREE.BoxGeometry(0.8, 0.5, 0.1), screenMat, sector.x - 2, 0.95, sector.z - 0.3);
      const mon2 = mesh(new THREE.BoxGeometry(0.8, 0.5, 0.1), screenMat, sector.x + 2, 0.95, sector.z - 0.3);
      this.scene.add(mon1);
      this.scene.add(mon2);
    } else if (sector.id === "servidores") {
      // Racks de servidores com luzes
      const rackMat = new THREE.MeshStandardMaterial({ color: "#1c2833", roughness: 0.4 });
      const ledMat = new THREE.MeshStandardMaterial({ color: "#00e676", emissive: "#00e676", emissiveIntensity: 0.9 });
      for (let i = -3; i <= 3; i += 3) {
        const rack = mesh(new THREE.BoxGeometry(1.5, 2.2, 1.0), rackMat, sector.x + i, 1.1, sector.z);
        const led = mesh(new THREE.BoxGeometry(1.2, 0.1, 0.05), ledMat, sector.x + i, 1.5, sector.z + 0.51);
        this.scene.add(rack);
        this.scene.add(led);
      }
    } else if (sector.id === "copa") {
      // Balcão de café e bebedouro
      const counterMat = new THREE.MeshStandardMaterial({ color: "#8d6e63", roughness: 0.5 });
      const counter = mesh(new THREE.BoxGeometry(4, 0.8, 1.2), counterMat, sector.x, 0.4, sector.z);
      const coffeeMachine = mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6), pcMat, sector.x, 0.95, sector.z);
      this.scene.add(counter);
      this.scene.add(coffeeMachine);
    } else if (sector.id === "impressao") {
      // Impressora grande de escritório
      const printerMat = new THREE.MeshStandardMaterial({ color: "#f5f5f5", roughness: 0.5 });
      const printer = mesh(new THREE.BoxGeometry(1.6, 1.1, 1.4), printerMat, sector.x, 0.55, sector.z);
      this.scene.add(printer);
    }
  }

  private buildTaskBeacons(): void {
    const beaconMat = new THREE.MeshStandardMaterial({
      color: "#ffeb3b",
      emissive: "#fbc02d",
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.7,
    });

    for (const station of TASK_STATIONS) {
      const ring = mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.05, 16), beaconMat, station.pos.x, 0.03, station.pos.z, false);
      const pillar = mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8), beaconMat, station.pos.x, 0.6, station.pos.z, false);
      this.taskBeaconGroup.add(ring);
      this.taskBeaconGroup.add(pillar);
    }
    this.scene.add(this.taskBeaconGroup);
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

        // Corpo deitado
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
    // Se há sabotagem de falha de energia, reduz iluminação
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
    this.scene.remove(this.taskBeaconGroup);
  }
}
