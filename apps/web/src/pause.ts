/** O que trava o comando do jogador: qualquer tela por cima da partida (o servidor segue rodando). */
export interface Overlays {
  settingsOpen: boolean;
  chatOpen: boolean;
  pauseOpen: boolean;
}

/** Com alguma tela aberta por cima, o jogo não lê teclado nem toque e manda comando parado. */
export function inputBlocked(s: Overlays): boolean {
  return s.settingsOpen || s.chatOpen || s.pauseOpen;
}

export type EscAction = "closeSettings" | "closePause" | "openPause" | null;

/**
 * O que o Esc faz agora. As configurações fecham primeiro (voltando ao menu de pausa se ele estava aberto),
 * depois o menu de pausa. Na partida, sem o mouse preso, abre o menu. Com o mouse preso o navegador
 * consome o Esc para soltá-lo, e quem abre o menu aí é o sinal de soltar.
 */
export function escAction(s: { settingsOpen: boolean; pauseOpen: boolean; inMatch: boolean; pointerLocked: boolean }): EscAction {
  if (s.settingsOpen) return "closeSettings";
  if (s.pauseOpen) return "closePause";
  if (s.inMatch && !s.pointerLocked) return "openPause";
  return null;
}
