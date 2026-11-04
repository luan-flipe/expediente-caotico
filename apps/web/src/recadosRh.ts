/** Recados cômicos da Diretoria e do RH da firma para o mural inicial. */
export const RECADOS_RH = [
  "Favor não esquentar peixe no micro-ondas da copa do 2º andar.",
  "Quem pegou o grampeador de metal da recepção, favor devolver discretamente.",
  "A máquina de café não aceita mais reclamações sobre a segunda-feira.",
  "Circular 042: Corridas de cadeira continuam proibidas após as 18h (antes das 18h é por sua conta e risco).",
  "Lembrete: Bolinhas de papel arremessadas na supervisão não contam como feedback 360°.",
  "Meta do mês batida: comemoração com pizza fria e refrigerante sem gás na copa às 17h.",
  "O TI informa: Reiniciar o computador resolve 99% dos problemas do tiroteio.",
  "Alinhamento de expectativas: Essa reunião poderia ter sido uma disputa de bolinha de papel.",
  "Etiqueta corporativa: Responder e-mail com 'conforme alinhado' é considerado declaração de guerra passivo-agressiva.",
  "Setor de Ergonomia: A postura ideal para o arremesso de papel é coluna ereta e sorriso corporativo.",
  "Solicitações de aumento salarial devem ser feitas exclusivamente acertando o alvo da diretoria.",
  "Avisamos que o ar condicionado foi travado em 16°C por decisão irrevogável de quem senta embaixo dele.",
  "Favor não guardar cadeira ergonômica com cadeado; o patrimônio pertence a todos os pilotos.",
  "Trabalhe duro hoje para que amanhã o seu chefe possa comprar outro helicóptero.",
] as const;

export function recadoAleatorio(rnd: () => number = Math.random): string {
  return RECADOS_RH[Math.floor(rnd() * RECADOS_RH.length) % RECADOS_RH.length]!;
}
