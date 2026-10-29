import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { CHAIR_BASES, CHAIR_SEATS, type AvatarDNA, type ChairDNA } from "@ec/shared";
import { celebrationExtras, createCharacter, modelReady, type Character } from "../game/character";
import { createGltfLoader } from "../game/gltfLoader";

const MODEL_URL = "/assets/chairs/cadeira_escritorio.glb";

function shade(hex: string, k: number): THREE.Color {
  const c = new THREE.Color(hex);
  return k >= 0 ? c.lerp(new THREE.Color("#ffffff"), k) : c.multiplyScalar(1 + k);
}

/** Pontos da cadeira onde entram o boneco e os enfeites (coordenadas da cadeira, frente em +z). */
interface Anchors {
  seatTop: number;
  seatZ: number;
  armX: number;
  armY: number;
  /** z do meio do braço da cadeira. */
  armZ: number;
  backTop: number;
  /** z da face de trás do encosto. */
  backZ: number;
}

export interface ChairModel {
  group: THREE.Group;
  anchors: Anchors;
  /** Saída do turbo (bocal do extintor no GLB). */
  exhaust: THREE.Vector3;
  update(dt: number, speed: number, steer?: number, driftDir?: number): void;
  dispose(): void;
}

// ---------- GLB do romulo-h ----------
let loaded: THREE.Group | null = null;
let loading: Promise<boolean> | null = null;

export function chairModelReady(): boolean {
  return loaded !== null;
}

/** Carrega o GLB da cadeira uma vez. Resolve false se falhar (a corrida segue com a cadeira procedural). */
export function preloadChair(onProgress?: (e: ProgressEvent) => void): Promise<boolean> {
  loading ??= createGltfLoader()
    .loadAsync(MODEL_URL, onProgress)
    .then((gltf) => {
      loaded = gltf.scene;
      return true;
    })
    .catch((err) => {
      console.warn("cadeira_escritorio.glb não carregou, usando cadeira procedural", err);
      return false;
    });
  return loading;
}

const ENCOSTO_K = [0.7, 1, 1.2];
/** Braço da cadeira mais perto e mais alto que no GLB, ao alcance das mãos do boneco sentado. */
const ARM_X = 0.38;
const ARM_LIFT = 0.06;

/** Traz haste e apoio de cada braço para ARM_X, encurta o suporte e estreita o assento para caber entre eles. */
function fitArms(inner: THREE.Object3D): void {
  const get = (name: string) => inner.getObjectByName(name) as THREE.Mesh | undefined;
  const sizeOf = (m: THREE.Mesh) => {
    m.geometry.computeBoundingBox();
    return m.geometry.boundingBox!.getSize(new THREE.Vector3());
  };
  for (const [support, riser, pad] of [
    ["Peca_42", "Peca_43", "Peca_44"],
    ["Peca_45", "Peca_46", "Peca_47"],
  ]) {
    const s = get(support);
    const r = get(riser);
    const p = get(pad);
    if (!s || !r || !p) return;
    const side = Math.sign(p.position.x);
    const w = sizeOf(s).x;
    const from = Math.abs(s.position.x) - w / 2;
    s.scale.x = (ARM_X - from) / w;
    s.position.x = (side * (from + ARM_X)) / 2;
    const h = sizeOf(r).y;
    r.scale.y = (h + ARM_LIFT) / h;
    r.position.set(side * ARM_X, r.position.y + ARM_LIFT / 2, r.position.z);
    p.position.set(side * ARM_X, p.position.y + ARM_LIFT, p.position.z);
  }
  const room = ARM_X - sizeOf(get("Peca_44")!).x / 2 - 0.01;
  for (const name of ["Assento", "Peca_41"]) {
    const m = get(name);
    if (m) m.scale.x = room / (sizeOf(m).x / 2);
  }
}

