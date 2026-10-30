import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { monthKey, type FutResultRow } from "@ec/shared";
import { Room } from "../rooms";
import { Store } from "../store";

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const row = (id: string, side: 0 | 1, accountId: string | null, isBot: boolean, goals: number, assists: number): FutResultRow => ({ id, name: id, side, isBot, accountId, goals, assists, yellow: 0, red: 0 });

describe("recordFutebolRanking", () => {
  it("empate decidido nos pênaltis: vencedor dos pênaltis ganha a vitória e gols da disputa não contam", () => {
    dir = mkdtempSync(join(tmpdir(), "ec-futrank-"));
    const store = new Store(dir);
    for (const id of ["a", "b"]) store.data.accounts[id] = { email: `${id}@x.com`, name: id, since: 1 };
    const room = new Room("TESTE", {}, store);
    const r = room as unknown as { futResults: FutResultRow[]; futScore: unknown; recordFutebolRanking(): void };
    // 1 a 1 no tempo normal; pênaltis 2 a 4 para o lado 1 (b). Os gols da disputa não estão nas linhas dos jogadores.
    r.futResults = [row("a", 0, "a", false, 1, 0), row("b", 1, "b", false, 1, 0), row("bot", 1, null, true, 0, 0)];
    r.futScore = { score: [1, 1], pens: [2, 4], winner: 1 };
    r.recordFutebolRanking();
    expect(store.data.stats.b).toMatchObject({ futWins: 1, futMatches: 1, futGoals: 1 });
    expect(store.data.stats.a).toMatchObject({ futWins: 0, futMatches: 1, futGoals: 1 });
    const m = store.data.months[monthKey(new Date())];
    expect(m.b).toBe(3 + 1);
    expect(m.a).toBe(1);
    expect(Object.keys(store.data.stats)).toEqual(["a", "b"]);
  });

  it("com um humano só não pontua", () => {
    dir = mkdtempSync(join(tmpdir(), "ec-futrank-"));
    const store = new Store(dir);
    store.data.accounts.a = { email: "a@x.com", name: "a", since: 1 };
    const room = new Room("TESTE", {}, store);
    const r = room as unknown as { futResults: FutResultRow[]; futScore: unknown; recordFutebolRanking(): void };
    r.futResults = [row("a", 0, "a", false, 2, 0), row("bot", 1, null, true, 0, 0)];
    r.futScore = { score: [2, 0], pens: null, winner: 0 };
    r.recordFutebolRanking();
    expect(store.data.stats.a).toBeUndefined();
  });
});
