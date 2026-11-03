import { IPATINGAO } from "./balance";
import type { Field, FutFormat } from "./types";

/** Campo total (comprimento x largura) por formato. */
const SIZES: Record<FutFormat, [number, number]> = {
  1: [30, 20],
  2: [40, 26],
  3: [50, 32],
  4: [60, 38],
  // gramado inteiro do estádio: as linhas do mapa (97,04 x 60,7 m)
  5: [IPATINGAO.grassHalfL * 2, IPATINGAO.grassHalfW * 2],
};

/** Meia-boca e altura (m) do gol: o do estádio é maior, na proporção do campo. */
const GOAL: Record<FutFormat, [number, number]> = { 1: [2, 2], 2: [2, 2], 3: [2, 2], 4: [2, 2], 5: [3, 2.2] };

export function fieldFor(format: FutFormat): Field {
  const [L, W] = SIZES[format];
  const boxL = L * 0.16;
  const [goalHalfW, goalH] = GOAL[format];
  return {
    halfL: L / 2,
    halfW: W / 2,
    goalHalfW,
    goalH,
    boxL,
    boxHalfW: W * 0.3,
    penaltySpot: boxL * 0.7,
  };
}