function glbChair(chair: ChairDNA, model: THREE.Group): ChairModel {
  const group = new THREE.Group();
  const inner = model.clone(true);
  group.add(inner);
  const seatColor = CHAIR_SEATS[chair.seat] ?? CHAIR_SEATS[0];
  const baseColor = CHAIR_BASES[chair.base] ?? CHAIR_BASES[0];
  const extras: THREE.Mesh[] = [];
  const mats = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const wheelMats = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const meshOf = (name: string) => inner.getObjectByName(name) as THREE.Mesh | undefined;
  const fabric = meshOf("Assento")?.material as THREE.Material | undefined;
  const frame = meshOf("Peca")?.material as THREE.Material | undefined;

  const wheels = new Set<THREE.Object3D>();
  const wheelNodes: THREE.Object3D[] = [];
  inner.traverse((o) => {
    if (/^Rodas_\d$/.test(o.name)) {
      wheelNodes.push(o);
      o.traverse((c) => wheels.add(c));
    }
  });

  // materiais do GLB são compartilhados entre clones: cada cadeira recolore a própria cópia
  inner.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    const src = mesh.material as THREE.MeshStandardMaterial;
    const map = wheels.has(mesh) ? wheelMats : mats;
    let m = map.get(src);
    if (!m) {
      m = src.clone();
      if (src === fabric) {
        m.color.set(seatColor);
        m.roughness = 0.9;
      } else if (src === frame) {
        m.color.set(baseColor);
        m.metalness = 0.6;
        m.roughness = 0.35;
      } else if (wheels.has(mesh)) {
        if (chair.wheels === 1) {
          m.color.set("#3cf2ff");
          m.emissive.set("#19d6ff");
          m.emissiveIntensity = 1.6;
        } else if (chair.wheels === 2) {
          m.color.set("#ff4fa3");
          m.roughness = 0.4;
        }
      }
      map.set(src, m);
    }
    mesh.material = m;
  });
  if (chair.wheels === 2) for (const w of wheelNodes) w.scale.setScalar(1.45);
  fitArms(inner);

  // encosto: baixo encolhe a almofada mantendo a base; gamer estica e ganha abas e apoio de cabeça
  const pad = meshOf("Encosto_Almofada");
  const k = ENCOSTO_K[chair.back] ?? 1;
  if (pad && k !== 1) {
    pad.geometry.computeBoundingBox();
    const minY = pad.geometry.boundingBox!.min.y * pad.scale.y;
    pad.scale.y *= k;
    pad.position.y += minY * (1 - k);
  }
  group.updateMatrixWorld(true);
  const box = (o: THREE.Object3D | undefined) => (o ? new THREE.Box3().setFromObject(o) : null);
  const seatBox = box(meshOf("Assento"));
  const armBox = box(inner.getObjectByName("Peca_47"));
  const padBox = box(pad);
  const anchors: Anchors = {
    seatTop: seatBox?.max.y ?? 0.5,
    seatZ: seatBox ? (seatBox.min.z + seatBox.max.z) / 2 : 0,
    armX: armBox ? (armBox.min.x + armBox.max.x) / 2 : 0.47,
    armY: armBox?.max.y ?? 0.7,
    armZ: armBox ? (armBox.min.z + armBox.max.z) / 2 : 0,
    backTop: padBox?.max.y ?? 1.2,
    backZ: padBox?.min.z ?? -0.4,
  };
  if (chair.back === 2 && padBox) {
    const dark = new THREE.MeshStandardMaterial({ color: shade(seatColor, -0.35), roughness: 0.9 });
    const h = padBox.max.y - padBox.min.y;
    const w = padBox.max.x - padBox.min.x;
    const zc = (padBox.min.z + padBox.max.z) / 2 + 0.05;
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new RoundedBoxGeometry(0.1, h * 0.7, 0.16, 2, 0.03), dark);
      wing.position.set((s * w) / 2, padBox.min.y + h * 0.45, zc);
      wing.rotation.y = s * 0.3;
      extras.push(wing);
    }
    const head = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.16, 0.1, 2, 0.03), dark);
    head.position.set(0, padBox.max.y - 0.1, zc + 0.02);
    extras.push(head);
  }
  for (const e of extras) {
    e.castShadow = true;
    group.add(e);
  }

  const exhaust = new THREE.Vector3(0, 0.6, -0.7);
  inner.getObjectByName("Bocal_Saida")?.getWorldPosition(exhaust);
  addTrinket(group, chair.trinket, anchors, extras);

  return {
    group,
    anchors,
    exhaust,
    update(dt, speed, steer = 0, driftDir = 0) {
      const now = performance.now();
      const casterYawTarget = driftDir !== 0
        ? -driftDir * 0.48
        : steer !== 0
          ? -steer * 0.3
          : 0;
      for (let i = 0; i < wheelNodes.length; i++) {
        const w = wheelNodes[i];
        w.rotation.x += (speed * dt) / 0.04;
        // Rodinhas caster 360° chicoteando e alinhando com a inércia do deslocamento
        const casterJitter = driftDir !== 0 ? Math.sin(now * 0.03 + i * 1.3) * 0.12 : 0;
        const target = casterYawTarget + casterJitter;
        w.rotation.y += (target - w.rotation.y) * Math.min(1, dt * 14);
      }
    },
    dispose() {
      // geometrias do GLB são compartilhadas entre clones; só as peças extras são desta cadeira
      for (const m of [...mats.values(), ...wheelMats.values()]) m.dispose();
      for (const e of extras) {
        e.geometry.dispose();
        (e.material as THREE.Material).dispose();
      }
    },
  };
}

