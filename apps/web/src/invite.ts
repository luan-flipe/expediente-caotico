// Convite da sala: link com ?sala=CODIGO e frase curta para colar no WhatsApp/Teams.

/** Link de convite. A origem vem do navegador (produção: https://expedientecaotico.cavel.com.br). */
export function inviteUrl(origin: string, code: string): string {
  return `${origin}/?sala=${encodeURIComponent(code)}`;
}

/** Frase enviada junto com o link. */
export function inviteText(origin: string, code: string): string {
  return `Bora jogar Expediente Caótico? Sala ${code}: ${inviteUrl(origin, code)}`;
}

/** Só celular/tablet com toque abre o menu nativo de compartilhar; no computador copia direto. */
export function canNativeShare(nav: { share?: unknown; maxTouchPoints?: number }): boolean {
  return typeof nav.share === "function" && (nav.maxTouchPoints ?? 0) > 0;
}
