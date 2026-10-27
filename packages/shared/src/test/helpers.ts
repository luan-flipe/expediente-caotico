import { DEFAULT_AVATAR } from "../data/avatar";
import { createMatch, stepMatch } from "../sim/match";
import type { Match, PlayerSim } from "../types";

/** Partida já em fase ativa, com jogadores alinhados no corredor livre z = 4,5. */
export function activeMatch(n: number, opts: { durationMs?: number; bots?: boolean } = {}): { m: Match; ps: PlayerSim[] } {
  const m = createMatch({
    durationMs: opts.durationMs ?? 120000,
    seed: 42,
    players: Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      avatar: DEFAULT_AVATAR,
      isBot: opts.bots ?? false,
    })),
  });
  stepMatch(m, 3000);
  const ps = [...m.players.values()];
  ps.forEach((p, i) => {
    p.pos = { x: -10 + i * 5, z: 4.5 };
    p.invulnUntil = 0;
  });
  return { m, ps };
}

export function give(p: PlayerSim, id: PlayerSim["abilities"][number]["id"], level = 1, spec?: "A" | "B") {
  p.abilities.push({ id, level, spec, readyAt: 0 });
  p.options = null;
}
