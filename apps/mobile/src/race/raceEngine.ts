import * as THREE from "three";
import { AppState } from "react-native";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import {
  ITEM_IDS,
  NO_INPUT,
  pointAt,
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
import { getState, net } from "../store";
import { MUSICA_CORRIDA } from "../three/assets";
import { Canvas2D } from "../three/canvas";
import { chairModelReady, seatedRacer, type Racer3D } from "../three/chairMesh";
import { modelReady } from "../three/character";
import { createCommander, preloadCommander, type Commander } from "../three/commander";
import { createRenderer, fitRenderer } from "../three/gl";
import { buildTrack } from "../three/trackScene";

export type RaceUiSignal = "boost1" | "boost2" | "wall" | "hit" | "blocked";

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
/** Baixo o bastante para o helicóptero e os itens continuarem audíveis. */
const MUSIC_VOLUME = 0.35;

const angleLerp = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

function nameTag(name: string): THREE.Sprite {
  const g = new Canvas2D(256, 48);
  g.font = "800 30px 'Bricolage Grotesque', sans-serif";
  g.textAlign = "center";
  g.lineWidth = 6;
  g.strokeStyle = "rgba(20,18,15,0.9)";
  g.strokeText(name, 128, 34);
  g.fillStyle = "#fffdf7";
  g.fillText(name, 128, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.texture(), depthTest: false, transparent: true }));
  s.scale.set(1.9, 0.36, 1);
  s.position.y = 2.05;
  s.renderOrder = 5;
  return s;
}

function boxTexture(): THREE.DataTexture {
  const g = new Canvas2D(128, 128);
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
  return g.texture();
}

