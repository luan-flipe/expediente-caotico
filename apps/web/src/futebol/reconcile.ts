import { markCarry, type FutPlayer, type FutPrivate, type FutSnapshot } from "@ec/shared";

/** Jogador local de partida do servidor: o que o snapshot traz, a recuperação (slowMs) do estado privado e quem conduz a bola. */
export function predictedPlayer(p: FutSnapshot["players"][number], me: FutPrivate, ballOwnerId: string | null): FutPlayer {
  const next: FutPlayer = {
    id: p.id,
    side: p.side,
    role: "linha",
    x: p.x,
    z: p.z,
    vx: p.vx,
    vz: p.vz,
    facing: p.facing,
    chargeMs: 0,
    chargeKind: null,
    tackleMs: 0,
    downMs: 0,
    yellow: p.yellow,
    sentOff: false,
    isBot: false,
    slowMs: me.slowMs,
  };
  markCarry(next, ballOwnerId);
  return next;
}

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

/** O último seq confirmado pelo servidor andou para trás: a sessão foi retomada depois de uma queda e o contador recomeçou. Os comandos pendentes nunca chegaram. */
export function ackRecuou(prev: number, next: number): boolean {
  return next < prev;
}
