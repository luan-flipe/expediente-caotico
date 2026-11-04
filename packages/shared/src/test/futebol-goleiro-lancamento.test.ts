import { describe, expect, it } from "vitest";
import { createFutebol, FUT, startRestart, stepFutebol, stepRestart } from "../index";
import type { FutFormat, FutMatch } from "../index";

const DT = 1000 / 30;
const TEAMS: [{ name: string; kit: number; color: number }, { name: string; kit: number; color: number }] = [
  { name: "A", kit: 0, color: 0 },
  { name: "B", kit: 1, color: 1 },
];

/** Goleiro do time 0 com a bola; companheiros perto da área (cenário que dava passe curto). */
function setup(format: FutFormat, seed: number, mateX: "perto" | "meio" | "nenhum"): { m: FutMatch; gk: FutMatch["players"][number] } {
  const m = createFutebol({ seed, format, durationMs: 180000, botLevel: "normal", players: [], teams: TEAMS });
  m.phase = "play";
  m.restart = null;
  const f = m.field;
  const gx = -f.halfL;
  const gk = m.players.find((p) => p.role === "goleiro" && p.side === 0)!;
  gk.x = gx + 1.5;
  gk.z = 0;
  m.ball.ownerId = gk.id;
  m.ball.lastTouch = { id: gk.id, side: 0 };
  m.ball.x = gk.x + 0.5;
  m.ball.z = 0;
  m.players.filter((p) => p.side === 1 && p.role === "linha").forEach((p, i) => {
    p.x = gx + f.boxL + 2 + i;
    p.z = (i % 2 === 0 ? 1 : -1) * (f.boxHalfW + 1.5);
  });
  m.players.filter((p) => p.side === 0 && p.role === "linha").forEach((p, i) => {
    p.x = mateX === "perto" ? gx + f.boxL + 3 + i * 2 : mateX === "meio" ? -3 + i : gx + f.boxL + 3;
    p.z = (i - 1) * 3;
    if (mateX === "nenhum") {
      p.sentOff = true;
    }
  });
  return { m, gk };
}

/** Distância (m) da posição da soltura até o primeiro quique da bola. */
function firstBounceDist(m: FutMatch, gk: FutMatch["players"][number], via: "sim" | "meta"): number {
  const f = m.field;
  if (via === "meta") {
    startRestart(m, "meta", 0, -f.halfL + 1, 0);
    m.restart!.leftMs = 0;
    gk.holdMs = 0;
    stepRestart(m, DT);
  } else {
    for (let t = 0; t < 8000 && m.ball.ownerId === gk.id; t += DT) {
      stepFutebol(m, DT);
    }
  }
  expect(m.ball.ownerId).not.toBe(gk.id);
  const x0 = m.ball.x;
  const z0 = m.ball.z;
  let flew = m.ball.y > FUT.ballRadius + 0.05;
  for (let i = 0; i < 400; i++) {
    stepFutebol(m, DT);
    flew ||= m.ball.y > FUT.ballRadius + 0.05;
    if (flew && m.ball.y <= FUT.ballRadius + 1e-6) {
      break;
    }
    if (!flew && Math.hypot(m.ball.vx, m.ball.vz) < 0.1) {
      break;
    }
  }
  lastBounce = { x: m.ball.x, z: m.ball.z };
  return Math.hypot(m.ball.x - x0, m.ball.z - z0);
}
let lastBounce = { x: 0, z: 0 };

describe("goleiro lança longe", () => {
  const cases: [FutFormat, "sim" | "meta", "perto" | "meio" | "nenhum"][] = [];
  for (const format of [4, 5] as const) {
    for (const via of ["sim", "meta"] as const) {
      for (const mate of ["perto", "meio", "nenhum"] as const) {
        cases.push([format, via, mate]);
      }
    }
  }
  it.each(cases)("formato %i via %s, companheiros %s: primeiro quique a pelo menos 45%% do campo", (format, via, mate) => {
    for (const seed of [1, 2, 3]) {
      const { m, gk } = setup(format, seed, mate);
      const len = m.field.halfL * 2;
      expect(firstBounceDist(m, gk, via)).toBeGreaterThanOrEqual(len * 0.45);
    }
  });
});

describe("goleiro lança a bola para a frente em todos os formatos", () => {
  const cases: [FutFormat, "sim" | "meta", "perto" | "meio" | "nenhum"][] = [];
  for (const format of [1, 2, 3, 4, 5] as const) {
    for (const via of ["sim", "meta"] as const) {
      for (const mate of ["perto", "meio", "nenhum"] as const) {
        cases.push([format, via, mate]);
      }
    }
  }
  it.each(cases)("formato %i via %s, companheiros %s: primeiro quique no meio ou no campo adversário, sem sair pelo fundo", (format, via, mate) => {
    for (const seed of [1, 2, 3]) {
      const { m, gk } = setup(format, seed, mate);
      firstBounceDist(m, gk, via);
      expect(lastBounce.x).toBeGreaterThanOrEqual(-0.5);
      expect(lastBounce.x).toBeLessThanOrEqual(m.field.halfL - 0.5);
      expect(Math.abs(lastBounce.z)).toBeLessThanOrEqual(m.field.halfW);
      // depois do quique a bola morre perto: até alguém dominá-la, não sai pelo fundo nem pela lateral
      const e0 = m.events.length;
      for (let i = 0; i < 150 && m.ball.ownerId === null && m.phase === "play"; i++) {
        stepFutebol(m, DT);
      }
      const bad = m.events.slice(e0).filter((e) => e.type === "goal" || (e.type === "restart" && ["lateral", "meta", "escanteio"].includes(e.kind)));
      expect(bad).toEqual([]);
    }
  });
});
