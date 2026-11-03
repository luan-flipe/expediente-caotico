import type { Vec2 } from "../types";
import { RACE } from "./balance";
import { branchPointAt, clampToTrack, corkscrewRoll, corkscrewTransform, deltaS, groundAt, inCarpet, pointAt, progressOf, sideNormal, type Track, type TrackProgress } from "./track";

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
  /** Altura (m) e velocidade vertical; ausentes = no chão. */
  y?: number;
  vy?: number;
  /** No ar depois de sair da rampa. */
  air?: boolean;
  /** Apertou derrapar no ar: turbo de manobra ao pousar. */
  trick?: boolean;
  /** Caindo no vão: some ao chegar em fallDepth. */
  fell?: boolean;
  /** Ângulo de giro 3D (saca-rolhas). */
  roll?: number;
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
  /** Pousou depois de manobra neste passo (ganhou o turbo de manobra). */
  stunt?: boolean;
  /** Terminou de cair no vão neste passo: a partida repõe a cadeira. */
  fell?: boolean;
  padBoost?: boolean;
  /** Passando pelo saca-rolhas (anti-gravidade ativa). */
  corkscrew?: boolean;
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
  if (s.fell) {
    // caindo no vão: só desce, sem andar nem comando
    s.speed = 0;
    s.vy = (s.vy ?? 0) - RACE.gravity * dt;
    s.y = Math.max(RACE.fallDepth, (s.y ?? 0) + s.vy * dt);
    return { state: s, wall: false, boost: 0, progress: track ? progressOf(track, s.pos, s.path) : null, fell: s.y <= RACE.fallDepth };
  }
  const airborne = !!s.air;
  const spinning = now < s.spinUntil;
  const slipping = now < s.slipUntil;
  const inp = now < s.frozenUntil || spinning ? NO_INPUT : input;
  const steer = (slipping ? 0 : clamp(inp.steer, -1, 1)) * (airborne ? RACE.airSteer : 1);
  const throttle = clamp(inp.throttle, -1, 1);
  let boost: 0 | 1 | 2 | 3 = 0;

  if (airborne) {
    // no ar não derrapa: derrapar vira manobra
    if (inp.drift && now >= s.frozenUntil && !spinning) s.trick = true;
  } else if (s.drifting) {
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

  const pr0 = track ? progressOf(track, s.pos, s.path) : null;
  const inCorkscrew0 = track && pr0 ? corkscrewRoll(track, pr0.s) > 0 : false;
  if (inCorkscrew0) {
    s.speed = Math.max(s.speed, 18);
  }
  if (track?.boostPads && (s.path ?? -1) === -1 && !s.fell && pr0) {
    for (const padS of track.boostPads) {
      if (Math.abs(deltaS(track, padS, pr0.s)) < 3.0) {
        s.boostUntil = Math.max(s.boostUntil, now + 1200);
        s.boostSpeed = Math.max(s.boostSpeed ?? 0, 24);
        break;
      }
    }
  }

  const boosting = now < s.boostUntil;
  if (!boosting) {
    s.boostSpeed = undefined;
  }
  const cupBonus = 1 + (s.cups ?? 0) * RACE.cupSpeedPerUnit;
  const baseCap = boosting ? (s.boostSpeed ?? RACE.boostSpeed) : RACE.maxSpeed;
  let cap = baseCap * cupBonus;
  if (track && pr0 && !boosting && inCarpet(track, pr0)) cap = RACE.maxSpeed * RACE.carpetMax;

  if (airborne) {
    // no ar a velocidade não muda (nem acelerador, nem freio, nem carpete)
  } else if (now < s.frozenUntil) {
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
  if (!airborne && s.speed > cap) s.speed = Math.max(cap, s.speed - RACE.overSpeedDecel * dt * (boosting ? 1 : 2));
  if (s.speed < -RACE.reverseMax) s.speed = -RACE.reverseMax;
  if (slipping) s.speed *= 1 - 1.2 * dt;
  if (inCorkscrew0 && track && pr0) {
    s.speed = Math.max(s.speed, 20);
    const at0 = pointAt(track, pr0.s);
    // Guia magnético anti-gravitacional: alinha o heading com a tangente da pista no loop 3D
    const dH = Math.atan2(Math.sin(at0.heading - s.heading), Math.cos(at0.heading - s.heading));
    s.heading += dH * Math.min(1, dt * 12);

    // O volante do piloto desloca o kart suavemente entre as faixas da pista
    let newLat = pr0.lateral;
    if (Math.abs(steer) > 0.01) {
      newLat = Math.max(-5.5, Math.min(5.5, pr0.lateral - steer * 7.5 * dt));
    }
    const nextS = (pr0.s + s.speed * dt) % track.length;
    const nextAt = pointAt(track, nextS);
    const nrm0 = sideNormal(Math.sin(nextAt.heading), Math.cos(nextAt.heading));
    s.pos = { x: nextAt.pos.x + nrm0.x * newLat, z: nextAt.pos.z + nrm0.z * newLat };
  } else if (spinning) {
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
  const next = inCorkscrew0 ? s.pos : { x: s.pos.x + vx * dt, z: s.pos.z + vz * dt };
  let wall = false;
  let progress: TrackProgress | null = null;
  if (track && !inCorkscrew0) {
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
  } else if (track) {
    progress = progressOf(track, s.pos, s.path);
  } else {
    s.pos = next;
  }
  let stunt = false;
  let inCorkscrew = false;
  if (track && progress) {
    const roll = corkscrewRoll(track, progress.s);
    if (roll > 0) {
      inCorkscrew = true;
      s.air = false;
      s.fell = false;
      s.vy = 0;
      s.speed = Math.max(s.speed, 18);
      s.roll = roll;
    } else if (s.roll !== undefined) {
      delete s.roll;
    }
    const g = groundAt(track, progress);
    const y0 = s.y ?? 0;
    if (roll > 0) {
      // No saca-rolhas a pista se mantém colada ao solo com anti-gravidade
      const tr = corkscrewTransform(track, progress.s, progress.lateral, 0);
      s.y = g.y + tr.y;
    } else if (!s.air) {
      if (y0 > g.y + 0.05 && s.speed >= RACE.minLaunchSpeed) {
        // saiu do topo da rampa: decola com a inclinação dela
        const ramp = track.ramps.find((r) => r.path === progress!.path);
        s.air = true;
        s.y = y0;
        s.vy = ramp ? (s.speed * ramp.height) / (ramp.sTo - ramp.sFrom) : 0;
        s.trick = false;
        s.drifting = false;
        s.driftDir = 0;
        s.driftMs = 0;
      } else if (g.gap) {
        s.fell = true;
        s.y = 0;
        s.vy = 0;
      } else {
        s.y = g.y;
      }
    } else {
      let vy = (s.vy ?? 0) - RACE.gravity * dt;
      // passado o pico o paraquedas abre e segura a queda
      if (vy < 0) vy = Math.max(vy, -RACE.glideFall);
      s.vy = vy;
      s.y = y0 + vy * dt;
      if (s.y <= g.y) {
        if (g.gap) {
          s.air = false;
          s.fell = true;
          s.vy = 0;
        } else {
          s.air = false;
          s.y = g.y;
          s.vy = 0;
          if (s.trick) {
            stunt = true;
            s.boostUntil = Math.max(s.boostUntil, now + RACE.stuntBoostMs);
            s.boostSpeed = Math.max(s.boostSpeed ?? 0, RACE.stuntBoostSpeed);
          }
          s.trick = false;
        }
      }
    }
    if (!s.air && !s.fell && s.y === 0 && !track?.heights) {
      // no chão plano o estado fica igual ao de antes das rampas
      delete s.y;
      delete s.vy;
      delete s.air;
      delete s.trick;
    }
  }
  let padBoost = false;
  if (track?.boostPads && (s.path ?? -1) === -1 && !s.fell && progress) {
    for (const padS of track.boostPads) {
      const d = Math.abs(deltaS(track, padS, progress.s));
      const d0 = pr0 ? deltaS(track, padS, pr0.s) : d;
      const d1 = deltaS(track, padS, progress.s);
      if (d < 3.0 || (d0 <= 0.5 && d1 >= -0.5 && Math.abs(d1 - d0) < 12)) {
        if (now >= s.boostUntil) padBoost = true;
        s.boostUntil = Math.max(s.boostUntil, now + 1200);
        s.boostSpeed = Math.max(s.boostSpeed ?? 0, 24);
        break;
      }
    }
  }
  return { state: s, wall, boost, progress, ...(stunt ? { stunt } : {}), ...(padBoost ? { padBoost } : {}), ...(inCorkscrew ? { corkscrew: true } : {}) };
}

/** Empurra duas cadeiras sobrepostas para fora uma da outra. */
export function collideKarts(a: KartState, b: KartState): boolean {
  // uma passa por cima da outra
  if (Math.abs((a.y ?? 0) - (b.y ?? 0)) > 1) return false;
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
