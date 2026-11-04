import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "../data/avatar";
import { createFutebol, stepFutebol } from "../index";
import { startRestart } from "../futebol/restarts";
import type { FutFormat, FutMatch, TeamSide } from "../index";

const DT = 1000 / 30;
const TEAMS: [{ name: string; kit: number; color: number }, { name: string; kit: number; color: number }] = [
  { name: "A", kit: 0, color: 0 },
  { name: "B", kit: 1, color: 1 },
];

function make(format: FutFormat, seed: number, humans = false): FutMatch {
  const players = humans ? [{ id: "h1", name: "h1", avatar: DEFAULT_AVATAR, side: 0 as TeamSide, isBot: false, accountId: null }] : [];
  return createFutebol({ seed, format, durationMs: 180000, botLevel: "normal", players, teams: TEAMS });
}

describe("saída de bola cobrada pela IA", () => {
  it("não entrega a bola ao adversário: a posse seguinte é de quem cobrou", () => {
    let mine = 0;
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
    for (const seed of seeds) {
      const m = make(1, seed, true);
      m.kickoffSide = 0;
      // o humano (time 0) não cobra: a IA cobra por ele ao fim dos 8 s
      let kicked = false;
      for (let t = 0; t < 14000; t += DT) {
        stepFutebol(m, DT);
        if (!kicked && m.phase === "play") {
          kicked = true;
        }
        if (kicked && m.ball.ownerId !== null) {
          const side = m.players.find((p) => p.id === m.ball.ownerId)!.side;
          if (side === 0) {
            mine++;
          }
          break;
        }
      }
    }
    expect(mine).toBeGreaterThanOrEqual(seeds.length * 0.7);
  });
});

describe("tiro de meta", () => {
  it.each([1, 3, 4] as const)("o goleiro pega e cobra em até 3,5 s no formato %d, mesmo com beaten apontando para o último toque", (format) => {
    const m = make(format, 5);
    m.phase = "play";
    const f = m.field;
    const gk = m.players.find((p) => p.role === "goleiro" && p.side === 0)!;
    const shooter = { id: "bot-1-0", side: 1 as TeamSide };
    m.ball.lastTouch = shooter;
    m.beaten = shooter;
    startRestart(m, "meta", 0, -f.halfL + 1, 0);
    let t = 0;
    for (; t < 8000; t += DT) {
      stepFutebol(m, DT);
      if (Math.hypot(m.ball.vx, m.ball.vz) > 1 || m.restart === null && m.ball.ownerId !== gk.id) {
        break;
      }
    }
    expect(t).toBeLessThanOrEqual(3500);
  });
});
