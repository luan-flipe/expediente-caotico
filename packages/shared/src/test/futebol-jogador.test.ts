import { describe, expect, it } from "vitest";
import { FUT, fieldFor, stepPlayer } from "../index";
import type { FutInput, FutPlayer } from "../index";

const field = fieldFor(2);

function mk(over: Partial<FutPlayer> = {}): FutPlayer {
  return {
    id: "p1",
    side: 0,
    role: "linha",
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    facing: 0,
    chargeMs: 0,
    chargeKind: null,
    tackleMs: 0,
    downMs: 0,
    yellow: 0,
    sentOff: false,
    isBot: false,
    ...over,
  };
}

function inp(over: Partial<FutInput> = {}): FutInput {
  return { mx: 0, mz: 0, aim: 0, sprint: false, kick: "none", pass: "none", ...over };
}

function run(p: FutPlayer, input: FutInput, ms: number) {
  for (let t = 0; t < ms; t += 16) stepPlayer(p, input, field, 16);
}

describe("jogador de linha", () => {
  it("anda até walkSpeed e não passa", () => {
    const p = mk();
    run(p, inp({ mx: 1 }), 1000);
    const speed = Math.hypot(p.vx, p.vz);
    expect(speed).toBeGreaterThan(FUT.walkSpeed * 0.95);
    expect(speed).toBeLessThanOrEqual(FUT.walkSpeed + 1e-6);
  });
  it("diagonal não é mais rápida que reta", () => {
    const p = mk();
    run(p, inp({ mx: 1, mz: 1 }), 1000);
    expect(Math.hypot(p.vx, p.vz)).toBeLessThanOrEqual(FUT.walkSpeed + 1e-6);
  });
  it("sprint chega a sprintSpeed", () => {
    const p = mk();
    run(p, inp({ mx: 1, sprint: true }), 1500);
    const speed = Math.hypot(p.vx, p.vz);
    expect(speed).toBeGreaterThan(FUT.sprintSpeed * 0.95);
    expect(speed).toBeLessThanOrEqual(FUT.sprintSpeed + 1e-6);
  });
  it("caído não se mexe", () => {
    const p = mk({ downMs: 1000 });
    run(p, inp({ mx: 1 }), 500);
    expect(p.x).toBe(0);
    expect(p.z).toBe(0);
    expect(Math.hypot(p.vx, p.vz)).toBe(0);
  });
  it("não sai além da margem do campo", () => {
    const p = mk();
    run(p, inp({ mx: 1, sprint: true }), 10000);
    expect(p.x).toBeLessThanOrEqual(field.halfL + 2 + 1e-6);
    const q = mk();
    run(q, inp({ mz: -1, sprint: true }), 10000);
    expect(q.z).toBeGreaterThanOrEqual(-(field.halfW + 2) - 1e-6);
  });
});
