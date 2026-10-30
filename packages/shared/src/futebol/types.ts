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
