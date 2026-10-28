import type { Vec2 } from "../types";
import { RACE } from "./balance";
import { clampToTrack, inCarpet, pointAt, progressOf, type Track, type TrackProgress } from "./track";

export interface KartState {
  pos: Vec2;
  /** 0 olha para +z, igual ao dirOf do tiroteio. */
  heading: number;
  /** Velocidade para a frente (negativa em ré). */
  speed: number;
  drifting: boolean;
  driftDir: -1 | 0 | 1;
  driftMs: number;
  boostUntil: number;
  spinUntil: number;
  slipUntil: number;
  /** Parada da reposição (R). */
  frozenUntil: number;
}

/** steer +1 vira para a direita da câmera; throttle -1 freia e dá ré. */
export interface KartInput {
  steer: number;
  throttle: number;
  drift: boolean;
}

export interface KartStep {
  state: KartState;
  wall: boolean;
  /** Turbo de derrapagem liberado neste passo (0 = nenhum). */
  boost: 0 | 1 | 2;
  progress: TrackProgress | null;
}

export const NO_INPUT: KartInput = { steer: 0, throttle: 0, drift: false };

export function newKart(pos: Vec2, heading: number): KartState {
  return { pos: { ...pos }, heading, speed: 0, drifting: false, driftDir: 0, driftMs: 0, boostUntil: 0, spinUntil: 0, slipUntil: 0, frozenUntil: 0 };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : 0));

/**
 * Um passo da física da cadeira. Pura: mesmo estado e entrada dão o mesmo resultado.
 * Sem pista (track null) não há paredes nem carpete (usado nos testes).
 */
export function stepKart(k: KartState, input: KartInput, dtMs: number, now: number, track: Track | null): KartStep {
  const dt = dtMs / 1000;
  const s: KartState = { ...k, pos: { ...k.pos } };
  const spinning = now < s.spinUntil;
  const slipping = now < s.slipUntil;
  const inp = now < s.frozenUntil || spinning ? NO_INPUT : input;
  const steer = slipping ? 0 : clamp(inp.steer, -1, 1);
  const throttle = clamp(inp.throttle, -1, 1);
  let boost: 0 | 1 | 2 = 0;

  if (s.drifting) {
    const lost = spinning || slipping;
    if (!inp.drift || lost || s.speed < RACE.driftMinSpeed * 0.6) {
      if (!lost) boost = s.driftMs >= RACE.driftLevel2Ms ? 2 : s.driftMs >= RACE.driftLevel1Ms ? 1 : 0;
      if (boost) s.boostUntil = Math.max(s.boostUntil, now + (boost === 2 ? RACE.boost2Ms : RACE.boost1Ms));
      s.drifting = false;
      s.driftDir = 0;
      s.driftMs = 0;
    } else {
      s.driftMs += dtMs;
    }
  } else if (inp.drift && Math.abs(steer) > 0.3 && s.speed >= RACE.driftMinSpeed) {
    s.drifting = true;
    s.driftDir = steer > 0 ? 1 : -1;
    s.driftMs = 0;
  }

  const boosting = now < s.boostUntil;
  const pr0 = track ? progressOf(track, s.pos) : null;
  let cap = boosting ? RACE.boostSpeed : RACE.maxSpeed;
  if (track && pr0 && !boosting && inCarpet(track, pr0)) cap = RACE.maxSpeed * RACE.carpetMax;

  if (now < s.frozenUntil) {
    s.speed = 0;
  } else if (spinning) {
    s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), 12 * dt);
  } else if (boosting) {
    if (s.speed < cap) s.speed = Math.min(cap, s.speed + RACE.accel * 3 * dt);
  } else if (throttle > 0) {
    s.speed += (s.speed < 0 ? RACE.brake : RACE.accel) * throttle * dt;
  } else if (throttle < 0) {
    s.speed += (s.speed > 0 ? RACE.brake : RACE.accel * 0.6) * throttle * dt;
  } else {
    s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), RACE.coastDecel * dt);
  }
  if (s.speed > cap) s.speed = Math.max(cap, s.speed - RACE.overSpeedDecel * dt * (boosting ? 1 : 2));
  if (s.speed < -RACE.reverseMax) s.speed = -RACE.reverseMax;
  if (slipping) s.speed *= 1 - 1.2 * dt;

  if (spinning) {
    s.heading += 12 * dt;
  } else if (s.drifting) {
    s.heading -= (s.driftDir * 0.6 + steer * 0.4) * RACE.turnRate * (1 + RACE.driftTurnBonus) * dt;
  } else {
    // cadeira gira no lugar mesmo parada; acima disso, o raio mínimo cresce com a velocidade
    const omega = Math.min(RACE.turnRate, Math.max(RACE.spinInPlace, Math.abs(s.speed) / RACE.minTurnRadius));
    s.heading -= steer * omega * (s.speed < 0 ? -1 : 1) * dt;
  }
  s.heading = Math.atan2(Math.sin(s.heading), Math.cos(s.heading));

  const dir = s.heading + (s.drifting ? s.driftDir * RACE.driftSlipRad : 0);
  const vx = Math.sin(dir) * s.speed;
  const vz = Math.cos(dir) * s.speed;
  const next = { x: s.pos.x + vx * dt, z: s.pos.z + vz * dt };
  let wall = false;
  let progress: TrackProgress | null = null;
  if (track) {
    const c = clampToTrack(track, next, RACE.kartRadius);
    s.pos = c.pos;
    progress = c.progress;
    if (c.hit && Math.abs(s.speed) > 0.01) {
      const into = (vx * c.normal.x + vz * c.normal.z) / Math.abs(s.speed);
      if (into > 0) {
        wall = into > 0.3;
        s.speed *= 1 - (1 - RACE.wallSpeedKeep) * into;
      }
    }
  } else {
    s.pos = next;
  }
  return { state: s, wall, boost, progress };
}

/** Empurra duas cadeiras sobrepostas para fora uma da outra. */
export function collideKarts(a: KartState, b: KartState): boolean {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const d = Math.hypot(dx, dz);
  const min = RACE.kartRadius * 2;
  if (d >= min) return false;
  const nx = d > 1e-6 ? dx / d : 1;
  const nz = d > 1e-6 ? dz / d : 0;
  const push = (min - d) / 2;
  a.pos = { x: a.pos.x - nx * push, z: a.pos.z - nz * push };
  b.pos = { x: b.pos.x + nx * push, z: b.pos.z + nz * push };
  a.speed *= 0.97;
  b.speed *= 0.97;
  return true;
}

export function respawnAt(track: Track, s: number): Pick<KartState, "pos" | "heading"> {
  const at = pointAt(track, s);
  return { pos: at.pos, heading: at.heading };
}
