import { z } from "zod";
import type { Award } from "./awards";
import { BOT_LEVELS, LAPS_MAX, LAPS_MIN, type RoomOptions } from "./botLevels";
import { FUT_COLORS, FUT_KITS } from "./futebol/balance";
import type { Cup } from "./futebol/campeonato";
import type { FutMatchStats } from "./futebol/resumo";
import type { FutPrivate, FutResultRow, FutSnapshot, TeamSide } from "./futebol/types";
import type { ChairDNA } from "./race/chair";
import { TRACK_IDS } from "./race/track";
import type { RacePrivate, RaceResultRow, RaceSnapshot } from "./race/types";
import type { GhostSample } from "./ranking/types";
import type { SuspeitoPrivate, SuspeitoResults, SuspeitoSnapshot } from "./suspeito/types";
import type { AvatarDNA, PrivateState, ResultRow, Snapshot } from "./types";

export type GameMode = "shooter" | "race" | "timetrial" | "futebol" | "suspeito";
export type ShooterSubmode = "pvp" | "zombies";

/** Chat rápido: só índices, nunca texto livre. Frases e emotes ficam aqui para cliente e servidor concordarem. */
export const CHAT_PHRASES = ["Café!", "Foi sem querer", "Rematch?", "Boa!", "Corre!", "Volto já", "GG", "Isso é RH"] as const;
export const CHAT_EMOTES = ["😂", "😡", "👏", "☕", "💀", "🔥"] as const;
/** Intervalo mínimo entre duas mensagens do mesmo jogador (o servidor descarta as que chegam antes). */
export const CHAT_COOLDOWN_MS = 2000;
/** Quanto tempo o balão fica visível. */
export const CHAT_BUBBLE_MS = 3000;
/** Status do crachá no lobby, por índice (mesma política do chat rápido: nada de texto livre). */
export const LOBBY_STATUSES = ["Em reunião (não incomode)", "Fingindo que estou na planilha", "Movido a café extra forte", "Procurando o anexo do e-mail"] as const;
/** Reação rápida ao clicar no crachá de um colega no lobby. */
export const LOBBY_REACTIONS = ["☕ Paga um café", "📄 Segura essa planilha", "👏 Palmas pro estagiário"] as const;

const num = z.number().finite();
const avatar = z.unknown();
const chair = z.unknown().optional();
const unit = num.min(-1).max(1);
const code = z.string().regex(/^[A-Z]{5}$/);
/** Sessão do jogo (ver auth.ts do servidor); inválida ou ausente vira visitante. */
const session = z.string().max(512).optional();

