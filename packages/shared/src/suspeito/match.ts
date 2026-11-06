import type { RoomOptions } from "../botLevels";
import { mulberry32 } from "../rng";
import type { AvatarDNA, Vec2 } from "../types";
import {
  canSeeFrom,
  createBotBrain,
  decideSuspeitoBotStatement,
  decideSuspeitoBotVote,
  resetBotForMeeting,
  stepSuspeitoBot,
  type SuspeitoBotBrain,
} from "./bot";
import {
  EMERGENCY_BUTTON_POS,
  hasLineOfSight,
  moveSuspeitoPlayer,
  sectorAt,
  SECTORS,
  SUSPEITO_NORMAL_VISION_RADIUS,
  SUSPEITO_SABOTAGE_VISION_RADIUS,
  SUSPEITO_SPAWNS,
  TASK_STATIONS,
} from "./map";
import { addMeetingMessage, createMeeting, registerVote, tallyVotes } from "./meeting";
import { startSabotage, stepSabotage } from "./sabotage";
import { createConexoChallenge, validateConexoSelection, type ConexoChallenge } from "./tasks/conexo";
import { applyContextoGuess, createContextoChallenge, type ContextoChallenge } from "./tasks/contexto";
import { applyQteAction, createQteChallenge, type QteChallenge } from "./tasks/qte";
import { advanceQuickTask, createQuickTaskChallenge, type QuickTaskChallenge } from "./tasks/quickTasks";
import { applyTermoGuess, createTermoChallenge, type TermoChallenge } from "./tasks/termo";
import type {
  SuspeitoBody,
  SuspeitoMeetingMessage,
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
  SuspeitoTaskType,
  SuspeitoVictoryReason,
} from "./types";
import type { Award } from "../awards";

export interface SuspeitoPlayerSim {
  id: string;
  name: string;
  avatar: AvatarDNA;
  isBot: boolean;
  role: SuspeitoRole;
  alive: boolean;
  /** Saiu da sala: some do jogo e as tarefas deixam de contar. */
  left: boolean;
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
  | { type: "quick"; challenge: QuickTaskChallenge }
  | { type: "qte"; challenge: QteChallenge };

export interface ActiveChallengeEntry {
  taskId: string;
  challenge: ActiveChallenge;
  /** Tempo que o estado final (acerto ou erro) fica visível antes de fechar ou reiniciar. */
  lingerMs?: number;
}

export interface SuspeitoMatch {
  seed: number;
  tick: number;
  phase: SuspeitoPhase;
  phaseRemainingMs: number;
  players: Map<string, SuspeitoPlayerSim>;
  activeChallenges: Map<string, ActiveChallengeEntry>;
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

const KILL_RANGE = 2.0;
const INTERACT_RANGE = 2.0;
const REPORT_RANGE = 2.6;
const EMERGENCY_RANGE = 2.8;
const FIRST_ROUND_KILL_COOLDOWN_MS = 10000;
const INITIAL_SABOTAGE_COOLDOWN_MS = 10000;
const SABOTAGE_COOLDOWN_MS = 30000;
const EMERGENCY_COOLDOWN_MS = 15000;
const COMPLETED_LINGER_MS = 1300;
const FAILED_LINGER_MS = 1800;
const SABOTADOR_VISION_MULT = 1.25;
const DIGITAL_TASKS: SuspeitoTaskType[] = ["termo", "conexo", "contexto"];

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
      left: false,
      pos: { ...spawnPos },
      yaw: 0,
      moving: false,
      sector: "reuniao",
      tasks: myTasks,
      killCooldownMs: FIRST_ROUND_KILL_COOLDOWN_MS,
      sabotageCooldownMs: INITIAL_SABOTAGE_COOLDOWN_MS,
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
    phaseRemainingMs: 3500,
    players: simPlayers,
    activeChallenges: new Map(),
    bodies: [],
    sabotage: null,
    sabotageGlobalCooldownMs: INITIAL_SABOTAGE_COOLDOWN_MS,
    emergencyCooldownMs: EMERGENCY_COOLDOWN_MS,
    meeting: null,
    winner: null,
    winReason: null,
    options,
    results: null,
  };
}

