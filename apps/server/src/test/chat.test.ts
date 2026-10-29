import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { ClientMsg, CHAT_PHRASES, CHAT_EMOTES, DEFAULT_AVATAR, type ServerMsg } from "@ec/shared";
import { startServer, type RunningServer } from "../app";

let srv: RunningServer;

// um servidor por teste: o limite de entradas por IP (8) estoura se todos dividirem o mesmo
beforeAll(() => {
  process.env.NODE_ENV = "test";
});
beforeEach(async () => {
  srv = await startServer(0);
});
afterEach(async () => srv.close());

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
  chats() {
    return this.msgs.filter((m): m is Extract<ServerMsg, { t: "chat" }> => m.t === "chat");
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
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sala() {
  const a = new Client();
  await a.open();
  a.send({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR });
  const wa = await a.waitFor("welcome");
  const b = new Client();
  await b.open();
  b.send({ t: "join", code: wa.code, name: "Beto", avatar: DEFAULT_AVATAR });
  const wb = await b.waitFor("welcome");
  await a.waitFor("lobby", (m) => m.state.players.length === 2);
  return { a, b, wa, wb };
}

describe("chat rápido: protocolo", () => {
  it("tem 8 frases e 6 emotes", () => {
    expect(CHAT_PHRASES).toHaveLength(8);
    expect(CHAT_EMOTES).toHaveLength(6);
  });

  it("aceita índices válidos", () => {
    expect(ClientMsg.safeParse({ t: "chat", index: 0 }).success).toBe(true);
    expect(ClientMsg.safeParse({ t: "chat", index: 7 }).success).toBe(true);
    expect(ClientMsg.safeParse({ t: "emote", index: 5 }).success).toBe(true);
  });

  it("recusa índice fora da faixa, texto e tipos errados", () => {
    expect(ClientMsg.safeParse({ t: "chat", index: 8 }).success).toBe(false);
    expect(ClientMsg.safeParse({ t: "chat", index: -1 }).success).toBe(false);
    expect(ClientMsg.safeParse({ t: "chat", index: 1.5 }).success).toBe(false);
    expect(ClientMsg.safeParse({ t: "emote", index: 6 }).success).toBe(false);
    expect(ClientMsg.safeParse({ t: "chat", index: "Café!" }).success).toBe(false);
    expect(ClientMsg.safeParse({ t: "chat", text: "oi" }).success).toBe(false);
    expect(ClientMsg.safeParse({ t: "emote", index: "😂" }).success).toBe(false);
  });
});

describe("chat rápido: servidor", () => {
  it("replica para todos da sala, inclusive quem mandou, com o id de quem falou", async () => {
    const { a, b, wa } = await sala();
    a.send({ t: "chat", index: 3 });
    const na = await a.waitFor("chat");
    const nb = await b.waitFor("chat");
    expect(nb).toEqual({ t: "chat", from: wa.id, kind: "phrase", index: 3 });
    expect(na).toEqual(nb);
    a.ws.close();
    b.ws.close();
  });

  it("não vaza para outra sala", async () => {
    const s1 = await sala();
    const s2 = await sala();
    s1.a.send({ t: "emote", index: 2 });
    await s1.b.waitFor("chat");
    await wait(150);
    expect(s2.a.chats()).toHaveLength(0);
    expect(s2.b.chats()).toHaveLength(0);
    for (const c of [s1.a, s1.b, s2.a, s2.b]) c.ws.close();
  });

  it("segunda mensagem em menos de 2 s é descartada; depois de 2 s passa", async () => {
    const { a, b, wa } = await sala();
    a.send({ t: "chat", index: 0 });
    await b.waitFor("chat");
    a.send({ t: "emote", index: 1 });
    a.send({ t: "chat", index: 2 });
    await wait(300);
    expect(b.chats()).toHaveLength(1);
    // outro jogador tem limite próprio
    b.send({ t: "chat", index: 4 });
    await a.waitFor("chat", (m) => m.from !== wa.id);
    await wait(2000);
    a.send({ t: "emote", index: 1 });
    await b.waitFor("chat", (m) => m.kind === "emote" && m.index === 1);
    expect(b.chats().filter((m) => m.from === wa.id)).toHaveLength(2);
    a.ws.close();
    b.ws.close();
  }, 10000);

  it("mensagem inválida não é replicada", async () => {
    const { a, b } = await sala();
    a.send({ t: "chat", index: 99 });
    a.send({ t: "chat", text: "oi" });
    await wait(200);
    expect(b.chats()).toHaveLength(0);
    a.ws.close();
    b.ws.close();
  });
});