// ---------- cadeira procedural (enquanto o GLB carrega ou se ele falhar) ----------
const SEAT_TOP = 0.6;

function proceduralChair(chair: ChairDNA): ChairModel {
  const g = new THREE.Group();
  const seatColor = CHAIR_SEATS[chair.seat] ?? CHAIR_SEATS[0];
  const baseColor = CHAIR_BASES[chair.base] ?? CHAIR_BASES[0];
  const fabric = new THREE.MeshStandardMaterial({ color: seatColor, roughness: 0.9 });
  const fabricDark = new THREE.MeshStandardMaterial({ color: shade(seatColor, -0.35), roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.35, metalness: 0.6 });
  const plastic = new THREE.MeshStandardMaterial({ color: "#1d1d1f", roughness: 0.6 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };

  // base em estrela, pistão e rodas
  const wheelR = chair.wheels === 2 ? 0.09 : 0.055;
  const wheelMat =
    chair.wheels === 1
      ? new THREE.MeshStandardMaterial({ color: "#3cf2ff", emissive: "#19d6ff", emissiveIntensity: 1.6 })
      : chair.wheels === 2
        ? new THREE.MeshStandardMaterial({ color: "#ff4fa3", roughness: 0.4 })
        : plastic;
  const wheelMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    add(new THREE.BoxGeometry(0.06, 0.05, 0.36), metal, Math.sin(a) * 0.18, wheelR * 2 + 0.03, Math.cos(a) * 0.18, 0, a);
    const w = add(new THREE.CylinderGeometry(wheelR, wheelR, chair.wheels === 2 ? 0.07 : 0.05, 14), wheelMat, Math.sin(a) * 0.35, wheelR, Math.cos(a) * 0.35, 0, a, Math.PI / 2);
    w.castShadow = false;
    wheelMeshes.push(w);
  }
  add(new THREE.CylinderGeometry(0.045, 0.06, 0.32, 10), metal, 0, wheelR * 2 + 0.2, 0);
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 10), plastic, 0, SEAT_TOP - 0.16, 0);

  // assento e encosto
  add(new RoundedBoxGeometry(0.64, 0.12, 0.6, 3, 0.05), fabric, 0, SEAT_TOP - 0.06, 0.02);
  const backH = [0.42, 0.68, 0.86][chair.back] ?? 0.68;
  const backW = chair.back === 2 ? 0.58 : 0.54;
  const backY = SEAT_TOP + 0.08 + backH / 2;
  add(new THREE.BoxGeometry(0.06, 0.24, 0.05), plastic, 0, SEAT_TOP + 0.05, -0.29);
  add(new RoundedBoxGeometry(backW, backH, 0.1, 3, 0.04), fabric, 0, backY, -0.32, -0.12);
  if (chair.back === 2) {
    for (const s of [-1, 1]) add(new RoundedBoxGeometry(0.1, backH * 0.75, 0.14, 2, 0.03), fabricDark, s * (backW / 2 - 0.02), backY - 0.05, -0.28, -0.12, s * 0.3);
    add(new THREE.BoxGeometry(0.1, backH * 0.9, 0.012), new THREE.MeshStandardMaterial({ color: "#f5f0e1" }), 0, backY, -0.262, -0.12);
    add(new RoundedBoxGeometry(0.26, 0.14, 0.08, 2, 0.03), fabricDark, 0, backY + backH / 2 - 0.12, -0.25, -0.12);
  }
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.04, 0.2, 0.04), plastic, s * 0.33, SEAT_TOP + 0.07, -0.02);
    add(new RoundedBoxGeometry(0.08, 0.04, 0.32, 2, 0.015), plastic, s * 0.33, SEAT_TOP + 0.18, 0.02);
  }

  const anchors: Anchors = { seatTop: SEAT_TOP, seatZ: 0, armX: 0.33, armY: SEAT_TOP + 0.2, armZ: 0.02, backTop: backY + backH / 2, backZ: -0.383 };
  const extras: THREE.Mesh[] = [];
  addTrinket(g, chair.trinket, anchors, extras);
  return {
    group: g,
    anchors,
    exhaust: new THREE.Vector3(0, 0.35, -0.75),
    update(dt, speed, steer = 0, driftDir = 0) {
      const now = performance.now();
      const casterYawTarget = driftDir !== 0
        ? -driftDir * 0.48
        : steer !== 0
          ? -steer * 0.3
          : 0;
      for (let i = 0; i < wheelMeshes.length; i++) {
        const w = wheelMeshes[i];
        w.rotation.x += (speed * dt) / wheelR;
        const casterJitter = driftDir !== 0 ? Math.sin(now * 0.03 + i * 1.3) * 0.12 : 0;
        const target = casterYawTarget + casterJitter;
        w.rotation.y += (target - w.rotation.y) * Math.min(1, dt * 14);
      }
    },
    dispose() {
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
    },
  };
}

