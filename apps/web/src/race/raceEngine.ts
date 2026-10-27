import * as THREE from "three";
import {
  ITEM_IDS,
  NO_INPUT,
  RACE,
  TRACK,
  newKart,
  stepKart,
  type AvatarDNA,
  type ChairDNA,
  type HazardKind,
  type KartInput,
  type KartState,
  type RaceKartPublic,
  type RacePrivate,
  type RaceSnapshot,
} from "@ec/shared";
import { modelReady } from "../game/character";
import { net, setState } from "../store";
import { seatedRacer, type Racer3D } from "./chairMesh";
import { buildTrack } from "./trackScene";

interface Sample {
  t: number;
  x: number;
  z: number;
  heading: number;
}

interface KartView {
  r3d: Racer3D;
  key: string;
  body: THREE.Group;
  tag: THREE.Sprite | null;
  buf: Sample[];
  last: RaceKartPublic;
  sparks: THREE.Mesh[];
  flame: THREE.Mesh;
  bubble: THREE.Mesh;
  spin: number;
}

interface HazardView {
  obj: THREE.Object3D;
  x: number;
  z: number;
  vx: number;
  vz: number;
  at: number;
}

const DT = 1000 / 30;
const INTERP_MS = 110;
const SPARK_COLORS = ["#f2f2f2", "#3cc8ff", "#ff9a1f"];

const angleLerp = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

function nameTag(name: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 48;
  const g = c.getContext("2d")!;
  g.font = "800 30px 'Bricolage Grotesque', sans-serif";
  g.textAlign = "center";
  g.lineWidth = 6;
  g.strokeStyle = "rgba(20,18,15,0.9)";
  g.strokeText(name, 128, 34);
  g.fillStyle = "#fffdf7";
  g.fillText(name, 128, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(1.9, 0.36, 1);
  s.position.y = 2.05;
  s.renderOrder = 5;
  return s;
}

function boxTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#c89b62";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#fffdf7";
  g.fillRect(24, 30, 80, 44);
  g.fillStyle = "#1d1b17";
  g.font = "800 40px 'Bricolage Grotesque', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("?", 64, 54);
  g.fillStyle = "#8a6a43";
  g.fillRect(46, 92, 36, 12);
  return new THREE.CanvasTexture(c);
}

