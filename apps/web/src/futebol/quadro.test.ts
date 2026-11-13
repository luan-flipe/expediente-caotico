import { describe, expect, it } from "vitest";
import { RitmoQuadro } from "./quadro";

/** Quantos quadros desenham em 1 s com o requestAnimationFrame na frequência da tela (com um pouco de tremido). */
function desenhados(hz: number, tremido = 0.4): number {
  const r = new RitmoQuadro();
  let n = 0;
  for (let i = 0; i < hz; i++) {
    const ms = 1000 + (i * 1000) / hz + (i % 2 ? tremido : -tremido);
    if (r.desenha(ms)) n++;
  }
  return n;
}

describe("ritmo do quadro", () => {
  it("em 60 Hz desenha todos os quadros", () => {
    expect(desenhados(60)).toBe(60);
  });

  it("em 120 e 144 Hz desenha cerca de 60", () => {
    for (const hz of [120, 144, 165]) {
      const n = desenhados(hz);
      expect(n).toBeGreaterThanOrEqual(57);
      expect(n).toBeLessThanOrEqual(63);
    }
  });

  it("em 30 Hz desenha todos (não há o que travar)", () => {
    expect(desenhados(30)).toBe(30);
  });

  it("depois de uma travada recomeça sem rajada de quadros", () => {
    const r = new RitmoQuadro();
    expect(r.desenha(1000)).toBe(true);
    expect(r.desenha(3000)).toBe(true);
    expect(r.desenha(3007)).toBe(false);
    expect(r.desenha(3017)).toBe(true);
  });

  it("baixa a resolução quando a maioria dos quadros passa de 20 ms, até o piso", () => {
    const r = new RitmoQuadro();
    let pr = 2;
    for (let i = 0; i < 2000; i++) pr = r.resolucao(30, pr) ?? pr;
    expect(pr).toBe(0.75);
  });

  it("não mexe com quadros rápidos nem com quadros gigantes", () => {
    const r = new RitmoQuadro();
    let pr = 2;
    for (let i = 0; i < 500; i++) pr = r.resolucao(i % 3 ? 16 : 25, pr) ?? pr;
    for (let i = 0; i < 500; i++) pr = r.resolucao(800, pr) ?? pr;
    expect(pr).toBe(2);
  });

  it("informa o FPS a cada meio segundo", () => {
    const r = new RitmoQuadro();
    const vistos: number[] = [];
    for (let i = 0; i <= 60; i++) {
      const f = r.fps(i * (1000 / 60));
      if (f !== null) vistos.push(f);
    }
    expect(vistos).toEqual([60, 60]);
  });
});
