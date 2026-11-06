import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { DEFAULT_AVATAR, RACE, type ServerMsg } from "@ec/shared";
import { startServer, type RunningServer } from "../app";

type RaceSnap = Extract<ServerMsg, { t: "rsnap" }>;

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
  async waitFor<T extends ServerMsg["t"]>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, ms = 3000) {
    const start = Date.now();
    for (;;) {
      const found = this.msgs.find((m) => m.t === t && pred(m as Extract<ServerMsg, { t: T }>));
      if (found) return found as Extract<ServerMsg, { t: T }>;
      if (Date.now() - start > ms) throw new Error(`timeout esperando ${t}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  snaps() {
    return this.msgs.filter((m): m is RaceSnap => m.t === "rsnap");
  }
}

const andando = (m: RaceSnap) => !m.s.aguardando && m.s.countdownMs < RACE.countdownMs;

let srv: RunningServer | null = null;
afterEach(async () => {
  await srv?.close();
  srv = null;
});

/** Sala de corrida com dois humanos, um bot e a partida iniciada. */
async function corrida(esperaMs: number) {
  process.env.NODE_ENV = "test";
  srv = await startServer(0, { idleMs: 120000, race: { laps: 1, esperaMs } });
  const a = new Client(srv.port);
  await a.open();
  a.send({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR });
  const wa = await a.waitFor("welcome");
  const b = new Client(srv.port);
  await b.open();
  b.send({ t: "join", code: wa.code, name: "Beto", avatar: DEFAULT_AVATAR });
  const wb = await b.waitFor("welcome");
  a.send({ t: "mode", mode: "race" });
  a.send({ t: "addBot" });
  await a.waitFor("lobby", (m) => m.state.players.length === 3 && m.state.mode === "race");
  b.send({ t: "ready", ready: true });
  await a.waitFor("lobby", (m) => m.state.players.find((p) => p.id === wb.id)?.ready === true);
  a.send({ t: "start" });
  return { a, b };
}

describe("espera do preparo da corrida", () => {
  it("segura a contagem até todos avisarem, com os karts já no snapshot", async () => {
    const { a, b } = await corrida(10000);
    const first = await a.waitFor("rsnap");
    expect(first.s.aguardando).toBe(true);
    expect(first.s.phase).toBe("countdown");
    expect(first.s.countdownMs).toBe(RACE.countdownMs);
    expect(first.s.karts).toHaveLength(3);

    a.send({ t: "kpronto" });
    await new Promise((r) => setTimeout(r, 300));
    expect(a.snaps().some(andando)).toBe(false);

    b.send({ t: "kpronto" });
    const go = await a.waitFor("rsnap", andando);
    // a contagem começa do início: a abertura inteira ainda está por vir
    expect(go.s.countdownMs).toBeGreaterThan(RACE.countdownMs - 500);
    await b.waitFor("rsnap", andando);
  });

  it("quem desconecta não segura os outros", async () => {
    const { a, b } = await corrida(10000);
    await a.waitFor("rsnap");
    a.send({ t: "kpronto" });
    b.ws.close();
    await a.waitFor("rsnap", andando);
  });

  it("no limite de tempo a contagem começa mesmo sem o aviso", async () => {
    const { a } = await corrida(300);
    await a.waitFor("rsnap", (m) => m.s.aguardando === true);
    await a.waitFor("rsnap", andando);
  });

  it("aviso repetido ou fora da espera não faz mal", async () => {
    const { a, b } = await corrida(10000);
    a.send({ t: "kpronto" });
    a.send({ t: "kpronto" });
    b.send({ t: "kpronto" });
    await a.waitFor("rsnap", andando);
    a.send({ t: "kpronto" });
    const n = a.snaps().length;
    await a.waitFor("rsnap", () => a.snaps().length > n + 2);
    expect(a.snaps().at(-1)!.s.aguardando).toBeUndefined();
    expect(a.msgs.some((m) => m.t === "error")).toBe(false);
  });

  it("sem espera configurada a contagem começa direto", async () => {
    const { a } = await corrida(0);
    const first = await a.waitFor("rsnap");
    expect(first.s.aguardando).toBeUndefined();
    await a.waitFor("rsnap", andando);
  });
});
