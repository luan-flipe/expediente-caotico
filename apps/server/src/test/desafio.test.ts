import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { CHALLENGES, CHALLENGE_POINTS, DEFAULT_AVATAR, LAP_CHALLENGE_MS, PLACE_POINTS, RECORD_POINTS, emptyProgress, monthKey, weekKey, type GhostSample, type RankingView, type ServerMsg } from "@ec/shared";
import { publicId, startServer, type RunningServer } from "../app";
import { Store } from "../store";

const googleUsers: Record<string, { sub: string; email: string; name: string }> = {
  "ok-ana": { sub: "g-ana", email: "ana@firma.com", name: "Ana Google" },
  "ok-beto": { sub: "g-beto", email: "beto@firma.com", name: "Beto Google" },
};
const verifyMock = vi.hoisted(() => vi.fn());
vi.mock("../auth", async (orig) => ({ ...(await orig<typeof import("../auth")>()), verifyGoogleToken: verifyMock }));

const SECRET = "segredo-de-teste";
const CLIENT_ID = "teste";
const ANA = publicId("g-ana", SECRET);

let srv: RunningServer;
let store: Store;
let dir: string;
const base = () => `http://localhost:${srv.port}`;
const week = () => weekKey(new Date());
const month = (id: string) => store.data.months[monthKey(new Date())]?.[id] ?? 0;

