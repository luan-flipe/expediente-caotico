import { FUT } from "./balance";
import { ballOut, kickBall } from "./ball";
import { advancedFreeMate, attackDir, keeperPassPower } from "./bots";
import { wallDistance } from "./assist";
import { activeOutfield } from "./fouls";
import { LOB_POWER } from "./goalkeeping";
import type { Ball, Field, FutMatch, FutPlayer, Restart, RestartKind, TeamSide } from "./types";

/** Distância mínima (m) dos outros jogadores ao ponto da cobrança. */
const KEEP_AWAY = 4;
/** Distância (m) dos adversários na falta (um pouco menos que a da barreira, que fica a wallDistance). */
const FREE_KICK_CLEAR = FUT.wallDist - 0.1;
/** Espaço (m) entre os jogadores da barreira. */
const WALL_GAP = 0.9;
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
  if (kind === "meta") {
    // o goleiro já começa com a bola nas mãos (a defesa antiga do chute não o impede) e cobra em 2 a 3,5 s
    m.beaten = null;
    m.ball.ownerId = taker.id;
    m.ball.prevTouch = m.ball.lastTouch;
    m.ball.lastTouch = { id: taker.id, side: taker.side };
    taker.holdMs = 0;
  }
  m.restart = { kind, side, x, z, takerId: taker.id, leftMs: FUT.restartWaitMs };
  if (kind === "falta") {
    m.restart.wall = buildWall(m, side, x, z);
  }
}

/** Quantos defensores formam a barreira, por número de jogadores de linha do time que defende. */
const WALL_SIZE = [0, 1, 1, 2, 2, 3];

/** Barreira da falta: bots do time que defende, em fila a wallDistance da bola, na linha bola-gol. Só há barreira com o gol ao alcance. */
function buildWall(m: FutMatch, taking: TeamSide, x: number, z: number): string[] {
  const f = m.field;
  const gx = attackDir(taking) * f.halfL;
  const dGoal = Math.hypot(gx - x, z);
  if (dGoal > FUT.assistRange) {
    return [];
  }
  const defenders = activeOutfield(m.players, taking === 0 ? 1 : 0);
  const size = WALL_SIZE[Math.min(defenders.length, WALL_SIZE.length - 1)];
  const wd = wallDistance(dGoal);
  const ux = (gx - x) / dGoal;
  const uz = -z / dGoal;
  const cx = x + ux * wd;
  const cz = z + uz * wd;
  const bots = defenders
    .filter((p) => p.isBot || !m.connected.has(p.id))
    .sort((a, b) => dist(a, { x: cx, z: cz }) - dist(b, { x: cx, z: cz }) || (a.id < b.id ? -1 : 1))
    .slice(0, size);
  bots.forEach((p, i) => {
    const off = (i - (bots.length - 1) / 2) * WALL_GAP;
    p.x = Math.max(-f.halfL, Math.min(f.halfL, cx - uz * off));
    p.z = Math.max(-f.halfW, Math.min(f.halfW, cz + ux * off));
    p.vx = 0;
    p.vz = 0;
    p.facing = Math.atan2(x - p.x, z - p.z);
  });
  return bots.map((p) => p.id);
}

/** true = este jogador não pode tocar na bola agora (há cobrança e ele não é o cobrador). */
export function restartBlocks(m: FutMatch, id: string): boolean {
  return m.restart !== null && m.restart.takerId !== id;
}

/** Distância (m) mínima do ponto da cobrança para este jogador: o cobrador não tem; na falta, os adversários ficam a 9 m
 *  (a barreira escolhida pela IA é exceção); nas demais, todos a 4 m. */
export function clearanceFor(r: Pick<Restart, "kind" | "side" | "takerId" | "wall">, p: { id: string; side: TeamSide }): number {
  if (p.id === r.takerId || r.wall?.includes(p.id)) {
    return 0;
  }
  return r.kind === "falta" && p.side !== r.side ? FREE_KICK_CLEAR : KEEP_AWAY;
}

/** Afasta (só a posição) o jogador que estiver mais perto do ponto da cobrança que a folga dele (ver clearanceFor).
 *  A predição do cliente usa a mesma regra para o próprio boneco. */
export function keepClear(p: { id: string; side: TeamSide; x: number; z: number }, r: Pick<Restart, "kind" | "side" | "takerId" | "wall" | "x" | "z">): void {
  const keep = clearanceFor(r, p);
  const d = dist(p, r);
  if (keep <= 0 || d >= keep) {
    return;
  }
  // Sobreposto ao ponto: empurra para o próprio lado do campo (time 0 = x negativo).
  const nx = d > 1e-6 ? (p.x - r.x) / d : p.side === 0 ? -1 : 1;
  const nz = d > 1e-6 ? (p.z - r.z) / d : 0;
  p.x = r.x + nx * keep;
  p.z = r.z + nz * keep;
}

/** Afasta (só a posição) quem estiver perto demais do ponto da cobrança. */
export function pushAway(m: FutMatch): void {
  const r = m.restart;
  if (!r) {
    return;
  }
  for (const p of m.players) {
    keepClear(p, r);
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
  const keeperTake = taker.role === "goleiro";
  // o goleiro procura o atacante mais avançado e livre (lançamento se estiver longe); sem ninguém, lança ao meio
  const mate = keeperTake ? advancedFreeMate(m.players, taker) : freestMate(m, taker);
  // saída sem companheiro: recua para o goleiro em vez de entregar a bola ao adversário
  const gk = !mate && r.kind === "saida" ? m.players.find((p) => p.side === taker.side && p.role === "goleiro") : undefined;
  const tx = mate ? mate.x : gk ? gk.x : keeperTake ? 0 : taker.side === 0 ? m.field.halfL : -m.field.halfL;
  const tz = mate ? mate.z : gk ? gk.z : 0;
  const yaw = Math.atan2(tx - m.ball.x, tz - m.ball.z);
  taker.facing = yaw;
  const power = keeperTake ? keeperPassPower(Math.hypot(tx - m.ball.x, tz - m.ball.z)) : gk ? Math.min(AI_PASS_POWER, 0.5) : AI_PASS_POWER;
  kickBall(m.ball, yaw, power, "pass", keeperTake && power >= LOB_POWER ? { lob: FUT.lobRatio } : {});
  m.ball.prevTouch = m.ball.lastTouch;
  m.ball.lastTouch = { id: taker.id, side: taker.side };
}
