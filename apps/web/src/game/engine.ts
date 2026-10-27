import * as THREE from "three";
import {
  ABILITIES,
  BALANCE,
  OFFICE_MAP,
  dirOf,
  moveCircle,
  resolveAbility,
  segmentBoxT,
  type AbilityId,
  type AvatarDNA,
  type PrivateState,
  type PublicPlayer,
  type Snapshot,
  type Vec2,
} from "@ec/shared";
import { net, setState } from "../store";
import { animateAvatar, buildAvatar, disposeAvatar, type AvatarRig } from "./avatarMesh";
import { FxSystem } from "./fx";
import { buildOffice } from "./officeScene";

interface Sample {
  t: number;
  x: number;
  z: number;
  yaw: number;
}

interface View {
  rig: AvatarRig;
  avatarKey: string;
  tag: THREE.Sprite;
  tagKey: string;
  buf: Sample[];
  last: PublicPlayer;
  bubble: THREE.Mesh;
  stars: THREE.Mesh;
  slowRing: THREE.Mesh;
  walk: number;
}

export type UiSignal = "hit" | "hurt" | "lock" | "unlock";

const INTERP_MS = 110;
const CAM_DIST = 4.6;
const CAM_SIDE = 1.05;
const HEAD_Y = 1.6;
const PITCH_MIN = -0.55;
const PITCH_MAX = 0.6;

const angleLerp = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

function makeTag(name: string, hp: number, maxHp: number, shield: number): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 72;
  const g = c.getContext("2d")!;
  g.font = "800 30px 'Bricolage Grotesque', sans-serif";
  g.textAlign = "center";
  g.lineWidth = 6;
  g.strokeStyle = "rgba(20,18,15,0.9)";
  g.strokeText(name, 128, 30);
  g.fillStyle = "#fffdf7";
  g.fillText(name, 128, 30);
  g.fillStyle = "rgba(20,18,15,0.85)";
  g.fillRect(48, 44, 160, 16);
  g.fillStyle = "#ff5a3d";
  g.fillRect(50, 46, 156 * Math.max(0, hp / maxHp), 12);
  if (shield > 0) {
    g.fillStyle = "#8f9cff";
    g.fillRect(50, 46, 156 * Math.min(1, shield / maxHp), 5);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(1.9, 0.53, 1);
  s.renderOrder = 5;
  return s;
}

