import type { RoomOptions } from "../botLevels";
import { mulberry32 } from "../rng";
import type { Vec2 } from "../types";
import { createBotBrain, stepSuspeitoBot, type SuspeitoBotBrain } from "./bot";
import { MAP_BOUNDS, sectorAt, SUSPEITO_SPAWNS, TASK_STATIONS } from "./map";
import { createMeeting, registerVote, tallyVotes } from "./meeting";
import { startSabotage, stepSabotage } from "./sabotage";
import { createConexoChallenge, validateConexoSelection, type ConexoChallenge } from "./tasks/conexo";
import { applyContextoGuess, createContextoChallenge, type ContextoChallenge } from "./tasks/contexto";
import { advanceQuickTask, createQuickTaskChallenge, type QuickTaskChallenge } from "./tasks/quickTasks";
import { applyTermoGuess, createTermoChallenge, type TermoChallenge } from "./tasks/termo";
import type {
  SuspeitoBody,
  SuspeitoMeetingState,
  SuspeitoPhase,
  SuspeitoPlayerInfo,
  SuspeitoPrivate,
  SuspeitoResultRow,
  SuspeitoResults,
  SuspeitoRole,
  SuspeitoSabotageState,
  SuspeitoSabotageType,
  SuspeitoSectorId,
  SuspeitoSnapshot,
  SuspeitoTask,
  SuspeitoTaskState,
  SuspeitoVictoryReason,
} from "./types";
import type { Award } from "../awards";

export interface SuspeitoPlayerSim {
  id: string;
  name: string;
  avatar: any;
  isBot: boolean;
  role: SuspeitoRole;
  alive: boolean;
  pos: Vec2;
  yaw: number;
  moving: boolean;
  sector: SuspeitoSectorId;
  tasks: SuspeitoTask[];
  killCooldownMs: number;
  sabotageCooldownMs: number;
  emergencyMeetingsRemaining: number;
  voted: boolean;
  voteTarget: string | null;
  input: { mx: number; mz: number; yaw: number };
  brain?: SuspeitoBotBrain;
  stats: {
    tasksDone: number;
    kills: number;
    votesReceived: number;
    correctVotes: number;
  };
}

export type ActiveChallenge =
  | { type: "termo"; challenge: TermoChallenge }
  | { type: "conexo"; challenge: ConexoChallenge }
  | { type: "contexto"; challenge: ContextoChallenge }
  | { type: "quick"; challenge: QuickTaskChallenge };

export interface SuspeitoMatch {
  seed: number;
  tick: number;
  phase: SuspeitoPhase;
  phaseRemainingMs: number;
  players: Map<string, SuspeitoPlayerSim>;
  activeChallenges: Map<string, { taskId: string; challenge: ActiveChallenge }>;
  bodies: SuspeitoBody[];
  sabotage: SuspeitoSabotageState | null;
  sabotageGlobalCooldownMs: number;
  emergencyCooldownMs: number;
  meeting: SuspeitoMeetingState | null;
  winner: SuspeitoRole | null;
  winReason: SuspeitoVictoryReason | null;
  options: RoomOptions;
  results: SuspeitoResults | null;
}

const PLAYER_SPEED = 5.2; // m/s
const KILL_RANGE = 2.0;   // m
const INTERACT_RANGE = 2.0; // m
const INITIAL_PROTECTION_MS = 6000;
const DEFAULT_KILL_COOLDOWN_MS = 25000;

