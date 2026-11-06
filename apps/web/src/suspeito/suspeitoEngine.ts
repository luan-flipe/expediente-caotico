import * as THREE from "three";
import {
  moveSuspeitoPlayer,
  SUSPEITO_PLAYER_SPEED,
  type LobbyPlayer,
  type SuspeitoPrivate,
  type SuspeitoSnapshot,
  type Vec2,
} from "@ec/shared";
import { createCharacter, type Character } from "../game/character";
import { net } from "../store";
import { SuspeitoSceneManager } from "./suspeitoScene";

export interface SuspeitoKeyControls {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

const INTERP_MS = 110;
const CAM_HEIGHT = 16;
const CAM_BACK = 11;

interface PlayerView {
  char: Character;
  group: THREE.Group;
  buf: { t: number; x: number; z: number; yaw: number }[];
  ghost: boolean;
}

function angleLerp(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function setGhostLook(root: THREE.Object3D, ghost: boolean): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const next = mats.map((mat) => {
      const own = mat.userData.ghostClone ? mat : mat.clone();
      own.userData.ghostClone = true;
      own.transparent = ghost;
      own.opacity = ghost ? 0.38 : 1;
      own.depthWrite = !ghost;
      return own;
    });
    m.material = Array.isArray(m.material) ? next : next[0];
    m.castShadow = !ghost;
  });
}

