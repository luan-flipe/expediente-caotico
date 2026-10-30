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