export function createSuspeitoMatch(
  players: SuspeitoPlayerInfo[],
  options: RoomOptions,
  seed = Date.now()
): SuspeitoMatch {
  const rng = mulberry32(seed >>> 0);
  const n = players.length;

  // Determina quantidade de sabotadores
  // Configuração sugerida nas regras: <= 6 = 1, 7..12 = 2, 13+ = 3
  const targetImpostors = options.suspeitoImpostors ?? (n <= 6 ? 1 : 2);
  const impostorCount = Math.max(1, Math.min(targetImpostors, Math.floor((n - 1) / 2) || 1));

  // Embaralha índices para sortear funções secretas
  const indices = players.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const sabotadorSet = new Set<number>();
  for (let i = 0; i < impostorCount; i++) {
    sabotadorSet.add(indices[i]);
  }

  const tasksPerPlayer = options.suspeitoTasksPerPlayer ?? 4;
  const simPlayers = new Map<string, SuspeitoPlayerSim>();

  players.forEach((p, idx) => {
    const role: SuspeitoRole = p.role ?? (sabotadorSet.has(idx) ? "sabotador" : "colaborador");
    const spawnPos = SUSPEITO_SPAWNS[idx % SUSPEITO_SPAWNS.length];

    // Distribui tarefas para colaboradores (e tarefas falsas / visíveis para sabotadores simularem)
    const taskCount = Math.min(tasksPerPlayer, TASK_STATIONS.length);
    const shuffledStations = [...TASK_STATIONS];
    for (let i = shuffledStations.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffledStations[i], shuffledStations[j]] = [shuffledStations[j], shuffledStations[i]];
    }
    const myTasks: SuspeitoTask[] = shuffledStations.slice(0, taskCount).map((s) => ({
      id: `${s.id}_${p.id}`,
      name: s.name,
      description: s.description,
      sector: s.sector,
      type: s.type,
      pos: { ...s.pos },
      completed: false,
      resumable: true,
    }));

    simPlayers.set(p.id, {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: p.isBot,
      role,
      alive: true,
      pos: { ...spawnPos },
      yaw: 0,
      moving: false,
      sector: "reuniao",
      tasks: myTasks,
      killCooldownMs: INITIAL_PROTECTION_MS,
      sabotageCooldownMs: INITIAL_PROTECTION_MS,
      emergencyMeetingsRemaining: 1,
      voted: false,
      voteTarget: null,
      input: { mx: 0, mz: 0, yaw: 0 },
      brain: p.isBot ? createBotBrain() : undefined,
      stats: { tasksDone: 0, kills: 0, votesReceived: 0, correctVotes: 0 },
    });
  });

  return {
    seed,
    tick: 0,
    phase: "intro",
    phaseRemainingMs: 3000,
    players: simPlayers,
    activeChallenges: new Map(),
    bodies: [],
    sabotage: null,
    sabotageGlobalCooldownMs: INITIAL_PROTECTION_MS,
    emergencyCooldownMs: 15000,
    meeting: null,
    winner: null,
    winReason: null,
    options,
    results: null,
  };
}

export function setSuspeitoInput(
  match: SuspeitoMatch,
  playerId: string,
  input: { mx: number; mz: number; yaw: number }
): void {
  const p = match.players.get(playerId);
  if (!p || !p.alive || match.phase !== "working") return;

  const len = Math.hypot(input.mx, input.mz);
  if (len > 1.01) {
    p.input.mx = input.mx / len;
    p.input.mz = input.mz / len;
  } else {
    p.input.mx = input.mx;
    p.input.mz = input.mz;
  }
  p.input.yaw = input.yaw;
}

export function queueSuspeitoKill(
  match: SuspeitoMatch,
  killerId: string,
  targetId: string
): boolean {
  if (match.phase !== "working") return false;
  const killer = match.players.get(killerId);
  const target = match.players.get(targetId);

  if (!killer || !killer.alive || killer.role !== "sabotador") return false;
  if (killer.killCooldownMs > 0) return false;
  if (!target || !target.alive || target.id === killerId) return false;

  const dx = target.pos.x - killer.pos.x;
  const dz = target.pos.z - killer.pos.z;
  if (dx * dx + dz * dz > KILL_RANGE * KILL_RANGE) return false;

  // Executa eliminação
  target.alive = false;
  killer.stats.kills++;
  const killCooldown = (match.options.suspeitoKillCooldownSec ?? 25) * 1000;
  killer.killCooldownMs = killCooldown;

  // Cria corpo
  match.bodies.push({
    id: `body_${target.id}_${Date.now()}`,
    victimId: target.id,
    victimName: target.name,
    avatar: target.avatar,
    pos: { ...target.pos },
    sector: target.sector,
    reported: false,
  });

  // Se o jogador eliminado estava em um minigame, limpa
  match.activeChallenges.delete(target.id);

  checkVictoryConditions(match);
  return true;
}

