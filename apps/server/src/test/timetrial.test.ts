import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { DEFAULT_AVATAR, MAIN_TRACK_ID, type GhostSample, type ServerMsg } from "@ec/shared";
import { startServer, type RunningServer } from "../app";
import { Store } from "../store";

const googleUsers: Record<string, { sub: string; email: string; name: string }> = {
  "ok-ana": { sub: "g-ana", email: "ana@firma.com", name: "Ana Google" },
  "ok-beto": { sub: "g-beto", email: "beto@firma.com", name: "Beto Google" },
};
const verifyMock = vi.hoisted(() => vi.fn());
vi.mock("../auth", async (orig) => ({ ...(await orig<typeof import("../auth")>()), verifyGoogleToken: verifyMock }));

const SECRET = "segredo-de-teste";
const CLIENT_ID = "teste";

let srv: RunningServer;
let store: Store;
let dir: string;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  verifyMock.mockImplementation(async (token: string, clientId: string) => (clientId === CLIENT_ID ? (googleUsers[token] ?? null) : null));
  dir = mkdtempSync(join(tmpdir(), "ec-timetrial-"));
  store = new Store(dir);
  srv = await startServer(0, { idleMs: 120000, race: { laps: 1, graceMs: 1000 }, store, auth: { clientId: CLIENT_ID, secret: SECRET } });
});
afterAll(async () => {
  await srv.close();
  await store.flush();
  rmSync(dir, { recursive: true, force: true });
});

