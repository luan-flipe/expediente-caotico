import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { DEFAULT_AVATAR, PLACE_POINTS, type RankingView, type ServerMsg } from "@ec/shared";
import { startServer, type RunningServer } from "../app";
import { readSession } from "../auth";
import { Store } from "../store";

// Sem Google de verdade: só as credenciais "ok-*" passam. O resto (inclusive lixo) cai em null, como no real.
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
const base = () => `http://localhost:${srv.port}`;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  verifyMock.mockImplementation(async (token: string, clientId: string) => (clientId === CLIENT_ID ? (googleUsers[token] ?? null) : null));
  dir = mkdtempSync(join(tmpdir(), "ec-ranking-api-"));
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

async function login(credential: string): Promise<{ session: string; name: string }> {
  const res = await fetch(`${base()}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential }) });
  expect(res.status).toBe(200);
  return res.json();
}

async function ranking(session?: string): Promise<RankingView> {
  const res = await fetch(`${base()}/api/ranking`, { headers: session ? { authorization: `Bearer ${session}` } : {} });
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  return res.json();
}

async function connect(first: Record<string, unknown>) {
  const c = new Client();
  await c.open();
  c.send(first);
  const w = await c.waitFor("welcome");
  return { c, w };
}

describe("login e config", () => {
  it("/api/config devolve o client id e não é guardado em cache", async () => {
    const res = await fetch(`${base()}/api/config`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ googleClientId: CLIENT_ID });
  });

  it("credencial inválida dá 401; corpo ruim dá 400; corpo grande dá 413", async () => {
    const post = (body: string) => fetch(`${base()}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body });
    expect((await post(JSON.stringify({ credential: "lixo" }))).status).toBe(401);
    expect(verifyMock).toHaveBeenCalledWith("lixo", CLIENT_ID);
    expect((await post("não é json")).status).toBe(400);
    expect((await post(JSON.stringify({ credential: 42 }))).status).toBe(400);
    expect((await post(JSON.stringify({ credential: "x".repeat(9000) }))).status).toBe(413);
    expect(Object.keys(store.data.accounts)).toHaveLength(0);
  });

  it("login cria a conta com o nome do Google, devolve sessão e não troca o nome numa segunda entrada", async () => {
    const first = await login("ok-ana");
    expect(first.name).toBe("Ana Google");
    expect(readSession(first.session, SECRET)).toBe("g-ana");
    const acc = store.data.accounts["g-ana"];
    expect(acc).toMatchObject({ email: "ana@firma.com", name: "Ana Google" });
    const since = acc.since;

    store.data.accounts["g-ana"].name = "Ana do Crachá";
    googleUsers["ok-ana"] = { sub: "g-ana", email: "ana.nova@firma.com", name: "Outro Nome" };
    const second = await login("ok-ana");
    expect(second.name).toBe("Ana do Crachá");
    expect(store.data.accounts["g-ana"]).toMatchObject({ email: "ana.nova@firma.com", name: "Ana do Crachá", since });
    store.data.accounts["g-ana"].name = "Ana Google";
  });

  it("GET /api/ranking com sessão lixo se comporta como visitante", async () => {
    const view = await ranking("lixo.lixo");
    expect(view.mes.me).toBeNull();
    expect(view.mes.rows).toEqual([]);
  });

  it("sem client id configurado: config devolve null e login dá 404", async () => {
    const other = await startServer(0, { store, auth: { clientId: null, secret: SECRET } });
    try {
      const cfg = await fetch(`http://localhost:${other.port}/api/config`);
      expect(await cfg.json()).toEqual({ googleClientId: null });
      const res = await fetch(`http://localhost:${other.port}/api/login`, { method: "POST", body: JSON.stringify({ credential: "ok-ana" }) });
      expect(res.status).toBe(404);
    } finally {
      await other.close();
    }
  });
});

