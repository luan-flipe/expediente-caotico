import * as THREE from "three";
import {
  EMERGENCY_BUTTON_POS,
  SECTORS,
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

    // Iluminação
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xfff7e6, 1.2);
    this.dirLight.position.set(20, 35, 25);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 100;
    const d = 40;
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
      color: "#e0e0e0",
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
      const border = mesh(new THREE.BoxGeometry(sector.w, 0.05, sector.d), borderMat, sector.x, 0.02, sector.z, false);
      this.scene.add(border);

      // Placa / Letreiro simples de identificação do setor na entrada
      this.buildSectorProps(sector);
    }

    // 3. Mesa de conferência central e Botão de Emergência
    const tableMat = new THREE.MeshStandardMaterial({ color: "#5d4037", roughness: 0.5 });
    const table = mesh(new THREE.BoxGeometry(9, 0.7, 4.5), tableMat, -4, 0.35, 0);
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

    // 4. Paredes perimetrais do escritório
    const wallMat = new THREE.MeshStandardMaterial({ color: "#90a4ae", roughness: 0.8 });
    const wallH = 1.4; // Altura estilizada que não obstrui visão aérea

    // Parede Norte, Sul, Leste, Oeste
    this.scene.add(mesh(new THREE.BoxGeometry(66, wallH, 0.5), wallMat, 0, wallH / 2, -23));
    this.scene.add(mesh(new THREE.BoxGeometry(66, wallH, 0.5), wallMat, 0, wallH / 2, 23));
    this.scene.add(mesh(new THREE.BoxGeometry(0.5, wallH, 46.5), wallMat, -31, wallH / 2, 0));
    this.scene.add(mesh(new THREE.BoxGeometry(0.5, wallH, 46.5), wallMat, 31, wallH / 2, 0));
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

  updateBodies(bodies: SuspeitoBody[]): void {
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
