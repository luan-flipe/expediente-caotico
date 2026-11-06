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
  async waitFor<T extends ServerMsg["t"]>(
    t: T,
    pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true,
    ms = 4000
  ) {
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

describe("modo Expediente Suspeito no servidor", () => {
  it("permite selecionar modo suspeito, iniciar e receber snapshots privados", async () => {
    const a = new Client();
    await a.open();
    a.send({ t: "create", name: "Host Ana", avatar: DEFAULT_AVATAR });
    const wa = await a.waitFor("welcome");

    const b = new Client();
    await b.open();
    b.send({ t: "join", code: wa.code, name: "Colab Beto", avatar: DEFAULT_AVATAR });
    await b.waitFor("welcome");

    await a.waitFor("lobby", (m) => m.state.players.length === 2);

    // Seleciona modo suspeito
    a.send({ t: "mode", mode: "suspeito" });
    const lobbyMode = await a.waitFor("lobby", (m) => m.state.mode === "suspeito");
    expect(lobbyMode.state.mode).toBe("suspeito");

    // Configura opções
    a.send({ t: "options", suspeitoTasksPerPlayer: 3 });
    const lobbyOpts = await a.waitFor("lobby", (m) => m.state.options.suspeitoTasksPerPlayer === 3);
    expect(lobbyOpts.state.options.suspeitoTasksPerPlayer).toBe(3);

    // Pronto e Iniciar
    b.send({ t: "ready", ready: true });
    await a.waitFor("lobby", (m) => m.state.players.every((p) => p.ready));

    a.send({ t: "start" });

    // Ambos devem receber ssnap com s e me
    const snapA = await a.waitFor("ssnap");
    const snapB = await b.waitFor("ssnap");

    expect(snapA.s.phase).toBe("intro");
    expect(snapA.s.players).toHaveLength(2);
    expect(snapA.me).toBeDefined();
    expect(snapA.me?.tasks).toBeDefined();
    expect(snapA.me?.visiblePlayerIds).toBeDefined();
    expect(snapA.me?.visionRadius).toBeGreaterThan(0);

    expect(snapB.s.phase).toBe("intro");
    expect(snapB.me).toBeDefined();

    // Envia movimento no modo suspeito
    a.send({ t: "suspeitoInput", mx: 0.5, mz: 0, yaw: 1.57 });

    a.close();
    b.close();
  });

  it("no fim, quem não é anfitrião também volta ao lobby e quem reconecta recebe o resultado", async () => {
    const a = new Client();
    await a.open();
    a.send({ t: "create", name: "Host Ana", avatar: DEFAULT_AVATAR });
    const wa = await a.waitFor("welcome");

    const b = new Client();
    await b.open();
    b.send({ t: "join", code: wa.code, name: "Colab Beto", avatar: DEFAULT_AVATAR });
    const wb = await b.waitFor("welcome");

    a.send({ t: "mode", mode: "suspeito" });
    await a.waitFor("lobby", (m) => m.state.mode === "suspeito" && m.state.players.length === 2);
    b.send({ t: "ready", ready: true });
    await a.waitFor("lobby", (m) => m.state.players.every((p) => p.ready));
    a.send({ t: "start" });
    await a.waitFor("ssnap");

    srv.manager.rooms.get(wa.code)!.suspeito!.phase = "over";
    const res = await b.waitFor("sresults");
    expect(res.results.rows).toHaveLength(2);
    await b.waitFor("lobby", (m) => m.state.phase === "results");

    b.close();
    const b2 = new Client();
    await b2.open();
    b2.send({ t: "resume", code: wa.code, token: wb.token });
    await b2.waitFor("sresults");

    b2.send({ t: "lobby" });
    await a.waitFor("lobby", (m) => m.state.phase === "lobby");

    a.close();
    b2.close();
  });
});
