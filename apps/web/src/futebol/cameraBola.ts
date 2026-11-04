import type { Field } from "@ec/shared";
import { GRASS_EDGE } from "./arenaLayout";

/** Distância da câmera de partida até a bola (m). */
export const BOLA_DIST = 8.5;
/** Deslocamento lateral, para a bola não ficar escondida atrás do centro da tela. */
export const BOLA_SIDE = 0.9;
/** Altura mínima da câmera (nunca abaixo do chão) e do ponto olhado. */
export const BOLA_MIN_Y = 0.9;
export const BOLA_LOOK_Y = 0.6;
/** Teto de altura: não passa por cima das arquibancadas. */
export const BOLA_MAX_Y = 16;
/** Folga dentro da borda do gramado, onde as arquibancadas começam. */
export const BOLA_EDGE_MARGIN = 1.5;
/** Taxa (1/s) do seguimento do foco: baixa o bastante para o chute forte não dar tranco. */
export const BOLA_FOLLOW_RATE = 6;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Foco da câmera: a bola, suavizada. Primeiro quadro (prev nulo) ou corte salta direto. */
export function bolaFocus(prev: Vec3 | null, ball: Vec3, dt: number): Vec3 {
  if (!prev) return { x: ball.x, y: ball.y, z: ball.z };
  const k = 1 - Math.exp(-dt * BOLA_FOLLOW_RATE);
  return { x: prev.x + (ball.x - prev.x) * k, y: prev.y + (ball.y - prev.y) * k, z: prev.z + (ball.z - prev.z) * k };
}

export interface BolaPose {
  pos: Vec3;
  look: Vec3;
}

/**
 * Pose da câmera de partida: orbita o foco em yaw/pitch (yaw 0 olha para +z), acima do chão
 * e dentro do gramado do mapa, para não entrar nas arquibancadas.
 */
export function bolaPose(focus: Vec3, yaw: number, pitch: number, field: Field): BolaPose {
  const cp = Math.cos(pitch);
  const fx = Math.sin(yaw) * cp;
  const fy = Math.sin(pitch);
  const fz = Math.cos(yaw) * cp;
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  const ly = focus.y + BOLA_LOOK_Y;
  const limX = Math.max(field.halfL, GRASS_EDGE.halfL) - BOLA_EDGE_MARGIN;
  const limZ = Math.max(field.halfW, GRASS_EDGE.halfW) - BOLA_EDGE_MARGIN;
  const pos = {
    x: clamp(focus.x - fx * BOLA_DIST + rx * BOLA_SIDE, -limX, limX),
    y: clamp(ly - fy * BOLA_DIST, BOLA_MIN_Y, BOLA_MAX_Y),
    z: clamp(focus.z - fz * BOLA_DIST + rz * BOLA_SIDE, -limZ, limZ),
  };
  return { pos, look: { x: focus.x, y: ly, z: focus.z } };
}

/** O ponto (x, z) cai fora da tela? Recebe a projeção NDC (-1..1) e se está à frente da câmera. */
export function offscreenDir(ndcX: number, ndcY: number, inFront: boolean, margin = 0.92): { x: number; y: number } | null {
  let x = inFront ? ndcX : -ndcX;
  let y = inFront ? ndcY : -ndcY;
  if (inFront && Math.abs(x) <= margin && Math.abs(y) <= margin) return null;
  if (!inFront && Math.abs(x) < 1e-6 && Math.abs(y) < 1e-6) y = -1;
  const m = Math.max(Math.abs(x), Math.abs(y));
  x /= m;
  y /= m;
  return { x: x * margin, y: y * margin };
}
