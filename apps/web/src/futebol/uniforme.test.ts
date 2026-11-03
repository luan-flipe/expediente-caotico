import { describe, expect, it } from "vitest";
import { CLOTH_COLORS, DEFAULT_AVATAR, FUT_COLORS, FUT_KITS, type AvatarDNA } from "@ec/shared";
import { keeperColors, refereeColor, uniformDNA } from "./uniforme";

const avatar: AvatarDNA = { ...DEFAULT_AVATAR, name: "Zeca", skin: 4, hair: 3, hairColor: 5, eyes: 2, face: 3, beard: 1, glasses: 2, height: 2, shoes: 3, shoesColor: 4, accessory: 2, top: 6, bottom: 3, shirt: 5, shirtColor: 7, pants: 2, pantsColor: 3 };

describe("uniformDNA", () => {
  it("mantém rosto e cabelo", () => {
    const u = uniformDNA(avatar, { name: "Time", kit: 1, color: 2 });
    for (const k of ["name", "model", "skin", "hair", "hairColor", "eyes", "face", "beard", "beardColor", "glasses", "shoes", "shoesColor", "height"] as const) {
      expect(u[k]).toBe(avatar[k]);
    }
  });

  it("troca a roupa pela do time", () => {
    const u = uniformDNA(avatar, { name: "Time", kit: 0, color: 1 });
    expect(u.shirt).not.toBe(avatar.shirt);
    expect(u.shirt).toBeGreaterThan(0);
    expect(u.pants).toBeGreaterThan(0);
    expect(u.top).toBeLessThan(6);
    expect(u.accessory).not.toBe(avatar.accessory);
    expect(CLOTH_COLORS[u.shirtColor - 1]).toBeDefined();
    expect(CLOTH_COLORS[u.pantsColor - 1]).toBeDefined();
  });

  it("dois times diferentes geram camisas diferentes", () => {
    const seen = new Set<string>();
    for (let kit = 0; kit < FUT_KITS.length; kit++) {
      for (let color = 0; color < FUT_COLORS.length; color++) {
        const u = uniformDNA(avatar, { name: "T", kit, color });
        seen.add(`${u.shirt}:${u.shirtColor}`);
      }
    }
    // cores distintas em cada modelo
    for (let kit = 0; kit < FUT_KITS.length; kit++) {
      const cores = new Set(FUT_COLORS.map((_, color) => uniformDNA(avatar, { name: "T", kit, color }).shirtColor));
      expect(cores.size).toBe(FUT_COLORS.length);
    }
    const a = uniformDNA(avatar, { name: "A", kit: 0, color: 0 });
    const b = uniformDNA(avatar, { name: "B", kit: 0, color: 1 });
    expect([a.shirt, a.shirtColor]).not.toEqual([b.shirt, b.shirtColor]);
    expect(seen.size).toBeGreaterThan(FUT_COLORS.length);
  });

  it("a cor da camisa tem o mesmo hex da cor do time", () => {
    FUT_COLORS.forEach((c, color) => {
      expect(CLOTH_COLORS[uniformDNA(avatar, { name: "T", kit: 0, color }).shirtColor - 1]).toBe(c.hex);
    });
  });

  it("o juiz veste uma cor que não é de time nem de goleiro", () => {
    const t = (color: number) => ({ name: "T", kit: 0, color });
    for (let a = 0; a < FUT_COLORS.length; a++) {
      for (let b = 0; b < FUT_COLORS.length; b++) {
        const teams: [ReturnType<typeof t>, ReturnType<typeof t>] = [t(a), t(b)];
        const c = refereeColor(teams);
        expect([a, b, ...keeperColors(teams)]).not.toContain(c);
      }
    }
    expect(refereeColor([t(0), t(2)])).toBe(1);
  });

  it("calça escura fixa e índices inválidos caem no padrão", () => {
    const a = uniformDNA(avatar, { name: "A", kit: 0, color: 0 });
    const b = uniformDNA(avatar, { name: "B", kit: 2, color: 5 });
    expect(a.pantsColor).toBe(b.pantsColor);
    expect(uniformDNA(avatar, { name: "X", kit: 99, color: -1 })).toEqual(uniformDNA(avatar, { name: "X", kit: 0, color: 0 }));
  });
});
