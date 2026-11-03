import type { FutSnapshot } from "@ec/shared";

/** Um instante gravado: bola e jogadores (posição, direção, no chão). */
export interface Frame {
  /** Tempo do servidor (ms). */
  t: number;
  ball: [number, number, number];
  /** [id, x, z, facing, caído (0 ou 1)] */
  ps: [string, number, number, number, number][];
}

export interface Clip {
  frames: Frame[];
  from: number;
  to: number;
}

export interface ReplayPlayer {
  x: number;
  z: number;
  f: number;
  down: boolean;
  /** Velocidade (m/s) entre os dois quadros vizinhos, para a animação de andar. */
  speed: number;
}

export interface ReplaySample {
  ball: { x: number; y: number; z: number; vx: number; vz: number };
  players: Map<string, ReplayPlayer>;
}

/** Quanto tempo (ms) do jogo fica guardado para o replay. */
export const HISTORY_MS = 14000;

/** Gravador dos últimos HISTORY_MS do jogo, um quadro por snapshot. */
export class ReplayBuffer {
  frames: Frame[] = [];

  push(s: FutSnapshot): void {
    const last = this.frames[this.frames.length - 1];
    if (last && s.t <= last.t) {
      return;
    }
    this.frames.push({
      t: s.t,
      ball: [s.ball.x, s.ball.y, s.ball.z],
      ps: s.players.map((p) => [p.id, p.x, p.z, p.facing, p.down ? 1 : 0]),
    });
    const min = s.t - HISTORY_MS;
    let drop = 0;
    while (drop < this.frames.length - 1 && this.frames[drop].t < min) {
      drop++;
    }
    if (drop > 0) {
      this.frames.splice(0, drop);
    }
  }

  get lastT(): number {
    return this.frames.length ? this.frames[this.frames.length - 1].t : -Infinity;
  }

  /** Cópia dos quadros de [from, to] (com um quadro de folga de cada lado para interpolar). */
  slice(from: number, to: number): Clip | null {
    const a = this.frames.findIndex((f) => f.t >= from);
    if (a < 0) {
      return null;
    }
    let b = this.frames.length - 1;
    while (b > a && this.frames[b].t > to) {
      b--;
    }
    const frames = this.frames.slice(Math.max(0, a - 1), Math.min(this.frames.length, b + 2));
    return frames.length >= 2 ? { frames, from: Math.max(from, frames[0].t), to: Math.min(to, frames[frames.length - 1].t) } : null;
  }
}

const angleLerp = (a: number, b: number, k: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) {
    d -= Math.PI * 2;
  }
  if (d < -Math.PI) {
    d += Math.PI * 2;
  }
  return a + d * k;
};

/** Estado interpolado do clipe no tempo `t` (ms do servidor). Saltos grandes (reposição) não deslizam. */
export function sampleClip(clip: Clip, t: number): ReplaySample | null {
  const fr = clip.frames;
  if (fr.length < 2) {
    return null;
  }
  let i = 0;
  while (i < fr.length - 2 && fr[i + 1].t <= t) {
    i++;
  }
  const a = fr[i];
  const b = fr[i + 1];
  const span = b.t - a.t || 1;
  const k = Math.max(0, Math.min(1, (t - a.t) / span));
  const sec = span / 1000;
  const players = new Map<string, ReplayPlayer>();
  const next = new Map(b.ps.map((p) => [p[0], p]));
  for (const p of a.ps) {
    const q = next.get(p[0]);
    if (!q) {
      continue;
    }
    const jump = Math.hypot(q[1] - p[1], q[2] - p[2]) > 5;
    const kk = jump ? 1 : k;
    players.set(p[0], {
      x: p[1] + (q[1] - p[1]) * kk,
      z: p[2] + (q[2] - p[2]) * kk,
      f: angleLerp(p[3], q[3], kk),
      down: (k < 0.5 ? p[4] : q[4]) === 1,
      speed: jump ? 0 : Math.hypot(q[1] - p[1], q[2] - p[2]) / sec,
    });
  }
  const bx = b.ball[0] - a.ball[0];
  const bz = b.ball[2] - a.ball[2];
  const bjump = Math.hypot(bx, bz) > 5;
  const bk = bjump ? 1 : k;
  return {
    ball: {
      x: a.ball[0] + bx * bk,
      y: a.ball[1] + (b.ball[1] - a.ball[1]) * bk,
      z: a.ball[2] + bz * bk,
      vx: bjump ? 0 : bx / sec,
      vz: bjump ? 0 : bz / sec,
    },
    players,
  };
}
