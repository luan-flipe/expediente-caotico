import { describe, expect, it } from "vitest";
import { defaultQuality, isTouchPrimary, steerFromDrag, stickVector } from "./touch";
import { sanitizeSettings } from "./settings";

describe("stickVector (analógico)", () => {
  it("dentro da zona morta fica parado", () => {
    expect(stickVector(5, -5, 60, 0.15)).toEqual({ x: 0, y: 0 });
  });

  it("arrastar para cima anda para frente (y positivo)", () => {
    const v = stickVector(0, -60, 60, 0.15);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
  });

  it("passar do raio limita em 1 e mantém a direção", () => {
    const v = stickVector(300, 400, 60, 0.15);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(0.6);
    expect(v.y).toBeCloseTo(-0.8);
  });

  it("logo após a zona morta começa do zero (sem salto)", () => {
    const v = stickVector(60 * 0.16, 0, 60, 0.15);
    expect(v.x).toBeGreaterThan(0);
    expect(v.x).toBeLessThan(0.05);
  });

  it("meio caminho entre a zona morta e a borda dá meia força", () => {
    const v = stickVector(60 * 0.575, 0, 60, 0.15);
    expect(v.x).toBeCloseTo(0.5);
  });
});

describe("steerFromDrag (volante)", () => {
  it("parado no centro não vira", () => {
    expect(steerFromDrag(4, 80, 0.1)).toBe(0);
  });

  it("direita é positivo e esquerda negativo, como as teclas", () => {
    expect(steerFromDrag(80, 80, 0.1)).toBe(1);
    expect(steerFromDrag(-80, 80, 0.1)).toBe(-1);
  });

  it("é analógico entre a zona morta e o limite", () => {
    const s = steerFromDrag(44, 80, 0.1);
    expect(s).toBeGreaterThan(0.4);
    expect(s).toBeLessThan(0.6);
  });

  it("limita em 1 além do raio", () => {
    expect(steerFromDrag(500, 80, 0.1)).toBe(1);
    expect(steerFromDrag(-500, 80, 0.1)).toBe(-1);
  });
});

describe("isTouchPrimary", () => {
  it("dedo como ponteiro principal e tela de toque: sim", () => {
    expect(isTouchPrimary({ coarse: true, touchPoints: 5 })).toBe(true);
  });

  it("mouse, mesmo com tela de toque (notebook): não", () => {
    expect(isTouchPrimary({ coarse: false, touchPoints: 10 })).toBe(false);
  });

  it("ponteiro grosso sem toque (ex.: controle de TV): não", () => {
    expect(isTouchPrimary({ coarse: true, touchPoints: 0 })).toBe(false);
  });
});

describe("qualidade padrão", () => {
  it("celular começa no Leve, computador no Alta", () => {
    expect(defaultQuality(true)).toBe("leve");
    expect(defaultQuality(false)).toBe("alta");
  });

  it("sem escolha salva, o padrão segue o aparelho", () => {
    expect(sanitizeSettings({}, true).quality).toBe("leve");
    expect(sanitizeSettings(null, false).quality).toBe("alta");
  });

  it("a escolha do jogador sempre vence", () => {
    expect(sanitizeSettings({ quality: "alta" }, true).quality).toBe("alta");
    expect(sanitizeSettings({ quality: "leve" }, false).quality).toBe("leve");
  });
});
