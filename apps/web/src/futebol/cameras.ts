import type { Field } from "@ec/shared";
import { crewSpots } from "./arenaLayout";

/** Câmeras do espectador. */
export type CamKind = "tv" | "atras" | "aerea" | "bola" | "jogador";

export const CAM_KINDS: readonly CamKind[] = ["tv", "atras", "aerea", "bola", "jogador"];

export const CAM_LABELS: Record<CamKind, string> = {
  tv: "TV lateral",
  atras: "Atrás do gol",
  aerea: "Aérea",
  bola: "Seguir bola",
  jogador: "Seguir jogador",
};

export interface CamBall {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
}

export interface CamTarget {
  x: number;
  z: number;
  facing: number;
}

export interface CamCtx {
  field: Field;
  ball: CamBall;
  /** Jogador seguido (câmera "jogador"). */
  target?: CamTarget | null;
  /** Lado do gol que a câmera "atras" mostra (-1 ou 1); sem ele, o gol mais perto da bola. */
  goalSide?: number;
}

export interface CamPose {
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Recuo (m) da câmera atrás do gol e da lateral, além das linhas. */
const BEHIND_GOAL = 14;
const SIDE_OFF = 11;

/** Pose de cada câmera para o estado do jogo. Pura: o motor só a suaviza. */
export function camPose(kind: CamKind, c: CamCtx): CamPose {
  const f = c.field;
  const b = c.ball;
  switch (kind) {
    case "tv":
      // lateral alta, anda com a bola ao longo do campo
      return { pos: [clamp(b.x, -f.halfL * 0.8, f.halfL * 0.8), 15 + f.halfW * 0.12, -(f.halfW + SIDE_OFF)], look: [b.x, 0.5, b.z], fov: 50 };
    case "atras": {
      const s = c.goalSide ?? (b.x >= 0 ? 1 : -1);
      return { pos: [s * (f.halfL + BEHIND_GOAL), 4.5, clamp(b.z * 0.35, -f.goalHalfW * 2, f.goalHalfW * 2)], look: [b.x * 0.6, 1, b.z * 0.5], fov: 55 };
    }
    case "aerea":
      return { pos: [b.x * 0.55, 34 + f.halfL * 0.6, b.z * 0.55 + 10], look: [b.x * 0.55, 0, b.z * 0.55], fov: 55 };
    case "bola": {
      // atrás da bola, na direção do deslocamento (parada, do centro do campo para ela)
      const sp = Math.hypot(b.vx, b.vz);
      let dx = sp > 2 ? b.vx / sp : b.x;
      let dz = sp > 2 ? b.vz / sp : b.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) {
        dx = 1;
        dz = 0;
      } else {
        dx /= len;
        dz /= len;
      }
      return { pos: [b.x - dx * 7, 3.4 + b.y, b.z - dz * 7], look: [b.x + dx * 4, 0.8, b.z + dz * 4], fov: 62 };
    }
    case "jogador": {
      const t = c.target ?? { x: b.x, z: b.z, facing: 0 };
      const sx = Math.sin(t.facing);
      const sz = Math.cos(t.facing);
      return { pos: [t.x - sx * 5.5, 2.7, t.z - sz * 5.5], look: [t.x + sx * 3, 1.2, t.z + sz * 3], fov: 65 };
    }
  }
}

/** Planos do replay de gol, na ordem em que se alternam. */
export type ReplayShot = "equipe" | "atras" | "tv" | "bola";

export const REPLAY_SHOTS: readonly ReplayShot[] = ["equipe", "atras", "tv", "bola"];

export const REPLAY_LABELS: Record<ReplayShot, string> = {
  equipe: "Câmera da equipe",
  atras: "Atrás do gol",
  tv: "Lateral alta",
  bola: "Acompanhando a bola",
};

/** Plano do replay no ponto `p01` (0 a 1) do clipe: cada plano ocupa uma fatia igual. */
export function shotAt(p01: number): ReplayShot {
  const i = Math.min(REPLAY_SHOTS.length - 1, Math.max(0, Math.floor(p01 * REPLAY_SHOTS.length)));
  return REPLAY_SHOTS[i];
}

/** Pose de um plano do replay. "equipe" é a câmera de ombro ou tripé mais perto da bola, atrás das placas, com zoom. */
export function replayPose(shot: ReplayShot, c: CamCtx): CamPose {
  if (shot === "equipe") {
    const b = c.ball;
    let best = { x: 0, z: -(c.field.halfW + 3) };
    let bestD = Infinity;
    for (const s of crewSpots(c.field)) {
      const d = Math.hypot(s.x - b.x, s.z - b.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return { pos: [best.x, 1.7, best.z], look: [b.x, 0.8, b.z], fov: 34 };
  }
  return camPose(shot, c);
}
