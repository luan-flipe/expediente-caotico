import type { FutMatch } from "./types";

/** Estatísticas do jogo por time ([time 0, time 1]) e o melhor jogador. Posse em porcentagem inteira. */
export interface FutMatchStats {
  poss: [number, number];
  shots: [number, number];
  shotsOn: [number, number];
  passes: [number, number];
  fouls: [number, number];
  /** Amarelos mais vermelhos. */
  cards: [number, number];
  mvpId: string | null;
}

/** Pontos do melhor jogador: gol e assistência valem muito, chute no gol e passe pouco; falta e cartão descontam. */
function rating(i: { goals: number; assists: number; shots: number; shotsOn: number; passes: number; fouls: number }, yellow: number, red: number): number {
  return i.goals * 4 + i.assists * 2.5 + i.shotsOn * 0.8 + i.shots * 0.2 + i.passes * 0.1 - i.fouls * 0.7 - yellow - red * 3;
}

export function getFutStats(m: FutMatch): FutMatchStats {
  const out: FutMatchStats = { poss: [50, 50], shots: [0, 0], shotsOn: [0, 0], passes: [0, 0], fouls: [0, 0], cards: [0, 0], mvpId: null };
  const total = m.possMs[0] + m.possMs[1];
  if (total > 0) {
    const a = Math.round((m.possMs[0] / total) * 100);
    out.poss = [a, 100 - a];
  }
  let best = 0;
  for (const p of m.players) {
    const i = m.info.get(p.id);
    if (!i || p.role !== "linha") {
      continue;
    }
    out.shots[p.side] += i.shots;
    out.shotsOn[p.side] += i.shotsOn;
    out.passes[p.side] += i.passes;
    out.fouls[p.side] += i.fouls;
    out.cards[p.side] += p.yellow + (p.sentOff ? 1 : 0);
    const r = rating(i, p.yellow, p.sentOff ? 1 : 0);
    if (r > best || (r === best && r > 0 && out.mvpId !== null && p.id < out.mvpId)) {
      best = r;
      out.mvpId = p.id;
    }
  }
  return out;
}
