import type { AbilityId, AbilityParams } from "../types";

export interface SynergyDef {
  id: string;
  name: string;
  desc: string;
  requires: [AbilityId, AbilityId];
  /** Habilidade que recebe o bônus. */
  target: AbilityId;
  mod: AbilityParams;
}

/** Bônus simples e limitados: só somam parâmetros, sem disparar novos efeitos. */
export const SYNERGIES: SynergyDef[] = [
  { id: "rede-instavel", name: "Rede instável", desc: "Alvos do Choque do TI ficam lentos por 1 s", requires: ["A1", "D1"], target: "A1", mod: { slowMs: 1000, slowPct: 0.3 } },
  { id: "cafe-no-papel", name: "Café no papel", desc: "Folhas da impressora cegam por 0,5 s", requires: ["B1", "A3"], target: "A3", mod: { blindMs: 500 } },
  { id: "mobilia-voadora", name: "Mobília voadora", desc: "Empurrão da Cadeira Giratória +50%", requires: ["B3", "A2"], target: "A2", mod: { knock: 4.5 } },
  { id: "plantao-juridico", name: "Plantão jurídico", desc: "Lançar Reunião Obrigatória dá escudo de 15", requires: ["C2", "D2"], target: "D2", mod: { shield: 15 } },
];
