import type { AvatarDNA, Phase, Vec2 } from "../types";
import type { ChairDNA } from "./chair";
import type { KartInput, KartState } from "./kart";
import type { LapState } from "./laps";

export type ItemId = "expresso" | "triplo" | "grampeador" | "poca" | "resma" | "aviao" | "pasta" | "postit";
export type HazardKind = "poca" | "resma" | "grampo" | "aviao";

export interface Hazard {
  id: number;
  kind: HazardKind;
  pos: Vec2;
  vel: Vec2;
  targetId?: string;
  owner: string;
  bornAt: number;
  until: number;
}

export interface ItemBox {
  id: number;
  pos: Vec2;
  readyAt: number;
}

export interface CoffeeCup {
  id: number;
  pos: Vec2;
  readyAt: number;
}

export interface RaceBotBrain {
  lane: number;
  nextLaneAt: number;
  stuckMs: number;
  holdMs: number;
}

export interface Racer {
  id: string;
  name: string;
  avatar: AvatarDNA;
  chair: ChairDNA;
  isBot: boolean;
  connected: boolean;
  kart: KartState;
  input: KartInput;
  lap: LapState;
  progress: number;
  place: number;
  item: ItemId | null;
  charges: number;
  useQueued: boolean;
  holdingItem?: boolean;
  respawnQueued: boolean;
  shieldUntil: number;
  blindUntil: number;
  wrongMs: number;
  /** Comandos numerados do jogador, aplicados um por tick (o cliente refaz os ainda não confirmados). */
  inputQueue: { seq: number; input: KartInput }[];
  ackSeq: number;
  idleTicks: number;
  stepCredit: number;
  itemsUsed: Partial<Record<ItemId, number>>;
  bot?: RaceBotBrain;
}

export type RaceEvent =
  | { type: "item"; id: string; item: ItemId }
  | { type: "box"; id: string; box: number }
  | { type: "hit"; id: string; by: string | null; kind: "spin" | "slip" | "resma" | "blocked" | "postit" }
  | { type: "boost"; id: string; level: 1 | 2 | 3 | "stunt" | "draft" }
  | { type: "wall"; id: string }
  | { type: "lap"; id: string; lap: number; ms: number }
  | { type: "finish"; id: string; place: number; ms: number }
  | { type: "cup"; id: string; cupId: number }
  | { type: "stunt"; id: string }
  | { type: "draft"; id: string };

export interface RaceMatch {
  now: number;
  phase: Phase;
  countdownEndsAt: number;
  graceEndsAt: number | null;
  laps: number;
  /** Tempo para os demais terminarem depois do 1º. */
  graceMs: number;
  racers: Map<string, Racer>;
  hazards: Hazard[];
  boxes: ItemBox[];
  cups: CoffeeCup[];
  events: RaceEvent[];
  cps: number[];
  rng: () => number;
  nextId: number;
}

export interface RaceKartPublic {
  id: string;
  name: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  /** Nível da derrapagem em curso: -1 sem derrapar, 0 derrapando, 1, 2 e 3 turbo garantido. */
  drift: -1 | 0 | 1 | 2 | 3;
  driftDir: -1 | 0 | 1;
  flags: string[];
  place: number;
  lap: number;
  finished: boolean;
  isBot: boolean;
  connected: boolean;
  cups?: number;
  holdingItem?: boolean;
}

export interface RaceSnapshot {
  t: number;
  phase: Phase;
  countdownMs: number;
  elapsedMs: number;
  graceMs: number | null;
  laps: number;
  karts: RaceKartPublic[];
  boxes: { id: number; x: number; z: number; ready: boolean }[];
  hazards: { id: number; kind: HazardKind; x: number; z: number; vx: number; vz: number }[];
  events: RaceEvent[];
  cups?: { id: number; x: number; z: number; ready: boolean }[];
}

/** Estado só do próprio jogador: item, tempos e a cadeira completa para a previsão local. */
export interface RacePrivate {
  item: ItemId | null;
  charges: number;
  lap: number;
  place: number;
  total: number;
  lapMs: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
  raceMs: number;
  blindMs: number;
  shieldMs: number;
  wrongWay: boolean;
  finished: boolean;
  cups?: number;
  holdingItem?: boolean;
  /** Último comando numerado já aplicado pelo servidor. */
  ackSeq: number;
  kart: {
    x: number;
    z: number;
    heading: number;
    speed: number;
    drifting: boolean;
    driftDir: -1 | 0 | 1;
    driftMs: number;
    boostMs: number;
    spinMs: number;
    slipMs: number;
    frozenMs: number;
  };
}

export interface RaceResultRow {
  id: string;
  name: string;
  avatar: AvatarDNA;
  chair: ChairDNA;
  isBot: boolean;
  place: number;
  totalMs: number | null;
  bestLapMs: number | null;
  lapsDone: number;
  favItem: ItemId | null;
  itemsUsed: number;
}
