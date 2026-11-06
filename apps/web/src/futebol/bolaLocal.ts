interface Xz {
  x: number;
  z: number;
}

/** Taxa (1/s) com que a bola passa a seguir meu boneco ao dominá-la, e a que solta dele ao perdê-la ou chutá-la. */
export const CARRY_IN_RATE = 25;
export const CARRY_OUT_RATE = 12;

/**
 * Meu boneco é desenhado pela predição (sem atraso) e a bola, pelo servidor com atraso de interpolação: correndo
 * com ela, a bola ficaria uns 0,7 m para trás, debaixo do pé. Enquanto sou o dono, a bola leva o mesmo deslocamento
 * (boneco desenhado menos boneco do servidor no mesmo instante) e fica à frente do pé como a sim a pôs.
 */
export function localBallPos(ball: Xz, meServer: Xz | null, meDrawn: Xz, weight: number): Xz {
  if (!meServer || weight <= 0) return { x: ball.x, z: ball.z };
  return { x: ball.x + (meDrawn.x - meServer.x) * weight, z: ball.z + (meDrawn.z - meServer.z) * weight };
}

/** Peso do deslocamento: sobe rápido enquanto sou o dono e desce mais devagar depois (sem salto na bola). */
export function carryWeight(w: number, owner: boolean, dt: number): number {
  const target = owner ? 1 : 0;
  return w + (target - w) * (1 - Math.exp(-dt * (owner ? CARRY_IN_RATE : CARRY_OUT_RATE)));
}
