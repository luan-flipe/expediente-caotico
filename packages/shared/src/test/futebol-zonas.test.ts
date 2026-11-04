import { describe, expect, it } from "vitest";
import { createFutebol, FUT, stepFutebol } from "../index";
import type { FutFormat, FutMatch, TeamSide } from "../index";

const DT = 1000 / 30;
const TEAMS: [{ name: string; kit: number; color: number }, { name: string; kit: number; color: number }] = [
  { name: "A", kit: 0, color: 0 },
  { name: "B", kit: 1, color: 1 },
];

type Owner = "solta" | TeamSide;

/** Partida só de bots com a bola presa num canto (solta, ou na posse de um time sem mexer) durante `ticks`. */
function measure(format: FutFormat, owner: Owner, ticks = 300, seed = 4) {
  const m: FutMatch = createFutebol({ seed, format, durationMs: 180000, botLevel: "normal", players: [], teams: TEAMS });
  m.phase = "play";
  m.restart = null;
  const f = m.field;
  const corner = { x: f.halfL - 2, z: f.halfW - 2 };
  const lines = (s: TeamSide) => m.players.filter((p) => p.side === s && p.role === "linha");
  const holder = owner === "solta" ? null : lines(owner).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  let worstClose = 0;
  let spreadSum = 0;
  let spreadN = 0;
  for (let i = 0; i < ticks; i++) {
    Object.assign(m.ball, { x: corner.x, y: FUT.ballRadius, z: corner.z, vx: 0, vy: 0, vz: 0, ownerId: holder ? holder.id : null });
    if (holder) {
      Object.assign(holder, { x: corner.x - 0.5, z: corner.z, vx: 0, vz: 0 });
    }
    stepFutebol(m, DT);
    if (i < ticks / 3) {
      continue;
    }
    for (const s of [0, 1] as const) {
      const ls = lines(s);
      const near = ls.filter((p) => Math.hypot(p.x - corner.x, p.z - corner.z) < f.halfL * 0.25).length;
      worstClose = Math.max(worstClose, near);
      let sum = 0;
      let n = 0;
      for (let a = 0; a < ls.length; a++) {
        for (let b = a + 1; b < ls.length; b++) {
          sum += Math.hypot(ls[a].x - ls[b].x, ls[a].z - ls[b].z);
          n++;
        }
      }
      if (n) {
        spreadSum += sum / n;
        spreadN++;
      }
    }
  }
  return { worstClose, spread: spreadSum / spreadN, halfW: f.halfW };
}

describe("zonas de posição dos bots", () => {
  const cases: [FutFormat, Owner][] = [];
  for (const format of [3, 4, 5] as const) {
    for (const owner of ["solta", 0, 1] as const) {
      cases.push([format, owner]);
    }
  }
  it.each(cases)("formato %i, bola %s no canto: no máximo 2 de linha por time perto dela e time espalhado", (format, owner) => {
    for (const seed of [1, 2, 3]) {
      const r = measure(format, owner, 300, seed);
      expect(r.worstClose).toBeLessThanOrEqual(2);
      expect(r.spread).toBeGreaterThanOrEqual(r.halfW * 0.6);
    }
  });
});

/** Posição média (m, a favor do ataque) dos jogadores de linha do time 0 que não seguram a bola, com a bola no meio e a posse de um time. */
function meanDepth(format: FutFormat, owner: TeamSide): number {
  const m: FutMatch = createFutebol({ seed: 2, format, durationMs: 180000, botLevel: "normal", players: [], teams: TEAMS });
  m.phase = "play";
  m.restart = null;
  const holder = m.players.filter((p) => p.side === owner && p.role === "linha").sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  for (let i = 0; i < 240; i++) {
    Object.assign(m.ball, { x: 0, y: FUT.ballRadius, z: 0, vx: 0, vy: 0, vz: 0, ownerId: holder.id });
    Object.assign(holder, { x: -0.5 * (owner === 0 ? 1 : -1), z: 0, vx: 0, vz: 0 });
    stepFutebol(m, DT);
  }
  const mates = m.players.filter((p) => p.side === 0 && p.role === "linha" && p.id !== holder.id);
  return mates.reduce((a, p) => a + p.x, 0) / mates.length;
}

describe("zona sobe no ataque e recua na defesa", () => {
  it.each([2, 3, 4, 5] as const)("formato %i: com a posse a linha fica pelo menos 12%% do meio campo mais à frente do que sem ela", (format) => {
    const half = createFutebol({ seed: 1, format, durationMs: 1000, botLevel: "normal", players: [], teams: TEAMS }).field.halfL;
    expect(meanDepth(format, 0) - meanDepth(format, 1)).toBeGreaterThanOrEqual(half * 0.12);
  });
});
