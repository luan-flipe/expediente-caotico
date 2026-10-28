/**
 * Itens da aba "Cabelo e barba" do crachá. Cada tipo tem a sua pasta de modelos em
 * public/assets/characters/cabelo-e-barba/ e o seu registro aqui, pelo índice da lista com os nomes
 * em @ec/shared (HAIR_STYLES, BEARDS). Item novo: o GLB na pasta do tipo e uma linha no registro.
 */

const PASTA = "/assets/characters/cabelo-e-barba";

/** Peça presa ao osso da cabeça: escala e deslocamento que levam o modelo à cabeça do bebê na pose de origem. */
export type PieceDef = { url: string; scale: number; offset: [number, number, number] };

/** Cabelos modelados pelo designer (OBJ reduzido para GLB), por índice de HAIR_STYLES (0 = careca). */
export const CABELOS: Record<number, PieceDef> = {
  1: { url: `${PASTA}/cabelos/repicado.glb`, scale: 0.62, offset: [0, 0.839, -0.03] },
  // na proporção do repicado; o centro de dentro do black power (z 0,126) vai um pouco atrás e acima
  // do centro da cabeça, para a nuca ficar dentro do cabelo
  2: { url: `${PASTA}/cabelos/black_power.glb`, scale: 0.66, offset: [-0.004, 0.869, -0.113] },
  // derivados dos dois acima e gravados já encaixados no bebê: o longo estica as mechas de trás e dos
  // lados do repicado; o médio cacheado é o black power mais rente à cabeça, descendo até a nuca
  3: { url: `${PASTA}/cabelos/longo.glb`, scale: 1, offset: [0, 0, 0] },
  4: { url: `${PASTA}/cabelos/medio_cacheado.glb`, scale: 1, offset: [0, 0, 0] },
};

/**
 * Barbas do designer, por índice de BEARDS (0 = sem barba), tiradas do bebê com barba já no lugar e com
 * os pesos do esqueleto dele: a ponta da longa segue o tronco, não só a cabeça.
 */
export const BARBAS: Record<number, string> = {
  1: `${PASTA}/barbas/barba.glb`,
  2: `${PASTA}/barbas/barba_longa.glb`,
};
