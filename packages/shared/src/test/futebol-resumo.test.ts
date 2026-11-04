import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "../data/avatar";
import { createFutebol, getFutResults, getFutStats } from "../index";
import type { FutMatch } from "../index";

const TEAMS: [{ name: string; kit: number; color: number }, { name: string; kit: number; color: number }] = [
  { name: "A", kit: 0, color: 0 },
  { name: "B", kit: 1, color: 1 },
];
const human = (id: string, side: 0 | 1) => ({ id, name: id, avatar: DEFAULT_AVATAR, side, isBot: false, accountId: null });
const make = (): FutMatch => createFutebol({ seed: 2, format: 2, durationMs: 60000, botLevel: "normal", players: [human("h0", 0), human("h1", 1)], teams: TEAMS });

describe("resumo da partida", () => {
  it("posse em porcentagem soma 100 e é 50/50 sem posse", () => {
    const m = make();
    expect(getFutStats(m).poss).toEqual([50, 50]);
    m.possMs = [3000, 1000];
    expect(getFutStats(m).poss).toEqual([75, 25]);
  });

  it("soma chutes, no gol, passes, faltas e cartões por time", () => {
    const m = make();
    const h0 = m.info.get("h0")!;
    const h1 = m.info.get("h1")!;
    Object.assign(h0, { shots: 4, shotsOn: 2, passes: 9, fouls: 1 });
    Object.assign(h1, { shots: 1, shotsOn: 1, passes: 3, fouls: 2 });
    m.players.find((p) => p.id === "h1")!.yellow = 1;
    m.players.find((p) => p.id === "h1")!.sentOff = true;
    const s = getFutStats(m);
    expect(s.shots).toEqual([4, 1]);
    expect(s.shotsOn).toEqual([2, 1]);
    expect(s.passes).toEqual([9, 3]);
    expect(s.fouls).toEqual([1, 2]);
    expect(s.cards).toEqual([0, 2]);
  });

  it("melhor jogador pesa gols e assistências mais que passes, e punhos de falta pesam contra", () => {
    const m = make();
    const h0 = m.info.get("h0")!;
    const h1 = m.info.get("h1")!;
    Object.assign(h0, { goals: 1, passes: 2 });
    Object.assign(h1, { assists: 0, passes: 30, shots: 3, shotsOn: 1, fouls: 1 });
    expect(getFutStats(m).mvpId).toBe("h0");
    Object.assign(h0, { goals: 0, passes: 0 });
    Object.assign(h1, { goals: 0, shots: 0, shotsOn: 0, passes: 0, fouls: 0, assists: 0 });
    expect(getFutStats(m).mvpId).toBeNull();
  });

  it("as linhas do resultado trazem chutes, passes e faltas de cada jogador", () => {
    const m = make();
    Object.assign(m.info.get("h0")!, { shots: 5, shotsOn: 3, passes: 7, fouls: 2 });
    const row = getFutResults(m).find((r) => r.id === "h0")!;
    expect(row).toMatchObject({ shots: 5, shotsOn: 3, passes: 7, fouls: 2 });
  });
});