/** Mensagens do cliente: só intenções. Nada de dano, pontos, vida ou recarga. */
export const ClientMsg = z.discriminatedUnion("t", [
  z.object({ t: z.literal("create"), name: z.string().max(64), avatar, chair, session }),
  z.object({ t: z.literal("join"), code, name: z.string().max(64), avatar, chair, session }),
  z.object({ t: z.literal("resume"), code, token: z.string().min(16).max(64), session }),
  z.object({ t: z.literal("ready"), ready: z.boolean() }),
  z.object({ t: z.literal("avatar"), avatar, chair }),
  z.object({ t: z.literal("mode"), mode: z.enum(["shooter", "race", "timetrial", "futebol", "suspeito"]) }),
  z.object({ t: z.literal("shooterSubmode"), submode: z.enum(["pvp", "zombies"]) }),
  z.object({ t: z.literal("addBot") }),
  z.object({ t: z.literal("removeBot") }),
  z.object({ t: z.literal("duration"), ms: z.union([z.literal(180000), z.literal(300000), z.literal(600000)]) }),
  /** Só o anfitrião: voltas, itens, dificuldade dos bots e pista. Cada campo é opcional; mensagem sem nenhum é ignorada. */
  z
    .object({
      t: z.literal("options"),
      laps: z.number().int().min(LAPS_MIN).max(LAPS_MAX).optional(),
      items: z.boolean().optional(),
      botLevel: z.enum(BOT_LEVELS).optional(),
      track: z.enum(TRACK_IDS).optional(),
      futFormat: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
      futCup: z.union([z.literal(0), z.literal(4), z.literal(8)]).optional(),
      suspeitoImpostors: z.number().int().min(1).max(3).optional(),
      suspeitoDiscussionSec: z.number().int().min(10).max(60).optional(),
      suspeitoVotingSec: z.number().int().min(10).max(60).optional(),
      suspeitoKillCooldownSec: z.number().int().min(10).max(60).optional(),
      suspeitoTasksPerPlayer: z.number().int().min(1).max(8).optional(),
    })
    .strict(),
  z.object({ t: z.literal("start") }),
  /** Futebol: o jogador escolhe o time (0 ou 1). */
  z.object({ t: z.literal("futTeam"), side: z.union([z.literal(0), z.literal(1)]) }),
  /** Futebol: o primeiro humano do time ou o anfitrião muda nome, modelo e cor do uniforme. */
  z.object({
    t: z.literal("futTeamConfig"),
    side: z.union([z.literal(0), z.literal(1)]),
    name: z.string().min(1).max(18).optional(),
    kit: z.number().int().min(0).max(FUT_KITS.length - 1).optional(),
    color: z.number().int().min(0).max(FUT_COLORS.length - 1).optional(),
  }),
  /** Futebol: intenção do jogador de linha (ver FutInput). */
  z.object({
    t: z.literal("futInput"),
    mx: unit,
    mz: unit,
    aim: num.min(-100).max(100),
    sprint: z.boolean(),
    kick: z.enum(["none", "charge", "release"]),
    pass: z.enum(["none", "charge", "release"]),
    seq: z.number().int().min(1).max(2 ** 31),
  }),
  z.object({ t: z.literal("input"), mx: num.min(-1.01).max(1.01), mz: num.min(-1.01).max(1.01), yaw: num.min(-100).max(100), fire: z.boolean() }),
  z.object({
    t: z.literal("action"),
    kind: z.enum(["dodge", "ability"]),
    slot: z.number().int().min(0).max(2).optional(),
    yaw: num.min(-100).max(100),
    dist: num.min(0).max(100).optional(),
  }),
  z.object({ t: z.literal("evolve"), optionId: z.string().max(32), seq: z.number().int().min(0) }),
  z.object({ t: z.literal("kinput"), steer: unit, throttle: unit, drift: z.boolean(), seq: z.number().int().min(1).max(2 ** 31), itemHold: z.boolean().optional() }),
  z.object({ t: z.literal("kitem"), release: z.boolean().optional() }),
  z.object({ t: z.literal("krespawn") }),
  /** Só o anfitrião, só no contra o relógio: encerra o treino. */
  z.object({ t: z.literal("endTraining") }),
  /** Só fora de produção: pede um item específico para testar. */
  z.object({ t: z.literal("kdebug"), item: z.enum(["expresso", "triplo", "grampeador", "poca", "resma", "aviao", "pasta", "postit"]) }),
  /** Expediente Suspeito: intenções de movimentação e ações */
  z.object({ t: z.literal("suspeitoInput"), mx: unit, mz: unit, yaw: num.min(-100).max(100) }),
  z.object({ t: z.literal("suspeitoKill"), targetId: z.string().max(64) }),
  z.object({ t: z.literal("suspeitoReport"), bodyId: z.string().max(64) }),
  z.object({ t: z.literal("suspeitoEmergency") }),
  z.object({ t: z.literal("suspeitoVote"), targetIdOrSkip: z.string().max(64) }),
  z.object({
    t: z.literal("suspeitoSabotage"),
    sabotageType: z.enum(["vazamento_dados", "falha_energia", "queda_rede", "impressora_travada"]),
  }),
  z.object({ t: z.literal("suspeitoFixSabotage") }),
  z.object({ t: z.literal("suspeitoStartTask"), taskId: z.string().max(64) }),
  z.object({
    t: z.literal("suspeitoTaskAction"),
    termoGuess: z.string().max(16).optional(),
    conexoWords: z.array(z.string().max(32)).optional(),
    contextoGuess: z.string().max(32).optional(),
    quickAdvance: z.boolean().optional(),
  }),
  /** Chat rápido: índice da frase ou do emote (ver CHAT_PHRASES e CHAT_EMOTES). */
  z.object({ t: z.literal("chat"), index: z.number().int().min(0).max(CHAT_PHRASES.length - 1) }),
  z.object({ t: z.literal("emote"), index: z.number().int().min(0).max(CHAT_EMOTES.length - 1) }),
  /** Status do crachá no lobby; null limpa. */
  z.object({ t: z.literal("status"), index: z.number().int().min(0).max(LOBBY_STATUSES.length - 1).nullable() }),
  /** Reação rápida dirigida a um colega no lobby (ver LOBBY_REACTIONS). */
  z.object({ t: z.literal("reaction"), to: z.string().max(64), index: z.number().int().min(0).max(LOBBY_REACTIONS.length - 1) }),
  z.object({ t: z.literal("leave") }),
  z.object({ t: z.literal("lobby") }),
  z.object({ t: z.literal("ping"), c: num }),
]);
export type ClientMsg = z.infer<typeof ClientMsg>;

