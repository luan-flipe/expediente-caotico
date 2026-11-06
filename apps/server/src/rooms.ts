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
  applyFutebolResult,
  applyShooterResult,
  applyWeeklyLap,
  buildFutPrivate,
  buildFutSnapshot,
  createFutebol,
  dropFutPlayer,
  reviveFutPlayer,
  FUT_COLORS,
  FUT_KITS,
  getFutResults,
  getFutScore,
  getFutStats,
  mulberry32,
  newCup,
  nextHumanMatch,
  recordCupMatch,
  simulateRest,
  linePlayers,
  setFutInput,
  stepFutebol,
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
  randomAvatar,
  randomChair,
  respawnRequest,
  sanitizeAvatar,
  sanitizeChair,
  sanitizeName,
  setInput,
  setKartInput,
  stepMatch,
  stepRace,
  buildSuspeitoPrivate,
  buildSuspeitoSnapshot,
  createSuspeitoMatch,
  getSuspeitoResults,
  queueSuspeitoEmergency,
  queueSuspeitoFixSabotage,
  queueSuspeitoKill,
  queueSuspeitoMeetingChat,
  queueSuspeitoReport,
  queueSuspeitoSabotage,
  queueSuspeitoStartTask,
  queueSuspeitoTaskAction,
  queueSuspeitoVote,
  removeSuspeitoPlayer,
  setSuspeitoInput,
  stepSuspeitoMatch,
  type SuspeitoMatch,
  type SuspeitoResults,
  type AvatarDNA,
  type Cup,
  type CupSize,
  type FutMatch,
  type FutMatchStats,
  type FutResultRow,
  type FutTeamConfig,
  type FutResultRowFull,
  type TeamSide,
  type ChairDNA,
  type GameMode,
  type GhostLap,
  pickRival,
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

type FutScore = ReturnType<typeof getFutScore>;

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
  /** Futebol: time do jogador (bots da sala não têm). */
  side?: TeamSide;
  /** Id da conta (Google) quando entrou com sessão válida; null para visitante e bot. */
  accountId: string | null;
  /** Melhor volta da sessão de quem não tem conta (visitante): só em memória. */
  /** Melhor volta da sessão por pista (visitante não grava no arquivo). */
  sessionLaps: Partial<Record<TrackId, GhostLap>>;
  conn: Conn | null;
  leftAt: number | null;
  /** Hora do último chat rápido (limite de 1 a cada CHAT_COOLDOWN_MS). */
  lastChatAt: number;
  /** Índice em LOBBY_STATUSES escolhido no lobby, ou null. */
  statusIndex: number | null;
}

function send(conn: Conn | null, msg: ServerMsg | string): void {
  if (!conn || conn.ws.readyState !== conn.ws.OPEN) return;
  conn.ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
}

