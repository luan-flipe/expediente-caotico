import { describe, expect, it } from "vitest";
import { FUT, activeOutfield, applyCard, fieldFor, isLastMan, isPenaltyFoul, judgeTackle } from "../index";
import type { Ball, FutPlayer } from "../index";

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

describe("faltas e cartões", () => {
  const tackler = mk({ id: "a", side: 0, x: 0, z: 0 });
  // vítima de frente para o carrinheiro (facing aponta para -z, carrinheiro em z=0 e vítima em z=1)
  const victimFront = mk({ id: "b", side: 1, x: 0, z: 1, facing: Math.PI });
  const victimBack = mk({ id: "b", side: 1, x: 0, z: 1, facing: 0 });
  const farBall = ball({ x: 5, z: 5 });

  it("carrinho que toca a bola primeiro é limpo", () => {
    expect(judgeTackle(tackler, victimBack, ball({ x: 0.3, z: 0.2 }), "carrinho", true)).toEqual({ foul: false, card: "none" });
    expect(judgeTackle(tackler, victimBack, farBall, "carrinho", true, true)).toEqual({ foul: false, card: "none" });
  });

  it("carrinho sem bola é falta", () => {
    const r = judgeTackle(tackler, victimFront, farBall, "carrinho", false);
    expect(r.foul).toBe(true);
    expect(r.card).toBe("none");
    expect(judgeTackle(tackler, victimFront, ball({ x: 0.7 }), "carrinho", false).foul).toBe(true);
    expect(judgeTackle(tackler, victimFront, ball({ x: 0.5 }), "carrinho", false, false).foul).toBe(true);
  });

  it("carrinho que pega o jogador de frente ou de lado é falta sem cartão, mesmo em corrida", () => {
    expect(judgeTackle(tackler, victimFront, farBall, "carrinho", true)).toEqual({ foul: true, card: "none" });
  });

  it("carrinho por trás é amarelo, não vermelho", () => {
    expect(judgeTackle(tackler, victimBack, farBall, "carrinho", false)).toEqual({ foul: true, card: "yellow" });
    // em corrida, mas sem ser o último homem, continua amarelo
    expect(judgeTackle(tackler, victimBack, farBall, "carrinho", true)).toEqual({ foul: true, card: "yellow" });
    // fronteira de 60 graus entre os facings
    const d = (deg: number) => mk({ id: "b", side: 1, z: 1, facing: (deg * Math.PI) / 180 });
    expect(judgeTackle(tackler, d(59), farBall, "carrinho", false).card).toBe("yellow");
    expect(judgeTackle(tackler, d(61), farBall, "carrinho", false).card).toBe("none");
  });

  it("vermelho só por trás, em corrida e no último homem (raro)", () => {
    expect(judgeTackle(tackler, victimBack, farBall, "carrinho", true, undefined, true)).toEqual({ foul: true, card: "red" });
    // último homem sem corrida, ou de frente, não expulsa
    expect(judgeTackle(tackler, victimBack, farBall, "carrinho", false, undefined, true).card).toBe("yellow");
    expect(judgeTackle(tackler, victimFront, farBall, "carrinho", true, undefined, true).card).toBe("none");
    // bola primeiro continua limpo
    expect(judgeTackle(tackler, victimBack, farBall, "carrinho", true, true, true)).toEqual({ foul: false, card: "none" });
  });

  it("último homem: dono da bola no campo de ataque sem outro defensor entre ele e o gol", () => {
    const f = fieldFor(2);
    const victim = mk({ id: "v", side: 0, x: f.halfL - 20, z: 0 });
    const tk = mk({ id: "t", side: 1, x: f.halfL - 22, z: 0 });
    const gk = mk({ id: "gk", side: 1, role: "goleiro", x: f.halfL - 1, z: 0 });
    const withBall = ball({ ownerId: "v" });
    expect(isLastMan(victim, tk, [victim, tk, gk], withBall)).toBe(true);
    // o carrinheiro, mesmo à frente da vítima depois do deslize, não conta
    const slid = mk({ id: "t", side: 1, x: victim.x + 0.2, z: 0 });
    expect(isLastMan(victim, slid, [victim, slid, gk], withBall)).toBe(true);
    // outro defensor entre ele e o gol: não é último homem
    const cover = mk({ id: "c", side: 1, x: f.halfL - 10, z: 3 });
    expect(isLastMan(victim, tk, [victim, tk, gk, cover], withBall)).toBe(false);
    // sem a bola, ou longe do gol, não é
    expect(isLastMan(victim, tk, [victim, tk, gk], ball({ ownerId: null }))).toBe(false);
    const far = mk({ id: "v", side: 0, x: -5, z: 0 });
    expect(isLastMan(far, tk, [far, tk, gk], withBall)).toBe(false);
  });

  it("disputa em pé é só falta", () => {
    expect(judgeTackle(tackler, victimBack, farBall, "disputa", true)).toEqual({ foul: true, card: "none" });
  });

  it("segundo amarelo vira vermelho", () => {
    const p = mk();
    applyCard(p, "yellow");
    expect(p.yellow).toBe(1);
    expect(p.sentOff).toBe(false);
    applyCard(p, "yellow");
    expect(p.sentOff).toBe(true);
    const q = mk({ id: "q" });
    applyCard(q, "none");
    expect(q.yellow).toBe(0);
  });

  it("falta na área vira pênalti", () => {
    const f = fieldFor(2);
    // time 0 ataca +x: área do gol em x positivo
    expect(isPenaltyFoul(mk({ side: 0, x: f.halfL - 1, z: 0 }), f)).toBe(true);
    expect(isPenaltyFoul(mk({ side: 0, x: f.halfL - f.boxL - 0.5, z: 0 }), f)).toBe(false);
    expect(isPenaltyFoul(mk({ side: 0, x: f.halfL - 1, z: f.boxHalfW + 0.5 }), f)).toBe(false);
    // área do próprio time (x negativo) não é pênalti
    expect(isPenaltyFoul(mk({ side: 0, x: -f.halfL + 1, z: 0 }), f)).toBe(false);
    // time 1 ataca -x
    expect(isPenaltyFoul(mk({ side: 1, x: -f.halfL + 1, z: 0 }), f)).toBe(true);
  });

  it("vermelho no último de linha deixa o time só com goleiro", () => {
    const gk = mk({ id: "gk", role: "goleiro" });
    const last = mk({ id: "l1" });
    const other = mk({ id: "o1", side: 1 });
    const all = [gk, last, other];
    expect(activeOutfield(all, 0).map((p) => p.id)).toEqual(["l1"]);
    applyCard(last, "red");
    expect(last.sentOff).toBe(true);
    expect(activeOutfield(all, 0)).toEqual([]);
    expect(activeOutfield(all, 1).map((p) => p.id)).toEqual(["o1"]);
  });
});