function killCooldownMs(match: SuspeitoMatch): number {
  return (match.options.suspeitoKillCooldownSec ?? 25) * 1000;
}

function visionRadiusFor(match: SuspeitoMatch, p: SuspeitoPlayerSim): number {
  if (p.role === "sabotador") return SUSPEITO_NORMAL_VISION_RADIUS * SABOTADOR_VISION_MULT;
  const lightsOut = match.sabotage?.active && match.sabotage.type === "falha_energia";
  return lightsOut ? SUSPEITO_SABOTAGE_VISION_RADIUS : SUSPEITO_NORMAL_VISION_RADIUS;
}

export function isSuspeitoTaskBlocked(match: SuspeitoMatch, task: SuspeitoTask): boolean {
  const s = match.sabotage;
  if (!s?.active) return false;
  if (s.type === "queda_rede") return DIGITAL_TASKS.includes(task.type);
  if (s.type === "impressora_travada") return task.sector === "impressao";
  return false;
}

function within(a: Vec2, b: Vec2, range: number): boolean {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz <= range * range;
}

function createChallengeFor(type: SuspeitoTaskType): ActiveChallenge {
  if (type === "termo") return { type: "termo", challenge: createTermoChallenge() };
  if (type === "conexo") return { type: "conexo", challenge: createConexoChallenge() };
  if (type === "contexto") return { type: "contexto", challenge: createContextoChallenge() };
  if (type === "qte_reacao" || type === "qte_sequencia" || type === "qte_cabos" || type === "qte_impressora") {
    return { type: "qte", challenge: createQteChallenge(type) };
  }
  return { type: "quick", challenge: createQuickTaskChallenge() };
}

function challengeFailed(c: ActiveChallenge): boolean {
  return (c.type === "termo" || c.type === "conexo") && c.challenge.state.failed;
}

export function setSuspeitoInput(
  match: SuspeitoMatch,
  playerId: string,
  input: { mx: number; mz: number; yaw: number }
): void {
  const p = match.players.get(playerId);
  if (!p || p.left || match.phase !== "working") return;

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
  if (!target || !target.alive || target.id === killerId || target.role === "sabotador") return false;
  if (!within(killer.pos, target.pos, KILL_RANGE)) return false;
  if (!hasLineOfSight(killer.pos, target.pos)) return false;

  // Executa eliminação
  target.alive = false;
  target.input = { mx: 0, mz: 0, yaw: target.yaw };
  killer.stats.kills++;
  killer.killCooldownMs = killCooldownMs(match);

  // Cria corpo
  match.bodies.push({
    id: `body_${target.id}_${match.tick}`,
    victimId: target.id,
    victimName: target.name,
    avatar: target.avatar,
    pos: { ...target.pos },
    sector: target.sector,
    reported: false,
  });

  for (const w of match.players.values()) {
    if (!w.brain || !w.alive || w.id === killer.id || w.role === "sabotador") continue;
    if (canSeeFrom(w.pos, killer.pos, visionRadiusFor(match, w))) {
      w.brain.suspicion[killer.id] = (w.brain.suspicion[killer.id] ?? 0) + 100;
    }
  }

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
  if (!within(body.pos, reporter.pos, REPORT_RANGE)) return false;
  if (!hasLineOfSight(reporter.pos, body.pos)) return false;

  body.reported = true;
  triggerMeeting(match, reporterId, "body", body.victimName, body.sector);
  return true;
}

