/** Dicas da tela de carregamento. */
export const DICAS = [
  "Derrapar e soltar dá um turbo. Quanto mais longa a derrapagem, maior o turbo.",
  "Rampas dão turbo de manobra: aperte derrapar no ar e pouse bem.",
  "Quem fica na cola de outro pilota ganha vácuo e emparelha na reta.",
  "Segurar o item pode salvar a volta: grampeador acerta quem vem atrás.",
  "Perdido na pista? A tecla R devolve a cadeira ao caminho.",
  "Atalho é mais curto, mas estreito. Só vale se você acertar a entrada.",
  "No Contra o relógio você corre contra o fantasma da sua melhor volta.",
  "Toque em Chat rápido para mandar um emote antes de ganhar a corrida.",
  "Entrar com o Google guarda suas vitórias no ranking da firma.",
  "Convide os colegas pelo WhatsApp: o botão fica na sala de espera.",
] as const;

/** Uma dica por abertura da tela (sorteio simples). */
export function dicaAleatoria(rnd: () => number = Math.random): string {
  return DICAS[Math.floor(rnd() * DICAS.length) % DICAS.length]!;
}
