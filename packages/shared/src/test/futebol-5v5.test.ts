import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "../data/avatar";
import { DIAMOND, FUT, createFutebol, getFutScore, keeperReach, stepFutebol } from "../index";
import type { FutMatch } from "../index";

const DT = 1000 / 30;
const TEAMS: [{ name: string; kit: number; color: number }, { name: string; kit: number; color: number }] = [
  { name: "A", kit: 0, color: 0 },
  { name: "B", kit: 1, color: 1 },
];

function make(seed = 3, humans = 0, durationMs = 120000): FutMatch {
  const players = Array.from({ length: humans }, (_, i) => ({ id: `h${i}`, name: `h${i}`, avatar: DEFAULT_AVATAR, side: (i % 2) as 0 | 1, isBot: false, accountId: null }));
  return createFutebol({ seed, format: 5, durationMs, botLevel: "normal", players, teams: TEAMS });
}

describe("partida 5v5 no estádio", () => {
  it("monta quatro de linha mais goleiro por time, completando com bots", () => {
    const m = make(3, 2);
    for (const side of [0, 1] as const) {
      expect(m.players.filter((p) => p.side === side && p.role === "linha")).toHaveLength(4);
      expect(m.players.filter((p) => p.side === side && p.role === "goleiro")).toHaveLength(1);
    }
    expect(m.field.halfL).toBeGreaterThan(45);
    expect(m.players.filter((p) => p.isBot && p.role === "linha")).toHaveLength(6);
  });

  it("os jogadores começam no próprio lado e dentro do campo", () => {
    const m = make();
    for (const p of m.players) {
      expect(Math.abs(p.x)).toBeLessThan(m.field.halfL);
      expect(Math.abs(p.z)).toBeLessThan(m.field.halfW);
      if (p.role === "linha") {
        expect(p.side === 0 ? p.x < 0 : p.x > 0).toBe(true);
      }
    }
  });

  it("goleiro alcança mais num gol maior", () => {
    expect(keeperReach("normal", make().field)).toBeGreaterThan(keeperReach("normal"));
  });

  it("bots em campo mantêm o losango: zagueiro, dois laterais e um à frente", () => {
    const m = make(5);
    m.phase = "play";
    m.restart = null;
    Object.assign(m.ball, { x: 0, z: 0 });
    // bola longe de tudo, no meio: ninguém a persegue de perto (o mais perto vai nela; os outros ficam na formação)
    for (let t = 0; t < 8000; t += DT) {
      m.ball.vx = 0;
      m.ball.vz = 0;
      m.ball.x = 0;
      m.ball.z = 0;
      m.ball.ownerId = null;
      m.restart = null;
      stepFutebol(m, DT);
    }
    const f = m.field;
    const team = m.players.filter((p) => p.side === 0 && p.role === "linha").sort((a, b) => (a.id < b.id ? -1 : 1));
    // quem não é o que vai na bola está no ponto do losango (time 0 ataca para +x)
    let held = 0;
    team.forEach((p, k) => {
      if (Math.hypot(p.x, p.z) < 4) {
        return;
      }
      held++;
      const [fx, fz] = DIAMOND[k];
      expect(Math.hypot(p.x - fx * f.halfL, p.z - fz * f.halfW)).toBeLessThan(3);
    });
    expect(held).toBeGreaterThanOrEqual(3);
  });

  it("jogo só de bots no estádio roda inteiro sem sair do campo nem dar número inválido", () => {
    const m = make(7, 0, 90000);
    let out = 0;
    for (let t = 0; t < 600000 && m.phase !== "over"; t += DT) {
      stepFutebol(m, DT);
      for (const p of m.players) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) {
          throw new Error("posição inválida");
        }
        if (p.role === "linha" && !p.sentOff && (Math.abs(p.x) > m.field.halfL + 2.01 || Math.abs(p.z) > m.field.halfW + 2.01)) {
          out++;
        }
      }
      if (!Number.isFinite(m.ball.x) || !Number.isFinite(m.ball.y)) {
        throw new Error("bola inválida");
      }
    }
    expect(out).toBe(0);
    expect(m.phase).toBe("over");
    expect(m.elapsedMs).toBeGreaterThanOrEqual(m.durationMs);
    const { score } = getFutScore(m);
    expect(score[0] + score[1]).toBeGreaterThanOrEqual(0);
    expect(FUT.restartWaitMs).toBeGreaterThan(0);
  });
});
