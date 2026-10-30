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

/** Versão mínima da partida (a Tarefa 8 estende). connected = ids humanos
 *  conectados; bots e goleiros contam sempre como presentes. */
export interface FutMatch {
  field: Field;
  players: FutPlayer[];
  ball: Ball;
  restart: Restart | null;
  connected: Set<string>;
}
