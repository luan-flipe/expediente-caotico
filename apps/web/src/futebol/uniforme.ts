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

/** Índice (1-based) de CLOTH_COLORS com o mesmo hex de cada cor do time. */
const TEAM_CLOTH: number[] = FUT_COLORS.map((c) => {
  const i = CLOTH_COLORS.indexOf(c.hex);
  if (i < 0) throw new Error("FUT_COLORS fora de CLOTH_COLORS: " + c.hex);
  return i + 1;
});

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
