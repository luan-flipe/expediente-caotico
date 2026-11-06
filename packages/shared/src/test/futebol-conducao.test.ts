import { describe, expect, it } from "vitest";
import { FUT, fieldFor, markCarry, resolveTouches, stepPlayer } from "../index";
import type { Ball, FutInput, FutPlayer } from "../index";

const DT = 1000 / 30;
function mk(over: Partial<FutPlayer> = {}): FutPlayer {
  return {
    id: "p1", side: 0, role: "linha", x: 0, z: 0, vx: 0, vz: 0, facing: 0,
    chargeMs: 0, chargeKind: null, tackleMs: 0, downMs: 0, yellow: 0, sentOff: false, isBot: false,
    ...over,
  };
}
const inp = (over: Partial<FutInput> = {}): FutInput => ({ mx: 0, mz: 0, aim: 0, sprint: false, kick: "none", pass: "none", ...over });

/** Posição da bola no referencial do boneco: fwd (à frente de onde ele olha) e lat (para o lado). */
function rel(p: FutPlayer, b: Ball): { fwd: number; lat: number } {
  const dx = b.x - p.x;
  const dz = b.z - p.z;
  return { fwd: dx * Math.sin(p.facing) + dz * Math.cos(p.facing), lat: dx * Math.cos(p.facing) - dz * Math.sin(p.facing) };
}

/** Roda a sim real (movimento + toques) por n ticks e devolve a pior posição relativa da bola. */
function drive(p: FutPlayer, b: Ball, input: FutInput, n: number, worst: { minFwd: number; maxLat: number }): void {
  const f = fieldFor(2);
  for (let i = 0; i < n; i++) {
    markCarry(p, b.ownerId);
    stepPlayer(p, input, f, DT);
    resolveTouches([p], b, new Map([[p.id, input]]), DT, f);
    const r = rel(p, b);
    worst.minFwd = Math.min(worst.minFwd, r.fwd);
    worst.maxLat = Math.max(worst.maxLat, Math.abs(r.lat));
  }
}

describe("bola dominada à frente do pé", () => {
  const sprintFwd = (sprint: boolean) => inp({ mz: 1, sprint });

  it.each([
    ["curva de 90 graus", inp({ mx: 1, sprint: true })],
    ["inversão de sentido", inp({ mz: -1, sprint: true })],
    ["curva de 135 graus", inp({ mx: 1, mz: -1, sprint: true })],
    ["curva andando", inp({ mx: -1 })],
  ])("%s: a bola fica à frente do boneco, nunca ao lado nem atrás", (_n, turn) => {
    const p = mk({ x: 0, z: 0 });
    const b: Ball = { x: 0, y: FUT.ballRadius, z: 0.5, vx: 0, vy: 0, vz: 0, ownerId: "p1", lastTouch: null, prevTouch: null };
    const worst = { minFwd: Infinity, maxLat: 0 };
    drive(p, b, sprintFwd(true), 20, worst);
    drive(p, b, turn, 25, worst);
    expect(b.ownerId).toBe("p1");
    expect(worst.minFwd).toBeGreaterThanOrEqual(0.3);
    expect(worst.maxLat).toBeLessThanOrEqual(0.45);
  });

  it("parado, a bola descansa à frente de onde ele olha", () => {
    const p = mk({ facing: Math.PI * 0.75 });
    const b: Ball = { x: 0.3, y: FUT.ballRadius, z: -0.2, vx: 0, vy: 0, vz: 0, ownerId: "p1", lastTouch: null, prevTouch: null };
    const worst = { minFwd: Infinity, maxLat: 0 };
    drive(p, b, inp(), 5, worst);
    const r = rel(p, b);
    expect(r.fwd).toBeGreaterThanOrEqual(0.4);
    expect(Math.abs(r.lat)).toBeLessThan(0.01);
  });
});