/** Motor do cliente: renderiza snapshots, prevê o próprio movimento e envia intenções. */
export class Engine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
  private fx: FxSystem;
  private views = new Map<string, View>();
  private projectiles = new Map<number, THREE.Object3D>();
  private zones = new Map<number, THREE.Mesh>();
  private objective: THREE.Group;
  private objRing: THREE.Mesh;
  private objWall: THREE.Mesh;
  private snap: Snapshot | null = null;
  private snapAt = 0;
  private me: PrivateState | null = null;
  private avatars = new Map<string, AvatarDNA>();

  private yaw = 0;
  private pitch = -0.08;
  private keys = new Set<string>();
  private firing = false;
  private locked = false;
  private pred: Vec2 | null = null;
  private history: { t: number; x: number; z: number }[] = [];
  private localDodge = { until: 0, readyAt: 0, dir: { x: 0, z: 0 } };
  private localDash = { until: 0, dir: { x: 0, z: 0 }, speed: 0 };
  private aimYaw = 0;
  private aimDist = 10;
  private raf = 0;
  private lastFrame = performance.now();
  private inputTimer: ReturnType<typeof setInterval>;
  private cleanup: (() => void)[] = [];
  private initialized = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly myId: string,
    private readonly onUi: (s: UiSignal) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene.background = new THREE.Color("#b9c4cf");
    this.scene.fog = new THREE.Fog("#b9c4cf", 45, 95);
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#8a8070", 1.6));
    const sun = new THREE.DirectionalLight("#fff3dd", 2.2);
    sun.position.set(18, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 28, bottom: -28, near: 1, far: 80 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    buildOffice(this.scene);
    this.fx = new FxSystem(this.scene);

    this.objective = new THREE.Group();
    this.objRing = new THREE.Mesh(
      new THREE.RingGeometry(BALANCE.objectiveRadius - 0.25, BALANCE.objectiveRadius, 48),
      new THREE.MeshBasicMaterial({ color: "#ffe14d", side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    this.objRing.rotation.x = -Math.PI / 2;
    this.objRing.position.y = 0.05;
    this.objWall = new THREE.Mesh(
      new THREE.CylinderGeometry(BALANCE.objectiveRadius, BALANCE.objectiveRadius, 2.4, 48, 1, true),
      new THREE.MeshBasicMaterial({ color: "#ffe14d", transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.objWall.position.y = 1.2;
    this.objective.add(this.objRing, this.objWall);
    this.scene.add(this.objective);

    this.bindInput();
    this.inputTimer = setInterval(() => this.sendInput(), 1000 / 30);
    this.raf = requestAnimationFrame(this.loop);
  }

  setAvatars(list: { id: string; avatar: AvatarDNA }[]): void {
    for (const p of list) this.avatars.set(p.id, p.avatar);
  }

  // ---------- entrada ----------
  private bindInput(): void {
    const on = <E extends Event>(t: string, fn: (e: E) => void, target: EventTarget = window) => {
      target.addEventListener(t, fn as EventListener);
      this.cleanup.push(() => target.removeEventListener(t, fn as EventListener));
    };
    const canvas = this.canvas;
    const click = () => {
      if (!this.locked) canvas.requestPointerLock();
    };
    canvas.addEventListener("click", click);
    this.cleanup.push(() => canvas.removeEventListener("click", click));

    on(
      "pointerlockchange",
      () => {
        this.locked = document.pointerLockElement === canvas;
        if (!this.locked) this.firing = false;
        this.onUi(this.locked ? "lock" : "unlock");
      },
      document,
    );
    on<MouseEvent>("mousemove", (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * 0.0025;
      this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch - e.movementY * 0.0022));
    });
    on<MouseEvent>("mousedown", (e) => {
      if (this.locked && e.button === 0) this.firing = true;
    });
    on<MouseEvent>("mouseup", (e) => {
      if (e.button === 0) this.firing = false;
    });
    on("blur", () => {
      this.keys.clear();
      this.firing = false;
    });
    on<KeyboardEvent>("keydown", (e) => {
      const k = e.code;
      if (k === "Tab") {
        e.preventDefault();
        setState({ scoreboard: true });
        return;
      }
      if (e.repeat) {
        this.keys.add(k);
        return;
      }
      this.keys.add(k);
      if (k === "KeyQ") this.useAbility(0);
      if (k === "KeyE") this.useAbility(1);
      if (k === "KeyR") this.useAbility(2);
      if (k === "Space") {
        e.preventDefault();
        this.dodge();
      }
      if (k === "Digit1" || k === "Digit2" || k === "Digit3") {
        const opt = this.me?.options?.[Number(k.slice(-1)) - 1];
        if (opt) net.send({ t: "evolve", optionId: opt.id });
      }
    });
    on<KeyboardEvent>("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "Tab") setState({ scoreboard: false });
    });
  }

  private canAct(): boolean {
    const p = this.myView()?.last;
    return !!p && p.alive && this.snap?.phase === "active" && !this.me?.stunned;
  }

  private useAbility(slot: number): void {
    const ab = this.me?.abilities[slot];
    if (!ab || !this.canAct()) return;
    net.send({ t: "action", kind: "ability", slot, yaw: this.aimYaw, dist: this.aimDist });
    if (ab.readyInMs > 0) return;
    if (ABILITIES[ab.id].kind === "dash") {
      const prm = resolveAbility(this.me!.abilities.map((a) => ({ ...a, readyAt: 0 })), ab.id as AbilityId);
      const ms = prm.durationMs ?? 220;
      this.localDash = { until: performance.now() + ms, dir: dirOf(this.aimYaw), speed: (prm.range ?? 9) / (ms / 1000) };
    }
  }

  private dodge(): void {
    if (!this.canAct()) return;
    net.send({ t: "action", kind: "dodge", yaw: this.aimYaw });
    const now = performance.now();
    if (now < this.localDodge.readyAt || (this.me?.dodgeInMs ?? 0) > 0) return;
    const mv = this.moveVector();
    const len = Math.hypot(mv.x, mv.z);
    this.localDodge = { until: now + BALANCE.dodgeMs, readyAt: now + BALANCE.dodgeCooldownMs, dir: len > 0.1 ? { x: mv.x / len, z: mv.z / len } : dirOf(this.aimYaw) };
  }

  /** Direção de movimento no mundo a partir de WASD e do yaw da câmera. */
  private moveVector(): Vec2 {
    const f = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
    const r = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    let x = f * sy - r * cy;
    let z = f * cy + r * sy;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }

  private sendInput(): void {
    if (!this.snap || this.snap.phase === "finished") return;
    const mv = this.canAct() ? this.moveVector() : { x: 0, z: 0 };
    const fire = (this.firing || this.keys.has("KeyF")) && this.canAct();
    net.send({ t: "input", mx: mv.x, mz: mv.z, yaw: this.aimYaw, fire });
  }

  // ---------- rede ----------
  applySnapshot(s: Snapshot, me: PrivateState | null): void {
    const now = performance.now();
    this.snap = s;
    this.snapAt = now;
    this.me = me;
    const seen = new Set<string>();
    for (const p of s.players) {
      seen.add(p.id);
      const v = this.viewFor(p);
      v.buf.push({ t: now, x: p.x, z: p.z, yaw: p.yaw });
      if (v.buf.length > 20) v.buf.shift();
      const tagKey = `${p.name}|${p.hp}|${p.maxHp}|${p.shield}`;
      if (tagKey !== v.tagKey) {
        v.rig.root.remove(v.tag);
        (v.tag.material as THREE.SpriteMaterial).map?.dispose();
        v.tag.material.dispose();
        v.tag = makeTag(p.name, p.hp, p.maxHp, p.shield);
        v.tag.position.y = 2.45;
        if (p.id !== this.myId) v.rig.root.add(v.tag);
        v.tagKey = tagKey;
      }
      v.last = p;
      if (p.id === this.myId) this.reconcile(p, now);
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      this.scene.remove(v.rig.root);
      disposeAvatar(v.rig);
      this.views.delete(id);
    }

    if (!this.initialized) {
      const mine = s.players.find((p) => p.id === this.myId);
      if (mine) this.yaw = mine.yaw;
      this.initialized = true;
    }

    const ids = new Set<number>();
    for (const pr of s.projectiles) {
      ids.add(pr.id);
      if (!this.projectiles.has(pr.id)) {
        const m = this.projectileMesh(pr.kind);
        m.rotation.y = Math.atan2(pr.vx, pr.vz);
        this.scene.add(m);
        this.projectiles.set(pr.id, m);
      }
      this.projectiles.get(pr.id)!.userData = pr;
    }
    for (const [id, m] of this.projectiles) {
      if (ids.has(id)) continue;
      this.scene.remove(m);
      this.projectiles.delete(id);
    }

    const zids = new Set<number>();
    for (const z of s.zones) {
      zids.add(z.id);
      if (!this.zones.has(z.id)) {
        const m = new THREE.Mesh(
          new THREE.CircleGeometry(z.radius, 40),
          new THREE.MeshBasicMaterial({ color: ABILITIES[z.kind].color, transparent: true, opacity: 0.35, depthWrite: false }),
        );
        m.rotation.x = -Math.PI / 2;
        m.position.set(z.x, 0.06, z.z);
        this.scene.add(m);
        this.zones.set(z.id, m);
      }
    }
    for (const [id, m] of this.zones) {
      if (zids.has(id)) continue;
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      this.zones.delete(id);
    }

    const o = s.objective;
    this.objective.position.set(o.x, 0, o.z);
    const color = o.contested ? "#ff4d3d" : o.owner === this.myId ? "#1fae6b" : o.owner ? "#ff8a3d" : "#ffe14d";
    (this.objRing.material as THREE.MeshBasicMaterial).color.set(color);
    (this.objWall.material as THREE.MeshBasicMaterial).color.set(color);

    for (const e of s.events) {
      this.fx.handle(e, this.myId);
      if (e.type === "hit" && e.from === this.myId) this.onUi("hit");
      if (e.type === "hit" && e.target === this.myId) this.onUi("hurt");
    }
  }

  private reconcile(p: PublicPlayer, now: number): void {
    if (!p.alive || this.snap?.phase !== "active") {
      this.pred = p.alive ? { x: p.x, z: p.z } : null;
      this.history = [];
      return;
    }
    if (!this.pred) {
      this.pred = { x: p.x, z: p.z };
      return;
    }
    const lag = net.rtt / 2 + 1000 / BALANCE.tickHz;
    const target = now - lag;
    let ref = this.history[this.history.length - 1] ?? { t: now, ...this.pred };
    for (const h of this.history) if (Math.abs(h.t - target) < Math.abs(ref.t - target)) ref = h;
    const ex = p.x - ref.x;
    const ez = p.z - ref.z;
    if (Math.hypot(ex, ez) > 3) {
      this.pred = { x: p.x, z: p.z };
      this.history = [];
    } else {
      this.pred = { x: this.pred.x + ex * 0.25, z: this.pred.z + ez * 0.25 };
    }
  }

  private viewFor(p: PublicPlayer): View {
    const dna = this.avatars.get(p.id);
    const key = dna ? JSON.stringify(dna) : p.name;
    let v = this.views.get(p.id);
    if (v && v.avatarKey === key) return v;
    if (v) {
      this.scene.remove(v.rig.root);
      disposeAvatar(v.rig);
    }
    const rig = buildAvatar(dna ?? { name: p.name, skin: 1, hair: 1, hairColor: 0, beard: false, glasses: 0, shirt: 0, pants: 0, accessory: 0, height: 1 });
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 14), new THREE.MeshBasicMaterial({ color: "#8f9cff", transparent: true, opacity: 0.22, depthWrite: false }));
    bubble.position.y = 1;
    const stars = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 6, 12), new THREE.MeshBasicMaterial({ color: "#ffe14d" }));
    stars.rotation.x = Math.PI / 2;
    stars.position.y = 2.15;
    const slowRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 24), new THREE.MeshBasicMaterial({ color: "#5ad1ff", side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    slowRing.rotation.x = -Math.PI / 2;
    slowRing.position.y = 0.05;
    rig.root.add(bubble, stars, slowRing);
    const tag = makeTag(p.name, p.hp, p.maxHp, p.shield);
    tag.position.y = 2.45;
    if (p.id !== this.myId) rig.root.add(tag);
    this.scene.add(rig.root);
    v = { rig, avatarKey: key, tag, tagKey: "", buf: v?.buf ?? [], last: p, bubble, stars, slowRing, walk: 0 };
    this.views.set(p.id, v);
    return v;
  }

  private projectileMesh(kind: string): THREE.Object3D {
    const color = kind === "ball" ? "#f4f1ea" : (ABILITIES[kind as AbilityId]?.color ?? "#ffffff");
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
    let geo: THREE.BufferGeometry;
    if (kind === "A3") geo = new THREE.BoxGeometry(0.4, 0.02, 0.55);
    else if (kind === "B2") geo = new THREE.BoxGeometry(0.28, 0.07, 0.07);
    else if (kind === "B3") geo = new THREE.BoxGeometry(0.75, 0.55, 0.1);
    else geo = new THREE.IcosahedronGeometry(0.2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  }

  private myView(): View | undefined {
    return this.views.get(this.myId);
  }

  // ---------- quadro ----------
  private loop = (ms: number) => {
    const dt = Math.min(0.05, (ms - this.lastFrame) / 1000);
    this.lastFrame = ms;
    this.resize();
    this.step(dt, performance.now());
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width === Math.floor(w * this.renderer.getPixelRatio()) && this.canvas.height === Math.floor(h * this.renderer.getPixelRatio())) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private step(dt: number, now: number): void {
    if (this.keys.has("ArrowLeft")) this.yaw += dt * 2.2;
    if (this.keys.has("ArrowRight")) this.yaw -= dt * 2.2;
    if (this.keys.has("ArrowUp")) this.pitch = Math.min(PITCH_MAX, this.pitch + dt * 1.2);
    if (this.keys.has("ArrowDown")) this.pitch = Math.max(PITCH_MIN, this.pitch - dt * 1.2);

    // previsão local do próprio movimento
    if (this.pred && this.canAct()) {
      let dx: number;
      let dz: number;
      if (now < this.localDash.until) {
        dx = this.localDash.dir.x * this.localDash.speed * dt;
        dz = this.localDash.dir.z * this.localDash.speed * dt;
      } else if (now < this.localDodge.until) {
        const sp = BALANCE.dodgeDistance / (BALANCE.dodgeMs / 1000);
        dx = this.localDodge.dir.x * sp * dt;
        dz = this.localDodge.dir.z * sp * dt;
      } else {
        const mv = this.moveVector();
        const sp = BALANCE.moveSpeed * (this.me?.speedMult ?? 1);
        dx = mv.x * sp * dt;
        dz = mv.z * sp * dt;
      }
      this.pred = moveCircle(this.pred, dx, dz, BALANCE.playerRadius, OFFICE_MAP.boxes, { w: OFFICE_MAP.width, d: OFFICE_MAP.depth });
      this.history.push({ t: now, x: this.pred.x, z: this.pred.z });
      while (this.history.length && now - this.history[0].t > 1000) this.history.shift();
    }

    // jogadores
    const rt = now - INTERP_MS;
    for (const [id, v] of this.views) {
      const p = v.last;
      let x: number;
      let z: number;
      let yaw: number;
      if (id === this.myId && this.pred) {
        x = this.pred.x;
        z = this.pred.z;
        yaw = this.aimYaw;
      } else {
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
      }
      const prev = v.rig.root.position;
      const moved = Math.hypot(x - prev.x, z - prev.z) / Math.max(dt, 0.001);
      v.rig.root.position.set(x, 0, z);
      v.rig.root.rotation.y = yaw;
      v.rig.root.visible = p.alive && !(p.flags.includes("invuln") && !p.flags.includes("dodge") && !p.flags.includes("dash") && Math.floor(now / 90) % 2 === 0);
      v.walk += dt * Math.min(1, moved / BALANCE.moveSpeed);
      animateAvatar(v.rig, Math.min(1, moved / BALANCE.moveSpeed), v.walk, this.snap?.phase === "active");
      v.bubble.visible = p.flags.includes("shield");
      v.stars.visible = p.flags.includes("stun");
      v.stars.rotation.z += dt * 6;
      v.slowRing.visible = p.flags.includes("slow");
    }

    // projéteis extrapolados a partir do último snapshot
    const since = (now - this.snapAt) / 1000;
    for (const m of this.projectiles.values()) {
      const pr = m.userData as Snapshot["projectiles"][number];
      m.position.set(pr.x + pr.vx * since, BALANCE.shotHeight, pr.z + pr.vz * since);
      if (pr.kind === "ball" || pr.kind === "B3") m.rotation.x += dt * 12;
    }
    for (const z of this.zones.values()) z.scale.setScalar(1 + Math.sin(now / 160) * 0.03);
    this.objWall.rotation.y += dt * 0.3;

    this.fx.update(dt);
    this.updateCamera();
  }

  private updateCamera(): void {
    const me = this.myView();
    const base = me ? me.rig.root.position : new THREE.Vector3(0, 0, 0);
    const cp = Math.cos(this.pitch);
    const fwd = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const head = new THREE.Vector3(base.x, HEAD_Y, base.z);
    const offset = fwd.clone().multiplyScalar(-CAM_DIST).addScaledVector(right, CAM_SIDE).add(new THREE.Vector3(0, 0.6, 0));
    const want = head.clone().add(offset);
    const t = segmentBoxT({ x: head.x, z: head.z }, { x: want.x, z: want.z }, OFFICE_MAP.boxes, 0.25, 2);
    if (t !== null) want.copy(head).addScaledVector(offset, Math.max(0.15, t * 0.9));
    want.y = Math.max(0.5, want.y);
    this.camera.position.copy(want);
    this.camera.lookAt(want.clone().add(fwd));

    // mira: raio da retícula até a altura do tiro ou até um adversário
    let dist = 60;
    if (fwd.y < -0.02) dist = Math.min(dist, (BALANCE.shotHeight - want.y) / fwd.y);
    for (const [id, v] of this.views) {
      if (id === this.myId || !v.last.alive) continue;
      const c = new THREE.Vector3(v.rig.root.position.x, 1.1, v.rig.root.position.z);
      const along = c.clone().sub(want).dot(fwd);
      if (along <= 0 || along > dist) continue;
      const closest = want.clone().addScaledVector(fwd, along);
      if (Math.hypot(closest.x - c.x, closest.z - c.z) < 0.55 && Math.abs(closest.y - c.y) < 1.1) dist = along;
    }
    const point = want.clone().addScaledVector(fwd, dist);
    const px = point.x - base.x;
    const pz = point.z - base.z;
    const d = Math.hypot(px, pz);
    this.aimYaw = d > 1.2 ? Math.atan2(px, pz) : this.yaw;
    this.aimDist = Math.min(40, d);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    clearInterval(this.inputTimer);
    for (const c of this.cleanup) c();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    for (const v of this.views.values()) disposeAvatar(v.rig);
    this.renderer.dispose();
  }
}
