import * as THREE from "three";
import type { LobbyPlayer, SuspeitoPrivate, SuspeitoSnapshot } from "@ec/shared";
import { createCharacter, type Character } from "../game/character";
import { net } from "../store";
import { SuspeitoSceneManager } from "./suspeitoScene";

export interface SuspeitoKeyControls {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export class SuspeitoEngine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sceneMgr: SuspeitoSceneManager;
  myId: string;

  private characters = new Map<string, { char: Character; group: THREE.Group }>();
  private avatars = new Map<string, LobbyPlayer>();
  private keys: SuspeitoKeyControls = { up: false, down: false, left: false, right: false };
  private reqId: number | null = null;
  private lastTime = performance.now();
  private lastInputSend = 0;
  private currentYaw = 0;

  private fpsFrames = 0;
  private fpsLastTime = performance.now();
  public onFpsUpdate?: (fps: number) => void;

  constructor(canvas: HTMLCanvasElement, myId: string) {
    this.myId = myId;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#eceff1");

    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.5, 120);
    this.camera.position.set(0, 16, 12);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(w, h, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.sceneMgr = new SuspeitoSceneManager(this.scene);

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    this.loop();
  }

  setAvatars(players: LobbyPlayer[]): void {
    for (const p of players) {
      this.avatars.set(p.id, p);
    }
  }

  private onResize = () => {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === "w" || k === "arrowup") this.keys.up = true;
    if (k === "s" || k === "arrowdown") this.keys.down = true;
    if (k === "a" || k === "arrowleft") this.keys.left = true;
    if (k === "d" || k === "arrowright") this.keys.right = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === "w" || k === "arrowup") this.keys.up = false;
    if (k === "s" || k === "arrowdown") this.keys.down = false;
    if (k === "a" || k === "arrowleft") this.keys.left = false;
    if (k === "d" || k === "arrowright") this.keys.right = false;
  };

  applySnapshot(snap: SuspeitoSnapshot, me: SuspeitoPrivate | null): void {
    this.sceneMgr.updateBodies(snap.bodies, me?.visibleBodyIds);
    this.sceneMgr.updateLighting(snap);
    this.sceneMgr.updateTaskBeacons(me?.tasks, me?.nearbyInteractable?.id, snap);

    const activeIds = new Set(snap.players.map((p) => p.id));
    const isMeeting = snap.phase === "meeting" || snap.phase === "voting" || snap.phase === "vote_result";

    // Remove bonecos que saíram
    for (const [id, item] of this.characters.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(item.group);
        this.characters.delete(id);
      }
    }

    // Atualiza ou instancia bonecos dos participantes
    for (const p of snap.players) {
      let item = this.characters.get(p.id);
      if (!item) {
        const lp = this.avatars.get(p.id);
        const char = createCharacter(lp?.avatar ?? p.avatar);
        const group = new THREE.Group();
        group.add(char.root);
        this.scene.add(group);
        item = { char, group };
        this.characters.set(p.id, item);
      }

      // Visibilidade estrita: só exibe quem estiver no campo de visão e sem paredes bloqueando
      const isVisible =
        p.id === this.myId ||
        isMeeting ||
        (me?.visiblePlayerIds ? me.visiblePlayerIds.includes(p.id) : true);

      if (p.alive && isVisible) {
        item.group.visible = true;
        item.group.position.set(p.pos.x, 0, p.pos.z);
        item.char.root.rotation.y = p.yaw;
      } else {
        // Se foi eliminado ou está atrás de parede, esconde modelo
        item.group.visible = false;
      }
    }

    // Segue o jogador local com a câmera
    const mePlayer = snap.players.find((p) => p.id === this.myId);
    if (mePlayer && mePlayer.alive) {
      const targetX = mePlayer.pos.x;
      const targetZ = mePlayer.pos.z;

      // Interpolação suave de câmera
      this.camera.position.x += (targetX - this.camera.position.x) * 0.1;
      this.camera.position.z += (targetZ + 11 - this.camera.position.z) * 0.1;
      this.camera.lookAt(this.camera.position.x, 0, this.camera.position.z - 11);
    }
  }

  private loop = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    // Medição e atualização do FPS em tempo real a cada ~100ms
    this.fpsFrames++;
    if (now - this.fpsLastTime >= 100) {
      const fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsLastTime));
      this.fpsFrames = 0;
      this.fpsLastTime = now;
      this.onFpsUpdate?.(fps);
    }

    // Processa input local
    let mx = 0;
    let mz = 0;
    if (this.keys.up) mz -= 1;
    if (this.keys.down) mz += 1;
    if (this.keys.left) mx -= 1;
    if (this.keys.right) mx += 1;

    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      this.currentYaw = Math.atan2(mx, -mz);
    }

    // Envia input periodicamente para o servidor
    if (now - this.lastInputSend > 45) {
      this.lastInputSend = now;
      net.send({
        t: "suspeitoInput",
        mx,
        mz,
        yaw: this.currentYaw,
      });
    }

    // Atualiza animações de pernas/caminhada dos personagens
    for (const item of this.characters.values()) {
      item.char.update(dt, 1);
    }

    // Animação de pulso/bobbing dos marcadores (!)
    this.sceneMgr.updateAnimation(dt);

    this.renderer.render(this.scene, this.camera);
    this.reqId = requestAnimationFrame(this.loop);
  };

  dispose(): void {
    if (this.reqId) cancelAnimationFrame(this.reqId);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.sceneMgr.dispose();
    this.renderer.dispose();
  }
}
