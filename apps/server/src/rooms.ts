import { randomBytes, randomInt } from "node:crypto";
import type { WebSocket } from "ws";
import {
  BALANCE,
  ClientMsg,
  DEFAULT_CHAIR,
  buildPrivate,
  buildRacePrivate,
  buildRaceSnapshot,
  buildSnapshot,
  chooseEvolution,
  createMatch,
  createRace,
  getRaceResults,
  getResults,
  giveItem,
  queueAction,
  queueItemUse,
  randomChair,
  respawnRequest,
  PRESETS,
  sanitizeAvatar,
  sanitizeChair,
  sanitizeName,
  setInput,
  setKartInput,
  stepMatch,
  stepRace,
  type AvatarDNA,
  type ChairDNA,
  type GameMode,
  type LobbyState,
  type Match,
  type RaceMatch,
  type RaceResultRow,
  type ResultRow,
  type ServerMsg,
} from "@ec/shared";
import { TokenBucket } from "./ratelimit";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const BOT_NAMES = ["Estagiário Kevin", "Estagiária Bia", "Estagiário Davi", "Estagiária Lu", "Estagiário Téo", "Estagiária Mel", "Estagiário Juca"];
const TICK_MS = 1000 / BALANCE.tickHz;
/**
 * Ferramenta de teste de itens (kdebug): só quando o servidor roda direto do .ts
 * (pnpm dev, testes). O build de produção é um .js empacotado, então nunca libera,
 * mesmo sem NODE_ENV definido.
 */
const DEV_TOOLS = import.meta.url.endsWith(".ts") && process.env.NODE_ENV !== "production";
/** Código de fechamento quando a mesma sessão é aberta em outra aba: o cliente não deve reconectar. */
export const CLOSE_DUPLICATE = 4001;

export interface Conn {
  ws: WebSocket;
  ip: string;
  bucket: TokenBucket;
  room?: Room;
  memberId?: string;
  invalid: number;
  lastSeen: number;
}

interface Member {
  id: string;
  token: string;
  name: string;
  avatar: AvatarDNA;
  chair: ChairDNA;
  ready: boolean;
  isBot: boolean;
  conn: Conn | null;
  leftAt: number | null;
}

function send(conn: Conn | null, msg: ServerMsg | string): void {
  if (!conn || conn.ws.readyState !== conn.ws.OPEN) return;
  conn.ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
}

function log(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "test") console.log(new Date().toISOString(), ...args);
}

export class Room {
  hostId = "";
  phase: LobbyState["phase"] = "lobby";
  mode: GameMode = "shooter";
  durationMs = 300000;
  members = new Map<string, Member>();
  match: Match | null = null;
  race: RaceMatch | null = null;
  results: ResultRow[] | null = null;
  raceResults: RaceResultRow[] | null = null;
  private timer: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private lastTickAt = 0;
  private pendingMs = 0;
  private nextBot = 0;
  emptySince: number | null = null;

  /** raceOpts encurta a corrida nos testes. */
  constructor(
    readonly code: string,
    private readonly raceOpts: { laps?: number; graceMs?: number } = {},
  ) {}

  humans(): Member[] {
    return [...this.members.values()].filter((m) => !m.isBot);
  }

