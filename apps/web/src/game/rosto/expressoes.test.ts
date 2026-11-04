import { describe, expect, it } from "vitest";
import { FACES } from "@ec/shared";
import { EXPRESSOES } from "./expressoes";
import { LAYER_TEXELS, MAX_LAYERS, encode } from "./vetor";

describe("rosto vetorial", () => {
  it("tem uma expressão por item de FACES, na mesma ordem", () => {
    expect(EXPRESSOES).toHaveLength(FACES.length);
  });

  it("cada expressão cabe no shader e recorta só por camadas anteriores", () => {
    for (const layers of EXPRESSOES) {
      expect(layers.length).toBeLessThanOrEqual(MAX_LAYERS);
      const data = encode(layers);
      const n = data[0];
      expect(n).toBe(layers.length);
      const texels = data.length / 4;
      for (let i = 0; i < n; i++) {
        const t = (1 + i * LAYER_TEXELS) * 4;
        const [kind, start, count, clip] = data.slice(t, t + 4);
        expect(clip).toBeLessThan(i);
        if (kind <= 1) expect(start + count).toBeLessThanOrEqual(texels);
        // caixa não vazia
        const box = data.slice(t + 16, t + 20);
        expect(box[2]).toBeGreaterThan(box[0]);
        expect(box[3]).toBeGreaterThan(box[1]);
      }
      expect(data.every(Number.isFinite)).toBe(true);
    }
  });

  it("os olhos simétricos ficam espelhados no rosto", () => {
    // a íris espelha; os brilhos não (a luz vem do mesmo lado nos dois olhos)
    const iris = (side: string) => EXPRESSOES[0].find((l) => l.name === `${side}.iris`);
    const d = iris("d"), e = iris("e");
    expect(d && "center" in d && e && "center" in e).toBe(true);
    if (d && "center" in d && e && "center" in e) expect(e.center[0]).toBeCloseTo(-d.center[0], 5);
  });
});
