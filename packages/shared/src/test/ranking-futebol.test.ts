import { describe, expect, it } from "vitest";
import { applyFutebolResult, emptyRankingData, rankingView, profileOf } from "../ranking/rules";
import type { RankingData } from "../ranking/types";

const NOW = Date.UTC(2026, 9, 15, 15, 0, 0);

function dataWith(ids: string[]): RankingData {
  const d = emptyRankingData();
  for (const id of ids) d.accounts[id] = { email: `${id}@x.com`, name: `Nome ${id}`, since: 1 };
  return d;
}
const pts = (d: RankingData, id: string) => d.months["2026-10"]?.[id] ?? 0;

describe("ranking do futebol", () => {
  it("vitória, gol e assistência somam", () => {
    const d = dataWith(["a", "b"]);
    applyFutebolResult(d, [
      { accountId: "a", won: true, goals: 2, assists: 1 },
      { accountId: "b", won: false, goals: 0, assists: 0 },
    ], 2, NOW);
    expect(pts(d, "a")).toBe(3 + 2 + 1);
    expect(d.stats.a).toMatchObject({ futWins: 1, futMatches: 1, futGoals: 2, futAssists: 1 });
    expect(d.accounts.a.history?.[0]).toMatchObject({ mode: "futebol", place: 1 });
    expect(d.accounts.b.history?.[0]).toMatchObject({ mode: "futebol", place: 2 });
  });

  it("derrota não tira ponto", () => {
    const d = dataWith(["a", "b"]);
    d.months["2026-10"] = { b: 7 };
    applyFutebolResult(d, [
      { accountId: "a", won: true, goals: 0, assists: 0 },
      { accountId: "b", won: false, goals: 0, assists: 0 },
    ], 2, NOW);
    expect(pts(d, "b")).toBe(7);
    expect(d.stats.b).toMatchObject({ futWins: 0, futMatches: 1 });
  });

  it("com 1 humano não pontua", () => {
    const d = dataWith(["a"]);
    expect(applyFutebolResult(d, [{ accountId: "a", won: true, goals: 3, assists: 0 }], 1, NOW)).toEqual([]);
    expect(d.stats.a).toBeUndefined();
    expect(pts(d, "a")).toBe(0);
  });

  it("bots e visitantes não entram", () => {
    const d = dataWith(["a", "b"]);
    applyFutebolResult(d, [
      { accountId: "a", won: true, goals: 1, assists: 0 },
      { accountId: null, won: true, goals: 5, assists: 5 },
      { accountId: "b", won: false, goals: 0, assists: 0 },
    ], 2, NOW);
    expect(Object.keys(d.stats).sort()).toEqual(["a", "b"]);
  });

  it("dado antigo sem campos do futebol carrega", () => {
    const d = dataWith(["a", "b"]);
    d.stats.a = { shooterWins: 1, shooterMatches: 1, shooterKills: 1, raceWins: 0, racePodiums: 0, raceMatches: 0, bestLapMs: null } as RankingData["stats"][string];
    applyFutebolResult(d, [
      { accountId: "a", won: true, goals: 1, assists: 0 },
      { accountId: "b", won: false, goals: 0, assists: 0 },
    ], 2, NOW);
    expect(d.stats.a).toMatchObject({ futWins: 1, futMatches: 1, futGoals: 1, futAssists: 0, shooterWins: 1 });
    const old = dataWith(["c"]);
    old.stats.c = { shooterWins: 1, shooterMatches: 1, shooterKills: 1, raceWins: 0, racePodiums: 0, raceMatches: 0, bestLapMs: null } as RankingData["stats"][string];
    expect(() => rankingView(old, NOW, "c")).not.toThrow();
    expect(rankingView(old, NOW).futebol.rows).toEqual([]);
    expect(profileOf(old, "c", NOW)!.stats).toMatchObject({ futWins: 0, futMatches: 0, futGoals: 0, futAssists: 0 });
  });

  it("aba ordena por vitórias, gols e assistências", () => {
    const d = dataWith(["a", "b", "c"]);
    applyFutebolResult(d, [
      { accountId: "a", won: true, goals: 1, assists: 0 },
      { accountId: "b", won: true, goals: 1, assists: 2 },
      { accountId: "c", won: false, goals: 4, assists: 0 },
    ], 3, NOW);
    const v = rankingView(d, NOW, "c");
    expect(v.futebol.rows.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(v.futebol.me?.rank).toBe(3);
    expect(v.futebol.rows[0]).toMatchObject({ wins: 1, goals: 1, assists: 2, matches: 1 });
  });
});
