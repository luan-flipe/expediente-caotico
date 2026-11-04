/**
 * Anunciantes das placas de LED em volta do campo do Futebol da Firma.
 *
 * Como adicionar um anunciante real:
 * 1. Salve o logo (PNG ou SVG, fundo transparente ou da cor da placa, proporção larga, ~4:1)
 *    em apps/web/src/assets/futebol/anuncios/ (ex.: cafe-da-copa.png).
 * 2. Importe a URL no topo deste arquivo:
 *      import cafeLogo from "../assets/futebol/anuncios/cafe-da-copa.png?url";
 * 3. Acrescente uma linha na lista ANUNCIANTES:
 *      { nome: "Café da Copa", cor: "#3b1f0f", corTexto: "#ffe9c2", imagem: cafeLogo },
 *    `cor` é o fundo da placa e `corTexto` a cor do nome. Sem `imagem`, a placa desenha só o nome.
 *
 * As placas passam os anunciantes em rodízio (a cada ROTACAO_ANUNCIOS_S segundos). Todos os
 * exemplos abaixo são fictícios, com temas do próprio jogo; não use marcas reais sem contrato.
 */
export interface Anunciante {
  nome: string;
  /** Fundo da placa. */
  cor: string;
  /** Cor do texto do nome. */
  corTexto: string;
  /** URL do logo (opcional). Sem ela, a placa desenha o nome. */
  imagem?: string;
  /** Moldura de destaque (a placa "ANUNCIE AQUI"). */
  destaque?: boolean;
}

export const ROTACAO_ANUNCIOS_S = 8;

export const ANUNCIANTES: readonly Anunciante[] = [
  { nome: "ANUNCIE AQUI", cor: "#ffd21f", corTexto: "#17130d", destaque: true },
  { nome: "Expediente Caótico", cor: "#1c1a17", corTexto: "#ffd21f" },
  { nome: "Café da Copa", cor: "#3b1f0f", corTexto: "#ffe9c2" },
  { nome: "Grampeador Turbo", cor: "#d83a2e", corTexto: "#ffffff" },
  { nome: "RH Express", cor: "#1f5fbf", corTexto: "#ffffff" },
  { nome: "Impressora Descontrolada", cor: "#2c8a57", corTexto: "#f4fff6" },
];