export function queueSuspeitoReport(
  match: SuspeitoMatch,
  reporterId: string,
  bodyId: string
): boolean {
  if (match.phase !== "working") return false;
  const reporter = match.players.get(reporterId);
  if (!reporter || !reporter.alive) return false;

  const body = match.bodies.find((b) => b.id === bodyId && !b.reported);
  if (!body) return false;

  const dx = body.pos.x - reporter.pos.x;
  const dz = body.pos.z - reporter.pos.z;
  if (dx * dx + dz * dz > INTERACT_RANGE * INTERACT_RANGE * 1.5) return false;

  body.reported = true;
  triggerMeeting(match, reporterId, "body", body.victimName);
  return true;
}

export function queueSuspeitoEmergency(match: SuspeitoMatch, callerId: string): boolean {
  if (match.phase !== "working") return false;
  if (match.emergencyCooldownMs > 0) return false;

  const caller = match.players.get(callerId);
  if (!caller || !caller.alive || caller.emergencyMeetingsRemaining <= 0) return false;

  const dx = caller.pos.x - -4;
  const dz = caller.pos.z - 0;
  if (dx * dx + dz * dz > INTERACT_RANGE * INTERACT_RANGE * 1.5) return false;

  caller.emergencyMeetingsRemaining--;
  triggerMeeting(match, callerId, "emergency");
  return true;
}

function triggerMeeting(
  match: SuspeitoMatch,
  callerId: string,
  reason: "emergency" | "body",
  reportedVictimName?: string
): void {
  const caller = match.players.get(callerId);
  const discussionMs = (match.options.suspeitoDiscussionSec ?? 20) * 1000;
  const votingMs = (match.options.suspeitoVotingSec ?? 25) * 1000;

  match.meeting = createMeeting({
    callerId,
    callerName: caller?.name ?? "Alguém",
    reason,
    reportedVictimName,
    discussionMs,
    votingMs,
  });

  match.phase = "meeting";
  match.phaseRemainingMs = discussionMs;
  match.activeChallenges.clear();

  // Teleporta todos os vivos para a sala de reuniões ao redor da mesa
  let spawnIdx = 0;
  for (const p of match.players.values()) {
    p.input = { mx: 0, mz: 0, yaw: 0 };
    p.moving = false;
    p.voted = false;
    p.voteTarget = null;
    if (p.alive) {
      p.pos = { ...SUSPEITO_SPAWNS[spawnIdx % SUSPEITO_SPAWNS.length] };
      p.sector = "reuniao";
      spawnIdx++;
    }
  }
}

export function queueSuspeitoVote(
  match: SuspeitoMatch,
  voterId: string,
  targetIdOrSkip: string
): boolean {
  if (match.phase !== "voting" || !match.meeting) return false;
  const voter = match.players.get(voterId);
  if (!voter || !voter.alive || voter.voted) return false;

  voter.voted = true;
  voter.voteTarget = targetIdOrSkip;
  registerVote(match.meeting, voterId, targetIdOrSkip);

  // Se todos os vivos votaram, encerra votação antecipadamente
  const alivePlayers = [...match.players.values()].filter((p) => p.alive);
  const allVoted = alivePlayers.every((p) => p.voted);
  if (allVoted) {
    finalizeVoting(match);
  }

  return true;
}

