import { describe, expect, it } from "vitest";
import { BALANCE } from "../data/balance";
import { applyOption, chooseEvolution, generateOptions, grantXp, xpToNext } from "../sim/progression";
import { stepMatch } from "../sim/match";
import { mulberry32 } from "../rng";
import { activeMatch, give } from "./helpers";

describe("evolução", () => {
  it("primeira escolha só oferece habilidades novas", () => {
    const { ps } = activeMatch(1);
    const opts = ps[0].options!;
    expect(opts).toHaveLength(3);
    expect(opts.every((o) => o.type === "unlock")).toBe(true);
    expect(new Set(opts.map((o) => o.abilityId)).size).toBe(3);
  });

  it("xp sobe nível e abre escolha", () => {
    const { m, ps } = activeMatch(1);
    const p = ps[0];
    give(p, "A2");
    grantXp(m, p, xpToNext(1) + 5);
    expect(p.level).toBe(2);
    expect(p.xp).toBe(5);
    expect(p.options).toHaveLength(3);
  });

  it("nunca oferece quarta habilidade nem nível acima de V", () => {
    const { ps } = activeMatch(1);
    const p = ps[0];
    give(p, "A1", 5, "A");
    give(p, "A2", 5, "B");
    give(p, "C1", 4, "A");
    const opts = generateOptions(p, mulberry32(1));
    expect(opts).toHaveLength(3);
    expect(opts.some((o) => o.type === "unlock")).toBe(false);
    expect(opts.filter((o) => o.type === "upgrade")).toHaveLength(1);
    expect(opts.find((o) => o.type === "upgrade")!.abilityId).toBe("C1");
  });

  it("nível II gera o par de especializações A e B", () => {
    const { ps } = activeMatch(1);
    const p = ps[0];
    give(p, "A1", 2);
    give(p, "A2", 5, "A");
    give(p, "A3", 5, "A");
    const opts = generateOptions(p, mulberry32(3));
    const specs = opts.filter((o) => o.type === "spec");
    expect(specs.map((o) => o.spec).sort()).toEqual(["A", "B"]);
  });

  it("especialização escolhida fica e upgrade seguinte mantém", () => {
    const { ps } = activeMatch(1);
    const p = ps[0];
    give(p, "A1", 2);
    expect(applyOption(p, { id: "s:A1:B", type: "spec", abilityId: "A1", spec: "B", title: "", desc: "" })).toBe(true);
    expect(p.abilities[0]).toMatchObject({ level: 3, spec: "B" });
    expect(applyOption(p, { id: "s:A1:A", type: "spec", abilityId: "A1", spec: "A", title: "", desc: "" })).toBe(false);
    expect(applyOption(p, { id: "up:A1:4", type: "upgrade", abilityId: "A1", title: "", desc: "" })).toBe(true);
    expect(p.abilities[0]).toMatchObject({ level: 4, spec: "B" });
  });

  it("escolha inexistente ou repetida é recusada", () => {
    const { m, ps } = activeMatch(1);
    const p = ps[0];
    const id = p.options![0].id;
    expect(chooseEvolution(m, "p0", "nao-existe")).toBe(false);
    expect(chooseEvolution(m, "p0", id)).toBe(true);
    expect(chooseEvolution(m, "p0", id)).toBe(false);
    expect(p.abilities).toHaveLength(1);
  });

  it("tempo esgotado aplica a primeira opção", () => {
    const { m, ps } = activeMatch(1);
    const first = ps[0].options![0];
    stepMatch(m, BALANCE.evolutionTimeoutMs + 50);
    expect(ps[0].options).toBeNull();
    expect(ps[0].abilities[0].id).toBe(first.abilityId);
    expect(m.events.some((e) => e.type === "info" && e.player === "p0")).toBe(true);
  });

  it("partida simulada com escolhas aleatórias nunca gera opção inválida", () => {
    const { m, ps } = activeMatch(1);
    const p = ps[0];
    const rng = mulberry32(99);
    for (let i = 0; i < 80; i++) {
      expect(p.options).not.toBeNull();
      const ids = p.options!.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      const pickIdx = Math.floor(rng() * p.options!.length);
      expect(chooseEvolution(m, p.id, p.options![pickIdx].id)).toBe(true);
      expect(p.abilities.length).toBeLessThanOrEqual(3);
      for (const a of p.abilities) {
        expect(a.level).toBeLessThanOrEqual(5);
        if (a.level >= 3) expect(a.spec).toBeDefined();
      }
      grantXp(m, p, xpToNext(p.level));
    }
    expect(p.abilities).toHaveLength(3);
    expect(p.abilities.every((a) => a.level === 5)).toBe(true);
  });
});
