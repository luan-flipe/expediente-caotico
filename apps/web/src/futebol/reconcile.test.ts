import { describe, expect, it } from "vitest";
import { FUT, fieldFor, markCarry, stepPlayer, type FutInput, type FutPlayer } from "@ec/shared";
import { reconcileDrawn, predictedPlayer } from "./reconcile";

/** Posição desenhada: ponto anterior + (previsão - anterior) * k + desvio. */
const draw = (prev: { x: number; z: number }, pred: { x: number; z: number }, vis: { x: number; z: number }, k: number) => ({
  x: prev.x + (pred.x - prev.x) * k + vis.x,
  z: prev.z + (pred.z - prev.z) * k + vis.z,
});

describe("reconcileDrawn", () => {
  it("reconciliar sem erro não move a posição desenhada", () => {
    const next = { x: 5, z: 2 };
    const before = { x: 5.2, z: 2.1 };
    const r = reconcileDrawn(before, next);
    for (const k of [0, 0.4, 1]) {
      const d = draw(r.prev, next, r.vis, k);
      expect(d.x).toBeCloseTo(before.x);
      expect(d.z).toBeCloseTo(before.z);
    }
  });

  it("erro maior que 3 m aceita a previsão sem suavizar", () => {
    const next = { x: 0, z: 0 };
    const r = reconcileDrawn({ x: 4, z: 0 }, next);
    expect(r.vis).toEqual({ x: 0, z: 0 });
    expect(draw(r.prev, next, r.vis, 0.5)).toEqual(next);
  });
});

describe("predição com condução e recuperação", () => {
  const field = fieldFor(4);
  const DT = 1000 / 30;
  const input = (i: number): FutInput => ({ mx: Math.sin(i / 7), mz: Math.cos(i / 5), aim: 0, sprint: i % 40 > 20, kick: "none", pass: "none" });

  it("o replay a partir do snapshot bate com o servidor após N passos (conduzindo e logo após perder a bola)", () => {
    // servidor: conduz por 30 passos, perde a bola (slowMs ligado) e segue
    const server: FutPlayer = { id: "a", side: 0, role: "linha", x: 0, z: 0, vx: 0, vz: 0, facing: 0, chargeMs: 0, chargeKind: null, tackleMs: 0, downMs: 0, yellow: 0, sentOff: false, isBot: false };
    let owner: string | null = "a";
    const log: { x: number; z: number; vx: number; vz: number; facing: number; slowMs: number; owner: string | null }[] = [];
    for (let i = 0; i < 90; i++) {
      if (i === 30) {
        owner = null;
        server.slowMs = FUT.recoverMs;
      }
      markCarry(server, owner);
      stepPlayer(server, input(i), field, DT);
      log.push({ x: server.x, z: server.z, vx: server.vx, vz: server.vz, facing: server.facing, slowMs: server.slowMs ?? 0, owner });
    }
    // cliente: snapshot depois da perda da bola (com slowMs), replay dos passos seguintes com o dono do snapshot
    for (const from of [31, 40, 55]) {
      const s = log[from];
      const p = { id: "a", side: 0 as const, role: "linha" as const, x: s.x, z: s.z, vx: s.vx, vz: s.vz, facing: s.facing, yellow: 0 } as Parameters<typeof predictedPlayer>[0];
      const next = predictedPlayer(p, { chargeMs: 0, ackSeq: 0, slowMs: s.slowMs }, s.owner);
      for (let i = from + 1; i < 90; i++) {
        stepPlayer(next, input(i), field, DT);
      }
      expect(next.x).toBeCloseTo(server.x, 1);
      expect(next.z).toBeCloseTo(server.z, 1);
    }
  });

  it("sem o slowMs do estado privado o replay diverge (o campo é necessário)", () => {
    const base = { id: "a", side: 0 as const, role: "linha" as const, x: 0, z: 0, vx: 0, vz: 0, facing: 0, yellow: 0 } as Parameters<typeof predictedPlayer>[0];
    const com = predictedPlayer(base, { chargeMs: 0, ackSeq: 0, slowMs: FUT.recoverMs }, null);
    const sem = predictedPlayer(base, { chargeMs: 0, ackSeq: 0, slowMs: 0 }, null);
    for (let i = 0; i < 20; i++) {
      stepPlayer(com, input(i), field, DT);
      stepPlayer(sem, input(i), field, DT);
    }
    expect(Math.hypot(com.x - sem.x, com.z - sem.z)).toBeGreaterThan(0.01);
  });
});