export function queueSuspeitoSabotage(
  match: SuspeitoMatch,
  sabotadorId: string,
  type: SuspeitoSabotageType
): boolean {
  if (match.phase !== "working") return false;
  const p = match.players.get(sabotadorId);
  if (!p || !p.alive || p.role !== "sabotador") return false;
  if (p.sabotageCooldownMs > 0 || match.sabotageGlobalCooldownMs > 0) return false;
  if (match.sabotage?.active) return false;

  match.sabotage = startSabotage(type);
  p.sabotageCooldownMs = 30000;
  match.sabotageGlobalCooldownMs = 30000;
  return true;
}

export function queueSuspeitoFixSabotage(match: SuspeitoMatch, fixerId: string): boolean {
  if (match.phase !== "working" || !match.sabotage?.active) return false;
  const fixer = match.players.get(fixerId);
  if (!fixer || !fixer.alive) return false;

  const dx = match.sabotage.fixPos.x - fixer.pos.x;
  const dz = match.sabotage.fixPos.z - fixer.pos.z;
  if (dx * dx + dz * dz > INTERACT_RANGE * INTERACT_RANGE) return false;

  match.sabotage.fixed = true;
  match.sabotage.active = false;
  return true;
}

export function queueSuspeitoStartTask(
  match: SuspeitoMatch,
  playerId: string,
  taskId: string
): boolean {
  if (match.phase !== "working") return false;
  const player = match.players.get(playerId);
  if (!player || !player.alive) return false;

  const task = player.tasks.find((t) => t.id === taskId);
  if (!task || task.completed) return false;

  const dx = task.pos.x - player.pos.x;
  const dz = task.pos.z - player.pos.z;
  if (dx * dx + dz * dz > INTERACT_RANGE * INTERACT_RANGE) return false;

  // Se já tem desafio iniciado para essa tarefa, mantém
  const existing = match.activeChallenges.get(playerId);
  if (existing && existing.taskId === taskId) return true;

  // Cria o minijogo correspondente
  let challenge: ActiveChallenge;
  if (task.type === "termo") {
    challenge = { type: "termo", challenge: createTermoChallenge() };
  } else if (task.type === "conexo") {
    challenge = { type: "conexo", challenge: createConexoChallenge() };
  } else if (task.type === "contexto") {
    challenge = { type: "contexto", challenge: createContextoChallenge() };
  } else {
    challenge = { type: "quick", challenge: createQuickTaskChallenge() };
  }

  match.activeChallenges.set(playerId, { taskId, challenge });
  return true;
}

export function queueSuspeitoTaskAction(
  match: SuspeitoMatch,
  playerId: string,
  action: {
    termoGuess?: string;
    conexoWords?: string[];
    contextoGuess?: string;
    quickAdvance?: boolean;
  }
): { success: boolean; completed: boolean; state?: SuspeitoTaskState } {
  const active = match.activeChallenges.get(playerId);
  if (!active) return { success: false, completed: false };

  const player = match.players.get(playerId);
  if (!player || !player.alive) return { success: false, completed: false };

  let completed = false;

  if (active.challenge.type === "termo" && action.termoGuess) {
    const res = applyTermoGuess(active.challenge.challenge, action.termoGuess);
    if (res.solved) completed = true;
  } else if (active.challenge.type === "conexo" && action.conexoWords) {
    const res = validateConexoSelection(active.challenge.challenge, action.conexoWords);
    if (res.solved) completed = true;
  } else if (active.challenge.type === "contexto" && action.contextoGuess) {
    const res = applyContextoGuess(active.challenge.challenge, action.contextoGuess);
    if (res.solved) completed = true;
  } else if (active.challenge.type === "quick" && action.quickAdvance) {
    const res = advanceQuickTask(active.challenge.challenge);
    if (res.completed) completed = true;
  }

  if (completed) {
    const task = player.tasks.find((t) => t.id === active.taskId);
    if (task) task.completed = true;
    player.stats.tasksDone++;
    match.activeChallenges.delete(playerId);
    checkVictoryConditions(match);
  }

  return { success: true, completed };
}