describe("partidas registram no ranking", () => {
  it("tiroteio: logados pontuam, visitante e bot não aparecem; trocar o crachá atualiza o nome da conta", async () => {
    const ana = await login("ok-ana");
    const beto = await login("ok-beto");

    const a = await connect({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR, session: ana.session });
    const b = await connect({ t: "join", code: a.w.code, name: "Beto", avatar: DEFAULT_AVATAR, session: beto.session });
    const v = await connect({ t: "join", code: a.w.code, name: "Vera", avatar: DEFAULT_AVATAR });
    const lixo = await connect({ t: "join", code: a.w.code, name: "Lixo", avatar: DEFAULT_AVATAR, session: "adulterada.assinatura" });

    const lob = await a.c.waitFor("lobby", (m) => m.state.players.length === 4);
    const ranked = Object.fromEntries(lob.state.players.map((p) => [p.name, p.ranked]));
    expect(ranked).toEqual({ Ana: true, Beto: true, Vera: false, Lixo: false });

    // o nome do crachá vira o nome da conta
    a.c.send({ t: "avatar", avatar: { ...DEFAULT_AVATAR, name: "Ana Crachá" } });
    await a.c.waitFor("lobby", (m) => m.state.players.some((p) => p.name === "Ana Crachá"));
    expect(store.data.accounts["g-ana"].name).toBe("Ana Crachá");
    a.c.send({ t: "avatar", avatar: { ...DEFAULT_AVATAR, name: "Ana Final" } });
    await a.c.waitFor("lobby", (m) => m.state.players.some((p) => p.name === "Ana Final"));
    expect(store.data.accounts["g-ana"].name).toBe("Ana Final");

    a.c.send({ t: "addBot" });
    for (const x of [b, v, lixo]) x.c.send({ t: "ready", ready: true });
    await a.c.waitFor("lobby", (m) => m.state.players.length === 5 && m.state.players.filter((p) => p.ready).length === 5);
    srv.manager.rooms.get(a.w.code)!.durationMs = 1000;
    a.c.send({ t: "start" });
    const snap = await a.c.waitFor("snap");
    expect(snap.s.players).toHaveLength(5);
    // Ana vence com folga
    srv.manager.rooms.get(a.w.code)!.match!.players.get(a.w.id)!.score = 99;
    srv.manager.rooms.get(a.w.code)!.match!.players.get(a.w.id)!.kills = 4;

    const res = await a.c.waitFor("results", () => true, 15000);
    expect(res.rows[0].id).toBe(a.w.id);

    const view = await ranking(ana.session);
    expect(view.mes.rows.map((r) => [r.name, r.points])).toEqual([
      ["Ana Final", PLACE_POINTS[0]],
      ["Beto", PLACE_POINTS[1]],
    ]);
    expect(view.tiroteio.rows).toMatchObject([
      { name: "Ana Final", wins: 1, matches: 1, kills: 4 },
      { name: "Beto", wins: 0, matches: 1, kills: 0 },
    ]);
    expect(view.mes.me).toMatchObject({ name: "Ana Final", rank: 1 });
    expect((await ranking()).mes.me).toBeNull();
    const everyone = JSON.stringify(view);
    expect(everyone).not.toContain("Vera");
    expect(everyone).not.toContain("Lixo");
    expect(everyone).not.toContain("bot-");
    for (const x of [a, b, v, lixo]) x.c.close();
  }, 30000);

  it("rally: pontos pelas colocações reais; visitante e bot ficam de fora", async () => {
    const ana = await login("ok-ana");
    const before = await ranking(ana.session);
    const pointsBefore = Object.fromEntries(before.mes.rows.map((r) => [r.id, r.points]));
    const beto = await login("ok-beto");
    const a = await connect({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR, session: ana.session });
    const b = await connect({ t: "join", code: a.w.code, name: "Beto", avatar: DEFAULT_AVATAR, session: beto.session });
    const v = await connect({ t: "join", code: a.w.code, name: "Vera", avatar: DEFAULT_AVATAR });
    a.c.send({ t: "mode", mode: "race" });
    a.c.send({ t: "addBot" });
    for (const x of [b, v]) x.c.send({ t: "ready", ready: true });
    await a.c.waitFor("lobby", (m) => m.state.mode === "race" && m.state.players.length === 4 && m.state.players.filter((p) => p.ready).length === 4);
    a.c.send({ t: "start" });

    const res = await a.c.waitFor("rresults", () => true, 70000);
    const place = (id: string) => res.rows.find((r) => r.id === id)!.place;
    const pts = (p: number) => PLACE_POINTS[p - 1] ?? 1;

    const view = await ranking(ana.session);
    const month = Object.fromEntries(view.mes.rows.map((r) => [r.id, r.points]));
    expect(month["g-ana"] - pointsBefore["g-ana"]).toBe(pts(place(a.w.id)));
    expect(month["g-beto"] - pointsBefore["g-beto"]).toBe(pts(place(b.w.id)));
    expect(Object.keys(month).sort()).toEqual(["g-ana", "g-beto"]);
    expect(view.rally.rows.map((r) => r.id).sort()).toEqual(["g-ana", "g-beto"]);
    expect(view.rally.rows.every((r) => r.matches === 1)).toBe(true);
    expect(JSON.stringify(view)).not.toContain("Vera");
    // voltas e fantasmas ainda não são gravados aqui (Task 5)
    expect(store.data.laps).toEqual({});
    for (const x of [a, b, v]) x.c.close();
  }, 90000);
});
