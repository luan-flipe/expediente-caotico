import * as THREE from "three";

/** Distância (m) e duração (s) do deslize de joelhos, e quanto leva para o boneco se jogar ao chão. */
export const SLIDE_DIST = 4.2;
export const SLIDE_SECONDS = 1.25;
export const DROP_SECONDS = 0.18;

/** Quanto o quadril desce (m): com a coxa um pouco inclinada, o joelho encosta no chão. */
const HIP_DROP = 0.16;

/** Rotação (radianos, em x, exceto os braços, em z) de cada osso na pose: tronco para trás, joelhos dobrados, braços abertos. */
const POSE = {
  tronco: -0.4,
  cabeca: -0.15,
  coxa: -0.3,
  joelho: 1.8,
  pe: 0.7,
  /** Braço direito (lado -x) sobe com z negativo; o esquerdo é o espelho. */
  bracoD: -0.5,
  bracoE: 0.5,
  cotovelo: 0,
} as const;

const easeOut = (u: number) => 1 - (1 - u) * (1 - u);
const smooth = (u: number) => u * u * (3 - 2 * u);

/** Quanto do deslize já andou (m) no instante t (s) da comemoração: sai rápido e desacelera até parar. */
export function slideDistance(t: number): number {
  return SLIDE_DIST * easeOut(Math.min(1, Math.max(0, t / SLIDE_SECONDS)));
}

/** Peso 0..1 da pose no instante t: o boneco cai de joelhos em DROP_SECONDS e fica na pose. */
export function poseWeight(t: number): number {
  return smooth(Math.min(1, Math.max(0, t / DROP_SECONDS)));
}

interface Saved {
  bone: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

/**
 * Deslize de joelhos da comemoração de gol, só visual: uma pose montada em código sobre os ossos que o boneco já tem
 * (sem clipe novo no glb). Chamar apply() depois de o boneco ser posicionado e animado no quadro; restore() devolve os ossos
 * ao que estavam antes (a animação de andar/parado retoma sozinha).
 */
export class DeslizeDeJoelhos {
  private bones = new Map<string, THREE.Object3D>();
  private saved: Saved[] = [];
  /** Altura do quadril antes da pose: o osso raiz não é animado em y, então a descida parte sempre dela (não acumula). */
  private hipsY = 0;
  private tmp = new THREE.Quaternion();
  private eul = new THREE.Euler();

  constructor(private readonly figure: THREE.Object3D) {
    figure.traverse((o) => {
      if (!this.bones.has(o.name) && (o as THREE.Bone).isBone) this.bones.set(o.name, o);
    });
  }

  /** Distância (m) do deslize no instante t. */
  distance(t: number): number {
    return slideDistance(t);
  }

  /** Aplica a pose no instante t (segundos desde o gol) e empurra o boneco para a frente (direção do rotation.y dele). */
  apply(t: number): void {
    const k = poseWeight(t);
    if (!this.saved.length) {
      for (const b of this.bones.values()) this.saved.push({ bone: b, position: b.position.clone(), quaternion: b.quaternion.clone() });
      this.hipsY = this.bones.get("root")?.position.y ?? 0;
    }
    const hips = this.bones.get("root");
    if (hips) hips.position.y = this.hipsY - HIP_DROP * k;
    this.turn("tronco", POSE.tronco, 0, k);
    this.turn("cabeca", POSE.cabeca, 0, k);
    for (const s of ["D", "E"]) {
      this.turn(`perna_${s}`, POSE.coxa, 0, k);
      this.turn(`joelho_${s}`, POSE.joelho, 0, k);
      this.turn(`pe_${s}`, POSE.pe, 0, k);
      this.turn(`ombro_${s}`, 0, s === "D" ? POSE.bracoD : POSE.bracoE, k);
      this.turn(`cotovelo_${s}`, POSE.cotovelo, 0, k);
    }
    const f = this.figure.rotation.y;
    const d = slideDistance(t);
    this.figure.position.x += Math.sin(f) * d;
    this.figure.position.z += Math.cos(f) * d;
  }

  /** Gira o osso da animação atual até a pose (x e z em radianos), com peso k. */
  private turn(name: string, x: number, z: number, k: number): void {
    const b = this.bones.get(name);
    if (!b) return;
    this.tmp.setFromEuler(this.eul.set(x, 0, z));
    b.quaternion.slerp(this.tmp, k);
  }

  restore(): void {
    for (const s of this.saved) {
      s.bone.position.copy(s.position);
      s.bone.quaternion.copy(s.quaternion);
    }
    this.saved = [];
  }
}