function finalizeVoting(match: SuspeitoMatch): void {
  if (!match.meeting) return;

  const eligibleVoters = [...match.players.values()].filter((p) => p.alive).map((p) => p.id);
  const tally = tallyVotes(match.meeting.votes, eligibleVoters);

  match.meeting.phase = "result";
  match.phase = "vote_result";
  match.phaseRemainingMs = 4500; // 4.5 segundos mostrando o resultado

  if (tally.ejectedId) {
    const ejected = match.players.get(tally.ejectedId);
    if (ejected) {
      ejected.alive = false;
      match.meeting.ejectedId = ejected.id;
      match.meeting.ejectedName = ejected.name;
      match.meeting.ejectedRole = ejected.role;

      // Atualiza votos recebidos e acertos
      for (const [voterId, target] of Object.entries(match.meeting.votes)) {
        if (target === ejected.id) {
          const voter = match.players.get(voterId);
          if (voter && ejected.role === "sabotador") {
            voter.stats.correctVotes++;
          }
        }
      }
      ejected.stats.votesReceived += tally.voteCounts[ejected.id] ?? 0;
    }
  } else {
    match.meeting.ejectedId = tally.outcome === "skipped" ? "skip" : "tie";
  }
}

export function stepSuspeitoMatch(match: SuspeitoMatch, dtSec: number): void {
  if (match.phase === "over") return;

  match.tick++;
  const dtMs = dtSec * 1000;

  if (match.phase === "intro") {
    match.phaseRemainingMs -= dtMs;
    if (match.phaseRemainingMs <= 0) {
      match.phase = "working";
      match.phaseRemainingMs = 0;
    }
    return;
  }

  if (match.phase === "meeting") {
    match.phaseRemainingMs -= dtMs;
    if (match.phaseRemainingMs <= 0) {
      match.phase = "voting";
      if (match.meeting) {
        match.meeting.phase = "voting";
        match.phaseRemainingMs = match.meeting.totalVotingMs;
      }
    }
    return;
  }

  if (match.phase === "voting") {
    match.phaseRemainingMs -= dtMs;

    // Processa votos de bots
    for (const p of match.players.values()) {
      if (p.isBot && p.alive && !p.voted && p.brain) {
        const others = [...match.players.values()].filter((o) => o.id !== p.id);
        const botDecision = stepSuspeitoBot({
          botId: p.id,
          pos: p.pos,
          role: p.role,
          brain: p.brain,
          tasks: p.tasks,
          bodies: match.bodies,
          otherPlayers: others,
          canKill: false,
          killCooldownMs: 9999,
          phase: "voting",
          dtMs,
        });
        if (botDecision.action === "vote" && botDecision.targetId) {
          queueSuspeitoVote(match, p.id, botDecision.targetId);
        }
      }
    }

    if (match.phaseRemainingMs <= 0) {
      finalizeVoting(match);
    }
    return;
  }

  if (match.phase === "vote_result") {
    match.phaseRemainingMs -= dtMs;
    if (match.phaseRemainingMs <= 0) {
      // Checa vitória antes de voltar ao trabalho
      if (checkVictoryConditions(match)) return;

      // Volta ao trabalho
      match.phase = "working";
      match.meeting = null;
      match.emergencyCooldownMs = 15000;
      for (const p of match.players.values()) {
        p.voted = false;
        p.voteTarget = null;
      }
    }
    return;
  }

  // Phase: working
  if (match.emergencyCooldownMs > 0) {
    match.emergencyCooldownMs = Math.max(0, match.emergencyCooldownMs - dtMs);
  }
  if (match.sabotageGlobalCooldownMs > 0) {
    match.sabotageGlobalCooldownMs = Math.max(0, match.sabotageGlobalCooldownMs - dtMs);
  }

  // Step sabotagem
  if (match.sabotage?.active) {
    const { expired } = stepSabotage(match.sabotage, dtMs);
    if (expired && match.sabotage.critical) {
      match.winner = "sabotador";
      match.winReason = "sabotage_critical";
      finishMatch(match);
      return;
    }
  }

  // Step players e bots
  for (const p of match.players.values()) {
    if (!p.alive) continue;

    if (p.killCooldownMs > 0) {
      p.killCooldownMs = Math.max(0, p.killCooldownMs - dtMs);
    }
    if (p.sabotageCooldownMs > 0) {
      p.sabotageCooldownMs = Math.max(0, p.sabotageCooldownMs - dtMs);
    }

    // Bot AI
    if (p.isBot && p.brain) {
      const others = [...match.players.values()].filter((o) => o.id !== p.id);
      const decision = stepSuspeitoBot({
        botId: p.id,
        pos: p.pos,
        role: p.role,
        brain: p.brain,
        tasks: p.tasks,
        bodies: match.bodies,
        otherPlayers: others,
        canKill: p.killCooldownMs <= 0,
        killCooldownMs: p.killCooldownMs,
        phase: "working",
        dtMs,
      });

      p.input = decision.input;

      if (decision.action === "kill" && decision.targetId) {
        queueSuspeitoKill(match, p.id, decision.targetId);
      } else if (decision.action === "report" && decision.targetId) {
        queueSuspeitoReport(match, p.id, decision.targetId);
      } else if (decision.action === "task" && decision.targetId) {
        const task = p.tasks.find((t) => t.id === decision.targetId);
        if (task) {
          task.completed = true;
          p.stats.tasksDone++;
          checkVictoryConditions(match);
        }
      }
    }

    // Movimentação
    const mx = p.input.mx;
    const mz = p.input.mz;
    const moving = mx !== 0 || mz !== 0;
    p.moving = moving;

    if (moving) {
      p.pos.x = Math.max(MAP_BOUNDS.minX, Math.min(MAP_BOUNDS.maxX, p.pos.x + mx * PLAYER_SPEED * dtSec));
      p.pos.z = Math.max(MAP_BOUNDS.minZ, Math.min(MAP_BOUNDS.maxZ, p.pos.z + mz * PLAYER_SPEED * dtSec));
      p.yaw = p.input.yaw;
      p.sector = sectorAt(p.pos);
    }
  }

  checkVictoryConditions(match);
}