export class SuspeitoEngine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sceneMgr: SuspeitoSceneManager;
  myId: string;

  private views = new Map<string, PlayerView>();
  private avatars = new Map<string, LobbyPlayer>();
  private keys: SuspeitoKeyControls = { up: false, down: false, left: false, right: false };
  private reqId: number | null = null;
  private lastTime = performance.now();
  private lastInputSend = 0;
  private lastSentMoving = false;
  private currentYaw = 0;
  private inputLocked = false;

  private snap: SuspeitoSnapshot | null = null;
  private me: SuspeitoPrivate | null = null;
  private pred: Vec2 | null = null;
  private history: { t: number; x: number; z: number }[] = [];
  private camTarget = new THREE.Vector3();
  private camReady = false;
  private visionEl: HTMLElement | null = null;

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
    this.camera.position.set(0, CAM_HEIGHT, CAM_BACK);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.sceneMgr = new SuspeitoSceneManager(this.scene);

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearKeys);

    this.loop();
  }

  setAvatars(players: LobbyPlayer[]): void {
    for (const p of players) {
      this.avatars.set(p.id, p);
    }
  }

  setVisionElement(el: HTMLElement | null): void {
    this.visionEl = el;
  }

  /** Trava o boneco enquanto um minigame, painel ou reunião estiver aberto. */
  setInputLocked(locked: boolean): void {
    if (locked && !this.inputLocked) this.clearKeys();
    this.inputLocked = locked;
  }

  private clearKeys = () => {
    this.keys = { up: false, down: false, left: false, right: false };
  };

  private onResize = () => {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  private setKey(e: KeyboardEvent, down: boolean): void {
    const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
    if (down && (tag === "input" || tag === "textarea" || this.inputLocked)) return;
    const k = e.key.toLowerCase();
    if (k === "w" || k === "arrowup") this.keys.up = down;
    if (k === "s" || k === "arrowdown") this.keys.down = down;
    if (k === "a" || k === "arrowleft") this.keys.left = down;
    if (k === "d" || k === "arrowright") this.keys.right = down;
    if (down && k.startsWith("arrow")) e.preventDefault();
  }

  private onKeyDown = (e: KeyboardEvent) => this.setKey(e, true);
  private onKeyUp = (e: KeyboardEvent) => this.setKey(e, false);

  private viewFor(id: string, fallbackAvatar: SuspeitoSnapshot["players"][number]["avatar"]): PlayerView {
    let v = this.views.get(id);
    if (!v) {
      const char = createCharacter(this.avatars.get(id)?.avatar ?? fallbackAvatar);
      const group = new THREE.Group();
      group.add(char.root);
      this.scene.add(group);
      v = { char, group, buf: [], ghost: false };
      this.views.set(id, v);
    }
    return v;
  }

  applySnapshot(snap: SuspeitoSnapshot, me: SuspeitoPrivate | null): void {
    const now = performance.now();
    const prevPhase = this.snap?.phase;
    this.snap = snap;
    this.me = me;

    this.sceneMgr.updateBodies(snap.bodies, me?.visibleBodyIds);
    this.sceneMgr.updateLighting(snap, me);
    this.sceneMgr.updateTaskBeacons(me, snap);

    const activeIds = new Set(snap.players.map((p) => p.id));
    for (const [id, v] of this.views) {
      if (!activeIds.has(id)) {
        this.scene.remove(v.group);
        v.char.dispose();
        this.views.delete(id);
      }
    }

    const teleported = prevPhase !== snap.phase && (snap.phase === "meeting" || snap.phase === "working");
    for (const p of snap.players) {
      const v = this.viewFor(p.id, p.avatar);
      const last = v.buf[v.buf.length - 1];
      if (teleported || (last && Math.hypot(last.x - p.pos.x, last.z - p.pos.z) > 4)) v.buf = [];
      v.buf.push({ t: now, x: p.pos.x, z: p.pos.z, yaw: p.yaw });
      while (v.buf.length > 2 && now - v.buf[1].t > INTERP_MS * 3) v.buf.shift();

      const ghost = !p.alive;
      if (ghost !== v.ghost) {
        setGhostLook(v.char.root, ghost);
        v.ghost = ghost;
      }

      const visible = p.id === this.myId || (me?.visiblePlayerIds ? me.visiblePlayerIds.includes(p.id) : p.alive);
      v.group.visible = visible && (p.alive || !(this.mePublic()?.alive ?? true) || p.id === this.myId);

      if (p.id === this.myId) this.reconcile(p.pos, now, teleported);
    }
  }

  private mePublic() {
    return this.snap?.players.find((p) => p.id === this.myId);
  }

  private reconcile(server: Vec2, now: number, hard: boolean): void {
    if (hard || !this.pred || this.snap?.phase !== "working") {
      this.pred = { ...server };
      this.history = [];
      return;
    }
    const lag = net.rtt / 2 + 1000 / 15;
    const target = now - lag;
    let ref = this.history[this.history.length - 1] ?? { t: now, ...this.pred };
    for (const h of this.history) if (Math.abs(h.t - target) < Math.abs(ref.t - target)) ref = h;
    const ex = server.x - ref.x;
    const ez = server.z - ref.z;
    if (Math.hypot(ex, ez) > 2.5) {
      this.pred = { ...server };
      this.history = [];
    } else {
      this.pred = { x: this.pred.x + ex * 0.2, z: this.pred.z + ez * 0.2 };
    }
  }

  private canMove(): boolean {
    const me = this.mePublic();
    return !!me && this.snap?.phase === "working" && !this.inputLocked;
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

    let mx = 0;
    let mz = 0;
    if (this.canMove()) {
      if (this.keys.up) mz -= 1;
      if (this.keys.down) mz += 1;
      if (this.keys.left) mx -= 1;
      if (this.keys.right) mx += 1;
    }

    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      this.currentYaw = Math.atan2(mx, mz);
    }
    const moving = len > 0;

    if (now - this.lastInputSend > 45 || moving !== this.lastSentMoving) {
      this.lastInputSend = now;
      this.lastSentMoving = moving;
      net.send({ t: "suspeitoInput", mx, mz, yaw: this.currentYaw });
    }

    const meAlive = this.mePublic()?.alive ?? true;
    if (this.pred && moving) {
      this.pred = moveSuspeitoPlayer(this.pred, mx, mz, dt, !meAlive);
    }
    if (this.pred) {
      this.history.push({ t: now, x: this.pred.x, z: this.pred.z });
      while (this.history.length && now - this.history[0].t > 1000) this.history.shift();
    }

    const rt = now - INTERP_MS;
    for (const [id, v] of this.views) {
      let x: number;
      let z: number;
      let yaw: number;
      if (id === this.myId && this.pred) {
        x = this.pred.x;
        z = this.pred.z;
        yaw = moving ? this.currentYaw : v.char.root.rotation.y;
      } else if (v.buf.length) {
        const b = v.buf;
        let a = b[0];
        let c = b[b.length - 1];
        for (let i = 0; i < b.length - 1; i++) {
          if (b[i].t <= rt && b[i + 1].t >= rt) {
            a = b[i];
            c = b[i + 1];
            break;
          }
        }
        const k = c.t === a.t ? 1 : Math.max(0, Math.min(1, (rt - a.t) / (c.t - a.t)));
        x = a.x + (c.x - a.x) * k;
        z = a.z + (c.z - a.z) * k;
        yaw = angleLerp(a.yaw, c.yaw, k);
      } else {
        continue;
      }
      const prev = v.group.position;
      const speed = Math.hypot(x - prev.x, z - prev.z) / Math.max(dt, 0.001);
      v.group.position.set(x, v.ghost ? 0.25 + Math.sin(now / 400) * 0.08 : 0, z);
      v.char.root.rotation.y = angleLerp(v.char.root.rotation.y, yaw, Math.min(1, dt * 14));
      v.char.update(dt, Math.min(1, speed / SUSPEITO_PLAYER_SPEED));
    }

    this.updateCamera(dt);
    this.updateVision();
    this.sceneMgr.animate(now);

    this.renderer.render(this.scene, this.camera);
    this.reqId = requestAnimationFrame(this.loop);
  };

  private updateCamera(dt: number): void {
    const v = this.views.get(this.myId);
    if (!v) return;
    const want = new THREE.Vector3(v.group.position.x, 0, v.group.position.z);
    if (!this.camReady) {
      this.camTarget.copy(want);
      this.camReady = true;
    } else {
      this.camTarget.lerp(want, 1 - Math.exp(-dt * 10));
    }
    this.camera.position.set(this.camTarget.x, CAM_HEIGHT, this.camTarget.z + CAM_BACK);
    this.camera.lookAt(this.camTarget.x, 0, this.camTarget.z);
  }

  private updateVision(): void {
    const el = this.visionEl;
    if (!el) return;
    const meeting = this.snap?.phase !== "working";
    const ghost = !(this.mePublic()?.alive ?? true);
    if (meeting || ghost || !this.me) {
      el.style.opacity = "0";
      return;
    }
    const v = this.views.get(this.myId);
    if (!v) return;
    const center = v.group.position.clone().project(this.camera);
    const edge = v.group.position.clone().add(new THREE.Vector3(this.me.visionRadius, 0, 0)).project(this.camera);
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const cx = ((center.x + 1) / 2) * w;
    const cy = ((1 - center.y) / 2) * h;
    const r = Math.abs(edge.x - center.x) / 2 * w;
    el.style.opacity = "1";
    el.style.background = `radial-gradient(circle at ${cx}px ${cy}px, transparent ${r * 0.82}px, rgba(8, 12, 20, 0.78) ${r * 1.08}px)`;
  }

  dispose(): void {
    if (this.reqId) cancelAnimationFrame(this.reqId);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearKeys);
    for (const v of this.views.values()) v.char.dispose();
    this.views.clear();
    this.sceneMgr.dispose();
    this.renderer.dispose();
  }
}
