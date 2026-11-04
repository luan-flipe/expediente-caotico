import { describe, expect, it } from "vitest";
import type { FutEvent, FutSnapshot } from "@ec/shared";
import { PHRASES, narrate, newNarra } from "./narracao";

type P = FutSnapshot["players"][number];
const pl = (id: string, name: string, side: 0 | 1, role: P["role"] = "linha"): P => ({
  id, name, side, role, x: 0, z: 0, vx: 0, vz: 0, facing: 0, sliding: false, down: false, yellow: 0, sentOff: false, isBot: false, connected: true,
});
const snap = (): FutSnapshot =>
  ({
    teams: [{ name: "Financeiro", kit: 0, color: 0 }, { name: "TI", kit: 0, color: 1 }],
    players: [pl("a", "Ana", 0), pl("b", "Beto", 1), pl("gk-1", "Goleiro", 1, "goleiro")],
  }) as unknown as FutSnapshot;
const rng = () => 0;

describe("narração em texto", () => {
  it("gol sempre narra, mesmo logo depois de outra fala", () => {
    const st = newNarra();
    const s = snap();
    expect(narrate(s, { type: "foul", id: "a" }, st, 1000, rng)).not.toBeNull();
    const gol = narrate(s, { type: "goal", side: 0, scorerId: "a", assistId: null, own: false }, st, 1500, rng);
    expect(gol).toContain("Ana");
  });

  it("falta repetida e eventos em rajada não poluem", () => {
    const st = newNarra();
    const s = snap();
    const evs: FutEvent[] = [{ type: "foul", id: "a" }, { type: "near", side: 0, post: false }, { type: "save", keeperId: "gk-1", side: 1 }, { type: "foul", id: "b" }];
    let said = 0;
    for (let i = 0; i < 40; i++) {
      for (const e of evs) {
        if (narrate(s, e, st, 1000 + i * 600, rng)) said++;
      }
    }
    // 40 rodadas em 24 s: bem menos falas que eventos (160)
    expect(said).toBeLessThanOrEqual(8);
    expect(said).toBeGreaterThan(0);
  });

  it("cartão amarelo e vermelho dizem coisas diferentes e citam o jogador", () => {
    const s = snap();
    const y = narrate(s, { type: "card", id: "b", card: "yellow" }, newNarra(), 0, rng);
    const r = narrate(s, { type: "card", id: "b", card: "red" }, newNarra(), 0, rng);
    expect(y).toContain("Beto");
    expect(r).toContain("Beto");
    expect(y).not.toBe(r);
  });

  it("defesa cita o time do goleiro; trave é diferente de quase", () => {
    const s = snap();
    expect(narrate(s, { type: "save", keeperId: "gk-1", side: 1 }, newNarra(), 0, rng)).toContain("TI");
    const trave = narrate(s, { type: "near", side: 0, post: true }, newNarra(), 0, rng);
    const quase = narrate(s, { type: "near", side: 0, post: false }, newNarra(), 0, rng);
    expect(trave).not.toBe(quase);
  });

  it("só pênalti cobrado narra a reposição; lateral e escanteio ficam em silêncio", () => {
    const s = snap();
    expect(narrate(s, { type: "restart", kind: "penalti" }, newNarra(), 0, rng)).not.toBeNull();
    expect(narrate(s, { type: "restart", kind: "lateral" }, newNarra(), 0, rng)).toBeNull();
  });

  it("nenhuma frase tem travessão", () => {
    for (const list of Object.values(PHRASES)) {
      for (const f of list) expect(f).not.toContain("—");
    }
  });
});
