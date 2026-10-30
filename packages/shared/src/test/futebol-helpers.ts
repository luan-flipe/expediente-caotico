import { fieldFor, FUT, mulberry32 } from "../index";
import type { Ball, Field, FutMatch, FutPlayer } from "../index";

/** Partida completa mínima para testar peças soltas (jogadores e bola vindos do teste). */
export function makeFutMatch(
  players: FutPlayer[],
  opts: { field?: Field; ball?: Ball; connected?: string[]; seed?: number } = {},
): FutMatch {
  return {
    field: opts.field ?? fieldFor(2),
    players,
    ball: opts.ball ?? { x: 0, y: FUT.ballRadius, z: 0, vx: 0, vy: 0, vz: 0, ownerId: null, lastTouch: null, prevTouch: null },
    restart: null,
    connected: new Set(opts.connected ?? []),
    rng: mulberry32(opts.seed ?? 1),
    now: 0,
    phase: "play",
    phaseMs: 0,
    elapsedMs: 0,
    durationMs: 180000,
    format: 2,
    botLevel: "normal",
    seed: opts.seed ?? 1,
    score: [0, 0],
    teams: [
      { name: "A", kit: 0, color: 0 },
      { name: "B", kit: 1, color: 1 },
    ],
    info: new Map(),
    inputs: new Map(),
    ack: new Map(),
    events: [],
    kickoffSide: 0,
    halfDone: false,
    beaten: null,
    shootout: null,
    winner: null,
  };
}
