import { randomBytes, randomInt } from "node:crypto";
import type { WebSocket } from "ws";
import {
  BALANCE,
  CHAT_COOLDOWN_MS,
  ClientMsg,
  CHALLENGE_POINTS,
  applyLap,
  applyAwards,
  applyRaceResult,
  applyShooterResult,
  applyWeeklyLap,
  challengeOfWeek,
  weekKey,
  DEFAULT_CHAIR,
  DEFAULT_ROOM_OPTIONS,
  buildPrivate,
  buildRacePrivate,
  buildRaceSnapshot,
  buildSnapshot,
  chooseEvolution,
  createMatch,
  createRace,
  endTraining,
  getRaceResults,
  getAwards,
  getRaceAwards,
  getResults,
  giveItem,
  matchCounts,
  NO_INPUT,
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
  type GhostLap,
  type LobbyState,
  type Match,
  type RaceMatch,
  type RoomOptions,
  type TrackId,
  type Award,
  type RaceResultRow,
  type ResultRow,
  type ServerMsg,
  type ShooterSubmode,
} from "@ec/shared";
import { readSession } from "./auth";
import { TokenBucket } from "./ratelimit";
import type { Store } from "./store";

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
  /** Id da conta (Google) quando entrou com sessão válida; null para visitante e bot. */
  accountId: string | null;
  /** Melhor volta da sessão de quem não tem conta (visitante): só em memória. */
  /** Melhor volta da sessão por pista (visitante não grava no arquivo). */
  sessionLaps: Partial<Record<TrackId, GhostLap>>;
  conn: Conn | null;
  leftAt: number | null;
  /** Hora do último chat rápido (limite de 1 a cada CHAT_COOLDOWN_MS). */
  lastChatAt: number;
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
  shooterSubmode: ShooterSubmode = "pvp";
  durationMs = 300000;
  /** Opções do anfitrião. As voltas começam no que a sala recebeu (testes encurtam a corrida). */
  options: RoomOptions;
  members = new Map<string, Member>();
  match: Match | null = null;
  race: RaceMatch | null = null;
  results: ResultRow[] | null = null;
  awards: Award[] = [];
  raceResults: RaceResultRow[] | null = null;
  /** Recorde por pista visto nesta sala quando não há arquivo de dados. */
  private roomRecords: Partial<Record<TrackId, GhostLap & { name: string }>> = {};
  private timer: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private lastTickAt = 0;
  private pendingMs = 0;
  private nextBot = 0;
  emptySince: number | null = null;

  /** raceOpts encurta a corrida nos testes. Com store, o fim da partida registra o ranking. */
  constructor(
    readonly code: string,
    private readonly raceOpts: { laps?: number; graceMs?: number } = {},
    private readonly store?: Store,
  ) {
    this.options = { ...DEFAULT_ROOM_OPTIONS, laps: raceOpts.laps ?? DEFAULT_ROOM_OPTIONS.laps };
  }

  humans(): Member[] {
    return [...this.members.values()].filter((m) => !m.isBot);
  }

  lobbyState(): LobbyState {
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      mode: this.mode,
      shooterSubmode: this.shooterSubmode,
      durationMs: this.durationMs,
      options: { ...this.options },
      players: [...this.members.values()].map((m) => ({
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        chair: m.chair,
        ready: m.isBot || m.ready || m.id === this.hostId,
        isBot: m.isBot,
        connected: m.isBot || m.conn !== null,
        ranked: m.accountId !== null,
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

  addMember(name: string, avatar: AvatarDNA, conn: Conn | null, isBot = false, chair: ChairDNA = DEFAULT_CHAIR, accountId: string | null = null): Member {
    const id = isBot ? `bot-${++this.nextBot}` : randomBytes(6).toString("hex");
    const m: Member = { id, token: randomBytes(18).toString("base64url"), name, avatar, chair, ready: false, isBot, accountId, sessionLaps: {}, conn, leftAt: null, lastChatAt: 0 };
    this.members.set(id, m);
    if (!this.hostId && !isBot) this.hostId = id;
    return m;
  }

  /** A conta guarda o nome de crachá, o boneco e a cadeira mais recentes do jogador logado (o replay do recorde usa). */
  syncAccountName(member: Member): void {
    const acc = member.accountId ? this.store?.data.accounts[member.accountId] : undefined;
    if (!acc) return;
    let changed = false;
    if (acc.name !== member.name) {
      acc.name = member.name;
      changed = true;
    }
    // já sanitizados na entrada; compara pelo conteúdo para não gravar o arquivo à toa
    if (JSON.stringify(acc.avatar) !== JSON.stringify(member.avatar)) {
      acc.avatar = { ...member.avatar };
      changed = true;
    }
    if (JSON.stringify(acc.chair) !== JSON.stringify(member.chair)) {
      acc.chair = { ...member.chair };
      changed = true;
    }
    if (changed) this.store?.save();
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
    const trial = this.mode === "timetrial";
    const zombies = this.mode === "shooter" && this.shooterSubmode === "zombies";
    if (!trial && !zombies && this.members.size < 2) return "Precisa de pelo menos 2 participantes (adicione um bot)";
    const notReady = this.humans().filter((h) => h.id !== this.hostId && (!h.ready || !h.conn));
    if (notReady.length) return `Aguardando: ${notReady.map((h) => h.name).join(", ")}`;
    const seed = randomInt(1, 2 ** 31);
    const players = [...this.members.values()]
      .filter((m) => !trial || !m.isBot)
      .map((m) => ({ id: m.id, name: m.name, avatar: m.avatar, chair: m.chair, isBot: m.isBot }));
    const { laps, items, botLevel, track } = this.options;
    if (this.mode !== "shooter") this.race = createRace({ seed, players, ...this.raceOpts, laps, itemsOff: !items, botLevel, timeTrial: trial, track });
    else this.match = createMatch({ durationMs: this.durationMs, seed, players, botLevel, submode: this.shooterSubmode });
    this.phase = "match";
    this.results = null;
    this.raceResults = null;
    this.tickCount = 0;
    this.broadcastLobby();
    if (this.race) for (const m of this.members.values()) this.sendGhosts(m);
    this.lastTickAt = performance.now();
    this.pendingMs = 0;
    // intervalo menor que o passo: no Windows o timer arredonda para ~16 ms e a partida andaria mais devagar
    this.timer = setInterval(() => this.tick(), TICK_MS / 2);
    log(`[${this.code}] ${this.mode === "shooter" ? (this.shooterSubmode === "zombies" ? "sobrevivência zumbi" : "partida") : "corrida"} iniciada com ${this.members.size} participantes`);
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

  /** Pista da corrida em andamento ou, fora dela, a escolhida pelo anfitrião. */
  private trackId(): TrackId {
    return this.race?.track.id ?? this.options.track;
  }

  /** Menor tempo de volta da pista: do arquivo de dados ou, sem ele, da memória da sala. */
  private trackRecord(track: TrackId): (GhostLap & { name: string }) | null {
    if (!this.store) return this.roomRecords[track] ?? null;
    let best: (GhostLap & { name: string }) | null = null;
    for (const [id, lap] of Object.entries(this.store.data.laps[track] ?? {})) {
      if (best && lap.ms >= best.ms) continue;
      best = { ms: lap.ms, name: this.store.data.accounts[id]?.name ?? "Jogador", samples: lap.ghost };
    }
    return best;
  }

  /** Fantasma do próprio jogador: o salvo na conta ou, sem conta, o da sessão. */
  private ghostOf(m: Member, track: TrackId): GhostLap | null {
    const saved = m.accountId ? this.store?.data.laps[track]?.[m.accountId] : undefined;
    if (saved) return { ms: saved.ms, samples: saved.ghost };
    return m.sessionLaps[track] ?? null;
  }

  sendGhosts(m: Member): void {
    const track = this.trackId();
    send(m.conn, { t: "ghosts", mine: this.ghostOf(m, track), record: this.trackRecord(track) });
  }

  /**
   * Consome as voltas válidas fechadas neste tick: conta guarda no arquivo (melhor volta e fantasma),
   * visitante só na memória. Quem teve o fantasma ou o recorde alterado recebe os fantasmas de novo.
   */
  private consumeLaps(r: RaceMatch): void {
    if (!r.completedLaps.length) return;
    const laps = r.completedLaps.splice(0);
    const track = r.track.id;
    const notify = new Set<Member>();
    let recordChanged = false;
    let saved = false;
    for (const lap of laps) {
      const m = this.members.get(lap.id);
      if (!m || m.isBot) continue;
      // o desafio da semana conta toda volta da conta, mesmo que não melhore a melhor de sempre
      if (m.accountId && this.store) {
        try {
          const done = applyWeeklyLap(this.store.data, m.accountId, lap.ms, Date.now(), track);
          saved = true;
          this.notifyChallenge(done);
        } catch (err) {
          console.error(`[${this.code}] falha ao registrar o desafio da semana`, err);
        }
      }
      const mine = this.ghostOf(m, track);
      if (mine && lap.ms >= mine.ms) continue;
      try {
        if (m.accountId && this.store) {
          const res = applyLap(this.store.data, track, m.accountId, lap.ms, lap.ghost, Date.now());
          saved = true;
          recordChanged ||= res.record;
        } else {
          m.sessionLaps[track] = { ms: lap.ms, samples: lap.ghost };
          const best = this.roomRecords[track];
          if (!this.store && (!best || lap.ms < best.ms)) {
            this.roomRecords[track] = { ms: lap.ms, name: m.name, samples: lap.ghost };
            recordChanged = true;
          }
        }
      } catch (err) {
        console.error(`[${this.code}] falha ao registrar a volta`, err);
        continue;
      }
      notify.add(m);
    }
    if (saved) this.store?.save();
    for (const m of recordChanged ? this.members.values() : notify) this.sendGhosts(m);
  }

  private stepRace(r: RaceMatch): void {
    stepRace(r, TICK_MS);
    this.consumeLaps(r);
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
      this.awards = getRaceAwards(this.race);
      this.results = null;
    } else {
      this.results = this.match ? getResults(this.match) : [];
      this.awards = this.match ? getAwards(this.match) : [];
      this.raceResults = null;
    }
    this.recordRanking();
    this.match = null;
    this.race = null;
    this.phase = "results";
    for (const mem of this.members.values()) mem.ready = false;
    for (const id of [...this.members.keys()]) {
      const mem = this.members.get(id)!;
      if (!mem.isBot && !mem.conn) this.removeMember(id);
    }
    if (this.raceResults) this.broadcast({ t: "rresults", rows: this.raceResults, awards: this.awards });
    else if (this.results) this.broadcast({ t: "results", rows: this.results, awards: this.awards });
    this.broadcastLobby();
    log(`[${this.code}] partida finalizada`);
  }

  /** Soma o resultado da partida ao ranking. Falha aqui nunca pode travar o fim da partida. */
  private recordRanking(): void {
    const store = this.store;
    if (!store) return;
    try {
      const accountOf = (id: string) => this.members.get(id)?.accountId ?? null;
      const now = Date.now();
      let completed: string[] = [];
      if (this.raceResults) {
        // treino não pontua; as voltas já foram gravadas a cada tick
        if (this.race?.timeTrial) return;
        const rows = this.raceResults.map((r) => ({ accountId: accountOf(r.id), place: r.place, finished: r.totalMs !== null, bestLapMs: r.bestLapMs }));
        if (!matchCounts(rows)) return;
        completed = applyRaceResult(store.data, rows, now, this.race?.track.id);
      } else if (this.results) {
        // sobrevivência zumbi é cooperativa: ninguém vence ninguém, então não entra no ranking do tiroteio
        if (this.match?.submode === "zombies") return;
        const rows = this.results.map((r) => ({ accountId: accountOf(r.id), rank: r.rank, kills: r.kills }));
        if (!matchCounts(rows)) return;
        completed = applyShooterResult(store.data, rows, now);
      }
      // só chega aqui partida que contou (treino, zumbi e partida com um logado só saem antes)
      applyAwards(store.data, this.awards.map((a) => ({ accountId: accountOf(a.winnerId), title: a.title })));
      store.save();
      this.notifyChallenge(completed);
    } catch (err) {
      console.error(`[${this.code}] falha ao registrar o ranking`, err);
    }
  }

  /** Avisa quem acabou de cumprir o desafio da semana (todas as conexões da conta nesta sala). */
  private notifyChallenge(accountIds: string[]): void {
    if (!accountIds.length) return;
    const msg: ServerMsg = { t: "challenge", text: challengeOfWeek(weekKey(new Date())).text, points: CHALLENGE_POINTS };
    for (const mem of this.members.values()) {
      if (mem.accountId && accountIds.includes(mem.accountId) && mem.conn) send(mem.conn, msg);
    }
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  handle(conn: Conn, member: Member, msg: ClientMsg): void {
    const isHost = member.id === this.hostId;
    const m = this.match;
    switch (msg.t) {
      case "ready":
        if (this.phase !== "lobby") return;
        member.ready = msg.ready;
        return this.broadcastLobby();
      case "avatar":
        if (this.phase === "match") return;
        member.avatar = sanitizeAvatar(msg.avatar);
        member.name = member.avatar.name;
        if (msg.chair !== undefined) member.chair = sanitizeChair(msg.chair);
        this.syncAccountName(member);
        return this.broadcastLobby();
      case "addBot": {
        if (!isHost || this.phase !== "lobby" || this.mode === "timetrial") return;
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
        // contra o relógio é só de humanos
        if (this.mode === "timetrial") for (const x of [...this.members.values()]) if (x.isBot) this.members.delete(x.id);
        return this.broadcastLobby();
      case "shooterSubmode":
        if (!isHost || this.phase !== "lobby") return;
        this.shooterSubmode = msg.submode;
        return this.broadcastLobby();
      case "duration":
        if (!isHost || this.phase !== "lobby") return;
        this.durationMs = msg.ms;
        return this.broadcastLobby();
      case "options":
        if (!isHost || this.phase !== "lobby") return;
        if (msg.laps !== undefined) this.options.laps = msg.laps;
        if (msg.items !== undefined) this.options.items = msg.items;
        if (msg.botLevel !== undefined) this.options.botLevel = msg.botLevel;
        if (msg.track !== undefined) this.options.track = msg.track;
        return this.broadcastLobby();
      case "start": {
        if (!isHost) return;
        const err = this.start();
        if (err) send(conn, { t: "error", msg: err });
        return;
      }
      case "chat":
      case "emote": {
        // limite por jogador: o que chega antes do intervalo é descartado em silêncio
        const now = Date.now();
        if (now - member.lastChatAt < CHAT_COOLDOWN_MS) return;
        member.lastChatAt = now;
        return this.broadcast({ t: "chat", from: member.id, kind: msg.t === "chat" ? "phrase" : "emote", index: msg.index });
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
        if (this.race) setKartInput(this.race, member.id, { steer: msg.steer, throttle: msg.throttle, drift: msg.drift, itemHold: msg.itemHold }, msg.seq);
        return;
      case "kitem":
        if (this.race) queueItemUse(this.race, member.id);
        return;
      case "krespawn":
        if (this.race) respawnRequest(this.race, member.id);
        return;
      case "endTraining":
        if (isHost && this.race?.timeTrial) endTraining(this.race);
        return;
      case "kdebug": {
        const racer = DEV_TOOLS && !this.race?.timeTrial && !this.race?.itemsOff ? this.race?.racers.get(member.id) : undefined;
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
    if (racer) {
      racer.connected = member.conn !== null;
      if (!racer.connected) {
        racer.input = { ...NO_INPUT };
        racer.inputQueue = [];
      }
    }
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
    private readonly ranking?: { store: Store; secret: string },
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

  /** Id da conta de uma sessão válida cuja conta existe no arquivo de dados; senão null (visitante). */
  private accountFrom(session: string | undefined): string | null {
    if (!this.ranking || session === undefined) return null;
    const id = readSession(session, this.ranking.secret);
    return id !== null && this.ranking.store.data.accounts[id] ? id : null;
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
    if (room.results && room.phase === "results") send(conn, { t: "results", rows: room.results, awards: room.awards });
    if (room.raceResults && room.phase === "results") send(conn, { t: "rresults", rows: room.raceResults, awards: room.awards });
    if (room.race && room.phase === "match") room.sendGhosts(member);
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
      const room = new Room(this.newCode(), this.raceOpts, this.ranking?.store);
      this.rooms.set(room.code, room);
      const avatar = sanitizeAvatar(msg.avatar);
      avatar.name = sanitizeName(msg.name, avatar.name);
      const member = room.addMember(avatar.name, avatar, conn, false, sanitizeChair(msg.chair), this.accountFrom(msg.session));
      room.syncAccountName(member);
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
      const member = room.addMember(avatar.name, avatar, conn, false, sanitizeChair(msg.chair), this.accountFrom(msg.session));
      room.syncAccountName(member);
      return this.attach(conn, room, member);
    }
    if (msg.t === "resume") {
      if (!this.joinAllowed(conn.ip)) return send(conn, { t: "error", msg: "Muitas tentativas. Aguarde um pouco." });
      const room = this.rooms.get(msg.code);
      const member = room && [...room.members.values()].find((m) => !m.isBot && m.token === msg.token);
      if (!room || !member) return send(conn, { t: "error", msg: "Sessão expirada" });
      // sessão válida no retorno vale como login; sem sessão, mantém a conta com que entrou
      const account = this.accountFrom(msg.session);
      if (account) {
        member.accountId = account;
        room.syncAccountName(member);
      }
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