function disposeKartView(scene: THREE.Scene, v: KartView): void {
  scene.remove(v.r3d.root);
  if (v.tag) {
    (v.tag.material as THREE.SpriteMaterial).map?.dispose();
    v.tag.material.dispose();
  }
  for (const m of [...v.sparks, v.flame, v.bubble]) {
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  }
  v.r3d.dispose();
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
  private snapAt = 0;
  private commander: Commander | null = null;
  /** Trilha de fundo: toca em loop durante toda a corrida, sem posição na cena. */
  private music: AudioPlayer | null = null;
  private muted = getState().muted;
  private me: RacePrivate | null = null;
  /** Controles da tela: volante analógico, acelerador/ré e derrapagem. */
  private controls: KartInput = NO_INPUT;
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
  private lastWallAt = 0;
  private appSub: { remove(): void };

  constructor(
    private readonly gl: ExpoWebGLRenderingContext,
    private readonly myId: string,
    private readonly onUi?: (s: RaceUiSignal) => void,
  ) {
    this.renderer = createRenderer(gl);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color("#b9c4cf");
    this.scene.fog = new THREE.Fog("#b9c4cf", 55, 120);
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#8a8070", 1.7));
    const sun = new THREE.DirectionalLight("#fff3dd", 2.1);
    sun.position.set(25, 45, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 50, bottom: -50, near: 1, far: 120 });
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);
    buildTrack(this.scene);
    this.attachCommander();
    this.startMusic();
    this.appSub = AppState.addEventListener("change", (s) => {
      const active = s === "active";
      if (!this.raf) return;
      if (active) this.music?.play();
      else this.music?.pause();
      this.commander?.setActive(active);
    });
    this.raf = requestAnimationFrame(this.loop);
  }

  private attachCommander(): void {
    this.commander = createCommander(true);
    if (this.commander) {
      this.commander.setMuted(this.muted);
      this.scene.add(this.commander.root);
      return;
    }
    // se a partida reabriu antes do GLB de 3,1 MB terminar, entra assim que ficar pronto
    void preloadCommander().then((ok) => {
      if (!ok || !this.raf || this.commander) return;
      this.commander = createCommander(true);
      if (this.commander) {
        this.commander.setMuted(this.muted);
        this.commander.setActive(AppState.currentState === "active");
        this.scene.add(this.commander.root);
      }
    });
  }

  setPeople(list: { id: string; avatar: AvatarDNA; chair: ChairDNA }[]): void {
    for (const p of list) this.people.set(p.id, { avatar: p.avatar, chair: p.chair });
  }

  private startMusic(): void {
    try {
      this.music = createAudioPlayer(MUSICA_CORRIDA);
      this.music.loop = true;
      this.music.volume = this.muted ? 0 : MUSIC_VOLUME;
      this.music.play();
    } catch (err) {
      console.warn("música da corrida não carregou", err);
    }
  }

  // ---------- entrada (controles na tela) ----------
  setControls(input: KartInput): void {
    this.controls = input;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.music) this.music.volume = muted ? 0 : MUSIC_VOLUME;
    this.commander?.setMuted(muted);
  }

  useItem(): void {
    if (this.snap?.phase === "active" && this.me?.item) net.send({ t: "kitem" });
  }

  respawn(): void {
    if (this.snap?.phase === "active") net.send({ t: "krespawn" });
  }

  /** Só em desenvolvimento: pede o próximo item da lista para testar (o servidor recusa em produção). */
  private debugIndex = 0;
  debugItem(): void {
    if (!__DEV__) return;
    net.send({ t: "kdebug", item: ITEM_IDS[this.debugIndex++ % ITEM_IDS.length] });
  }

  private input(): KartInput {
    if (this.snap?.phase !== "active" || this.me?.finished) return NO_INPUT;
    return this.controls;
  }

  // ---------- rede ----------
  applySnapshot(s: RaceSnapshot, me: RacePrivate | null): void {
    const now = performance.now();
    this.snap = s;
    this.snapAt = now;
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
      disposeKartView(this.scene, v);
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

    for (const e of s.events) {
      if (e.type === "hit" && e.id === this.myId) {
        this.onUi?.(e.kind === "blocked" ? "blocked" : "hit");
      }
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
    const key = JSON.stringify(person ?? k.name) + (modelReady() ? "|glb" : "") + (chairModelReady() ? "|cadeira" : "");
    const old = this.views.get(k.id);
    if (old && old.key === key) return old;
    const prevBuf = old?.buf ?? [];
    if (old) disposeKartView(this.scene, old);
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
    // turbo: jato de espuma do extintor (GLB) ou chama na cadeira procedural
    const foam = chairModelReady();
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.8, 10), new THREE.MeshBasicMaterial({ color: foam ? "#eef6ff" : "#ff8a2b", transparent: true, opacity: 0.85 }));
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(r3d.exhaust.x, r3d.exhaust.y, r3d.exhaust.z - 0.4);
    flame.visible = false;
    body.add(flame);
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.1, 18, 12), new THREE.MeshBasicMaterial({ color: "#8f9cff", transparent: true, opacity: 0.2, depthWrite: false }));
    bubble.position.y = 0.9;
    bubble.visible = false;
    r3d.root.add(bubble);
    const tag = k.id === this.myId ? null : nameTag(k.name);
    if (tag) r3d.root.add(tag);
    r3d.root.traverse((o) => (o.castShadow = o instanceof THREE.Mesh && o !== bubble));
    this.scene.add(r3d.root);
    const v: KartView = { r3d, key, body, tag, buf: prevBuf, last: k, sparks, flame, bubble, spin: 0 };
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
  // o rAF do React Native não passa o relógio do performance.now() como o navegador
  private loop = (): void => {
    const ms = performance.now();
    const dt = Math.min(0.05, (ms - this.lastFrame) / 1000);
    this.lastFrame = ms;
    fitRenderer(this.gl, this.renderer, this.camera);
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
        const step = stepKart(this.pred, input, DT, this.clock, TRACK);
        this.pred = step.state;
        if (step.boost === 2) this.onUi?.("boost2");
        else if (step.boost === 1) this.onUi?.("boost1");
        if (step.wall && now - this.lastWallAt > 250) {
          this.lastWallAt = now;
          this.onUi?.("wall");
        }
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

    // Comandante e cena de abertura seguem o relógio do servidor, então todos veem o mesmo voo
    const since = now - this.snapAt;
    const intro = this.snap?.phase === "countdown" ? RACE.countdownMs - this.snap.countdownMs + since : RACE.introMs;
    const raceMs = this.snap && this.snap.phase !== "countdown" ? this.snap.elapsedMs + since : null;
    this.commander?.update(dt, intro, raceMs, this.camera.position);
    if (intro < RACE.introMs) this.cutsceneCamera(intro / RACE.introMs, dt);
    else this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.gl.endFrameEXP();
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
    v.r3d.update(dt, own ? own.speed : k.speed);
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

  /** Abertura: primeiro segue o Comandante pela reta final, depois mostra o grid com ele chegando. */
  private cutsceneCamera(u: number, dt: number): void {
    const start = pointAt(TRACK, 0).pos;
    const c = this.commander?.root.position ?? new THREE.Vector3(start.x, 5.5, start.z);
    let want: THREE.Vector3;
    let look: THREE.Vector3;
    if (u < 0.55) {
      const h = pointAt(TRACK, -40).heading;
      want = new THREE.Vector3(c.x - Math.sin(h) * 11 + Math.cos(h) * 4, c.y + 3, c.z - Math.cos(h) * 11 - Math.sin(h) * 4);
      look = new THREE.Vector3(c.x, c.y + 1.6, c.z);
    } else {
      // atrás do grid: as cadeiras de costas e o Comandante sobre o pórtico, de frente para elas
      const back = pointAt(TRACK, TRACK.length - 17);
      want = new THREE.Vector3(back.pos.x, 2.4, back.pos.z);
      look = new THREE.Vector3(c.x, c.y - 1.2, c.z);
    }
    const snap = !this.camReady || u < 0.02 || Math.abs(u - 0.55) < 0.02;
    const k = snap ? 1 : 1 - Math.exp(-dt * 4);
    this.camPos.lerp(want, k);
    this.camLook.lerp(look, k);
    this.camReady = true;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    // zoom na tomada do grid para o Comandante aparecer sobre o pórtico
    const fov = u < 0.55 ? 62 : 56;
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
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

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.appSub.remove();
    this.music?.release();
    // bonecos e Comandante compartilham geometria do GLB: saem da cena antes da limpeza geral
    if (this.commander) {
      this.scene.remove(this.commander.root);
      this.commander.dispose();
    }
    for (const v of this.views.values()) disposeKartView(this.scene, v);
    this.views.clear();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as (THREE.Material & { map?: THREE.Texture }) | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else {
        mat?.map?.dispose();
        mat?.dispose();
      }
    });
    this.renderer.dispose();
  }
}
