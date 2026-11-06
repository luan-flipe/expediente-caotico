import * as THREE from "three";
import {
  EMERGENCY_BUTTON_POS,
  SECTORS,
  SUSPEITO_WALLS,
  type SuspeitoBody,
  type SuspeitoPrivate,
  type SuspeitoSnapshot,
} from "@ec/shared";
import { createCharacter, type Character } from "../game/character";

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

export class SuspeitoSceneManager {
  scene: THREE.Scene;
  bodyMeshes = new Map<string, { grp: THREE.Group; char: Character }>();
  taskBeaconGroup = new THREE.Group();
  private beacons = new Map<string, THREE.Group>();
  private fixBeacon: THREE.Group;
  private beaconMat = new THREE.MeshStandardMaterial({
    color: "#ffeb3b",
    emissive: "#fbc02d",
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.75,
  });
  private blockedBeaconMat = new THREE.MeshStandardMaterial({
    color: "#9e9e9e",
    emissive: "#424242",
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.6,
  });
  private exclamationTex = createExclamationTexture();
  private alertTex = createSabotageAlertTexture();
  private redMarkMat = new THREE.MeshStandardMaterial({ color: "#c62828", roughness: 0.5 });
  private fixMat = new THREE.MeshStandardMaterial({
    color: "#ff1744",
    emissive: "#d50000",
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.8,
  });
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
    this.scene.add(this.taskBeaconGroup);
    this.fixBeacon = this.makeBeacon(this.fixMat, this.alertTex, 1.0, 2.2);
    this.fixBeacon.visible = false;
    this.scene.add(this.fixBeacon);
  }

  private makeBeacon(mat: THREE.Material, tex: THREE.Texture, radius = 0.7, height = 1.2): THREE.Group {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(radius, radius, 0.05, 20), mat, 0, 0.03, 0, false));
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, height, 8), mat, 0, height / 2, 0, false));
    const tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    tip.name = "tip";
    tip.position.y = height + 0.45;
    tip.scale.set(1.1, 1.1, 1);
    g.add(tip);
    return g;
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
      const floor = mesh(new THREE.PlaneGeometry(sector.w - 0.2, sector.d - 0.2), sectorFloorMat, sector.x, 0.045, sector.z, false);
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
      const signPlane = mesh(new THREE.PlaneGeometry(4.2, 1.1), signMat, sector.x, 0.055, sector.z - sector.d / 2 + 1.2, false);
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

  /** Só as estações do próprio jogador que ainda faltam; cinza quando a sabotagem bloqueia. */
  updateTaskBeacons(me: SuspeitoPrivate | null, snap: SuspeitoSnapshot): void {
    const wanted = new Map<string, { x: number; z: number; blocked: boolean }>();
    if (me && snap.phase === "working") {
      for (const t of me.tasks) {
        if (t.completed) continue;
        const blocked =
          !!snap.sabotage?.active &&
          ((snap.sabotage.type === "queda_rede" && (t.type === "termo" || t.type === "conexo" || t.type === "contexto")) ||
            (snap.sabotage.type === "impressora_travada" && t.sector === "impressao"));
        wanted.set(t.id, { x: t.pos.x, z: t.pos.z, blocked });
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
  }

  animate(now: number): void {
    const bob = Math.sin(now / 300) * 0.12;
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
    this.fixMat.emissiveIntensity = 0.6 + Math.abs(Math.sin(now / 250)) * 0.8;
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

        const mark = mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.02, 20), this.redMarkMat, 0, 0.015, 0, false);
        grp.add(mark);

        this.scene.add(grp);
        item = { grp, char };
        this.bodyMeshes.set(b.id, item);
      }

      // Visibilidade estrita: só exibe corpos desobstruídos no campo de visão
      item.grp.visible = visibleBodyIds ? visibleBodyIds.includes(b.id) : true;
    }
  }

  updateLighting(snap: SuspeitoSnapshot, me: SuspeitoPrivate | null): void {
    // Se há sabotagem de falha de energia, reduz iluminação (sabotador enxerga no escuro)
    const lightsOut = snap.sabotage?.active && snap.sabotage.type === "falha_energia";
    if (lightsOut && me?.role !== "sabotador") {
      this.ambientLight.intensity = 0.2;
      this.dirLight.intensity = 0.3;
    } else if (lightsOut) {
      this.ambientLight.intensity = 0.45;
      this.dirLight.intensity = 0.7;
    } else {
      this.ambientLight.intensity = 0.75;
      this.dirLight.intensity = 1.2;
    }
  }

  dispose(): void {
    for (const item of this.bodyMeshes.values()) {
      this.scene.remove(item.grp);
      item.char.dispose();
    }
    this.bodyMeshes.clear();
    this.scene.remove(this.taskBeaconGroup);
    this.scene.remove(this.fixBeacon);
    this.exclamationTex.dispose();
    this.alertTex.dispose();
  }
}
