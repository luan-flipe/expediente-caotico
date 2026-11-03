import { describe, expect, it } from "vitest";
import {
  FUT,
  ballOut,
  botInput,
  fieldFor,
  keeperInput,
  keeperReach,
  resolveTouches,
  stepBall,
  stepPlayer,
} from "../index";
import { makeFutMatch } from "./futebol-helpers";
import type { Ball, BotLevel, FutInput, FutMatch, FutPlayer } from "../index";

const DT = 1000 / 30;
const field = fieldFor(2);

function mk(over: Partial<FutPlayer> = {}): FutPlayer {
  return {
    id: "p1", side: 0, role: "linha", x: 0, z: 0, vx: 0, vz: 0, facing: 0,
    chargeMs: 0, chargeKind: null, tackleMs: 0, downMs: 0, yellow: 0, sentOff: false, isBot: true,
    ...over,
  };
}
function ball(over: Partial<Ball> = {}): Ball {
  return { x: 0, y: FUT.ballRadius, z: 0, vx: 0, vy: 0, vz: 0, ownerId: null, lastTouch: null, prevTouch: null, ...over };
}
function match(players: FutPlayer[], b: Ball = ball(), seed = 7): FutMatch {
  return makeFutMatch(players, { field, ball: b, seed });
}

/** Dispara a bola de (x, z) rumo a (tx, tz) com a velocidade dada e vê se o goleiro 0 pega. */
function shoot(level: BotLevel, tz: number, speed = 20, from = -8): "defendeu" | "gol" {
  const gx = -field.halfL;
  const k = mk({ id: "ga", role: "goleiro", x: gx + 1.2, z: 0, isBot: true });
  const b = ball({ x: from, z: 0 });
  const dx = gx - b.x;
  const dz = tz - b.z;
  const len = Math.hypot(dx, dz);
  b.vx = (dx / len) * speed;
  b.vz = (dz / len) * speed;
  for (let i = 0; i < 90; i++) {
    stepPlayer(k, keeperInput(k, b, field, level), field, DT);
    if (Math.hypot(b.x - k.x, b.z - k.z) <= keeperReach(level) && b.y <= field.goalH) {
      return "defendeu";
    }
    stepBall(b, DT);
    const out = ballOut(b, field);
    if (out) {
      return out.kind === "gol" ? "gol" : "defendeu";
    }
  }
  return "defendeu";
}

describe("goleiro", () => {
  it("goleiro se posiciona entre bola e gol", () => {
    const gx = -field.halfL;
    const k = mk({ id: "ga", role: "goleiro", x: gx + 1, z: 0 });
    const b = ball({ x: -5, z: 6 });
    for (let i = 0; i < 90; i++) {
      stepPlayer(k, keeperInput(k, b, field, "normal"), field, DT);
    }
    // Na reta entre o centro do gol e a bola, entre os dois.
    expect(k.x).toBeGreaterThan(gx);
    expect(k.x).toBeLessThan(b.x);
    const t = (k.x - gx) / (b.x - gx);
    expect(k.z).toBeCloseTo(t * b.z, 0);
    expect(k.z).toBeGreaterThan(0);
  });

  it("goleiro difícil defende chute central de média força", () => {
    expect(shoot("hard", 0.4, 19)).toBe("defendeu");
  });

  it("goleiro fácil deixa passar chute no canto", () => {
    expect(shoot("easy", 1.8, 24, -14)).toBe("gol");
  });

  it("goleiro difícil e normal defendem o canto que o fácil deixa passar", () => {
    expect(shoot("hard", 1.8, 24, -14)).toBe("defendeu");
    expect(shoot("normal", 1.8, 24, -14)).toBe("defendeu");
  });

  it("goleiro sai do gol para bola solta e lenta dentro da área", () => {
    const gx = -field.halfL;
    const k = mk({ id: "ga", role: "goleiro", x: gx + 1, z: 0 });
    const b = ball({ x: gx + 5, z: 2 });
    const inp = keeperInput(k, b, field, "normal");
    expect(inp.mx).toBeGreaterThan(0);
    expect(inp.mz).toBeGreaterThan(0);
  });

  it("goleiro com a bola carrega e solta o passe para o companheiro mais livre", () => {
    const gx = -field.halfL;
    const k = mk({ id: "ga", role: "goleiro", x: gx + 1, z: 0 });
    const free = mk({ id: "a1", x: 6, z: -8 });
    const marked = mk({ id: "a2", x: 6, z: 8 });
    const foe = mk({ id: "b1", side: 1, x: 7, z: 8 });
    const players = [k, free, marked, foe];
    const b = ball({ ownerId: "ga", x: k.x + 0.5, z: 0 });
    k.holdMs = 3000;
    k.holdMs = 3000;
    const first = keeperInput(k, b, field, "normal", players);
    expect(first.pass).toBe("charge");
    k.chargeKind = "pass";
    k.chargeMs = FUT.chargeMaxMs;
    const last = keeperInput(k, b, field, "normal", players);
    expect(last.pass).toBe("release");
    expect(last.aim).toBeCloseTo(Math.atan2(free.x - k.x, free.z - k.z), 5);
  });
});