/** Enfeite da cadeira, posicionado pelos pontos de encaixe de cada modelo. */
function addTrinket(g: THREE.Group, trinket: number, a: Anchors, extras: THREE.Mesh[]): void {
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    g.add(mesh);
    extras.push(mesh);
    return mesh;
  };
  const metal = () => new THREE.MeshStandardMaterial({ color: "#9aa3ad", roughness: 0.35, metalness: 0.6 });
  switch (trinket) {
    case 1: {
      const x = -a.armX * 0.6;
      add(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 6), metal(), x, a.backTop + 0.25, a.backZ);
      const flag = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.28, -0.08), new THREE.Vector2(0, -0.16)]);
      add(new THREE.ShapeGeometry(flag), new THREE.MeshStandardMaterial({ color: "#ffd23f", side: THREE.DoubleSide }), x, a.backTop + 0.58, a.backZ, 0, -Math.PI / 2);
      break;
    }
    case 2:
      add(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: "#d62828", roughness: 0.5 }), a.armX, a.armY + 0.05, 0.09);
      add(new THREE.ConeGeometry(0.05, 0.16, 12, 1, true), new THREE.MeshStandardMaterial({ color: "#d4af37", metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }), a.armX, a.armY + 0.05, 0.21, -Math.PI / 2);
      break;
    case 3:
      add(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 14), new THREE.MeshStandardMaterial({ color: "#f5f0e1" }), -a.armX, a.armY + 0.05, 0.12);
      add(new THREE.TorusGeometry(0.025, 0.008, 6, 12), new THREE.MeshStandardMaterial({ color: "#f5f0e1" }), -a.armX - 0.05, a.armY + 0.05, 0.12, 0, Math.PI / 2);
      add(new THREE.CircleGeometry(0.04, 14), new THREE.MeshStandardMaterial({ color: "#4a2c1a" }), -a.armX, a.armY + 0.095, 0.12, -Math.PI / 2);
      break;
    case 4: {
      add(new THREE.CylinderGeometry(0.05, 0.04, 0.08, 10), new THREE.MeshStandardMaterial({ color: "#b5651d" }), a.armX, a.armY + 0.04, 0.12);
      const leaf = new THREE.MeshStandardMaterial({ color: "#3e9b52", flatShading: true });
      for (const [x, y, z] of [
        [0, 0.12, 0],
        [0.04, 0.1, 0.02],
        [-0.03, 0.1, -0.02],
      ])
        add(new THREE.IcosahedronGeometry(0.045, 0), leaf, a.armX + x, a.armY + y, 0.12 + z);
      break;
    }
    case 5: {
      const h = a.backTop - a.seatTop;
      for (const [x, y, c] of [
        [-0.12, 0.3, "#ffd23f"],
        [0.13, 0.55, "#2e86de"],
        [-0.05, 0.75, "#e84393"],
      ] as const)
        add(new THREE.CircleGeometry(0.06, 16), new THREE.MeshStandardMaterial({ color: c }), x, a.seatTop + h * y, a.backZ - 0.004, 0, Math.PI, 0);
      break;
    }
  }
}

