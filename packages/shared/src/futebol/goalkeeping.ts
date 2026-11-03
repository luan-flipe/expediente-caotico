import type { BotLevel } from "../botLevels";
import { FUT } from "./balance";
import { kickBall } from "./ball";
import { attackDir } from "./bots";
import { keeperReach } from "./keeper";
import type { TouchEvent } from "./touch";
import type { Ball, FutInput, FutMatch, FutPlayer } from "./types";

/** Até esta velocidade (m/s) o goleiro segura a bola; acima disso só desvia. */
const CATCH_SPEED = 13;
/** Distância (m) da bola às mãos, à frente do goleiro. */
const HAND = 0.5;
/** Bola solta que se afasta do último toque do goleiro mais rápido que isso não é retomada (m/s). */
const AWAY_EPS = 0.5;

/** Passe do goleiro com força a partir daqui (0..1) vira lançamento alto. */
export const LOB_POWER = 0.3;

/** Acima desta velocidade (m/s) a bola é chute e o goleiro pode não chegar a tempo. */
const SHOT_SPEED = 12;
/** Chance base de o goleiro alcançar o chute (por nível) e quanto ela cai por m/s acima de SHOT_SPEED. */
const SAVE_BASE: Record<BotLevel, number> = { easy: 0.6, normal: 0.85, hard: 0.92 };
const SAVE_DROP = 0.007;
const saveChance = (level: BotLevel, speed: number): number => SAVE_BASE[level] - (speed - SHOT_SPEED) * SAVE_DROP;

/** Registra o toque como o último (e o anterior vira prevTouch). */
export function touchBall(ball: Ball, p: FutPlayer): void {
  if (ball.lastTouch?.id === p.id) {
    return;
  }
  ball.prevTouch = ball.lastTouch;
  ball.lastTouch = { id: p.id, side: p.side };
}

/** Defesa do goleiro: bola solta a até keeperReach e abaixo da trave vira posse (lenta) ou desvio (forte). */
export function keeperSave(m: FutMatch, k: FutPlayer): void {
  const b = m.ball;
  if (b.y > m.field.goalH) {
    return;
  }
  if (b.ownerId !== null) {
    // Atacante conduzindo a bola ao alcance do goleiro: ele sai e toma.
    const owner = m.players.find((p) => p.id === b.ownerId);
    if (owner && owner.role === "linha" && owner.side !== k.side && Math.hypot(b.x - k.x, b.z - k.z) <= keeperReach(m.botLevel)) {
      touchBall(b, k);
      b.ownerId = k.id;
      b.vx = 0;
      b.vz = 0;
    }
    return;
  }
  const speed = Math.hypot(b.vx, b.vy, b.vz);
  if (b.lastTouch?.id === k.id && speed > AWAY_EPS) {
    return;
  }
  if (Math.hypot(b.x - k.x, b.z - k.z) > keeperReach(m.botLevel)) {
    return;
  }
  if (b.lastTouch !== null && m.beaten === b.lastTouch) {
    return;
  }
  if (speed > SHOT_SPEED && m.rng() >= saveChance(m.botLevel, speed)) {
    // Chute que o goleiro não alcança: a bola passa por ele (uma só chance por chute).
    m.beaten = b.lastTouch;
    return;
  }
  touchBall(b, k);
  if (speed <= CATCH_SPEED) {
    b.ownerId = k.id;
    b.vx = 0;
    b.vy = 0;
    b.vz = 0;
    return;
  }
  b.vx = attackDir(k.side) * Math.max(5, Math.abs(b.vx) * 0.5);
  b.vz = b.vz * 0.5 + (m.rng() - 0.5) * 6;
  b.vy = Math.max(b.vy, 0) + 2;
}

/** Mantém a bola nas mãos do goleiro que a segura. */
export function holdBall(m: FutMatch, k: FutPlayer): void {
  const b = m.ball;
  b.x = k.x + attackDir(k.side) * HAND;
  b.z = k.z;
  b.y = FUT.ballRadius;
  b.vx = 0;
  b.vy = 0;
  b.vz = 0;
}

/** Passe/chute do goleiro que segura a bola: carrega por chargeMs e solta (como no jogador de linha). */
export function keeperKick(m: FutMatch, k: FutPlayer, input: FutInput, dtMs: number): TouchEvent | null {
  const kind: "kick" | "pass" | null = input.kick !== "none" ? "kick" : input.pass !== "none" ? "pass" : null;
  if (kind === null) {
    k.chargeMs = 0;
    k.chargeKind = null;
    return null;
  }
  if ((kind === "kick" ? input.kick : input.pass) === "charge") {
    if (k.chargeKind !== kind) {
      k.chargeKind = kind;
      k.chargeMs = 0;
    }
    k.chargeMs = Math.min(FUT.chargeMaxMs, k.chargeMs + dtMs);
    return null;
  }
  const power01 = k.chargeKind === kind ? Math.min(1, k.chargeMs / FUT.chargeMaxMs) : 0;
  k.chargeMs = 0;
  k.chargeKind = null;
  touchBall(m.ball, k);
  // passe forte do goleiro é lançamento: sobe (a IA só carrega assim para alvos longe)
  kickBall(m.ball, input.aim, power01, kind, kind === "pass" && power01 >= LOB_POWER ? { lob: FUT.lobRatio } : {});
  return { t: kind, id: k.id, ok: true };
}
