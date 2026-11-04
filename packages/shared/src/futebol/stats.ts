import { FUT } from "./balance";
import { attackDir } from "./bots";
import type { TouchEvent } from "./touch";
import type { FutMatch, FutPlayer, TeamSide } from "./types";

/** Chute só conta como chute (ao gol ou para fora) acima desta velocidade (m/s) e mirando a até esta folga (m) da trave. */
const SHOT_MIN_SPEED = 9;
const SHOT_SLACK = 3;
/** Bola de adversário a pelo menos esta velocidade (m/s) parada pelo goleiro é defesa. */
export const SAVE_MIN_SPEED = 8;
/** Bola que sai pela linha de fundo a esta distância (m) da trave (ou do travessão) foi "quase"; bem colada é trave. */
const NEAR_GAP = 1.5;
const POST_GAP = 0.45;

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Para onde a bola recém-chutada vai: z em que cruza a linha do gol e se acerta o alvo. null = não é chute ao gol. */
export function shotOf(m: FutMatch, kicker: FutPlayer): { onTarget: boolean; z: number } | null {
  const b = m.ball;
  const f = m.field;
  const dir = attackDir(kicker.side);
  const speed = Math.hypot(b.vx, b.vz);
  const gx = dir * f.halfL;
  if (speed < SHOT_MIN_SPEED || b.vx * dir < 5 || (gx - b.x) * dir < 0.5 || (gx - b.x) * dir > FUT.assistRange) {
    return null;
  }
  const t = (gx - b.x) / b.vx;
  const z = b.z + b.vz * t;
  // a bola que cairia abaixo do chão quica: vale a altura do gramado
  const y = Math.max(FUT.ballRadius, b.y + b.vy * t - 0.5 * FUT.gravity * t * t);
  if (Math.abs(z) > f.goalHalfW + SHOT_SLACK) {
    return null;
  }
  return { onTarget: Math.abs(z) < f.goalHalfW && y < f.goalH, z };
}

/** Toques do tick viram eventos (som e narração) e, no jogo normal (count), as estatísticas de passes e chutes. */
export function recordKicks(m: FutMatch, events: readonly TouchEvent[], count = true): void {
  for (const ev of events) {
    if ((ev.t !== "kick" && ev.t !== "pass") || !ev.ok) {
      continue;
    }
    const p = m.players.find((q) => q.id === ev.id);
    if (!p) {
      continue;
    }
    const info = m.info.get(p.id);
    m.events.push({ type: "kick", id: p.id, kind: ev.t, power: r2(Math.hypot(m.ball.vx, m.ball.vz)) });
    if (p.role !== "linha") {
      continue;
    }
    if (ev.t === "pass") {
      if (count && info) {
        info.passes++;
      }
      continue;
    }
    const shot = shotOf(m, p);
    if (shot) {
      m.events.push({ type: "shot", id: p.id, side: p.side, onTarget: shot.onTarget, z: r2(shot.z) });
      if (count && info) {
        info.shots++;
        if (shot.onTarget) {
          info.shotsOn++;
        }
      }
    }
  }
}

/** Posse de bola em ms por time (a bola solta não conta para ninguém). */
export function recordPossession(m: FutMatch, dtMs: number): void {
  const owner = m.ball.ownerId === null ? undefined : m.players.find((p) => p.id === m.ball.ownerId);
  if (owner) {
    m.possMs[owner.side] += dtMs;
  }
}

/** Bola que sai pela linha de fundo rente ao gol: "quase" (e "trave" quando encosta). Aproximação: a sim não tem física de trave. */
export function nearMiss(m: FutMatch, defending: TeamSide): void {
  const b = m.ball;
  const lt = b.lastTouch;
  if (!lt || lt.side === defending || Math.abs(b.vx) < SHOT_MIN_SPEED) {
    return;
  }
  const f = m.field;
  const gapZ = Math.max(0, Math.abs(b.z) - f.goalHalfW);
  const gapY = Math.abs(b.z) < f.goalHalfW ? Math.max(0, b.y - f.goalH) : 0;
  const gap = Math.hypot(gapZ, gapY);
  if (gap <= NEAR_GAP) {
    m.events.push({ type: "near", side: lt.side, post: gap <= POST_GAP });
  }
}
