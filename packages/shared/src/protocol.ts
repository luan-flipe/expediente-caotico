import { z } from "zod";
import type { Award } from "./awards";
import { BOT_LEVELS, LAPS_MAX, LAPS_MIN, type RoomOptions } from "./botLevels";
import type { ChairDNA } from "./race/chair";
import type { RacePrivate, RaceResultRow, RaceSnapshot } from "./race/types";
import type { GhostSample } from "./ranking/types";
import type { AvatarDNA, PrivateState, ResultRow, Snapshot } from "./types";

export type GameMode = "shooter" | "race" | "timetrial";

/** Chat rápido: só índices, nunca texto livre. Frases e emotes ficam aqui para cliente e servidor concordarem. */
export const CHAT_PHRASES = ["Café!", "Foi sem querer", "Rematch?", "Boa!", "Corre!", "Volto já", "GG", "Isso é RH"] as const;
export const CHAT_EMOTES = ["😂", "😡", "👏", "☕", "💀", "🔥"] as const;
/** Intervalo mínimo entre duas mensagens do mesmo jogador (o servidor descarta as que chegam antes). */
export const CHAT_COOLDOWN_MS = 2000;
/** Quanto tempo o balão fica visível. */
export const CHAT_BUBBLE_MS = 3000;

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
  z.object({ t: z.literal("mode"), mode: z.enum(["shooter", "race", "timetrial"]) }),
  z.object({ t: z.literal("addBot") }),
  z.object({ t: z.literal("removeBot") }),
  z.object({ t: z.literal("duration"), ms: z.union([z.literal(180000), z.literal(300000), z.literal(600000)]) }),
  /** Só o anfitrião: voltas, itens e dificuldade dos bots. Cada campo é opcional; mensagem sem nenhum é ignorada. */
  z
    .object({
      t: z.literal("options"),
      laps: z.number().int().min(LAPS_MIN).max(LAPS_MAX).optional(),
      items: z.boolean().optional(),
      botLevel: z.enum(BOT_LEVELS).optional(),
    })
    .strict(),
  z.object({ t: z.literal("start") }),
  z.object({ t: z.literal("input"), mx: num.min(-1.01).max(1.01), mz: num.min(-1.01).max(1.01), yaw: num.min(-100).max(100), fire: z.boolean() }),
  z.object({
    t: z.literal("action"),
    kind: z.enum(["dodge", "ability"]),
    slot: z.number().int().min(0).max(2).optional(),
    yaw: num.min(-100).max(100),
    dist: num.min(0).max(100).optional(),
  }),
  z.object({ t: z.literal("evolve"), optionId: z.string().max(32), seq: z.number().int().min(0) }),
  z.object({ t: z.literal("kinput"), steer: unit, throttle: unit, drift: z.boolean(), seq: z.number().int().min(1).max(2 ** 31) }),
  z.object({ t: z.literal("kitem") }),
  z.object({ t: z.literal("krespawn") }),
  /** Só o anfitrião, só no contra o relógio: encerra o treino. */
  z.object({ t: z.literal("endTraining") }),
  /** Só fora de produção: pede um item específico para testar. */
  z.object({ t: z.literal("kdebug"), item: z.enum(["expresso", "triplo", "grampeador", "poca", "resma", "aviao", "pasta", "postit"]) }),
  /** Chat rápido: índice da frase ou do emote (ver CHAT_PHRASES e CHAT_EMOTES). */
  z.object({ t: z.literal("chat"), index: z.number().int().min(0).max(CHAT_PHRASES.length - 1) }),
  z.object({ t: z.literal("emote"), index: z.number().int().min(0).max(CHAT_EMOTES.length - 1) }),
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
}

export interface LobbyState {
  code: string;
  hostId: string;
  phase: "lobby" | "match" | "results";
  mode: GameMode;
  durationMs: number;
  options: RoomOptions;
  players: LobbyPlayer[];
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
  /** Fantasmas da pista: o do próprio jogador (conta ou sessão) e o do recordista. Reenviado quando algum muda. */
  | { t: "ghosts"; mine: GhostLap | null; record: (GhostLap & { name: string }) | null }
  /** Chat rápido de alguém da sala (inclusive de quem mandou). */
  | { t: "chat"; from: string; kind: "phrase" | "emote"; index: number }
  | { t: "error"; msg: string }
  | { t: "pong"; c: number };
