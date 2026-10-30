import type { BotLevel } from "../botLevels";
import type { AvatarDNA } from "../types";
/** Jogadores de linha por time (sem contar o goleiro). */
export type FutFormat = 1 | 2 | 3 | 4;
export const FUT_FORMATS = [1, 2, 3, 4] as const;

export type TeamSide = 0 | 1;

/** Medidas do campo em metros, origem no centro, gols em x = +-halfL. */
export interface Field {
  halfL: number;
  halfW: number;
  goalHalfW: number;
  goalH: number;
  boxL: number;
  boxHalfW: number;
  penaltySpot: number;
}

/** Intenção do jogador de linha. Botão esquerdo = kick, direito = pass;
 *  sem a bola, kick vira carrinho e pass vira disputa. */
export interface FutInput {
  mx: number;
  mz: number;
  aim: number;
  sprint: boolean;
  kick: "none" | "charge" | "release";
  pass: "none" | "charge" | "release";
}

export interface FutPlayer {
  id: string;
  side: TeamSide;
  role: "linha" | "goleiro";
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  chargeMs: number;
  chargeKind: "kick" | "pass" | null;
  tackleMs: number;
  downMs: number;
  yellow: number;
  sentOff: boolean;
  isBot: boolean;
}

/** Quem tocou na bola (para saber de quem foi o último toque). */
export interface BallTouch {
  id: string;
  side: TeamSide;
  /** Quando (tempo da partida, ms) o toque aconteceu; a partida carimba (assistência). */
  at?: number;
}

/** Bola em 3D: y é a altura do centro; no chão y = ballRadius. */
export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ownerId: string | null;
  lastTouch: BallTouch | null;
  prevTouch: BallTouch | null;
}

export type RestartKind = "lateral" | "escanteio" | "meta" | "falta" | "penalti" | "saida";

/** Bola parada em espera: só o cobrador toca; leftMs chega a 0 e a IA cobra. */
export interface Restart {
  kind: RestartKind;
  side: TeamSide;
  x: number;
  z: number;
  takerId: string;
  leftMs: number;
}

export type FutPhase = "kickoff" | "play" | "restart" | "goal" | "penalties" | "over";

export type FutEvent =
  | { type: "goal"; side: TeamSide; scorerId: string | null; assistId: string | null; own: boolean }
  | { type: "card"; id: string; card: "yellow" | "red" }
  | { type: "foul"; id: string }
  | { type: "restart"; kind: RestartKind }
  | { type: "whistle"; kind: "start" | "half" | "end" }
  | { type: "pen"; side: TeamSide; takerId: string; scored: boolean };

/** Uniforme de um time: kit = índice do modelo (0..2), color = índice da cor (0..7). */
export interface FutTeamConfig {
  name: string;
  kit: number;
  color: number;
}

/** Dados fixos de cada jogador e o que ele fez na partida. human = entrou como humano. */
export interface FutPlayerInfo {
  name: string;
  avatar: AvatarDNA;
  accountId: string | null;
  human: boolean;
  goals: number;
  assists: number;
}

/** Disputa de pênaltis: cobranças alternadas, cinco por time e depois morte súbita. */
export interface Shootout {
  goals: [number, number];
  taken: [number, number];
  /** Time que cobra agora. */
  turn: TeamSide;
  stage: "aim" | "flight" | "result";
  takerId: string;
  keeperId: string;
  timerMs: number;
}

/** Partida completa. connected = ids humanos conectados; bots e goleiros contam sempre. */
export interface FutMatch {
  field: Field;
  players: FutPlayer[];
  ball: Ball;
  restart: Restart | null;
  connected: Set<string>;
  /** RNG determinístico da partida (mulberry32 da seed). */
  rng: () => number;
  now: number;
  phase: FutPhase;
  /** Tempo restante da fase de espera (kickoff, goal). */
  phaseMs: number;
  elapsedMs: number;
  durationMs: number;
  format: FutFormat;
  botLevel: BotLevel;
  seed: number;
  score: [number, number];
  teams: [FutTeamConfig, FutTeamConfig];
  info: Map<string, FutPlayerInfo>;
  inputs: Map<string, FutInput>;
  ack: Map<string, number>;
  events: FutEvent[];
  /** Time que sofreu o último gol (faz a saída do meio). */
  kickoffSide: TeamSide;
  halfDone: boolean;
  /** Toque cujo chute o goleiro já deixou passar (não tenta de novo). */
  beaten: BallTouch | null;
  shootout: Shootout | null;
  winner: TeamSide | null;
}

export interface FutSnapshot {
  t: number;
  phase: FutPhase;
  elapsedMs: number;
  durationMs: number;
  celebrateMs: number;
  format: FutFormat;
  score: [number, number];
  pens: { goals: [number, number]; taken: [number, number]; takerId: string } | null;
  teams: [FutTeamConfig, FutTeamConfig];
  restart: { kind: RestartKind; side: TeamSide; x: number; z: number; takerId: string; leftMs: number } | null;
  ball: { x: number; y: number; z: number; vx: number; vy: number; vz: number; ownerId: string | null };
  players: {
    id: string;
    name: string;
    side: TeamSide;
    role: "linha" | "goleiro";
    x: number;
    z: number;
    vx: number;
    vz: number;
    facing: number;
    sliding: boolean;
    down: boolean;
    yellow: number;
    sentOff: boolean;
    isBot: boolean;
    connected: boolean;
  }[];
  events: FutEvent[];
}

export interface FutPrivate {
  chargeMs: number;
  /** Último seq de entrada confirmado. */
  ackSeq: number;
}

export interface FutResultRow {
  id: string;
  name: string;
  side: TeamSide;
  isBot: boolean;
  accountId: string | null;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
}
