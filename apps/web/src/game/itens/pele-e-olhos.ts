/**
 * Itens da aba "Pele e olhos" do crachá. Cores de pele e de olho são só tinta (SKINS, EYE_COLORS em
 * @ec/shared). Os rostos não têm modelo próprio: usam as peças de expressão que o designer pôs no
 * boneco_bebe.glb (sobrancelhas, pálpebras e boca da cara brava, veia e as pálpebras do piscar),
 * no tamanho em que vieram. Uma peça pode girar no plano do rosto e subir; ela continua colada à pele.
 */

export interface FacePiece {
  /** Nome da peça no boneco_bebe.glb. */
  node: string;
  /** Giro em graus em volta do próprio centro (positivo: anti-horário, visto de frente). */
  turn?: number;
  /** Quanto sobe (negativo desce), no espaço do bebê. */
  up?: number;
}

export interface FaceDef {
  pieces: FacePiece[];
  /** Apaga a sobrancelha pintada no rosto, porque o rosto põe as dele em outro lugar. */
  hideBrows?: boolean;
}

const brava = ["palpebra_D", "sobrancelha_D", "palpebra_E", "sobrancelha_E", "boca"].map((node) => ({ node }));

/** Por índice de FACES (0 = feliz, o rosto do bebê como veio). */
export const ROSTOS: FaceDef[] = [
  // Feliz
  { pieces: [] },
  // Bravo: a cara brava do designer, sem a veia
  { pieces: brava, hideBrows: true },
  // Furioso
  { pieces: [...brava, { node: "veia" }], hideBrows: true },
  // Surpreso: sobrancelhas no alto e retas; o olho fica do tamanho que é
  {
    pieces: [
      { node: "sobrancelha_D", turn: 18, up: 0.05 },
      { node: "sobrancelha_E", turn: -18, up: 0.05 },
    ],
    hideBrows: true,
  },
  // Preocupado: a ponta de dentro das sobrancelhas sobe, boca da cara brava
  {
    pieces: [{ node: "sobrancelha_D", turn: 34, up: 0.02 }, { node: "sobrancelha_E", turn: -34, up: 0.02 }, { node: "boca" }],
    hideBrows: true,
  },
  // Desconfiado (olho torto): um olho meio fechado com a sobrancelha baixa, a outra erguida
  {
    pieces: [{ node: "piscar_meio_D" }, { node: "sobrancelha_D", up: -0.01 }, { node: "sobrancelha_E", turn: -14, up: 0.04 }],
    hideBrows: true,
  },
  // Sonolento
  { pieces: [{ node: "piscar_meio_D" }, { node: "piscar_meio_E" }] },
  // Entediado
  { pieces: [{ node: "piscar_meio_D" }, { node: "piscar_meio_E" }, { node: "boca" }] },
  // Piscadinha
  { pieces: [{ node: "piscar_fechado_E" }] },
];