export interface LobbyPlayer {
  id: string;
  name: string;
  avatar: AvatarDNA;
  chair: ChairDNA;
  ready: boolean;
  isBot: boolean;
  connected: boolean;
  /** Logado com conta: a partida pode contar para o ranking. */
  ranked: boolean;
  /** Futebol: time do jogador (bots da sala não têm). */
  side?: TeamSide;
  /** Índice em LOBBY_STATUSES, ou null sem status escolhido. */
  statusIndex: number | null;
}

export interface LobbyState {
  code: string;
  hostId: string;
  phase: "lobby" | "match" | "results";
  mode: GameMode;
  shooterSubmode?: ShooterSubmode;
  durationMs: number;
  options: RoomOptions;
  players: LobbyPlayer[];
  /** Futebol: a chave do campeonato entre setores em andamento (ausente fora dele). */
  cup?: Cup | null;
}

/** Um fantasma: tempo da volta e amostras [tempo na volta, x, z, direção]. */
export interface GhostLap {
  ms: number;
  samples: GhostSample[];
}

export type ServerMsg =
  | { t: "welcome"; id: string; token: string; code: string }
  | { t: "lobby"; state: LobbyState }
  | { t: "snap"; s: Snapshot; me: PrivateState | null }
  | { t: "results"; rows: ResultRow[]; awards: Award[] }
  | { t: "rsnap"; s: RaceSnapshot; me: RacePrivate | null }
  | { t: "rresults"; rows: RaceResultRow[]; awards: Award[] }
  | { t: "fsnap"; s: FutSnapshot; me: FutPrivate | null }
  | { t: "fresults"; rows: FutResultRow[]; score: { score: [number, number]; pens: [number, number] | null; winner: TeamSide | null }; awards: Award[]; stats?: FutMatchStats }
  | { t: "ssnap"; s: SuspeitoSnapshot; me: SuspeitoPrivate | null }
  | { t: "sresults"; results: SuspeitoResults }
  /** Fantasmas da pista: o do próprio jogador (conta ou sessão), o do recordista e o do rival (a volta logo à frente da sua). Reenviado quando algum muda. */
  | { t: "ghosts"; mine: GhostLap | null; record: (GhostLap & { name: string }) | null; rival?: (GhostLap & { name: string }) | null }
  /** Chat rápido de alguém da sala (inclusive de quem mandou). */
  | { t: "chat"; from: string; kind: "phrase" | "emote"; index: number }
  /** Reação rápida dirigida a alguém da sala (ver LOBBY_REACTIONS). */
  | { t: "reaction"; from: string; to: string; index: number }
  /** Cumpriu o desafio da semana: o cliente mostra um aviso na hora. */
  | { t: "challenge"; text: string; points: number }
  | { t: "error"; msg: string }
  | { t: "pong"; c: number };
