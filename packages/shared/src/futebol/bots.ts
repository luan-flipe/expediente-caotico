import type { BotLevel } from "../botLevels";
import { FUT } from "./balance";
import { activeOutfield } from "./fouls";
import type { FutInput, FutMatch, FutPlayer, TeamSide } from "./types";

/** Parâmetros por nível: erro de mira (rad), chance por tick de tentar a disputa e
 *  distância (m) em que um adversário passa a "marcar" quem tem a bola. */
const BOT: Record<BotLevel, { aimNoise: number; stealChance: number; markDist: number }> = {
  easy: { aimNoise: 0.35, stealChance: 0.05, markDist: 1.8 },
  normal: { aimNoise: 0.2, stealChance: 0.12, markDist: 2.4 },
  hard: { aimNoise: 0.04, stealChance: 0.25, markDist: 3 },
};

/** Alvo do chute dentro do gol, como fração da meia-largura (longe do goleiro). */
const SHOT_TARGET = 0.75;
/** Força do chute (0..1). */
const SHOT_POWER = 0.7;
/** Alcance do chute dos bots, em comprimentos de área (só chutam com o gol perto o bastante). */
const SHOOT_RANGE = 2.2;
/** Força do toque de uma cobrança sem companheiro à vista. */
const RESTART_POWER = 0.4;
/** Acima dessa distância (m) da bola o bot corre. */
const SPRINT_FROM = 2.5;
/** Acima dessa distância (m) do ponto de formação o bot corre. */
const SPRINT_HOME = 6;
/** Quanto a posição de formação acompanha a bola em x. */
const BALL_FOLLOW = 0.35;
/** Recuo mínimo do ponto de formação à linha de fundo (m). */
const HOME_MARGIN = 2;
/** Margem (m) fora da área do goleiro que os adversários respeitam enquanto ele segura a bola. */
const KEEPER_BOX_PAD = 1.5;
/** Quanto o apoio de quem tem o goleiro com a bola oscila (m) e a que ritmo (ms). */
const SUPPORT_SWAY = 2;
const SUPPORT_MS = 900;
const NEUTRAL = (): number => 0.5;

const IDLE: FutInput = { mx: 0, mz: 0, aim: 0, sprint: false, kick: "none", pass: "none" };

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Direção de ataque em x: time 0 ataca +x, time 1 ataca -x. */
export const attackDir = (side: TeamSide): 1 | -1 => (side === 0 ? 1 : -1);

/** Ângulo (0 = +z) de um ponto até o alvo. */
export const aimTo = (from: { x: number; z: number }, to: { x: number; z: number }): number =>
  Math.atan2(to.x - from.x, to.z - from.z);

/** Força (0..1) do passe para a bola rolar `d` metros (com o atrito do chão). */
export function passPowerFor(d: number): number {
  const speed = d * 0.5;
  return Math.min(1, Math.max(0, (speed - FUT.passMin) / (FUT.passMax - FUT.passMin)));
}

