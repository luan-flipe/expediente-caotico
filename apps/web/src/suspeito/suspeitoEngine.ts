import * as THREE from "three";
import {
  moveSuspeitoPlayer,
  SUSPEITO_PLAYER_SPEED,
  SUSPEITO_WALLS,
  type LobbyPlayer,
  type SuspeitoPrivate,
  type SuspeitoSnapshot,
  type Vec2,
} from "@ec/shared";
import { createCharacter, type Character } from "../game/character";
import { applyQuality, setupSceneEnvironment } from "../quality";
import { getSettings, subscribeSettings, type Quality } from "../settings";
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
const VISION_SCALE = 0.5;

interface PlayerView {
  char: Character;
  group: THREE.Group;
  nameSprite: THREE.Sprite;
  nameKey: string;
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

function drawNameTagTexture(
  canvas: HTMLCanvasElement,
  name: string,
  isSabotadorTag: boolean,
  isMe: boolean,
  isGhost: boolean,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const label = isSabotadorTag ? `🔪 ${name}` : isMe ? `${name} (Você)` : name;
  ctx.font = "800 22px system-ui, -apple-system, sans-serif";
  const textW = Math.min(w - 28, ctx.measureText(label).width);
  const pillW = Math.max(96, textW + 28);
  const pillH = 38;
  const px = (w - pillW) / 2;
  const py = (h - pillH) / 2;

  ctx.fillStyle = isSabotadorTag
    ? "rgba(69, 10, 10, 0.9)"
    : isGhost
    ? "rgba(30, 41, 59, 0.65)"
    : "rgba(15, 23, 42, 0.88)";
  ctx.strokeStyle = isSabotadorTag
    ? "#ef4444"
    : isMe
    ? "#38bdf8"
    : "rgba(226, 232, 240, 0.7)";
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.roundRect(px, py, pillW, pillH, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isSabotadorTag ? "#fca5a5" : isMe ? "#bae6fd" : "#f8fafc";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, w / 2, h / 2 + 1, pillW - 16);
}

function createNameTagSprite(): { sprite: THREE.Sprite; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture } {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.3, 0.58, 1);
  sprite.position.set(0, 2.15, 0);
  sprite.renderOrder = 10;
  sprite.userData = { canvas, tex };
  return { sprite, canvas, tex };
}

