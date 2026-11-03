import { FUT } from "./balance";
import { attackDir } from "./bots";
import type { Ball, Field, FutInput, FutPlayer } from "./types";

/** Resultado do chute assistido: direção (yaw) e velocidade vertical (m/s) que levam ao canto escolhido. */
export interface ShotAssist {
  yaw: number;
  vy: number;
}

/** Velocidade (m/s) de um chute de força power01 (a mesma de kickBall). */
const shotSpeed = (p: number): number => FUT.shotMin + (FUT.shotMax - FUT.shotMin) * p;

/**
 * Chute assistido. Perto do gol e com a mira na direção dele, o jogador só escolhe o canto: o lado vem de onde a mira
 * cruza a linha do gol (esquerda ou direita da trave) e a altura da força (forte = ângulo, fraco = rasteiro). A direção
 * e a subida são recalculadas para a bola chegar ao canto, com imprecisão que cresce com a força e com a marcação.
 * Devolve null fora do alcance ou com a mira longe do gol (o chute sai como o jogador apontou).
 */
export function assistShot(p: FutPlayer, input: FutInput, power01: number, ball: Ball, field: Field, players: readonly FutPlayer[], rng: () => number): ShotAssist | null {
  const dir = attackDir(p.side);
  const gx = dir * field.halfL;
  const dx = gx - ball.x;
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
  let side = Math.sign(zc);
  if (Math.abs(zc) < field.goalHalfW * 0.2) {
    const keeper = players.find((q) => q.side !== p.side && q.role === "goleiro");
    side = keeper && Math.abs(keeper.z) > 0.1 ? -Math.sign(keeper.z) : rng() < 0.5 ? -1 : 1;
  }
  const targetZ = side * field.goalHalfW * FUT.assistCorner;

  let pressure = 0;
  for (const q of players) {
    if (q.side !== p.side && q.role === "linha" && !q.sentOff && q.downMs <= 0) {
      pressure = Math.max(pressure, 1 - Math.hypot(q.x - p.x, q.z - p.z) / FUT.assistPressureDist);
    }
  }
  const err = FUT.assistErr + FUT.assistErrPower * power01 + FUT.assistErrPressure * Math.max(0, pressure);
  const yaw = Math.atan2(gx - ball.x, targetZ - ball.z) + (rng() * 2 - 1) * err;

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