  lobbyState(): LobbyState {
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      mode: this.mode,
      durationMs: this.durationMs,
      players: [...this.members.values()].map((m) => ({
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        chair: m.chair,
        ready: m.isBot || m.ready || m.id === this.hostId,
        isBot: m.isBot,
        connected: m.isBot || m.conn !== null,
      })),
    };
  }

  broadcast(msg: ServerMsg): void {
    const raw = JSON.stringify(msg);
    for (const m of this.members.values()) send(m.conn, raw);
  }

  broadcastLobby(): void {
    this.broadcast({ t: "lobby", state: this.lobbyState() });
  }

  addMember(name: string, avatar: AvatarDNA, conn: Conn | null, isBot = false, chair: ChairDNA = DEFAULT_CHAIR): Member {
    const id = isBot ? `bot-${++this.nextBot}` : randomBytes(6).toString("hex");
    const m: Member = { id, token: randomBytes(18).toString("base64url"), name, avatar, chair, ready: false, isBot, conn, leftAt: null };
    this.members.set(id, m);
    if (!this.hostId && !isBot) this.hostId = id;
    return m;
  }

  removeMember(id: string): void {
    this.members.delete(id);
    if (this.hostId === id) {
      const next = this.humans().find((h) => h.conn) ?? this.humans()[0];
      this.hostId = next?.id ?? "";
    }
  }

  start(): string | null {
    if (this.phase !== "lobby") return "A partida já começou";
    if (this.members.size < 2) return "Precisa de pelo menos 2 participantes (adicione um bot)";
    const notReady = this.humans().filter((h) => h.id !== this.hostId && (!h.ready || !h.conn));
    if (notReady.length) return `Aguardando: ${notReady.map((h) => h.name).join(", ")}`;
    const seed = randomInt(1, 2 ** 31);
    const players = [...this.members.values()].map((m) => ({ id: m.id, name: m.name, avatar: m.avatar, chair: m.chair, isBot: m.isBot }));
    if (this.mode === "race") this.race = createRace({ seed, players, ...this.raceOpts });
    else this.match = createMatch({ durationMs: this.durationMs, seed, players });
    this.phase = "match";
    this.results = null;
    this.raceResults = null;
    this.tickCount = 0;
    this.broadcastLobby();
    this.lastTickAt = performance.now();
    this.pendingMs = 0;
    // intervalo menor que o passo: no Windows o timer arredonda para ~16 ms e a partida andaria mais devagar
    this.timer = setInterval(() => this.tick(), TICK_MS / 2);
    log(`[${this.code}] ${this.mode === "race" ? "corrida" : "partida"} iniciada com ${this.members.size} participantes`);
    return null;
  }

  /** Passo fixo: roda quantos passos de simulação o tempo real pedir (no máximo 4 por chamada). */
  private tick(): void {
    const now = performance.now();
    this.pendingMs = Math.min(this.pendingMs + now - this.lastTickAt, TICK_MS * 4);
    this.lastTickAt = now;
    try {
      while (this.pendingMs >= TICK_MS && this.timer) {
        this.pendingMs -= TICK_MS;
        this.step();
      }
    } catch (err) {
      console.error(`[${this.code}] erro na simulação, partida encerrada`, err);
      this.crash();
    }
  }

  /** Falha isolada: encerra só a partida desta sala e volta todos ao lobby. */
  private crash(): void {
    this.dispose();
    this.match = null;
    this.race = null;
    this.phase = "lobby";
    for (const mem of this.members.values()) mem.ready = false;
    this.broadcast({ t: "error", msg: "A partida travou e foi encerrada. Tentem de novo." });
    this.broadcastLobby();
  }

  private step(): void {
    if (this.race) return this.stepRace(this.race);
    const m = this.match;
    if (!m) return;
    stepMatch(m, TICK_MS);
    this.tickCount++;
    if (this.tickCount % BALANCE.snapshotEvery === 0 || m.phase === "finished") {
      const s = JSON.stringify(buildSnapshot(m));
      m.events = [];
      for (const mem of this.members.values()) {
        if (!mem.conn) continue;
        send(mem.conn, `{"t":"snap","s":${s},"me":${JSON.stringify(buildPrivate(m, mem.id))}}`);
      }
    }
    if (m.phase === "finished") this.finish();
  }

  private stepRace(r: RaceMatch): void {
    stepRace(r, TICK_MS);
    this.tickCount++;
    if (this.tickCount % BALANCE.snapshotEvery === 0 || r.phase === "finished") {
      const s = JSON.stringify(buildRaceSnapshot(r));
      r.events = [];
      for (const mem of this.members.values()) {
        if (!mem.conn) continue;
        send(mem.conn, `{"t":"rsnap","s":${s},"me":${JSON.stringify(buildRacePrivate(r, mem.id))}}`);
      }
    }
    if (r.phase === "finished") this.finish();
  }

  private finish(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.race) {
      this.raceResults = getRaceResults(this.race);
      this.results = null;
    } else {
      this.results = this.match ? getResults(this.match) : [];
      this.raceResults = null;
    }
    this.match = null;
    this.race = null;
    this.phase = "results";
    for (const mem of this.members.values()) mem.ready = false;
    for (const id of [...this.members.keys()]) {
      const mem = this.members.get(id)!;
      if (!mem.isBot && !mem.conn) this.removeMember(id);
    }
    if (this.raceResults) this.broadcast({ t: "rresults", rows: this.raceResults });
    else if (this.results) this.broadcast({ t: "results", rows: this.results });
    this.broadcastLobby();
    log(`[${this.code}] partida encerrada`);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  handle(conn: Conn, member: Member, msg: ClientMsg): void {
    const isHost = member.id === this.hostId;
    const m = this.match;
    switch (msg.t) {
      case "ready":
        if (this.phase === "lobby") member.ready = msg.ready;
        return this.broadcastLobby();
      case "avatar":
        if (this.phase === "match") return;
        member.avatar = sanitizeAvatar(msg.avatar);
        member.name = member.avatar.name;
        if (msg.chair !== undefined) member.chair = sanitizeChair(msg.chair);
        return this.broadcastLobby();
      case "addBot": {
        if (!isHost || this.phase !== "lobby") return;
        if (this.members.size >= BALANCE.maxPlayers) return send(conn, { t: "error", msg: "Sala cheia" });
        const name = BOT_NAMES[this.nextBot % BOT_NAMES.length];
        this.addMember(name, { ...PRESETS[randomInt(PRESETS.length)].dna, name }, null, true, randomChair(Math.random));
        return this.broadcastLobby();
      }
      case "removeBot": {
        if (!isHost || this.phase !== "lobby") return;
        const bot = [...this.members.values()].reverse().find((x) => x.isBot);
        if (bot) this.members.delete(bot.id);
        return this.broadcastLobby();
      }
      case "mode":
        if (!isHost || this.phase !== "lobby") return;
        this.mode = msg.mode;
        return this.broadcastLobby();
      case "duration":
        if (!isHost || this.phase !== "lobby") return;
        this.durationMs = msg.ms;
        return this.broadcastLobby();
      case "start": {
        if (!isHost) return;
        const err = this.start();
        if (err) send(conn, { t: "error", msg: err });
        return;
      }
      case "lobby":
        if (!isHost || this.phase !== "results") return;
        this.phase = "lobby";
        return this.broadcastLobby();
      case "input":
        if (m) setInput(m, member.id, { mx: msg.mx, mz: msg.mz, yaw: msg.yaw, fire: msg.fire });
        return;
      case "action":
        if (!m) return;
        if (msg.kind === "dodge") queueAction(m, member.id, { kind: "dodge", yaw: msg.yaw });
        else if (msg.slot !== undefined) queueAction(m, member.id, { kind: "ability", slot: msg.slot, yaw: msg.yaw, dist: msg.dist ?? 10 });
        return;
      case "evolve":
        if (m) chooseEvolution(m, member.id, msg.optionId, msg.seq);
        return;
      case "kinput":
        if (this.race) setKartInput(this.race, member.id, { steer: msg.steer, throttle: msg.throttle, drift: msg.drift }, msg.seq);
        return;
      case "kitem":
        if (this.race) queueItemUse(this.race, member.id);
        return;
      case "krespawn":
        if (this.race) respawnRequest(this.race, member.id);
        return;
      case "kdebug": {
        const racer = DEV_TOOLS ? this.race?.racers.get(member.id) : undefined;
        if (racer) giveItem(racer, msg.item);
        return;
      }
      default:
        return;
    }
  }

  /** Reflete conexão/desconexão no jogador da partida. */
  syncConnected(member: Member): void {
    const racer = this.race?.racers.get(member.id);
    if (racer) racer.connected = member.conn !== null;
    const p = this.match?.players.get(member.id);
    if (!p) return;
    p.connected = member.conn !== null;
    if (!p.connected) p.input = { mx: 0, mz: 0, yaw: p.yaw, fire: false };
  }
}

