import { describe, expect, it } from "vitest";
import { createFutebol, stepFutebol } from "../index";
import type { FutFormat } from "../index";

const DT = 1000 / 30;
const TEAMS: [{ name: string; kit: number; color: number }, { name: string; kit: number; color: number }] = [
  { name: "A", kit: 0, color: 0 },
  { name: "B", kit: 1, color: 1 },
];

/** Gols de uma partida de 3 min só com bots no normal (até o fim do tempo, sem pênaltis). */
function gols(format: FutFormat, seed: number): number {
  const m = createFutebol({ seed, format, durationMs: 180000, botLevel: "normal", players: [], teams: TEAMS });
  for (let i = 0; i < 30 * 400 && m.phase !== "over" && m.phase !== "penalties"; i++) stepFutebol(m, DT);
  return m.score[0] + m.score[1];
}

const media = (format: FutFormat, n: number) => Array.from({ length: n }, (_, i) => gols(format, i + 1)).reduce((a, b) => a + b, 0) / n;

// Regressão: com a bola conduzida pela direção do corpo (em vez da direção do movimento) os bots perdiam a bola nas
// viradas e a média caiu para 0,8 gol no 2v2 e 0,1 no 5v5 do estádio.
describe("bots fazem gols", () => {
  it("2v2: média de pelo menos 2 gols em 3 min", () => {
    expect(media(2, 10)).toBeGreaterThanOrEqual(2);
  });

  it("5v5 no estádio: média de pelo menos 0,8 gol em 3 min", () => {
    expect(media(5, 10)).toBeGreaterThanOrEqual(0.8);
  });
});
