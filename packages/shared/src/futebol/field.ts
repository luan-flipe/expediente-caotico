import type { Field, FutFormat } from "./types";

/** Campo total (comprimento x largura) por formato. */
const SIZES: Record<FutFormat, [number, number]> = {
  1: [30, 20],
  2: [40, 26],
  3: [50, 32],
  4: [60, 38],
};

export function fieldFor(format: FutFormat): Field {
  const [L, W] = SIZES[format];
  const boxL = L * 0.16;
  return {
    halfL: L / 2,
    halfW: W / 2,
    goalHalfW: 2,
    goalH: 2,
    boxL,
    boxHalfW: W * 0.3,
    penaltySpot: boxL * 0.7,
  };
}
