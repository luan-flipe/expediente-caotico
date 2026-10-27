import { describe, expect, it } from "vitest";
import { ABILITIES, ABILITY_IDS } from "../data/abilities";
import { PRESETS, randomAvatar, sanitizeAvatar } from "../data/avatar";
import { OFFICE_MAP } from "../data/map";
import { SYNERGIES } from "../data/synergies";
import { BALANCE } from "../data/balance";
import { mulberry32 } from "../rng";

function insideAnyBox(x: number, z: number, pad: number) {
  return OFFICE_MAP.boxes.some(
    (b) => Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad,
  );
}

describe("avatar", () => {
  it("sanitiza valores fora da lista e nome perigoso", () => {
    const a = sanitizeAvatar({ skin: 999, hair: -3, name: "<script>alert(1)</script>xxxxxxxx" });
    expect(a.skin).toBeGreaterThanOrEqual(0);
    expect(a.skin).toBeLessThan(8);
    expect(a.hair).toBeGreaterThanOrEqual(0);
    expect(a.name.length).toBeLessThanOrEqual(16);
    expect(a.name).not.toMatch(/[<>]/);
  });

  it("aceita lixo total", () => {
    expect(() => sanitizeAvatar(null)).not.toThrow();
    expect(sanitizeAvatar("oi").name.length).toBeGreaterThan(0);
  });

  it("presets são estáveis sob sanitize", () => {
    expect(PRESETS).toHaveLength(12);
    expect(PRESETS[0].id).toBe("funcionario_01");
    for (const p of PRESETS) expect(sanitizeAvatar(p.dna)).toEqual(p.dna);
  });

  it("aleatório é válido", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 20; i++) {
      const a = randomAvatar(rng);
      expect(sanitizeAvatar(a)).toEqual(a);
    }
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
