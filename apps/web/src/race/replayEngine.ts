import * as THREE from "three";
import { sampleGhost, type ReplayData } from "@ec/shared";
import { applyQuality } from "../quality";
import { getSettings } from "../settings";
import { seatedRacer, type Racer3D } from "./chairMesh";
import { nameTag } from "./ghosts";
import { buildTrack } from "./trackScene";

export type ReplayCam = "atras" | "cima" | "livre";
export const REPLAY_SPEEDS = [0.5, 1, 2] as const;

const FREE_MIN = 4;
const FREE_MAX = 40;

/**
 * Replay de uma volta gravada: a pista e uma única cadeira que repete as amostras do fantasma.
 * Não usa servidor nem simulação; o tempo é só um relógio que anda (ou para) e escolhe o ponto da gravação.
 */
export class ReplayEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(68, 1, 0.1, 220);
  private sun: THREE.DirectionalLight;
  private racer: Racer3D;
  private tag: THREE.Sprite;
  private disposeTrack: (() => void) | null;
  private raf = 0;
  private last = performance.now();
  private cleanup: (() => void)[] = [];

  private t = 0;
  private playing = true;
  private speedValue = 1;
  private cam: ReplayCam = "atras";
  private readonly endMs: number;
  private shownDeci = -1;

  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camReady = false;
  /** Câmera livre: giro e inclinação em volta da cadeira (arrastar) e distância (roda do mouse). */
  private yaw = Math.PI;
  private pitch = 0.45;
  private dist = 12;

  /** Chamado quando o cronômetro mostrado muda (a cada décimo) ou o estado de pausa/fim muda. */
  onTick: ((ms: number, ended: boolean) => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly data: ReplayData,
  ) {
    this.endMs = data.ghost.length ? data.ghost[data.ghost.length - 1][0] : data.ms;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color("#b9c4cf");
    this.scene.fog = new THREE.Fog("#b9c4cf", 55, 120);
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#8a8070", 1.7));
    const sun = new THREE.DirectionalLight("#fff3dd", 2.1);
    sun.position.set(25, 45, 18);
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 50, bottom: -50, near: 1, far: 120 });
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);
    this.sun = sun;
    this.disposeTrack = buildTrack(this.scene);

    this.racer = seatedRacer(data.avatar, data.chair);
    this.tag = nameTag(data.name, "#ffd23f");
    this.racer.root.add(this.tag);
    this.scene.add(this.racer.root);
    applyQuality(this.renderer, this.scene, this.sun, getSettings().quality);
    this.bindInput();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------- controles ----------
  get time(): number {
    return this.t;
  }
  get isPlaying(): boolean {
    return this.playing;
  }
  get speed(): number {
    return this.speedValue;
  }
  get camera3d(): ReplayCam {
    return this.cam;
  }

  /** Alterna pausa. No fim da gravação, "continuar" recomeça do zero. */
  togglePlay(): void {
    if (!this.playing && this.t >= this.endMs) this.t = 0;
    this.playing = !this.playing;
    this.notify(true);
  }

  restart(): void {
    this.t = 0;
    this.playing = true;
    this.notify(true);
  }

  setSpeed(v: number): void {
    this.speedValue = v;
  }

  setCam(c: ReplayCam): void {
    if (c === this.cam) return;
    this.cam = c;
    this.camReady = false;
    this.canvas.style.cursor = c === "livre" ? "grab" : "";
  }

  private notify(force = false): void {
    const deci = Math.floor(this.t / 100);
    if (!force && deci === this.shownDeci) return;
    this.shownDeci = deci;
    this.onTick?.(this.t, !this.playing && this.t >= this.endMs);
  }

  private bindInput(): void {
    let drag: { x: number; y: number; id: number } | null = null;
    const down = (e: PointerEvent) => {
      if (this.cam !== "livre") return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      this.canvas.setPointerCapture(e.pointerId);
      this.canvas.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      this.yaw -= (e.clientX - drag.x) * 0.006;
      this.pitch = Math.max(0.08, Math.min(1.45, this.pitch + (e.clientY - drag.y) * 0.005));
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
      if (this.cam === "livre") this.canvas.style.cursor = "grab";
    };
    const wheel = (e: WheelEvent) => {
      if (this.cam !== "livre") return;
      e.preventDefault();
      this.dist = Math.max(FREE_MIN, Math.min(FREE_MAX, this.dist * Math.exp(e.deltaY * 0.001)));
    };
    this.canvas.addEventListener("pointerdown", down);
    this.canvas.addEventListener("pointermove", move);
    this.canvas.addEventListener("pointerup", up);
    this.canvas.addEventListener("pointercancel", up);
    this.canvas.addEventListener("wheel", wheel, { passive: false });
    this.cleanup.push(() => {
      this.canvas.removeEventListener("pointerdown", down);
      this.canvas.removeEventListener("pointermove", move);
      this.canvas.removeEventListener("pointerup", up);
      this.canvas.removeEventListener("pointercancel", up);
      this.canvas.removeEventListener("wheel", wheel);
    });
  }

  // ---------- quadro ----------
  private loop = (ms: number): void => {
    const dt = Math.min(0.05, (ms - this.last) / 1000);
    this.last = ms;
    this.resize();
    if (this.playing) {
      this.t = Math.min(this.endMs, this.t + dt * 1000 * this.speedValue);
      if (this.t >= this.endMs) {
        this.playing = false;
        this.notify(true);
      }
    }
    const pose = sampleGhost(this.data.ghost, this.t);
    if (pose) {
      this.racer.root.position.set(pose.x, 0, pose.z);
      this.racer.root.rotation.y = pose.heading;
      // velocidade pelo trecho em volta do instante atual (as rodas só giram com a gravação andando)
      let speed = 0;
      if (this.playing) {
        const a = sampleGhost(this.data.ghost, this.t - 50)!;
        const b = sampleGhost(this.data.ghost, this.t + 50)!;
        speed = Math.hypot(b.x - a.x, b.z - a.z) / 0.1;
      }
      this.racer.update(dt * this.speedValue, speed);
      this.updateCamera(dt, pose.x, pose.z, pose.heading);
    }
    this.notify();
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };

  private updateCamera(dt: number, x: number, z: number, h: number): void {
    const want = new THREE.Vector3();
    const look = new THREE.Vector3();
    let smooth: number;
    if (this.cam === "atras") {
      const fx = Math.sin(h);
      const fz = Math.cos(h);
      want.set(x - fx * 5.6, 3.3, z - fz * 5.6);
      look.set(x + fx * 10, 0.6, z + fz * 10);
      smooth = 7;
    } else if (this.cam === "cima") {
      // de cima, com a pista "subindo" na tela (o leve recuo em z dá a orientação)
      want.set(x, 46, z - 3);
      look.set(x, 0, z);
      smooth = 10;
    } else {
      const cp = Math.cos(this.pitch);
      want.set(x + Math.sin(this.yaw) * cp * this.dist, 0.8 + Math.sin(this.pitch) * this.dist, z + Math.cos(this.yaw) * cp * this.dist);
      look.set(x, 1, z);
      smooth = 12;
    }
    if (!this.camReady) {
      this.camPos.copy(want);
      this.camLook.copy(look);
      this.camReady = true;
    }
    const k = 1 - Math.exp(-dt * smooth);
    this.camPos.lerp(want, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const pr = this.renderer.getPixelRatio();
    if (this.canvas.width !== Math.floor(w * pr) || this.canvas.height !== Math.floor(h * pr)) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const c of this.cleanup) c();
    // o boneco compartilha geometria do GLB: sai da cena antes da limpeza geral
    this.scene.remove(this.racer.root);
    this.racer.root.remove(this.tag);
    this.tag.material.map?.dispose();
    this.tag.material.dispose();
    this.racer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.disposeTrack?.();
    this.disposeTrack = null;
    this.renderer.dispose();
  }
}
