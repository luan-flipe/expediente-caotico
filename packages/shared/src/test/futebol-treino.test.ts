import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "../data/avatar";
import { FUT, buildFutSnapshot, createFutebol, stepFutebol } from "../index";
import type { FutMatch } from "../index";

const DT = 1000 / 30;
const TEAMS: [{ name: string; kit: number; color: number }, { name: string; kit: number; color: number }] = [
  { name: "A", kit: 0, color: 0 },
  { name: "B", kit: 1, color: 1 },
];

/** Treino com dois humanos (um marcado em cada time: o treino junta os dois no time 0). */
function treino(seed = 7, durationMs = 120000): FutMatch {
  const players = [0, 1].map((i) => ({ id: `h${i}`, name: `h${i}`, avatar: DEFAULT_AVATAR, side: i as 0 | 1, isBot: false, accountId: null }));
  return createFutebol({ seed, format: 5, durationMs, botLevel: "normal", players, teams: TEAMS, treino: true });
}

function ateJogar(m: FutMatch): void {
  for (let i = 0; i < 200 && m.phase !== "play"; i++) stepFutebol(m, DT);
}

describe("treino de chute", () => {
  it("só os humanos (no time 0) e os goleiros: nenhum bot de linha", () => {
    const m = treino();
    expect(m.players.filter((p) => p.role === "linha").map((p) => [p.id, p.side])).toEqual([
      ["h0", 0],
      ["h1", 0],
    ]);
    expect(m.players.filter((p) => p.role === "goleiro")).toHaveLength(2);
    expect(buildFutSnapshot(m).treino).toBe(true);
  });

  it("depois do apito a bola está parada na entrada da área, com um humano atrás dela olhando o gol", () => {
    const m = treino();
    ateJogar(m);
    expect(m.phase).toBe("play");
    expect(m.restart).toBeNull();
    const d = m.field.halfL - m.ball.x;
    expect(d).toBeGreaterThanOrEqual(14);
    expect(d).toBeLessThanOrEqual(26);
    expect(Math.abs(m.ball.z)).toBeLessThan(m.field.halfW * 0.5);
    const h0 = m.players.find((p) => p.id === "h0")!;
    expect(Math.hypot(h0.x - m.ball.x, h0.z - m.ball.z)).toBeLessThan(2);
    expect(h0.x).toBeLessThan(m.ball.x);
    expect(Math.sin(h0.facing)).toBeGreaterThan(0.5);
    // perto o bastante para dominar: no tick seguinte a bola é dele, é só carregar e chutar
    stepFutebol(m, DT);
    expect(m.ball.ownerId).toBe("h0");
  });

  it("gol conta, comemora e a bola volta para um ponto novo", () => {
    const m = treino();
    ateJogar(m);
    const antes = { x: m.ball.x, z: m.ball.z };
    Object.assign(m.ball, { x: m.field.halfL + 1, y: 0.5, z: 0, vx: 5, vy: 0, vz: 0, ownerId: null, lastTouch: { id: "h0", side: 0 } });
    stepFutebol(m, DT);
    expect(m.score).toEqual([1, 0]);
    expect(m.phase).toBe("goal");
    for (let i = 0; i < (FUT.goalCelebrateMs / DT) + 5; i++) stepFutebol(m, DT);
    expect(m.phase).toBe("play");
    expect(m.restart).toBeNull();
    expect(m.ball.x).not.toBe(antes.x);
    expect(m.ball.x).toBeGreaterThan(0);
  });

  it("bola fora volta na hora, sem lateral nem escanteio", () => {
    const m = treino();
    ateJogar(m);
    Object.assign(m.ball, { x: 10, y: FUT.ballRadius, z: m.field.halfW + 2, vx: 0, vy: 0, vz: 3, ownerId: null });
    stepFutebol(m, DT);
    expect(m.restart).toBeNull();
    expect(m.phase).toBe("play");
    expect(Math.abs(m.ball.z)).toBeLessThan(m.field.halfW);
  });

  it("goleiro com a bola na mão: em um segundo e pouco a bola volta para o atacante", () => {
    const m = treino();
    ateJogar(m);
    const gk = m.players.find((p) => p.role === "goleiro" && p.side === 1)!;
    Object.assign(m.ball, { x: gk.x, z: gk.z, vx: 0, vy: 0, vz: 0, ownerId: gk.id });
    for (let i = 0; i < 60; i++) stepFutebol(m, DT);
    expect(m.ball.ownerId).not.toBe(gk.id);
    expect(m.field.halfL - m.ball.x).toBeGreaterThanOrEqual(14);
  });

  it("acaba no tempo sem disputa de pênaltis", () => {
    const m = treino(7, 3000);
    for (let i = 0; i < 400 && m.phase !== "over"; i++) stepFutebol(m, DT);
    expect(m.phase).toBe("over");
    expect(m.shootout).toBeNull();
  });
});