/** Troca a lista de desafios por um só (o sorteio real muda com a data). */
function force(id: string): () => void {
  const c = CHALLENGES.find((x) => x.id === id)!;
  const real = CHALLENGES.splice(0, CHALLENGES.length, c);
  return () => CHALLENGES.splice(0, CHALLENGES.length, ...real);
}

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  verifyMock.mockImplementation(async (token: string, clientId: string) => (clientId === CLIENT_ID ? (googleUsers[token] ?? null) : null));
  dir = mkdtempSync(join(tmpdir(), "ec-desafio-"));
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
  constructor() {
    this.ws = new WebSocket(`ws://localhost:${srv.port}/ws`);
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
  const res = await fetch(`${base()}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential }) });
  expect(res.status).toBe(200);
  return (await res.json()).session;
}

async function connect(first: Record<string, unknown>) {
  const c = new Client();
  await c.open();
  c.send(first);
  const w = await c.waitFor("welcome");
  return { c, w };
}

async function ranking(session?: string): Promise<{ text: string; view: RankingView }> {
  const res = await fetch(`${base()}/api/ranking`, { headers: session ? { authorization: `Bearer ${session}` } : {} });
  expect(res.status).toBe(200);
  const text = await res.text();
  return { text, view: JSON.parse(text) as RankingView };
}

const ghost = (ms: number): GhostSample[] => [
  [0, 1, 2, 0],
  [ms, 3, 4, 1],
];

describe("/api/ranking: desafio da semana", () => {
  it("traz texto e alvo para visitante, progresso para logado e quem cumpriu sem ids de conta", async () => {
    const restore = force("rally-1-vitoria");
    try {
      const ana = await login("ok-ana");
      await login("ok-beto");
      store.data.challenges[week()] = {
        "g-ana": { ...emptyProgress(), raceWins: 1, raceMatches: 1, doneAt: 5 },
        "g-beto": { ...emptyProgress() },
      };

      const visitor = await ranking();
      expect(visitor.view.desafio).toEqual({
        id: "rally-1-vitoria",
        text: "Vencer uma corrida",
        target: 1,
        points: CHALLENGE_POINTS,
        week: week(),
        mine: null,
        completed: [{ id: ANA, name: "Ana Google" }],
      });

      const mine = await ranking(ana);
      expect(mine.view.desafio.mine).toEqual({ value: 1, target: 1, done: true, bestLapMs: null });

      // nenhum id nem e-mail do Google vaza
      for (const body of [visitor.text, mine.text]) {
        expect(body).not.toContain("g-ana");
        expect(body).not.toContain("g-beto");
        expect(body).not.toContain("@firma.com");
      }
    } finally {
      restore();
    }
  });
});

describe("cumprir o desafio", () => {
  it("volta abaixo do limite no Contra o relógio paga +8 uma vez e avisa só quem cumpriu", async () => {
    const restore = force("volta-rapida");
    try {
      store.data.challenges = {};
      const ana = await login("ok-ana");
      const beto = await login("ok-beto");
      const a = await connect({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR, session: ana });
      const b = await connect({ t: "join", code: a.w.code, name: "Beto", avatar: DEFAULT_AVATAR, session: beto });
      a.c.send({ t: "mode", mode: "timetrial" });
      b.c.send({ t: "ready", ready: true });
      await a.c.waitFor("lobby", (m) => m.state.mode === "timetrial" && m.state.players.every((p) => p.ready || p.id === a.w.id));
      a.c.send({ t: "start" });
      await a.c.waitFor("rsnap");

      const before = month("g-ana");
      const laps = srv.manager.rooms.get(a.w.code)!.race!.completedLaps;
      laps.push({ id: a.w.id, ms: LAP_CHALLENGE_MS - 1500, ghost: ghost(LAP_CHALLENGE_MS - 1500) });
      laps.push({ id: b.w.id, ms: LAP_CHALLENGE_MS + 4000, ghost: ghost(LAP_CHALLENGE_MS + 4000) });
      const msg = await a.c.waitFor("challenge");
      expect(msg).toEqual({ t: "challenge", text: `Volta abaixo de ${LAP_CHALLENGE_MS / 1000} s no Circuito Corporativo`, points: CHALLENGE_POINTS });

      // uma volta ainda melhor na mesma semana não paga de novo
      laps.push({ id: a.w.id, ms: LAP_CHALLENGE_MS - 3000, ghost: ghost(LAP_CHALLENGE_MS - 3000) });
      await a.c.waitFor("ghosts", (m) => m.mine?.ms === LAP_CHALLENGE_MS - 3000);
      expect(a.c.of("challenge")).toHaveLength(1);
      expect(b.c.of("challenge")).toHaveLength(0);
      // +8 do desafio e +5 do recorde da primeira volta da firma; a segunda volta melhor não paga o desafio de novo
      expect(month("g-ana") - before).toBe(CHALLENGE_POINTS + RECORD_POINTS);
      expect(store.data.challenges[week()]["g-beto"].bestLapMs).toBe(LAP_CHALLENGE_MS + 4000);
      expect(month("g-beto")).toBe(0);
      for (const x of [a, b]) x.c.close();
    } finally {
      restore();
    }
  }, 20000);

  it("partida que conta cumpre o desafio, avisa e paga +8 junto dos pontos da colocação", async () => {
    const restore = force("tiroteio-4-partidas");
    try {
      store.data.challenges = { [week()]: { "g-ana": { ...emptyProgress(), shooterMatches: 3 }, "g-beto": { ...emptyProgress(), shooterMatches: 3 } } };
      store.data.months = {};
      const ana = await login("ok-ana");
      const beto = await login("ok-beto");
      const a = await connect({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR, session: ana });
      const b = await connect({ t: "join", code: a.w.code, name: "Beto", avatar: DEFAULT_AVATAR, session: beto });
      const v = await connect({ t: "join", code: a.w.code, name: "Vera", avatar: DEFAULT_AVATAR });
      b.c.send({ t: "ready", ready: true });
      v.c.send({ t: "ready", ready: true });
      await a.c.waitFor("lobby", (m) => m.state.players.length === 3 && m.state.players.filter((p) => p.ready).length === 2);
      srv.manager.rooms.get(a.w.code)!.durationMs = 1000;
      a.c.send({ t: "start" });
      await a.c.waitFor("snap");
      srv.manager.rooms.get(a.w.code)!.match!.players.get(a.w.id)!.score = 99;

      await a.c.waitFor("results", () => true, 15000);
      await b.c.waitFor("challenge");
      await a.c.waitFor("challenge");
      expect(v.c.of("challenge")).toHaveLength(0);
      expect(month("g-ana")).toBe(PLACE_POINTS[0] + CHALLENGE_POINTS);
      expect(month("g-beto")).toBeGreaterThanOrEqual(CHALLENGE_POINTS);
      expect(store.data.challenges[week()]["g-ana"].shooterMatches).toBe(4);
      for (const x of [a, b, v]) x.c.close();
    } finally {
      restore();
    }
  }, 30000);
});

describe("arquivo antigo", () => {
  it("servidor sobe com ranking.json sem dados de desafio e a API já responde", async () => {
    const old = mkdtempSync(join(tmpdir(), "ec-desafio-antigo-"));
    try {
      writeFileSync(join(old, "ranking.json"), JSON.stringify({ version: 1, accounts: { "g-ana": { email: "a@b.c", name: "Ana", since: 1 } }, stats: {}, months: {}, laps: {} }));
      const oldStore = new Store(old);
      expect(oldStore.data.challenges).toEqual({});
      const other = await startServer(0, { store: oldStore, auth: { clientId: CLIENT_ID, secret: SECRET } });
      try {
        const view = (await (await fetch(`http://localhost:${other.port}/api/ranking`)).json()) as RankingView;
        expect(view.desafio.completed).toEqual([]);
        expect(view.desafio.target).toBeGreaterThan(0);
      } finally {
        await other.close();
      }
    } finally {
      rmSync(old, { recursive: true, force: true });
    }
  });
});