/** Calcula a distância até a parede mais próxima ao longo de um raio 2D (origem ox,oz e direção dx,dz unitária). */
function raycastWallsDistance(ox: number, oz: number, dx: number, dz: number, maxDist: number): number {
  let closest = maxDist;
  for (let i = 0; i < SUSPEITO_WALLS.length; i++) {
    const w = SUSPEITO_WALLS[i];
    const minX = w.minX;
    const maxX = w.maxX;
    const minZ = w.minZ;
    const maxZ = w.maxZ;

    let tmin = 0;
    let tmax = closest;

    if (Math.abs(dx) < 1e-6) {
      if (ox < minX || ox > maxX) continue;
    } else {
      const invX = 1 / dx;
      let t1 = (minX - ox) * invX;
      let t2 = (maxX - ox) * invX;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }

    if (Math.abs(dz) < 1e-6) {
      if (oz < minZ || oz > maxZ) continue;
    } else {
      const invZ = 1 / dz;
      let t1 = (minZ - oz) * invZ;
      let t2 = (maxZ - oz) * invZ;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }

    if (tmin >= 0 && tmin < closest) {
      closest = tmin;
    }
  }
  return closest;
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
  private touchMove = { mx: 0, mz: 0 };
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
  private visionShown = false;
  private visionKey = { px: NaN, pz: NaN, camX: NaN, camZ: NaN, r: NaN, w: 0, h: 0, mode: -1 };
  private tmpVec = new THREE.Vector3();
  private tmpEdge = new THREE.Vector3();
  private mePub: SuspeitoSnapshot["players"][number] | undefined;
  private quality: Quality | null = null;
  private unsubSettings: () => void;

  private fpsFrames = 0;
  private fpsLastTime = performance.now();
  public onFpsUpdate?: (fps: number) => void;

  constructor(canvas: HTMLCanvasElement, myId: string) {
    this.myId = myId;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0f172a");
    this.scene.fog = new THREE.FogExp2("#0f172a", 0.0055);

    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.5, 120);
    this.camera.position.set(0, CAM_HEIGHT, CAM_BACK);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(w, h, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    setupSceneEnvironment(this.renderer, this.scene, 0.55);

    this.sceneMgr = new SuspeitoSceneManager(this.scene);
    this.applySettings();
    this.unsubSettings = subscribeSettings(() => this.applySettings());

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

  private applySettings(): void {
    const q = getSettings().quality;
    if (q === this.quality) return;
    this.quality = q;
    applyQuality(this.renderer, this.scene, this.sceneMgr.dirLight, q);
  }

  setVisionElement(el: HTMLElement | null): void {
    this.visionEl = el;
  }

  /** Trava o boneco enquanto um minigame, painel ou reunião estiver aberto. */
  setInputLocked(locked: boolean): void {
    if (locked && !this.inputLocked) this.clearKeys();
    this.inputLocked = locked;
  }

  /** Controle analógico virtual (toque / mobile). */
  setTouchMove(mx: number, mz: number): void {
    this.touchMove.mx = mx;
    this.touchMove.mz = mz;
  }

  private clearKeys = () => {
    this.keys = { up: false, down: false, left: false, right: false };
    this.touchMove = { mx: 0, mz: 0 };
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
      const { sprite } = createNameTagSprite();
      group.add(sprite);
      this.scene.add(group);
      v = { char, group, nameSprite: sprite, nameKey: "", buf: [], ghost: false };
      this.views.set(id, v);
    }
    return v;
  }

  applySnapshot(snap: SuspeitoSnapshot, me: SuspeitoPrivate | null): void {
    const now = performance.now();
    const prevPhase = this.snap?.phase;
    this.snap = snap;
    this.me = me;
    this.mePub = snap.players.find((p) => p.id === this.myId);

    this.sceneMgr.updateBodies(snap.bodies, me?.visibleBodyIds);
    this.sceneMgr.updateLighting(snap, me);
    this.sceneMgr.updateTaskBeacons(me, snap);

    const activeIds = new Set(snap.players.map((p) => p.id));
    for (const [id, v] of this.views) {
      if (!activeIds.has(id)) {
        this.scene.remove(v.group);
        v.char.dispose();
        (v.nameSprite.material as THREE.SpriteMaterial).map?.dispose();
        v.nameSprite.material.dispose();
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
        if (ghost && snap.phase === "working") {
          for (const other of snap.players) {
            if (!other.alive || other.id === p.id) continue;
            if (Math.hypot(other.pos.x - p.pos.x, other.pos.z - p.pos.z) <= 2.6) {
              this.views.get(other.id)?.char.play("throw");
              break;
            }
          }
        }
        v.ghost = ghost;
      }

      const isMe = p.id === this.myId;
      const isSabotadorTag =
        (isMe && me?.role === "sabotador") ||
        (!!me?.sabotadorTeammates && me.sabotadorTeammates.includes(p.id));
      const nextNameKey = `${p.name}|${isSabotadorTag ? 1 : 0}|${isMe ? 1 : 0}|${ghost ? 1 : 0}`;
      if (v.nameKey !== nextNameKey) {
        v.nameKey = nextNameKey;
        const { canvas, tex } = v.nameSprite.userData as {
          canvas: HTMLCanvasElement;
          tex: THREE.CanvasTexture;
        };
        if (canvas && tex) {
          drawNameTagTexture(canvas, p.name, isSabotadorTag, isMe, ghost);
          tex.needsUpdate = true;
        }
      }

      const visible = isMe || (me?.visiblePlayerIds ? me.visiblePlayerIds.includes(p.id) : p.alive);
      v.group.visible = visible && (p.alive || !(this.mePublic()?.alive ?? true) || isMe);

      if (isMe) this.reconcile(p.pos, now, teleported);
    }
  }

  private mePublic() {
    return this.mePub;
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
      if (mx === 0 && mz === 0 && (this.touchMove.mx !== 0 || this.touchMove.mz !== 0)) {
        mx = this.touchMove.mx;
        mz = this.touchMove.mz;
      }
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
    this.updateVision(now);
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

  private updateVision(now: number): void {
    const el = this.visionEl;
    if (!el) return;
    const meeting = this.snap?.phase !== "working";
    const ghost = !(this.mePublic()?.alive ?? true);
    if (meeting || ghost || !this.me) {
      if (this.visionShown) {
        el.style.opacity = "0";
        this.visionShown = false;
        this.visionKey.mode = -1;
      }
      return;
    }
    const v = this.views.get(this.myId);
    if (!v) return;

    const px = v.group.position.x;
    const pz = v.group.position.z;
    const radiusWorld = this.me.visionRadius;

    const domCanvas = this.renderer.domElement;
    const isCanvas = el instanceof HTMLCanvasElement;
    const scale = isCanvas ? VISION_SCALE : 1;
    const w = Math.max(1, Math.round((domCanvas.clientWidth || window.innerWidth) * scale));
    const h = Math.max(1, Math.round((domCanvas.clientHeight || window.innerHeight) * scale));

    // Cor da névoa de guerra (mais escura no blecaute, avermelhada em sabotagem crítica)
    const isPowerOut = this.snap?.sabotage?.active && this.snap.sabotage.type === "falha_energia";
    const isCritical = this.snap?.sabotage?.active && this.snap.sabotage.critical;
    const mode = isCritical ? 2 : isPowerOut ? 1 : 0;

    const k = this.visionKey;
    const camX = this.camera.position.x;
    const camZ = this.camera.position.z;
    if (
      mode !== 2 &&
      k.mode === mode &&
      k.w === w &&
      k.h === h &&
      k.r === radiusWorld &&
      Math.abs(k.px - px) < 1e-3 &&
      Math.abs(k.pz - pz) < 1e-3 &&
      Math.abs(k.camX - camX) < 1e-3 &&
      Math.abs(k.camZ - camZ) < 1e-3
    ) {
      return;
    }
    Object.assign(k, { px, pz, camX, camZ, r: radiusWorld, w, h, mode });

    const center = this.tmpVec.set(px, 0.2, pz).project(this.camera);
    const edge = this.tmpEdge.set(px + radiusWorld, 0.2, pz).project(this.camera);
    const cx = ((center.x + 1) / 2) * w;
    const cy = ((1 - center.y) / 2) * h;
    const r = (Math.abs(edge.x - center.x) / 2) * w;

    if (!this.visionShown) {
      el.style.opacity = "1";
      this.visionShown = true;
    }

    if (el instanceof HTMLCanvasElement) {
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
      }
      const ctx = el.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, w, h);

      if (isCritical) {
        const pulse = 0.8 + Math.sin(now * 0.008) * 0.06;
        ctx.fillStyle = `rgba(22, 8, 12, ${pulse.toFixed(2)})`;
      } else if (isPowerOut) {
        ctx.fillStyle = "rgba(4, 7, 14, 0.92)";
      } else {
        ctx.fillStyle = "rgba(8, 12, 22, 0.83)";
      }
      ctx.fillRect(0, 0, w, h);

      // Raycast 2D contra SUSPEITO_WALLS para projetar sombras reais das paredes
      const RAY_COUNT = 96;
      const maxRayDist = radiusWorld + 1.4;
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";

      ctx.beginPath();
      for (let i = 0; i < RAY_COUNT; i++) {
        const angle = (i / RAY_COUNT) * Math.PI * 2;
        const dx = Math.cos(angle);
        const dz = Math.sin(angle);
        const hitDist = raycastWallsDistance(px, pz, dx, dz, maxRayDist);
        // Penetra levemente na parede (+0.45m) para iluminar a face da parede mas sombrear atrás dela
        const finalDist = Math.min(maxRayDist, hitDist + 0.45);
        const wx = px + dx * finalDist;
        const wz = pz + dz * finalDist;
        this.tmpVec.set(wx, 0.2, wz).project(this.camera);
        const sx = ((this.tmpVec.x + 1) / 2) * w;
        const sy = ((1 - this.tmpVec.y) / 2) * h;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.clip();

      const grad = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r * 1.12);
      grad.addColorStop(0, "rgba(0, 0, 0, 1)");
      grad.addColorStop(0.75, "rgba(0, 0, 0, 0.96)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Halo suave imediato ao redor do próprio personagem para nunca esconder o boneco em quinas
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      const selfGrad = ctx.createRadialGradient(cx, cy, r * 0.04, cx, cy, r * 0.26);
      selfGrad.addColorStop(0, "rgba(0, 0, 0, 0.95)");
      selfGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = selfGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      el.style.background = `radial-gradient(circle at ${cx}px ${cy}px, transparent ${r * 0.82}px, rgba(8, 12, 20, 0.78) ${r * 1.08}px)`;
    }
  }

  dispose(): void {
    if (this.reqId) cancelAnimationFrame(this.reqId);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearKeys);
    this.unsubSettings();
    for (const v of this.views.values()) {
      v.char.dispose();
      (v.nameSprite.material as THREE.SpriteMaterial).map?.dispose();
      v.nameSprite.material.dispose();
    }
    this.views.clear();
    this.sceneMgr.dispose();
    this.renderer.dispose();
  }
}