function checkVictoryConditions(match: SuspeitoMatch): boolean {
  if (match.phase === "over") return true;

  const players = [...match.players.values()];
  const alivePlayers = players.filter((p) => p.alive);
  const aliveSabotadores = alivePlayers.filter((p) => p.role === "sabotador");
  const aliveColaboradores = alivePlayers.filter((p) => p.role === "colaborador");

  // 1. Todos os sabotadores foram ejetados
  if (aliveSabotadores.length === 0) {
    match.winner = "colaborador";
    match.winReason = "impostors_ejected";
    finishMatch(match);
    return true;
  }

  // 2. Paridade de sabotadores: número de sabotadores vivos >= colaboradores vivos
  if (aliveSabotadores.length >= aliveColaboradores.length) {
    match.winner = "sabotador";
    match.winReason = "impostors_parity";
    finishMatch(match);
    return true;
  }

  // 3. Conclusão de 100% das tarefas dos colaboradores
  const colabTasks = players
    .filter((p) => p.role === "colaborador")
    .flatMap((p) => p.tasks);
  if (colabTasks.length > 0 && colabTasks.every((t) => t.completed)) {
    match.winner = "colaborador";
    match.winReason = "tasks_completed";
    finishMatch(match);
    return true;
  }

  return false;
}

function finishMatch(match: SuspeitoMatch): void {
  match.phase = "over";
  match.phaseRemainingMs = 0;
  match.results = getSuspeitoResults(match);
}

