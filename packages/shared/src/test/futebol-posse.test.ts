import { describe, expect, it } from "vitest";
import { FUT, resolveTouches } from "../index";
import type { Ball, FutInput, FutPlayer } from "../index";

const DT = 1000 / 30;
const IDLE: FutInput = { mx: 0, mz: 0, aim: 0, sprint: false, kick: "none", pass: "none" };

function mk(over: Partial<FutPlayer> = {}): FutPlayer {
  return {
    id: "p1", side: 0, role: "linha", x: 0, z: 0, vx: 0, vz: 0, facing: Math.PI / 2,
    chargeMs: 0, chargeKind: null, tackleMs: 0, downMs: 0, yellow: 0, sentOff: false, isBot: false,
    ...over,
  };
}
function ball(over: Partial<Ball> = {}): Ball {
  return { x: 0, y: FUT.ballRadius, z: 0, vx: 0, vy: 0, vz: 0, ownerId: null, lastTouch: null, prevTouch: null, ...over };
}

describe("bola dominada à frente dos pés", () => {
  it("parado, a bola fica 0,4 a 0,5 m à frente, na direção em que o boneco olha", () => {
    const p = mk({ facing: Math.PI / 2 });
    const b = ball({ x: 0.1, z: 0 });
    resolveTouches([p], b, new Map([["p1", IDLE]]), DT);
    expect(b.ownerId).toBe("p1");
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    expect(d).toBeGreaterThanOrEqual(0.4);
    expect(d).toBeLessThanOrEqual(0.5);
    expect(b.x - p.x).toBeGreaterThan(0.4);
    expect(Math.abs(b.z - p.z)).toBeLessThan(0.05);
  });

  it("parado e olhando para -z, a bola fica em -z", () => {
    const p = mk({ facing: Math.PI });
    const b = ball({ x: 0, z: 0.2 });
    resolveTouches([p], b, new Map([["p1", IDLE]]), DT);
    expect(b.z - p.z).toBeLessThan(-0.4);
  });

  it("andando, a bola fica entre 0,5 e 0,6 m; correndo, mais longe", () => {
    const walk = mk({ vx: FUT.walkSpeed });
    const bw = ball({ x: 0.3, ownerId: "p1" });
    for (let i = 0; i < 12; i++) resolveTouches([walk], bw, new Map([["p1", IDLE]]), DT);
    expect(bw.x - walk.x).toBeGreaterThanOrEqual(0.5);
    expect(bw.x - walk.x).toBeLessThanOrEqual(0.6);
    const run = mk({ vx: FUT.sprintSpeed });
    const br = ball({ x: 0.3, ownerId: "p1" });
    for (let i = 0; i < 12; i++) resolveTouches([run], br, new Map([["p1", { ...IDLE, sprint: true }]]), DT);
    expect(br.x - run.x).toBeGreaterThan(bw.x - walk.x);
  });

  it("o adversário ainda toma a bola parada com a disputa", () => {
    const dono = mk({ id: "p1", facing: Math.PI / 2 });
    const rival = mk({ id: "p2", side: 1, x: 0.9, z: 0 });
    const b = ball({ ownerId: "p1" });
    resolveTouches([dono, rival], b, new Map([["p1", IDLE], ["p2", IDLE]]), DT);
    const ev = [];
    for (let i = 0; i < 40 && !ev.length; i++) {
      const charge = new Map<string, FutInput>([["p2", { ...IDLE, pass: i < 3 ? "charge" : "release" }]]);
      ev.push(...resolveTouches([dono, rival], b, charge, DT).filter((e) => e.t === "steal" && e.ok));
    }
    expect(ev).toHaveLength(1);
  });
});
