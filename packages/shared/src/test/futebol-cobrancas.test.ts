import { describe, expect, it } from "vitest";
import { FUT, fieldFor, pushAway, restartBlocks, restartForOut, startRestart, stepRestart } from "../index";
import { makeFutMatch } from "./futebol-helpers";
import type { Ball, FutMatch, FutPlayer } from "../index";

function mk(over: Partial<FutPlayer> = {}): FutPlayer {
  return {
    id: "p1", side: 0, role: "linha", x: 0, z: 0, vx: 0, vz: 0, facing: 0,
    chargeMs: 0, chargeKind: null, tackleMs: 0, downMs: 0, yellow: 0, sentOff: false, isBot: false,
    ...over,
  };
}
function ball(over: Partial<Ball> = {}): Ball {
  return { x: 0, y: FUT.ballRadius, z: 0, vx: 0, vy: 0, vz: 0, ownerId: null, lastTouch: null, prevTouch: null, ...over };
}
function match(players: FutPlayer[], connected: string[] = []): FutMatch {
  return makeFutMatch(players, { ball: ball(), connected });
}

const team = () => [
  mk({ id: "a1", side: 0, x: -5, z: 8 }),
  mk({ id: "a2", side: 0, x: -10, z: -5 }),
  mk({ id: "ga", side: 0, role: "goleiro", x: -19, z: 0 }),
  mk({ id: "b1", side: 1, x: 5, z: 8 }),
  mk({ id: "b2", side: 1, x: 12, z: -5 }),
  mk({ id: "gb", side: 1, role: "goleiro", x: 19, z: 0 }),
];

describe("cobranças", () => {
  it("saída lateral escolhe o mais perto do time certo", () => {
    const m = match(team());
    const out = restartForOut(ball({ x: -4, z: 13.3, lastTouch: { id: "a1", side: 0 } }), m.field);
    expect(out).toMatchObject({ kind: "lateral", side: 1, z: 13 });
    startRestart(m, out!.kind, out!.side, out!.x, out!.z);
    expect(m.restart?.takerId).toBe("b1");
    expect(m.restart?.leftMs).toBe(FUT.restartWaitMs);
  });

  it("tiro de meta é do goleiro", () => {
    const m = match(team());
    startRestart(m, "meta", 0, -19, 0);
    expect(m.restart?.takerId).toBe("ga");
  });

  it("escanteio quando o defensor toca por último", () => {
    const f = fieldFor(2);
    const out = restartForOut(ball({ x: -f.halfL - 1, z: 5, lastTouch: { id: "a2", side: 0 } }), f);
    expect(out).toMatchObject({ kind: "escanteio", side: 1, x: -f.halfL, z: f.halfW });
    const meta = restartForOut(ball({ x: -f.halfL - 1, z: 5, lastTouch: { id: "b1", side: 1 } }), f);
    expect(meta).toMatchObject({ kind: "meta", side: 0 });
  });

  it("só o cobrador toca na bola", () => {
    const m = match(team());
    startRestart(m, "lateral", 1, 5, 13);
    expect(restartBlocks(m, "b1")).toBe(false);
    expect(restartBlocks(m, "a1")).toBe(true);
    expect(restartBlocks(m, "b2")).toBe(true);
    m.restart = null;
    expect(restartBlocks(m, "a1")).toBe(false);
  });

  it("os outros ficam a 4 m", () => {
    const m = match(team());
    m.players.find((p) => p.id === "a1")!.x = 4.5;
    m.players.find((p) => p.id === "a1")!.z = 12;
    startRestart(m, "lateral", 1, 5, 13);
    pushAway(m);
    for (const p of m.players) {
      if (p.id !== "b1") expect(Math.hypot(p.x - 5, p.z - 13)).toBeGreaterThanOrEqual(4 - 1e-9);
    }
  });

  it("8 s sem cobrar: IA cobra", () => {
    const m = match(team(), ["b1"]);
    startRestart(m, "lateral", 1, 5, 13);
    stepRestart(m, 7900);
    expect(m.restart).not.toBeNull();
    expect(Math.hypot(m.ball.vx, m.ball.vz)).toBe(0);
    stepRestart(m, 200);
    expect(m.restart).toBeNull();
    expect(Math.hypot(m.ball.vx, m.ball.vz)).toBeGreaterThan(0);
    expect(m.ball.lastTouch?.id).toBe("b1");
    // passe vai para b2 (mais livre: b1 é o cobrador, único companheiro)
    expect(m.ball.vx).toBeGreaterThan(0);
  });

  it("cobrador que caiu da sala: IA cobra no fim do tempo", () => {
    const m = match(team(), []); // b1 humano e fora de connected
    startRestart(m, "falta", 1, 2, 3);
    stepRestart(m, FUT.restartWaitMs);
    expect(m.restart).toBeNull();
    expect(Math.hypot(m.ball.vx, m.ball.vz)).toBeGreaterThan(0);
  });

  it("passa para o companheiro mais livre", () => {
    const ps = [
      mk({ id: "t", side: 0, x: 0, z: 0 }),
      mk({ id: "marcado", side: 0, x: 10, z: 0 }),
      mk({ id: "livre", side: 0, x: 0, z: 10 }),
      mk({ id: "adv", side: 1, x: 11, z: 0 }),
    ];
    const m = match(ps);
    startRestart(m, "falta", 0, 0, 0);
    stepRestart(m, FUT.restartWaitMs);
    expect(m.ball.vz).toBeGreaterThan(Math.abs(m.ball.vx));
  });
});
