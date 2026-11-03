import { describe, expect, it } from "vitest";
import { cargoDe, pickRival, pistaDoDia, TRACK_IDS } from "../index";

describe("pickRival", () => {
  const laps = [
    { id: "a", ms: 60000 },
    { id: "b", ms: 65000 },
    { id: "c", ms: 70000 },
    { id: "d", ms: 80000 },
  ];

  it("pega a volta logo à frente da minha", () => {
    expect(pickRival(laps, "d", 80000, 60000)).toBe("c");
  });

  it("não escolhe a minha conta nem o recordista", () => {
    expect(pickRival(laps, "b", 65000, 60000)).toBeNull();
    expect(pickRival(laps, "c", 70000, 60000)).toBe("b");
  });

  it("sem volta minha não há rival", () => {
    expect(pickRival(laps, null, null, 60000)).toBeNull();
  });

  it("quem já é o mais rápido não tem rival", () => {
    expect(pickRival(laps, "a", 60000, 60000)).toBeNull();
  });
});

describe("cargoDe", () => {
  it("sobe de cargo nos limites", () => {
    expect(cargoDe(0)).toBe("Estagiário");
    expect(cargoDe(1)).toBe("Assistente");
    expect(cargoDe(4)).toBe("Assistente");
    expect(cargoDe(5)).toBe("Analista");
    expect(cargoDe(100)).toBe("Diretor");
    expect(cargoDe(9999)).toBe("Diretor");
  });

  it("número torto vale zero", () => {
    expect(cargoDe(-3)).toBe("Estagiário");
    expect(cargoDe(Number.NaN)).toBe("Estagiário");
  });
});

describe("pistaDoDia", () => {
  it("muda à meia-noite de Brasília, não à de UTC", () => {
    const meiaNoiteBrasilia = Date.UTC(2026, 9, 30, 3, 0, 0);
    expect(pistaDoDia(meiaNoiteBrasilia - 1)).not.toBe(pistaDoDia(meiaNoiteBrasilia));
    expect(pistaDoDia(meiaNoiteBrasilia)).toBe(pistaDoDia(meiaNoiteBrasilia + 60_000));
  });

  it("gira por todas as pistas em dias seguidos", () => {
    const base = Date.UTC(2026, 9, 1, 12);
    const vistas = new Set(TRACK_IDS.map((_, i) => pistaDoDia(base + i * 86_400_000)));
    expect(vistas.size).toBe(TRACK_IDS.length);
  });

  it("aceita datas antes de 1970", () => {
    expect(TRACK_IDS).toContain(pistaDoDia(-5 * 86_400_000));
  });
});
