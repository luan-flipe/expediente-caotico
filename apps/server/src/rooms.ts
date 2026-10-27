import { randomBytes, randomInt } from "node:crypto";
import type { WebSocket } from "ws";
import {
  BALANCE,
  ClientMsg,
  buildPrivate,
  buildSnapshot,
  chooseEvolution,
  createMatch,
  getResults,
  queueAction,
  randomAvatar,
  sanitizeAvatar,
  sanitizeName,
  setInput,
  stepMatch,
  type AvatarDNA,
  type LobbyState,
  type Match,
  type ResultRow,
  type ServerMsg,
} from "@ec/shared";
import { TokenBucket } from "./ratelimit";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const BOT_NAMES = ["Estagiário Kevin", "Estagiária Bia", "Estagiário Davi", "Estagiária Lu", "Estagiário Téo", "Estagiária Mel", "Estagiário Juca"];
const TICK_MS = 1000 / BALANCE.tickHz;

export interface Conn {
  ws: WebSocket;
  ip: string;
  bucket: TokenBucket;
  room?: Room;
  memberId?: string;
  invalid: number;
}

interface Member {
  id: string;
  token: string;
  name: string;
  avatar: AvatarDNA;
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
  durationMs = 300000;
  members = new Map<string, Member>();
  match: Match | null = null;
  results: ResultRow[] | null = null;
  private timer: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private nextBot = 0;
  emptySince: number | null = null;

  constructor(readonly code: string) {}

  humans(): Member[] {
    return [...this.members.values()].filter((m) => !m.isBot);
  }

  lobbyState(): LobbyState {
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      durationMs: this.durationMs,
      players: [...this.members.values()].map((m) => ({
        id: m.id,
        name: m.name,
        avatar: m.avatar,
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

  addMember(name: string, avatar: AvatarDNA, conn: Conn | null, isBot = false): Member {
    const id = isBot ? `bot-${++this.nextBot}` : randomBytes(6).toString("hex");
    const m: Member = { id, token: randomBytes(18).toString("base64url"), name, avatar, ready: false, isBot, conn, leftAt: null };
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
    this.match = createMatch({
      durationMs: this.durationMs,
      seed: randomInt(1, 2 ** 31),
      players: [...this.members.values()].map((m) => ({ id: m.id, name: m.name, avatar: m.avatar, isBot: m.isBot })),
    });
    this.phase = "match";
    this.results = null;
    this.tickCount = 0;
    this.broadcastLobby();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    log(`[${this.code}] partida iniciada com ${this.members.size} participantes`);
    return null;
  }

  private tick(): void {
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

  private finish(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.results = this.match ? getResults(this.match) : [];
    this.match = null;
    this.phase = "results";
    for (const mem of this.members.values()) mem.ready = false;
    for (const id of [...this.members.keys()]) {
      const mem = this.members.get(id)!;
      if (!mem.isBot && !mem.conn) this.removeMember(id);
    }
    this.broadcast({ t: "results", rows: this.results });
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
        return this.broadcastLobby();
      case "addBot": {
        if (!isHost || this.phase !== "lobby") return;
        if (this.members.size >= BALANCE.maxPlayers) return send(conn, { t: "error", msg: "Sala cheia" });
        const name = BOT_NAMES[this.nextBot % BOT_NAMES.length];
        this.addMember(name, randomAvatar(Math.random, name), null, true);
        return this.broadcastLobby();
      }
      case "removeBot": {
        if (!isHost || this.phase !== "lobby") return;
        const bot = [...this.members.values()].reverse().find((x) => x.isBot);
        if (bot) this.members.delete(bot.id);
        return this.broadcastLobby();
      }
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
        if (m) chooseEvolution(m, member.id, msg.optionId);
        return;
      default:
        return;
    }
  }

  /** Reflete conexão/desconexão no jogador da partida. */
  syncConnected(member: Member): void {
    const p = this.match?.players.get(member.id);
    if (!p) return;
    p.connected = member.conn !== null;
    if (!p.connected) p.input = { mx: 0, mz: 0, yaw: p.yaw, fire: false };
  }
}

export class RoomManager {
  rooms = new Map<string, Room>();
  private joinBuckets = new Map<string, TokenBucket>();
  private sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), 1000);
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
      member.conn.ws.close();
    }
    member.conn = conn;
    member.leftAt = null;
    conn.room = room;
    conn.memberId = member.id;
    room.emptySince = null;
    room.syncConnected(member);
    send(conn, { t: "welcome", id: member.id, token: member.token, code: room.code });
    if (room.results && room.phase === "results") send(conn, { t: "results", rows: room.results });
    room.broadcastLobby();
  }

  onMessage(conn: Conn, raw: string): void {
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
      const member = conn.room.members.get(conn.memberId);
      if (member && member.conn === conn) conn.room.handle(conn, member, msg);
      return;
    }

    if (msg.t === "create") {
      const room = new Room(this.newCode());
      this.rooms.set(room.code, room);
      const avatar = sanitizeAvatar(msg.avatar);
      avatar.name = sanitizeName(msg.name, avatar.name);
      const member = room.addMember(avatar.name, avatar, conn);
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
      return this.attach(conn, room, room.addMember(avatar.name, avatar, conn));
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
