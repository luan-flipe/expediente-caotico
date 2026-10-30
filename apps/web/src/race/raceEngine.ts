import * as THREE from "three";
import {
  DEFAULT_AVATAR,
  ITEM_IDS,
  NO_INPUT,
  pointAt,
  HOLDABLE_ITEMS,
  RACE,
  newKart,
  stepKart,
  type AvatarDNA,
  type ChairDNA,
  type HazardKind,
  type ItemId,
  type KartInput,
  type KartState,
  type RaceKartPublic,
  type RacePrivate,
  type RaceSnapshot,
  type Track,
} from "@ec/shared";
import { loadMusic } from "../assets";
import { nextRaceTrack, playCoffeeGulpSound, playFinalLapChime, playLandingBoostSound, playStaplerClickSound, playTauntSound, playTrickChime, RaceMusic } from "../sound";
import { modelReady } from "../game/character";
import { applyQuality } from "../quality";
import { getSettings, subscribeSettings, type Quality } from "../settings";
import { getState, net, setState } from "../store";
import { inputBlocked } from "../pause";
import { resetTouchInput, touchInput } from "../touch";
import { ChatBubbles, chatText } from "../chatBubbles";
import { chairModelReady, seatedRacer, type Racer3D } from "./chairMesh";
import type { CharacterSeatedOptions } from "../game/character";
import { createCommander, type Commander } from "./commander";
import { fadeMaterials, Ghost, GHOST_MINE, GHOST_RECORD, nameTag } from "./ghosts";
import type { Ghosts } from "../store";
import { buildTrack } from "./trackScene";
import { buildParachute, parachuteFor } from "./parachute";
import { createDynamicSky, type DynamicSky } from "../game/sky";
import { applyFresnelRimToHierarchy, applyStylizedToonToHierarchy, calculateDynamicFov, CasterBlobShadows, RaceVfxManager, type DriftLevel } from "./vfxJuice";
import { TrackInteractiveManager, type KartInteractiveInfo } from "./trackInteractive";

interface Sample {
  t: number;
  x: number;
  z: number;
  heading: number;
  y: number;
}

interface SmokePuff {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
}

interface ItemFxParticle {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
  rotSpeed: { x: number; y: number; z: number };
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
  slideYaw: number;
  roll: number;
  pitch: number;
  hopY: number;
  hopVel: number;
  wasDrifting: boolean;
  smokePuffs: SmokePuff[];
  smokeTimer: number;
  lastSteer: number;
  bubbleScale: number;
  wasAirborne?: boolean;
  trickActive: boolean;
  trickTimer: number;
  trickDuration: number;
  trickType: number;
  trickRotX: number;
  trickRotY: number;
  trickRotZ: number;
  trickPosY: number;
  performedTrick: boolean;
  trickCount: number;
  wasInAir?: boolean;
  lastTauntAt?: number;
  heldItem: THREE.Group;
  blobShadows: CasterBlobShadows;
  /** Paraquedas de escritório (aparece com o flag chute). */
  chute: THREE.Group;
  chuteOpen: number;
  heldItemKind?: ItemId | null;
  /** Treino: devolve os materiais originais da cadeira semitransparente. */
  restore: (() => void) | null;
  lastPlace?: number;
  lastLap?: number;
}

interface HazardView {
  obj: THREE.Object3D;
  kind: HazardKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  at: number;
  bornAt: number;
  impacted?: boolean;
}

const DT = 1000 / 30;
const INTERP_MS = 110;
const SPARK_COLORS = ["#f2f2f2", "#3cc8ff", "#ff9a1f", "#bd34fe"];
/** Treino: os outros pilotos aparecem assim (sem colisão entre cadeiras). */
const TRIAL_OTHERS_OPACITY = 0.4;
const DEFAULT_CHAIR: ChairDNA = { seat: 0, base: 0, wheels: 0, back: 1, trinket: 0 };
const TMP_RIVAL_DIR = new THREE.Vector3();
const _camWant = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _cutWant = new THREE.Vector3();
const _cutLook = new THREE.Vector3();
const TMP_SEATED_OPTIONS: CharacterSeatedOptions = {};

