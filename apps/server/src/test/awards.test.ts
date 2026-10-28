import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR, type Award, type ServerMsg } from "@ec/shared";
import { Room, type Conn } from "../rooms";

/** Conexão falsa que guarda tudo o que a sala enviar. */
function fakeConn(): { conn: Conn; msgs: ServerMsg[] } {
  const msgs: ServerMsg[] = [];
  const ws = { OPEN: 1, readyState: 1, send: (raw: string) => msgs.push(JSON.parse(raw)) };
  return { conn: { ws, ip: "x", invalid: 0, lastSeen: 0 } as unknown as Conn, msgs };
}

describe("prêmios nas mensagens de resultado", () => {
  it("tiroteio: results leva os prêmios calculados e reconectar reenvia os mesmos", () => {
    const room = new Room("ABCDE");
    const { conn, msgs } = fakeConn();
    const host = room.addMember("Ana", DEFAULT_AVATAR, conn);
    room.addMember("Bot", DEFAULT_AVATAR, null, true);
    expect(room.start()).toBeNull();
    const players = [...room.match!.players.values()];
    players[0].deaths = 4;
    players[1].dodges = 6;
    (room as unknown as { finish(): void }).finish();

    const res = msgs.find((m) => m.t === "results");
    expect(res).toBeDefined();
    const awards = (res as { awards: Award[] }).awards;
    expect(awards.map((a) => a.id).sort()).toEqual(["esquivador", "kamikaze"]);
    expect(awards.find((a) => a.id === "kamikaze")!.winnerId).toBe(players[0].id);
    expect(room.awards).toEqual(awards);
    expect(room.members.get(host.id)).toBeDefined();
  });

  it("corrida: rresults leva awards com no máximo 3 e só de quem corre", () => {
    const room = new Room("FGHIJ");
    const { conn, msgs } = fakeConn();
    room.addMember("Ana", DEFAULT_AVATAR, conn);
    room.addMember("Bot", DEFAULT_AVATAR, null, true);
    room.mode = "race";
    expect(room.start()).toBeNull();
    const racers = [...room.race!.racers.values()];
    racers[0].itemHits = 3;
    racers[1].wallHits = 2;
    racers[1].lap.bestLapMs = 55000;
    (room as unknown as { finish(): void }).finish();

    const res = msgs.find((m) => m.t === "rresults") as { awards: Award[] } | undefined;
    expect(res).toBeDefined();
    expect(res!.awards.length).toBeGreaterThan(0);
    expect(res!.awards.length).toBeLessThanOrEqual(3);
    const ids = new Set(racers.map((r) => r.id));
    for (const a of res!.awards) expect(ids.has(a.winnerId)).toBe(true);
  });

  it("contra o relógio não tem prêmios", () => {
    const room = new Room("KLMNO");
    const { conn, msgs } = fakeConn();
    room.addMember("Ana", DEFAULT_AVATAR, conn);
    room.mode = "timetrial";
    expect(room.start()).toBeNull();
    [...room.race!.racers.values()][0].itemHits = 3;
    (room as unknown as { finish(): void }).finish();
    const res = msgs.find((m) => m.t === "rresults") as { awards: Award[] } | undefined;
    expect(res!.awards).toEqual([]);
  });
});