export class RoomManager {
  rooms = new Map<string, Room>();
  private joinBuckets = new Map<string, TokenBucket>();
  private conns = new Set<Conn>();
  private sweeper: NodeJS.Timeout;

  constructor(
    private readonly idleMs: number,
    private readonly raceOpts: { laps?: number; graceMs?: number } = {},
  ) {
    this.sweeper = setInterval(() => this.sweep(), 500);
  }

  track(conn: Conn): void {
    this.conns.add(conn);
  }

  close(): void {
    clearInterval(this.sweeper);
    for (const r of this.rooms.values()) r.dispose();
  }

  private newCode(): string {
    for (;;) {
      let c = "";
      for (let i = 0; i < 5; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  private joinAllowed(ip: string): boolean {
    let b = this.joinBuckets.get(ip);
    if (!b) {
      b = new TokenBucket(8, 0.5);
      this.joinBuckets.set(ip, b);
    }
    return b.take();
  }

  private attach(conn: Conn, room: Room, member: Member): void {
    if (member.conn && member.conn !== conn) {
      send(member.conn, { t: "error", msg: "Sessão aberta em outra aba" });
      member.conn.room = undefined;
      member.conn.ws.close(CLOSE_DUPLICATE, "duplicada");
    }
    member.conn = conn;
    member.leftAt = null;
    conn.room = room;
    conn.memberId = member.id;
    room.emptySince = null;
    room.syncConnected(member);
    send(conn, { t: "welcome", id: member.id, token: member.token, code: room.code });
    if (room.results && room.phase === "results") send(conn, { t: "results", rows: room.results });
    if (room.raceResults && room.phase === "results") send(conn, { t: "rresults", rows: room.raceResults });
    room.broadcastLobby();
  }

  onMessage(conn: Conn, raw: string): void {
    conn.lastSeen = Date.now();
    try {
      this.route(conn, raw);
    } catch (err) {
      console.error("erro ao tratar mensagem", err);
    }
  }

  private route(conn: Conn, raw: string): void {
    if (!conn.bucket.take()) return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return this.invalid(conn, "json");
    }
    const parsed = ClientMsg.safeParse(data);
    if (!parsed.success) return this.invalid(conn, parsed.error.issues[0]?.message ?? "schema");
    const msg = parsed.data;

    if (msg.t === "ping") return send(conn, { t: "pong", c: msg.c });
    if (conn.room && conn.memberId) {
      const room = conn.room;
      const member = room.members.get(conn.memberId);
      if (!member || member.conn !== conn) return;
      if (msg.t === "leave") {
        room.removeMember(member.id);
        room.syncConnected({ ...member, conn: null });
        conn.room = undefined;
        conn.memberId = undefined;
        room.broadcastLobby();
        return;
      }
      room.handle(conn, member, msg);
      return;
    }

    if (msg.t === "create") {
      if (!this.joinAllowed(conn.ip)) return send(conn, { t: "error", msg: "Muitas tentativas. Aguarde um pouco." });
      const room = new Room(this.newCode(), this.raceOpts);
      this.rooms.set(room.code, room);
      const avatar = sanitizeAvatar(msg.avatar);
      avatar.name = sanitizeName(msg.name, avatar.name);
      const member = room.addMember(avatar.name, avatar, conn, false, sanitizeChair(msg.chair));
      log(`[${room.code}] sala criada`);
      return this.attach(conn, room, member);
    }
    if (msg.t === "join") {
      if (!this.joinAllowed(conn.ip)) return send(conn, { t: "error", msg: "Muitas tentativas. Aguarde um pouco." });
      const room = this.rooms.get(msg.code);
      if (!room) return send(conn, { t: "error", msg: "Sala não encontrada" });
      if (room.phase === "match") return send(conn, { t: "error", msg: "Partida em andamento. Tente quando ela acabar." });
      if (room.members.size >= BALANCE.maxPlayers) return send(conn, { t: "error", msg: "Sala cheia" });
      const avatar = sanitizeAvatar(msg.avatar);
      avatar.name = sanitizeName(msg.name, avatar.name);
      return this.attach(conn, room, room.addMember(avatar.name, avatar, conn, false, sanitizeChair(msg.chair)));
    }
    if (msg.t === "resume") {
      if (!this.joinAllowed(conn.ip)) return send(conn, { t: "error", msg: "Muitas tentativas. Aguarde um pouco." });
      const room = this.rooms.get(msg.code);
      const member = room && [...room.members.values()].find((m) => !m.isBot && m.token === msg.token);
      if (!room || !member) return send(conn, { t: "error", msg: "Sessão expirada" });
      return this.attach(conn, room, member);
    }
  }

  private invalid(conn: Conn, why: string): void {
    conn.invalid++;
    if (conn.invalid === 1 || conn.invalid % 100 === 0) log(`mensagem inválida (${conn.invalid}) de ${conn.ip}: ${why}`);
  }

  onClose(conn: Conn): void {
    this.conns.delete(conn);
    const room = conn.room;
    const member = room && conn.memberId ? room.members.get(conn.memberId) : undefined;
    if (!room || !member || member.conn !== conn) return;
    member.conn = null;
    member.leftAt = Date.now();
    room.syncConnected(member);
    room.broadcastLobby();
  }

  private sweep(): void {
    const now = Date.now();
    for (const c of this.conns) {
      if (now - c.lastSeen > this.idleMs) c.ws.terminate();
    }
    for (const [code, room] of this.rooms) {
      for (const m of room.humans()) {
        if (m.leftAt !== null && now - m.leftAt > BALANCE.reconnectMs && room.phase !== "match") {
          room.removeMember(m.id);
          room.broadcastLobby();
        }
      }
      const anyone = room.humans().some((h) => h.conn);
      if (anyone) room.emptySince = null;
      else room.emptySince ??= now;
      if (room.emptySince !== null && now - room.emptySince > BALANCE.emptyRoomMs) {
        room.dispose();
        this.rooms.delete(code);
        log(`[${code}] sala removida por inatividade`);
      }
    }
    if (this.joinBuckets.size > 5000) this.joinBuckets.clear();
  }
}
