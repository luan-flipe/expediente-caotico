interface BallState {
  x: number;
  vx: number;
}

/** Velocidade (m/s) da bola rumo ao gol que conta como ataque completo. */
const ATTACK_SPEED = 18;

/**
 * Empolgação da torcida de fundo (0 a 1): sobe com a bola perto de um gol (zona de 70% da meia-extensão do campo)
 * e mais ainda quando ela vai em direção a ele (ataque).
 */
export function crowdLevel(ball: BallState, halfL: number): number {
  const toGoal = Math.sign(ball.x) || 1;
  const prox = Math.max(0, Math.min(1, 1 - (halfL - Math.abs(ball.x)) / (halfL * 0.7)));
  const attack = Math.max(0, Math.min(1, (ball.vx * toGoal) / ATTACK_SPEED));
  return Math.min(1, 0.25 + 0.5 * prox + 0.25 * prox * attack * 2);
}
