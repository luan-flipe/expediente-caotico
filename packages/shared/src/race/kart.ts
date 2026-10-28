import type { Vec2 } from "../types";
import { RACE } from "./balance";
import { branchPointAt, clampToTrack, inCarpet, progressOf, type Track, type TrackProgress } from "./track";

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
  boostSpeed?: number;
  spinUntil: number;
  slipUntil: number;
  /** Parada da reposição (R). */
  frozenUntil: number;
  cups?: number;
  stuntUntil?: number;
  draftMs?: number;
  /** Caminho em que a cadeira está: -1 (ou ausente) = principal, 0.. = atalho. */
  path?: number;
}

/** steer +1 vira para a direita da câmera; throttle -1 freia e dá ré. */
export interface KartInput {
  steer: number;
  throttle: number;
  drift: boolean;
  itemHold?: boolean;
}

export interface KartStep {
  state: KartState;
  wall: boolean;
  /** Turbo de derrapagem liberado neste passo (0 = nenhum, 1 = azul, 2 = laranja, 3 = roxo). */
  boost: 0 | 1 | 2 | 3;
  progress: TrackProgress | null;
}

export const NO_INPUT: KartInput = { steer: 0, throttle: 0, drift: false };

export function newKart(pos: Vec2, heading: number): KartState {
  return { pos: { ...pos }, heading, speed: 0, drifting: false, driftDir: 0, driftMs: 0, boostUntil: 0, spinUntil: 0, slipUntil: 0, frozenUntil: 0, cups: 0 };
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
  let boost: 0 | 1 | 2 | 3 = 0;

  if (s.drifting) {
    const lost = spinning || slipping;
    if (!inp.drift || lost || s.speed < RACE.driftMinSpeed * 0.6) {
      if (!lost) {
        boost = s.driftMs >= RACE.driftLevel3Ms ? 3 : s.driftMs >= RACE.driftLevel2Ms ? 2 : s.driftMs >= RACE.driftLevel1Ms ? 1 : 0;
      }
      if (boost) {
        const boostDur = boost === 3 ? RACE.boost3Ms : boost === 2 ? RACE.boost2Ms : RACE.boost1Ms;
        const bSpeed = boost === 3 ? RACE.boost3Speed : RACE.boostSpeed;
        s.boostUntil = Math.max(s.boostUntil, now + boostDur);
        s.boostSpeed = Math.max(s.boostSpeed ?? 0, bSpeed);
      }
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
  if (!boosting) {
    s.boostSpeed = undefined;
  }
  const pr0 = track ? progressOf(track, s.pos, s.path) : null;
  const cupBonus = 1 + (s.cups ?? 0) * RACE.cupSpeedPerUnit;
  const baseCap = boosting ? (s.boostSpeed ?? RACE.boostSpeed) : RACE.maxSpeed;
  let cap = baseCap * cupBonus;
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
    // Curva dinâmica estilo Mario Kart com contra-esterço total:
    // steerFactor = steer * s.driftDir:
    //  +1 = virando para dentro da curva (curva fecha com agilidade)
    //   0 = volante neutro (arco de derrapagem suave e natural)
    //  -1 = contra-esterço (abre a curva, permitindo deslizar quase reto sem colidir na parede interna)
    const steerFactor = steer * s.driftDir;
    const turnWeight = steerFactor > 0
      ? 0.28 + 0.72 * steerFactor
      : Math.max(0.04, 0.28 + 0.24 * steerFactor);
    s.heading -= s.driftDir * turnWeight * RACE.turnRate * (1 + RACE.driftTurnBonus) * dt;
  } else {
    // cadeira gira no lugar mesmo parada; acima disso, o raio mínimo cresce com a velocidade
    const omega = Math.min(RACE.turnRate, Math.max(RACE.spinInPlace, Math.abs(s.speed) / RACE.minTurnRadius));
    s.heading -= steer * omega * (s.speed < 0 ? -1 : 1) * dt;
  }
  s.heading = Math.atan2(Math.sin(s.heading), Math.cos(s.heading));

  // O ângulo de deslizamento lateral se estabelece suavemente nos primeiros 180 ms
  const slipRatio = Math.min(1, s.driftMs / 180);
  const slipAngle = s.driftDir * RACE.driftSlipRad * (0.35 + 0.65 * slipRatio);
  const dir = s.heading + (s.drifting ? slipAngle : 0);
  const vx = Math.sin(dir) * s.speed;
  const vz = Math.cos(dir) * s.speed;
  const next = { x: s.pos.x + vx * dt, z: s.pos.z + vz * dt };
  let wall = false;
  let progress: TrackProgress | null = null;
  if (track) {
    const c = clampToTrack(track, next, RACE.kartRadius, s.path);
    s.pos = c.pos;
    if (c.progress.path !== (s.path ?? -1)) s.path = c.progress.path;
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

/** Centro do caminho path (-1 = principal) no s da principal. */
export function respawnAt(track: Track, s: number, path = -1): Pick<KartState, "pos" | "heading" | "path"> {
  const at = branchPointAt(track, path, s);
  return { pos: at.pos, heading: at.heading, path: track.branches[path] ? path : -1 };
}