const angleLerp = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

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
  private camera = new THREE.PerspectiveCamera(68, 1, 0.1, 400);
  private views = new Map<string, KartView>();
  private boxes = new Map<number, THREE.Mesh>();
  private hazards = new Map<number, HazardView>();
  private people = new Map<string, { avatar: AvatarDNA; chair: ChairDNA }>();
  private snap: RaceSnapshot | null = null;
  private snapAt = 0;
  private sky: DynamicSky;
  private commander: Commander | null;
  private listener = new THREE.AudioListener();
  /** Canais de volume: música e efeitos passam cada um por um ganho antes do volume geral (o AudioListener). */
  private musicBus = this.listener.context.createGain();
  private effectsBus = this.listener.context.createGain();
  /** Trilha de fundo: toca em loop durante toda a corrida (contagem incluída), sem posição na cena. */
  private music = new RaceMusic(this.listener.context, this.musicBus);
  private muted = false;
  private rollGain: GainNode | null = null;
  private rollOsc: OscillatorNode | null = null;
  private skidGain: GainNode | null = null;
  private skidOsc: OscillatorNode | null = null;
  private sun: THREE.DirectionalLight;
  private quality: Quality | null = null;
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
  private wasInCutscene = false;
  private camDriftOffset = 0;
  private camLookOffset = 0;
  private camY = 0;
  private shake = 0;
  private skidMesh: THREE.InstancedMesh;
  private skidIdx = 0;
  private lastSkidAt = 0;
  private dummyObj = new THREE.Object3D();
  private smokeGeo = new THREE.IcosahedronGeometry(0.12, 0);
  private itemParticles: ItemFxParticle[] = [];
  private itemGeoPaper = new THREE.PlaneGeometry(0.18, 0.24);
  private itemGeoPostit = new THREE.PlaneGeometry(0.14, 0.14);
  private itemGeoDrop = new THREE.IcosahedronGeometry(0.07, 0);
  private itemGeoFlash = new THREE.ConeGeometry(0.14, 0.5, 6);
  private itemMatPaper = new THREE.MeshStandardMaterial({ color: "#f8f6f0", roughness: 0.85, side: THREE.DoubleSide, transparent: true });
  private itemMatPostit = new THREE.MeshStandardMaterial({ color: "#ffd600", roughness: 0.9, side: THREE.DoubleSide, transparent: true });
  private itemMatCoffee = new THREE.MeshStandardMaterial({ color: "#3d2415", roughness: 0.2, transparent: true });
  private itemMatFlash = new THREE.MeshBasicMaterial({ color: "#eef6ff", transparent: true, opacity: 0.9 });
  private cups = new Map<number, THREE.Object3D>();
  private holdingRear = false;
  private lookBackActive = false;
  private lookBackSnap = false;
  private localDraftMs = 0;
  private localDraftRatio = 0;
  private finalLapTriggered = false;
  private cupGeo = {
    body: new THREE.CylinderGeometry(0.18, 0.14, 0.28, 12),
    coffee: new THREE.CircleGeometry(0.16, 12),
    handle: new THREE.TorusGeometry(0.08, 0.025, 6, 10, Math.PI),
    halo: new THREE.RingGeometry(0.22, 0.29, 14),
  };
  private cupMat = {
    body: new THREE.MeshStandardMaterial({ color: "#fffdfa", roughness: 0.35 }),
    coffee: new THREE.MeshStandardMaterial({ color: "#2b1408", roughness: 0.15 }),
    halo: new THREE.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  };
  private disposeTrack: (() => void) | null = null;
  private boxGeo = new THREE.BoxGeometry(0.8, 0.6, 0.8);
  private boxMat = new THREE.MeshStandardMaterial({ map: boxTexture(), roughness: 0.9 });
  private hazardMats = new Map<string, THREE.Material>();
  private ghostMine: Ghost | null = null;
  private ghostRecord: Ghost | null = null;
  private chat = new ChatBubbles(2.75);
  private raf = 0;
  private lastFrame = performance.now();
  private cleanup: (() => void)[] = [];
  private vfx: RaceVfxManager;
  private interactive: TrackInteractiveManager;
  private kartsForInteractive: KartInteractiveInfo[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly myId: string,
    private readonly track: Track,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.sky = createDynamicSky(this.scene, {
      sunPosition: new THREE.Vector3(25, 45, 18),
      sunIntensity: 2.2,
      cloudCoverage: 0.46,
      cloudSpeed: 1.05,
      groundSize: 320,
      groundY: 0.03,
    });
    this.sun = this.sky.sunLight;
    // caixa de sombra menor que acompanha o kart do jogador (ver updateCamera): sombra mais nítida
    Object.assign(this.sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 2, far: 120 });
    this.scene.add(this.sun.target);
    this.disposeTrack = buildTrack(this.scene, track);
    this.vfx = new RaceVfxManager(this.scene, this.camera);
    this.interactive = new TrackInteractiveManager({ track });
    this.interactive.init(this.scene);

    const skidGeo = new THREE.PlaneGeometry(0.18, 0.4);
    skidGeo.rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({ color: "#1d1b17", transparent: true, opacity: 0.28, depthWrite: false });
    this.skidMesh = new THREE.InstancedMesh(skidGeo, skidMat, 200);
    this.skidMesh.frustumCulled = false;
    this.skidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 200; i++) {
      this.dummyObj.position.set(0, -100, 0);
      this.dummyObj.updateMatrix();
      this.skidMesh.setMatrixAt(i, this.dummyObj.matrix);
    }
    this.skidMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.skidMesh);

    // Pool de partículas de efeitos para os power-ups
    const addP = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number) => {
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        this.scene.add(mesh);
        this.itemParticles.push({
          mesh,
          life: 0,
          maxLife: 0.5,
          vx: 0,
          vy: 0,
          vz: 0,
          rotSpeed: { x: 0, y: 0, z: 0 },
        });
      }
    };
    addP(this.itemGeoPaper, this.itemMatPaper, 10);
    addP(this.itemGeoPostit, this.itemMatPostit, 8);
    addP(this.itemGeoDrop, this.itemMatCoffee, 8);
    addP(this.itemGeoFlash, this.itemMatFlash, 4);
    this.camera.add(this.listener);
    for (const bus of [this.musicBus, this.effectsBus]) bus.connect(this.listener.getInput());
    this.commander = createCommander(track, this.listener, this.effectsBus);
    if (this.commander) this.scene.add(this.commander.root);
    this.applySettings();
    this.cleanup.push(subscribeSettings(() => this.applySettings()));
    this.startMusic();
    this.bindInput();
    this.raf = requestAnimationFrame(this.loop);
  }

  setPeople(list: { id: string; avatar: AvatarDNA; chair: ChairDNA }[]): void {
    for (const p of list) this.people.set(p.id, { avatar: p.avatar, chair: p.chair });
  }

  /** Volumes e qualidade ao vivo; as teclas são lidas a cada evento. M silencia tudo por cima do volume geral. */
  private applySettings(): void {
    const s = getSettings();
    this.listener.setMasterVolume(this.muted ? 0 : s.volume.master);
    this.musicBus.gain.value = s.volume.music;
    this.effectsBus.gain.value = s.volume.effects;
    if (s.quality !== this.quality) {
      this.quality = s.quality;
      applyQuality(this.renderer, this.scene, this.sun, s.quality);
    }
  }

  private startMusic(): void {
    // baixada e decodificada uma vez por visita (assets.ts); a corrida seguinte reaproveita
    const url = nextRaceTrack();
    void loadMusic(url).then((buffer) => {
      // a corrida pode ter acabado enquanto o arquivo baixava
      if (!buffer || !this.raf) return;
      this.music.setDucked(getState().pauseOpen);
      this.music.play(url, buffer);
    });
  }

  private initProceduralAudio(): void {
    try {
      const ctx = this.listener.context;
      if (!ctx || this.rollGain) return;

      // 1. Zumbido mecânico leve de rolamento das rodinhas de plástico no chão
      const rOsc = ctx.createOscillator();
      const rGain = ctx.createGain();
      rOsc.type = "triangle";
      rOsc.frequency.value = 55;
      rGain.gain.value = 0;
      rOsc.connect(rGain);
      // passa pelo canal de efeitos: segue o volume de efeitos, o geral e o mudo (M)
      rGain.connect(this.effectsBus);
      rOsc.start();
      this.rollOsc = rOsc;
      this.rollGain = rGain;

      // 2. Chiado / guincho sutil de derrapagem no drift
      const sOsc = ctx.createOscillator();
      const sFilter = ctx.createBiquadFilter();
      const sGain = ctx.createGain();
      sOsc.type = "sawtooth";
      sOsc.frequency.value = 480;
      sFilter.type = "bandpass";
      sFilter.frequency.value = 1600;
      sFilter.Q.value = 2.4;
      sGain.gain.value = 0;
      sOsc.connect(sFilter);
      sFilter.connect(sGain);
      sGain.connect(this.effectsBus);
      sOsc.start();
      this.skidOsc = sOsc;
      this.skidGain = sGain;
    } catch {
      // áudio opcional caso bloqueado pelo navegador
    }
  }

  private updateProceduralAudio(speed: number, drifting: boolean): void {
    if (this.muted) {
      if (this.rollGain) this.rollGain.gain.value = 0;
      if (this.skidGain) this.skidGain.gain.value = 0;
      return;
    }
    const absSpeed = Math.abs(speed);
    if (this.rollGain && this.rollOsc) {
      // níveis da mixagem em sound.ts: rolamento -23 dBFS e derrapagem -31 no máximo, por cima da música (-32)
      const vol = absSpeed > 0.4 ? Math.min(0.12, (absSpeed / 18) * 0.12) : 0;
      this.rollGain.gain.value += (vol - this.rollGain.gain.value) * 0.18;
      this.rollOsc.frequency.value = 50 + (absSpeed / 18) * 110;
    }
    if (this.skidGain && this.skidOsc) {
      const skidVol = drifting && absSpeed > 3 ? 0.16 : 0;
      this.skidGain.gain.value += (skidVol - this.skidGain.gain.value) * 0.22;
      this.skidOsc.frequency.value = 480 + (absSpeed / 18) * 130;
    }
  }

  // ---------- entrada ----------
  private bindInput(): void {
    const on = <E extends Event>(t: string, fn: (e: E) => void) => {
      window.addEventListener(t, fn as EventListener);
      this.cleanup.push(() => window.removeEventListener(t, fn as EventListener));
    };
    on("blur", () => {
      this.keys.clear();
      this.lookBackActive = false;
    });
    // o navegador só libera som depois de um gesto do jogador
    const unlock = () => {
      void this.listener.context.resume();
      this.initProceduralAudio();
    };
    on("keydown", unlock);
    on("mousedown", unlock);
    on("pointerdown", unlock);
    on<MouseEvent>("mousedown", (e) => {
      if (e.button === 0 && e.target === this.canvas) this.startItemUse();
      if (e.button === 1) {
        e.preventDefault();
        this.lookBackActive = true;
        this.lookBackSnap = true;
      }
    });
    on<MouseEvent>("mouseup", (e) => {
      if (e.button === 0) this.releaseItemUse();
      if (e.button === 1) {
        this.lookBackActive = false;
        this.lookBackSnap = true;
      }
    });
    on<KeyboardEvent>("keydown", (e) => {
      // com as configurações ou o chat rápido abertos o teclado é deles, não do jogo
      if (inputBlocked(getState())) return;
      const k = e.code;
      const map = getSettings().keys.race;
      if (k.startsWith("Arrow") || (!e.ctrlKey && !e.metaKey && !e.altKey && Object.values(map).includes(k))) e.preventDefault();
      if (k === map.placar) setState({ scoreboard: true });
      this.keys.add(k);
      if (e.repeat) return;
      if (k === "KeyC") {
        if (!this.lookBackActive) {
          this.lookBackActive = true;
          this.lookBackSnap = true;
        }
      }
      if (k === "KeyF" && this.snap?.phase === "active") {
        const mine = this.views.get(this.myId);
        if (mine) {
          mine.r3d.char.playTaunt?.("wave", 1.5);
          playTauntSound();
        }
      }
      if (k === map.item) this.startItemUse();
      if (k === map.voltar && this.snap?.phase === "active") net.send({ t: "krespawn" });
      if (k === map.mudo) {
        this.muted = !this.muted;
        this.applySettings();
      }
      if (import.meta.env.DEV && /^Digit[1-8]$/.test(k)) net.send({ t: "kdebug", item: ITEM_IDS[Number(k.slice(-1)) - 1] });
    });
    on<KeyboardEvent>("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "KeyC") {
        this.lookBackActive = false;
        this.lookBackSnap = true;
      }
      if (e.code === getSettings().keys.race.placar) setState({ scoreboard: false });
      if (e.code === getSettings().keys.race.item) this.releaseItemUse();
    });
  }

  /** Item que dá para segurar atrás como escudo: segura enquanto a tecla está apertada e solta ao largar. */
  private startItemUse(): void {
    if (this.snap?.phase !== "active" || !this.me?.item) return;
    if (HOLDABLE_ITEMS.has(this.me.item)) this.holdingRear = true;
    else this.fireItem(this.me.item);
  }

  private releaseItemUse(): void {
    // só solta o que estava segurando; item de uso imediato já saiu ao apertar
    if (!this.holdingRear) return;
    this.holdingRear = false;
    if (this.snap?.phase === "active" && this.me?.item) this.fireItem(this.me.item);
  }

  private fireItem(item: ItemId): void {
    net.send({ t: "kitem" });
    const v = this.views.get(this.myId);
    if (v) {
      v.r3d.char.playItemGesture?.(item);
      this.triggerItemFx(v, item);
    }
  }

  private triggerItemFx(v: KartView, item: ItemId): void {
    const p = v.r3d.root.position;
    const h = v.r3d.root.rotation.y;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const rx = Math.cos(h);
    const rz = -Math.sin(h);

    const spawn = (geo: THREE.BufferGeometry, count: number, makeP: (idx: number) => { x: number; y: number; z: number; vx: number; vy: number; vz: number; maxLife: number; rx: number; ry: number; rz: number }) => {
      if (this.quality === "leve") return;
      let found = 0;
      for (const pt of this.itemParticles) {
        if (pt.mesh.geometry === geo && !pt.mesh.visible) {
          const cfg = makeP(found);
          pt.mesh.position.set(cfg.x, cfg.y, cfg.z);
          pt.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
          pt.mesh.visible = true;
          pt.life = 0;
          pt.maxLife = cfg.maxLife;
          pt.vx = cfg.vx;
          pt.vy = cfg.vy;
          pt.vz = cfg.vz;
          pt.rotSpeed = { x: cfg.rx, y: cfg.ry, z: cfg.rz };
          found++;
          if (found >= count) break;
        }
      }
    };

    switch (item) {
      case "resma":
        spawn(this.itemGeoPaper, 4, () => ({
          x: p.x - fx * 0.7 + rx * ((Math.random() - 0.5) * 0.3),
          y: 0.65,
          z: p.z - fz * 0.7 + rz * ((Math.random() - 0.5) * 0.3),
          vx: (Math.random() - 0.5) * 1.2 - fx * 1.2,
          vy: 1.2 + Math.random() * 0.8,
          vz: (Math.random() - 0.5) * 1.2 - fz * 1.2,
          maxLife: 0.55,
          rx: (Math.random() - 0.5) * 10,
          ry: (Math.random() - 0.5) * 10,
          rz: (Math.random() - 0.5) * 10,
        }));
        break;

      case "pasta":
        v.bubbleScale = 0.2;
        v.bubble.visible = true;
        break;

      case "aviao":
        spawn(this.itemGeoPaper, 4, () => ({
          x: p.x + fx * 0.4 + rx * ((Math.random() - 0.5) * 0.25),
          y: 0.85,
          z: p.z + fz * 0.4 + rz * ((Math.random() - 0.5) * 0.25),
          vx: fx * 5.5 + (Math.random() - 0.5) * 1.2,
          vy: 0.8 + Math.random() * 0.6,
          vz: fz * 5.5 + (Math.random() - 0.5) * 1.2,
          maxLife: 0.45,
          rx: (Math.random() - 0.5) * 8,
          ry: (Math.random() - 0.5) * 8,
          rz: (Math.random() - 0.5) * 8,
        }));
        break;

      case "grampeador":
        if (v.last.id === this.myId) playStaplerClickSound();
        v.pitch = 0.09;
        spawn(this.itemGeoFlash, 1, () => ({
          x: p.x + fx * 0.65,
          y: 0.65,
          z: p.z + fz * 0.65,
          vx: fx * 0.8,
          vy: 0,
          vz: fz * 0.8,
          maxLife: 0.12,
          rx: 0,
          ry: h,
          rz: 0,
        }));
        break;

      case "poca":
        spawn(this.itemGeoDrop, 6, () => ({
          x: p.x - fx * 0.6 + rx * ((Math.random() - 0.5) * 0.35),
          y: 0.3,
          z: p.z - fz * 0.6 + rz * ((Math.random() - 0.5) * 0.35),
          vx: (Math.random() - 0.5) * 2.2,
          vy: 1.2 + Math.random() * 0.8,
          vz: (Math.random() - 0.5) * 2.2,
          maxLife: 0.4,
          rx: (Math.random() - 0.5) * 10,
          ry: (Math.random() - 0.5) * 10,
          rz: (Math.random() - 0.5) * 10,
        }));
        break;

      case "postit":
        spawn(this.itemGeoPostit, 6, () => ({
          x: p.x + fx * 0.5 + rx * ((Math.random() - 0.5) * 0.35),
          y: 0.75,
          z: p.z + fz * 0.5 + rz * ((Math.random() - 0.5) * 0.35),
          vx: fx * 6.0 + (Math.random() - 0.5) * 1.5,
          vy: 1.4 + Math.random() * 0.8,
          vz: fz * 6.0 + (Math.random() - 0.5) * 1.5,
          maxLife: 0.55,
          rx: (Math.random() - 0.5) * 10,
          ry: (Math.random() - 0.5) * 10,
          rz: (Math.random() - 0.5) * 10,
        }));
        break;

      case "expresso":
      case "triplo":
        if (v.last.id === this.myId) {
          playCoffeeGulpSound();
          this.shake = Math.min(0.5, this.shake + 0.22);
        }
        break;
    }
  }

  private spawnPaperImpact(x: number, z: number): void {
    this.vfx?.spawnImpactShockwave(x, z, 0.02, "paper");
    if (this.quality === "leve") return;
    let count = 0;
    for (const pt of this.itemParticles) {
      if (pt.mesh.geometry === this.itemGeoPaper && !pt.mesh.visible) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 0.9 + Math.random() * 1.3;
        pt.mesh.position.set(x + Math.cos(ang) * 0.15, 0.06, z + Math.sin(ang) * 0.15);
        pt.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        pt.mesh.visible = true;
        pt.life = 0;
        pt.maxLife = 0.5;
        pt.vx = Math.cos(ang) * spd;
        pt.vy = 1.3 + Math.random() * 0.9;
        pt.vz = Math.sin(ang) * spd;
        pt.rotSpeed = { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8 };
        count++;
        if (count >= 4) break;
      }
    }
  }

  private input(): KartInput {
    // menu, configurações ou chat por cima: cadeira solta (nada de acelerar sozinha com tecla presa)
    if (this.snap?.phase !== "active" || this.me?.finished || inputBlocked(getState())) return NO_INPUT;
    const map = getSettings().keys.race;
    // as setas valem sempre, ao lado das teclas escolhidas
    const has = (...c: string[]) => c.some((x) => this.keys.has(x));
    return {
      // volante da tela é analógico e manda enquanto o dedo está nele
      steer: touchInput.steer ?? (has(map.direita, "ArrowRight") ? 1 : 0) - (has(map.esquerda, "ArrowLeft") ? 1 : 0),
      throttle: has(map.acelerar, "ArrowUp") ? 1 : has(map.frear, "ArrowDown") ? -1 : 0,
      drift: has(map.derrapar),
      itemHold: this.holdingRear,
    };
  }

  // ---------- rede ----------
  applySnapshot(s: RaceSnapshot, me: RacePrivate | null): void {
    const now = performance.now();
    this.snap = s;
    this.snapAt = now;
    this.me = me;

    if (s.phase === "countdown" && this.finalLapTriggered) {
      this.finalLapTriggered = false;
      this.music.setFinalLap(false);
    }
    if (s.phase === "active" && !s.timeTrial && s.laps > 1 && me && me.lap === s.laps && !me.finished && !this.finalLapTriggered) {
      this.finalLapTriggered = true;
      this.music.setFinalLap(true);
      playFinalLapChime();
      window.dispatchEvent(new CustomEvent("ec:finallap"));
    }
    const seen = new Set<string>();
    for (const k of s.karts) {
      seen.add(k.id);
      const v = this.viewFor(k);
      if (k.finished && !v.last.finished) v.r3d.celebrate();
      v.buf.push({ t: now, x: k.x, z: k.z, heading: k.heading, y: k.y ?? 0 });
      if (v.buf.length > 20) v.buf.shift();
      v.last = k;
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      this.dropView(v);
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
        this.interactive.registerItemBox(m, 0.9);
      }
      m.visible = b.ready;
    }

    if (s.cups) {
      const liveCups = new Set<number>();
      for (const c of s.cups) {
        liveCups.add(c.id);
        let m = this.cups.get(c.id);
        if (!m) {
          m = this.buildCupMesh();
          m.position.set(c.x, 0.38, c.z);
          this.scene.add(m);
          this.cups.set(c.id, m);
          this.interactive.registerCup(m, 0.38);
        }
        m.visible = c.ready;
      }
      for (const [id, m] of this.cups) {
        if (!liveCups.has(id)) {
          this.scene.remove(m);
          this.cups.delete(id);
          this.interactive.removeCup(id);
        }
      }
    }

    const live = new Set<number>();
    for (const h of s.hazards) {
      live.add(h.id);
      let hv = this.hazards.get(h.id);
      if (!hv) {
        const obj = this.hazardMesh(h.kind);
        if (h.kind === "resma") {
          obj.rotation.y = (h.id * 1.37) % (Math.PI * 2);
        }
        hv = {
          obj,
          kind: h.kind,
          x: h.x,
          z: h.z,
          vx: h.vx,
          vz: h.vz,
          at: now,
          bornAt: now,
        };
        this.scene.add(hv.obj);
        this.hazards.set(h.id, hv);
      }
      hv.x = h.x;
      hv.z = h.z;
      hv.vx = h.vx;
      hv.vz = h.vz;
      hv.at = now;
    }
    for (const [id, hv] of this.hazards) {
      if (live.has(id)) continue;
      this.scene.remove(hv.obj);
      hv.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.hazards.delete(id);
    }

    for (const e of s.events) {
      if (e.type === "wall" && e.id === this.myId) {
        this.shake = Math.min(1, this.shake + 0.4);
        const v = this.views.get(this.myId);
        v?.r3d.char.setEmotion?.("panic", 0.6);
      }
      if (e.type === "hit" && e.id === this.myId) {
        if (e.kind === "blocked") {
          this.shake = Math.min(0.5, this.shake + 0.25);
          this.holdingRear = false;
        } else {
          this.shake = Math.min(1, this.shake + 0.5);
          const v = this.views.get(this.myId);
          v?.r3d.char.setEmotion?.("panic", 0.8);
        }
      }
      if (e.type === "boost" && e.id === this.myId) {
        this.shake = Math.min(0.4, this.shake + 0.15);
        const v = this.views.get(this.myId);
        v?.r3d.char.setEmotion?.("adrenaline", 1.2);
      }
      if (e.type === "cup" && e.id === this.myId) this.shake = Math.min(0.25, this.shake + 0.08);
      if (e.type === "stunt" && e.id === this.myId) this.shake = Math.min(0.5, this.shake + 0.25);
      if (e.type === "draft" && e.id === this.myId) {
        this.shake = Math.min(0.5, this.shake + 0.3);
        this.camera.fov = 76;
        const v = this.views.get(this.myId);
        v?.r3d.char.setEmotion?.("adrenaline", 1.5);
      }
      if (e.type === "item") {
        if (e.id !== this.myId) {
          const v = this.views.get(e.id);
          if (v) {
            v.r3d.char.playItemGesture?.(e.item);
            this.triggerItemFx(v, e.item);
          }
        }
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
      // mesmo teto de turbo e mesmas xícaras do servidor, senão a previsão diverge e a cadeira dá tranco
      boostSpeed: k.boostMs > 0 ? k.boostSpeed : undefined,
      cups: k.cups ?? me.cups ?? 0,
      path: k.path,
      // altura e voo: a previsão pousa no mesmo tick que o servidor
      y: k.y,
      vy: k.vy,
      air: k.air,
      trick: k.trick,
      fell: k.fell,
    };
    const old = this.pred;
    if (!old || this.snap?.phase !== "active" || me.finished) {
      this.pred = this.prevPred = server;
      this.pending = [];
      this.visOffset = { x: 0, z: 0, h: 0 };
      return;
    }
    let next = server;
    for (const p of this.pending) next = stepKart(next, p.input, DT, p.t, this.track).state;
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
    const r3d = seatedRacer(person?.avatar ?? { ...DEFAULT_AVATAR, name: k.name }, person?.chair ?? DEFAULT_CHAIR);
    const faded = !!this.snap?.timeTrial && k.id !== this.myId;
    const restore = faded ? fadeMaterials(r3d.root, { opacity: TRIAL_OTHERS_OPACITY }) : null;
    if (!faded) applyFresnelRimToHierarchy(r3d.root, "#ffffff", 0.65, 2.5);
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
    // Sombra de contato suave sob as 5 rodinhas para pregar a cadeira no chão
    const blobShadows = new CasterBlobShadows(r3d.root);
    applyStylizedToonToHierarchy(r3d.root);
    applyFresnelRimToHierarchy(r3d.root, "#ffffff", 0.65, 2.5);




    const tag = k.id === this.myId ? null : nameTag(k.name);
    if (tag) r3d.root.add(tag);
    r3d.root.traverse((o) => (o.castShadow = !faded && o instanceof THREE.Mesh && o !== bubble && o.name !== "blobShadows" && !o.parent?.name?.includes("blobShadows")));
    const chute = buildParachute(parachuteFor(person?.chair ?? DEFAULT_CHAIR));
    r3d.root.add(chute);
    const heldItem = new THREE.Group();
    heldItem.position.set(0, 0.45, -0.65);
    heldItem.visible = false;
    body.add(heldItem);
    const smokeMat = new THREE.MeshBasicMaterial({ color: "#e8e5de", transparent: true, opacity: 0.45, depthWrite: false });
    const smokePuffs: SmokePuff[] = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(this.smokeGeo, smokeMat);
      m.visible = false;
      this.scene.add(m);
      smokePuffs.push({ mesh: m, life: 0, maxLife: 0.32, vx: 0, vy: 0, vz: 0 });
    }
    if (old) this.dropView(old);
    this.scene.add(r3d.root);
    const v: KartView = {
      r3d,
      key,
      body,
      tag,
      buf: old?.buf ?? [],
      last: k,
      sparks,
      flame,
      bubble,
      spin: 0,
      restore,
      slideYaw: 0,
      roll: 0,
      pitch: 0,
      hopY: 0,
      hopVel: 0,
      wasDrifting: false,
      trickActive: false,
      trickTimer: 0,
      trickDuration: 0.72,
      trickType: 0,
      trickRotX: 0,
      trickRotY: 0,
      trickRotZ: 0,
      trickPosY: 0,
      performedTrick: false,
      trickCount: 0,
      wasInAir: false,
      lastTauntAt: 0,
      smokePuffs,
      smokeTimer: 0,
      lastSteer: 0,
      bubbleScale: 0.2,
      heldItem,
      blobShadows,
      chute,
      chuteOpen: 0,
    };
    this.views.set(k.id, v);
    return v;
  }

  /** Xícara de café da pista: geometrias e materiais são da corrida inteira (saem no dispose). */
  private buildCupMesh(): THREE.Object3D {
    const g = new THREE.Group();
    const cup = new THREE.Mesh(this.cupGeo.body, this.cupMat.body);
    cup.castShadow = true;
    g.add(cup);
    const coffee = new THREE.Mesh(this.cupGeo.coffee, this.cupMat.coffee);
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.y = 0.141;
    g.add(coffee);
    const handle = new THREE.Mesh(this.cupGeo.handle, this.cupMat.body);
    handle.rotation.z = -Math.PI / 2;
    handle.position.set(0.18, 0, 0);
    g.add(handle);
    const halo = new THREE.Mesh(this.cupGeo.halo, this.cupMat.halo);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.145;
    g.add(halo);
    return g;
  }

  /** Tira o item segurado da traseira; a geometria é própria, o material é o compartilhado dos obstáculos. */
  private clearHeld(v: KartView): void {
    for (const c of [...v.heldItem.children]) {
      v.heldItem.remove(c);
      c.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
  }

  private dropView(v: KartView): void {
    this.scene.remove(v.r3d.root);
    this.clearHeld(v);
    // fumaça fica solta na cena; a geometria é da corrida, o material é desta cadeira
    for (const p of v.smokePuffs) this.scene.remove(p.mesh);
    (v.smokePuffs[0]?.mesh.material as THREE.Material | undefined)?.dispose();
    v.blobShadows.dispose();
    v.restore?.();
    // geometria da faísca, da chama e da bolha é própria; a do sprite do nome é compartilhada pelo three
    for (const m of [...v.sparks, v.flame, v.bubble]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    if (v.tag) {
      v.tag.material.map?.dispose();
      v.tag.material.dispose();
    }
    v.r3d.dispose();
  }

  /** Fantasmas do treino (sua melhor volta e a do recordista); null ou sem amostras os esconde. */
  setGhosts(g: Ghosts | null): void {
    const mine = g?.mine ?? null;
    const record = g?.record ?? null;
    // quem tem o recorde veria dois fantasmas iguais um dentro do outro: fica só o dourado
    const same = !!mine && !!record && mine.ms === record.ms && mine.samples.length === record.samples.length;
    const me = this.people.get(this.myId);
    this.ghostMine ??= this.addGhost(new Ghost(me?.avatar ?? DEFAULT_AVATAR, me?.chair ?? DEFAULT_CHAIR, GHOST_MINE, "Sua melhor"));
    this.ghostRecord ??= this.addGhost(new Ghost(DEFAULT_AVATAR, DEFAULT_CHAIR, GHOST_RECORD, record?.name ?? "Recorde"));
    this.ghostMine.setLap(same ? null : (mine?.samples ?? null), "Sua melhor");
    this.ghostRecord.setLap(record?.samples ?? null, record?.name ?? "Recorde");
  }

  private addGhost(g: Ghost): Ghost {
    this.scene.add(g.root);
    return g;
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
      const paper = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.65), mat("papel", () => new THREE.MeshStandardMaterial({ color: "#fbfaf5", roughness: 0.8 })));
      paper.castShadow = true;
      paper.receiveShadow = true;
      g.add(paper);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.2, 0.67), mat("faixa", () => new THREE.MeshStandardMaterial({ color: "#2e86de", roughness: 0.5 })));
      band.castShadow = true;
      band.receiveShadow = true;
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

  /** Balão de chat rápido sobre a cadeira de quem falou. */
  showChat(id: string, kind: "phrase" | "emote", index: number): void {
    const text = chatText(kind, index);
    if (text) this.chat.show(id, text, kind === "emote", performance.now());
  }

  // ---------- quadro ----------
  private loop = (ms: number): void => {
    const dt = Math.min(0.05, (ms - this.lastFrame) / 1000);
    this.lastFrame = ms;
    this.resize();
    const now = performance.now();
    this.chat.update(now, (id) => this.views.get(id)?.r3d.root);
    this.music.setDucked(getState().pauseOpen);

    if (this.pred && this.snap?.phase === "active" && !this.me?.finished) {
      this.acc += dt * 1000;
      const input = this.input();
      while (this.acc >= DT) {
        this.acc -= DT;
        this.clock += DT;
        // cada passo previsto vira um comando numerado: o servidor aplica um por tick, na mesma ordem
        const seq = ++this.seq;
        net.send({ t: "kinput", steer: input.steer, throttle: input.throttle, drift: input.drift, itemHold: input.itemHold, seq });
        this.pending.push({ seq, input, t: this.clock });
        if (this.pending.length > 90) this.pending.shift();
        this.prevPred = this.pred;
        this.pred = stepKart(this.pred, input, DT, this.clock, this.track).state;
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
      let y: number;
      // depois da chegada (ou fora da fase ativa) a própria cadeira vem do buffer, como as outras: a previsão para de rodar
      const mine = id === this.myId && this.pred && this.snap?.phase === "active" && !this.me?.finished;
      if (mine) {
        // desenha entre os dois últimos passos de 30 Hz para não andar aos degraus em telas de 60 Hz ou mais
        const a = this.prevPred ?? this.pred!;
        const b = this.pred!;
        const f = Math.min(1, this.acc / DT);
        x = a.pos.x + (b.pos.x - a.pos.x) * f + this.visOffset.x;
        z = a.pos.z + (b.pos.z - a.pos.z) * f + this.visOffset.z;
        heading = angleLerp(a.heading, b.heading, f) + this.visOffset.h;
        y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * f;
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
        y = a.y + (b.y - a.y) * k;
      }
      let steer = 0;
      if (mine) {
        steer = this.input().steer;
      } else if (v.buf.length >= 2) {
        const lastHeading = v.buf[v.buf.length - 2].heading;
        let dHeading = (heading - lastHeading) % (Math.PI * 2);
        if (dHeading > Math.PI) dHeading -= Math.PI * 2;
        if (dHeading < -Math.PI) dHeading += Math.PI * 2;
        steer = dt > 0.001 ? Math.max(-1, Math.min(1, dHeading / (dt * 2.5))) : 0;
      }
      this.updateView(v, x, z, heading, y, dt, mine ? this.pred! : null, steer);
    }

    this.kartsForInteractive.length = 0;
    for (const vk of this.views.values()) {
      this.kartsForInteractive.push({
        pos: { x: vk.r3d.root.position.x, z: vk.r3d.root.position.z },
        speed: vk.last.speed,
        id: vk.key,
        isLocalPlayer: vk.key === this.myId,
        heading: vk.last.heading,
      });
    }
    const interactionOutputs = this.interactive?.update(dt, this.kartsForInteractive);

    if (this.pred && interactionOutputs) {
      for (let i = 0; i < this.kartsForInteractive.length; i++) {
        if (this.kartsForInteractive[i].isLocalPlayer) {
          const out = interactionOutputs[i];
          if (out) {
            if (out.boost) {
              const bSpeed = out.boostSpeed ?? 24;
              const bDur = (out.boostDuration ?? 1.25) * 1000;
              this.pred.boostUntil = Math.max(this.pred.boostUntil, now + bDur);
              this.pred.boostSpeed = Math.max(this.pred.boostSpeed ?? 0, bSpeed);
              this.shake = Math.min(0.4, this.shake + 0.12);
            }
            if (out.bonk) {
              if (out.bonkImpulse) {
                this.pred.pos.x += out.bonkImpulse.x * dt;
                this.pred.pos.z += out.bonkImpulse.z * dt;
              }
              this.pred.speed *= 0.5;
              this.shake = Math.min(0.5, this.shake + 0.25);
            }
            if (out.spin) {
              this.pred.spinUntil = Math.max(this.pred.spinUntil, now + 800);
            }
            if (out.airCushionLift !== undefined && out.airCushionLift > 0) {
              this.pred.y = Math.max(this.pred.y ?? 0, out.airCushionLift);
            }
          }
          break;
        }
      }
    }

    this.vfx?.update(dt, now, this.camera);

    for (const b of this.boxes.values()) {
      b.rotation.y += dt * 1.6;
      b.position.y = 0.9 + Math.sin(ms / 400 + b.position.x) * 0.12;
    }

    // Atualização das partículas de efeitos dos power-ups
    for (const p of this.itemParticles) {
      if (!p.mesh.visible) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.mesh.visible = false;
      } else {
        const pr = p.life / p.maxLife;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.vy -= 4.2 * dt;
        p.vx *= 0.96;
        p.vz *= 0.96;
        if (p.mesh.position.y < 0.04) {
          p.mesh.position.y = 0.04;
          p.vy = 0;
        }
        p.mesh.rotation.x += p.rotSpeed.x * dt;
        p.mesh.rotation.y += p.rotSpeed.y * dt;
        p.mesh.rotation.z += p.rotSpeed.z * dt;
        p.mesh.scale.setScalar(1 - pr * 0.3);
      }
    }

    for (const h of this.hazards.values()) {
      const ageSinceSnap = (now - h.at) / 1000;
      h.obj.position.x = h.x + h.vx * ageSinceSnap;
      h.obj.position.z = h.z + h.vz * ageSinceSnap;
      if (h.vx || h.vz) h.obj.rotation.y = Math.atan2(h.vx, h.vz);

      const age = (now - h.bornAt) / 1000;

      switch (h.kind) {
        case "aviao":
          // Aviãozinho de papel: ondulação de voo e rolamento nas curvas
          h.obj.rotation.z = Math.sin(age * 12) * 0.16;
          h.obj.position.y = 1.2 + Math.sin(age * 8) * 0.1;
          break;

        case "resma": {
          // Resma de papel: queda realista da altura da mão/cadeira (~0.85m), quique com amortecimento físico e acomodação no asfalto
          let y = 0;
          let rx = 0;
          let rz = 0;

          if (age < 0.26) {
            // 1. Queda livre acelerada da altura da cadeira até o chão
            const u = age / 0.26;
            y = 0.85 * (1 - u * u);
            rx = -0.32 * (1 - u);
            rz = 0.12 * (1 - u);
          } else if (age < 0.44) {
            // 2. Primeiro quique (bloco denso de 500 folhas de papel bate e sobe ~10cm)
            const u = (age - 0.26) / 0.18;
            const sine = Math.sin(u * Math.PI);
            y = 0.10 * sine;
            rx = 0.12 * sine;
            rz = -0.05 * sine;

            // No exato momento do impacto no piso, solta um estilhaço de folhas
            if (!h.impacted) {
              h.impacted = true;
              this.spawnPaperImpact(h.obj.position.x, h.obj.position.z);
            }
          } else if (age < 0.56) {
            // 3. Segundo quique (pequeno ressalto de acomodação de ~2.2cm)
            const u = (age - 0.44) / 0.12;
            const sine = Math.sin(u * Math.PI);
            y = 0.022 * sine;
            rx = -0.025 * sine;
            rz = 0.012 * sine;
          }

          h.obj.position.y = y;
          h.obj.rotation.x = rx;
          h.obj.rotation.z = rz;
          break;
        }

        case "poca": {
          if (!h.impacted) {
            h.impacted = true;
            this.vfx?.spawnImpactShockwave(h.obj.position.x, h.obj.position.z, 0.02, "coffee");
          }
          // Poça de café: expande do centro ao se formar no piso
          const expand = Math.min(1, age / 0.18);
          h.obj.scale.set(expand, 1, expand);
          h.obj.position.y = 0.035;
          break;
        }

        case "grampo":
          h.obj.position.y = 0.6;
          break;
      }
    }

    for (const [id, cup] of this.cups) {
      if (cup.visible) {
        cup.rotation.y += dt * 3.2;
        cup.position.y = 0.36 + Math.sin(now * 0.005 + id * 1.5) * 0.05;
      }
    }

    // Comandante e cena de abertura seguem o relógio do servidor, então todos veem o mesmo voo
    const since = now - this.snapAt;
    // fantasmas largam junto com cada volta: relógio da volta do servidor mais o tempo desde o snapshot
    const lapT = this.snap?.timeTrial && this.snap.phase === "active" && this.me && this.me.lapMs > 0 ? this.me.lapMs + since : null;
    this.ghostMine?.update(lapT, dt);
    this.ghostRecord?.update(lapT, dt);
    const intro = this.snap?.phase === "countdown" ? RACE.countdownMs - this.snap.countdownMs + since : RACE.introMs;
    const raceMs = this.snap && this.snap.phase !== "countdown" ? this.snap.elapsedMs + since : null;
    this.commander?.update(dt, intro, raceMs);
    if (intro < RACE.introMs) {
      this.wasInCutscene = true;
      this.cutsceneCamera(intro / RACE.introMs, dt);
    } else {
      this.updateCamera(dt);
    }
    this.sky.update(dt, this.camera.position);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };

  private updateView(v: KartView, x: number, z: number, heading: number, y: number, dt: number, own: KartState | null, steerInput: number): void {
    const k = v.last;
    const flags = new Set(k.flags);
    const t = this.clock;
    const drift = own ? (own.drifting ? (own.driftMs >= RACE.driftLevel3Ms ? 3 : own.driftMs >= RACE.driftLevel2Ms ? 2 : own.driftMs >= RACE.driftLevel1Ms ? 1 : 0) : -1) : k.drift;
    const driftDir = own ? own.driftDir : k.driftDir;
    const boosting = own ? t < own.boostUntil : flags.has("boost");
    const spinning = own ? t < own.spinUntil : flags.has("spin");
    const speed = own ? own.speed : k.speed;
    v.lastSteer = steerInput;
    // qualidade Leve: sem fumaça e sem marcas de pneu (custam muito em celular)
    const lite = this.quality === "leve";
    const braking = !!own && this.keys.has(getSettings().keys.race.frear);

    // 1. Salto de entrada no drift (hop característico do Mario Kart)
    if (drift >= 0 && !v.wasDrifting) {
      v.hopY = 0.03;
      v.hopVel = 2.4;
      v.wasDrifting = true;
    } else if (drift < 0) {
      v.wasDrifting = false;
    }

    if (v.hopY > 0 || v.hopVel > 0) {
      v.hopY += v.hopVel * dt;
      v.hopVel -= 18 * dt;
      if (v.hopY <= 0) {
        v.hopY = 0;
        v.hopVel = 0;
      }
    }

    // Voo da rampa ou pulo
    const air = own ? !!own.air : flags.has("air");
    const inAir = air || v.hopY > 0;
    const isMine = own !== null && v.last.id === this.myId;
    const driftKey = isMine && this.keys.has(getSettings().keys.race.derrapar);
    const wantsTrick = isMine ? (driftKey || !!own?.trick) : flags.has("trick");

    // Sistema de Manobras no Ar (Trick System estilo Mario Kart):
    // Ao decolar/estar no ar e apertar derrapagem (ou pulo), aciona manobra acrobática 3D
    if (inAir && wantsTrick && !v.trickActive && !v.performedTrick) {
      v.trickActive = true;
      v.performedTrick = true;
      v.trickTimer = 0;
      v.trickDuration = 0.72;
      v.trickCount++;

      // Seleção da acrobacia 3D:
      if (steerInput > 0.25) {
        v.trickType = 2; // Corkscrew direita
      } else if (steerInput < -0.25) {
        v.trickType = 2; // Corkscrew esquerda
      } else if (braking) {
        v.trickType = 1; // Backflip vertical
      } else if (isMine && (this.keys.has("ArrowUp") || this.keys.has("KeyW"))) {
        v.trickType = 3; // Super Kick-Out pop
      } else {
        v.trickType = v.trickCount % 4;
      }

      // VFX: explosão estelar multicolorida / dourada ao redor do piloto
      this.vfx?.spawnTrickBurst(x, y + 0.9, z);

      if (isMine) {
        playTrickChime();
        this.shake = Math.min(0.4, this.shake + 0.15);
      }

      v.r3d.char.setEmotion?.("victory", 1.4);
    }

    // Animação procedimental da manobra 3D
    if (v.trickActive) {
      v.trickTimer += dt;
      const p = Math.min(1, v.trickTimer / v.trickDuration);
      // Quintic smoothstep: 10p^3 - 15p^4 + 6p^5
      const s = 10 * p * p * p - 15 * p * p * p * p + 6 * p * p * p * p * p;

      if (v.trickType === 0) {
        // Manobra 1: Spin 360° horizontal
        const spinDir = steerInput < -0.1 ? -1 : 1;
        v.trickRotY = spinDir * s * Math.PI * 2;
        v.trickRotX = Math.sin(p * Math.PI) * 0.14;
        v.trickRotZ = Math.sin(p * Math.PI) * 0.12 * spinDir;
        v.trickPosY = Math.sin(p * Math.PI) * 0.18;
      } else if (v.trickType === 1) {
        // Manobra 2: Backflip empinado vertical
        v.trickRotX = -s * Math.PI * 2;
        v.trickRotY = 0;
        v.trickRotZ = 0;
        v.trickPosY = Math.sin(p * Math.PI) * 0.24;
      } else if (v.trickType === 2) {
        // Manobra 3: Parafuso 360° (Corkscrew roll)
        const rollDir = steerInput < 0 ? -1 : 1;
        v.trickRotZ = -rollDir * s * Math.PI * 2;
        v.trickRotY = Math.sin(p * Math.PI) * 0.2 * rollDir;
        v.trickRotX = Math.sin(p * Math.PI) * 0.1;
        v.trickPosY = Math.sin(p * Math.PI) * 0.16;
      } else {
        // Manobra 4: Super Kick-Out com T-Pose pop
        v.trickRotX = Math.sin(p * Math.PI) * -0.52;
        v.trickRotY = Math.sin(p * Math.PI * 2) * 0.22;
        v.trickRotZ = Math.sin(p * Math.PI * 2) * 0.18;
        v.trickPosY = Math.sin(p * Math.PI) * 0.28;
      }

      if (p >= 1) {
        v.trickActive = false;
        v.trickRotX = 0;
        v.trickRotY = 0;
        v.trickRotZ = 0;
        v.trickPosY = 0;
      }
    } else {
      v.trickRotX *= Math.max(0, 1 - dt * 14);
      v.trickRotY *= Math.max(0, 1 - dt * 14);
      v.trickRotZ *= Math.max(0, 1 - dt * 14);
      v.trickPosY *= Math.max(0, 1 - dt * 14);
    }

    // Aterrissagem com Landing Boost e Squash & Stretch
    const justLanded = v.wasInAir && !inAir;
    v.wasInAir = inAir;

    if (justLanded) {
      if (v.performedTrick) {
        // Shockwave no solo, faíscas de empuxo e fumaça simétrica
        this.vfx?.spawnLandingBoost(x, y, z, heading);

        v.flame.visible = true;
        v.flame.scale.set(1.4, 1.8, 1.4);

        if (isMine) {
          playLandingBoostSound();
          this.camera.fov = Math.min(80, this.camera.fov + 4.5);
          this.shake = Math.min(0.55, this.shake + 0.28);
        }

        v.r3d.char.setEmotion?.("adrenaline", 1.2);
      }
      v.performedTrick = false;
      v.trickActive = false;
    }

    // Micro-trepidação física do piso e das juntas nas rodinhas
    const roadChatter = Math.abs(speed) > 1.2 && !inAir ? Math.sin(this.clock * 0.08 + x * 5) * 0.007 * Math.min(1, Math.abs(speed) / 10) : 0;
    v.body.position.y = v.hopY + roadChatter + v.trickPosY;

    // 2. Ângulo dinâmico de derrapagem (slide yaw) com transição progressiva e contra-esterço
    let targetSlideYaw = 0;
    if (drift >= 0 && driftDir !== 0) {
      const steerFactor = steerInput * driftDir;
      const driftProgress = own ? Math.min(1, own.driftMs / 220) : 1;
      const baseSlide = -0.24 + (steerFactor > 0 ? 0.07 * steerFactor : -0.10 * Math.abs(steerFactor));
      targetSlideYaw = driftDir * baseSlide * (0.35 + 0.65 * driftProgress);
    }
    v.slideYaw += (targetSlideYaw - v.slideYaw) * Math.min(1, dt * 9);
    if (!Number.isFinite(v.slideYaw)) v.slideYaw = 0;

    // 3. Inclinação lateral da cadeira no amortecedor (roll)
    let targetRoll = 0;
    if (drift >= 0 && driftDir !== 0) {
      targetRoll = driftDir * 0.16 + (v.hopY > 0 ? driftDir * 0.06 : 0);
    } else if (Math.abs(speed) > 2) {
      targetRoll = -steerInput * 0.08 * Math.min(1, Math.abs(speed) / 10);
    }
    v.roll += (targetRoll - v.roll) * Math.min(1, dt * 12);
    if (!Number.isFinite(v.roll)) v.roll = 0;

    // 4. Mergulho e empinada (pitch) no pistão a gás
    let targetPitch = 0;
    if (boosting) {
      targetPitch = 0.08; // aceleração extrema agacha a traseira da cadeira
    } else if (speed > 5) {
      targetPitch = 0.03 * Math.min(1, speed / 16);
    } else if (speed < -0.5 || braking) {
      targetPitch = -0.07; // frenagem afunda o nariz
    }
    v.pitch += (targetPitch - v.pitch) * Math.min(1, dt * 10);
    if (!Number.isFinite(v.pitch)) v.pitch = 0;

    // 5. Rotações finais no corpo da cadeira incluindo acrobacias aéreas (tricks)
    v.spin = spinning ? v.spin + dt * 12 : 0;
    v.body.rotation.y = v.spin + v.slideYaw + v.trickRotY;
    v.body.rotation.z = v.roll * 0.25 + v.trickRotZ;
    v.body.rotation.x = v.pitch + v.trickRotX;

    // 6. Atualização do boneco e rodas

    // Detecção do rival mais próximo para o "Luigi Death Stare" (< 4.5m)
    let nearestDistSq = 4.5 * 4.5;
    let foundRival = false;
    let rivalLocalX = 0;
    let rivalLocalY = 0;
    let rivalLocalZ = 0;

    for (const [otherId, otherView] of this.views) {
      if (otherId === v.last.id) continue;
      const ox = otherView.r3d.root.position.x;
      const oy = otherView.r3d.root.position.y;
      const oz = otherView.r3d.root.position.z;
      const dx = ox - x;
      const dy = oy - y;
      const dz = oz - z;
      const dSq = dx * dx + dz * dz;
      if (dSq < nearestDistSq) {
        nearestDistSq = dSq;
        foundRival = true;
        rivalLocalX = dx * Math.cos(heading) - dz * Math.sin(heading);
        rivalLocalY = dy;
        rivalLocalZ = dx * Math.sin(heading) + dz * Math.cos(heading);
      }
    }

    let rivalDir: THREE.Vector3 | undefined;
    if (foundRival) {
      TMP_RIVAL_DIR.set(rivalLocalX, rivalLocalY, rivalLocalZ);
      rivalDir = TMP_RIVAL_DIR;
    }

    TMP_SEATED_OPTIONS.driftLevel = drift;
    TMP_SEATED_OPTIONS.draft = flags.has("slipstream");
    TMP_SEATED_OPTIONS.spinning = spinning;
    TMP_SEATED_OPTIONS.countdown = this.snap?.phase === "countdown" || (this.snap?.countdownMs ?? 0) > 0;
    TMP_SEATED_OPTIONS.isBraking = braking || speed < -0.5;
    TMP_SEATED_OPTIONS.inAir = inAir;
    TMP_SEATED_OPTIONS.isTricking = v.trickActive;
    TMP_SEATED_OPTIONS.trickType = v.trickType;
    TMP_SEATED_OPTIONS.trickProgress = v.trickTimer / v.trickDuration;
    if (v.lastPlace !== undefined) {
      if (k.place < v.lastPlace) {
        // ULTRAPASSOU UM RIVAL! Taunt debochado
        v.r3d.char.playTaunt?.("wave", 1.5);
        if (v.last.id === this.myId) {
          playTauntSound();
        }
      } else if (k.place > v.lastPlace) {
        // FOI ULTRAPASSADO POR UM RIVAL! Frustração / punho cerrado
        v.r3d.char.playTaunt?.("fist", 1.2);
      } else if (k.place <= 2 && v.lastPlace > 2) {
        v.r3d.char.setEmotion?.("victory", 1.8);
      } else if (k.lap > (v.lastLap ?? 0) && k.place <= 2) {
        v.r3d.char.setEmotion?.("victory", 1.8);
      }
    }
    v.lastPlace = k.place;
    v.lastLap = k.lap;

    // Provocação de ultrapassagem rasante veloz (< 3.2m de rival durante boost)
    if (foundRival && rivalDir) {
      const rivalDist = Math.hypot(rivalDir.x, rivalDir.z);
      if (rivalDist < 3.2 && boosting && (!v.lastTauntAt || this.clock - v.lastTauntAt > 4000)) {
        v.lastTauntAt = this.clock;
        v.r3d.char.playTaunt?.("point", 1.3);
        if (v.last.id === this.myId) {
          playTauntSound();
        }
      }
    }
    v.r3d.update(dt, speed, steerInput, driftDir, boosting, rivalDir, inAir, TMP_SEATED_OPTIONS);
    v.r3d.root.position.set(x, y, z);
    v.r3d.root.rotation.y = heading;

    // Voo da rampa: paraquedas abre depois do pico e some ao pousar; a sombra fica no chão
    const chuteOn = own ? air && (own.vy ?? 0) < 0 : flags.has("chute");
    v.chuteOpen = chuteOn ? Math.min(1, v.chuteOpen + dt * 5) : Math.max(0, v.chuteOpen - dt * 8);
    v.chute.visible = v.chuteOpen > 0.01;
    if (v.chute.visible) {
      v.chute.scale.set(v.chuteOpen, 0.4 + 0.6 * v.chuteOpen, v.chuteOpen);
      v.chute.rotation.z = Math.sin(this.clock * 0.004) * 0.08;
    }
    v.blobShadows.update(v.r3d.chair?.pistonOffset ?? 0, y, inAir);

    // Áudio procedural para o jogador local (rolamento e drift screech)
    if (v.last.id === this.myId) {
      this.updateProceduralAudio(speed, drift >= 0);
    }

    // 7. Faíscas dinâmicas nos pneus
    const flick = 0.7 + Math.random() * 0.6;
    for (let i = 0; i < v.sparks.length; i++) {
      const s = v.sparks[i];
      s.visible = drift >= 0;
      if (s.visible) {
        (s.material as THREE.MeshBasicMaterial).color.set(SPARK_COLORS[drift] ?? SPARK_COLORS[0]);
        const baseScale = drift === 0 ? 0.6 : drift === 1 ? 1.05 : drift === 2 ? 1.45 : 1.95;
        s.scale.setScalar(baseScale * flick);
        s.rotation.y = driftDir * -0.3 + (Math.random() - 0.5) * 0.25;
        s.rotation.z = (Math.random() - 0.5) * 0.2;
        s.position.y = 0.08 + Math.random() * 0.04;
      }
    }
    v.flame.visible = boosting;
    if (boosting) {
      const isLevel3 = drift === 3;
      const boostFlick = 1.3 + Math.random() * 0.7;
      (v.flame.material as THREE.MeshBasicMaterial).color.set(isLevel3 ? "#bd34fe" : chairModelReady() ? "#eef6ff" : "#ff8a2b");
      v.flame.scale.set(1.4, boostFlick, 1.4);
    }

    // Escudo traseiro: exibe item segurado na traseira da cadeira
    const isHolding = (v.last.id === this.myId && this.holdingRear && this.me?.item) || v.last.holdingItem;
    const holdKind = v.last.id === this.myId ? this.me?.item : "resma";
    if (isHolding && holdKind) {
      if (v.heldItemKind !== holdKind) {
        v.heldItemKind = holdKind;
        this.clearHeld(v);
        const mini = this.hazardMesh(holdKind === "poca" ? "poca" : holdKind === "grampeador" ? "grampo" : "resma");
        mini.scale.setScalar(0.7);
        v.heldItem.add(mini);
      }
      v.heldItem.visible = true;
    } else {
      v.heldItem.visible = false;
      v.heldItemKind = null;
    }
    const hasPasta = flags.has("pasta");
    v.bubble.visible = hasPasta;
    if (hasPasta) {
      v.bubbleScale = Math.min(1.0, v.bubbleScale + dt * 4.5);
      const pulse = 1.0 + Math.sin(performance.now() * 0.006) * 0.05;
      v.bubble.scale.setScalar(v.bubbleScale * pulse);
      v.bubble.rotation.y += dt * 0.6;
    } else {
      v.bubbleScale = 0.2;
    }
    v.r3d.root.visible = !flags.has("frozen") || Math.floor(performance.now() / 120) % 2 === 0;

    // 8. Fumaça de derrapagem / frenagem / vapor do café expresso no boost
    v.smokeTimer += dt;
    const shouldSmoke =
      (drift >= 0 && Math.abs(speed) > 3) ||
      (Math.abs(speed) > 7 && braking) ||
      boosting;
    if (!lite && shouldSmoke && v.smokeTimer >= (boosting ? 0.03 : 0.045)) {
      v.smokeTimer = 0;
      const fwdX = Math.sin(heading);
      const fwdZ = Math.cos(heading);
      this.vfx?.spawnDriftSmoke(x, y + 0.08, z, fwdX, fwdZ, speed, boosting);
      if (drift >= 1) {
        this.vfx?.spawnDriftSparks(x, y + 0.08, z, heading, drift as DriftLevel, driftDir);
      }
      const puff = v.smokePuffs.find((p) => !p.mesh.visible);
      if (puff) {
        puff.mesh.visible = true;
        puff.life = 0;
        puff.maxLife = boosting ? 0.26 : 0.32;
        const fwdX = Math.sin(heading);
        const fwdZ = Math.cos(heading);
        const rightX = Math.cos(heading);
        const rightZ = -Math.sin(heading);
        if (boosting) {
          puff.mesh.position.set(
            x - fwdX * 0.6 + rightX * ((Math.random() - 0.5) * 0.16),
            v.r3d.exhaust.y,
            z - fwdZ * 0.6 + rightZ * ((Math.random() - 0.5) * 0.16),
          );
          puff.vx = -fwdX * (speed * 0.38) + (Math.random() - 0.5) * 1.0;
          puff.vy = 0.4 + Math.random() * 0.5;
          puff.vz = -fwdZ * (speed * 0.38) + (Math.random() - 0.5) * 1.0;
          puff.mesh.scale.setScalar(0.95);
        } else {
          const sideOffset = driftDir !== 0 ? driftDir * -0.28 : (Math.random() > 0.5 ? 0.28 : -0.28);
          puff.mesh.position.set(
            x - fwdX * 0.42 + rightX * (sideOffset + (Math.random() - 0.5) * 0.12),
            0.09,
            z - fwdZ * 0.42 + rightZ * (sideOffset + (Math.random() - 0.5) * 0.12),
          );
          puff.vx = (Math.random() - 0.5) * 0.6 - fwdX * (speed * 0.18);
          puff.vy = 0.6 + Math.random() * 0.5;
          puff.vz = (Math.random() - 0.5) * 0.6 - fwdZ * (speed * 0.18);
          puff.mesh.scale.setScalar(0.7);
        }
      }
    }

    for (const p of v.smokePuffs) {
      if (!p.mesh.visible) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.mesh.visible = false;
      } else {
        const pr = p.life / p.maxLife;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.scale.setScalar(0.7 + pr * 1.5);
      }
    }

    // 9. Marcas de pneu na pista
    const now = performance.now();
    if (!lite && drift >= 0 && Math.abs(speed) > 3.5 && now - this.lastSkidAt > 35) {
      this.lastSkidAt = now;
      const fwdX = Math.sin(heading);
      const fwdZ = Math.cos(heading);
      const rightX = Math.cos(heading);
      const rightZ = -Math.sin(heading);
      for (const side of [-0.34, 0.34]) {
        this.dummyObj.position.set(x - fwdX * 0.42 + rightX * side, 0.022, z - fwdZ * 0.42 + rightZ * side);
        this.dummyObj.rotation.set(0, heading + v.slideYaw * 0.5, 0);
        this.dummyObj.updateMatrix();
        this.skidMesh.setMatrixAt(this.skidIdx, this.dummyObj.matrix);
        this.skidIdx = (this.skidIdx + 1) % 200;
      }
      this.skidMesh.instanceMatrix.needsUpdate = true;
    }
    if (own) {
      const slipstreaming = flags.has("slipstream");
      if (slipstreaming) {
        this.localDraftMs += dt * 1000;
        this.localDraftRatio = Math.min(1, this.localDraftRatio + dt * 3);
      } else {
        this.localDraftMs = Math.max(0, this.localDraftMs - dt * 2000);
        this.localDraftRatio = Math.max(0, this.localDraftRatio - dt * 2);
      }
      const activeStreaks = (boosting || slipstreaming) && !lite;
      this.vfx?.setSpeedStreaks(activeStreaks, boosting ? 1.0 : 0.65, x, y, z, heading, speed);
    }
  }

  /** Abertura: primeiro segue o Comandante pela reta final, depois mostra o grid com ele chegando. */
  private cutsceneCamera(u: number, dt: number): void {
    const start = pointAt(this.track, 0).pos;
    const c = this.commander?.root.position ?? new THREE.Vector3(start.x, 5.5, start.z);
    if (u < 0.55) {
      const h = pointAt(this.track, -40).heading;
      _cutWant.set(c.x - Math.sin(h) * 11 + Math.cos(h) * 4, c.y + 3, c.z - Math.cos(h) * 11 - Math.sin(h) * 4);
      _cutLook.set(c.x, c.y + 1.6, c.z);
    } else {
      // atrás do grid: as cadeiras de costas e o Comandante sobre o pórtico, de frente para elas
      const back = pointAt(this.track, this.track.length - 17);
      _cutWant.set(back.pos.x, 2.4, back.pos.z);
      _cutLook.set(c.x, c.y - 1.2, c.z);
    }
    const snap = !this.camReady || u < 0.02 || Math.abs(u - 0.55) < 0.02;
    const k = snap ? 1 : 1 - Math.exp(-dt * 4);
    this.camPos.lerp(_cutWant, k);
    this.camLook.lerp(_cutLook, k);
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
    // a câmera sobe com o salto, suavizada; na queda do vão ela não afunda junto
    this.camY += (Math.max(0, p.y) - this.camY) * Math.min(1, dt * 4);
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const rx = Math.cos(h);
    const rz = -Math.sin(h);

    const driftDir = this.pred ? (this.pred.drifting ? this.pred.driftDir : 0) : (v.last.drift >= 0 ? v.last.driftDir : 0);
    const boosting = this.pred ? this.clock < this.pred.boostUntil : false;
    const speed = this.pred ? this.pred.speed : v.last.speed;
    const speedRatio = Math.min(1, Math.max(0, (speed - 4) / 12));
    // Em alta velocidade e durante o boost, a câmera desce e recua ligeiramente para aumentar a sensação de escala e vácuo
    const camHeight = 3.3 - speedRatio * 0.32 - (boosting ? 0.22 : 0);
    const camDist = 5.6 + speedRatio * 0.35 + (boosting ? 0.3 : 0);

    // Suave movimento dinâmico da câmera para o exterior da curva em drift com interpolação de mola
    const targetCamSwing = driftDir * -0.42;
    const targetLookSwing = driftDir * 0.55;
    this.camDriftOffset += (targetCamSwing - this.camDriftOffset) * Math.min(1, dt * 5);
    this.camLookOffset += (targetLookSwing - this.camLookOffset) * Math.min(1, dt * 5);

    if (this.lookBackActive) {
      // Câmera retrovisor (KeyC ou botão do meio do mouse): olha para trás 180°
      _camWant.set(p.x + fx * camDist, camHeight + this.camY, p.z + fz * camDist);
      _camLook.set(p.x - fx * 10, 0.6 + this.camY * 0.6, p.z - fz * 10);
    } else {
      _camWant.set(p.x - fx * camDist + rx * this.camDriftOffset, camHeight + this.camY, p.z - fz * camDist + rz * this.camDriftOffset);
      _camLook.set(p.x + fx * 10 + rx * this.camLookOffset, 0.6 + this.camY * 0.6, p.z + fz * 10 + rz * this.camLookOffset);
    }

    // saindo da cena de abertura ou ao alternar retrovisor instantaneamente
    if (!this.camReady || this.wasInCutscene || this.lookBackSnap) {
      this.camPos.copy(_camWant);
      this.camLook.copy(_camLook);
      this.camReady = true;
      this.wasInCutscene = false;
      this.lookBackSnap = false;
    }
    const k = this.lookBackActive ? 1 - Math.exp(-dt * 15) : 1 - Math.exp(-dt * 7.5);
    this.camPos.lerp(_camWant, k);
    this.camLook.lerp(_camLook, k);

    this.shake = Math.max(0, this.shake - dt * 4);
    let sx = 0;
    let sy = 0;
    let sz = 0;
    if (this.shake > 0.005) {
      const sh = this.shake * 0.16;
      sx += (Math.random() - 0.5) * sh;
      sy += (Math.random() - 0.5) * sh;
      sz += (Math.random() - 0.5) * sh;
    }
    if (boosting) {
      sx += (Math.random() - 0.5) * 0.055;
      sy += (Math.random() - 0.5) * 0.045;
      sz += (Math.random() - 0.5) * 0.035;
    } else if (speedRatio > 0.3) {
      // Micro-vibração suave de alta velocidade
      sy += (Math.random() - 0.5) * 0.016 * speedRatio;
    }
    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z + sz);
    this.camera.lookAt(this.camLook);

    // a luz do sol e a caixa de sombra acompanham o kart do jogador
    this.sun.position.set(p.x + 25, 45, p.z + 18);
    this.sun.target.position.set(p.x, 0.5, p.z);
    this.sun.target.updateMatrixWorld();

    // FOV dinâmico elástico que abre suavemente de 60° a 74° com velocidade, boost, vácuo e café (e 56° ao frear)
    const isBraking = this.keys.has("ArrowDown") || this.keys.has("KeyS");
    const isDrafting = v.last.flags?.includes("slipstream") ?? false;
    const hasCoffee = boosting && (this.pred?.boostSpeed ?? 0) > 23;
    const targetFov = calculateDynamicFov({
      speed,
      isBoosting: boosting,
      isBraking,
      isDrafting,
      draftRatio: this.localDraftRatio,
      hasCoffee,
    });
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 6);
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
    this.raf = 0;
    // o canal de música só se desliga depois do fade de saída
    const musicBus = this.musicBus;
    this.music.stop(() => musicBus.disconnect());
    try {
      this.rollOsc?.stop();
      this.rollOsc?.disconnect();
      this.rollGain?.disconnect();
      this.skidOsc?.stop();
      this.skidOsc?.disconnect();
      this.skidGain?.disconnect();
    } catch {
      // noop
    }
    for (const c of this.cleanup) c();
    resetTouchInput();
    this.chat.dispose();
    // bonecos e Comandante compartilham geometria do GLB: saem da cena antes da limpeza geral
    if (this.commander) {
      this.scene.remove(this.commander.root);
      this.commander.dispose();
    }
    this.camera.remove(this.listener);
    this.effectsBus.disconnect();
    for (const v of this.views.values()) this.dropView(v);
    this.smokeGeo.dispose();
    for (const p of this.itemParticles) this.scene.remove(p.mesh);
    for (const g of Object.values(this.cupGeo)) g.dispose();
    for (const m of Object.values(this.cupMat)) m.dispose();
    this.itemGeoPaper.dispose();
    this.itemGeoPostit.dispose();
    this.itemGeoDrop.dispose();
    this.itemGeoFlash.dispose();
    this.itemMatPaper.dispose();
    this.itemMatPostit.dispose();
    this.itemMatCoffee.dispose();
    this.itemMatFlash.dispose();
    this.ghostMine?.dispose();
    this.ghostRecord?.dispose();
    this.ghostMine = this.ghostRecord = null;
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.sky.dispose();
    this.boxGeo.dispose();
    this.boxMat.map?.dispose();
    this.boxMat.dispose();
    for (const m of this.hazardMats.values()) m.dispose();
    this.vfx?.dispose();
    this.interactive?.dispose();
    this.disposeTrack?.();
    this.disposeTrack = null;
    this.renderer.dispose();
  }
}
