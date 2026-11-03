import { describe, expect, it } from "vitest";
import { FUT, fieldFor, resolveTouches, stepPlayer } from "../index";
import type { Ball, FutInput, FutPlayer } from "../index";

const field = fieldFor(4);
const DT = 1000 / 30;

function mk(over: Partial<FutPlayer> = {}): FutPlayer {
  return {
    id: "p1", side: 0, role: "linha", x: 0, z: 0, vx: 0, vz: 0, facing: 0,
    chargeMs: 0, chargeKind: null, tackleMs: 0, downMs: 0, yellow: 0, sentOff: false, isBot: false,
    ...over,
  };
}
const inp = (over: Partial<FutInput> = {}): FutInput => ({ mx: 0, mz: 0, aim: 0, sprint: false, kick: "none", pass: "none", ...over });
const speed = (p: FutPlayer): number => Math.hypot(p.vx, p.vz);

/** Roda com a entrada e devolve o tempo (ms) até a velocidade passar de `v`, ou -1. */
function timeTo(p: FutPlayer, input: FutInput, v: number, maxMs = 3000): number {
  for (let t = DT; t <= maxMs; t += DT) {
    stepPlayer(p, input, field, DT);
    if (speed(p) >= v) {
      return t;
    }
  }
  return -1;
}

describe("inércia do jogador", () => {
  it("do parado ao máximo de andar em 0,35 a 0,5 s", () => {
    const t = timeTo(mk(), inp({ mx: 1 }), FUT.walkSpeed * 0.999);
    expect(t).toBeGreaterThanOrEqual(350);
    expect(t).toBeLessThanOrEqual(520);
  });

  it("do parado ao máximo de corrida em 0,8 a 1,0 s", () => {
    const t = timeTo(mk(), inp({ mx: 1, sprint: true }), FUT.sprintSpeed * 0.999);
    expect(t).toBeGreaterThanOrEqual(800);
    expect(t).toBeLessThanOrEqual(1050);
  });

  it("frear leva de 0,25 a 0,35 s", () => {
    const p = mk({ vx: FUT.walkSpeed });
    let t = 0;
    while (speed(p) > 0.01 && t < 2000) {
      stepPlayer(p, inp(), field, DT);
      t += DT;
    }
    expect(t).toBeGreaterThanOrEqual(230);
    expect(t).toBeLessThanOrEqual(400);
  });

  it("giro de 180° correndo perde velocidade antes de reacelerar", () => {
    const p = mk({ vx: FUT.sprintSpeed });
    let min = Infinity;
    for (let t = 0; t < 1000; t += DT) {
      stepPlayer(p, inp({ mx: -1, sprint: true }), field, DT);
      min = Math.min(min, speed(p));
    }
    expect(min).toBeLessThan(1);
    // e depois de um tempo já vai na nova direção
    expect(p.vx).toBeLessThan(-3);
  });

  it("giro de 90° andando mantém parte da velocidade (não zera)", () => {
    const p = mk({ vx: FUT.walkSpeed });
    stepPlayer(p, inp({ mz: 1 }), field, DT);
    expect(speed(p)).toBeGreaterThan(3);
    expect(p.vx).toBeLessThan(FUT.walkSpeed);
  });

  it("conduzindo a bola acelera menos", () => {
    const livre = mk();
    const com = mk({ carry: true });
    expect(timeTo(com, inp({ mx: 1 }), FUT.walkSpeed * 0.999)).toBeGreaterThan(timeTo(livre, inp({ mx: 1 }), FUT.walkSpeed * 0.999));
  });

  it("o goleiro é um pouco mais ágil", () => {
    const k = mk({ role: "goleiro" });
    expect(timeTo(k, inp({ mx: 1 }), FUT.walkSpeed * 0.999)).toBeLessThan(timeTo(mk(), inp({ mx: 1 }), FUT.walkSpeed * 0.999));
  });

  it("quem toma a bola abre pelo menos 1,5 m de quem perdeu no primeiro segundo", () => {
    const dono = mk({ id: "d", side: 1, x: 0, z: 0, vx: -2, facing: -Math.PI / 2 });
    const ladrao = mk({ id: "l", side: 0, x: 0.5, z: 0.3, vx: 0, facing: 0 });
    const ball: Ball = { x: -0.2, y: FUT.ballRadius, z: 0, vx: 0, vz: 0, vy: 0, ownerId: "d", lastTouch: { id: "d", side: 1 }, prevTouch: null };
    const players = [dono, ladrao];
    const chase = (p: FutPlayer, to: FutPlayer): FutInput => {
      const d = Math.hypot(to.x - p.x, to.z - p.z) || 1;
      return inp({ mx: (to.x - p.x) / d, mz: (to.z - p.z) / d });
    };
    let stolen = false;
    let d0 = 0;
    let dEnd = 0;
    for (let t = 0; t < 2000; t += DT) {
      const away = inp({ mx: 1, mz: 0 });
      const ia = stolen ? away : inp({ pass: t < 3 * DT ? "charge" : "release" });
      const id = stolen ? chase(dono, ladrao) : inp();
      ladrao.carry = ball.ownerId === "l";
      dono.carry = ball.ownerId === "d";
      stepPlayer(ladrao, ia, field, DT);
      stepPlayer(dono, id, field, DT);
      const ev = resolveTouches(players, ball, new Map([["l", ia], ["d", id]]), DT, field);
      if (!stolen && ev.some((e) => e.t === "steal" && e.ok)) {
        stolen = true;
        d0 = Math.hypot(ladrao.x - dono.x, ladrao.z - dono.z);
        dEnd = -t;
      }
      if (stolen && t + dEnd >= 1000) {
        const d1 = Math.hypot(ladrao.x - dono.x, ladrao.z - dono.z);
        expect(d1 - d0).toBeGreaterThanOrEqual(1.5);
        return;
      }
    }
    expect(stolen).toBe(true);
  });
});
