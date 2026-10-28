import { describe, expect, it } from "vitest";
import { ABILITIES, ABILITY_IDS } from "../data/abilities";
import { DEFAULT_AVATAR, PRESETS, sanitizeAvatar } from "../data/avatar";
import { OFFICE_MAP } from "../data/map";
import { SYNERGIES } from "../data/synergies";
import { BALANCE } from "../data/balance";

function insideAnyBox(x: number, z: number, pad: number) {
  return OFFICE_MAP.boxes.some(
    (b) => Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad,
  );
}

describe("avatar", () => {
  it("limpa nome perigoso, valores fora da lista e campos que não existem mais", () => {
    const a = sanitizeAvatar({ skin: 999, hair: -3, shoes: 2, name: "<script>alert(1)</script>xxxxxxxx" });
    expect(Object.keys(a).sort()).toEqual(Object.keys(DEFAULT_AVATAR).sort());
    expect(a.skin).toBe(DEFAULT_AVATAR.skin);
    expect(a.hair).toBe(DEFAULT_AVATAR.hair);
    expect(a.name.length).toBeLessThanOrEqual(16);
    expect(a.name).not.toMatch(/[<>]/);
  });

  it("crachá salvo antes dos rostos fica com o rosto feliz", () => {
    expect(sanitizeAvatar({ skin: 2, eyes: 1 }).face).toBe(0);
    expect(sanitizeAvatar({ face: 4 }).face).toBe(4);
    expect(sanitizeAvatar({ face: 99 }).face).toBe(0);
  });

  it("cor da barba acompanha o cabelo quando não vem", () => {
    expect(sanitizeAvatar({ hairColor: 4 }).beardColor).toBe(4);
    expect(sanitizeAvatar({ hairColor: 4, beardColor: 6 }).beardColor).toBe(6);
  });

  it("aceita lixo total", () => {
    expect(() => sanitizeAvatar(null)).not.toThrow();
    expect(sanitizeAvatar("oi")).toEqual(DEFAULT_AVATAR);
  });

  it("funcionários prontos são estáveis sob sanitize", () => {
    expect(PRESETS.length).toBeGreaterThan(0);
    for (const p of PRESETS) expect(sanitizeAvatar(p.dna)).toEqual(p.dna);
  });
});

describe("mapa", () => {
  it("spawns e objetivos fora das caixas e dentro do mapa", () => {
    expect(OFFICE_MAP.spawns).toHaveLength(8);
    const pts = [...OFFICE_MAP.spawns, ...OFFICE_MAP.objectivePoints];
    for (const p of pts) {
      expect(insideAnyBox(p.x, p.z, BALANCE.playerRadius)).toBe(false);
      expect(Math.abs(p.x)).toBeLessThan(OFFICE_MAP.width / 2);
      expect(Math.abs(p.z)).toBeLessThan(OFFICE_MAP.depth / 2);
    }
  });
});

describe("habilidades e sinergias", () => {
  it("12 habilidades com ids únicos", () => {
    expect(ABILITY_IDS).toEqual(["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3", "D1", "D2", "D3"]);
    for (const id of ABILITY_IDS) expect(ABILITIES[id].id).toBe(id);
  });

  it("sinergias referenciam habilidades existentes", () => {
    expect(SYNERGIES).toHaveLength(4);
    for (const s of SYNERGIES) {
      for (const r of s.requires) expect(ABILITIES[r]).toBeDefined();
      expect(s.requires).toContain(s.target);
    }
  });
});
