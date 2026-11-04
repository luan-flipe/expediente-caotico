import type { FutSnapshot, TeamSide } from "@ec/shared";

/** Papel do jogador numa cobrança de pênalti: cobra, escolhe o pulo do goleiro (o humano do time que defende) ou só assiste. */
export type PenaltyRole = "taker" | "keeper" | "watch";

/** Mesma regra do servidor (penalties.ts): o piloto do goleiro é o primeiro humano conectado e em campo do time que defende. */
export function penaltyRole(s: FutSnapshot, myId: string): PenaltyRole | null {
  if (s.phase === "penalties" && s.pens) {
    if (s.pens.stage !== "aim") {
      return null;
    }
    if (s.pens.takerId === myId) {
      return "taker";
    }
    const pilot = s.players
      .filter((p) => p.role === "linha" && p.side !== s.pens!.turn && !p.isBot && p.connected && !p.sentOff)
      .map((p) => p.id)
      .sort()[0];
    return pilot === myId ? "keeper" : "watch";
  }
  if (s.restart?.kind === "penalti" && s.restart.takerId === myId) {
    return "taker";
  }
  return null;
}

/** Lado do time que ataca o gol da cobrança (o time da vez na disputa, o do cobrador no jogo). */
export function penaltyAttackSide(s: FutSnapshot): TeamSide | null {
  if (s.phase === "penalties" && s.pens) {
    return s.pens.turn;
  }
  if (s.restart?.kind === "penalti") {
    return s.restart.side;
  }
  return null;
}

export interface PenaltyKeys {
  esquerda: string;
  direita: string;
  touch: boolean;
}

/** Instrução na tela para quem cobra ou defende. */
export function penaltyHint(role: PenaltyRole, k: PenaltyKeys): string | null {
  if (role === "taker") {
    return k.touch
      ? "Segure Chute para carregar a força e solte para bater. O joystick para os lados escolhe o canto."
      : `Segure Espaço para carregar a força e solte para bater. ${k.esquerda} e ${k.direita} escolhem o canto.`;
  }
  if (role === "keeper") {
    return k.touch ? "Você escolhe o lado do pulo do goleiro: joystick para um dos lados, antes da batida." : `Você escolhe o lado do pulo do goleiro: ${k.esquerda} ou ${k.direita}, antes da batida.`;
  }
  return null;
}

/** Lado escolhido pelo movimento lateral (mz do input): -1, 1 ou 0 quando ainda não escolheu. */
export function pickedSide(mz: number): -1 | 0 | 1 {
  return Math.abs(mz) >= 0.35 ? (mz > 0 ? 1 : -1) : 0;
}

/** Escala do nome sobre o jogador conforme a distância da câmera: perto não engole a tela, longe continua legível. */
export function tagScale(dist: number): number {
  return Math.max(0.9, Math.min(2.6, dist / 10));
}

/** Linha do placar da disputa: "Cobrança 3" ou "Morte súbita" (cobrança contada a partir de 1). */
export function penaltyRound(taken: [number, number], sudden: boolean): string {
  return sudden ? "Morte súbita" : `Cobrança ${Math.min(5, Math.floor((taken[0] + taken[1]) / 2) + 1)} de 5`;
}