/** GLB do romulo-h quando carregado; procedural enquanto isso. */
export function buildChair(chair: ChairDNA): ChairModel {
  return loaded ? glbChair(chair, loaded) : proceduralChair(chair);
}

export interface Racer3D {
  root: THREE.Group;
  char: Character;
  exhaust: THREE.Vector3;
  update(dt: number, speed: number, steer?: number, driftDir?: number, boosting?: boolean): void;
  /** Comemoração da chegada: o boneco festeja, o assento gira e cai confete. */
  celebrate(): void;
  dispose(): void;
}

/** Cadeira com o boneco do crachá sentado. */
export function seatedRacer(avatar: AvatarDNA, chair: ChairDNA): Racer3D {
  const root = new THREE.Group();
  const seat = buildChair(chair);
  const char = createCharacter(avatar);
  const thighBottom = char.sit();
  const a = seat.anchors;
  char.root.position.set(0, a.seatTop - thighBottom, a.seatZ - 0.06);
  // pontos no topo de cada braço da cadeira, no espaço do boneco (a esquerda dele fica em +x)
  const arm = (x: number) => new THREE.Vector3(x, a.armY + 0.03, a.armZ).sub(char.root.position);
  char.restHands(arm(Math.abs(a.armX)), arm(-Math.abs(a.armX)));
  root.add(seat.group, char.root);
  // o boneco vai junto com o assento quando ele gira na comemoração
  const pivot = seat.group.getObjectByName("Assento_Giratorio");
  if (pivot) {
    root.updateMatrixWorld(true);
    pivot.attach(char.root);
  }

  const party = celebrationExtras();
  const mixer = new THREE.AnimationMixer(root);
  const once = (clip: THREE.AnimationClip) => mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  const actions = party?.seat && pivot ? [once(party.seat)] : [];
  const confetti = party?.confetti ? party.confetti.scene.clone() : null;
  if (confetti && party?.confetti) {
    confetti.visible = false;
    root.add(confetti);
    const fall = once(party.confetti.clip);
    actions.push(fall);
    mixer.addEventListener("finished", (e) => {
      if (e.action === fall) confetti.visible = false;
    });
  }

  return {
    root,
    char,
    exhaust: seat.exhaust,
    update(dt, speed, steer = 0, driftDir = 0, boosting = false) {
      seat.update(dt, speed, steer, driftDir);
      char.updateSeated?.(dt, speed, steer, driftDir, boosting);
      char.update(dt, 0);
      mixer.update(dt);
    },
    celebrate() {
      char.celebrate();
      for (const x of actions) x.reset().play();
      if (confetti) confetti.visible = true;
    },
    dispose() {
      // malhas e materiais do confete são compartilhados entre clones
      mixer.stopAllAction();
      char.dispose();
      seat.dispose();
    },
  };
}

let thumbRenderer: THREE.WebGLRenderer | null = null;
const thumbCache = new Map<string, string>();

/** Miniatura do boneco sentado na cadeira (dataURL). */
export function chairThumbnail(avatar: AvatarDNA, chair: ChairDNA, size = 160): string {
  const key = JSON.stringify({ ...avatar, name: "" }) + JSON.stringify(chair) + size + (modelReady() ? "glb" : "") + (chairModelReady() ? "cglb" : "");
  const hit = thumbCache.get(key);
  if (hit) return hit;
  thumbRenderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  thumbRenderer.setSize(size, size, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#9a8f80", 2.2));
  const sun = new THREE.DirectionalLight("#ffffff", 1.6);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  const r = seatedRacer(avatar, chair);
  r.root.rotation.y = 0.6;
  scene.add(r.root);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  cam.position.set(0, 1.6, 4.4);
  cam.lookAt(0, 0.82, 0);
  thumbRenderer.render(scene, cam);
  const url = thumbRenderer.domElement.toDataURL("image/png");
  r.dispose();
  thumbCache.set(key, url);
  return url;
}
