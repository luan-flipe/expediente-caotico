import { z } from "zod";
import type { ChairDNA } from "./race/chair";
import type { RacePrivate, RaceResultRow, RaceSnapshot } from "./race/types";
import type { AvatarDNA, PrivateState, ResultRow, Snapshot } from "./types";

export type GameMode = "shooter" | "race";

const num = z.number().finite();
const avatar = z.unknown();
const chair = z.unknown().optional();
const unit = num.min(-1).max(1);
const code = z.string().regex(/^[A-Z]{5}$/);

/** Mensagens do cliente: só intenções. Nada de dano, pontos, vida ou recarga. */
export const ClientMsg = z.discriminatedUnion("t", [
  z.object({ t: z.literal("create"), name: z.string().max(64), avatar, chair }),
  z.object({ t: z.literal("join"), code, name: z.string().max(64), avatar, chair }),
  z.object({ t: z.literal("resume"), code, token: z.string().min(16).max(64) }),
  z.object({ t: z.literal("ready"), ready: z.boolean() }),
  z.object({ t: z.literal("avatar"), avatar, chair }),
  z.object({ t: z.literal("mode"), mode: z.enum(["shooter", "race"]) }),
  z.object({ t: z.literal("addBot") }),
  z.object({ t: z.literal("removeBot") }),
  z.object({ t: z.literal("duration"), ms: z.union([z.literal(180000), z.literal(300000), z.literal(600000)]) }),
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
  z.object({ t: z.literal("kinput"), steer: unit, throttle: unit, drift: z.boolean(), seq: z.number().int().min(1).max(2 ** 31), itemHold: z.boolean().optional() }),
  z.object({ t: z.literal("kitem"), release: z.boolean().optional() }),
  z.object({ t: z.literal("krespawn") }),
  /** Só fora de produção: pede um item específico para testar. */
  z.object({ t: z.literal("kdebug"), item: z.enum(["expresso", "triplo", "grampeador", "poca", "resma", "aviao", "pasta", "postit"]) }),
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
}

export interface LobbyState {
  code: string;
  hostId: string;
  phase: "lobby" | "match" | "results";
  mode: GameMode;
  durationMs: number;
  players: LobbyPlayer[];
}

export type ServerMsg =
  | { t: "welcome"; id: string; token: string; code: string }
  | { t: "lobby"; state: LobbyState }
  | { t: "snap"; s: Snapshot; me: PrivateState | null }
  | { t: "results"; rows: ResultRow[] }
  | { t: "rsnap"; s: RaceSnapshot; me: RacePrivate | null }
  | { t: "rresults"; rows: RaceResultRow[] }
  | { t: "error"; msg: string }
  | { t: "pong"; c: number };
