import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { DEFAULT_AVATAR, DEFAULT_ROOM_OPTIONS, RACE, giveItem, type ServerMsg } from "@ec/shared";
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
  dir = mkdtempSync(join(tmpdir(), "ec-painel-"));
  store = new Store(dir);
  // sem `laps` de teste: a sala começa com as voltas padrão (3) e o anfitrião muda
  srv = await startServer(0, { idleMs: 120000, race: { graceMs: 1000 }, store, auth: { clientId: CLIENT_ID, secret: SECRET } });
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
  /** Última foto do lobby recebida. */
  lobby() {
    const all = this.msgs.filter((m) => m.t === "lobby") as Extract<ServerMsg, { t: "lobby" }>[];
    return all[all.length - 1].state;
  }
  close() {
    this.ws.close();
  }
}

async function connect(first: Record<string, unknown>) {
  const c = new Client();
  await c.open();
  c.send(first);
  const w = await c.waitFor("welcome");
  return { c, w };
}

async function login(credential: string): Promise<string> {
  const res = await fetch(`http://localhost:${srv.port}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential }) });
  expect(res.status).toBe(200);
  return (await res.json()).session;
}

/** Duas mensagens ida e volta: o que veio antes já foi tratado pelo servidor. */
async function settle(c: Client) {
  const n = Math.random();
  c.send({ t: "ping", c: n });
  await c.waitFor("pong", (m) => m.c === n);
}

describe("painel do anfitrião", () => {
  it("o lobby traz as opções padrão", async () => {
    const a = await connect({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR });
    const lob = await a.c.waitFor("lobby");
    expect(lob.state.options).toEqual(DEFAULT_ROOM_OPTIONS);
    expect(lob.state.options).toEqual({ laps: 3, items: true, botLevel: "normal" });
    a.c.close();
  });

  it("só o anfitrião muda as opções; o convidado muda nada e vê as do anfitrião", async () => {
    const a = await connect({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR });
    const b = await connect({ t: "join", code: a.w.code, name: "Beto", avatar: DEFAULT_AVATAR });
    await a.c.waitFor("lobby", (m) => m.state.players.length === 2);

    b.c.send({ t: "options", laps: 5, items: false, botLevel: "hard" });
    await settle(b.c);
    expect(srv.manager.rooms.get(a.w.code)!.options).toEqual({ laps: 3, items: true, botLevel: "normal" });

    a.c.send({ t: "options", laps: 2, botLevel: "easy" });
    await b.c.waitFor("lobby", (m) => m.state.options.laps === 2);
    expect(b.c.lobby().options).toEqual({ laps: 2, items: true, botLevel: "easy" });
    // opção parcial mexe só no que veio
    a.c.send({ t: "options", items: false });
    await b.c.waitFor("lobby", (m) => !m.state.options.items);
    expect(b.c.lobby().options).toEqual({ laps: 2, items: false, botLevel: "easy" });
    for (const x of [a, b]) x.c.close();
  });

  it("valores fora dos limites são recusados e nada muda", async () => {
    const a = await connect({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR });
    for (const bad of [{ laps: 0 }, { laps: 6 }, { laps: 2.5 }, { laps: "3" }, { botLevel: "impossivel" }, { items: "sim" }]) a.c.send({ t: "options", ...bad });
    await settle(a.c);
    expect(srv.manager.rooms.get(a.w.code)!.options).toEqual({ laps: 3, items: true, botLevel: "normal" });
    a.c.close();
  });

  it("corrida sem itens e com 1 volta: sem caixas, kitem não faz nada e a opção vai para a corrida", async () => {
    const a = await connect({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR });
    a.c.send({ t: "mode", mode: "race" });
    a.c.send({ t: "options", laps: 1, items: false, botLevel: "hard" });
    a.c.send({ t: "addBot" });
    await a.c.waitFor("lobby", (m) => m.state.mode === "race" && m.state.players.length === 2 && !m.state.options.items);
    a.c.send({ t: "start" });
    await a.c.waitFor("rsnap");
    const race = srv.manager.rooms.get(a.w.code)!.race!;
    expect(race.laps).toBe(1);
    expect(race.itemsOff).toBe(true);
    expect(race.botLevel).toBe("hard");
    expect(race.boxes).toHaveLength(0);
    const me = race.racers.get(a.w.id)!;
    giveItem(me, "expresso");
    a.c.send({ t: "kitem" });
    await settle(a.c);
    expect(me.useQueued).toBe(false);
    expect(me.itemsUsed).toEqual({});
    a.c.close();
  });

  it("depois de começar a partida as opções ficam travadas", async () => {
    const a = await connect({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR });
    a.c.send({ t: "mode", mode: "timetrial" });
    await a.c.waitFor("lobby", (m) => m.state.mode === "timetrial");
    a.c.send({ t: "start" });
    await a.c.waitFor("rsnap");
    a.c.send({ t: "options", laps: 5 });
    await settle(a.c);
    expect(srv.manager.rooms.get(a.w.code)!.options.laps).toBe(3);
    a.c.close();
  });

  it("tiroteio leva a dificuldade para a partida", async () => {
    const a = await connect({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR });
    a.c.send({ t: "options", botLevel: "easy" });
    a.c.send({ t: "addBot" });
    await a.c.waitFor("lobby", (m) => m.state.players.length === 2 && m.state.options.botLevel === "easy");
    a.c.send({ t: "start" });
    await a.c.waitFor("snap");
    expect(srv.manager.rooms.get(a.w.code)!.match!.botLevel).toBe("easy");
    a.c.close();
  });
});

describe("ranking com opções fora do padrão", () => {
  // servidor novo: o limite de entradas por IP do anterior já foi gasto
  beforeAll(async () => {
    await srv.close();
    srv = await startServer(0, { idleMs: 120000, race: { graceMs: 1000 }, store, auth: { clientId: CLIENT_ID, secret: SECRET } });
  });

  it("rally de 1 volta e sem itens ainda conta vitória e partida para quem está logado", async () => {
    const ana = await login("ok-ana");
    const beto = await login("ok-beto");
    const a = await connect({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR, session: ana });
    const b = await connect({ t: "join", code: a.w.code, name: "Beto", avatar: DEFAULT_AVATAR, session: beto });
    a.c.send({ t: "mode", mode: "race" });
    a.c.send({ t: "options", laps: 1, items: false });
    a.c.send({ t: "addBot" });
    b.c.send({ t: "ready", ready: true });
    await a.c.waitFor("lobby", (m) => m.state.mode === "race" && !m.state.options.items && m.state.players.length === 3 && m.state.players.filter((p) => p.ready).length === 3);
    a.c.send({ t: "start" });
    await a.c.waitFor("rsnap");
    expect(srv.manager.rooms.get(a.w.code)!.race!.laps).not.toBe(RACE.laps);

    // humanos parados, o bot termina a volta e dispara o fim da corrida
    const res = await a.c.waitFor("rresults", () => true, 70000);
    expect(res.rows).toHaveLength(3);
    expect(store.data.stats["g-ana"].raceMatches).toBe(1);
    expect(store.data.stats["g-beto"].raceMatches).toBe(1);
    const wins = (id: string) => store.data.stats[id].raceWins;
    expect(wins("g-ana") + wins("g-beto")).toBeLessThanOrEqual(1);
    for (const x of [a, b]) x.c.close();
  }, 90000);
});