export function queueSuspeitoEmergency(match: SuspeitoMatch, callerId: string): boolean {
  if (match.phase !== "working") return false;
  if (match.emergencyCooldownMs > 0) return false;
  if (match.sabotage?.active && match.sabotage.critical) return false;

  const caller = match.players.get(callerId);
  if (!caller || !caller.alive || caller.emergencyMeetingsRemaining <= 0) return false;
  if (!within(caller.pos, EMERGENCY_BUTTON_POS, EMERGENCY_RANGE)) return false;

  caller.emergencyMeetingsRemaining--;
  triggerMeeting(match, callerId, "emergency");
  return true;
}

function triggerMeeting(
  match: SuspeitoMatch,
  callerId: string,
  reason: "emergency" | "body",
  reportedVictimName?: string,
  reportedBodySector?: SuspeitoSectorId
): void {
  const caller = match.players.get(callerId);
  const callerName = caller?.name ?? "Alguém";
  const discussionMs = (match.options.suspeitoDiscussionSec ?? 20) * 1000;
  const votingMs = (match.options.suspeitoVotingSec ?? 25) * 1000;
  const sectorLabel = reportedBodySector ? SECTORS[reportedBodySector]?.name : undefined;

  const initialMessage: SuspeitoMeetingMessage =
    reason === "body"
      ? {
          id: `m_1_${callerId}`,
          senderId: callerId,
          senderName: callerName,
          text: sectorLabel
            ? `🚨 Encontrei o corpo de ${reportedVictimName ?? "um colega"} no setor ${sectorLabel}!`
            : `🚨 Encontrei o corpo de ${reportedVictimName ?? "um colega"}!`,
          kind: "report",
        }
      : {
          id: `m_1_${callerId}`,
          senderId: callerId,
          senderName: callerName,
          text: `📢 Convoquei reunião de emergência na Sala de Reuniões! Quem viu algo suspeito?`,
          kind: "report",
        };

  match.meeting = createMeeting({
    callerId,
    callerName,
    reason,
    reportedVictimName,
    reportedBodySector,
    discussionMs,
    votingMs,
    initialMessage,
  });

  match.phase = "meeting";
  match.phaseRemainingMs = discussionMs;
  match.activeChallenges.clear();
  match.bodies = [];
  if (match.sabotage?.active && match.sabotage.critical) {
    match.sabotage.active = false;
    match.sabotage.fixed = true;
  }

  // Teleporta todos os vivos para a sala de reuniões ao redor da mesa
  let spawnIdx = 0;
  for (const p of match.players.values()) {
    const prevSector = p.sector;
    p.input = { mx: 0, mz: 0, yaw: 0 };
    p.moving = false;
    p.voted = false;
    p.voteTarget = null;
    if (p.alive) {
      p.pos = { ...SUSPEITO_SPAWNS[spawnIdx % SUSPEITO_SPAWNS.length] };
      p.sector = "reuniao";
      spawnIdx++;
    }
    if (p.brain) {
      resetBotForMeeting(
        p.brain,
        2500 + Math.random() * Math.min(9000, votingMs * 0.6),
        prevSector
      );
      // Se o próprio bot reportou, já tem a mensagem inicial de reporte
      if (p.id === callerId && reason === "body") {
        p.brain.speakDelayMs = 900 + Math.random() * 1500;
      }
    }
  }
}

export function queueSuspeitoMeetingChat(
  match: SuspeitoMatch,
  senderId: string,
  text: string,
  kind: SuspeitoMeetingMessage["kind"] = "chat",
  targetId?: string,
  skipDiscussion?: boolean
): boolean {
  if ((match.phase !== "meeting" && match.phase !== "voting") || !match.meeting) return false;
  const sender = match.players.get(senderId);
  if (!sender || !sender.alive || sender.left) return false;

  if (skipDiscussion && match.phase === "meeting") {
    match.phase = "voting";
    match.meeting.phase = "voting";
    match.phaseRemainingMs = match.meeting.totalVotingMs;
  }

  const clean = text.trim().slice(0, 140);
  if (!clean) return skipDiscussion ?? false;

  addMeetingMessage(match.meeting, {
    senderId: sender.id,
    senderName: sender.name,
    text: clean,
    kind,
  });

  // Se alguém acusa um alvo, bots colaboradores atentos aumentam levemente a atenção sobre esse alvo
  if (kind === "accuse" && targetId) {
    for (const p of match.players.values()) {
      if (!p.brain || !p.alive || p.id === senderId || p.id === targetId || p.role === "sabotador") continue;
      p.brain.suspicion[targetId] = (p.brain.suspicion[targetId] ?? 0) + 1.5;
    }
  }

  return true;
}

