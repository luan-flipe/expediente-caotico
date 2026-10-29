import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { DEFAULT_AVATAR, type ServerMsg } from "@ec/shared";
import { startServer, type RunningServer } from "../app";

let srv: RunningServer;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  srv = await startServer(0);
});
afterAll(async () => srv.close());

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
  clear() {
    this.msgs = [];
  }
  close() {
    this.ws.close();
  }
}

describe("servidor", () => {
  it("cria, entra, inicia, valida e reconecta", async () => {
    const a = new Client();
    await a.open();
    a.send({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR });
    const wa = await a.waitFor("welcome");
    expect(wa.code).toMatch(/^[A-Z]{5}$/);

    const b = new Client();
    await b.open();
    b.send({ t: "join", code: wa.code, name: "Beto", avatar: { ...DEFAULT_AVATAR, skin: 99 } });
    const wb = await b.waitFor("welcome");
    const lobby = await a.waitFor("lobby", (m) => m.state.players.length === 2);
    expect(lobby.state.hostId).toBe(wa.id);
    expect(lobby.state.players.find((p) => p.id === wb.id)!.avatar.skin).toBe(DEFAULT_AVATAR.skin);

    a.send({ t: "start" });
    const err = await a.waitFor("error");
    expect(err.msg).toContain("Beto");

    b.send({ t: "ready", ready: true });
    await a.waitFor("lobby", (m) => m.state.players.every((p) => p.ready));
    a.send({ t: "start" });
    const snap = await b.waitFor("snap");
    expect(snap.s.phase).toBe("countdown");
    expect(snap.s.players).toHaveLength(2);
    expect(snap.me?.options).toHaveLength(3);

    // mensagens inválidas não derrubam
    b.ws.send("{lixo");
    b.send({ t: "input", mx: "NaN", mz: 0, yaw: 0, fire: false });
    b.send({ t: "input", mx: 1e9, mz: 0, yaw: 0, fire: false });
    b.clear();
    await b.waitFor("snap");

    // reconexão com token
    b.close();
    const b2 = new Client();
    await b2.open();
    b2.send({ t: "resume", code: wa.code, token: wb.token });
    const wb2 = await b2.waitFor("welcome");
    expect(wb2.id).toBe(wb.id);
    await b2.waitFor("snap");

    // token errado não assume ninguém
    const c = new Client();
    await c.open();
    c.send({ t: "resume", code: wa.code, token: "x".repeat(24) });
    expect((await c.waitFor("error")).msg).toBe("Sessão expirada");

    // não entra no meio da partida
    c.send({ t: "join", code: wa.code, name: "Caio", avatar: DEFAULT_AVATAR });
    expect((await c.waitFor("error", (m) => m.msg !== "Sessão expirada")).msg).toContain("andamento");

    a.close();
    b2.close();
    c.close();
  });

  it("limita a 8 participantes", async () => {
    const host = new Client();
    await host.open();
    host.send({ t: "create", name: "Host", avatar: DEFAULT_AVATAR });
    const w = await host.waitFor("welcome");
    for (let i = 0; i < 7; i++) host.send({ t: "addBot" });
    await host.waitFor("lobby", (m) => m.state.players.length === 8);
    const extra = new Client();
    await extra.open();
    extra.send({ t: "join", code: w.code, name: "Nono", avatar: DEFAULT_AVATAR });
    expect((await extra.waitFor("error")).msg).toBe("Sala cheia");
    host.close();
    extra.close();
  });

  it("sala inexistente", async () => {
    const c = new Client();
    await c.open();
    c.send({ t: "join", code: "ZZZZZ", name: "X", avatar: DEFAULT_AVATAR });
    expect((await c.waitFor("error")).msg).toBe("Sala não encontrada");
    c.close();
  });
});
