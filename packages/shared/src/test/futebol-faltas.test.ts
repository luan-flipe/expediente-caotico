import { describe, expect, it } from "vitest";
import { FUT, activeOutfield, applyCard, fieldFor, isPenaltyFoul, judgeTackle } from "../index";
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

  it("carrinho por trás é vermelho direto", () => {
    expect(judgeTackle(tackler, victimBack, farBall, "carrinho", false)).toEqual({ foul: true, card: "red" });
    // fronteira de 60 graus entre os facings
    const d = (deg: number) => mk({ id: "b", side: 1, z: 1, facing: (deg * Math.PI) / 180 });
    expect(judgeTackle(tackler, d(59), farBall, "carrinho", false).card).toBe("red");
    expect(judgeTackle(tackler, d(61), farBall, "carrinho", false).card).toBe("none");
  });

  it("carrinho em corrida é amarelo", () => {
    expect(judgeTackle(tackler, victimFront, farBall, "carrinho", true)).toEqual({ foul: true, card: "yellow" });
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
