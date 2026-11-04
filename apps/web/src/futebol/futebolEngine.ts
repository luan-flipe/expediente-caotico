import type { RefObject } from "react";
import * as THREE from "three";
import {
  FUT,
  FUT_COLORS,
  PRESETS,
  fieldFor,
  keepClear,
  markCarry,
  stepPlayer,
  type AvatarDNA,
  type Field,
  type FutInput,
  type FutPlayer,
  type FutPrivate,
  type FutSnapshot,
  type FutTeamConfig,
  type TeamSide,
} from "@ec/shared";
import { ChatBubbles, chatText } from "../chatBubbles";
import { createCharacter, modelReady, type Character } from "../game/character";
import { createGltfLoader } from "../game/gltfLoader";
import { createDynamicSky, type DynamicSky } from "../game/sky";
import { inputBlocked } from "../pause";
import { applyQuality } from "../quality";
import { getSettings, subscribeSettings, type Quality } from "../settings";
import { playWhistle } from "../sound";
import { getState, net, setState } from "../store";
import { IS_TOUCH, resetTouchInput, touchInput } from "../touch";
import ballUrl from "../assets/futebol/bola.glb?url";
import goalUrl from "../assets/futebol/gol.glb?url";
import pitchUrl from "../assets/futebol/ipatingao.glb?url";
import { predictedPlayer, reconcileDrawn } from "./reconcile";
import { TOUCH_KICK, TOUCH_PASS, cancelCharges, chargePower, hasBallReach, newButtons, newCharge, newControlState, pressButton, readFutInput, releaseButton, stepCharge, type FutKeys } from "./controls";
import { Arena } from "./arena";
import { campoDoMapa } from "./arenaLayout";
import { Comemoracoes } from "./comemoracoes";
import { EquipeFilmagem } from "./equipe";
import { Juiz } from "./juiz";
import { CAM_KINDS, REPLAY_LABELS, camPose, replayPose, shotAt, type CamKind, type CamPose, type ReplayShot } from "./cameras";
import { ReplayBuffer, sampleClip, type Clip, type ReplaySample } from "./replay";
import { Torcida } from "./torcida";
import { uniformDNA } from "./uniforme";

export type FutUiSignal = "lock" | "unlock";

/** O que o HUD precisa saber das câmeras: se o jogador só assiste, a câmera escolhida e o replay em andamento. */
export interface FutCamUi {
  spectating: boolean;
  cam: CamKind;
  replay: boolean;
  shot: string;
}

/** Replay de gol: espera depois do gol (a comemoração), quanto do jogo antes e depois do gol entra no clipe (ms). */
const REPLAY_DELAY_MS = 1500;
const REPLAY_BACK_MS = 5500;
const REPLAY_TAIL_MS = 800;
const FOV_PLAY = 65;

interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  f: number;
}

interface View {
  char: Character;
  key: string;
  tag: THREE.Sprite;
  tagKey: string;
  buf: Sample[];
  last: FutSnapshot["players"][number];
  ring: THREE.Mesh | null;
}

/** Passo de envio e de previsão: o mesmo do servidor (30 Hz). */
const DT = 1000 / 30;
const INTERP_MS = 120;
const CAM_DIST = 6.2;
const CAM_SIDE = 0.9;
const HEAD_Y = 1.5;
const PITCH_MIN = -0.6;
const PITCH_MAX = 0.5;
const PITCH_START = -0.3;

const angleLerp = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/** Direção de ataque em ângulo (0 = +z): o time 0 ataca +x, o time 1 ataca -x. */
const attackYaw = (side: TeamSide) => (side === 0 ? Math.PI / 2 : -Math.PI / 2);

function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function makeTag(name: string, hex: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "800 30px 'Bricolage Grotesque', sans-serif";
  g.textAlign = "center";
  g.lineWidth = 6;
  g.strokeStyle = "rgba(20,18,15,0.9)";
  g.strokeText(name, 128, 32);
  g.fillStyle = "#fffdf7";
  g.fillText(name, 128, 32);
  g.fillStyle = "rgba(20,18,15,0.9)";
  g.fillRect(58, 42, 140, 12);
  g.fillStyle = hex;
  g.fillRect(61, 44, 134, 8);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(1.9, 0.475, 1);
  s.renderOrder = 5;
  return s;
}

/** Libera o material e todas as texturas que ele guarda (mapa, normal, rugosidade, emissivo...). */
function disposeMaterial(m: THREE.Material): void {
  for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) (v as THREE.Texture).dispose();
  m.dispose();
}

/** Plano fino no chão (linha do campo). */
function flat(w: number, d: number, x: number, z: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.05, z);
  m.renderOrder = 1;
  return m;
}

/** Linhas do campo do formato, centradas na origem, por cima do gramado. */
function buildLines(f: Field, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const T = 0.14;
  const L = f.halfL * 2;
  const W = f.halfW * 2;
  // contorno
  g.add(flat(L + T, T, 0, -f.halfW, mat), flat(L + T, T, 0, f.halfW, mat), flat(T, W + T, -f.halfL, 0, mat), flat(T, W + T, f.halfL, 0, mat));
  // meio de campo e círculo central
  g.add(flat(T, W, 0, 0, mat));
  // campo do estádio: círculo central de 9,15 m
  const r = Math.min(f.halfW * 0.3, f.halfW > 25 ? 9.15 : 5);
  const ring = new THREE.Mesh(new THREE.RingGeometry(r - T / 2, r + T / 2, 56), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.05, 0);
  ring.renderOrder = 1;
  g.add(ring);
  const dot = (x: number, z: number) => {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), mat);
    d.rotation.x = -Math.PI / 2;
    d.position.set(x, 0.05, z);
    d.renderOrder = 1;
    g.add(d);
  };
  dot(0, 0);
  for (const s of [-1, 1]) {
    const gx = s * f.halfL;
    const bx = gx - s * f.boxL;
    // grande área
    g.add(flat(T, f.boxHalfW * 2, bx, 0, mat), flat(f.boxL, T, gx - (s * f.boxL) / 2, -f.boxHalfW, mat), flat(f.boxL, T, gx - (s * f.boxL) / 2, f.boxHalfW, mat));
    // pequena área (metade da profundidade e da largura)
    const sl = f.boxL * 0.45;
    const sw = f.boxHalfW * 0.5;
    g.add(flat(T, sw * 2, gx - s * sl, 0, mat), flat(sl, T, gx - (s * sl) / 2, -sw, mat), flat(sl, T, gx - (s * sl) / 2, sw, mat));
    dot(gx - s * f.penaltySpot, 0);
  }
  return g;
}

