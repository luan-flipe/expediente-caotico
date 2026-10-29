import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AVATAR, DEFAULT_CHAIR, type Award, type RaceResultRow } from "@ec/shared";
import { Room, type Conn } from "../rooms";
import { Store } from "../store";

const conn = () => ({ ws: { OPEN: 1, readyState: 1, send() {} }, ip: "x", invalid: 0, lastSeen: 0 }) as unknown as Conn;
let dir = "";
afterEach(() => rmSync(dir, { recursive: true, force: true }));

type Interno = { recordRanking(): void; finish(): void; results: unknown; raceResults: RaceResultRow[] | null; race: unknown; awards: Award[] };

function sala() {
  dir = mkdtempSync(join(tmpdir(), "ec-hist-"));
  const store = new Store(dir);
  store.data.accounts["g-ana"] = { email: "ana@x.com", name: "Ana", since: 1 };
  store.data.accounts["g-beto"] = { email: "beto@x.com", name: "Beto", since: 1 };
  const room = new Room("HIST1", {}, store);
  const ana = room.addMember("Ana", DEFAULT_AVATAR, conn(), false, undefined, "g-ana");
  const beto = room.addMember("Beto", DEFAULT_AVATAR, conn(), false, undefined, "g-beto");
  const visitante = room.addMember("Visita", DEFAULT_AVATAR, conn(), false, undefined, null);
  return { store, room, ana, beto, visitante, inner: room as unknown as Interno };
}

const corrida = (id: string, place: number, bestLapMs: number | null): RaceResultRow => ({
  id,
  name: id,
  avatar: DEFAULT_AVATAR,
  chair: DEFAULT_CHAIR,
  isBot: false,
  place,
  totalMs: bestLapMs === null ? null : 90000,
  bestLapMs,
  lapsDone: 3,
  favItem: null,
  itemsUsed: 0,
});

describe("histórico e prêmios gravados no fim da partida", () => {
  it("tiroteio com 2 logados registra a partida no histórico das duas contas", () => {
    const { store, room, ana, beto, visitante } = sala();
    room.removeMember(visitante.id);
    beto.ready = true;
    expect(room.start()).toBeNull();
    (room as unknown as Interno).finish();
    room.dispose();
    expect(store.data.accounts["g-ana"].history).toHaveLength(1);
    expect(store.data.accounts["g-ana"].history?.[0]).toMatchObject({ mode: "shooter" });
    expect(store.data.accounts["g-beto"].history).toHaveLength(1);
    expect(ana.accountId).toBe("g-ana");
  });

  it("corrida que conta entra com pista e melhor volta; prêmios soma só para contas", () => {
    const { store, ana, beto, visitante, inner } = sala();
    inner.race = { timeTrial: false, track: { id: "corporativo" } };
    inner.raceResults = [corrida(ana.id, 1, 30500), corrida(beto.id, 2, null), corrida(visitante.id, 3, 40000)];
    inner.awards = [
      { id: "a", title: "Mão de alface", winnerId: ana.id, winnerName: "Ana", detail: "x" },
      { id: "b", title: "Rei do café", winnerId: visitante.id, winnerName: "Visita", detail: "x" },
      { id: "c", title: "Piloto de bot", winnerId: "bot-1", winnerName: "Bot", detail: "x" },
    ];
    inner.recordRanking();
    expect(store.data.accounts["g-ana"].history).toEqual([{ at: expect.any(Number), mode: "race", track: "corporativo", place: 1, bestLapMs: 30500 }]);
    expect(store.data.accounts["g-beto"].history?.[0]).toMatchObject({ place: 2, bestLapMs: null });
    expect(store.data.accounts["g-ana"].awards).toEqual({ "Mão de alface": 1 });
    expect(store.data.accounts["g-beto"].awards).toBeUndefined();
  });

  it("contra o relógio e partida com um só logado não gravam histórico nem prêmio", () => {
    const { store, ana, beto, visitante, inner } = sala();
    const award = (id: string): Award => ({ id: "a", title: "Mão de alface", winnerId: id, winnerName: "x", detail: "x" });
    inner.race = { timeTrial: true, track: { id: "corporativo" } };
    inner.raceResults = [corrida(ana.id, 1, 30000), corrida(beto.id, 2, 31000)];
    inner.awards = [award(ana.id)];
    inner.recordRanking();
    inner.race = { timeTrial: false, track: { id: "corporativo" } };
    inner.raceResults = [corrida(ana.id, 1, 30000), corrida(visitante.id, 2, 31000)];
    inner.recordRanking();
    expect(store.data.accounts["g-ana"].history).toBeUndefined();
    expect(store.data.accounts["g-ana"].awards).toBeUndefined();
  });
});