export function buildSuspeitoSnapshot(match: SuspeitoMatch): SuspeitoSnapshot {
  const players = [...match.players.values()];
  const colabTasks = players
    .filter((p) => p.role === "colaborador")
    .flatMap((p) => p.tasks);
  const doneTasks = colabTasks.filter((t) => t.completed).length;
  const taskProgress = colabTasks.length > 0 ? doneTasks / colabTasks.length : 0;

  return {
    tick: match.tick,
    phase: match.phase,
    phaseRemainingMs: match.phaseRemainingMs,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: p.isBot,
      alive: p.alive,
      pos: { ...p.pos },
      yaw: p.yaw,
      moving: p.moving,
      sector: p.sector,
    })),
    bodies: match.bodies.map((b) => ({ ...b })),
    taskProgress,
    sabotage: match.sabotage ? { ...match.sabotage } : null,
    meeting: match.meeting ? { ...match.meeting } : null,
    emergencyButtonAvailable: match.emergencyCooldownMs <= 0,
    emergencyCooldownMs: match.emergencyCooldownMs,
    winner: match.winner,
    winReason: match.winReason,
  };
}

export function buildSuspeitoPrivate(
  match: SuspeitoMatch,
  playerId: string
): SuspeitoPrivate | null {
  const p = match.players.get(playerId);
  if (!p) return null;

  const isSabotador = p.role === "sabotador";
  const teammates = isSabotador
    ? [...match.players.values()]
        .filter((o) => o.role === "sabotador" && o.id !== playerId)
        .map((o) => o.id)
    : undefined;

  // Verifica alvos próximos de eliminação
  let canKill = false;
  let killTargetId: string | null = null;
  if (isSabotador && p.alive && p.killCooldownMs <= 0 && match.phase === "working") {
    for (const other of match.players.values()) {
      if (!other.alive || other.id === playerId) continue;
      const dx = other.pos.x - p.pos.x;
      const dz = other.pos.z - p.pos.z;
      if (dx * dx + dz * dz <= KILL_RANGE * KILL_RANGE) {
        canKill = true;
        killTargetId = other.id;
        break;
      }
    }
  }

  // Verifica corpos próximos reportáveis
  let canReport = false;
  let reportTargetBodyId: string | null = null;
  if (p.alive && match.phase === "working") {
    for (const b of match.bodies) {
      if (b.reported) continue;
      const dx = b.pos.x - p.pos.x;
      const dz = b.pos.z - p.pos.z;
      if (dx * dx + dz * dz <= INTERACT_RANGE * INTERACT_RANGE * 1.5) {
        canReport = true;
        reportTargetBodyId = b.id;
        break;
      }
    }
  }

  // Verifica interações próximas (tarefa, emergência, sabotagem)
  let nearbyInteractable: SuspeitoPrivate["nearbyInteractable"] = null;
  if (p.alive && match.phase === "working") {
    // 1. Sabotagem ativa para consertar
    if (match.sabotage?.active) {
      const dx = match.sabotage.fixPos.x - p.pos.x;
      const dz = match.sabotage.fixPos.z - p.pos.z;
      if (dx * dx + dz * dz <= INTERACT_RANGE * INTERACT_RANGE) {
        nearbyInteractable = { kind: "sabotage", id: match.sabotage.type, label: `Consertar ${match.sabotage.title}` };
      }
    }

    // 2. Botão de emergência
    if (!nearbyInteractable && match.emergencyCooldownMs <= 0 && p.emergencyMeetingsRemaining > 0) {
      const dx = -4 - p.pos.x;
      const dz = 0 - p.pos.z;
      if (dx * dx + dz * dz <= INTERACT_RANGE * INTERACT_RANGE * 1.5) {
        nearbyInteractable = { kind: "emergency", id: "emergency_btn", label: "Acionar Reunião Emergencial" };
      }
    }

    // 3. Tarefas
    if (!nearbyInteractable) {
      for (const t of p.tasks) {
        if (t.completed) continue;
        const dx = t.pos.x - p.pos.x;
        const dz = t.pos.z - p.pos.z;
        if (dx * dx + dz * dz <= INTERACT_RANGE * INTERACT_RANGE) {
          nearbyInteractable = { kind: "task", id: t.id, label: t.name };
          break;
        }
      }
    }

    // 4. Corpo
    if (!nearbyInteractable && reportTargetBodyId) {
      nearbyInteractable = { kind: "body", id: reportTargetBodyId, label: "Reportar Ocorrência" };
    }
  }

  const activeChallenge = match.activeChallenges.get(playerId);
  let activeTaskState: SuspeitoTaskState | null = null;
  if (activeChallenge) {
    if (activeChallenge.challenge.type === "termo") {
      activeTaskState = { type: "termo", state: activeChallenge.challenge.challenge.state };
    } else if (activeChallenge.challenge.type === "conexo") {
      activeTaskState = { type: "conexo", state: activeChallenge.challenge.challenge.state };
    } else if (activeChallenge.challenge.type === "contexto") {
      activeTaskState = { type: "contexto", state: activeChallenge.challenge.challenge.state };
    } else {
      activeTaskState = { type: "quick", state: activeChallenge.challenge.challenge.state };
    }
  }

  return {
    role: p.role,
    sabotadorTeammates: teammates,
    tasks: p.tasks,
    activeTaskId: activeChallenge?.taskId ?? null,
    activeTaskState,
    killCooldownMs: p.killCooldownMs,
    sabotageCooldownMs: p.sabotageCooldownMs,
    emergencyMeetingsLeft: p.emergencyMeetingsRemaining,
    canReport,
    reportTargetBodyId,
    canKill,
    killTargetId,
    nearbyInteractable,
    myVote: p.voteTarget,
  };
}