/** Companheiro de linha ativo cujo adversário mais próximo está mais longe. */
export function freestMate(players: readonly FutPlayer[], taker: FutPlayer): FutPlayer | null {
  const rivals = players.filter((p) => p.side !== taker.side && !p.sentOff);
  let best: FutPlayer | null = null;
  let bestGap = -Infinity;
  for (const p of activeOutfield(players as FutPlayer[], taker.side)) {
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

/** Duas fases do chute/passe: carrega até a força desejada (lida em chargeMs) e então solta. */
export function chargeThenRelease(p: FutPlayer, kind: "kick" | "pass", power01: number, base: FutInput): FutInput {
  const ready = p.chargeKind === kind && p.chargeMs >= power01 * FUT.chargeMaxMs;
  return { ...base, [kind]: ready ? "release" : "charge" };
}

/** Jogador de linha do time mais perto da bola (empate: menor id). */
function nearestToBall(m: FutMatch, side: TeamSide): FutPlayer | null {
  let best: FutPlayer | null = null;
  let bestD = Infinity;
  for (const q of activeOutfield(m.players, side)) {
    if (q.downMs > 0) {
      continue;
    }
    const d = dist(q, m.ball);
    if (d < bestD || (d === bestD && best !== null && q.id < best.id)) {
      best = q;
      bestD = d;
    }
  }
  return best;
}

/** Ponto de formação: jogadores abertos em z, metade mais recuada, acompanhando a bola. */
function formationSpot(p: FutPlayer, m: FutMatch): { x: number; z: number } {
  const f = m.field;
  const ids = activeOutfield(m.players, p.side)
    .map((q) => q.id)
    .sort();
  const n = ids.length;
  const k = Math.max(0, ids.indexOf(p.id));
  const z = n === 1 ? 0 : (((k + 0.5) / n) * 2 - 1) * f.halfW * 0.6;
  const depth = n === 1 ? -0.1 : k % 2 === 0 ? -0.35 : 0.1;
  const x = attackDir(p.side) * f.halfL * depth + m.ball.x * BALL_FOLLOW;
  const lim = f.halfL - HOME_MARGIN;
  return { x: Math.max(-lim, Math.min(lim, x)), z };
}

function moveTo(p: FutPlayer, to: { x: number; z: number }, sprint: boolean): FutInput {
  const d = dist(p, to);
  if (d < 0.3) {
    return { ...IDLE, aim: p.facing };
  }
  return { ...IDLE, mx: (to.x - p.x) / d, mz: (to.z - p.z) / d, aim: aimTo(p, to), sprint };
}

/** Goleiro (de qualquer time) com a bola nas mãos, ou null. */
function keeperHolding(m: FutMatch): FutPlayer | null {
  const o = m.ball.ownerId === null ? undefined : m.players.find((q) => q.id === m.ball.ownerId);
  return o && o.role === "goleiro" ? o : null;
}

/** Empurra o ponto para fora da área do goleiro que segura a bola. */
function outsideBox(spot: { x: number; z: number }, gk: FutPlayer, f: FutMatch["field"]): { x: number; z: number } {
  const dir = -attackDir(gk.side);
  const gx = dir * f.halfL;
  const lim = f.boxL + KEEPER_BOX_PAD;
  if (Math.abs(spot.x - gx) < lim && Math.abs(spot.z) < f.boxHalfW + KEEPER_BOX_PAD) {
    return { x: gx - dir * lim, z: spot.z };
  }
  return spot;
}

/** Adversário do goleiro com a bola: cobre um receptor por trás (sem cortar o passe), fora da área. */
function markReceiver(p: FutPlayer, m: FutMatch, gk: FutPlayer): FutInput {
  const mates = activeOutfield(m.players, gk.side);
  const rivals = activeOutfield(m.players, p.side).map((q) => q.id).sort();
  const mate = mates.length ? mates[Math.max(0, rivals.indexOf(p.id)) % mates.length] : undefined;
  const toward = attackDir(p.side);
  const spot = mate ? { x: mate.x - toward * 3, z: mate.z } : formationSpot(p, m);
  const to = outsideBox(spot, gk, m.field);
  return moveTo(p, to, dist(p, to) > SPRINT_HOME);
}

/** Apoio de quem tem o goleiro com a bola: um recua curto, outros abrem pelas laterais e pelo meio, sempre se mexendo. */
function supportSpot(p: FutPlayer, m: FutMatch, gk: FutPlayer): { x: number; z: number } {
  const f = m.field;
  const dir = attackDir(p.side);
  const ids = activeOutfield(m.players, p.side)
    .map((q) => q.id)
    .sort();
  const n = ids.length;
  const k = Math.max(0, ids.indexOf(p.id));
  const t = m.now / SUPPORT_MS + k * 2;
  const gx = -dir * f.halfL;
  // k 0 recua para receber curto, depois alternam laterais e meio
  const slots: [number, number][] = [
    [gx + dir * (f.boxL + 4), 0],
    [gx + dir * f.halfL * 0.7, -f.halfW * 0.7],
    [gx + dir * f.halfL * 0.7, f.halfW * 0.7],
    [gx + dir * f.halfL * 1, 0],
  ];
  const [sx, sz] = n === 1 ? [gx + dir * f.halfL * 0.7, gk.z >= 0 ? -f.halfW * 0.6 : f.halfW * 0.6] : slots[k % slots.length];
  const lim = f.halfW - 1;
  return {
    x: Math.max(-f.halfL + 2, Math.min(f.halfL - 2, sx + Math.cos(t) * SUPPORT_SWAY)),
    z: Math.max(-lim, Math.min(lim, sz + Math.sin(t) * SUPPORT_SWAY)),
  };
}

/** Intenção do bot de linha, como se fosse um humano (chuta e passa em duas fases). */
export function botInput(p: FutPlayer, m: FutMatch, level: BotLevel): FutInput {
  if (p.sentOff || p.downMs > 0 || p.role !== "linha") {
    return { ...IDLE, aim: p.facing };
  }
  const par = BOT[level];
  const rng = m.rng ?? NEUTRAL;
  const f = m.field;
  const b = m.ball;
  const goal = { x: attackDir(p.side) * f.halfL, z: 0 };
  const taker = m.restart?.takerId === p.id;

  if (m.restart && !taker) {
    return { ...IDLE, aim: p.facing };
  }

  const holder = keeperHolding(m);
  if (holder && b.ownerId !== p.id && !taker) {
    if (holder.side !== p.side) {
      return markReceiver(p, m, holder);
    }
    const spot = supportSpot(p, m, holder);
    return moveTo(p, spot, dist(p, spot) > SPRINT_HOME);
  }

  if (b.ownerId === p.id || taker) {
    const faceGoal = aimTo(p, goal);
    const walk = { ...IDLE, mx: Math.sin(faceGoal), mz: Math.cos(faceGoal) };
    const inBox = Math.abs(p.x - goal.x) <= f.boxL * SHOOT_RANGE && Math.abs(p.z) <= f.boxHalfW;
    const marked = m.players.some((q) => q.side !== p.side && q.role === "linha" && !q.sentOff && dist(q, p) <= par.markDist);
    const mate = freestMate(m.players, p);

    // Quem já começou a carregar segue até soltar (a decisão não oscila a cada tick).
    if (inBox && p.chargeKind !== "pass") {
      const keeper = m.players.find((q) => q.side !== p.side && q.role === "goleiro");
      const dodge = keeper && Math.abs(keeper.z) > 0.2 ? -Math.sign(keeper.z) : rng() < 0.5 ? -1 : 1;
      const ready = p.chargeKind === "kick" && p.chargeMs >= SHOT_POWER * FUT.chargeMaxMs;
      const noise = ready ? (rng() * 2 - 1) * par.aimNoise : 0;
      const aim = aimTo(p, { x: goal.x, z: dodge * f.goalHalfW * SHOT_TARGET }) + noise;
      return chargeThenRelease(p, "kick", SHOT_POWER, { ...walk, aim });
    }
    if (mate && (p.chargeKind === "pass" || marked)) {
      return chargeThenRelease(p, "pass", passPowerFor(dist(p, mate)), { ...walk, aim: aimTo(p, mate) });
    }
    if (taker) {
      // Cobrança sem companheiro à vista: toca para o gol adversário.
      return chargeThenRelease(p, "pass", RESTART_POWER, { ...IDLE, aim: faceGoal });
    }
    return { ...walk, aim: faceGoal };
  }

  const owner = b.ownerId === null ? undefined : m.players.find((q) => q.id === b.ownerId);
  if (owner?.side !== p.side && nearestToBall(m, p.side)?.id === p.id) {
    const d = dist(p, b);
    const inReach = owner !== undefined && d <= FUT.controlRadius * 0.9;
    // a disputa é carregar e soltar o passe (o servidor só aceita release com carga); quem já carregou solta no tick seguinte
    const pass = inReach && (p.chargeKind === "pass" || rng() < par.stealChance) ? (p.chargeKind === "pass" ? "release" : "charge") : "none";
    return { ...moveTo(p, b, d > SPRINT_FROM), pass };
  }
  const spot = formationSpot(p, m);
  return moveTo(p, spot, dist(p, spot) > SPRINT_HOME);
}