export function queueSuspeitoVote(
  match: SuspeitoMatch,
  voterId: string,
  targetIdOrSkip: string
): boolean {
  if (match.phase !== "voting" || !match.meeting) return false;
  const voter = match.players.get(voterId);
  if (!voter || !voter.alive || voter.voted) return false;
  if (targetIdOrSkip !== "skip") {
    const target = match.players.get(targetIdOrSkip);
    if (!target || !target.alive) return false;
  }

  voter.voted = true;
  voter.voteTarget = targetIdOrSkip;
  registerVote(match.meeting, voterId, targetIdOrSkip);

  // Se todos os vivos votaram, encerra votação antecipadamente
  maybeCloseVoting(match);
  return true;
}

function maybeCloseVoting(match: SuspeitoMatch): void {
  if (match.phase !== "voting") return;
  const alivePlayers = [...match.players.values()].filter((p) => p.alive);
  if (alivePlayers.every((p) => p.voted)) finalizeVoting(match);
}

export function queueSuspeitoSabotage(
  match: SuspeitoMatch,
  sabotadorId: string,
  type: SuspeitoSabotageType
): boolean {
  if (match.phase !== "working") return false;
  const p = match.players.get(sabotadorId);
  if (!p || p.left || p.role !== "sabotador") return false;
  if (p.sabotageCooldownMs > 0 || match.sabotageGlobalCooldownMs > 0) return false;
  if (match.sabotage?.active) return false;

  match.sabotage = startSabotage(type);
  p.sabotageCooldownMs = SABOTAGE_COOLDOWN_MS;
  match.sabotageGlobalCooldownMs = SABOTAGE_COOLDOWN_MS;

  for (const [pid, entry] of match.activeChallenges) {
    const owner = match.players.get(pid);
    const task = owner?.tasks.find((t) => t.id === entry.taskId);
    if (task && isSuspeitoTaskBlocked(match, task)) match.activeChallenges.delete(pid);
  }
  return true;
}

export function queueSuspeitoFixSabotage(match: SuspeitoMatch, fixerId: string): boolean {
  if (match.phase !== "working" || !match.sabotage?.active) return false;
  const fixer = match.players.get(fixerId);
  if (!fixer || !fixer.alive) return false;
  if (!within(match.sabotage.fixPos, fixer.pos, INTERACT_RANGE)) return false;

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
  if (!player || player.left) return false;
  if (!player.alive && player.role === "sabotador") return false;

  const task = player.tasks.find((t) => t.id === taskId);
  if (!task || task.completed) return false;
  if (isSuspeitoTaskBlocked(match, task)) return false;
  if (!within(task.pos, player.pos, INTERACT_RANGE)) return false;

  // Se já tem desafio iniciado para essa tarefa, mantém
  const existing = match.activeChallenges.get(playerId);
  if (existing && existing.taskId === taskId && !challengeFailed(existing.challenge)) return true;

  match.activeChallenges.set(playerId, { taskId, challenge: createChallengeFor(task.type) });
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
    qteAction?: {
      kind: "timing" | "sequence" | "wire" | "printer";
      timingValue?: number;
      key?: string;
      color?: string;
      printerStep?: number;
    };
  }
): { success: boolean; completed: boolean; state?: SuspeitoTaskState } {
  if (match.phase !== "working") return { success: false, completed: false };
  const active = match.activeChallenges.get(playerId);
  if (!active || active.lingerMs !== undefined) return { success: false, completed: false };

  const player = match.players.get(playerId);
  if (!player || player.left) return { success: false, completed: false };

  let completed = false;

  if (active.challenge.type === "termo" && action.termoGuess) {
    completed = applyTermoGuess(active.challenge.challenge, action.termoGuess).solved;
  } else if (active.challenge.type === "conexo" && action.conexoWords) {
    completed = validateConexoSelection(active.challenge.challenge, action.conexoWords).solved;
  } else if (active.challenge.type === "contexto" && action.contextoGuess) {
    completed = applyContextoGuess(active.challenge.challenge, action.contextoGuess).solved;
  } else if (active.challenge.type === "quick" && action.quickAdvance) {
    completed = advanceQuickTask(active.challenge.challenge).completed;
  } else if (active.challenge.type === "qte" && action.qteAction) {
    completed = applyQteAction(active.challenge.challenge, action.qteAction).completed;
  }

  if (completed) {
    completeTask(match, player, active.taskId);
    active.lingerMs = COMPLETED_LINGER_MS;
  } else if (challengeFailed(active.challenge)) {
    active.lingerMs = FAILED_LINGER_MS;
  }

  return { success: true, completed };
}