describe("bots de linha", () => {
  const level: BotLevel = "normal";

  it("bot mais perto vai na bola", () => {
    const near = mk({ id: "a1", x: 5, z: 0 });
    const far = mk({ id: "a2", x: 6, z: 8 });
    const m = match([near, far], ball({ x: 8, z: 0 }));
    const a = botInput(near, m, level);
    expect(a.mx).toBeGreaterThan(0.9);
    expect(Math.abs(a.mz)).toBeLessThan(0.1);
    // O mais longe guarda posição: mira o ponto da formação, não a bola.
    const b = botInput(far, m, level);
    expect(Math.abs(b.aim - Math.atan2(m.ball.x - far.x, m.ball.z - far.z))).toBeGreaterThan(0.2);
  });

  it("bot disputa de verdade: carrega, solta e a disputa acontece", () => {
    const bot = mk({ id: "a1", x: 0, z: 0 });
    const dono = mk({ id: "b1", side: 1, x: 0.6, z: 0, facing: -Math.PI / 2 });
    const b = ball({ x: 0.3, z: 0, ownerId: "b1" });
    const m = match([bot, dono], b);
    const eventos: string[] = [];
    for (let i = 0; i < 60; i++) {
      const ev = resolveTouches([bot, dono], b, new Map([["a1", botInput(bot, m, "normal")]]), 16);
      eventos.push(...ev.filter((e) => e.t === "steal").map((e) => e.id));
      if (eventos.length) break;
    }
    expect(eventos).toContain("a1");
  });

  it("bot com bola na área chuta", () => {
    const shooter = mk({ id: "a1", x: field.halfL - 4, z: 1 });
    const keeper = mk({ id: "gb", role: "goleiro", side: 1, x: field.halfL - 1, z: 0 });
    const m = match([shooter, keeper], ball({ ownerId: "a1", x: shooter.x + 0.5, z: shooter.z }));
    const first = botInput(shooter, m, level);
    expect(first.kick).toBe("charge");
    shooter.chargeKind = "kick";
    shooter.chargeMs = FUT.chargeMaxMs;
    const last = botInput(shooter, m, level);
    expect(last.kick).toBe("release");
    // Mira para o gol adversário (x positivo).
    expect(Math.sin(last.aim)).toBeGreaterThan(0.5);
  });

  it("bot com bola marcado passa para o companheiro livre", () => {
    const me = mk({ id: "a1", x: 0, z: 0 });
    const mate = mk({ id: "a2", x: 8, z: -6 });
    const foe = mk({ id: "b1", side: 1, x: 1.2, z: 0 });
    const m = match([me, mate, foe], ball({ ownerId: "a1", x: 0.5, z: 0 }));
    expect(botInput(me, m, level).pass).toBe("charge");
  });

  it("bot com bola fora da área conduz para o gol adversário", () => {
    const me = mk({ id: "a1", x: -5, z: 0 });
    const m = match([me], ball({ ownerId: "a1", x: -4.5, z: 0 }));
    const inp = botInput(me, m, level);
    expect(inp.mx).toBeGreaterThan(0.9);
    expect(inp.kick).toBe("none");
    expect(inp.pass).toBe("none");
  });

  it("é determinístico pela seed", () => {
    const run = (seed: number) => {
      const me = mk({ id: "a1", x: field.halfL - 4, z: 1 });
      const m = match([me], ball({ ownerId: "a1", x: me.x + 0.5, z: 1 }), seed);
      me.chargeKind = "kick";
      me.chargeMs = FUT.chargeMaxMs;
      return botInput(me, m, "easy").aim;
    };
    expect(run(3)).toBe(run(3));
  });

  it("time 1 ataca para x negativo", () => {
    const me = mk({ id: "b1", side: 1, x: 5, z: 0 });
    const m = match([me], ball({ ownerId: "b1", x: 4.5, z: 0 }));
    expect(botInput(me, m, level).mx).toBeLessThan(-0.9);
  });

  it("bot jogando tira a bola e chuta sem travar (simulação curta)", () => {
    const me = mk({ id: "a1", x: 0, z: 0 });
    const b = ball({ ownerId: "a1", x: 0.7, z: 0 });
    const keeper = mk({ id: "gb", role: "goleiro", side: 1, x: field.halfL - 1, z: 0 });
    const m = match([me, keeper], b);
    let shot = false;
    for (let i = 0; i < 600 && !shot; i++) {
      const inp = botInput(me, m, level);
      const inputs = new Map<string, FutInput>([[me.id, inp]]);
      stepPlayer(me, inp, field, DT);
      const ev = resolveTouches(m.players, b, inputs, DT, field);
      stepBall(b, DT);
      shot = ev.some((e) => e.t === "kick" && e.ok);
    }
    expect(shot).toBe(true);
  });
});
