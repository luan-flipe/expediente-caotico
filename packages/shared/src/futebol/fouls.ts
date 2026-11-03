import { FUT } from "./balance";
import type { Ball, Field, FutPlayer, TeamSide } from "./types";

export type Card = "none" | "yellow" | "red";

/** Bola a até esta distância (m) do pé do carrinheiro no contato = tocou primeiro. */
const BALL_FIRST_REACH = 0.6;
/** Carrinho que vem de ângulo maior que 120° em relação à frente da vítima é por trás,
 *  ou seja, os facings dos dois diferem menos que 60°. */
const BEHIND_DIFF = Math.PI / 3;

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

/** Julga um contato com adversário. ballFirst (de TouchEvent) tem prioridade;
 *  sem ele, vale a distância de 0,6 m entre a bola e o carrinheiro. */
export function judgeTackle(
  tackler: FutPlayer,
  victim: FutPlayer,
  ball: Ball,
  kind: "carrinho" | "disputa",
  tackler_sprinting: boolean,
  ballFirst?: boolean,
): { foul: boolean; card: Card } {
  const first = ballFirst ?? Math.hypot(ball.x - tackler.x, ball.z - tackler.z) <= BALL_FIRST_REACH;
  if (first) {
    return { foul: false, card: "none" };
  }
  if (kind === "carrinho") {
    if (angleDiff(tackler.facing, victim.facing) < BEHIND_DIFF) {
      return { foul: true, card: "red" };
    }
    if (tackler_sprinting) {
      return { foul: true, card: "yellow" };
    }
  }
  return { foul: true, card: "none" };
}

/** Tranco forte (disputa em pé com velocidade de encontro alta) é falta; por trás, falta dura (amarelo). */
export function judgeShove(tackler: FutPlayer, victim: FutPlayer, hard: boolean): { foul: boolean; card: Card } {
  if (!hard) {
    return { foul: false, card: "none" };
  }
  return { foul: true, card: angleDiff(tackler.facing, victim.facing) < BEHIND_DIFF ? "yellow" : "none" };
}

/** Reincidência: a cada foulsForYellow faltas sem cartão o árbitro mostra o amarelo. Conta a falta no jogador. */
export function repeatCard(p: FutPlayer, card: Card): Card {
  p.fouls = (p.fouls ?? 0) + 1;
  return card === "none" && p.fouls % FUT.foulsForYellow === 0 ? "yellow" : card;
}

/** Segundo amarelo vira vermelho; vermelho expulsa (sentOff). */
export function applyCard(p: FutPlayer, card: Card): void {
  if (card === "yellow") {
    p.yellow += 1;
    if (p.yellow >= 2) {
      p.sentOff = true;
    }
  } else if (card === "red") {
    p.sentOff = true;
  }
}

/** Falta dentro da área que o time da vítima ataca vira pênalti. Time 0 ataca +x. */
export function isPenaltyFoul(victim: FutPlayer, field: Field): boolean {
  const dir = victim.side === 0 ? 1 : -1;
  return victim.x * dir >= field.halfL - field.boxL && Math.abs(victim.z) <= field.boxHalfW;
}

/** Jogadores de linha do time ainda em campo (não expulsos). */
export function activeOutfield(players: FutPlayer[], side: TeamSide): FutPlayer[] {
  return players.filter((p) => p.side === side && p.role === "linha" && !p.sentOff);
}