/** Linhas do placar para os clientes: sem a conta de ninguém. */
function futPublicRows(rows: FutResultRowFull[]): FutResultRow[] {
  return rows.map((r) => ({ id: r.id, name: r.name, side: r.side, isBot: r.isBot, goals: r.goals, assists: r.assists, yellow: r.yellow, red: r.red, shots: r.shots, shotsOn: r.shotsOn, passes: r.passes, fouls: r.fouls }));
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
  futebol: FutMatch | null = null;
  suspeito: SuspeitoMatch | null = null;
  futResults: FutResultRowFull[] | null = null;
  futScore: FutScore | null = null;
  futStats: FutMatchStats | null = null;
  /** Campeonato entre setores em andamento e o jogo da chave que está valendo (quais times da chave estão nos lados 0 e 1). */
  cup: Cup | null = null;
  private cupMatch: { index: number; teams: [number, number] } | null = null;
  results: ResultRow[] | null = null;
  awards: Award[] = [];
  raceResults: RaceResultRow[] | null = null;
  suspeitoResults: SuspeitoResults | null = null;
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
    this.options = { ...DEFAULT_ROOM_OPTIONS, laps: raceOpts.laps ?? DEFAULT_ROOM_OPTIONS.laps, futTeams: DEFAULT_ROOM_OPTIONS.futTeams.map((t) => ({ ...t })) as RoomOptions["futTeams"] };
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
      cup: this.cup,
      players: [...this.members.values()].map((m) => ({
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        chair: m.chair,
        ready: m.isBot || m.ready || m.id === this.hostId,
        isBot: m.isBot,
        connected: m.isBot || m.conn !== null,
        ranked: m.accountId !== null,
        ...(m.side !== undefined ? { side: m.side } : {}),
        statusIndex: m.statusIndex,
      })),
    };
  }

  /** Time com menos humanos (empate fica com o 0). */
  private lighterSide(): TeamSide {
    const count = [0, 0];
    for (const h of this.humans()) if (h.side !== undefined) count[h.side]++;
    return count[0] <= count[1] ? 0 : 1;
  }

  /** Ao entrar no modo futebol: distribui os humanos alternando entre os times. */
  private distributeSides(): void {
    this.humans().forEach((h, i) => {
      h.side = (i % 2) as TeamSide;
    });
  }

  /** Só o anfitrião ou o primeiro humano do time mexe no uniforme dele. */
  private canConfigTeam(member: Member, side: TeamSide): boolean {
    if (member.id === this.hostId) return true;
    const first = this.humans().find((h) => h.side === side);
    return first?.id === member.id;
  }

  broadcast(msg: ServerMsg): void {
    const raw = JSON.stringify(msg);
    for (const m of this.members.values()) send(m.conn, raw);
  }

  /** Mensagem do resultado do futebol (a mesma no fim da partida e para quem volta à sala depois). */
  futResultsMsg(): ServerMsg | null {
    if (!this.futResults || !this.futScore) return null;
    return { t: "fresults", rows: futPublicRows(this.futResults), score: this.futScore, awards: this.awards, ...(this.futStats ? { stats: this.futStats } : {}) };
  }

  /** Prepara o próximo jogo do campeonato: cria a chave, simula o que não tem humano e acha os times do jogo (um humano pode jogar contra um setor de bots). */
  private cupSetup(): { teams: [FutTeamConfig, FutTeamConfig]; playing: Set<TeamSide> } | string {
    const size = this.options.futCup as CupSize;
    if (!this.cup || this.cup.size !== size || this.cup.champion !== null) {
      const sides = ([0, 1] as const).filter((s) => this.humans().some((h) => h.side === s));
      this.cup = newCup(size, sides.map((s) => ({ name: this.options.futTeams[s].name, side: s })));
    }
    const cup = this.cup;
    simulateRest(cup, mulberry32(randomInt(1, 2 ** 31)));
    const i = nextHumanMatch(cup);
    if (i === null) return "O campeonato não tem jogo para os times humanos";
    const m = cup.matches[i];
    const a = cup.teams[m.a!];
    const b = cup.teams[m.b!];
    const cfg = this.options.futTeams;
    if (a.side !== null && b.side !== null) {
      const [t0, t1] = a.side === 0 ? [m.a!, m.b!] : [m.b!, m.a!];
      this.cupMatch = { index: i, teams: [t0, t1] };
      return { teams: [{ ...cfg[0], name: cup.teams[t0].name }, { ...cfg[1], name: cup.teams[t1].name }], playing: new Set<TeamSide>([0, 1]) };
    }
    // um humano contra um setor de bots: o setor joga no lado oposto, com uniforme de outra cor
    const [hi, bi] = a.side !== null ? [m.a!, m.b!] : [m.b!, m.a!];
    const mine = cup.teams[hi].side as TeamSide;
    const foe = (mine === 0 ? 1 : 0) as TeamSide;
    const color = cfg[foe].color !== cfg[mine].color ? cfg[foe].color : (cfg[mine].color + 1) % FUT_COLORS.length;
    const teams: [FutTeamConfig, FutTeamConfig] = mine === 0 ? [{ ...cfg[0], name: cup.teams[hi].name }, { name: cup.teams[bi].name, kit: cfg[foe].kit, color }] : [{ name: cup.teams[bi].name, kit: cfg[foe].kit, color }, { ...cfg[1], name: cup.teams[hi].name }];
    this.cupMatch = { index: i, teams: mine === 0 ? [hi, bi] : [bi, hi] };
    return { teams, playing: new Set<TeamSide>([mine]) };
  }

  /** Fim de um jogo do campeonato: o vencedor avança e o resto da rodada sem humanos é simulado. */
  private cupFinish(score: FutScore): void {
    const cup = this.cup;
    const cm = this.cupMatch;
    this.cupMatch = null;
    if (!cup || !cm) return;
    const m = cup.matches[cm.index];
    const flip = cm.teams[0] !== m.a;
    const order = <T,>(v: [T, T]): [T, T] => (flip ? [v[1], v[0]] : v);
    const winner = cm.teams[score.winner ?? 0];
    recordCupMatch(cup, cm.index, order(score.score), score.pens ? order(score.pens) : null, winner);
    simulateRest(cup, mulberry32(randomInt(1, 2 ** 31)));
  }

  broadcastLobby(): void {
    this.broadcast({ t: "lobby", state: this.lobbyState() });
  }

  addMember(name: string, avatar: AvatarDNA, conn: Conn | null, isBot = false, chair: ChairDNA = DEFAULT_CHAIR, accountId: string | null = null): Member {
    const id = isBot ? `bot-${++this.nextBot}` : randomBytes(6).toString("hex");
    const m: Member = { id, token: randomBytes(18).toString("base64url"), name, avatar, chair, ready: false, isBot, accountId, sessionLaps: {}, conn, leftAt: null, lastChatAt: 0, statusIndex: null };
    this.members.set(id, m);
    if (!this.hostId && !isBot) this.hostId = id;
    if (!isBot && this.mode === "futebol") m.side = this.lighterSide();
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
    if (this.suspeito) removeSuspeitoPlayer(this.suspeito, id);
    if (this.hostId === id) {
      const next = this.humans().find((h) => h.conn) ?? this.humans()[0];
      this.hostId = next?.id ?? "";
    }
  }

  start(): string | null {
    if (this.phase !== "lobby") return "A partida já começou";
    const fut = this.mode === "futebol";
    const trial = this.mode === "timetrial";
    const zombies = this.mode === "shooter" && this.shooterSubmode === "zombies";
    if (!trial && !zombies && !fut && this.members.size < 2) return "Precisa de pelo menos 2 participantes (adicione um bot)";
    const notReady = this.humans().filter((h) => h.id !== this.hostId && (!h.ready || !h.conn));
    if (notReady.length) return `Aguardando: ${notReady.map((h) => h.name).join(", ")}`;
    if (fut) {
      const size = [0, 0];
      for (const h of this.humans()) size[h.side ?? 0]++;
      if (size[0] > linePlayers(this.options.futFormat) || size[1] > linePlayers(this.options.futFormat)) return "Time com gente demais para o formato";
    }
    const seed = randomInt(1, 2 ** 31);
    const players = [...this.members.values()]
      .filter((m) => !trial || !m.isBot)
      .map((m) => ({ id: m.id, name: m.name, avatar: m.avatar, chair: m.chair, isBot: m.isBot }));
    const { laps, items, botLevel, track } = this.options;
    if (fut) {
      let teams = this.options.futTeams;
      let playing: Set<TeamSide> | null = null;
      this.cupMatch = null;
      if (this.options.futCup > 0) {
        const setup = this.cupSetup();
        if (typeof setup === "string") return setup;
        teams = setup.teams;
        playing = setup.playing;
      }
      this.futebol = createFutebol({
        seed,
        format: this.options.futFormat,
        durationMs: this.durationMs,
        botLevel,
        // bots da sala não jogam: o createFutebol completa os times sozinho (no campeonato, humano de time eliminado assiste)
        players: this.humans()
          .filter((h) => !playing || playing.has(h.side ?? 0))
          .map((h) => ({ id: h.id, name: h.name, avatar: h.avatar, side: h.side ?? 0, isBot: false, accountId: h.accountId })),
        teams,
      });
    } else if (this.mode === "suspeito") {
      this.suspeito = createSuspeitoMatch(players, this.options, seed);
    } else if (this.mode !== "shooter") this.race = createRace({ seed, players, ...this.raceOpts, laps, itemsOff: !items, botLevel, timeTrial: trial, track });
    else this.match = createMatch({ durationMs: this.durationMs, seed, players, botLevel, submode: this.shooterSubmode });
    this.phase = "match";
    this.results = null;
    this.raceResults = null;
    this.futResults = null;
    this.futScore = null;
    this.futStats = null;
    this.suspeitoResults = null;
    this.tickCount = 0;
    this.broadcastLobby();
    if (this.race) for (const m of this.members.values()) this.sendGhosts(m);
    this.lastTickAt = performance.now();
    this.pendingMs = 0;
    // intervalo menor que o passo: no Windows o timer arredonda para ~16 ms e a partida andaria mais devagar
    this.timer = setInterval(() => this.tick(), TICK_MS / 2);
    log(`[${this.code}] ${this.mode === "futebol" ? "futebol" : this.mode === "suspeito" ? "expediente suspeito" : this.mode === "shooter" ? (this.shooterSubmode === "zombies" ? "sobrevivência zumbi" : "partida") : "corrida"} iniciada com ${this.members.size} participantes`);
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
    this.futebol = null;
    this.suspeito = null;
    this.cupMatch = null;
    this.phase = "lobby";
    for (const mem of this.members.values()) mem.ready = false;
    this.broadcast({ t: "error", msg: "A partida travou e foi encerrada. Tentem de novo." });
    this.broadcastLobby();
  }

  private step(): void {
    if (this.suspeito) return this.stepSuspeito(this.suspeito);
    if (this.race) return this.stepRace(this.race);
    if (this.futebol) return this.stepFut(this.futebol);
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

  private stepSuspeito(s: SuspeitoMatch): void {
    stepSuspeitoMatch(s, TICK_MS / 1000);
    this.tickCount++;
    if (this.tickCount % BALANCE.snapshotEvery === 0 || s.phase === "over") {
      const snapJson = JSON.stringify(buildSuspeitoSnapshot(s));
      for (const mem of this.members.values()) {
        if (!mem.conn) continue;
        const priv = buildSuspeitoPrivate(s, mem.id);
        send(mem.conn, `{"t":"ssnap","s":${snapJson},"me":${JSON.stringify(priv)}}`);
      }
    }
    if (s.phase === "over") this.finish();
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

  /** Rival do jogador: a volta salva logo à frente da dele. Só existe com ranking (contas) e com volta própria. */
  private rivalOf(m: Member, track: TrackId, mine: GhostLap | null, record: { ms: number } | null): (GhostLap & { name: string }) | null {
    if (!this.store || !mine) return null;
    const laps = Object.entries(this.store.data.laps[track] ?? {}).map(([id, lap]) => ({ id, ms: lap.ms }));
    const id = pickRival(laps, m.accountId ?? null, mine.ms, record?.ms ?? null);
    const lap = id ? this.store.data.laps[track]?.[id] : undefined;
    return id && lap ? { ms: lap.ms, name: this.store.data.accounts[id]?.name ?? "Jogador", samples: lap.ghost } : null;
  }

  sendGhosts(m: Member): void {
    const track = this.trackId();
    const mine = this.ghostOf(m, track);
    const record = this.trackRecord(track);
    send(m.conn, { t: "ghosts", mine, record, rival: this.rivalOf(m, track, mine, record) });
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

  private stepFut(f: FutMatch): void {
    stepFutebol(f, TICK_MS);
    this.tickCount++;
    if (this.tickCount % BALANCE.snapshotEvery === 0 || f.phase === "over") {
      const s = JSON.stringify(buildFutSnapshot(f));
      // o snapshot leva só os eventos do tick
      f.events = [];
      for (const mem of this.members.values()) {
        if (!mem.conn) continue;
        send(mem.conn, `{"t":"fsnap","s":${s},"me":${JSON.stringify(buildFutPrivate(f, mem.id))}}`);
      }
    }
    if (f.phase === "over") this.finish();
  }

  private finish(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.suspeito) {
      this.suspeitoResults = getSuspeitoResults(this.suspeito);
      this.awards = this.suspeitoResults.awards;
      this.results = null;
      this.raceResults = null;
      this.futResults = null;
      this.futScore = null;
    } else if (this.futebol) {
      this.futResults = getFutResults(this.futebol);
      this.futScore = getFutScore(this.futebol);
      this.futStats = getFutStats(this.futebol);
      const mvp = this.futResults.find((r) => r.id === this.futStats?.mvpId);
      const info = this.futebol.info.get(mvp?.id ?? "");
      const detail = info ? `${info.goals} gol(s), ${info.assists} assistência(s), ${info.shotsOn} chute(s) no gol` : "";
      this.awards = mvp ? [{ id: "craque", title: "Craque da partida", winnerId: mvp.id, winnerName: mvp.name, detail }] : [];
      this.cupFinish(this.futScore);
      this.results = null;
      this.raceResults = null;
    } else if (this.race) {
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
    this.futebol = null;
    this.suspeito = null;
    this.phase = "results";
    for (const mem of this.members.values()) mem.ready = false;
    for (const id of [...this.members.keys()]) {
      const mem = this.members.get(id)!;
      if (!mem.isBot && !mem.conn) this.removeMember(id);
    }
    const fmsg = this.futResultsMsg();
    if (this.suspeitoResults) this.broadcast({ t: "sresults", results: this.suspeitoResults });
    else if (fmsg) this.broadcast(fmsg);
    else if (this.raceResults) this.broadcast({ t: "rresults", rows: this.raceResults, awards: this.awards });
    else if (this.results) this.broadcast({ t: "results", rows: this.results, awards: this.awards });
    this.broadcastLobby();
    log(`[${this.code}] partida finalizada`);
  }

  /** Soma o resultado da partida ao ranking. Falha aqui nunca pode travar o fim da partida. */
  private recordRanking(): void {
    const store = this.store;
    if (!store) return;
    if (this.futResults) return this.recordFutebolRanking();
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

  /** Futebol: aba própria, só com 2+ humanos; derrota não pontua e gols de pênalti não contam (getFutResults já os exclui). */
  private recordFutebolRanking(): void {
    const store = this.store;
    if (!store || !this.futResults || !this.futScore) return;
    try {
      const { winner } = this.futScore;
      const rows = this.futResults.map((r) => ({ accountId: r.accountId, won: winner !== null && r.side === winner, goals: r.goals, assists: r.assists }));
      if (!matchCounts(rows)) return;
      const humans = this.futResults.filter((r) => !r.isBot).length;
      applyFutebolResult(store.data, rows, humans, Date.now());
      // o craque da partida entra nos prêmios da conta pelo mesmo mecanismo dos outros modos
      if (humans >= 2) {
        const accountOf = (id: string) => this.futResults?.find((r) => r.id === id)?.accountId ?? null;
        applyAwards(store.data, this.awards.map((a) => ({ accountId: accountOf(a.winnerId), title: a.title })));
      }
      store.save();
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
        this.addMember(name, randomAvatar(Math.random, name), null, true, randomChair(Math.random));
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
        if (msg.mode === "futebol" && this.mode !== "futebol") this.distributeSides();
        if (msg.mode !== this.mode) this.cup = null;
        this.mode = msg.mode;
        // contra o relógio e futebol: o servidor completa as vagas, sem bots na sala
        if (this.mode === "timetrial" || this.mode === "futebol") for (const x of [...this.members.values()]) if (x.isBot) this.members.delete(x.id);
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
        if (msg.futFormat !== undefined) this.options.futFormat = msg.futFormat;
        if (msg.futCup !== undefined && msg.futCup !== this.options.futCup) {
          this.options.futCup = msg.futCup;
          this.cup = null;
        }
        if (msg.suspeitoImpostors !== undefined) this.options.suspeitoImpostors = msg.suspeitoImpostors;
        if (msg.suspeitoDiscussionSec !== undefined) this.options.suspeitoDiscussionSec = msg.suspeitoDiscussionSec;
        if (msg.suspeitoVotingSec !== undefined) this.options.suspeitoVotingSec = msg.suspeitoVotingSec;
        if (msg.suspeitoKillCooldownSec !== undefined) this.options.suspeitoKillCooldownSec = msg.suspeitoKillCooldownSec;
        if (msg.suspeitoTasksPerPlayer !== undefined) this.options.suspeitoTasksPerPlayer = msg.suspeitoTasksPerPlayer;
        return this.broadcastLobby();
      case "start": {
        if (!isHost) return;
        const err = this.start();
        if (err) send(conn, { t: "error", msg: err });
        return;
      }
      case "futTeam":
        if (this.phase !== "lobby" || this.mode !== "futebol") return;
        member.side = msg.side;
        return this.broadcastLobby();
      case "futTeamConfig": {
        if (this.phase !== "lobby" || this.mode !== "futebol" || !this.canConfigTeam(member, msg.side)) return;
        const team = this.options.futTeams[msg.side];
        const rival = this.options.futTeams[msg.side === 0 ? 1 : 0];
        if (msg.color !== undefined && msg.color === rival.color) return send(conn, { t: "error", msg: "Essa cor já é do outro time" });
        // no meio de um campeonato o nome do setor não muda (a chave já o guarda)
        if (msg.name !== undefined && !this.cup) {
          const name = sanitizeName(msg.name, "");
          if (name) team.name = name;
        }
        if (msg.kit !== undefined && msg.kit < FUT_KITS.length) team.kit = msg.kit;
        if (msg.color !== undefined && msg.color < FUT_COLORS.length) team.color = msg.color;
        return this.broadcastLobby();
      }
      case "futInput":
        if (this.futebol) setFutInput(this.futebol, member.id, msg, msg.seq);
        return;
      case "suspeitoInput":
        if (this.suspeito) setSuspeitoInput(this.suspeito, member.id, msg);
        return;
      case "suspeitoKill":
        if (this.suspeito) queueSuspeitoKill(this.suspeito, member.id, msg.targetId);
        return;
      case "suspeitoReport":
        if (this.suspeito) queueSuspeitoReport(this.suspeito, member.id, msg.bodyId);
        return;
      case "suspeitoEmergency":
        if (this.suspeito) queueSuspeitoEmergency(this.suspeito, member.id);
        return;
      case "suspeitoVote":
        if (this.suspeito) queueSuspeitoVote(this.suspeito, member.id, msg.targetIdOrSkip);
        return;
      case "suspeitoChat":
        if (this.suspeito) {
          queueSuspeitoMeetingChat(
            this.suspeito,
            member.id,
            msg.text,
            msg.kind ?? "chat",
            msg.targetId,
            msg.skipDiscussion
          );
        }
        return;
      case "suspeitoSabotage":
        if (this.suspeito) queueSuspeitoSabotage(this.suspeito, member.id, msg.sabotageType);
        return;
      case "suspeitoFixSabotage":
        if (this.suspeito) queueSuspeitoFixSabotage(this.suspeito, member.id);
        return;
      case "suspeitoStartTask":
        if (this.suspeito) queueSuspeitoStartTask(this.suspeito, member.id, msg.taskId);
        return;
      case "suspeitoTaskAction":
        if (this.suspeito) queueSuspeitoTaskAction(this.suspeito, member.id, msg);
        return;
      case "chat":
      case "emote": {
        // limite por jogador: o que chega antes do intervalo é descartado em silêncio
        const now = Date.now();
        if (now - member.lastChatAt < CHAT_COOLDOWN_MS) return;
        member.lastChatAt = now;
        return this.broadcast({ t: "chat", from: member.id, kind: msg.t === "chat" ? "phrase" : "emote", index: msg.index });
      }
      case "status":
        if (this.phase !== "lobby") return;
        member.statusIndex = msg.index;
        return this.broadcastLobby();
      case "reaction": {
        if (this.phase !== "lobby" || msg.to === member.id || !this.members.has(msg.to)) return;
        const now = Date.now();
        if (now - member.lastChatAt < CHAT_COOLDOWN_MS) return;
        member.lastChatAt = now;
        return this.broadcast({ t: "reaction", from: member.id, to: msg.to, index: msg.index });
      }
      case "lobby":
        if ((!isHost && !this.suspeitoResults) || this.phase !== "results") return;
        // campeonato terminado: o próximo começa uma chave nova
        if (this.cup?.champion != null) this.cup = null;
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
    const fut = this.futebol;
    const fp = fut?.players.find((q) => q.id === member.id);
    if (fut && fp && fut.info.get(member.id)?.human) {
      if (member.conn === null) dropFutPlayer(fut, member.id);
      else {
        // reconexão com o mesmo token devolve o controle ao humano
        reviveFutPlayer(fut, member.id);
      }
    }
    const p = this.match?.players.get(member.id);
    if (p) {
      p.connected = member.conn !== null;
      if (!p.connected) p.input = { mx: 0, mz: 0, yaw: p.yaw, fire: false };
    }
    const sp = this.suspeito?.players.get(member.id);
    if (sp && member.conn === null) {
      sp.input = { mx: 0, mz: 0, yaw: sp.yaw };
    }
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
    if (room.suspeitoResults && room.phase === "results") send(conn, { t: "sresults", results: room.suspeitoResults });
    const fmsg = room.phase === "results" ? room.futResultsMsg() : null;
    if (fmsg) send(conn, fmsg);
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