function completeTask(match: SuspeitoMatch, player: SuspeitoPlayerSim, taskId: string): void {
  const task = player.tasks.find((t) => t.id === taskId);
  if (!task || task.completed) return;
  task.completed = true;
  if (player.role === "colaborador") {
    player.stats.tasksDone++;
    checkVictoryConditions(match);
  }
}

/** Jogador saiu da sala no meio da partida: vira ausente sem deixar corpo. */
export function removeSuspeitoPlayer(match: SuspeitoMatch, playerId: string): void {
  const p = match.players.get(playerId);
  if (!p || p.left) return;
  p.left = true;
  p.alive = false;
  p.input = { mx: 0, mz: 0, yaw: p.yaw };
  match.activeChallenges.delete(playerId);
  if (match.phase === "over") return;
  if (checkVictoryConditions(match)) return;
  maybeCloseVoting(match);
}

function finalizeVoting(match: SuspeitoMatch): void {
  if (!match.meeting) return;

  const eligibleVoters = [...match.players.values()].filter((p) => p.alive).map((p) => p.id);
  const tally = tallyVotes(match.meeting.votes, eligibleVoters);

  match.meeting.phase = "result";
  match.phase = "vote_result";
  match.phaseRemainingMs = 5000;

  if (tally.ejectedId) {
    const ejected = match.players.get(tally.ejectedId);
    if (ejected) {
      ejected.alive = false;
      match.meeting.ejectedId = ejected.id;
      match.meeting.ejectedName = ejected.name;
      match.meeting.ejectedRole = ejected.role;

      // Atualiza votos recebidos e acertos
      for (const [voterId, target] of Object.entries(match.meeting.votes)) {
        if (target === ejected.id && ejected.role === "sabotador") {
          const voter = match.players.get(voterId);
          if (voter) voter.stats.correctVotes++;
        }
      }
      ejected.stats.votesReceived += tally.voteCounts[ejected.id] ?? 0;
    }
  } else {
    match.meeting.ejectedId = tally.outcome === "skipped" ? "skip" : "tie";
  }
}

function resumeWork(match: SuspeitoMatch): void {
  match.phase = "working";
  match.phaseRemainingMs = 0;
  match.meeting = null;
  match.emergencyCooldownMs = EMERGENCY_COOLDOWN_MS;
  for (const p of match.players.values()) {
    p.voted = false;
    p.voteTarget = null;
    if (p.role === "sabotador") {
      p.killCooldownMs = killCooldownMs(match);
      p.sabotageCooldownMs = Math.max(p.sabotageCooldownMs, INITIAL_SABOTAGE_COOLDOWN_MS);
    }
  }
  match.sabotageGlobalCooldownMs = Math.max(match.sabotageGlobalCooldownMs, INITIAL_SABOTAGE_COOLDOWN_MS);
}

