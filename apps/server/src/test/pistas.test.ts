import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_AVATAR, DEFAULT_CHAIR, rankingView, type GhostSample, type RankingView } from "@ec/shared";
import { startServer } from "../app";
import { Room, type Conn } from "../rooms";
import { Store } from "../store";

let root: string;
beforeEach(async () => {
  process.env.NODE_ENV = "test";
  root = await fsp.mkdtemp(join(tmpdir(), "ec-pistas-"));
});
afterEach(async () => {
  await fsp.rm(root, { recursive: true, force: true });
});

const ghost = (ms: number): GhostSample[] => [
  [0, 1, 2, 0],
  [ms, 3, 4, 1],
];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Arquivo do jeito que existia antes das pistas novas: só o Circuito Corporativo e progresso sem pistas. */
function oldFile() {
  return {
    version: 1,
    accounts: { "g-ana": { email: "ana@x.com", name: "Ana", since: 1 } },
    stats: { "g-ana": { shooterWins: 0, shooterMatches: 0, shooterKills: 0, raceWins: 1, racePodiums: 2, raceMatches: 3, bestLapMs: 31000 } },
    months: {},
    laps: { corporativo: { "g-ana": { ms: 31000, at: 1, ghost: ghost(31000) } } },
    challenges: { "2026-10-12": { "g-ana": { shooterMatches: 0, shooterWins: 0, shooterKills: 0, bestKills: 0, raceMatches: 3, raceFinished: 3, raceWins: 1, racePodiums: 2, bestLapMs: 31000, doneAt: null } } },
  };
}

describe("pistas no servidor", () => {
  it("arquivo antigo carrega e continua valendo para o Circuito Corporativo", async () => {
    await fsp.writeFile(join(root, "ranking.json"), JSON.stringify(oldFile()));
    const store = new Store(root);
    expect(store.data.laps.corporativo["g-ana"].ms).toBe(31000);
    const v = rankingView(store.data, Date.UTC(2026, 9, 15), "g-ana");
    expect(v.voltas.rows).toHaveLength(1);
    expect(v.pistas.find((p) => p.id === "corporativo")!.voltas.me).toMatchObject({ rank: 1, ms: 31000 });
    expect(v.pistas.find((p) => p.id === "copa")!.voltas.rows).toEqual([]);
  });

  it("só o anfitrião troca a pista, só no lobby, e a corrida usa a escolhida", () => {
    const room = new Room("ABCDG", {});
    const conn = { ws: { readyState: 3, OPEN: 1 } } as unknown as Conn;
    const host = room.addMember("Ana", DEFAULT_AVATAR, conn);
    const guest = room.addMember("Beto", DEFAULT_AVATAR, conn);
    room.handle(conn, guest, { t: "options", track: "copa" });
    expect(room.options.track).toBe("corporativo");
    room.handle(conn, host, { t: "options", track: "copa" });
    expect(room.options.track).toBe("copa");
    expect(room.lobbyState().options.track).toBe("copa");
    room.handle(conn, host, { t: "mode", mode: "race" });
    guest.ready = true;
    expect(room.start()).toBeNull();
    expect(room.race!.track.id).toBe("copa");
    room.handle(conn, host, { t: "options", track: "estacionamento" });
    expect(room.options.track).toBe("copa");
    room.dispose();
  });

  it("volta do treino fica na pista escolhida e o fantasma é o daquela pista", async () => {
    await fsp.writeFile(join(root, "ranking.json"), JSON.stringify(oldFile()));
    const store = new Store(root);
    const room = new Room("ABCDE", {}, store);
    const ana = room.addMember("Ana", DEFAULT_AVATAR, null, false, DEFAULT_CHAIR, "g-ana");
    room.mode = "timetrial";
    room.options.track = "copa";
    expect(room.start()).toBeNull();
    expect(room.race!.track.id).toBe("copa");
    // o fantasma da Ana no Corporativo não vale na Copa
    expect((room as unknown as { ghostOf: (m: unknown, t: string) => unknown }).ghostOf(ana, "copa")).toBeNull();
    room.race!.completedLaps.push({ id: ana.id, ms: 12345, ghost: ghost(12345) });
    await wait(120);
    room.dispose();
    expect(store.data.laps.copa["g-ana"]).toMatchObject({ ms: 12345, ghost: ghost(12345) });
    expect(store.data.laps.corporativo["g-ana"].ms).toBe(31000);
    expect(store.data.laps.estacionamento).toBeUndefined();
  });

  it("visitante: fantasma da sessão e recorde da sala ficam separados por pista", async () => {
    const room = new Room("ABCDF", {});
    const vera = room.addMember("Vera", DEFAULT_AVATAR, null);
    room.mode = "timetrial";
    room.options.track = "estacionamento";
    room.start();
    room.race!.completedLaps.push({ id: vera.id, ms: 20000, ghost: ghost(20000) });
    await wait(120);
    room.dispose();
    expect(vera.sessionLaps).toEqual({ estacionamento: { ms: 20000, samples: ghost(20000) } });
  });

  it("/api/ranking traz os recordes de cada pista, com ids mascarados", async () => {
    await fsp.writeFile(join(root, "ranking.json"), JSON.stringify({ ...oldFile(), laps: { ...oldFile().laps, copa: { "g-ana": { ms: 11000, at: 1, ghost: [] } } } }));
    const store = new Store(root);
    const srv = await startServer(0, { store, auth: { clientId: null, secret: "segredo" } });
    try {
      const v = (await (await fetch(`http://localhost:${srv.port}/api/ranking`)).json()) as RankingView;
      expect(v.pistas.map((p) => p.name)).toEqual(["Circuito Corporativo", "Estacionamento", "Copa"]);
      const copa = v.pistas.find((p) => p.id === "copa")!;
      expect(copa.voltas.rows).toHaveLength(1);
      expect(copa.voltas.rows[0]).toMatchObject({ name: "Ana", ms: 11000, rank: 1 });
      expect(copa.voltas.rows[0].id).not.toBe("g-ana");
      expect(JSON.stringify(v)).not.toContain("g-ana");
      // a mesma conta tem o mesmo apelido em todas as abas
      expect(copa.voltas.rows[0].id).toBe(v.voltas.rows[0].id);
      const rep = await fetch(`http://localhost:${srv.port}/api/replay?pista=copa&linha=1`);
      expect(((await rep.json()) as { ms: number }).ms).toBe(11000);
    } finally {
      await srv.close();
    }
  });
});
