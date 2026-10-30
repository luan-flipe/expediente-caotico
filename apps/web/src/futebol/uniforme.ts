import { CLOTH_COLORS, FUT_COLORS, type AvatarDNA, type FutTeamConfig } from "@ec/shared";

/**
 * Peças existentes mais próximas de cada modelo (kit = índice de FUT_KITS):
 * Lisa = camiseta, Listrada = polo (gola e punho em tom diferente do corpo), Faixa = corta-vento.
 * shirt é o índice 1-based de apps/web/src/assets/camisetas; top é o espelho em TOPS (Camiseta, Polo, Moletom).
 */
const KITS = [
  { shirt: 1, top: 0 },
  { shirt: 2, top: 3 },
  { shirt: 4, top: 5 },
] as const;

/** Calça fixa: azul marinho, índice de CLOTH_COLORS + 1 (0 seria a cor original da peça). */
const PANTS_COLOR = CLOTH_COLORS.indexOf("#26324a") + 1;
/** Calça longa (01_calca) e sem acessório, para o crachá não aparecer no uniforme. */
const PANTS = 1;

const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const dist = (a: string, b: string): number => {
  const [p, q] = [rgb(a), rgb(b)];
  return p.reduce((s, v, i) => s + (v - q[i]) ** 2, 0);
};

/**
 * Para cada cor do time, o índice (1-based) de CLOTH_COLORS mais próximo, sem repetir:
 * os pares mais próximos são fechados primeiro, então dois times nunca ficam com a mesma cor.
 */
const TEAM_CLOTH: number[] = (() => {
  const pairs = FUT_COLORS.flatMap((c, i) => CLOTH_COLORS.map((h, j) => ({ i, j, d: dist(c.hex, h) })));
  pairs.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
  const out: number[] = [];
  const used = new Set<number>();
  for (const { i, j } of pairs) {
    if (out[i] !== undefined || used.has(j)) continue;
    out[i] = j + 1;
    used.add(j);
  }
  return out;
})();

const valid = (v: number, len: number): number => (Number.isInteger(v) && v >= 0 && v < len ? v : 0);

/** Boneco com a camisa do time: mantém rosto, cabelo, pele, corpo e tênis; troca camiseta, calça e acessório. */
export function uniformDNA(avatar: AvatarDNA, team: FutTeamConfig): AvatarDNA {
  const kit = KITS[valid(team.kit, KITS.length)];
  return {
    ...avatar,
    top: kit.top,
    bottom: 0,
    shirt: kit.shirt,
    shirtColor: TEAM_CLOTH[valid(team.color, FUT_COLORS.length)],
    pants: PANTS,
    pantsColor: PANTS_COLOR,
    accessory: 0,
  };
}