function stepChallenges(match: SuspeitoMatch, dtMs: number): void {
  for (const [pid, entry] of match.activeChallenges) {
    if (entry.lingerMs === undefined) continue;
    entry.lingerMs -= dtMs;
    if (entry.lingerMs > 0) continue;
    if (challengeFailed(entry.challenge)) {
      const task = match.players.get(pid)?.tasks.find((t) => t.id === entry.taskId);
      if (task) {
        match.activeChallenges.set(pid, { taskId: entry.taskId, challenge: createChallengeFor(task.type) });
        continue;
      }
    }
    match.activeChallenges.delete(pid);
  }
}

function stepBot(match: SuspeitoMatch, p: SuspeitoPlayerSim, dtMs: number): void {
  const decision = stepSuspeitoBot(match, p, dtMs, {
    visionRadius: visionRadiusFor(match, p),
    killRange: KILL_RANGE,
    reportRange: REPORT_RANGE,
    fixRange: INTERACT_RANGE,
    isTaskBlocked: (t) => isSuspeitoTaskBlocked(match, t),
  });
  p.input = decision.input;
  const a = decision.action;
  if (!a) return;
  if (a.kind === "kill") queueSuspeitoKill(match, p.id, a.targetId);
  else if (a.kind === "report") queueSuspeitoReport(match, p.id, a.bodyId);
  else if (a.kind === "fix") queueSuspeitoFixSabotage(match, p.id);
  else if (a.kind === "sabotage") queueSuspeitoSabotage(match, p.id, a.type);
  else if (a.kind === "task") {
    const task = p.tasks.find((t) => t.id === a.taskId);
    if (task && !task.completed && !isSuspeitoTaskBlocked(match, task) && within(task.pos, p.pos, INTERACT_RANGE)) {
      completeTask(match, p, task.id);
    }
  }
}

