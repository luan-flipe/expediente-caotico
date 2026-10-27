import { z } from "zod";
import type { AvatarDNA, PrivateState, ResultRow, Snapshot } from "./types";

const num = z.number().finite();
const avatar = z.unknown();
const code = z.string().regex(/^[A-Z]{5}$/);

/** Mensagens do cliente: só intenções. Nada de dano, pontos, vida ou recarga. */
export const ClientMsg = z.discriminatedUnion("t", [
  z.object({ t: z.literal("create"), name: z.string().max(64), avatar }),
  z.object({ t: z.literal("join"), code, name: z.string().max(64), avatar }),
  z.object({ t: z.literal("resume"), code, token: z.string().min(16).max(64) }),
  z.object({ t: z.literal("ready"), ready: z.boolean() }),
  z.object({ t: z.literal("avatar"), avatar }),
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
  z.object({ t: z.literal("evolve"), optionId: z.string().max(32) }),
  z.object({ t: z.literal("lobby") }),
  z.object({ t: z.literal("ping"), c: num }),
]);
export type ClientMsg = z.infer<typeof ClientMsg>;

export interface LobbyPlayer {
  id: string;
  name: string;
  avatar: AvatarDNA;
  ready: boolean;
  isBot: boolean;
  connected: boolean;
}

export interface LobbyState {
  code: string;
  hostId: string;
  phase: "lobby" | "match" | "results";
  durationMs: number;
  players: LobbyPlayer[];
}

export type ServerMsg =
  | { t: "welcome"; id: string; token: string; code: string }
  | { t: "lobby"; state: LobbyState }
  | { t: "snap"; s: Snapshot; me: PrivateState | null }
  | { t: "results"; rows: ResultRow[] }
  | { t: "error"; msg: string }
  | { t: "pong"; c: number };
