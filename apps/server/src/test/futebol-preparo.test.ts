import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { DEFAULT_AVATAR, type ServerMsg } from "@ec/shared";
import { startServer, type RunningServer } from "../app";

type FutSnap = Extract<ServerMsg, { t: "fsnap" }>;

class Client {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  constructor(port: number) {
    this.ws = new WebSocket(`ws://localhost:${port}/ws`);
    this.ws.on("message", (d) => this.msgs.push(JSON.parse(d.toString())));
  }
  open() {
    return new Promise<void>((ok) => this.ws.once("open", () => ok()));
  }
  send(m: unknown) {
    this.ws.send(JSON.stringify(m));
  }
  async waitFor<T extends ServerMsg["t"]>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, ms = 4000) {
    const start = Date.now();
    for (;;) {
      const found = this.msgs.find((m) => m.t === t && pred(m as Extract<ServerMsg, { t: T }>));
      if (found) return found as Extract<ServerMsg, { t: T }>;
      if (Date.now() - start > ms) throw new Error(`timeout esperando ${t}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  snaps() {
    return this.msgs.filter((m): m is FutSnap => m.t === "fsnap");
  }
}

/** O relógio da partida andou: o jogo saiu da espera. */
const andando = (m: FutSnap) => !m.s.aguardando && m.s.t > 0;

let srv: RunningServer | null = null;
afterEach(async () => {
  await srv?.close();
  srv = null;
});

/** Sala de futebol com dois humanos (um em cada time) e a partida iniciada. */
async function partida(esperaMs: number) {
  process.env.NODE_ENV = "test";
  srv = await startServer(0, { idleMs: 120000, race: { esperaMs } });
  const a = new Client(srv.port);
  await a.open();
  a.send({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR });
  const wa = await a.waitFor("welcome");
  a.send({ t: "mode", mode: "futebol" });
  await a.waitFor("lobby", (m) => m.state.mode === "futebol");
  const b = new Client(srv.port);
  await b.open();
  b.send({ t: "join", code: wa.code, name: "Beto", avatar: DEFAULT_AVATAR });
  const wb = await b.waitFor("welcome");
  b.send({ t: "ready", ready: true });
  await a.waitFor("lobby", (m) => m.state.players.find((p) => p.id === wb.id)?.ready === true);
  a.send({ t: "start" });
  return { a, b };
}

describe("espera do preparo do futebol", () => {
  it("segura o jogo até todos avisarem, com os jogadores já no snapshot", async () => {
    const { a, b } = await partida(10000);
    const first = await a.waitFor("fsnap");
    expect(first.s.aguardando).toBe(true);
    expect(first.s.phase).toBe("kickoff");
    expect(first.s.players.length).toBeGreaterThanOrEqual(4);

    a.send({ t: "fpronto" });
    await new Promise((r) => setTimeout(r, 300));
    expect(a.snaps().some(andando)).toBe(false);
    expect(a.snaps().at(-1)!.s.t).toBe(first.s.t);

    b.send({ t: "fpronto" });
    await a.waitFor("fsnap", andando);
    await b.waitFor("fsnap", andando);
  });

  it("quem desconecta não segura os outros", async () => {
    const { a, b } = await partida(10000);
    await a.waitFor("fsnap");
    a.send({ t: "fpronto" });
    b.ws.close();
    await a.waitFor("fsnap", andando);
  });

  it("no limite de tempo o jogo começa mesmo sem o aviso", async () => {
    const { a } = await partida(300);
    await a.waitFor("fsnap", (m) => m.s.aguardando === true);
    await a.waitFor("fsnap", andando);
  });

  it("sem espera configurada o jogo começa direto", async () => {
    const { a } = await partida(0);
    const first = await a.waitFor("fsnap");
    expect(first.s.aguardando).toBeUndefined();
    await a.waitFor("fsnap", andando);
  });
});