/** Motor do Futebol da Firma: renderiza snapshots, prevê o próprio boneco e manda intenções. */
export class FutebolEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(65, 1, 0.1, 500);
  private sky: DynamicSky;
  private sun: THREE.DirectionalLight;
  private quality: Quality | null = null;
  private chat = new ChatBubbles(2.7);
  private fx = new Comemoracoes(this.scene);
  private eventsT = -1;
  /** Quem a câmera acompanha durante a comemoração do gol. */
  private focusId = "";
  private views = new Map<string, View>();
  private avatars = new Map<string, AvatarDNA>();
  private snap: FutSnapshot | null = null;
  private me: FutPrivate | null = null;
  private field: Field | null = null;
  private lines: THREE.Group | null = null;
  private arena: Arena | null = null;
  private crowd: Torcida | null = null;
  private crew: EquipeFilmagem | null = null;
  private ref: Juiz | null = null;
  // câmeras: espectador e replay
  private history = new ReplayBuffer();
  private pendingReplay: { at: number; goalT: number; goalSide: number } | null = null;
  private replay: { clip: Clip; start: number; goalSide: number; shot: ReplayShot } | null = null;
  private skipReq = false;
  private camKind: CamKind = "tv";
  private followId = "";
  private fovWant = FOV_PLAY;
  private camCut = false;
  private camUiKey = "";
  private rsNow: ReplaySample | null = null;
  private replayP = 0;
  private clock = 0;
  private goals: THREE.Object3D[] = [];
  private lineMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.92 });

  private ball = new THREE.Group();
  private ballModel: THREE.Object3D | null = null;
  private ballShadow: THREE.Mesh;
  private ballBuf: Sample[] = [];
  private ballPrev: THREE.Vector3 | null = null;

  private aimArrow: THREE.Mesh;

  private yaw = 0;
  private pitch = PITCH_START;
  private fixedYaw = false;
  private aimYaw = 0;
  private yawReady = false;
  private penTaker = "";
  private locked = false;
  private keys = new Set<string>();
  private btn = newButtons();
  private ctl = newControlState();
  private raf = 0;
  private lastFrame = performance.now();
  private cleanup: (() => void)[] = [];
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camReady = false;

  // previsão do próprio boneco
  private seq = 0;
  private acc = 0;
  private pred: FutPlayer | null = null;
  private prevX = 0;
  private prevZ = 0;
  private pending: { seq: number; input: FutInput }[] = [];
  private vis = { x: 0, z: 0 };
  private charge = newCharge();
  private myPos = new THREE.Vector3();
  // temporários do quadro (nada de new por frame)
  private tmpFwd = new THREE.Vector3();
  private tmpRight = new THREE.Vector3();
  private tmpWant = new THREE.Vector3();
  private tmpLook = new THREE.Vector3();
  private tmpAxis = new THREE.Vector3();
  private tmpQuat = new THREE.Quaternion();
  private finalBuf: { char: Character; side: TeamSide }[] = [];
  // cache do visual de cada jogador: só recalcula quando times, avatares, papel ou modelo mudam
  private teamsSig = "";
  private avatarVer = 0;
  private looks = new Map<string, { sig: string; key: string }>();

  /** Barra de força (DOM do HUD): o motor posiciona e preenche a cada quadro. */
  powerRef: RefObject<HTMLElement | null> | null = null;
  powerFillRef: RefObject<HTMLElement | null> | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly myId: string,
    private readonly onUi: (s: FutUiSignal) => void,
    private readonly onCam?: (s: FutCamUi) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.fixedYaw = IS_TOUCH;

    this.sky = createDynamicSky(this.scene, {
      sunPosition: new THREE.Vector3(30, 50, 20),
      sunIntensity: 2.2,
      cloudCoverage: 0.4,
      cloudSpeed: 0.8,
      groundSize: 300,
      groundY: 0.01,
    });
    this.sun = this.sky.sunLight;
    Object.assign(this.sun.shadow.camera, { left: -45, right: 45, top: 35, bottom: -35, near: 1, far: 140 });

    // gramado de apoio: a vista nunca mostra o vazio se o estádio demorar a chegar
    const base = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: "#3d7a38", roughness: 1 }));
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.03;
    base.receiveShadow = true;
    this.scene.add(base);

    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.35, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.renderOrder = 2;
    this.scene.add(this.ballShadow);
    const fallback = new THREE.Mesh(new THREE.SphereGeometry(FUT.ballRadius, 16, 12), new THREE.MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.6 }));
    fallback.castShadow = true;
    this.ball.add(fallback);
    this.scene.add(this.ball);

    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 1);
    arrowShape.lineTo(0.28, 0.45);
    arrowShape.lineTo(0.1, 0.45);
    arrowShape.lineTo(0.1, 0);
    arrowShape.lineTo(-0.1, 0);
    arrowShape.lineTo(-0.1, 0.45);
    arrowShape.lineTo(-0.28, 0.45);
    arrowShape.closePath();
    this.aimArrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color: "#ffe14d", transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
    this.aimArrow.renderOrder = 3;
    this.aimArrow.visible = false;
    this.scene.add(this.aimArrow);

    void this.loadAssets();
    this.applySettings();
    this.cleanup.push(subscribeSettings(() => this.applySettings()));
    this.bindInput();
    this.raf = requestAnimationFrame(this.loop);
  }

  setAvatars(list: { id: string; avatar: AvatarDNA }[]): void {
    for (const p of list) this.avatars.set(p.id, p.avatar);
    this.avatarVer++;
  }

  private async loadAssets(): Promise<void> {
    const loader = createGltfLoader();
    const shadows = (o: THREE.Object3D, cast: boolean) =>
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) {
          m.receiveShadow = true;
          m.castShadow = cast;
        }
      });
    const [pitch, ball, goal] = await Promise.allSettled([loader.loadAsync(pitchUrl), loader.loadAsync(ballUrl), loader.loadAsync(goalUrl)]);
    if (this.disposed) {
      // a tela saiu durante o carregamento: libera o que chegou
      for (const r of [pitch, ball, goal]) if (r.status === "fulfilled") this.freeObject(r.value.scene);
      return;
    }
    if (pitch.status === "fulfilled") {
      const map = pitch.value.scene;
      // só o gramado (textura 340x520) recebe sombra: o volume de sombra cobre o campo e o resto do mapa fica fora dele
      map.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) m.receiveShadow = ((m.material as THREE.MeshStandardMaterial).map?.image as { width?: number } | undefined)?.width === 340;
        // mapa parado: as matrizes são calculadas uma vez
        c.updateMatrix();
        c.matrixAutoUpdate = false;
      });
      this.scene.add(map);
      map.updateMatrixWorld(true);
      this.crowd = new Torcida(this.scene, getSettings().quality);
    } else {
      console.warn("ipatingao.glb não carregou", pitch.reason);
    }
    if (ball.status === "fulfilled") {
      shadows(ball.value.scene, true);
      this.ballModel = ball.value.scene;
      this.ball.clear();
      this.ball.add(ball.value.scene);
    } else {
      console.warn("bola.glb não carregou", ball.reason);
    }
    if (goal.status === "fulfilled") {
      for (const s of [-1, 1]) {
        const g = goal.value.scene.clone(true);
        shadows(g, true);
        // a boca do gol (+Z no arquivo) aponta para o centro do campo
        g.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
        this.goals.push(g);
        this.scene.add(g);
      }
      this.placeGoals();
    } else {
      console.warn("gol.glb não carregou", goal.reason);
    }
  }

  private freeObject(o: THREE.Object3D): void {
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as (THREE.Material & { map?: THREE.Texture | null }) | (THREE.Material & { map?: THREE.Texture | null })[] | undefined;
      for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        disposeMaterial(x);
      }
    });
  }

  private placeGoals(): void {
    if (!this.field || this.goals.length < 2) return;
    this.goals[0].position.set(-this.field.halfL, 0, 0);
    this.goals[1].position.set(this.field.halfL, 0, 0);
    // o modelo mede 4 x 2 m (largura x altura): gol maior só estica a boca, a altura e a profundidade da rede
    const sx = this.field.goalHalfW / 2;
    const sy = this.field.goalH / 2;
    // o mapa do estádio já traz os gols (traves, travessão e rede): o modelo avulso ficaria dobrado por cima deles,
    // com as traves em outro lugar. Nele a sim usa as medidas do gol do mapa (IPATINGAO)
    const noMapa = campoDoMapa(this.field);
    for (const g of this.goals) {
      g.visible = !noMapa;
      g.scale.set(sx, sy, sx);
    }
  }

  private buildField(format: FutSnapshot["format"]): void {
    this.field = fieldFor(format);
    // no campo do mapa as linhas (contorno, meio, círculo, áreas, marca do pênalti) já vêm pintadas no gramado do glb
    if (!campoDoMapa(this.field)) {
      this.lines = buildLines(this.field, this.lineMat);
      this.scene.add(this.lines);
    }
    this.arena = new Arena(this.scene, this.field);
    this.crew = new EquipeFilmagem(this.scene, this.field);
    this.placeGoals();
    const f = this.field;
    Object.assign(this.sun.shadow.camera, { left: -f.halfL - 12, right: f.halfL + 12, top: f.halfW + 12, bottom: -f.halfW - 12 });
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  /** Qualidade gráfica ao vivo, como no tiroteio. */
  private applySettings(): void {
    const q = getSettings().quality;
    if (q === this.quality) return;
    this.quality = q;
    // no Leve o mapa de sombra é menor e o filtro mais simples (os materiais são recompilados logo abaixo)
    const leve = q === "leve";
    this.renderer.shadowMap.type = leve ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.sun.shadow.mapSize.set(leve ? 1024 : 2048, leve ? 1024 : 2048);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    applyQuality(this.renderer, this.scene, this.sun, q);
    this.crowd?.setQuality(q);
  }

  // ---------- entrada ----------
  private bindInput(): void {
    const on = <E extends Event>(t: string, fn: (e: E) => void, target: EventTarget = window) => {
      target.addEventListener(t, fn as EventListener);
      this.cleanup.push(() => target.removeEventListener(t, fn as EventListener));
    };
    const canvas = this.canvas;
    // o mouse só move a câmera: o clique prende o mouse (pointer lock) e mais nada
    const grab = (e: MouseEvent) => {
      // quem só assiste não prende o mouse: precisa dele para os botões de câmera
      if (this.locked || IS_TOUCH || e.button !== 0 || inputBlocked(getState()) || this.isSpectating()) return;
      canvas.requestPointerLock();
    };
    canvas.addEventListener("mousedown", grab);
    this.cleanup.push(() => canvas.removeEventListener("mousedown", grab));

    // nada de menu de contexto na tela do jogo
    on<Event>("contextmenu", (e) => e.preventDefault());
    on(
      "pointerlockchange",
      () => {
        this.locked = document.pointerLockElement === canvas;
        if (!this.locked) this.cancelButtons();
        this.onUi(this.locked ? "lock" : "unlock");
      },
      document,
    );
    on<MouseEvent>("mousemove", (e) => {
      if (!this.locked || this.fixedYaw) return;
      const { mouseSens, invertY } = getSettings();
      this.yaw -= e.movementX * 0.0025 * mouseSens;
      this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch - e.movementY * 0.0022 * mouseSens * (invertY ? -1 : 1)));
    });
    on<MouseEvent>("mousedown", (e) => {
      // botão do meio abriria o rolamento automático e roubaria o mouse
      if (this.locked && e.button === 1) e.preventDefault();
    });
    // perdeu o foco ou a aba: cancela a carga (soltar o botão fora da janela não pode chutar sem o jogador ver)
    on("blur", () => {
      this.keys.clear();
      this.cancelButtons();
    });
    on(
      "visibilitychange",
      () => {
        if (document.visibilityState === "hidden") {
          this.keys.clear();
          this.cancelButtons();
        }
      },
      document,
    );
    on<KeyboardEvent>("keydown", (e) => {
      if (inputBlocked(getState())) return;
      const k = e.code;
      const map = getSettings().keys.futebol;
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (k === "Space" || Object.values(map).includes(k))) e.preventDefault();
      if (k === map.placar) {
        setState({ scoreboard: true });
        return;
      }
      // replay de gol: Espaço ou Enter pulam
      if ((k === "Space" || k === "Enter") && this.replay) {
        e.preventDefault();
        this.skipReplay();
        return;
      }
      // espectador: C troca a câmera, 1 a 5 escolhem, setas trocam o jogador seguido
      if (this.isSpectating()) {
        const n = k.startsWith("Digit") ? Number(k.slice(5)) - 1 : -1;
        if (k === "KeyC") {
          this.cycleCam(e.shiftKey ? -1 : 1);
          return;
        }
        if (n >= 0 && n < CAM_KINDS.length) {
          this.setCam(CAM_KINDS[n]);
          return;
        }
        if (this.camKind === "jogador" && (k === "ArrowLeft" || k === "ArrowRight")) {
          this.cycleTarget(k === "ArrowRight" ? 1 : -1);
          return;
        }
      }
      // Espaço (teclado) e os botões da tela (Chute e Passe) são os botões de ação
      if (k === "Space") {
        pressButton(this.btn, "space");
        return;
      }
      if (k === TOUCH_KICK) {
        pressButton(this.btn, "kick");
        return;
      }
      if (k === TOUCH_PASS) {
        pressButton(this.btn, "pass");
        return;
      }
      this.keys.add(k);
    });
    on<KeyboardEvent>("keyup", (e) => {
      if (e.code === "Space") {
        releaseButton(this.btn, "space");
        return;
      }
      if (e.code === TOUCH_KICK) {
        releaseButton(this.btn, "kick");
        return;
      }
      if (e.code === TOUCH_PASS) {
        releaseButton(this.btn, "pass");
        return;
      }
      this.keys.delete(e.code);
      if (e.code === getSettings().keys.futebol.placar) setState({ scoreboard: false });
    });
  }

  /** Cancela a carga sem chutar (ver cancelCharges). */
  private cancelButtons(): void {
    cancelCharges(this.btn, this.ctl);
  }

  // ---------- rede ----------
  applySnapshot(s: FutSnapshot, me: FutPrivate | null): void {
    const now = performance.now();
    this.snap = s;
    this.me = me;
    this.history.push(s);
    this.teamsSig = s.teams.map((t) => `${t.name}|${t.kit}|${t.color}`).join("/");
    if (!this.field) this.buildField(s.format);
    if (this.field && (!this.ref || this.ref.retint(s.teams))) {
      this.ref?.dispose();
      this.ref = new Juiz(this.scene, this.field, s.teams);
    }

    const seen = new Set<string>();
    for (const p of s.players) {
      seen.add(p.id);
      const v = this.viewFor(p, s.teams);
      v.buf.push({ t: now, x: p.x, y: 0, z: p.z, f: p.facing });
      if (v.buf.length > 20) v.buf.shift();
      // carrinho da sim (tackleMs > 0): toca o clipe na subida, para local, bots e remotos
      if (p.sliding && !v.last.sliding) v.char.play("carrinho");
      v.last = p;
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      this.dropView(v);
      this.views.delete(id);
      this.looks.delete(id);
    }
    this.ballBuf.push({ t: now, x: s.ball.x, y: s.ball.y, z: s.ball.z, f: 0 });
    if (this.ballBuf.length > 20) this.ballBuf.shift();

    const mine = s.players.find((p) => p.id === this.myId);
    if (mine && !this.yawReady) {
      this.yaw = attackYaw(mine.side);
      this.aimYaw = this.yaw;
      this.yawReady = true;
    }
    // pênalti cobrado por mim: a câmera olha para o gol
    const taker = s.phase === "penalties" ? (s.pens?.takerId ?? "") : s.restart?.kind === "penalti" ? s.restart.takerId : "";
    if (taker && taker !== this.penTaker && taker === this.myId && mine) {
      this.yaw = attackYaw(mine.side);
      this.aimYaw = this.yaw;
    }
    this.penTaker = taker;

    if (mine) this.reconcile(mine, me);
    this.handleEvents(s);
  }

  /** Apito e comemoração a partir dos eventos do snapshot (cada snapshot chega uma vez). */
  private handleEvents(s: FutSnapshot): void {
    if (s.phase !== "goal") {
      this.fx.clear();
      this.focusId = "";
    }
    if (s.t <= this.eventsT) return;
    this.eventsT = s.t;
    for (const e of s.events) {
      if (e.type === "whistle") {
        playWhistle(e.kind);
        if (e.kind === "end") this.crowd?.cheer();
      } else if (e.type === "foul") {
        playWhistle("foul");
        this.ref?.foul(e.x ?? s.ball.x, e.z ?? s.ball.z);
      } else if (e.type === "card") {
        this.ref?.showCard(e.card);
      } else if (e.type === "goal") {
        this.celebrateGoal(e, s);
        this.pendingReplay = { at: performance.now(), goalT: s.t, goalSide: Math.sign(s.ball.x) || 1 };
      }
    }
  }

  private celebrateGoal(e: Extract<FutSnapshot["events"][number], { type: "goal" }>, s: FutSnapshot): void {
    const scorer = !e.own && e.scorerId ? this.views.get(e.scorerId) : undefined;
    const mates: Character[] = [];
    let keeper: Character | null = null;
    for (const [id, v] of this.views) {
      if (v.last.sentOff || id === scorer?.last.id) continue;
      if (v.last.side === e.side && v.last.role === "linha") mates.push(v.char);
      else if (v.last.side !== e.side && v.last.role === "goleiro") keeper = v.char;
    }
    this.crowd?.cheer();
    this.focusId = scorer?.last.id ?? "";
    this.fx.start({
      scorer: scorer?.char ?? null,
      mates,
      keeper,
      color: FUT_COLORS[s.teams[e.side].color]?.hex ?? "#ffffff",
      at: new THREE.Vector3(scorer?.char.root.position.x ?? s.ball.x, 0, scorer?.char.root.position.z ?? s.ball.z),
    });
  }

  /** O próprio boneco só é previsto onde o servidor também o move (jogo rolando, em pé, sem estar no carrinho). */
  private canPredict(p: FutSnapshot["players"][number] | undefined): boolean {
    return !!p && !!this.me && (this.snap?.phase === "play" || this.snap?.phase === "restart") && !p.down && !p.sliding && !p.sentOff && p.role === "linha";
  }

  private reconcile(p: FutSnapshot["players"][number], me: FutPrivate | null): void {
    if (!this.field || !me || !this.canPredict(p)) {
      this.pred = null;
      this.pending = [];
      this.vis.x = 0;
      this.vis.z = 0;
      return;
    }
    while (this.pending.length && this.pending[0].seq <= me.ackSeq) this.pending.shift();
    const next = predictedPlayer(p, me, this.snap?.ball.ownerId ?? null);
    const hold = this.restartHold();
    for (const q of this.pending) {
      stepPlayer(next, q.input, this.field, DT);
      if (hold) keepClear(next, hold);
    }
    const old = this.pred;
    if (old) {
      // a posição desenhada agora (interpolada) não pode pular: o desvio absorve a diferença e some aos poucos
      const k = this.acc / DT;
      const drawn = { x: this.prevX + (old.x - this.prevX) * k + this.vis.x, z: this.prevZ + (old.z - this.prevZ) * k + this.vis.z };
      const r = reconcileDrawn(drawn, next);
      this.prevX = r.prev.x;
      this.prevZ = r.prev.z;
      this.vis.x = r.vis.x;
      this.vis.z = r.vis.z;
    } else {
      this.prevX = next.x;
      this.prevZ = next.z;
      this.vis.x = 0;
      this.vis.z = 0;
    }
    this.pred = next;
  }

  private teamDna(p: FutSnapshot["players"][number], teams: [FutTeamConfig, FutTeamConfig]): AvatarDNA {
    const base = this.avatars.get(p.id) ?? PRESETS[hashOf(p.id) % PRESETS.length].dna;
    let team = teams[p.side];
    if (p.role === "goleiro") {
      // goleiro de cor diferente das duas camisas (e do goleiro do outro lado)
      const taken = new Set<number>([teams[0].color, teams[1].color]);
      const free = [5, 4, 7, 3, 6, 2].filter((c) => !taken.has(c));
      team = { name: team.name, kit: 2, color: free[p.side % free.length] ?? 5 };
    }
    return uniformDNA(base, team);
  }

  private viewFor(p: FutSnapshot["players"][number], teams: [FutTeamConfig, FutTeamConfig]): View {
    const glb = modelReady();
    const sig = `${this.teamsSig}|${this.avatarVer}|${p.side}|${p.role}|${glb}`;
    let look = this.looks.get(p.id);
    if (look?.sig !== sig) {
      look = { sig, key: JSON.stringify(this.teamDna(p, teams)) + (glb ? "|glb" : "") };
      this.looks.set(p.id, look);
    }
    const key = look.key;
    let v = this.views.get(p.id);
    if (v && v.key === key) {
      this.refreshTag(v, p, teams);
      return v;
    }
    const dna = this.teamDna(p, teams);
    const buf = v?.buf ?? [];
    if (v) this.dropView(v);
    const char = createCharacter(dna);
    char.root.rotation.order = "YXZ";
    char.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
    let ring: THREE.Mesh | null = null;
    if (p.id === this.myId) {
      ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: "#ffe14d", transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      ring.renderOrder = 3;
      char.root.add(ring);
    }
    const tag = makeTag(p.name, FUT_COLORS[teams[p.side].color]?.hex ?? "#fff");
    tag.position.y = 2.35;
    if (p.id !== this.myId) char.root.add(tag);
    this.scene.add(char.root);
    v = { char, key, tag, tagKey: `${p.name}|${p.side}|${teams[p.side].color}`, buf, last: p, ring };
    this.views.set(p.id, v);
    return v;
  }

  private refreshTag(v: View, p: FutSnapshot["players"][number], teams: [FutTeamConfig, FutTeamConfig]): void {
    const tagKey = `${p.name}|${p.side}|${teams[p.side].color}`;
    if (tagKey === v.tagKey) return;
    v.char.root.remove(v.tag);
    v.tag.material.map?.dispose();
    v.tag.material.dispose();
    v.tag = makeTag(p.name, FUT_COLORS[teams[p.side].color]?.hex ?? "#fff");
    v.tag.position.y = 2.35;
    if (p.id !== this.myId) v.char.root.add(v.tag);
    v.tagKey = tagKey;
  }

  private dropView(v: View): void {
    this.scene.remove(v.char.root);
    v.ring?.geometry.dispose();
    (v.ring?.material as THREE.Material | undefined)?.dispose();
    v.tag.material.map?.dispose();
    v.tag.material.dispose();
    v.char.dispose();
  }

  showChat(id: string, kind: "phrase" | "emote", index: number): void {
    const text = chatText(kind, index);
    if (text) this.chat.show(id, text, kind === "emote", performance.now());
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

  private readKeys(): FutKeys {
    const map = getSettings().keys.futebol;
    return {
      frente: this.keys.has(map.frente),
      tras: this.keys.has(map.tras),
      esquerda: this.keys.has(map.esquerda),
      direita: this.keys.has(map.direita),
      correr: this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
      stick: touchInput.move,
    };
  }

  /** Um passo de 30 Hz: lê os controles, manda ao servidor e prevê o próprio movimento. */
  private fixedStep(now: number): void {
    const s = this.snap;
    if (!s) return;
    if (s.phase === "over") {
      this.charge.kind = null;
      return;
    }
    const me = s.players.find((p) => p.id === this.myId);
    if (!me || me.role !== "linha") {
      this.charge.kind = null;
      return;
    }
    let input: FutInput;
    if (inputBlocked(getState()) || me.sentOff) {
      // menu ou chat por cima: comando parado. Sem botão apertado o servidor zera a carga sem chutar (touch.ts), ou seja, cancela
      this.ctl = newControlState();
      cancelCharges(this.btn, this.ctl);
      input = { mx: 0, mz: 0, aim: this.aimYaw, sprint: false, kick: "none", pass: "none" };
    } else {
      const keys = this.readKeys();
      const stick = Math.hypot(keys.stick.x, keys.stick.y);
      // no toque a mira é a direção do analógico (parado, vale a última)
      let aim = this.yaw;
      if (this.fixedYaw) {
        if (stick > 0) {
          const wx = keys.stick.y * Math.sin(this.yaw) - keys.stick.x * Math.cos(this.yaw);
          const wz = keys.stick.y * Math.cos(this.yaw) + keys.stick.x * Math.sin(this.yaw);
          this.aimYaw = Math.atan2(wx, wz);
        }
        aim = this.aimYaw;
      } else {
        this.aimYaw = this.yaw;
      }
      const hasBall = hasBallReach(s.ball, { id: me.id, x: this.pred?.x ?? me.x, z: this.pred?.z ?? me.z });
      input = readFutInput(keys, this.btn, now, this.ctl, { yaw: this.yaw, aim, hasBall });
    }
    const seq = ++this.seq;
    net.send({ t: "futInput", ...input, seq });
    stepCharge(this.charge, input, now);
    if (this.pred && this.field && this.canPredict(me)) {
      this.pending.push({ seq, input });
      if (this.pending.length > 90) this.pending.shift();
      this.prevX = this.pred.x;
      this.prevZ = this.pred.z;
      markCarry(this.pred, s.ball.ownerId);
      stepPlayer(this.pred, input, this.field, DT);
      const hold = this.restartHold();
      if (hold) keepClear(this.pred, hold);
    }
  }

  /** Cobrança em andamento que afasta os jogadores (a sim faz o mesmo; a disputa de pênaltis não afasta). */
  private restartHold(): NonNullable<FutSnapshot["restart"]> | null {
    const s = this.snap;
    return s && s.phase !== "penalties" ? s.restart : null;
  }

  private sampleAt(buf: Sample[], rt: number): Sample | null {
    if (!buf.length) return null;
    let a = buf[0];
    let c = buf[buf.length - 1];
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i].t <= rt && buf[i + 1].t >= rt) {
        a = buf[i];
        c = buf[i + 1];
        break;
      }
    }
    // salto grande (saída de bola, cobrança, reposição): vai direto, sem deslizar pelo campo
    if (Math.hypot(c.x - a.x, c.z - a.z) > 5 && rt >= a.t) return { ...c, t: rt };
    const k = c.t === a.t ? 1 : Math.max(0, Math.min(1, (rt - a.t) / (c.t - a.t)));
    return { t: rt, x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, z: a.z + (c.z - a.z) * k, f: angleLerp(a.f, c.f, k) };
  }

  private step(dt: number, now: number): void {
    this.chat.update(now, (id) => this.views.get(id)?.char.root);
    if (!this.fixedYaw) {
      if (this.keys.has("ArrowLeft")) this.yaw += dt * 2.2;
      if (this.keys.has("ArrowRight")) this.yaw -= dt * 2.2;
      if (this.keys.has("ArrowUp")) this.pitch = Math.min(PITCH_MAX, this.pitch + dt * 1.2);
      if (this.keys.has("ArrowDown")) this.pitch = Math.max(PITCH_MIN, this.pitch - dt * 1.2);
    }

    this.acc += dt * 1000;
    while (this.acc >= DT) {
      this.acc -= DT;
      this.fixedStep(now);
    }
    this.vis.x *= Math.exp(-dt * 12);
    this.vis.z *= Math.exp(-dt * 12);

    const rt = now - INTERP_MS;
    const rs = this.stepReplay(now);
    for (const [id, v] of this.views) {
      const p = v.last;
      let x: number;
      let z: number;
      let f: number;
      let speed: number;
      let lying = p.down;
      const rp = rs?.players.get(id);
      if (rp) {
        x = rp.x;
        z = rp.z;
        f = rp.f;
        speed = rp.speed;
        lying = rp.down;
      } else if (id === this.myId && this.pred) {
        const k = this.acc / DT;
        x = this.prevX + (this.pred.x - this.prevX) * k + this.vis.x;
        z = this.prevZ + (this.pred.z - this.prevZ) * k + this.vis.z;
        f = this.pred.facing;
        speed = Math.hypot(this.pred.vx, this.pred.vz);
      } else {
        const sm = this.sampleAt(v.buf, rt);
        x = sm?.x ?? p.x;
        z = sm?.z ?? p.z;
        f = sm?.f ?? p.facing;
        speed = Math.hypot(p.vx, p.vz);
      }
      const root = v.char.root;
      root.position.set(x, lying ? 0.18 : 0, z);
      root.rotation.y = f;
      root.rotation.x = lying ? -1.35 : 0;
      root.visible = !p.sentOff;
      v.char.update(dt, lying || p.sliding ? 0 : Math.min(1, speed / FUT.walkSpeed));
      if (id === this.myId) this.myPos.set(x, 0, z);
    }

    if (this.snap?.phase === "over") {
      const sn = this.snap;
      const [a, b] = sn.pens ? sn.pens.goals : sn.score;
      const winner = sn.score[0] !== sn.score[1] ? (sn.score[0] > sn.score[1] ? 0 : 1) : a !== b ? (a > b ? 0 : 1) : null;
      let n = 0;
      for (const v of this.views.values()) {
        const e = (this.finalBuf[n] ??= { char: v.char, side: v.last.side });
        e.char = v.char;
        e.side = v.last.side;
        n++;
      }
      this.finalBuf.length = n;
      this.fx.final(dt, winner, this.finalBuf);
    } else {
      this.fx.update(dt);
    }

    // bola
    const bs = rs ? { t: rt, x: rs.ball.x, y: rs.ball.y, z: rs.ball.z, f: 0 } : this.sampleAt(this.ballBuf, rt);
    if (bs) {
      this.ball.position.set(bs.x, bs.y, bs.z);
      this.ballShadow.position.set(bs.x, 0.06, bs.z);
      this.ballShadow.scale.setScalar(Math.max(0.5, 1 - bs.y * 0.25));
      if (this.ballPrev) {
        const dx = bs.x - this.ballPrev.x;
        const dz = bs.z - this.ballPrev.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1e-4 && dist < 5) {
          this.tmpQuat.setFromAxisAngle(this.tmpAxis.set(dz, 0, -dx).normalize(), dist / FUT.ballRadius);
          this.ball.quaternion.premultiply(this.tmpQuat);
        }
      }
      (this.ballPrev ??= new THREE.Vector3()).set(bs.x, bs.y, bs.z);
    }

    this.clock += dt;
    this.arena?.update(this.clock);
    this.crowd?.update(dt);
    this.crew?.update(dt, this.ball.position.x, this.ball.position.z);
    this.ref?.update(dt, this.ball.position.x, this.ball.position.z);
    this.updateAim(now);
    this.updateCamera(dt);
    this.updatePower(now);
    this.reportCam();
    this.sky.update(dt, this.camera.position);
  }

  /** Direção do chute: sempre o gol adversário (a sim faz o mesmo); nos reinícios de lateral, escanteio, tiro de meta e saída vale a câmera. */
  private shotYaw(): number {
    const s = this.snap;
    const me = s?.players.find((p) => p.id === this.myId);
    const k = s?.restart?.kind;
    if (!s || !me || !this.field || (k && k !== "falta" && k !== "penalti")) return this.aimYaw;
    const gx = (me.side === 0 ? 1 : -1) * this.field.halfL;
    return Math.atan2(gx - this.myPos.x, -this.myPos.z);
  }

  /** Seta no chão na direção do chute: fraca parada, mais forte e longa carregando. */
  private updateAim(now: number): void {
    const me = this.views.get(this.myId)?.last;
    const live = !!me && !me.sentOff && this.snap?.phase !== "over";
    this.aimArrow.visible = live && !!this.field && !this.replay && !this.isSpectating();
    if (!this.aimArrow.visible) return;
    const power = chargePower(this.charge, now);
    const len = 1.6 + power * 4;
    const w = 1.1 + power * 0.5;
    this.aimArrow.scale.set(w, len, 1);
    // a forma aponta para +Y; deitada (x = 90 graus) passa a apontar +Z, e o giro em y leva à mira
    this.aimArrow.rotation.order = "YXZ";
    const yaw = this.shotYaw();
    this.aimArrow.rotation.set(Math.PI / 2, yaw, 0);
    this.aimArrow.position.set(this.myPos.x + Math.sin(yaw) * 0.8, 0.07, this.myPos.z + Math.cos(yaw) * 0.8);
    const mat = this.aimArrow.material as THREE.MeshBasicMaterial;
    mat.opacity = this.charge.kind ? 0.85 : 0.35;
    mat.color.set(this.charge.kind === "pass" ? "#5ad1ff" : this.charge.kind === "kick" ? "#ff5a3d" : "#ffe14d");
  }

  /** Barra de força: segue o input local (carga atual), não o servidor; o elemento é lido a cada quadro porque o HUD pode montar depois do motor. */
  private updatePower(now: number): void {
    const el = this.powerRef?.current;
    if (!el) return;
    const kind = this.charge.kind;
    if (!kind || !this.snap || this.snap.phase === "over" || this.replay) {
      if (el.style.display !== "none") el.style.display = "none";
      return;
    }
    const p = this.tmpWant.set(this.myPos.x, 2.3, this.myPos.z).project(this.camera);
    // atrás da câmera: não há onde desenhar
    if (p.z > 1) {
      el.style.display = "none";
      return;
    }
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const me = this.views.get(this.myId)?.last;
    el.style.display = "block";
    el.dataset.kind = kind;
    // sem a bola ao alcance o mesmo botão vira carrinho/disputa
    el.dataset.ball = me && hasBallReach(this.snap.ball, me) ? "1" : "0";
    el.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px) translate(-50%, -100%)`;
    const fill = this.powerFillRef?.current;
    if (fill) fill.style.width = `${Math.round(chargePower(this.charge, now) * 100)}%`;
  }

  /** Replay em andamento: quando termina (fim do clipe, pulo, jogo rolando de novo) e quando começa (depois da comemoração). */
  private stepReplay(now: number): ReplaySample | null {
    const s = this.snap;
    // o replay só vale na comemoração e na espera da saída de bola (antes da contagem), nunca com o jogo valendo
    const idle = !!s && (s.phase === "goal" || (s.phase === "restart" && s.restart?.kind === "saida" && s.restart.leftMs > FUT.restartCountdownMs));
    const rp = this.replay;
    if (!rp) {
      const pend = this.pendingReplay;
      this.rsNow = null;
      if (!pend) return null;
      if (!idle) {
        this.pendingReplay = null;
        return null;
      }
      if (now - pend.at >= REPLAY_DELAY_MS && this.history.lastT >= pend.goalT + REPLAY_TAIL_MS) {
        const clip = this.history.slice(pend.goalT - REPLAY_BACK_MS, pend.goalT + REPLAY_TAIL_MS);
        this.pendingReplay = null;
        if (clip && clip.to - clip.from > 1500) {
          this.replay = { clip, start: now, goalSide: pend.goalSide, shot: "" as ReplayShot };
          this.camCut = true;
          this.fx.clear();
        }
      }
      return null;
    }
    const span = rp.clip.to - rp.clip.from;
    const el = now - rp.start;
    if (this.skipReq || el >= span || !idle) {
      this.replay = null;
      this.skipReq = false;
      this.rsNow = null;
      this.camCut = true;
      return null;
    }
    this.replayP = el / span;
    this.rsNow = sampleClip(rp.clip, rp.clip.from + el);
    return this.rsNow;
  }

  /** Pula o replay em andamento. */
  skipReplay(): void {
    if (this.replay) this.skipReq = true;
  }

  /** O jogador só assiste: expulso ou fora da partida. */
  private isSpectating(): boolean {
    const s = this.snap;
    if (!s) return false;
    const me = s.players.find((p) => p.id === this.myId);
    return !me || me.role !== "linha" || me.sentOff;
  }

  /** Escolhe a câmera do espectador. */
  setCam(k: CamKind): void {
    if (k !== this.camKind) this.camCut = true;
    this.camKind = k;
  }

  private cycleCam(step: number): void {
    const i = CAM_KINDS.indexOf(this.camKind);
    this.setCam(CAM_KINDS[(i + step + CAM_KINDS.length) % CAM_KINDS.length]);
  }

  /** Próximo (ou anterior) jogador seguido pela câmera "seguir jogador". */
  private cycleTarget(step: number): void {
    const ids = [...this.views.values()].filter((v) => v.last.role === "linha" && !v.last.sentOff).map((v) => v.last.id).sort();
    if (!ids.length) return;
    const i = ids.indexOf(this.followId);
    this.followId = ids[(i < 0 ? (step > 0 ? 0 : ids.length - 1) : i + step + ids.length) % ids.length];
    this.camCut = true;
  }

  /** Quem a câmera "seguir jogador" mostra: o escolhido, senão quem está com a bola, senão o mais perto dela. */
  private followTarget(): { x: number; z: number; facing: number } | null {
    const chosen = this.views.get(this.followId);
    let v = chosen && !chosen.last.sentOff ? chosen : undefined;
    if (!v && this.snap?.ball.ownerId) v = this.views.get(this.snap.ball.ownerId);
    if (!v) {
      let best = Infinity;
      for (const c of this.views.values()) {
        if (c.last.role !== "linha" || c.last.sentOff) continue;
        const d = Math.hypot(c.char.root.position.x - this.ball.position.x, c.char.root.position.z - this.ball.position.z);
        if (d < best) {
          best = d;
          v = c;
        }
      }
    }
    return v ? { x: v.char.root.position.x, z: v.char.root.position.z, facing: v.char.root.rotation.y } : null;
  }

  private setFov(fov: number, dt: number, snap = false): void {
    const next = snap ? fov : this.camera.fov + (fov - this.camera.fov) * Math.min(1, dt * 5);
    if (Math.abs(next - this.camera.fov) < 0.01) return;
    this.camera.fov = next;
    this.camera.updateProjectionMatrix();
  }

  /** Câmera de pose pronta (espectador ou replay): suaviza a posição, corta quando pedido. */
  private applyPose(p: CamPose, dt: number): void {
    const want = this.tmpWant.set(p.pos[0], p.pos[1], p.pos[2]);
    const look = this.tmpLook.set(p.look[0], p.look[1], p.look[2]);
    if (this.camCut || !this.camReady) {
      this.camPos.copy(want);
      this.camLook.copy(look);
      this.camReady = true;
    } else {
      this.camPos.lerp(want, 1 - Math.exp(-dt * 4));
      this.camLook.lerp(look, 1 - Math.exp(-dt * 7));
    }
    this.setFov(p.fov, dt, this.camCut);
    this.camCut = false;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  /** Avisa o HUD quando muda o que ele mostra das câmeras. */
  private reportCam(): void {
    if (!this.onCam) return;
    const ui: FutCamUi = { spectating: this.isSpectating(), cam: this.camKind, replay: !!this.replay, shot: this.replay ? REPLAY_LABELS[this.replay.shot || "equipe"] : "" };
    const key = `${ui.spectating}|${ui.cam}|${ui.replay}|${ui.shot}`;
    if (key === this.camUiKey) return;
    this.camUiKey = key;
    this.onCam(ui);
  }

  private updateCamera(dt: number): void {
    const s = this.snap;
    if (this.replay && this.rsNow && this.field) {
      const rp = this.replay;
      const shot = shotAt(this.replayP);
      if (shot !== rp.shot) {
        rp.shot = shot;
        this.camCut = true;
      }
      this.applyPose(replayPose(shot, { field: this.field, ball: this.rsNow.ball, goalSide: rp.goalSide }), dt);
      return;
    }
    if (s && this.field && this.isSpectating()) {
      const bp = this.ball.position;
      this.applyPose(camPose(this.camKind, { field: this.field, ball: { x: bp.x, y: bp.y, z: bp.z, vx: s.ball.vx, vz: s.ball.vz }, target: this.camKind === "jogador" ? this.followTarget() : null }), dt);
      return;
    }
    this.setFov(FOV_PLAY, dt);
    let base = this.myPos;
    let yaw = this.yaw;
    // disputa de pênaltis: quem não cobra assiste da cobrança, olhando para o gol
    if (s?.phase === "penalties" && s.pens && s.pens.takerId !== this.myId) {
      const t = this.views.get(s.pens.takerId);
      if (t) {
        base = t.char.root.position;
        yaw = attackYaw(t.last.side);
      }
    }
    const focus = s?.phase === "goal" && this.fx.active ? this.views.get(this.focusId) : undefined;
    if (focus) {
      // comemoração: câmera curta de frente para o autor do gol
      const f = focus.last.facing;
      const p = focus.char.root.position;
      const want = this.tmpWant.set(p.x + Math.sin(f) * 3.4, 1.7, p.z + Math.cos(f) * 3.4);
      const look = this.tmpLook.set(p.x, 1.3, p.z);
      this.camPos.lerp(want, 1 - Math.exp(-dt * 5));
      this.camLook.lerp(look, 1 - Math.exp(-dt * 8));
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      return;
    }
    const cp = Math.cos(this.pitch);
    const fwd = this.tmpFwd.set(Math.sin(yaw) * cp, Math.sin(this.pitch), Math.cos(yaw) * cp);
    const right = this.tmpRight.set(-Math.cos(yaw), 0, Math.sin(yaw));
    const want = this.tmpWant.set(base.x, HEAD_Y + 0.6, base.z).addScaledVector(fwd, -CAM_DIST).addScaledVector(right, CAM_SIDE);
    want.y = Math.max(0.6, want.y);
    const targetLook = this.tmpLook.copy(want).add(fwd);
    if (!this.camReady) {
      this.camPos.copy(want);
      this.camLook.copy(targetLook);
      this.camReady = true;
    } else {
      this.camPos.lerp(want, 1 - Math.exp(-dt * 14));
      this.camLook.lerp(targetLook, 1 - Math.exp(-dt * 20));
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  private disposed = false;

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const c of this.cleanup) c();
    resetTouchInput();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.chat.dispose();
    this.fx.dispose();
    this.arena?.dispose();
    this.crew?.dispose();
    this.ref?.dispose();
    this.crowd?.dispose();
    for (const v of this.views.values()) this.dropView(v);
    this.views.clear();
    this.lineMat.dispose();
    this.sky.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as (THREE.Material & { map?: THREE.Texture | null }) | (THREE.Material & { map?: THREE.Texture | null })[] | undefined;
      for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        disposeMaterial(x);
      }
    });
    this.renderer.dispose();
  }
}