export function getSuspeitoResults(match: SuspeitoMatch): SuspeitoResults {
  const rows: SuspeitoResultRow[] = [...match.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    role: p.role,
    alive: p.alive,
    tasksDone: p.stats.tasksDone,
    kills: p.stats.kills,
    votesReceived: p.stats.votesReceived,
  }));

  const awards = getSuspeitoAwards(rows, match.seed);

  return {
    winner: match.winner ?? "colaborador",
    reason: match.winReason ?? "tasks_completed",
    rows,
    awards,
  };
}

export function getSuspeitoAwards(rows: SuspeitoResultRow[], seed: number): Award[] {
  const candidates: Award[] = [];

  // 1. Funcionário do Mês: quem mais fez tarefas
  const topTasks = [...rows].sort((a, b) => b.tasksDone - a.tasksDone)[0];
  if (topTasks && topTasks.tasksDone > 0) {
    candidates.push({
      id: "tasks_mvp",
      title: "Funcionário do Mês",
      winnerId: topTasks.id,
      winnerName: topTasks.name,
      detail: `${topTasks.tasksDone} tarefas concluídas`,
    });
  }

  // 2. Infiltrador Silencioso: sabotador com mais eliminações
  const topKiller = [...rows].filter((r) => r.role === "sabotador").sort((a, b) => b.kills - a.kills)[0];
  if (topKiller && topKiller.kills > 0) {
    candidates.push({
      id: "top_sabotador",
      title: "Sabotador de Elite",
      winnerId: topKiller.id,
      winnerName: topKiller.name,
      detail: `${topKiller.kills} colaboradores eliminados`,
    });
  }

  // 3. Sobrevivente Notável: colaborador vivo no final
  const survivor = rows.find((r) => r.role === "colaborador" && r.alive);
  if (survivor) {
    candidates.push({
      id: "survivor",
      title: "Sobrevivente do Expediente",
      winnerId: survivor.id,
      winnerName: survivor.name,
      detail: "Terminou o expediente vivo",
    });
  }

  return candidates.slice(0, 3);
}
