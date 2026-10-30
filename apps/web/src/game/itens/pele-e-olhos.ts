/**
 * Itens da aba "Pele e olhos" do crachá. Cores de pele e de olho são só tinta (SKINS, EYE_COLORS em
 * @ec/shared). Cada rosto é uma expressão do designer: a textura do corpo inteira, com olhos,
 * sobrancelhas e boca pintados (pasta assets/rostos), na ordem de FACES. O rosto fica parado como foi
 * pintado: o olho não pisca e o arremesso não põe a cara brava por cima.
 */

export interface FaceDef {
  /** Nome do arquivo da pasta assets/rostos sem o número: "triste" é 03_triste.jpg. */
  texture: string;
  /** Se a íris aparece e pega a cor de olho do crachá (no olho fechado, o traço fica como veio). */
  iris: boolean;
}

/** Por índice de FACES. */
export const ROSTOS: FaceDef[] = [
  { texture: "neutro", iris: true },
  // olhos fechados de sorriso
  { texture: "feliz", iris: false },
  { texture: "triste", iris: true },
  { texture: "preocupado", iris: true },
  { texture: "desconfiado", iris: true },
  { texture: "sono", iris: true },
];