class Client {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  constructor(port = srv.port) {
    this.ws = new WebSocket(`ws://localhost:${port}/ws`);
    this.ws.on("message", (d) => this.msgs.push(JSON.parse(d.toString())));
  }
  open() {
    return new Promise<void>((ok) => this.ws.once("open", () => ok()));
  }
  send(m: unknown) {
    this.ws.send(JSON.stringify(m));
  }
  of<T extends ServerMsg["t"]>(t: T) {
    return this.msgs.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
  }
  async waitFor<T extends ServerMsg["t"]>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, ms = 3000) {
    const start = Date.now();
    for (;;) {
      const found = this.msgs.find((m) => m.t === t && pred(m as Extract<ServerMsg, { t: T }>));
      if (found) return found as Extract<ServerMsg, { t: T }>;
      if (Date.now() - start > ms) throw new Error(`timeout esperando ${t}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  close() {
    this.ws.close();
  }
}

async function login(credential: string): Promise<string> {
  const res = await fetch(`http://localhost:${srv.port}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential }) });
  expect(res.status).toBe(200);
  return (await res.json()).session;
}

async function connect(first: Record<string, unknown>, port?: number) {
  const c = new Client(port);
  await c.open();
  c.send(first);
  const w = await c.waitFor("welcome");
  return { c, w };
}

const ghost = (ms: number): GhostSample[] => [
  [0, 1, 2, 0],
  [ms, 3, 4, 1],
];

describe("contra o relógio no servidor", () => {
  it("modo tira os bots, inicia com 1 humano, manda fantasmas, grava voltas e só o anfitrião encerra", async () => {
    const ana = await login("ok-ana");
    const beto = await login("ok-beto");
    const a = await connect({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR, session: ana });
    const b = await connect({ t: "join", code: a.w.code, name: "Beto", avatar: DEFAULT_AVATAR, session: beto });
    const v = await connect({ t: "join", code: a.w.code, name: "Vera", avatar: DEFAULT_AVATAR });
    const room = srv.manager.rooms.get(a.w.code)!;

    // bots saem ao escolher o modo; addBot é ignorado nele
    a.c.send({ t: "addBot" });
    await a.c.waitFor("lobby", (m) => m.state.players.some((p) => p.isBot));
    b.c.send({ t: "mode", mode: "timetrial" }); // não é anfitrião
    a.c.send({ t: "mode", mode: "timetrial" });
    const lob = await a.c.waitFor("lobby", (m) => m.state.mode === "timetrial");
    expect(lob.state.players.some((p) => p.isBot)).toBe(false);
    a.c.send({ t: "addBot" });
    for (const x of [b, v]) x.c.send({ t: "ready", ready: true });
    await a.c.waitFor("lobby", (m) => m.state.mode === "timetrial" && m.state.players.length === 3 && m.state.players.every((p) => p.ready));
    expect([...room.members.values()].some((m) => m.isBot)).toBe(false);

    a.c.send({ t: "start" });
    const first = await a.c.waitFor("rsnap");
    expect(first.s.timeTrial).toBe(true);
    expect(first.s.karts).toHaveLength(3);
    expect(first.s.boxes).toEqual([]);
    expect(first.me!.sessionBestMs).toBeNull();
    for (const x of [a, b, v]) {
      const g = await x.c.waitFor("ghosts");
      expect(g).toEqual({ t: "ghosts", mine: null, record: null, rival: null });
    }

    // endTraining de quem não é anfitrião é ignorado
    b.c.send({ t: "endTraining" });
    await new Promise((r) => setTimeout(r, 150));
    expect(room.phase).toBe("match");

    // volta da Ana (logada): vira recorde e fantasma dela
    const laps = room.race!.completedLaps;
    laps.push({ id: a.w.id, ms: 61234, ghost: ghost(61234) });
    const ga = await a.c.waitFor("ghosts", (m) => m.mine !== null);
    expect(ga.mine).toEqual({ ms: 61234, samples: ghost(61234) });
    expect(ga.record).toEqual({ ms: 61234, name: "Ana", samples: ghost(61234) });
    expect(store.data.laps[MAIN_TRACK_ID]["g-ana"].ms).toBe(61234);
    // os outros recebem o novo recorde (o mine deles segue vazio)
    const gb = await b.c.waitFor("ghosts", (m) => m.record !== null);
    expect(gb.mine).toBeNull();
    expect(gb.record!.ms).toBe(61234);

    // volta pior da Ana: nada muda, nenhum fantasma novo
    const nA = a.c.of("ghosts").length;
    laps.push({ id: a.w.id, ms: 70000, ghost: ghost(70000) });
    // volta do Beto, melhor que o recorde: ele ganha mine e o recorde passa a ser dele
    laps.push({ id: b.w.id, ms: 60000, ghost: ghost(60000) });
    const gb2 = await b.c.waitFor("ghosts", (m) => m.mine?.ms === 60000);
    expect(gb2.record).toMatchObject({ ms: 60000, name: "Beto" });
    const ga2 = await a.c.waitFor("ghosts", (m) => m.record?.ms === 60000);
    expect(ga2.mine!.ms).toBe(61234);
    // com só dois tempos salvos, o único à frente da Ana é o recorde, que já tem fantasma: sem rival
    expect(ga2.rival).toBeNull();
    expect(a.c.of("ghosts").length).toBe(nA + 1);
    expect(store.data.laps[MAIN_TRACK_ID]["g-ana"].ms).toBe(61234);

    // visitante: fantasma só da sessão, nada no arquivo
    laps.push({ id: v.w.id, ms: 59000, ghost: ghost(59000) });
    const gv = await v.c.waitFor("ghosts", (m) => m.mine?.ms === 59000);
    expect(gv.record!.ms).toBe(60000);
    expect(Object.keys(store.data.laps[MAIN_TRACK_ID]).sort()).toEqual(["g-ana", "g-beto"]);
    // volta de id que não existe ou de bot é ignorada
    laps.push({ id: "bot-1", ms: 1, ghost: ghost(1) });
    laps.push({ id: "ninguem", ms: 1, ghost: ghost(1) });
    await new Promise((r) => setTimeout(r, 150));
    expect(Object.keys(store.data.laps[MAIN_TRACK_ID])).toHaveLength(2);
    expect(laps).toHaveLength(0);

    // o anfitrião encerra: resultados do treino, sem pontos no ranking (mesmo com 2 logados)
    const monthBefore = JSON.stringify(store.data.months);
    a.c.send({ t: "endTraining" });
    const res = await a.c.waitFor("rresults");
    expect(res.rows.map((r) => r.id)).toHaveLength(3);
    expect(res.rows.every((r) => r.totalMs === null)).toBe(true);
    await b.c.waitFor("rresults");
    await a.c.waitFor("lobby", (m) => m.state.phase === "results");
    expect(JSON.stringify(store.data.months)).toBe(monthBefore);
    expect(store.data.stats["g-ana"].raceMatches).toBe(0);
    for (const x of [a, b, v]) x.c.close();
  }, 30000);

  it("1 humano sozinho inicia o treino; corrida e tiroteio seguem pedindo 2", async () => {
    const a = await connect({ t: "create", name: "Solo", avatar: DEFAULT_AVATAR });
    a.c.send({ t: "mode", mode: "race" });
    a.c.send({ t: "start" });
    await a.c.waitFor("error");
    a.c.send({ t: "mode", mode: "timetrial" });
    await a.c.waitFor("lobby", (m) => m.state.mode === "timetrial");
    a.c.send({ t: "start" });
    const s = await a.c.waitFor("rsnap");
    expect(s.s.timeTrial).toBe(true);
    const g = await a.c.waitFor("ghosts");
    expect(g.mine).toBeNull();
    a.c.send({ t: "endTraining" });
    const res = await a.c.waitFor("rresults");
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].bestLapMs).toBeNull();
    a.c.close();
  });

  it("visitante recebe o recorde do arquivo, com o nome da conta", async () => {
    const a = await connect({ t: "create", name: "Visitante", avatar: DEFAULT_AVATAR });
    a.c.send({ t: "mode", mode: "timetrial" });
    await a.c.waitFor("lobby", (m) => m.state.mode === "timetrial");
    a.c.send({ t: "start" });
    await a.c.waitFor("ghosts");
    const room = srv.manager.rooms.get(a.w.code)!;
    room.race!.completedLaps.push({ id: a.w.id, ms: 99000, ghost: ghost(99000) });
    const g = await a.c.waitFor("ghosts", (m) => m.mine !== null);
    expect(g.mine!.ms).toBe(99000);
    expect(g.record).toMatchObject({ ms: 60000, name: "Beto" });
    a.c.close();
  });

  it("sem arquivo de dados, o recorde vem da memória da sala", async () => {
    const other = await startServer(0, { idleMs: 120000 });
    try {
      const a = await connect({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR }, other.port);
      const b = await connect({ t: "join", code: a.w.code, name: "Beto", avatar: DEFAULT_AVATAR }, other.port);
      a.c.send({ t: "mode", mode: "timetrial" });
      b.c.send({ t: "ready", ready: true });
      await a.c.waitFor("lobby", (m) => m.state.mode === "timetrial" && m.state.players.every((p) => p.ready));
      a.c.send({ t: "start" });
      expect(await a.c.waitFor("ghosts")).toEqual({ t: "ghosts", mine: null, record: null, rival: null });
      const laps = other.manager.rooms.get(a.w.code)!.race!.completedLaps;
      laps.push({ id: a.w.id, ms: 70000, ghost: ghost(70000) });
      await b.c.waitFor("ghosts", (m) => m.record?.name === "Ana");
      laps.push({ id: b.w.id, ms: 65000, ghost: ghost(65000) });
      const g = await a.c.waitFor("ghosts", (m) => m.record?.name === "Beto");
      expect(g.mine!.ms).toBe(70000);
      expect(g.record!.ms).toBe(65000);
      a.c.close();
      b.c.close();
    } finally {
      await other.close();
    }
  });
});
