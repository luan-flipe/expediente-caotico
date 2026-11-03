import type { BotLevel } from "../botLevels";
import { FUT } from "./balance";
import { advancedFreeMate, aimTo, attackDir, chargeThenRelease, FREE_GAP, keeperPassPower } from "./bots";
import type { Ball, Field, FutInput, FutPlayer } from "./types";

/** Por nível: alcance (m) para pegar a bola e reação (ms). */
const KEEPER: Record<BotLevel, { reach: number; reactMs: number }> = {
  easy: { reach: 0.8, reactMs: 350 },
  normal: { reach: 1.1, reactMs: 220 },
  hard: { reach: 1.4, reactMs: 140 },
};

/** Alcance (m) do goleiro para pegar ou desviar a bola (o motor da partida usa o mesmo). */
export function keeperReach(level: BotLevel): number {
  return KEEPER[level].reach;
}

/** Profundidade à frente da linha do gol: fração da distância à bola, entre os limites (m). */
const DEPTH_FRAC = 0.12;
const DEPTH_MIN = 1;
const DEPTH_MAX = 2.8;
/** Janela de percepção (s) menos a reação do nível: antes dela o goleiro só acompanha a bola. */
const SIGHT_S = 0.62;
/** Folga (m) além das traves que ainda conta como chute no gol. */
const POST_SLACK = 0.5;
/** Bola solta mais lenta que isso (m/s) dentro da área: o goleiro sai para pegar. */
const RUSH_MAX_SPEED = 6;
/** Velocidade (m/s) usada para estimar o tempo até o ponto de defesa. */
const RUN_SPEED = 6.5;
/** Com a bola nas mãos: tempo mínimo (ms) antes de soltar, e limite para soltar de qualquer jeito. */
const HOLD_MIN_MS = 2000;
const HOLD_MAX_MS = 3500;
/** Folga (m) do goleiro dentro da área e distância mínima (m) do adversário para um companheiro estar livre. */
const BOX_PAD = 0.8;
/** Balanço do goleiro com a bola: período (ms) e amplitude (m) em z, e recuo (m) da linha do gol em x. */
const SWAY_MS = 650;
const SWAY_Z = 1.4;
const SWAY_X = 0.5;

const IDLE: FutInput = { mx: 0, mz: 0, aim: 0, sprint: false, kick: "none", pass: "none" };

function moveTo(k: FutPlayer, x: number, z: number, sprint: boolean, aim: number): FutInput {
  const d = Math.hypot(x - k.x, z - k.z);
  if (d < 0.15) {
    return { ...IDLE, aim };
  }
  return { ...IDLE, mx: (x - k.x) / d, mz: (z - k.z) / d, aim, sprint };
}

/** Com a bola nas mãos: anda dentro da área procurando ângulo e solta o passe (longo se ninguém está livre) em 2 a 3,5 s. */
function holdingInput(k: FutPlayer, f: Field, players: readonly FutPlayer[]): FutInput {
  const dir = attackDir(k.side);
  const gx = -dir * f.halfL;
  const held = k.holdMs ?? 0;
  const mate = advancedFreeMate(players, k);
  let gap = 0;
  if (mate) {
    gap = Infinity;
    for (const r of players) {
      if (r.side !== k.side && !r.sentOff) {
        gap = Math.min(gap, Math.hypot(r.x - mate.x, r.z - mate.z));
      }
    }
  }
  const target = mate ?? { x: 0, z: 0 };
  const zLim = f.boxHalfW - BOX_PAD;
  const wantZ = (mate ? mate.z * 0.4 : 0) + Math.sin(held / SWAY_MS) * SWAY_Z;
  const px = gx + dir * (Math.min(f.boxL - BOX_PAD, 1.6) + Math.cos(held / SWAY_MS) * SWAY_X);
  const pz = Math.max(-zLim, Math.min(zLim, wantZ));
  const base = moveTo(k, px, pz, false, aimTo(k, target));
  const free = mate !== null && gap >= FREE_GAP;
  // o alvo é o atacante mais avançado e livre; sem ninguém livre, o mais livre (ou o meio do campo). Longe, o passe é lançamento alto
  const releasing = k.chargeKind !== null || held >= HOLD_MAX_MS || (held >= HOLD_MIN_MS && free);
  if (!releasing) {
    return base;
  }
  return chargeThenRelease(k, "pass", keeperPassPower(Math.hypot(target.x - k.x, target.z - k.z)), base);
}

/** Intenção do goleiro da IA (nunca é humano). `players` só serve para escolher o passe. */
export function keeperInput(
  k: FutPlayer,
  ball: Ball,
  f: Field,
  level: BotLevel,
  players: readonly FutPlayer[] = [],
): FutInput {
  if (k.downMs > 0) {
    return { ...IDLE, aim: k.facing };
  }
  const par = KEEPER[level];
  const dir = attackDir(k.side);
  const gx = -dir * f.halfL;
  const toBall = aimTo(k, ball);

  if (ball.ownerId === k.id) {
    return holdingInput(k, f, players);
  }

  // Chute no gol: a bola vem para a linha de fundo e cruza entre as traves.
  if (ball.ownerId === null && ball.vx * -dir > 0.5) {
    const t = Math.abs(gx - ball.x) / Math.abs(ball.vx);
    const zGoal = ball.z + ball.vz * t;
    const yGoal = ball.y + ball.vy * t - 0.5 * FUT.gravity * t * t;
    if (Math.abs(zGoal) <= f.goalHalfW + POST_SLACK && yGoal <= f.goalH + par.reach) {
      // Defende no plano em que o goleiro está agora; só se compromete quando a janela abre.
      const tp = Math.max(0, (k.x - ball.x) / ball.vx);
      const zAim = Math.max(-f.goalHalfW - 0.3, Math.min(f.goalHalfW + 0.3, ball.z + ball.vz * tp));
      const need = Math.abs(zAim - k.z) / RUN_SPEED + 0.05;
      if (tp <= need + SIGHT_S - par.reactMs / 1000) {
        return moveTo(k, k.x, zAim, true, toBall);
      }
    }
  }

  // Bola solta e lenta na área: sai do gol para pegar.
  const inBox = Math.abs(ball.x - gx) <= f.boxL && Math.abs(ball.z) <= f.boxHalfW;
  if (inBox && ball.ownerId === null && Math.hypot(ball.vx, ball.vz) <= RUSH_MAX_SPEED) {
    return moveTo(k, ball.x, ball.z, true, toBall);
  }

  // Posição: na reta entre o centro do gol e a bola.
  const dx = ball.x - gx;
  const d = Math.hypot(dx, ball.z);
  const depth = Math.min(DEPTH_MAX, Math.max(DEPTH_MIN, d * DEPTH_FRAC));
  const px = d > 1e-6 ? gx + (dx / d) * depth : gx + dir * depth;
  const pz = d > 1e-6 ? (ball.z / d) * depth : 0;
  return moveTo(k, px, pz, false, toBall);
}
