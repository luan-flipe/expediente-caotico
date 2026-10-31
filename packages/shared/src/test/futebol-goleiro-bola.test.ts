import { describe, expect, it } from "vitest";
import { createFutebol, FUT, stepFutebol } from "../index";
import type { FutFormat, FutMatch } from "../index";

const DT = 1000 / 30;
const TEAMS: [{ name: string; kit: number; color: number }, { name: string; kit: number; color: number }] = [
  { name: "A", kit: 0, color: 0 },
  { name: "B", kit: 1, color: 1 },
];

/** Partida só de bots com o goleiro do time 0 segurando a bola, adversários espalhados fora da área. */
function keeperHolds(format: FutFormat, seed: number): { m: FutMatch; gk: FutMatch["players"][number]; gx: number } {
  const m = createFutebol({ seed, format, durationMs: 180000, botLevel: "normal", players: [], teams: TEAMS });
  m.phase = "play";
  m.restart = null;
  const f = m.field;
  const gk = m.players.find((p) => p.role === "goleiro" && p.side === 0)!;
  const gx = -f.halfL;
  gk.x = gx + 1.5;
  gk.z = 0;
  m.ball.ownerId = gk.id;
  m.ball.lastTouch = { id: gk.id, side: 0 };
  m.ball.x = gk.x + 0.5;
  m.ball.z = 0;
  const rivals = m.players.filter((p) => p.side === 1 && p.role === "linha");
  rivals.forEach((p, i) => {
    p.x = gx + f.boxL + 2 + i;
    p.z = (i % 2 === 0 ? 1 : -1) * (f.boxHalfW + 1.5);
  });
  m.players.filter((p) => p.side === 0 && p.role === "linha").forEach((p, i) => {
    p.x = gx + f.boxL + 3 + i * 2;
    p.z = (i - 1) * 3;
  });
  return { m, gk, gx };
}

/** Roda até o goleiro soltar a bola (máx. maxMs) e devolve métricas da posse nas mãos. */
function holdRun(format: FutFormat, seed: number, maxMs = 8000) {
  const { m, gk, gx } = keeperHolds(format, seed);
  const f = m.field;
  const mates = m.players.filter((p) => p.side === 0 && p.role === "linha");
  let t = 0;
  let zMin = gk.z;
  let zMax = gk.z;
  let outOfBox = 0;
  let rivalsInBox = 0;
  const travelled = mates.map(() => 0);
  const prev = mates.map((p) => ({ x: p.x, z: p.z }));
  const inBox = (p: { x: number; z: number }, pad = 0): boolean => Math.abs(p.x - gx) <= f.boxL + pad && Math.abs(p.z) <= f.boxHalfW + pad;
  for (; t < maxMs && m.ball.ownerId === gk.id; t += DT) {
    stepFutebol(m, DT);
    zMin = Math.min(zMin, gk.z);
    zMax = Math.max(zMax, gk.z);
    if (!inBox(gk, 0.6)) {
      outOfBox++;
    }
    // 1,5 s de tolerância para quem estava perto sair da área
    if (t > 1500 && m.players.some((p) => p.side === 1 && p.role === "linha" && inBox(p))) {
      rivalsInBox++;
    }
    mates.forEach((p, i) => {
      travelled[i] += Math.hypot(p.x - prev[i].x, p.z - prev[i].z);
      prev[i] = { x: p.x, z: p.z };
    });
  }
  const avgSpeed = travelled.reduce((a, d) => a + d, 0) / mates.length / Math.max(t / 1000, 0.001);
  return { holdMs: t, released: m.ball.ownerId !== gk.id, zRange: zMax - zMin, outOfBox, rivalsInBox, avgSpeed, m };
}

describe("goleiro com a bola na mão", () => {
  it.each([2, 3, 4] as const)("no formato %d o goleiro se desloca dentro da área, sem sair dela", (format) => {
    const r = holdRun(format, 3);
    expect(r.zRange).toBeGreaterThan(0.5);
    expect(r.outOfBox).toBe(0);
  });

  it("solta a bola entre 2 e 5 s", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = holdRun(3, seed);
      expect(r.released).toBe(true);
      expect(r.holdMs).toBeGreaterThanOrEqual(2000);
      expect(r.holdMs).toBeLessThanOrEqual(5000);
    }
  });

  it("nenhum adversário fica dentro da área enquanto a bola está nas mãos", () => {
    for (const format of [1, 2, 3, 4] as const) {
      expect(holdRun(format, 7).rivalsInBox).toBe(0);
    }
  });

  it("os companheiros se movimentam para dar opção", () => {
    for (const format of [2, 3, 4] as const) {
      expect(holdRun(format, 9).avgSpeed).toBeGreaterThan(0.5);
    }
  });

  it("depois do lançamento a bola sai da mão (passe ou lançamento)", () => {
    const r = holdRun(3, 11);
    expect(Math.hypot(r.m.ball.vx, r.m.ball.vz)).toBeGreaterThan(FUT.passMin * 0.5);
  });
});
