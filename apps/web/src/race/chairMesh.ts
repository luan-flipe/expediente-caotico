import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { CHAIR_BASES, CHAIR_SEATS, type AvatarDNA, type ChairDNA } from "@ec/shared";
import { celebrationExtras, createCharacter, modelReady, type Character, type CharacterSeatedOptions } from "../game/character";
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
  /** Deslocamento vertical atual do pistão a gás (squash/rebound elástico em metros). */
  pistonOffset?: number;
  /** Inclinação dinâmica lateral (roll/bank) do conjunto assento/encosto em radianos. */
  rollAngle?: number;
  /** Flexão dinâmica do encosto pela inércia em radianos. */
  backAngle?: number;
  update(
    dt: number,
    speed: number,
    steer?: number,
    driftDir?: number,
    boosting?: boolean,
    air?: boolean,
    rivalDir?: THREE.Vector3,
  ): void;
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

  // Materiais das rodinhas tipo rollerblade:
  // Cubo central / eixo cromado com reflexo metálico elegante (metalness: 0.85, roughness: 0.15)
  // Acabamento de silicone translúcido colorido (roughness ~0.15, leve transparência com cor vibrante)
  inner.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as THREE.MeshStandardMaterial;
    const isWheel = wheels.has(mesh);
    const map = isWheel ? wheelMats : mats;
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
      } else if (isWheel) {
        if (src.metalness >= 0.5) {
          // Cubo central / eixo cromado com reflexo metálico elegante
          m.color.set("#f1f5f9");
          m.metalness = 0.85;
          m.roughness = 0.15;
        } else {
          // Acabamento de silicone translúcido colorido tipo rollerblade
          m.roughness = 0.15;
          m.metalness = 0.05;
          m.transparent = true;
          if (chair.wheels === 1) {
            // Neon: silicone translúcido vibrante com brilho emissivo
            m.color.set("#00f0ff");
            m.emissive.set("#00c8f8");
            m.emissiveIntensity = 1.6;
            m.opacity = 0.85;
          } else if (chair.wheels === 2) {
            // Patinete / Rollerblade: silicone rosa vibrante translúcido
            m.color.set("#ff2a85");
            m.emissive.set("#000000");
            m.emissiveIntensity = 0;
            m.opacity = 0.82;
          } else {
            // Comuns: silicone translúcido cristal/smoke estilo rollerblade de alta performance
            m.color.set("#7dd3fc");
            m.emissive.set("#000000");
            m.emissiveIntensity = 0;
            m.opacity = 0.78;
          }
        }
      }
      map.set(src, m);
    }
    mesh.material = m;
    // Pneus de silicone translúcido não projetam sombra interna escura; cubos cromados sim
    mesh.castShadow = !isWheel || src.metalness >= 0.5;
  });
  if (chair.wheels === 2) for (const w of wheelNodes) w.scale.setScalar(1.45);
  fitArms(inner);

  // Nós mecânicos da cadeira para dinâmica viva
  const pistaoNode = inner.getObjectByName("Pistao_Altura");
  const hasteCromada = inner.getObjectByName("Haste_Cromada");
  const assentoGiratorio = inner.getObjectByName("Assento_Giratorio");
  const encostoNode = inner.getObjectByName("Encosto");
  const assentoMesh = meshOf("Assento");
  const basePistonY = pistaoNode?.position.y ?? 0.15;
  const baseHasteScaleY = hasteCromada?.scale.y ?? 0.09;
  const baseBackRotX = encostoNode?.rotation.x ?? -0.1396;
  const basePadScale = assentoMesh ? assentoMesh.scale.clone() : new THREE.Vector3(1, 1, 1);

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
    if (encostoNode) {
      // Conecta os apoios gamer ao nó do encosto para acompanharem a flexão da inércia
      encostoNode.updateWorldMatrix(true, false);
      e.position.copy(encostoNode.worldToLocal(e.position));
      encostoNode.add(e);
    } else {
      group.add(e);
    }
  }

  const exhaust = new THREE.Vector3(0, 0.6, -0.7);
  inner.getObjectByName("Bocal_Saida")?.getWorldPosition(exhaust);
  addTrinket(group, chair.trinket, anchors, extras, encostoNode, assentoGiratorio);

  // Variáveis de estado físico da suspensão e dinamismo mecânico (zero alocação em update)
  let pistonY = 0;
  let pistonVy = 0;
  let wasAir = false;
  let wasBoosting = false;
  let prevSpeed = 0;
  let backRotX = 0;
  let backRotVel = 0;
  let seatRoll = 0;
  let camber = 0;

  const modelResult: ChairModel = {
    group,
    anchors,
    exhaust,
    pistonOffset: 0,
    rollAngle: 0,
    backAngle: 0,
    update(dt, speed, steer = 0, driftDir = 0, boosting = false, air = false) {
      const now = performance.now();

      // 1. Suspensão & Pistão a Gás Dinâmico (Squash & Stretch mecânico)
      const justLanded = wasAir && !air;
      const justBoosted = boosting && !wasBoosting;
      wasAir = !!air;
      wasBoosting = !!boosting;

      if (justLanded) {
        // Ao aterrissar de pulos ou rampas, o pistão cede firme e ressalta elástico
        pistonVy -= 1.6;
        pistonY -= 0.045;
        backRotVel += 0.35;
      }
      if (justBoosted) {
        // Coice inicial do turbo comprime o pistão e lança o encosto para trás
        pistonVy -= 1.3;
        pistonY -= 0.035;
        backRotVel -= 0.6;
      }

      // Amortecimento harmônico subamortecido do pistão elástico (~2.2 Hz com 2-3 quiques)
      const targetPistonY = boosting ? -0.024 : Math.min(0, -Math.abs(speed) * 0.001);
      const pistonForce = (targetPistonY - pistonY) * 200 - pistonVy * 16;
      pistonVy += pistonForce * dt;
      pistonY += pistonVy * dt;
      pistonY = Math.max(-0.085, Math.min(0.025, pistonY));

      const boostJitter = boosting ? Math.sin(now * 0.065) * 0.003 : 0;
      const curPistonY = pistonY + boostJitter;

      if (pistaoNode) pistaoNode.position.y = basePistonY + curPistonY;
      if (hasteCromada) hasteCromada.scale.y = Math.max(0.015, baseHasteScaleY * (1 + curPistonY * 4.0));
      if (assentoMesh) {
        // Squash & stretch no assento preservando volume
        assentoMesh.scale.set(
          basePadScale.x * (1 - curPistonY * 0.25),
          basePadScale.y * (1 + curPistonY * 0.4),
          basePadScale.z * (1 - curPistonY * 0.25),
        );
      }

      // 2. Encosto flexiona dinamicamente com a inércia da aceleração e frenagem
      const accel = dt > 0.0001 ? (speed - prevSpeed) / dt : 0;
      prevSpeed = speed;

      let targetBackRot = 0;
      if (boosting) {
        targetBackRot = -0.18; // turbo comprime piloto nas costas
      } else if (accel > 1.5) {
        targetBackRot = -Math.min(0.14, accel * 0.016); // aceleração empurra o encosto para trás
      } else if (accel < -2.0 || speed < -0.2) {
        targetBackRot = Math.min(0.12, -accel * 0.012); // frenagem brusca joga o encosto para a frente
      }

      const backForce = (targetBackRot - backRotX) * 150 - backRotVel * 15;
      backRotVel += backForce * dt;
      backRotX += backRotVel * dt;
      backRotX = Math.max(-0.24, Math.min(0.15, backRotX));

      if (encostoNode) encostoNode.rotation.x = baseBackRotX + backRotX;

      // 3. Inclinação do chassi: conjunto assento/encosto inclina (roll/bank) no sentido dinâmico da curva
      const targetRoll = driftDir !== 0
        ? -driftDir * 0.20
        : steer !== 0
          ? -steer * 0.10 * Math.min(1, Math.abs(speed) / 6)
          : 0;
      seatRoll += (targetRoll - seatRoll) * Math.min(1, dt * 14);
      if (assentoGiratorio) assentoGiratorio.rotation.z = seatRoll;

      // 4. Camber sutil nas rodinhas em derrapagens fortes + caster yaw 360°
      const targetCamber = driftDir !== 0 ? driftDir * 0.12 : 0;
      camber += (targetCamber - camber) * Math.min(1, dt * 12);

      const casterYawTarget = driftDir !== 0
        ? -driftDir * 0.48
        : steer !== 0
          ? -steer * 0.3
          : 0;
      for (let i = 0; i < wheelNodes.length; i++) {
        const w = wheelNodes[i];
        w.rotation.x += (speed * dt) / 0.04;
        const casterJitter = driftDir !== 0 ? Math.sin(now * 0.03 + i * 1.3) * 0.12 : 0;
        const target = casterYawTarget + casterJitter;
        w.rotation.y += (target - w.rotation.y) * Math.min(1, dt * 14);
        w.rotation.z = camber;
      }

      modelResult.pistonOffset = curPistonY;
      modelResult.rollAngle = seatRoll;
      modelResult.backAngle = backRotX;
    },
    dispose() {
      for (const m of [...mats.values(), ...wheelMats.values()]) m.dispose();
      for (const e of extras) {
        e.geometry.dispose();
        (e.material as THREE.Material).dispose();
      }
    },
  };

  return modelResult;
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

  // Materiais das rodinhas tipo rollerblade:
  // Cubo central / eixo cromado com reflexo metálico elegante (metalness: 0.85, roughness: 0.15)
  const chromeMat = new THREE.MeshStandardMaterial({
    color: "#f8fafc",
    metalness: 0.85,
    roughness: 0.15,
  });
  // Acabamento de silicone translúcido colorido (roughness ~0.15, leve transparência com cor vibrante)
  const siliconeMat =
    chair.wheels === 1
      ? new THREE.MeshStandardMaterial({
          color: "#00f0ff",
          emissive: "#00c8f8",
          emissiveIntensity: 1.6,
          roughness: 0.15,
          metalness: 0.05,
          transparent: true,
          opacity: 0.85,
        })
      : chair.wheels === 2
        ? new THREE.MeshStandardMaterial({
            color: "#ff2a85",
            roughness: 0.15,
            metalness: 0.05,
            transparent: true,
            opacity: 0.82,
          })
        : new THREE.MeshStandardMaterial({
            color: "#7dd3fc",
            roughness: 0.15,
            metalness: 0.05,
            transparent: true,
            opacity: 0.78,
          });

  const baseGroup = new THREE.Group();
  g.add(baseGroup);

  // 1. Base em estrela e rodinhas tipo rollerblade
  const wheelR = chair.wheels === 2 ? 0.09 : 0.055;
  const wheelW = chair.wheels === 2 ? 0.07 : 0.05;
  const wheelNodes: THREE.Group[] = [];
  const wheelSpinNodes: THREE.Mesh[] = [];

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.36), metal);
    leg.position.set(Math.sin(a) * 0.18, wheelR * 2 + 0.03, Math.cos(a) * 0.18);
    leg.rotation.y = a;
    leg.castShadow = true;
    baseGroup.add(leg);

    const caster = new THREE.Group();
    caster.position.set(Math.sin(a) * 0.35, wheelR, Math.cos(a) * 0.35);

    // Pneu externo de silicone translúcido
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 16), siliconeMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = false;

    // Cubo central cromado com reflexo metálico
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.52, wheelR * 0.52, wheelW + 0.003, 14), chromeMat);
    hub.castShadow = true;
    tire.add(hub);

    caster.add(tire);
    baseGroup.add(caster);
    wheelNodes.push(caster);
    wheelSpinNodes.push(tire);
  }

  // Tubo exterior da base
  const outerSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.24, 10), metal);
  outerSleeve.position.set(0, wheelR * 2 + 0.12, 0);
  outerSleeve.castShadow = true;
  baseGroup.add(outerSleeve);

  // 2. Grupo do Pistão com suspensão dinâmica (Squash & Stretch)
  const pistonGroup = new THREE.Group();
  g.add(pistonGroup);

  const pistonShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.20, 10), chromeMat);
  pistonShaft.position.set(0, wheelR * 2 + 0.24, 0);
  pistonShaft.castShadow = true;
  pistonGroup.add(pistonShaft);

  const seatMount = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 10), plastic);
  seatMount.position.set(0, SEAT_TOP - 0.16, 0);
  seatMount.castShadow = true;
  pistonGroup.add(seatMount);

  // 3. Conjunto assento/encosto que inclina dinamicamente (roll/bank)
  const seatAssemblyGroup = new THREE.Group();
  seatAssemblyGroup.position.set(0, SEAT_TOP, 0);
  pistonGroup.add(seatAssemblyGroup);

  const seatCushion = new THREE.Mesh(new RoundedBoxGeometry(0.64, 0.12, 0.6, 3, 0.05), fabric);
  seatCushion.position.set(0, -0.06, 0.02);
  seatCushion.castShadow = true;
  seatAssemblyGroup.add(seatCushion);

  for (const s of [-1, 1]) {
    const armPost = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.04), plastic);
    armPost.position.set(s * 0.33, 0.07, -0.02);
    armPost.castShadow = true;
    const armRest = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.04, 0.32, 2, 0.015), plastic);
    armRest.position.set(s * 0.33, 0.18, 0.02);
    armRest.castShadow = true;
    seatAssemblyGroup.add(armPost, armRest);
  }

  // 4. Encosto dinâmico com articulação flexível de inércia
  const backGroup = new THREE.Group();
  backGroup.position.set(0, 0.05, -0.29);
  seatAssemblyGroup.add(backGroup);

  const backH = [0.42, 0.68, 0.86][chair.back] ?? 0.68;
  const backW = chair.back === 2 ? 0.58 : 0.54;
  const backCenterY = 0.03 + backH / 2;

  const backPost = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.05), plastic);
  backPost.position.set(0, 0, 0);
  backPost.castShadow = true;
  backGroup.add(backPost);

  const backCushion = new THREE.Mesh(new RoundedBoxGeometry(backW, backH, 0.1, 3, 0.04), fabric);
  backCushion.position.set(0, backCenterY, -0.03);
  backCushion.rotation.x = -0.12;
  backCushion.castShadow = true;
  backGroup.add(backCushion);

  if (chair.back === 2) {
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new RoundedBoxGeometry(0.1, backH * 0.75, 0.14, 2, 0.03), fabricDark);
      wing.position.set(s * (backW / 2 - 0.02), backCenterY - 0.05, 0.01);
      wing.rotation.set(-0.12, s * 0.3, 0);
      wing.castShadow = true;
      backGroup.add(wing);
    }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, backH * 0.9, 0.012), new THREE.MeshStandardMaterial({ color: "#f5f0e1" }));
    stripe.position.set(0, backCenterY, 0.028);
    stripe.rotation.x = -0.12;
    stripe.castShadow = true;
    backGroup.add(stripe);

    const headrest = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.14, 0.08, 2, 0.03), fabricDark);
    headrest.position.set(0, backCenterY + backH / 2 - 0.12, 0.04);
    headrest.rotation.x = -0.12;
    headrest.castShadow = true;
    backGroup.add(headrest);
  }

  const anchors: Anchors = {
    seatTop: SEAT_TOP,
    seatZ: 0,
    armX: 0.33,
    armY: SEAT_TOP + 0.2,
    armZ: 0.02,
    backTop: SEAT_TOP + 0.08 + backH,
    backZ: -0.383,
  };
  const extras: THREE.Mesh[] = [];
  addTrinket(g, chair.trinket, anchors, extras, backGroup, seatAssemblyGroup);

  // Variáveis físicas da cadeira procedural
  let pistonY = 0;
  let pistonVy = 0;
  let wasAir = false;
  let wasBoosting = false;
  let prevSpeed = 0;
  let backRotX = 0;
  let backRotVel = 0;
  let seatRoll = 0;
  let camber = 0;

  const modelResult: ChairModel = {
    group: g,
    anchors,
    exhaust: new THREE.Vector3(0, 0.35, -0.75),
    pistonOffset: 0,
    rollAngle: 0,
    backAngle: 0,
    update(dt, speed, steer = 0, driftDir = 0, boosting = false, air = false) {
      const now = performance.now();

      // Suspensão e pistão
      const justLanded = wasAir && !air;
      const justBoosted = boosting && !wasBoosting;
      wasAir = !!air;
      wasBoosting = !!boosting;

      if (justLanded) {
        pistonVy -= 1.6;
        pistonY -= 0.045;
        backRotVel += 0.35;
      }
      if (justBoosted) {
        pistonVy -= 1.3;
        pistonY -= 0.035;
        backRotVel -= 0.6;
      }

      const targetPistonY = boosting ? -0.024 : Math.min(0, -Math.abs(speed) * 0.001);
      const pistonForce = (targetPistonY - pistonY) * 200 - pistonVy * 16;
      pistonVy += pistonForce * dt;
      pistonY += pistonVy * dt;
      pistonY = Math.max(-0.085, Math.min(0.025, pistonY));

      const boostJitter = boosting ? Math.sin(now * 0.065) * 0.003 : 0;
      const curPistonY = pistonY + boostJitter;

      pistonGroup.position.y = curPistonY;
      pistonShaft.scale.y = Math.max(0.1, 1 + curPistonY * 3.5);
      seatCushion.scale.set(1 - curPistonY * 0.25, 1 + curPistonY * 0.4, 1 - curPistonY * 0.25);

      // Encosto dinâmico pela inércia
      const accel = dt > 0.0001 ? (speed - prevSpeed) / dt : 0;
      prevSpeed = speed;

      let targetBackRot = 0;
      if (boosting) {
        targetBackRot = -0.18;
      } else if (accel > 1.5) {
        targetBackRot = -Math.min(0.14, accel * 0.016);
      } else if (accel < -2.0 || speed < -0.2) {
        targetBackRot = Math.min(0.12, -accel * 0.012);
      }

      const backForce = (targetBackRot - backRotX) * 150 - backRotVel * 15;
      backRotVel += backForce * dt;
      backRotX += backRotVel * dt;
      backRotX = Math.max(-0.24, Math.min(0.15, backRotX));
      backGroup.rotation.x = backRotX;

      // Roll/bank do conjunto assento/encosto
      const targetRoll = driftDir !== 0
        ? -driftDir * 0.20
        : steer !== 0
          ? -steer * 0.10 * Math.min(1, Math.abs(speed) / 6)
          : 0;
      seatRoll += (targetRoll - seatRoll) * Math.min(1, dt * 14);
      seatAssemblyGroup.rotation.z = seatRoll;

      // Camber e caster das rodinhas
      const targetCamber = driftDir !== 0 ? driftDir * 0.12 : 0;
      camber += (targetCamber - camber) * Math.min(1, dt * 12);

      const casterYawTarget = driftDir !== 0
        ? -driftDir * 0.48
        : steer !== 0
          ? -steer * 0.3
          : 0;
      for (let i = 0; i < wheelNodes.length; i++) {
        const caster = wheelNodes[i];
        const tire = wheelSpinNodes[i];
        tire.rotation.x += (speed * dt) / wheelR;
        const casterJitter = driftDir !== 0 ? Math.sin(now * 0.03 + i * 1.3) * 0.12 : 0;
        const target = casterYawTarget + casterJitter;
        caster.rotation.y += (target - caster.rotation.y) * Math.min(1, dt * 14);
        caster.rotation.z = camber;
      }

      modelResult.pistonOffset = curPistonY;
      modelResult.rollAngle = seatRoll;
      modelResult.backAngle = backRotX;
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

  return modelResult;
}

/** Enfeite da cadeira, posicionado pelos pontos de encaixe de cada modelo. */
function addTrinket(
  g: THREE.Group,
  trinket: number,
  a: Anchors,
  extras: THREE.Mesh[],
  backParent?: THREE.Object3D,
  seatParent?: THREE.Object3D,
): void {
  const add = (
    geo: THREE.BufferGeometry,
    m: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    parent: THREE.Object3D = g,
  ) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    parent.add(mesh);
    extras.push(mesh);
    return mesh;
  };
  const metal = () => new THREE.MeshStandardMaterial({ color: "#9aa3ad", roughness: 0.35, metalness: 0.6 });

  switch (trinket) {
    case 1: {
      const targetParent = backParent ?? g;
      const x = -a.armX * 0.6;
      add(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 6), metal(), x, a.backTop + 0.25, a.backZ, 0, 0, 0, targetParent);
      const flag = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.28, -0.08), new THREE.Vector2(0, -0.16)]);
      add(new THREE.ShapeGeometry(flag), new THREE.MeshStandardMaterial({ color: "#ffd23f", side: THREE.DoubleSide }), x, a.backTop + 0.58, a.backZ, 0, -Math.PI / 2, 0, targetParent);
      break;
    }
    case 2: {
      const targetParent = seatParent ?? g;
      add(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: "#d62828", roughness: 0.5 }), a.armX, a.armY + 0.05, 0.09, 0, 0, 0, targetParent);
      add(new THREE.ConeGeometry(0.05, 0.16, 12, 1, true), new THREE.MeshStandardMaterial({ color: "#d4af37", metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }), a.armX, a.armY + 0.05, 0.21, -Math.PI / 2, 0, 0, targetParent);
      break;
    }
    case 3: {
      const targetParent = seatParent ?? g;
      add(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 14), new THREE.MeshStandardMaterial({ color: "#f5f0e1" }), -a.armX, a.armY + 0.05, 0.12, 0, 0, 0, targetParent);
      add(new THREE.TorusGeometry(0.025, 0.008, 6, 12), new THREE.MeshStandardMaterial({ color: "#f5f0e1" }), -a.armX - 0.05, a.armY + 0.05, 0.12, 0, Math.PI / 2, 0, targetParent);
      add(new THREE.CircleGeometry(0.04, 14), new THREE.MeshStandardMaterial({ color: "#4a2c1a" }), -a.armX, a.armY + 0.095, 0.12, -Math.PI / 2, 0, 0, targetParent);
      break;
    }
    case 4: {
      const targetParent = seatParent ?? g;
      add(new THREE.CylinderGeometry(0.05, 0.04, 0.08, 10), new THREE.MeshStandardMaterial({ color: "#b5651d" }), a.armX, a.armY + 0.04, 0.12, 0, 0, 0, targetParent);
      const leaf = new THREE.MeshStandardMaterial({ color: "#3e9b52", flatShading: true });
      for (const [x, y, z] of [
        [0, 0.12, 0],
        [0.04, 0.1, 0.02],
        [-0.03, 0.1, -0.02],
      ])
        add(new THREE.IcosahedronGeometry(0.045, 0), leaf, a.armX + x, a.armY + y, 0.12 + z, 0, 0, 0, targetParent);
      break;
    }
    case 5: {
      const targetParent = backParent ?? g;
      const h = a.backTop - a.seatTop;
      for (const [x, y, c] of [
        [-0.12, 0.3, "#ffd23f"],
        [0.13, 0.55, "#2e86de"],
        [-0.05, 0.75, "#e84393"],
      ] as const)
        add(new THREE.CircleGeometry(0.06, 16), new THREE.MeshStandardMaterial({ color: c }), x, a.seatTop + h * y, a.backZ - 0.004, 0, Math.PI, 0, targetParent);
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
  chair: ChairModel;
  exhaust: THREE.Vector3;
  update(
    dt: number,
    speed: number,
    steer?: number,
    driftDir?: number,
    boosting?: boolean,
    rivalDir?: THREE.Vector3,
    air?: boolean,
    options?: CharacterSeatedOptions,
  ): void;
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
  const baseCharY = a.seatTop - thighBottom;
  const baseCharZ = a.seatZ - 0.06;
  char.root.position.set(0, baseCharY, baseCharZ);
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
    chair: seat,
    exhaust: seat.exhaust,
    update(dt, speed, steer = 0, driftDir = 0, boosting = false, rivalDir, air = false, options) {
      seat.update(dt, speed, steer, driftDir, boosting, air, rivalDir);
      if (!pivot) {
        char.root.position.y = baseCharY + (seat.pistonOffset ?? 0);
        char.root.rotation.z = seat.rollAngle ?? 0;
      }
      if (options && options.inAir === undefined) {
        options.inAir = air;
      }
      char.updateSeated?.(dt, speed, steer, driftDir, boosting, rivalDir, options);
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