/** Cena da corrida: desenha snapshots, prevê a própria cadeira e envia intenções. */
export class RaceEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(68, 1, 0.1, 220);
  private views = new Map<string, KartView>();
  private boxes = new Map<number, THREE.Mesh>();
  private hazards = new Map<number, HazardView>();
  private people = new Map<string, { avatar: AvatarDNA; chair: ChairDNA }>();
  private snap: RaceSnapshot | null = null;
  private me: RacePrivate | null = null;
  private keys = new Set<string>();
  /** Previsão da própria cadeira: passo fixo de 30 Hz, igual ao servidor. */
  private pred: KartState | null = null;
  private prevPred: KartState | null = null;
  private clock = 0;
  private acc = 0;
  private seq = 0;
  /** Comandos enviados e ainda não confirmados pelo servidor, com o relógio local do passo. */
  private pending: { seq: number; input: KartInput; t: number }[] = [];
  /** Diferença visual que sobra de uma correção e some aos poucos (evita o tranco). */
  private visOffset = { x: 0, z: 0, h: 0 };
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camReady = false;
  private boxGeo = new THREE.BoxGeometry(0.8, 0.6, 0.8);
  private boxMat = new THREE.MeshStandardMaterial({ map: boxTexture(), roughness: 0.9 });
  private hazardMats = new Map<string, THREE.Material>();
  private raf = 0;
  private lastFrame = performance.now();
  private cleanup: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly myId: string,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color("#b9c4cf");
    this.scene.fog = new THREE.Fog("#b9c4cf", 55, 120);
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#8a8070", 1.7));
    const sun = new THREE.DirectionalLight("#fff3dd", 2.1);
    sun.position.set(25, 45, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 50, bottom: -50, near: 1, far: 120 });
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);
    buildTrack(this.scene);
    this.bindInput();
    this.raf = requestAnimationFrame(this.loop);
  }

  setPeople(list: { id: string; avatar: AvatarDNA; chair: ChairDNA }[]): void {
    for (const p of list) this.people.set(p.id, { avatar: p.avatar, chair: p.chair });
  }

  // ---------- entrada ----------
  private bindInput(): void {
    const on = <E extends Event>(t: string, fn: (e: E) => void) => {
      window.addEventListener(t, fn as EventListener);
      this.cleanup.push(() => window.removeEventListener(t, fn as EventListener));
    };
    on("blur", () => this.keys.clear());
    on<MouseEvent>("mousedown", (e) => {
      if (e.button === 0 && e.target === this.canvas) this.useItem();
    });
    on<KeyboardEvent>("keydown", (e) => {
      const k = e.code;
      if (k === "Tab" || k === "Space" || k.startsWith("Arrow")) e.preventDefault();
      if (k === "Tab") setState({ scoreboard: true });
      this.keys.add(k);
      if (e.repeat) return;
      if (k === "KeyE" || k === "KeyF") this.useItem();
      if (k === "KeyR" && this.snap?.phase === "active") net.send({ t: "krespawn" });
      if (import.meta.env.DEV && /^Digit[1-8]$/.test(k)) net.send({ t: "kdebug", item: ITEM_IDS[Number(k.slice(-1)) - 1] });
    });
    on<KeyboardEvent>("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "Tab") setState({ scoreboard: false });
    });
  }

  private useItem(): void {
    if (this.snap?.phase === "active" && this.me?.item) net.send({ t: "kitem" });
  }

  private input(): KartInput {
    if (this.snap?.phase !== "active" || this.me?.finished) return NO_INPUT;
    const has = (...c: string[]) => c.some((x) => this.keys.has(x));
    return {
      steer: (has("KeyD", "ArrowRight") ? 1 : 0) - (has("KeyA", "ArrowLeft") ? 1 : 0),
      throttle: has("KeyW", "ArrowUp") ? 1 : has("KeyS", "ArrowDown") ? -1 : 0,
      drift: has("Space", "ShiftLeft", "ShiftRight"),
    };
  }

  // ---------- rede ----------
  applySnapshot(s: RaceSnapshot, me: RacePrivate | null): void {
    const now = performance.now();
    this.snap = s;
    this.me = me;
    const seen = new Set<string>();
    for (const k of s.karts) {
      seen.add(k.id);
      const v = this.viewFor(k);
      v.buf.push({ t: now, x: k.x, z: k.z, heading: k.heading });
      if (v.buf.length > 20) v.buf.shift();
      v.last = k;
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      this.scene.remove(v.r3d.root);
      v.r3d.dispose();
      this.views.delete(id);
    }

    for (const b of s.boxes) {
      let m = this.boxes.get(b.id);
      if (!m) {
        m = new THREE.Mesh(this.boxGeo, this.boxMat);
        m.castShadow = true;
        m.position.set(b.x, 0.9, b.z);
        this.scene.add(m);
        this.boxes.set(b.id, m);
      }
      m.visible = b.ready;
    }

    const live = new Set<number>();
    for (const h of s.hazards) {
      live.add(h.id);
      let hv = this.hazards.get(h.id);
      if (!hv) {
        hv = { obj: this.hazardMesh(h.kind), x: h.x, z: h.z, vx: h.vx, vz: h.vz, at: now };
        this.scene.add(hv.obj);
        this.hazards.set(h.id, hv);
      }
      Object.assign(hv, { x: h.x, z: h.z, vx: h.vx, vz: h.vz, at: now });
    }
    for (const [id, hv] of this.hazards) {
      if (live.has(id)) continue;
      this.scene.remove(hv.obj);
      hv.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.hazards.delete(id);
    }

    if (me) this.reconcile(me);
  }

  /**
   * Reconciliação por comando numerado: parte do estado que o servidor confirmou (ackSeq)
   * e refaz localmente os comandos ainda não confirmados. Com a mesma física dos dois lados,
   * a previsão quase não muda; o que mudar vira um desvio visual que some em ~0,2 s.
   */
  private reconcile(me: RacePrivate): void {
    const k = me.kart;
    while (this.pending.length && this.pending[0].seq < me.ackSeq) this.pending.shift();
    const acked = this.pending[0]?.seq === me.ackSeq ? this.pending.shift()! : null;
    const base = acked ? acked.t : this.clock - this.pending.length * DT;
    const server: KartState = {
      ...newKart({ x: k.x, z: k.z }, k.heading),
      speed: k.speed,
      drifting: k.drifting,
      driftDir: k.driftDir,
      driftMs: k.driftMs,
      boostUntil: base + k.boostMs,
      spinUntil: base + k.spinMs,
      slipUntil: base + k.slipMs,
      frozenUntil: base + k.frozenMs,
    };
    const old = this.pred;
    if (!old || this.snap?.phase !== "active" || me.finished) {
      this.pred = this.prevPred = server;
      this.pending = [];
      this.visOffset = { x: 0, z: 0, h: 0 };
      return;
    }
    let next = server;
    for (const p of this.pending) next = stepKart(next, p.input, DT, p.t, TRACK).state;
    const dx = old.pos.x - next.pos.x;
    const dz = old.pos.z - next.pos.z;
    if (Math.hypot(dx, dz) > 4) {
      this.visOffset = { x: 0, z: 0, h: 0 };
    } else {
      this.visOffset.x += dx;
      this.visOffset.z += dz;
      this.visOffset.h += Math.atan2(Math.sin(old.heading - next.heading), Math.cos(old.heading - next.heading));
    }
    if (this.prevPred) {
      this.prevPred = { ...this.prevPred, pos: { x: this.prevPred.pos.x - dx, z: this.prevPred.pos.z - dz }, heading: this.prevPred.heading - (old.heading - next.heading) };
    }
    this.pred = next;
  }

  private viewFor(k: RaceKartPublic): KartView {
    const person = this.people.get(k.id);
    const key = JSON.stringify(person ?? k.name) + (modelReady() ? "|glb" : "");
    const old = this.views.get(k.id);
    if (old && old.key === key) return old;
    const r3d = seatedRacer(
      person?.avatar ?? { name: k.name, skin: 1, hair: 1, hairColor: 0, beard: false, glasses: 0, shirt: 0, pants: 0, accessory: 0, height: 1 },
      person?.chair ?? { seat: 0, base: 0, wheels: 0, back: 1, trinket: 0 },
    );
    // r3d.root fica no chão; body inclina e gira por cima dele
    const body = new THREE.Group();
    while (r3d.root.children.length) body.add(r3d.root.children[0]);
    r3d.root.add(body);
    const sparks = [-1, 1].map((s) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 6), new THREE.MeshBasicMaterial({ color: SPARK_COLORS[0], transparent: true, opacity: 0.9 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(s * 0.32, 0.1, -0.45);
      m.visible = false;
      body.add(m);
      return m;
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.8, 10), new THREE.MeshBasicMaterial({ color: "#ff8a2b", transparent: true, opacity: 0.85 }));
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(0, 0.35, -0.75);
    flame.visible = false;
    body.add(flame);
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.1, 18, 12), new THREE.MeshBasicMaterial({ color: "#8f9cff", transparent: true, opacity: 0.2, depthWrite: false }));
    bubble.position.y = 0.9;
    bubble.visible = false;
    r3d.root.add(bubble);
    const tag = k.id === this.myId ? null : nameTag(k.name);
    if (tag) r3d.root.add(tag);
    r3d.root.traverse((o) => (o.castShadow = o instanceof THREE.Mesh && o !== bubble));
    if (old) {
      this.scene.remove(old.r3d.root);
      old.r3d.dispose();
    }
    this.scene.add(r3d.root);
    const v: KartView = { r3d, key, body, tag, buf: old?.buf ?? [], last: k, sparks, flame, bubble, spin: 0 };
    this.views.set(k.id, v);
    return v;
  }

  private hazardMesh(kind: HazardKind): THREE.Object3D {
    const mat = (key: string, make: () => THREE.Material) => {
      let m = this.hazardMats.get(key);
      if (!m) this.hazardMats.set(key, (m = make()));
      return m;
    };
    if (kind === "poca") {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24), mat("poca", () => new THREE.MeshStandardMaterial({ color: "#5a3420", roughness: 0.15, transparent: true, opacity: 0.85 })));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.035;
      return m;
    }
    if (kind === "resma") {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.65), mat("papel", () => new THREE.MeshStandardMaterial({ color: "#fbfaf5" }))));
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.2, 0.67), mat("faixa", () => new THREE.MeshStandardMaterial({ color: "#2e86de" })));
      g.add(band);
      g.children.forEach((c) => (c.position.y = 0.28));
      return g;
    }
    if (kind === "grampo") {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.45), mat("grampo", () => new THREE.MeshStandardMaterial({ color: "#c7ccd3", metalness: 0.8, roughness: 0.25 })));
      m.position.y = 0.6;
      return m;
    }
    const shape = new THREE.Shape([new THREE.Vector2(0, 0.6), new THREE.Vector2(0.45, -0.35), new THREE.Vector2(0, -0.2), new THREE.Vector2(-0.45, -0.35)]);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat("aviao", () => new THREE.MeshStandardMaterial({ color: "#ffffff", side: THREE.DoubleSide })));
    m.rotation.x = -Math.PI / 2;
    const g = new THREE.Group();
    g.add(m);
    g.position.y = 1.2;
    return g;
  }

  // ---------- quadro ----------
  private loop = (ms: number): void => {
    const dt = Math.min(0.05, (ms - this.lastFrame) / 1000);
    this.lastFrame = ms;
    this.resize();
    const now = performance.now();

    if (this.pred && this.snap?.phase === "active" && !this.me?.finished) {
      this.acc += dt * 1000;
      const input = this.input();
      while (this.acc >= DT) {
        this.acc -= DT;
        this.clock += DT;
        // cada passo previsto vira um comando numerado: o servidor aplica um por tick, na mesma ordem
        const seq = ++this.seq;
        net.send({ t: "kinput", steer: input.steer, throttle: input.throttle, drift: input.drift, seq });
        this.pending.push({ seq, input, t: this.clock });
        if (this.pending.length > 90) this.pending.shift();
        this.prevPred = this.pred;
        this.pred = stepKart(this.pred, input, DT, this.clock, TRACK).state;
      }
    } else {
      this.acc = 0;
    }
    const decay = Math.exp(-dt * 12);
    this.visOffset.x *= decay;
    this.visOffset.z *= decay;
    this.visOffset.h *= decay;

    const renderT = now - INTERP_MS;
    for (const [id, v] of this.views) {
      let x: number;
      let z: number;
      let heading: number;
      const mine = id === this.myId && this.pred;
      if (mine) {
        // desenha entre os dois últimos passos de 30 Hz para não andar aos degraus em telas de 60 Hz ou mais
        const a = this.prevPred ?? this.pred!;
        const b = this.pred!;
        const f = Math.min(1, this.acc / DT);
        x = a.pos.x + (b.pos.x - a.pos.x) * f + this.visOffset.x;
        z = a.pos.z + (b.pos.z - a.pos.z) * f + this.visOffset.z;
        heading = angleLerp(a.heading, b.heading, f) + this.visOffset.h;
      } else {
        const buf = v.buf;
        let a = buf[0];
        let b = buf[buf.length - 1];
        for (let i = 0; i < buf.length - 1; i++) {
          if (buf[i].t <= renderT && buf[i + 1].t >= renderT) {
            a = buf[i];
            b = buf[i + 1];
            break;
          }
        }
        const span = b.t - a.t;
        const k = span > 0 ? Math.max(0, Math.min(1, (renderT - a.t) / span)) : 1;
        x = a.x + (b.x - a.x) * k;
        z = a.z + (b.z - a.z) * k;
        heading = angleLerp(a.heading, b.heading, k);
      }
      this.updateView(v, x, z, heading, dt, mine ? this.pred! : null);
    }

    for (const b of this.boxes.values()) {
      b.rotation.y += dt * 1.6;
      b.position.y = 0.9 + Math.sin(ms / 400 + b.position.x) * 0.12;
    }
    for (const h of this.hazards.values()) {
      const age = (now - h.at) / 1000;
      h.obj.position.x = h.x + h.vx * age;
      h.obj.position.z = h.z + h.vz * age;
      if (h.vx || h.vz) h.obj.rotation.y = Math.atan2(h.vx, h.vz);
    }

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };

  private updateView(v: KartView, x: number, z: number, heading: number, dt: number, own: KartState | null): void {
    const k = v.last;
    const flags = new Set(k.flags);
    const t = this.clock;
    const drift = own ? (own.drifting ? (own.driftMs >= RACE.driftLevel2Ms ? 2 : own.driftMs >= RACE.driftLevel1Ms ? 1 : 0) : -1) : k.drift;
    const driftDir = own ? own.driftDir : k.driftDir;
    const boosting = own ? t < own.boostUntil : flags.has("boost");
    const spinning = own ? t < own.spinUntil : flags.has("spin");
    v.r3d.root.position.set(x, 0, z);
    v.r3d.root.rotation.y = heading;
    v.spin = spinning ? v.spin + dt * 12 : 0;
    v.body.rotation.y = v.spin + (drift >= 0 ? driftDir * -0.35 : 0);
    v.body.rotation.z = drift >= 0 ? driftDir * 0.12 : 0;
    const flick = 0.7 + Math.random() * 0.6;
    for (const s of v.sparks) {
      s.visible = drift >= 0;
      if (s.visible) {
        (s.material as THREE.MeshBasicMaterial).color.set(SPARK_COLORS[drift]);
        s.scale.setScalar(drift === 0 ? 0.6 * flick : flick * (1 + drift * 0.3));
      }
    }
    v.flame.visible = boosting;
    if (boosting) v.flame.scale.set(1, flick, 1);
    v.bubble.visible = flags.has("pasta");
    v.r3d.root.visible = !flags.has("frozen") || Math.floor(performance.now() / 120) % 2 === 0;
  }

  private updateCamera(dt: number): void {
    const v = this.views.get(this.myId) ?? [...this.views.values()][0];
    if (!v) return;
    const p = v.r3d.root.position;
    const h = v.r3d.root.rotation.y;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const want = new THREE.Vector3(p.x - fx * 5.6, 3.3, p.z - fz * 5.6);
    const look = new THREE.Vector3(p.x + fx * 10, 0.6, p.z + fz * 10);
    if (!this.camReady) {
      this.camPos.copy(want);
      this.camLook.copy(look);
      this.camReady = true;
    }
    const k = 1 - Math.exp(-dt * 7);
    this.camPos.lerp(want, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    const boosting = this.pred ? this.clock < this.pred.boostUntil : false;
    const fov = boosting ? 80 : 68;
    if (Math.abs(this.camera.fov - fov) > 0.1) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 5);
      this.camera.updateProjectionMatrix();
    }
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.floor(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.floor(h * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const c of this.cleanup) c();
    // bonecos compartilham geometria do GLB: saem da cena antes da limpeza geral
    for (const v of this.views.values()) {
      this.scene.remove(v.r3d.root);
      v.r3d.dispose();
    }
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
  }
}
