import { FUT } from "./balance";
import { attackDir, passPowerFor } from "./bots";
import type { Ball, Field, FutInput, FutPlayer } from "./types";

/** Resultado do chute assistido: direção (yaw) e velocidade vertical (m/s) que levam ao canto escolhido. */
export interface ShotAssist {
  yaw: number;
  vy: number;
  /** Só na falta: velocidade e efeito escolhidos para passar a barreira e cair no canto. */
  speed?: number;
  curve?: number;
}

/** Distância (m) da barreira à bola numa falta a `dGoal` metros do gol: wallDist, encurtada perto do gol. */
export function wallDistance(dGoal: number): number {
  return Math.min(FUT.wallDist, dGoal * 0.6);
}

/** Voo da bola (gravidade, efeito constante) até a linha do gol: altura na barreira e z/altura ao cruzar. null = cai antes. */
function fly(bx: number, bz: number, yaw: number, speed: number, vy: number, curve: number, dir: number, gx: number, wallAt: number): { z: number; y: number; wallY: number } | null {
  // o mesmo passo da partida (30 Hz): o voo planejado é o que stepBall repete
  const dt = 1 / 30;
  let x = bx;
  let z = bz;
  let y = FUT.ballRadius;
  let vyy = vy;
  let th = yaw;
  let wallY = -1;
  const startD = Math.abs(gx - bx);
  for (let i = 0; i < 120; i++) {
    th += curve * dt;
    x += Math.sin(th) * speed * dt;
    z += Math.cos(th) * speed * dt;
    vyy -= FUT.gravity * dt;
    y += vyy * dt;
    if (wallY < 0 && Math.abs(gx - x) <= startD - wallAt) {
      wallY = y;
    }
    if (y <= FUT.ballRadius) {
      return null;
    }
    if ((x - gx) * dir >= FUT.ballRadius) {
      return { z, y, wallY: wallY < 0 ? y : wallY };
    }
  }
  return null;
}

/** Planeja a falta: procura (da mais forte para a mais fraca) a velocidade e a subida que passam a barreira e entram sob o travessão,
 *  com efeito para o centro do gol; resolve a direção por bissecção para a bola cair no canto. null = nada serviu. */
