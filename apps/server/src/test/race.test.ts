import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { DEFAULT_AVATAR, type ServerMsg } from "@ec/shared";
import { startServer, type RunningServer } from "../app";

let srv: RunningServer;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  srv = await startServer(0, { idleMs: 120000, race: { laps: 1, graceMs: 1000 } });
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
  close() {
    this.ws.close();
  }
}

describe("modo corrida no servidor", () => {
  it("troca de modo, corrida com bots, validação e volta ao lobby", async () => {
    const a = new Client();
    await a.open();
    a.send({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR, chair: { seat: 3, base: 99 } });
    const wa = await a.waitFor("welcome");
    const b = new Client();
    await b.open();
    b.send({ t: "join", code: wa.code, name: "Beto", avatar: DEFAULT_AVATAR });
    const wb = await b.waitFor("welcome");

    b.send({ t: "mode", mode: "race" });
    a.send({ t: "addBot" });
    a.send({ t: "addBot" });
    await a.waitFor("lobby", (m) => m.state.players.length === 4);
    expect(a.msgs.some((m) => m.t === "lobby" && m.state.mode === "race")).toBe(false);

    a.send({ t: "mode", mode: "race" });
    const lob = await a.waitFor("lobby", (m) => m.state.mode === "race");
    expect(lob.state.players.find((p) => p.id === wa.id)!.chair).toEqual({ vehicle: 0, seat: 3, base: 0, wheels: 0, back: 1, trinket: 0 });

    b.send({ t: "ready", ready: true });
    await a.waitFor("lobby", (m) => m.state.players.find((p) => p.id === wb.id)?.ready === true);
    a.send({ t: "start" });
    const first = await a.waitFor("rsnap");
    expect(first.s.phase).toBe("countdown");
    expect(first.s.karts).toHaveLength(4);
    expect(first.me!.item).toBeNull();

    // entrada inválida é descartada; entrada de tiroteio é ignorada
    a.send({ t: "kinput", steer: "x", throttle: 1, drift: false, seq: 1 });
    a.send({ t: "kinput", steer: 2, throttle: 1, drift: false, seq: 2 });
    a.send({ t: "kinput", steer: 0, throttle: 1, drift: false });
    a.send({ t: "input", mx: 1, mz: 0, yaw: 0, fire: true });
    a.send({ t: "kitem" });
    await a.waitFor("rsnap", (m) => m.s.phase === "active", 10000);
    a.send({ t: "kdebug", item: "pasta" });
    const withItem = await a.waitFor("rsnap", (m) => m.me?.item === "pasta");
    expect(withItem.me!.charges).toBe(1);
    a.send({ t: "kitem" });
    await a.waitFor("rsnap", (m) => m.me!.item === null && m.me!.shieldMs > 0);

    // corrida de 1 volta: os bots terminam e os humanos parados ficam para trás
    const res = await a.waitFor("rresults", () => true, 60000);
    expect(res.rows).toHaveLength(4);
    expect(res.rows[0].isBot).toBe(true);
    expect(res.rows.map((r) => r.place)).toEqual([1, 2, 3, 4]);
    const after = await b.waitFor("rresults");
    expect(after.rows).toEqual(res.rows);
    await a.waitFor("lobby", (m) => m.state.phase === "results");

    a.send({ t: "lobby" });
    await a.waitFor("lobby", (m) => m.state.phase === "lobby");
    a.send({ t: "mode", mode: "shooter" });
    await a.waitFor("lobby", (m) => m.state.mode === "shooter" && m.state.phase === "lobby");
    a.close();
    b.close();
  }, 90000);
});
