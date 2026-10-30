import { FUT } from "./balance";
import { ballOut, kickBall } from "./ball";
import { activeOutfield } from "./fouls";
import type { Ball, Field, FutMatch, FutPlayer, RestartKind, TeamSide } from "./types";

/** Distância mínima (m) dos outros jogadores ao ponto da cobrança. */
const KEEP_AWAY = 4;
/** Potência (0..1) do passe da IA na cobrança. */
const AI_PASS_POWER = 0.4;
/** Recuo do ponto do tiro de meta em relação à linha de fundo (m). */
const GOAL_KICK_INSET = 1;

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Traduz a saída da bola em cobrança (null se não saiu ou foi gol).
 *  Lateral: cobra o time que NÃO tocou por último. Fundo: defensor tocou por
 *  último = escanteio do adversário; atacante tocou por último = tiro de meta. */
export function restartForOut(
  b: Ball,
  f: Field,
): { kind: "lateral" | "escanteio" | "meta"; side: TeamSide; x: number; z: number } | null {
  const out = ballOut(b, f);
  if (!out || out.kind === "gol") {
    return null;
  }
  const last = b.lastTouch?.side;
  if (out.kind === "lateral") {
    const side: TeamSide = last === undefined ? out.side : last === 0 ? 1 : 0;
    const x = Math.max(-f.halfL, Math.min(f.halfL, b.x));
    return { kind: "lateral", side, x, z: b.z > 0 ? f.halfW : -f.halfW };
  }
  const goalX = b.x > 0 ? f.halfL : -f.halfL;
  if (last === out.side) {
    const other: TeamSide = out.side === 0 ? 1 : 0;
    return { kind: "escanteio", side: other, x: goalX, z: b.z >= 0 ? f.halfW : -f.halfW };
  }
  return { kind: "meta", side: out.side, x: goalX - Math.sign(goalX) * GOAL_KICK_INSET, z: 0 };
}

/** Escolhe o cobrador, põe a bola parada no ponto e abre a espera de 8 s.
 *  Tiro de meta é sempre do goleiro; as demais são do jogador de linha mais perto. */
export function startRestart(m: FutMatch, kind: RestartKind, side: TeamSide, x: number, z: number): void {
  const keeper = m.players.find((p) => p.side === side && p.role === "goleiro");
  let taker: FutPlayer | undefined;
  if (kind === "meta") {
    taker = keeper;
  } else {
    let best = Infinity;
    for (const p of activeOutfield(m.players, side)) {
      const d = dist(p, { x, z });
      if (d < best) {
        best = d;
        taker = p;
      }
    }
    taker ??= keeper;
  }
  if (!taker) {
    m.restart = null;
    return;
  }
  taker.x = x;
  taker.z = z;
  taker.vx = 0;
  taker.vz = 0;
  m.ball.x = x;
  m.ball.z = z;
  m.ball.y = FUT.ballRadius;
  m.ball.vx = 0;
  m.ball.vy = 0;
  m.ball.vz = 0;
  m.ball.ownerId = null;
  m.restart = { kind, side, x, z, takerId: taker.id, leftMs: FUT.restartWaitMs };
}

/** true = este jogador não pode tocar na bola agora (há cobrança e ele não é o cobrador). */
export function restartBlocks(m: FutMatch, id: string): boolean {
  return m.restart !== null && m.restart.takerId !== id;
}

/** Afasta (só a posição) quem estiver a menos de 4 m do ponto, exceto o cobrador. */
export function pushAway(m: FutMatch): void {
  const r = m.restart;
  if (!r) {
    return;
  }
  for (const p of m.players) {
    if (p.id === r.takerId) {
      continue;
    }
    const d = dist(p, r);
    if (d >= KEEP_AWAY) {
      continue;
    }
    // Sobreposto ao ponto: empurra para o próprio lado do campo (time 0 = x negativo).
    const nx = d > 1e-6 ? (p.x - r.x) / d : p.side === 0 ? -1 : 1;
    const nz = d > 1e-6 ? (p.z - r.z) / d : 0;
    p.x = r.x + nx * KEEP_AWAY;
    p.z = r.z + nz * KEEP_AWAY;
  }
}

/** Companheiro de linha não expulso cuja distância ao adversário mais perto é a maior. */
function freestMate(m: FutMatch, taker: FutPlayer): FutPlayer | null {
  const rivals = m.players.filter((p) => p.side !== taker.side && !p.sentOff);
  let best: FutPlayer | null = null;
  let bestGap = -Infinity;
  for (const p of activeOutfield(m.players, taker.side)) {
    if (p.id === taker.id) {
      continue;
    }
    let gap = Infinity;
    for (const r of rivals) {
      gap = Math.min(gap, dist(p, r));
    }
    if (gap > bestGap) {
      bestGap = gap;
      best = p;
    }
  }
  return best;
}

/** Decrementa a espera; em 0 a IA cobra com passe para o companheiro mais livre
 *  (ou para o gol adversário se não houver ninguém). Cobrador desconectado não pausa. */
export function stepRestart(m: FutMatch, dtMs: number): void {
  const r = m.restart;
  if (!r) {
    return;
  }
  pushAway(m);
  r.leftMs = Math.max(0, r.leftMs - dtMs);
  if (r.leftMs > 0) {
    return;
  }
  const taker = m.players.find((p) => p.id === r.takerId);
  m.restart = null;
  if (!taker) {
    return;
  }
  const mate = freestMate(m, taker);
  const tx = mate ? mate.x : taker.side === 0 ? m.field.halfL : -m.field.halfL;
  const tz = mate ? mate.z : 0;
  const yaw = Math.atan2(tx - m.ball.x, tz - m.ball.z);
  taker.facing = yaw;
  kickBall(m.ball, yaw, AI_PASS_POWER, "pass");
  m.ball.prevTouch = m.ball.lastTouch;
  m.ball.lastTouch = { id: taker.id, side: taker.side };
}
