import { describe, expect, it } from "vitest";
import type { FutSnapshot } from "@ec/shared";
import { pickedSide, penaltyAttackSide, penaltyHint, penaltyRound, penaltyRole, tagScale } from "./penaltyUi";

type P = FutSnapshot["players"][number];
const pl = (id: string, side: 0 | 1, extra: Partial<P> = {}): P => ({
  id, name: id, side, role: "linha", x: 0, z: 0, vx: 0, vz: 0, facing: 0, sliding: false, down: false, yellow: 0, sentOff: false, isBot: false, connected: true, ...extra,
});
function snap(over: Partial<FutSnapshot> = {}): FutSnapshot {
  return {
    t: 0, phase: "penalties", elapsedMs: 0, durationMs: 1, celebrateMs: 0, format: 2, score: [0, 0],
    pens: { goals: [0, 0], taken: [0, 0], takerId: "a1", keeperId: "gk-1", turn: 0, stage: "aim", sudden: false },
    teams: [{ name: "A", kit: 0, color: 0 }, { name: "B", kit: 0, color: 1 }],
    restart: null, ball: { x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, ownerId: null },
    players: [pl("a1", 0), pl("a2", 0, { isBot: true }), pl("b1", 1), pl("b2", 1), pl("gk-1", 1, { role: "goleiro", isBot: true })],
    events: [], ...over,
  };
}

describe("papel na cobrança de pênalti", () => {
  it("cobrador, piloto do goleiro (primeiro humano que defende) e quem assiste", () => {
    expect(penaltyRole(snap(), "a1")).toBe("taker");
    expect(penaltyRole(snap(), "b1")).toBe("keeper");
    expect(penaltyRole(snap(), "b2")).toBe("watch");
    expect(penaltyRole(snap(), "a2")).toBe("watch");
  });
  it("só instrui antes da batida", () => {
    const s = snap();
    s.pens!.stage = "flight";
    expect(penaltyRole(s, "a1")).toBeNull();
  });
  it("pênalti no jogo: só o cobrador", () => {
    const s = snap({ phase: "restart", pens: null, restart: { kind: "penalti", side: 0, x: 0, z: 0, takerId: "a1", leftMs: 5000 } });
    expect(penaltyRole(s, "a1")).toBe("taker");
    expect(penaltyRole(s, "b1")).toBeNull();
    expect(penaltyAttackSide(s)).toBe(0);
  });
});

describe("instrução e mira", () => {
  it("diz as teclas de quem cobra e de quem defende", () => {
    const k = { esquerda: "A", direita: "D", touch: false };
    expect(penaltyHint("taker", k)).toContain("Espaço");
    expect(penaltyHint("taker", k)).toContain("A e D escolhem o canto");
    expect(penaltyHint("keeper", k)).toContain("A ou D");
    expect(penaltyHint("watch", k)).toBeNull();
    expect(penaltyHint("taker", { ...k, touch: true })).toContain("joystick");
  });
  it("lado só vale com movimento firme", () => {
    expect(pickedSide(0.2)).toBe(0);
    expect(pickedSide(-1)).toBe(-1);
    expect(pickedSide(0.5)).toBe(1);
  });
  it("nome cresce com a distância dentro de limites", () => {
    expect(tagScale(2)).toBe(0.9);
    expect(tagScale(20)).toBe(2);
    expect(tagScale(200)).toBe(2.6);
  });
  it("conta a cobrança e a morte súbita", () => {
    expect(penaltyRound([0, 0], false)).toBe("Cobrança 1 de 5");
    expect(penaltyRound([2, 2], false)).toBe("Cobrança 3 de 5");
    expect(penaltyRound([5, 5], true)).toBe("Morte súbita");
  });
});