function stepBotMeetingStatements(match: SuspeitoMatch, dtMs: number): void {
  if (!match.meeting) return;
  for (const p of match.players.values()) {
    if (!p.isBot || !p.alive || p.left || !p.brain) continue;
    const stmt = decideSuspeitoBotStatement(match, p, dtMs);
    if (stmt) {
      queueSuspeitoMeetingChat(match, p.id, stmt.text, stmt.kind, stmt.targetId);
    }
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
    stepBotMeetingStatements(match, dtMs);
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
    stepBotMeetingStatements(match, dtMs);

    for (const p of match.players.values()) {
      if (match.phase !== "voting") break;
      if (p.isBot && p.alive && !p.voted && p.brain) {
        const choice = decideSuspeitoBotVote(match, p, dtMs);
        if (choice) queueSuspeitoVote(match, p.id, choice);
      }
    }

    if (match.phase === "voting" && match.phaseRemainingMs <= 0) {
      finalizeVoting(match);
    }
    return;
  }

  if (match.phase === "vote_result") {
    match.phaseRemainingMs -= dtMs;
    if (match.phaseRemainingMs <= 0) {
      // Checa vitória antes de voltar ao trabalho
      if (checkVictoryConditions(match)) return;
      resumeWork(match);
    }
    return;
  }

  if (match.emergencyCooldownMs > 0) {
    match.emergencyCooldownMs = Math.max(0, match.emergencyCooldownMs - dtMs);
  }
  if (match.sabotageGlobalCooldownMs > 0) {
    match.sabotageGlobalCooldownMs = Math.max(0, match.sabotageGlobalCooldownMs - dtMs);
  }

  if (match.sabotage?.active) {
    const { expired } = stepSabotage(match.sabotage, dtMs);
    if (expired) {
      if (match.sabotage.critical) {
        match.winner = "sabotador";
        match.winReason = "sabotage_critical";
        finishMatch(match);
        return;
      }
      match.sabotage.active = false;
    }
  }

  stepChallenges(match, dtMs);

  for (const p of match.players.values()) {
    if (match.phase !== "working") return;
    if (p.left) continue;

    if (p.alive && p.killCooldownMs > 0) {
      p.killCooldownMs = Math.max(0, p.killCooldownMs - dtMs);
    }
    if (p.sabotageCooldownMs > 0) {
      p.sabotageCooldownMs = Math.max(0, p.sabotageCooldownMs - dtMs);
    }

    if (p.isBot && p.brain) stepBot(match, p, dtMs);
    if (match.phase !== "working") return;

    const { mx, mz } = p.input;
    p.moving = mx !== 0 || mz !== 0;
    if (p.moving) {
      p.pos = moveSuspeitoPlayer(p.pos, mx, mz, dtSec, !p.alive);
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
  const colabTasks = countedColabTasks(match);
  if (colabTasks.length > 0 && colabTasks.every((t) => t.completed)) {
    match.winner = "colaborador";
    match.winReason = "tasks_completed";
    finishMatch(match);
    return true;
  }

  return false;
}

function countedColabTasks(match: SuspeitoMatch): SuspeitoTask[] {
  return [...match.players.values()]
    .filter((p) => p.role === "colaborador" && !p.left)
    .flatMap((p) => p.tasks);
}

function finishMatch(match: SuspeitoMatch): void {
  match.phase = "over";
  match.phaseRemainingMs = 0;
  match.results = getSuspeitoResults(match);
}

export function buildSuspeitoSnapshot(match: SuspeitoMatch): SuspeitoSnapshot {
  const players = [...match.players.values()].filter((p) => !p.left);
  const colabTasks = countedColabTasks(match);
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
    meeting: match.meeting
      ? {
          ...match.meeting,
          votes: { ...match.meeting.votes },
          messages: match.meeting.messages ? [...match.meeting.messages] : [],
        }
      : null,
    emergencyButtonAvailable: match.emergencyCooldownMs <= 0 && !(match.sabotage?.active && match.sabotage.critical),
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
  const isGhost = !p.alive;
  const working = match.phase === "working";
  const teammates = isSabotador
    ? [...match.players.values()]
        .filter((o) => o.role === "sabotador" && o.id !== playerId)
        .map((o) => o.id)
    : undefined;

  let killTargetId: string | null = null;
  if (isSabotador && p.alive && p.killCooldownMs <= 0 && working) {
    let best = Infinity;
    for (const other of match.players.values()) {
      if (!other.alive || other.id === playerId || other.role === "sabotador") continue;
      const d = (other.pos.x - p.pos.x) ** 2 + (other.pos.z - p.pos.z) ** 2;
      if (d <= KILL_RANGE * KILL_RANGE && d < best && hasLineOfSight(p.pos, other.pos)) {
        best = d;
        killTargetId = other.id;
      }
    }
  }

  let reportTargetBodyId: string | null = null;
  if (p.alive && working) {
    for (const b of match.bodies) {
      if (b.reported) continue;
      if (within(b.pos, p.pos, REPORT_RANGE) && hasLineOfSight(p.pos, b.pos)) {
        reportTargetBodyId = b.id;
        break;
      }
    }
  }

  // Determina participantes e corpos visíveis com base no alcance e linha de visão (sem atravessar paredes)
  const isMeeting = match.phase === "meeting" || match.phase === "voting" || match.phase === "vote_result";
  const visionRadius = visionRadiusFor(match, p);

  const visiblePlayerIds: string[] = [];
  for (const other of match.players.values()) {
    if (other.left) continue;
    if (other.id === playerId || isGhost) {
      visiblePlayerIds.push(other.id);
      continue;
    }
    if (!other.alive) continue;
    if (isMeeting || canSeeFrom(p.pos, other.pos, visionRadius)) visiblePlayerIds.push(other.id);
  }

  const visibleBodyIds: string[] = [];
  if (!isMeeting) {
    for (const b of match.bodies) {
      if (isGhost || canSeeFrom(p.pos, b.pos, visionRadius)) visibleBodyIds.push(b.id);
    }
  }

  let nearbyInteractable: SuspeitoPrivate["nearbyInteractable"] = null;
  if (working && !p.left) {
    if (p.alive && match.sabotage?.active && within(match.sabotage.fixPos, p.pos, INTERACT_RANGE)) {
      nearbyInteractable = { kind: "sabotage", id: match.sabotage.type, label: `Consertar ${match.sabotage.title}` };
    }

    if (
      !nearbyInteractable &&
      p.alive &&
      p.emergencyMeetingsRemaining > 0 &&
      within(EMERGENCY_BUTTON_POS, p.pos, EMERGENCY_RANGE)
    ) {
      const critical = match.sabotage?.active && match.sabotage.critical;
      if (match.emergencyCooldownMs <= 0 && !critical) {
        nearbyInteractable = { kind: "emergency", id: "emergency_btn", label: "Acionar Reunião Emergencial" };
      } else {
        nearbyInteractable = {
          kind: "emergency",
          id: "emergency_btn",
          label: critical ? "Botão travado: resolva a emergência" : `Botão em ${Math.ceil(match.emergencyCooldownMs / 1000)}s`,
          blocked: true,
        };
      }
    }

    if (!nearbyInteractable && !(isGhost && isSabotador)) {
      for (const t of p.tasks) {
        if (t.completed || !within(t.pos, p.pos, INTERACT_RANGE)) continue;
        nearbyInteractable = isSuspeitoTaskBlocked(match, t)
          ? { kind: "task", id: t.id, label: `${t.name} (fora do ar)`, blocked: true }
          : { kind: "task", id: t.id, label: t.name };
        break;
      }
    }

    if (!nearbyInteractable && reportTargetBodyId) {
      nearbyInteractable = { kind: "body", id: reportTargetBodyId, label: "Reportar Ocorrência" };
    }
  }

  const activeChallenge = match.activeChallenges.get(playerId);
  let activeTaskState: SuspeitoTaskState | null = null;
  if (activeChallenge) {
    const c = activeChallenge.challenge;
    if (c.type === "termo") activeTaskState = { type: "termo", state: c.challenge.state };
    else if (c.type === "conexo") activeTaskState = { type: "conexo", state: c.challenge.state };
    else if (c.type === "contexto") activeTaskState = { type: "contexto", state: c.challenge.state };
    else if (c.type === "qte") activeTaskState = { type: "qte", state: c.challenge.state };
    else activeTaskState = { type: "quick", state: c.challenge.state };
  }

  return {
    role: p.role,
    sabotadorTeammates: teammates,
    tasks: p.tasks,
    activeTaskId: activeChallenge?.taskId ?? null,
    activeTaskState,
    killCooldownMs: p.killCooldownMs,
    sabotageCooldownMs: Math.max(p.sabotageCooldownMs, match.sabotageGlobalCooldownMs),
    emergencyMeetingsLeft: p.emergencyMeetingsRemaining,
    canReport: reportTargetBodyId !== null,
    reportTargetBodyId,
    canKill: killTargetId !== null,
    killTargetId,
    nearbyInteractable,
    myVote: p.voteTarget,
    visiblePlayerIds,
    visibleBodyIds,
    visionRadius,
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

export function getSuspeitoAwards(rows: SuspeitoResultRow[], _seed: number): Award[] {
  const candidates: Award[] = [];

  // 1. Funcionário do Mês: quem mais fez tarefas
  const topTasks = [...rows].filter((r) => r.role === "colaborador").sort((a, b) => b.tasksDone - a.tasksDone)[0];
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
