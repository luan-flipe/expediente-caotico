import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "../data/avatar";
import { FUT, applyCard, assistShot, createFutebol, fieldFor, judgeShove, keepClear, mulberry32, repeatCard, resolveTouches, startRestart, stepBall, stepFutebol } from "../index";
import type { Ball, FutInput, FutMatch, FutPlayer } from "../index";

const DT = 1000 / 30;
const TEAMS: [{ name: string; kit: number; color: number }, { name: string; kit: number; color: number }] = [
  { name: "A", kit: 0, color: 0 },
  { name: "B", kit: 1, color: 1 },
];

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
const inp = (over: Partial<FutInput> = {}): FutInput => ({ mx: 0, mz: 0, aim: 0, sprint: false, kick: "none", pass: "none", ...over });

function bots(format: 3 | 4, seed = 4, humans: { id: string; side: 0 | 1 }[] = []): FutMatch {
  const players = humans.map((h) => ({ id: h.id, name: h.id, avatar: DEFAULT_AVATAR, side: h.side, isBot: false, accountId: null }));
  const m = createFutebol({ seed, format, durationMs: 180000, botLevel: "normal", players, teams: TEAMS });
  m.phase = "play";
  m.restart = null;
  return m;
}

describe("trancos, reincidência e cartões", () => {
  const a = mk({ id: "a" });
  const front = mk({ id: "b", side: 1, z: 1, facing: Math.PI });
  const back = mk({ id: "b", side: 1, z: 1, facing: 0 });

  it("disputa suave não é falta, tranco forte é; por trás é amarelo", () => {
    expect(judgeShove(a, front, false)).toEqual({ foul: false, card: "none" });
    expect(judgeShove(a, front, true)).toEqual({ foul: true, card: "none" });
    expect(judgeShove(a, back, true)).toEqual({ foul: true, card: "yellow" });
  });

  it("a disputa de frente em velocidade vira tranco forte (hard) e a lenta não", () => {
    const steal = (tv: number, ov: number) => {
      const t = mk({ id: "t", x: 0, z: 0, vz: tv });
      const owner = mk({ id: "o", side: 1, x: 0, z: 0.6, vz: ov, facing: Math.PI });
      t.chargeKind = "pass";
      t.chargeMs = 50;
      const ev = resolveTouches([t, owner], ball({ ownerId: "o", z: 0.6 }), new Map([["t", inp({ pass: "release" })]]), 16);
      return ev.find((e) => e.t === "steal");
    };
    expect(steal(FUT.walkSpeed, -FUT.walkSpeed)?.hard).toBe(true);
    expect(steal(0.5, 0.4)?.hard).toBeUndefined();
  });

  it("a cada três faltas sem cartão vem o amarelo; dois amarelos expulsam", () => {
    const p = mk();
    const cards = [1, 2, 3, 4, 5, 6].map(() => repeatCard(p, "none"));
    expect(cards).toEqual(["none", "none", "yellow", "none", "none", "yellow"]);
    const q = mk();
    applyCard(q, "yellow");
    applyCard(q, "yellow");
    expect(q.sentOff).toBe(true);
    // quem já leva cartão pela falta não ganha outro de reincidência
    expect(repeatCard(mk({ fouls: 2 }), "red")).toBe("red");
  });
});

describe("cobrança de falta: barreira", () => {
  it("bots do time que defende formam a barreira a ~9 m, na linha bola-gol", () => {
    const m = bots(3);
    const f = m.field;
    const x = f.halfL - 22;
    startRestart(m, "falta", 0, x, 4);
    const wall = m.restart!.wall!;
    expect(wall).toHaveLength(2);
    for (const id of wall) {
      const p = m.players.find((q) => q.id === id)!;
      expect(p.side).toBe(1);
      expect(Math.hypot(p.x - x, p.z - 4)).toBeGreaterThan(8.2);
      expect(Math.hypot(p.x - x, p.z - 4)).toBeLessThan(9.8);
      // do lado do gol que o time 0 ataca, de frente para a bola
      expect(p.x).toBeGreaterThan(x);
      expect(Math.abs(p.facing - Math.atan2(x - p.x, 4 - p.z))).toBeLessThan(1e-6);
    }
  });

  it("longe do gol não há barreira, mas os adversários ficam a 9 m", () => {
    const m = bots(3);
    startRestart(m, "falta", 0, -15, 0);
    expect(m.restart!.wall).toEqual([]);
    const foe = m.players.find((p) => p.side === 1 && p.role === "linha")!;
    foe.x = -12;
    foe.z = 0;
    stepFutebol(m, DT);
    expect(Math.hypot(foe.x + 15, foe.z)).toBeGreaterThanOrEqual(FUT.wallDist - 0.2);
  });

  it("defensor humano não vira barreira mas é afastado; companheiro do cobrador fica a 4 m", () => {
    const m = bots(3, 4, [{ id: "h", side: 1 }]);
    const x = m.field.halfL - 20;
    startRestart(m, "falta", 0, x, 0);
    expect(m.restart!.wall).not.toContain("h");
    const h = m.players.find((p) => p.id === "h")!;
    h.x = x + 2;
    h.z = 0;
    stepFutebol(m, DT);
    expect(Math.hypot(h.x - x, h.z)).toBeGreaterThanOrEqual(FUT.wallDist - 0.2);
    const mate = m.players.find((p) => p.side === 0 && p.role === "linha" && p.id !== m.restart!.takerId)!;
    mate.x = x + 1;
    mate.z = 0;
    stepFutebol(m, DT);
    expect(Math.hypot(mate.x - x, mate.z)).toBeGreaterThanOrEqual(3.9);
    expect(Math.hypot(mate.x - x, mate.z)).toBeLessThan(FUT.wallDist - 1);
  });

  it("keepClear não mexe no cobrador nem na barreira", () => {
    const r = { kind: "falta" as const, side: 0 as const, takerId: "t", wall: ["w"], x: 0, z: 0 };
    const t = { id: "t", side: 0 as const, x: 0.5, z: 0 };
    const w = { id: "w", side: 1 as const, x: 5, z: 0 };
    const o = { id: "o", side: 1 as const, x: 5, z: 0 };
    keepClear(t, r);
    keepClear(w, r);
    keepClear(o, r);
    expect(t.x).toBe(0.5);
    expect(w.x).toBe(5);
    expect(o.x).toBeCloseTo(FUT.wallDist - 0.1, 5);
  });
});

