import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { DEFAULT_AVATAR, type ServerMsg } from "@ec/shared";
import { startServer, type RunningServer } from "../app";

let srv: RunningServer;
let nextIp = 1;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  // um IP por cliente: o limite de entradas por IP não atrapalha os testes
  process.env.TRUST_PROXY = "1";
  srv = await startServer(0, { idleMs: 120000 });
});
afterAll(async () => srv.close());

class Client {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  constructor() {
    this.ws = new WebSocket(`ws://localhost:${srv.port}/ws`, { headers: { "x-forwarded-for": `10.9.0.${nextIp++}` } });
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

async function twoPlayers() {
  const a = new Client();
  await a.open();
  a.send({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR });
  const wa = await a.waitFor("welcome");
  const b = new Client();
  await b.open();
  b.send({ t: "join", code: wa.code, name: "Beto", avatar: DEFAULT_AVATAR });
  const wb = await b.waitFor("welcome");
  return { a, b, wa, wb, room: srv.manager.rooms.get(wa.code)! };
}

describe("modo futebol no servidor", () => {
  it("anfitrião troca para futebol e formato", async () => {
    const { a, b, wa, wb } = await twoPlayers();
    b.send({ t: "mode", mode: "futebol" });
    b.send({ t: "options", futFormat: 4 });
    a.send({ t: "mode", mode: "futebol" });
    const lob = await a.waitFor("lobby", (m) => m.state.mode === "futebol");
    expect(lob.state.options.futFormat).toBe(2);
    expect(lob.state.options.futTeams.map((t) => t.name)).toEqual(["Financeiro", "TI"]);
    // quem já estava na sala é distribuído alternando
    expect(lob.state.players.find((p) => p.id === wa.id)!.side).toBe(0);
    expect(lob.state.players.find((p) => p.id === wb.id)!.side).toBe(1);
    a.send({ t: "options", futFormat: 3 });
    await a.waitFor("lobby", (m) => m.state.options.futFormat === 3);
    // o pedido do não-anfitrião nunca virou formato 4
    expect(a.msgs.some((m) => m.t === "lobby" && m.state.options.futFormat === 4)).toBe(false);
    a.close();
    b.close();
  });

  it("trocar para futebol remove os bots da sala", async () => {
    const { a, b } = await twoPlayers();
    a.send({ t: "addBot" });
    await a.waitFor("lobby", (m) => m.state.players.some((p) => p.isBot));
    a.send({ t: "mode", mode: "futebol" });
    const lob = await a.waitFor("lobby", (m) => m.state.mode === "futebol");
    expect(lob.state.players.some((p) => p.isBot)).toBe(false);
    a.close();
    b.close();
  });

  it("jogador escolhe o time", async () => {
    const { a, b, wb } = await twoPlayers();
    a.send({ t: "mode", mode: "futebol" });
    await b.waitFor("lobby", (m) => m.state.mode === "futebol");
    b.send({ t: "futTeam", side: 0 });
    await a.waitFor("lobby", (m) => m.state.players.find((p) => p.id === wb.id)?.side === 0);
    b.send({ t: "futTeam", side: 1 });
    await a.waitFor("lobby", (m) => m.state.players.find((p) => p.id === wb.id)?.side === 1);
    a.close();
    b.close();
  });

  it("entrar com a sala já em futebol põe no time com menos gente", async () => {
    const a = new Client();
    await a.open();
    a.send({ t: "create", name: "Ana", avatar: DEFAULT_AVATAR });
    const wa = await a.waitFor("welcome");
    a.send({ t: "mode", mode: "futebol" });
    await a.waitFor("lobby", (m) => m.state.mode === "futebol");
    const b = new Client();
    await b.open();
    b.send({ t: "join", code: wa.code, name: "Beto", avatar: DEFAULT_AVATAR });
    const wb = await b.waitFor("welcome");
    const lob = await b.waitFor("lobby", (m) => m.state.players.length === 2);
    expect(lob.state.players.find((p) => p.id === wa.id)!.side).toBe(0);
    expect(lob.state.players.find((p) => p.id === wb.id)!.side).toBe(1);
    a.close();
    b.close();
  });

  it("cor repetida é recusada e o nome é sanitizado", async () => {
    const { a, b } = await twoPlayers();
    a.send({ t: "mode", mode: "futebol" });
    await b.waitFor("lobby", (m) => m.state.mode === "futebol");
    // ciano (3) é a cor do time 1
    a.send({ t: "futTeamConfig", side: 0, color: 3 });
    await a.waitFor("error");
    a.send({ t: "futTeamConfig", side: 0, name: "<b>Contábil", kit: 2, color: 5 });
    const lob = await a.waitFor("lobby", (m) => m.state.options.futTeams[0].color === 5);
    expect(lob.state.options.futTeams[0]).toEqual({ name: "bContábil", kit: 2, color: 5 });
    // nome vazio depois de sanitizar não vale
    a.send({ t: "futTeamConfig", side: 0, name: "<>" });
    a.send({ t: "futTeamConfig", side: 0, kit: 1 });
    const after = await a.waitFor("lobby", (m) => m.state.options.futTeams[0].kit === 1);
    expect(after.state.options.futTeams[0].name).toBe("bContábil");
    a.close();
    b.close();
  });

  it("não-anfitrião não muda o time dos outros", async () => {
    const { a, b } = await twoPlayers();
    a.send({ t: "mode", mode: "futebol" });
    await b.waitFor("lobby", (m) => m.state.mode === "futebol");
    // Beto é o primeiro humano do time 1, mas o time 0 é da Ana
    b.send({ t: "futTeamConfig", side: 0, name: "Invasores" });
    b.send({ t: "futTeamConfig", side: 1, name: "Suporte" });
    const lob = await a.waitFor("lobby", (m) => m.state.options.futTeams[1].name === "Suporte");
    expect(lob.state.options.futTeams[0].name).toBe("Financeiro");
    a.close();
    b.close();
  });

  it("time com gente demais para o formato é recusado no start", async () => {
    const { a, b, wb } = await twoPlayers();
    a.send({ t: "mode", mode: "futebol" });
    a.send({ t: "options", futFormat: 1 });
    b.send({ t: "futTeam", side: 0 });
    b.send({ t: "ready", ready: true });
    await a.waitFor("lobby", (m) => m.state.players.find((p) => p.id === wb.id)?.side === 0 && m.state.options.futFormat === 1 && m.state.mode === "futebol");
    await a.waitFor("lobby", (m) => m.state.players.find((p) => p.id === wb.id)?.ready === true);
    a.send({ t: "start" });
    const err = await a.waitFor("error");
    expect(err.msg).toBe("Time com gente demais para o formato");
    a.close();
    b.close();
  });

  it("start completa com bots e manda fsnap", async () => {
    const { a, b, wa, wb } = await twoPlayers();
    a.send({ t: "mode", mode: "futebol" });
    b.send({ t: "ready", ready: true });
    await a.waitFor("lobby", (m) => m.state.players.find((p) => p.id === wb.id)?.ready === true);
    a.send({ t: "start" });
    const first = await a.waitFor("fsnap");
    // formato 2: 2 de linha + goleiro por time
    expect(first.s.players).toHaveLength(6);
    expect(first.s.players.filter((p) => !p.isBot).map((p) => p.id).sort()).toEqual([wa.id, wb.id].sort());
    expect(first.s.players.find((p) => p.id === wa.id)!.side).toBe(0);
    expect(first.s.players.find((p) => p.id === wb.id)!.side).toBe(1);
    expect(first.s.teams[0].name).toBe("Financeiro");
    expect(first.me).not.toBeNull();
    a.send({ t: "futInput", mx: 1, mz: 0, aim: 0, sprint: false, kick: "none", pass: "none", seq: 7 });
    a.send({ t: "futInput", mx: 5, mz: 0, aim: 0, sprint: false, kick: "none", pass: "none", seq: 8 });
    a.send({ t: "kinput", steer: 0, throttle: 1, drift: false, seq: 1 });
    await a.waitFor("fsnap", (m) => m.me?.ackSeq === 7);
    // o snapshot leva só os eventos do tick: o apito de início aparece uma vez só
    const events = a.msgs.flatMap((m) => (m.t === "fsnap" ? m.s.events : []));
    expect(events.filter((e) => e.type === "whistle" && e.kind === "start").length).toBeLessThanOrEqual(1);
    a.close();
    b.close();
  });

  it("5v5 estádio: aceita o formato e começa com 4 de linha + goleiro no gramado inteiro", async () => {
    const { a, b, wb } = await twoPlayers();
    a.send({ t: "mode", mode: "futebol" });
    a.send({ t: "options", futFormat: 5 });
    b.send({ t: "ready", ready: true });
    await a.waitFor("lobby", (m) => m.state.options.futFormat === 5 && m.state.players.find((p) => p.id === wb.id)?.ready === true);
    a.send({ t: "start" });
    const first = await a.waitFor("fsnap");
    expect(first.s.format).toBe(5);
    expect(first.s.players).toHaveLength(10);
    for (const side of [0, 1]) {
      expect(first.s.players.filter((p) => p.side === side && p.role === "linha")).toHaveLength(4);
    }
    a.close();
    b.close();
  });

  it("jogador que cai vira bot e a partida segue, e volta ao reconectar", async () => {
    const { a, b, wa, wb, room } = await twoPlayers();
    a.send({ t: "mode", mode: "futebol" });
    b.send({ t: "ready", ready: true });
    await a.waitFor("lobby", (m) => m.state.players.find((p) => p.id === wb.id)?.ready === true);
    a.send({ t: "start" });
    await a.waitFor("fsnap");
    const token = room.members.get(wb.id)!.token;
    b.close();
    const dropped = await a.waitFor("fsnap", (m) => m.s.players.find((p) => p.id === wb.id)?.isBot === true);
    expect(dropped.s.players.find((p) => p.id === wa.id)!.isBot).toBe(false);
    const before = dropped.s.t;
    await a.waitFor("fsnap", (m) => m.s.t > before + 200);
    const b2 = new Client();
    await b2.open();
    b2.send({ t: "resume", code: wa.code, token });
    await b2.waitFor("welcome");
    const back = await b2.waitFor("fsnap", (m) => m.s.players.find((p) => p.id === wb.id)?.isBot === false);
    expect(back.me).not.toBeNull();
    a.close();
    b2.close();
  });

  it("fim manda fresults e volta ao lobby pelo anfitrião", async () => {
    const { a, b, wb, room } = await twoPlayers();
    a.send({ t: "mode", mode: "futebol" });
    b.send({ t: "ready", ready: true });
    await a.waitFor("lobby", (m) => m.state.players.find((p) => p.id === wb.id)?.ready === true);
    room.members.get(wb.id)!.accountId = "conta-secreta";
    a.send({ t: "start" });
    await a.waitFor("fsnap");
    const fut = room.futebol!;
    fut.score = [1, 0];
    fut.phase = "play";
    fut.durationMs = fut.elapsedMs + 300;
    const res = await a.waitFor("fresults", () => true, 5000);
    expect(res.score.winner).toBe(0);
    expect(res.score.score).toEqual([1, 0]);
    expect(res.rows.length).toBe(4);
    // a conta de ninguém vai para os clientes; o servidor guarda para o ranking
    expect(JSON.stringify(res.rows)).not.toContain("accountId");
    expect(JSON.stringify(res.rows)).not.toContain("conta-secreta");
    expect(room.futResults!.find((r) => r.id === wb.id)!.accountId).toBe("conta-secreta");
    expect(res.awards).toEqual([]);
    const after = await b.waitFor("fresults");
    expect(after.rows).toEqual(res.rows);
    await a.waitFor("lobby", (m) => m.state.phase === "results");
    b.send({ t: "lobby" });
    a.send({ t: "lobby" });
    await a.waitFor("lobby", (m) => m.state.phase === "lobby");
    a.close();
    b.close();
  }, 15000);
});

describe("campeonato entre setores", () => {
  async function ready(a: Client, b: Client, wb: { id: string }, size: number) {
    a.send({ t: "mode", mode: "futebol" });
    a.send({ t: "options", futCup: size });
    b.send({ t: "ready", ready: true });
    await a.waitFor("lobby", (m) => m.state.options.futCup === size && m.state.players.find((p) => p.id === wb.id)?.ready === true);
  }
  async function waitMatch(room: NonNullable<ReturnType<typeof srv.manager.rooms.get>>) {
    for (let t = 0; t < 150 && !(room.phase === "match" && room.futebol); t++) await new Promise((r) => setTimeout(r, 20));
    expect(room.futebol).not.toBeNull();
  }
  /** Joga o jogo atual até o fim com o lado vencedor forçado e devolve o lobby já com a chave atualizada. */
  async function playUntilEnd(a: Client, room: NonNullable<ReturnType<typeof srv.manager.rooms.get>>, winner: 0 | 1, played: number) {
    await waitMatch(room);
    const fut = room.futebol!;
    fut.score = winner === 0 ? [1, 0] : [0, 1];
    fut.phase = "play";
    fut.durationMs = fut.elapsedMs + 300;
    return a.waitFor("lobby", (m) => m.state.phase === "results" && m.state.cup!.matches.filter((x) => x.winner !== null).length >= played, 8000);
  }
  async function next(a: Client, b: Client, room: NonNullable<ReturnType<typeof srv.manager.rooms.get>>) {
    a.send({ t: "lobby" });
    for (let t = 0; t < 150 && room.phase !== "lobby"; t++) await new Promise((r) => setTimeout(r, 20));
    b.send({ t: "ready", ready: true });
    for (let t = 0; t < 150 && !room.humans().every((h) => h.id === room.hostId || h.ready); t++) await new Promise((r) => setTimeout(r, 20));
    a.send({ t: "start" });
  }

  it("opção liga a chave e o primeiro jogo é de um time humano contra um setor de bots", async () => {
    const { a, b, wa, wb } = await twoPlayers();
    await ready(a, b, wb, 4);
    a.send({ t: "start" });
    const first = await a.waitFor("fsnap");
    const lob = await a.waitFor("lobby", (m) => !!m.state.cup);
    expect(lob.state.cup!.matches).toHaveLength(3);
    // Ana joga pelo Financeiro; o TI de Beto só entra no outro jogo e ele assiste
    expect(first.s.teams[0].name).toBe("Financeiro");
    expect(["TI", "Financeiro"]).not.toContain(first.s.teams[1].name);
    expect(first.s.players.some((p) => p.id === wa.id)).toBe(true);
    expect(first.s.players.some((p) => p.id === wb.id)).toBe(false);
    a.close();
    b.close();
  }, 15000);

  it("a chave avança a cada partida e termina com campeão", async () => {
    const { a, b, wb, room } = await twoPlayers();
    await ready(a, b, wb, 4);
    a.send({ t: "start" });
    // jogo 1: Financeiro (Ana) vence
    let lob = await playUntilEnd(a, room, 0, 1);
    const cup = () => lob.state.cup!;
    const fin = cup().teams.findIndex((t) => t.side === 0);
    const ti = cup().teams.findIndex((t) => t.side === 1);
    expect(cup().matches[0].winner).toBe(fin);
    expect(cup().champion).toBeNull();
    // jogo 2: TI (Beto) vence o seu; a final fica Financeiro x TI
    await next(a, b, room);
        lob = await playUntilEnd(a, room, 1, 2);
    expect(cup().matches[1].winner).toBe(ti);
    expect(cup().matches[2].a).not.toBeNull();
    // final entre os dois humanos: Financeiro leva
    await next(a, b, room);
        lob = await playUntilEnd(a, room, 0, 3);
    expect(cup().champion).toBe(fin);
    a.close();
    b.close();
  }, 40000);
});
