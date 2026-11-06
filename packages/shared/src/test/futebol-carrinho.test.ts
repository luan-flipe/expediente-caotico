import { describe, expect, it } from "vitest";
import { FUT, fieldFor, stepFutebol } from "../index";
import type { FutInput, FutMatch, FutPlayer } from "../index";
import { makeFutMatch } from "./futebol-helpers";

const DT = 1000 / 30;
const YAW_X = Math.PI / 2; // facing que aponta para +x
function mk(over: Partial<FutPlayer> = {}): FutPlayer {
  return {
    id: "p1", side: 0, role: "linha", x: 0, z: 0, vx: 0, vz: 0, facing: 0,
    chargeMs: 0, chargeKind: null, tackleMs: 0, downMs: 0, yellow: 0, sentOff: false, isBot: false,
    ...over,
  };
}
const inp = (over: Partial<FutInput> = {}): FutInput => ({ mx: 0, mz: 0, aim: 0, sprint: false, kick: "none", pass: "none", ...over });

/** Time 0 ataca +x. A vítima (time 0) corre com a bola para +x; o carrinheiro (time 1) vem de trás ou de frente. */
function cenario(opts: { tacklerX: number; tacklerFacing: number; victimX?: number; ballOnVictim?: boolean; extraDefender?: boolean; sprint?: boolean }): { m: FutMatch; t: FutPlayer; v: FutPlayer } {
  const f = fieldFor(2);
  const vx0 = opts.victimX ?? 0;
  const v = mk({ id: "v", side: 0, x: vx0, z: 0, vx: FUT.walkSpeed, facing: YAW_X });
  const t = mk({ id: "t", side: 1, x: opts.tacklerX, z: 0, vx: opts.sprint ? FUT.sprintSpeed : FUT.walkSpeed, facing: opts.tacklerFacing });
  const players = [v, t];
  if (opts.extraDefender) {
    players.push(mk({ id: "d", side: 1, x: vx0 + 15, z: 4, facing: Math.PI * 1.5 }));
  }
  const m = makeFutMatch(players, { field: f, connected: players.map((p) => p.id) });
  m.ball.ownerId = opts.ballOnVictim === false ? null : "v";
  m.ball.x = vx0 + 0.55;
  m.ball.z = 0;
  return { m, t, v };
}

/** Carrega o chute do carrinheiro, solta, e devolve os eventos de falta e cartão. */
function tackleIt(m: FutMatch, dirX: 1 | -1, sprint: boolean): { fouls: number; cards: string[] } {
  const events: { type: string; card?: string }[] = [];
  const run = (t: FutInput) => {
    m.inputs.set("v", inp({ mx: 1 }));
    m.inputs.set("t", t);
    stepFutebol(m, DT);
    events.push(...m.events);
    m.events.length = 0;
  };
  for (let i = 0; i < 4; i++) {
    run(inp({ mx: dirX, sprint, kick: "charge" }));
  }
  run(inp({ mx: dirX, sprint, kick: "release" }));
  return { fouls: events.filter((e) => e.type === "foul").length, cards: events.filter((e) => e.type === "card").map((e) => e.card!) };
}

describe("carrinho na partida", () => {
  it("carrinho que desarma a bola antes do jogador é legal", () => {
    const { m, t } = cenario({ tacklerX: 3, tacklerFacing: -YAW_X, victimX: 0 });
    // a bola vem na frente do dono, do lado do carrinheiro: ele a alcança antes do jogador
    const r = tackleIt(m, -1, false);
    expect(r.fouls).toBe(0);
    expect(r.cards).toEqual([]);
    expect(t.sentOff).toBe(false);
  });

  it("carrinho que pega o jogador de frente é falta sem cartão", () => {
    const { m, t } = cenario({ tacklerX: 3, tacklerFacing: -YAW_X, victimX: 0, ballOnVictim: false });
    m.ball.x = 8;
    m.ball.z = 8;
    const r = tackleIt(m, -1, true);
    expect(r.fouls).toBe(1);
    expect(r.cards).toEqual([]);
    expect(t.sentOff).toBe(false);
  });

  it("carrinho por trás é amarelo e não expulsa", () => {
    const { m, t } = cenario({ tacklerX: -1.5, tacklerFacing: YAW_X, extraDefender: true });
    const r = tackleIt(m, 1, true);
    expect(r.fouls).toBe(1);
    expect(r.cards).toEqual(["yellow"]);
    expect(t.yellow).toBe(1);
    expect(t.sentOff).toBe(false);
  });

  it("vermelho só por trás, em corrida e no último homem", () => {
    const { m, t } = cenario({ tacklerX: fieldFor(2).halfL - 16.5, tacklerFacing: YAW_X, victimX: fieldFor(2).halfL - 15 });
    const r = tackleIt(m, 1, true);
    expect(r.cards).toEqual(["red"]);
    expect(t.sentOff).toBe(true);
  });
});
