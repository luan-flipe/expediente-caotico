import type { AvatarDNA, Vec2 } from "../types";
import type { Award } from "../awards";

export type SuspeitoRole = "colaborador" | "sabotador";

export type SuspeitoPhase =
  | "intro"
  | "working"
  | "meeting"
  | "voting"
  | "vote_result"
  | "over";

export type SuspeitoVictoryReason =
  | "tasks_completed"
  | "impostors_parity"
  | "sabotage_critical"
  | "impostors_ejected";

export type SuspeitoSectorId =
  | "recepcao"
  | "reuniao"
  | "desenvolvimento"
  | "financeiro"
  | "rh"
  | "suporte"
  | "diretoria"
  | "arquivo"
  | "copa"
  | "infra"
  | "servidores"
  | "impressao";

export interface SuspeitoSectorInfo {
  id: SuspeitoSectorId;
  name: string;
  color: string;
  floorColor: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

export type SuspeitoSabotageType =
  | "vazamento_dados" // crítica: se o contador zerar, sabotadores vencem
  | "falha_energia"   // distração: reduz iluminação e visão
  | "queda_rede"       // distração: bloqueia tarefas digitais
  | "impressora_travada"; // distração: bloqueia setor de impressão

export interface SuspeitoSabotageState {
  type: SuspeitoSabotageType;
  title: string;
  description: string;
  critical: boolean;
  active: boolean;
  remainingMs: number;
  totalMs: number;
  fixSector: SuspeitoSectorId;
  fixPos: Vec2;
  fixed: boolean;
}

export type SuspeitoTaskType =
  | "termo"
  | "conexo"
  | "contexto"
  | "cabeamento"
  | "organizar_arquivos"
  | "reiniciar_servidor"
  | "qte_reacao"
  | "qte_sequencia"
  | "qte_cabos"
  | "qte_impressora";

export interface TermoEvaluation {
  letter: string;
  status: "correct" | "present" | "absent";
}

export interface TermoGuess {
  word: string;
  evaluations: TermoEvaluation[];
}

export interface TermoTaskState {
  wordLength: number;
  maxGuesses: number;
  guesses: TermoGuess[];
  solved: boolean;
  failed: boolean;
}

export interface ConexoGroup {
  id: string;
  title: string;
  words: [string, string, string, string];
  solved: boolean;
}

export interface ConexoTaskState {
  allWords: string[];
  solvedGroups: { title: string; words: string[] }[];
  mistakesRemaining: number;
  solved: boolean;
  failed: boolean;
  oneAway?: boolean;
}

export interface ContextoGuess {
  word: string;
  distance: number; // 1 = mais próximo (alvo), maior = mais longe
  temperature: "hot" | "warm" | "cold";
}

export interface ContextoTaskState {
  category: string;
  hint: string;
  guesses: ContextoGuess[];
  bestDistance: number;
  solved: boolean;
  maxGuesses: number;
}

export interface QuickTaskState {
  step: number;
  totalSteps: number;
  completed: boolean;
}

export interface QteTimingState {
  kind: "timing";
  targetMin: number; // 0 a 1 (ex: 0.45)
  targetMax: number; // 0 a 1 (ex: 0.65)
  durationSec: number;
  completed: boolean;
  failed: boolean;
}

export interface QteSequenceState {
  kind: "sequence";
  sequence: string[];
  currentIndex: number;
  completed: boolean;
  failed: boolean;
}

export interface QteWiresState {
  kind: "wires";
  colors: string[]; // ex: ["red", "blue", "yellow", "green"]
  connected: string[];
  completed: boolean;
}

export interface QtePrinterState {
  kind: "printer";
  step: number;
  stepLabels: string[];
  completed: boolean;
}

export type QteTaskState = QteTimingState | QteSequenceState | QteWiresState | QtePrinterState;

export type SuspeitoTaskState =
  | { type: "termo"; state: TermoTaskState }
  | { type: "conexo"; state: ConexoTaskState }
  | { type: "contexto"; state: ContextoTaskState }
  | { type: "quick"; state: QuickTaskState }
  | { type: "qte"; state: QteTaskState };

export interface SuspeitoTask {
  id: string;
  name: string;
  description: string;
  sector: SuspeitoSectorId;
  type: SuspeitoTaskType;
  pos: Vec2;
  completed: boolean;
  resumable: boolean;
}

export interface SuspeitoBody {
  id: string;
  victimId: string;
  victimName: string;
  avatar: AvatarDNA;
  pos: Vec2;
  sector: SuspeitoSectorId;
  reported: boolean;
}

export interface SuspeitoMeetingMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  kind: "report" | "accuse" | "alibi" | "defense" | "chat";
}

export interface SuspeitoMeetingState {
  phase: "discussion" | "voting" | "result";
  callerId: string;
  callerName: string;
  reason: "emergency" | "body";
  reportedVictimName?: string;
  reportedBodySector?: SuspeitoSectorId;
  remainingMs: number;
  totalDiscussionMs: number;
  totalVotingMs: number;
  votes: Record<string, string>; // voterId -> targetPlayerId | "skip"
  ejectedId: string | null;      // playerId | "skip" | "tie" | null
  ejectedName?: string;
  ejectedRole?: SuspeitoRole;
  messages?: SuspeitoMeetingMessage[];
}

export interface SuspeitoPlayerPublic {
  id: string;
  name: string;
  avatar: AvatarDNA;
  isBot: boolean;
  alive: boolean;
  pos: Vec2;
  yaw: number;
  moving: boolean;
  sector: SuspeitoSectorId;
}

export interface SuspeitoSnapshot {
  tick: number;
  phase: SuspeitoPhase;
  phaseRemainingMs: number;
  players: SuspeitoPlayerPublic[];
  bodies: SuspeitoBody[];
  taskProgress: number; // 0 a 1
  sabotage: SuspeitoSabotageState | null;
  meeting: SuspeitoMeetingState | null;
  emergencyButtonAvailable: boolean;
  emergencyCooldownMs: number;
  winner: SuspeitoRole | null;
  winReason: SuspeitoVictoryReason | null;
}

export interface SuspeitoPrivate {
  role: SuspeitoRole;
  sabotadorTeammates?: string[];
  tasks: SuspeitoTask[];
  activeTaskId: string | null;
  activeTaskState: SuspeitoTaskState | null;
  killCooldownMs: number;
  sabotageCooldownMs: number;
  emergencyMeetingsLeft: number;
  canReport: boolean;
  reportTargetBodyId: string | null;
  canKill: boolean;
  killTargetId: string | null;
  nearbyInteractable: {
    kind: "task" | "body" | "emergency" | "sabotage";
    id: string;
    label: string;
    blocked?: boolean;
  } | null;
  myVote: string | null;
  visiblePlayerIds: string[];
  visibleBodyIds: string[];
  visionRadius: number;
  killedBy?: { id: string; name: string; avatar: AvatarDNA };
}

export interface SuspeitoResultRow {
  id: string;
  name: string;
  isBot: boolean;
  role: SuspeitoRole;
  alive: boolean;
  tasksDone: number;
  kills: number;
  votesReceived: number;
}

export interface SuspeitoResults {
  winner: SuspeitoRole;
  reason: SuspeitoVictoryReason;
  rows: SuspeitoResultRow[];
  awards: Award[];
}

export interface SuspeitoPlayerInfo {
  id: string;
  name: string;
  avatar: AvatarDNA;
  isBot: boolean;
  role?: SuspeitoRole;
}