describe("cobrança de falta: assistência", () => {
  const field = fieldFor(3);

  /** Bola parada no ponto, cobrador com a assistência de falta mirando o lado `aimZ` do gol. */
  function plan(x: number, z: number, aimZ: number, power: number, seed = 1) {
    const p = mk({ x, z });
    const b = ball({ x, z });
    const aim = Math.atan2(field.halfL - x, aimZ - z);
    const help = assistShot(p, inp({ aim }), power, b, field, [p], mulberry32(seed), true);
    return { help, b };
  }

  /** Solta a bola com o que a assistência planejou e voa até a linha do gol, anotando a altura na barreira. */
  function fly(b: Ball, help: NonNullable<ReturnType<typeof assistShot>>, wallAt: number, x0: number, z0: number) {
    b.vx = Math.sin(help.yaw) * help.speed!;
    b.vz = Math.cos(help.yaw) * help.speed!;
    b.vy = help.vy;
    b.curve = help.curve;
    let wallY = -1;
    for (let i = 0; i < 200; i++) {
      stepBall(b, DT);
      if (wallY < 0 && Math.hypot(b.x - x0, b.z - z0) >= wallAt) {
        wallY = b.y;
      }
      if (b.x >= field.halfL + FUT.ballRadius) {
        return { z: b.z, y: b.y, wallY };
      }
    }
    return null;
  }

  it("passa a barreira por cima, faz a curva e cruza a linha dentro do gol", () => {
    let entered = 0;
    let n = 0;
    for (const [x, z] of [[field.halfL - 22, 3], [field.halfL - 20, -4], [field.halfL - 26, 0], [field.halfL - 18, 6]] as const) {
      for (const aimZ of [-1.6, 1.6]) {
        for (const power of [0.7, 1]) {
          const { help, b } = plan(x, z, aimZ, power);
          expect(help).not.toBeNull();
          expect(help!.speed, JSON.stringify({ x, z, aimZ, power })).toBeDefined();
          expect(help!.curve).not.toBe(0);
          const wd = Math.min(FUT.wallDist, Math.hypot(field.halfL - x, z) * 0.6);
          const r = fly(b, help!, wd, x, z);
          expect(r).not.toBeNull();
          n++;
          expect(r!.wallY).toBeGreaterThan(FUT.wallClear - 0.5);
          if (Math.abs(r!.z) < field.goalHalfW && r!.y < field.goalH) {
            entered++;
          }
        }
      }
    }
    expect(entered / n).toBeGreaterThan(0.8);
  });

  it("o canto escolhido pela mira vale: esquerda e direita da cobrança", () => {
    const x = field.halfL - 22;
    const l = plan(x, 0, -1.6, 1);
    const r = plan(x, 0, 1.6, 1);
    const zl = fly(l.b, l.help!, 9, x, 0)!.z;
    const zr = fly(r.b, r.help!, 9, x, 0)!.z;
    expect(zl).toBeLessThan(-0.6);
    expect(zr).toBeGreaterThan(0.6);
  });

  it("bot cobra a falta ao alcance do gol com um chute com curva e altura", () => {
    const m = bots(3, 11);
    const x = m.field.halfL - 22;
    startRestart(m, "falta", 0, x, 2);
    const taker = m.players.find((p) => p.id === m.restart!.takerId)!;
    expect(taker.isBot).toBe(true);
    let t = 0;
    for (; t < 4000 && m.restart !== null; t += DT) {
      stepFutebol(m, DT);
    }
    // saiu bem antes dos 8 s de espera: foi o bot que cobrou
    expect(m.restart).toBeNull();
    expect(t).toBeLessThan(2000);
    expect(m.ball.vx).toBeGreaterThan(5);
    expect(m.ball.vy).toBeGreaterThan(3);
    expect(Math.abs(m.ball.curve ?? 0)).toBeGreaterThan(0);
  });
});
