export interface XZ {
  x: number;
  z: number;
}

/**
 * Reconciliação da posição desenhada do próprio boneco. `drawn` é onde ele aparece agora, `next` a nova previsão
 * (estado do servidor + comandos pendentes). Devolve o novo ponto anterior (a previsão passa a valer de `next`)
 * e o desvio visual que mantém o desenhado onde estava; o desvio some aos poucos. Erro acima de `maxErr`: aceita sem suavizar.
 */
export function reconcileDrawn(drawn: XZ, next: XZ, maxErr = 3): { prev: XZ; vis: XZ } {
  const dx = drawn.x - next.x;
  const dz = drawn.z - next.z;
  if (Math.hypot(dx, dz) > maxErr) return { prev: { x: next.x, z: next.z }, vis: { x: 0, z: 0 } };
  return { prev: { x: next.x, z: next.z }, vis: { x: dx, z: dz } };
}