function planFreeKick(ball: Ball, field: Field, dir: number, side: number, targetZ: number, maxSpeed: number): { yaw: number; vy: number; speed: number; curve: number } | null {
  const gx = dir * field.halfL;
  const preferred = side * dir * FUT.freeKickCurve;
  const dGoal = Math.hypot(gx - ball.x, targetZ - ball.z);
  const wallAt = wallDistance(Math.hypot(gx - ball.x, ball.z));
  const base = Math.atan2(gx - ball.x, targetZ - ball.z);
  const bar = field.goalH - FUT.barSlack;
  // o efeito prefere virar para o centro do gol; se o ângulo não deixa, tenta o outro lado
  for (const curve of [preferred, -preferred]) {
  for (let speed = Math.min(maxSpeed, FREE_KICK_CAP); speed >= FUT.shotMin + 2; speed -= 0.5) {
    if (dGoal / speed < 0.2) {
      continue;
    }
    for (let vy = 3; vy <= speed * 0.6; vy += 0.25) {
      let lo = base - 0.4;
      let hi = base + 0.4;
      const zAt = (yaw: number) => fly(ball.x, ball.z, yaw, speed, vy, curve, dir, gx, wallAt);
      const a = zAt(lo);
      const b = zAt(hi);
      if (!a || !b || (a.z - targetZ) * (b.z - targetZ) > 0) {
        continue;
      }
      for (let k = 0; k < 14; k++) {
        const mid = (lo + hi) / 2;
        const r = zAt(mid);
        if (!r) {
          break;
        }
        if ((r.z - targetZ) * (a.z - targetZ) > 0) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      const yaw = (lo + hi) / 2;
      const r = zAt(yaw);
      if (r && r.wallY >= FUT.wallClear && r.y <= bar && r.y >= 0.3) {
        return { yaw, vy, speed, curve };
      }
    }
  }
  }
  return null;
}

/** Velocidade (m/s) máxima que o planejamento da falta considera (a carga não limita: o cobrador só escolhe o canto) (acima disso nada passa a barreira e cai sob o travessão). */
const FREE_KICK_CAP = 22;

/** Canto longe do goleiro adversário (sem goleiro fora do meio, sorteia). */
function openCorner(p: FutPlayer, players: readonly FutPlayer[], rng: () => number): number {
  const keeper = players.find((q) => q.side !== p.side && q.role === "goleiro");
  return keeper && Math.abs(keeper.z) > 0.1 ? -Math.sign(keeper.z) : rng() < 0.5 ? -1 : 1;
}

/** Entrada lateral do movimento (eixo z do campo) que já conta como escolher um canto. */
const LATERAL_PICK = 0.35;

/** Canto do chute para o gol: o lado em que o jogador anda (z); parado, o poste longe de onde ele está; no meio, o canto livre do goleiro. */
function goalSide(p: FutPlayer, input: FutInput, ball: Ball, field: Field, players: readonly FutPlayer[], rng: () => number): number {
  if (Math.abs(input.mz) >= LATERAL_PICK) {
    return Math.sign(input.mz);
  }
  if (Math.abs(ball.z) > field.goalHalfW * 0.5) {
    return -Math.sign(ball.z);
  }
  return openCorner(p, players, rng);
}

/** Diferença de ângulo (rad, cerca de 1 grau) abaixo da qual dois companheiros empatam e vale o mais perto. */
const TIE_RAD = 0.017;

/**
 * Companheiro para o passe do humano: o de linha ativo com menor desvio angular em relação ao facing do portador; quem está atrás
 * (desvio de 90 graus ou mais) só vale se não houver ninguém à frente; empate de ângulo vai para o mais perto.
 */
export function passTarget(p: FutPlayer, players: readonly FutPlayer[]): FutPlayer | null {
  let best: FutPlayer | null = null;
  let bestDev = Infinity;
  let bestD = Infinity;
  let bestFront = false;
  for (const q of players) {
    if (q.id === p.id || q.side !== p.side || q.role !== "linha" || q.sentOff || q.downMs > 0) {
      continue;
    }
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const d = Math.hypot(dx, dz);
    const raw = Math.atan2(dx, dz) - p.facing;
    const dev = Math.abs(Math.atan2(Math.sin(raw), Math.cos(raw)));
    const front = dev < Math.PI / 2;
    const better =
      best === null ||
      (front && !bestFront) ||
      (front === bestFront && (dev < bestDev - TIE_RAD || (Math.abs(dev - bestDev) <= TIE_RAD && d < bestD)));
    if (better) {
      best = q;
      bestDev = dev;
      bestD = d;
      bestFront = front;
    }
  }
  return best;
}

/** Passe do humano: direção ao companheiro escolhido e força mínima para a bola chegar até ele. null = sem companheiro. */
export function humanPass(p: FutPlayer, power01: number, players: readonly FutPlayer[]): { yaw: number; power: number } | null {
  const mate = passTarget(p, players);
  if (!mate) {
    return null;
  }
  const dx = mate.x - p.x;
  const dz = mate.z - p.z;
  return { yaw: Math.atan2(dx, dz), power: Math.max(power01, passPowerFor(Math.hypot(dx, dz))) };
}

/** Velocidade (m/s) de um chute de força power01 (a mesma de kickBall). */
const shotSpeed = (p: number): number => FUT.shotMin + (FUT.shotMax - FUT.shotMin) * p;

/**
 * Chute assistido. Perto do gol e com a mira na direção dele, o jogador só escolhe o canto: o lado vem de onde a mira
 * cruza a linha do gol (esquerda ou direita da trave) e a altura da força (forte = ângulo, fraco = rasteiro). A direção
 * e a subida são recalculadas para a bola chegar ao canto, com imprecisão que cresce com a força e com a marcação.
 * Devolve null fora do alcance ou com a mira longe do gol (o chute sai como o jogador apontou).
 */
export function assistShot(p: FutPlayer, input: FutInput, power01: number, ball: Ball, field: Field, players: readonly FutPlayer[], rng: () => number, freeKick = false, toGoal = false): ShotAssist | null {
  const dir = attackDir(p.side);
  const gx = dir * field.halfL;
  const dx = gx - ball.x;
  let side: number;
  if (toGoal) {
    // humano: o chute vai sempre ao gol adversário, de qualquer lugar; a mira da câmera não conta
    if (dx * dir < 0.5) {
      return null;
    }
    side = goalSide(p, input, ball, field, players, rng);
  } else {
    const ax = Math.sin(input.aim);
    const az = Math.cos(input.aim);
    const along = ax * dir;
    // de costas para o gol, muito longe, ou já na linha de fundo: sem assistência
    if (dx * dir < 1 || dx * dir > FUT.assistRange || along < 0.5) {
      return null;
    }
    const t = dx / ax;
    const zc = ball.z + az * t;
    if (Math.abs(zc) > field.goalHalfW * FUT.assistReach) {
      return null;
    }
    // lado: onde a mira cruza a linha; no meio do gol, o canto longe do goleiro adversário
    side = Math.sign(zc);
    if (Math.abs(zc) < field.goalHalfW * 0.2) {
      side = openCorner(p, players, rng);
    }
  }
  const targetZ = side * field.goalHalfW * FUT.assistCorner;

  let pressure = 0;
  for (const q of players) {
    if (q.side !== p.side && q.role === "linha" && !q.sentOff && q.downMs <= 0) {
      pressure = Math.max(pressure, 1 - Math.hypot(q.x - p.x, q.z - p.z) / FUT.assistPressureDist);
    }
  }
  const err = FUT.assistErr + FUT.assistErrPower * power01 + FUT.assistErrPressure * Math.max(0, pressure);
  const noise = (rng() * 2 - 1) * err;
  if (freeKick) {
    // cobrança de falta: curva e altura para passar a barreira e cair no canto
    const plan = planFreeKick(ball, field, dir, side, targetZ, FREE_KICK_CAP);
    if (plan) {
      return { yaw: plan.yaw + noise, vy: plan.vy, speed: plan.speed, curve: plan.curve };
    }
  }
  const yaw = Math.atan2(gx - ball.x, targetZ - ball.z) + noise;

  const speed = shotSpeed(power01);
  const high = power01 >= FUT.assistHighFrom;
  let vy = 0;
  if (high) {
    // sobe para cruzar a linha do gol na altura do canto alto: y = r + vy t - g t^2 / 2
    const flat = Math.hypot(gx - ball.x, targetZ - ball.z);
    const tf = flat / speed;
    vy = Math.max(0, (FUT.assistHighY - FUT.ballRadius + (FUT.gravity * tf * tf) / 2) / tf);
    vy = Math.min(vy, speed * 0.6);
  }
  return { yaw, vy };
}
