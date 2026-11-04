import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "../data/avatar";
import { createFutebol, stepFutebol } from "../index";
import type { BotLevel, FutMatch } from "../index";

const DT = 1000 / 30;
const TEAMS: [{ name: string; kit: number; color: number }, { name: string; kit: number; color: number }] = [
  { name: "A", kit: 0, color: 0 },
  { name: "B", kit: 1, color: 1 },
];

/** 1v1 de 3 min com o humano parado no time 0; devolve os gols do bot (time 1) e o tempo (ms) de cada um. */
function idleHuman(seed: number, level: BotLevel = "normal"): { goals: number[]; humanGoals: number } {
  const m: FutMatch = createFutebol({
    seed,
    format: 1,
    durationMs: 180000,
    botLevel: level,
    players: [{ id: "h1", name: "h1", avatar: DEFAULT_AVATAR, side: 0, isBot: false, accountId: null }],
    teams: TEAMS,
  });
  const goals: number[] = [];
  let last = m.score[1];
  for (let i = 0; i < 180000 / DT + 2000 && m.phase !== "over"; i++) {
    stepFutebol(m, DT);
    if (m.score[1] > last) {
      goals.push(m.elapsedMs);
      last = m.score[1];
    }
  }
  return { goals, humanGoals: m.score[0] };
}

describe("bot Normal contra humano parado no 1v1", () => {
  const rows = Array.from({ length: 60 }, (_, s) => idleHuman(s + 1));

  it("marca em média no máximo 3 gols em 3 min (o humano parado não defende nem segura a bola)", () => {
    const avg = rows.reduce((a, r) => a + r.goals.length, 0) / rows.length;
    expect(avg).toBeLessThanOrEqual(3);
  });

  it("depois de um gol demora pelo menos 8 s de jogo para marcar de novo", () => {
    const gaps = rows.flatMap((r) => r.goals.slice(1).map((t, i) => t - r.goals[i]));
    expect(gaps.length).toBeGreaterThan(0);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(8000);
  });
});
