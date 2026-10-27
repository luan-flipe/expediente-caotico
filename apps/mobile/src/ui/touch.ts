/** Raio do joystick em pontos da tela: arrastar até a borda é intensidade 1. */
export const STICK_RADIUS = 56;
/** Abaixo disso o joystick conta como solto (o polegar treme parado). */
export const STICK_DEADZONE = 0.12;

/**
 * Deslocamento do dedo desde o toque inicial vira um vetor com comprimento até 1.
 * x = direita, y = para cima na tela (frente do boneco ou da cadeira).
 */
export function stickVector(dx: number, dy: number, radius = STICK_RADIUS): { x: number; y: number } {
  let x = dx / radius;
  let y = -dy / radius;
  const len = Math.hypot(x, y);
  if (len < STICK_DEADZONE) return { x: 0, y: 0 };
  if (len > 1) {
    x /= len;
    y /= len;
  }
  return { x, y };
}

/** Volante da corrida: só o eixo horizontal, com curva suave perto do centro para ajustes finos. */
export function steerFrom(dx: number, radius = STICK_RADIUS): number {
  const v = Math.max(-1, Math.min(1, dx / radius));
  if (Math.abs(v) < STICK_DEADZONE) return 0;
  return Math.sign(v) * Math.pow(Math.abs(v), 1.4);
}
