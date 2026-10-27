import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { DEFAULT_AVATAR, type ServerMsg } from "@ec/shared";
import { startServer, type RunningServer } from "../app";

process.env.NODE_ENV = "test";
const servers: RunningServer[] = [];
afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});

async function boot(opts?: Parameters<typeof startServer>[1]) {
  const s = await startServer(0, opts);
  servers.push(s);
  return s;
}

function client(port: number, headers?: Record<string, string>) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`, { headers });
  const msgs: ServerMsg[] = [];
  ws.on("message", (d) => msgs.push(JSON.parse(d.toString())));
  const open = new Promise<void>((ok) => ws.once("open", () => ok()));
  const closed = new Promise<number>((ok) => ws.once("close", (code) => ok(code)));
  const send = (m: unknown) => ws.send(JSON.stringify(m));
  const waitFor = async <T extends ServerMsg["t"]>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, ms = 3000) => {
    const start = Date.now();
    for (;;) {
      const f = msgs.find((m) => m.t === t && pred(m as Extract<ServerMsg, { t: T }>));
      if (f) return f as Extract<ServerMsg, { t: T }>;
      if (Date.now() - start > ms) throw new Error(`timeout ${t}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  return { ws, msgs, open, closed, send, waitFor };
}

describe("endurecimento do servidor", () => {
  it("URL malformada responde 400 e o servidor segue no ar", async () => {
    const s = await boot();
    const bad = await fetch(`http://localhost:${s.port}/%E0%A4%A`);
    expect(bad.status).toBe(400);
    const ok = await fetch(`http://localhost:${s.port}/health`);
    expect(ok.status).toBe(200);
  });

  it("exceção no tick encerra só a partida daquela sala", async () => {
    const s = await boot();
    const a = client(s.port);
    await a.open;
    a.send({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR });
    const w = await a.waitFor("welcome");
    a.send({ t: "addBot" });
    await a.waitFor("lobby", (m) => m.state.players.length === 2);
    a.send({ t: "start" });
    await a.waitFor("snap");
    const room = s.manager.rooms.get(w.code)!;
    (room.match as unknown as { players: unknown }).players = null;
    const err = await a.waitFor("error");
    expect(err.msg).toContain("travou");
    expect(room.phase).toBe("lobby");
    a.ws.close();
  });

  it("sessão aberta em outra aba fecha a antiga com código 4001", async () => {
    const s = await boot();
    const a = client(s.port);
    await a.open;
    a.send({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR });
    const w = await a.waitFor("welcome");
    const b = client(s.port);
    await b.open;
    b.send({ t: "resume", code: w.code, token: w.token });
    await b.waitFor("welcome");
    expect(await a.closed).toBe(4001);
    b.ws.close();
  });

  it("conexão silenciosa é derrubada por inatividade", async () => {
    const s = await boot({ idleMs: 300 });
    const a = client(s.port);
    await a.open;
    a.send({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR });
    await a.waitFor("welcome");
    const code = await Promise.race([a.closed, new Promise<string>((r) => setTimeout(() => r("vivo"), 2500))]);
    expect(code).not.toBe("vivo");
  });

  it("limite de criação por IP ignora X-Forwarded-For forjado", async () => {
    const s = await boot();
    const errors: string[] = [];
    for (let i = 0; i < 12; i++) {
      const c = client(s.port, { "x-forwarded-for": `10.0.0.${i}` });
      await c.open;
      c.send({ t: "create", name: `C${i}`, avatar: DEFAULT_AVATAR });
      const m = await Promise.race([c.waitFor("welcome").then(() => null), c.waitFor("error").then((e) => e.msg)]);
      if (m) errors.push(m);
      c.ws.close();
    }
    expect(errors.some((e) => e.includes("Muitas tentativas"))).toBe(true);
  });

  it("anfitrião que sai passa o posto na hora", async () => {
    const s = await boot();
    const a = client(s.port);
    await a.open;
    a.send({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR });
    const w = await a.waitFor("welcome");
    const b = client(s.port);
    await b.open;
    b.send({ t: "join", code: w.code, name: "Beto", avatar: DEFAULT_AVATAR });
    const wb = await b.waitFor("welcome");
    a.send({ t: "leave" });
    const lobby = await b.waitFor("lobby", (m) => m.state.players.length === 1);
    expect(lobby.state.hostId).toBe(wb.id);
    a.ws.close();
    b.ws.close();
  });
});
