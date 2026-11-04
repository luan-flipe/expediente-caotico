import { describe, expect, it } from "vitest";
import { buildGolGeometry } from "./golMesh";

function bounds(g: { getAttribute: (n: string) => { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number } }) {
  const p = g.getAttribute("position");
  const b = { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9, minZ: 1e9, maxZ: -1e9 };
  const atMaxY: number[] = [];
  for (let i = 0; i < p.count; i++) {
    b.minX = Math.min(b.minX, p.getX(i)); b.maxX = Math.max(b.maxX, p.getX(i));
    b.minY = Math.min(b.minY, p.getY(i)); b.maxY = Math.max(b.maxY, p.getY(i));
    b.minZ = Math.min(b.minZ, p.getZ(i)); b.maxZ = Math.max(b.maxZ, p.getZ(i));
  }
  for (let i = 0; i < p.count; i++) if (p.getY(i) > b.maxY - 1e-6) atMaxY.push(p.getZ(i));
  return { ...b, atMaxY };
}

describe("golMesh", () => {
  for (const [w, h] of [[2, 2], [3.66, 2.44]]) {
    it(`gol ${w}x${h}: boca na linha de gol, altura maxima so nela, fundo para tras`, () => {
      const g = buildGolGeometry(w, h);
      const net = bounds(g.net);
      expect(net.maxZ).toBeCloseTo(0, 6);
      expect(net.minZ).toBeCloseTo(-g.backDepth, 6);
      expect(net.maxX).toBeCloseTo(w, 6);
      expect(net.minX).toBeCloseTo(-w, 6);
      expect(net.maxY).toBeCloseTo(h, 6);
      // o topo e curto: a altura maxima so existe entre a boca e o topo raso
      expect(Math.min(...net.atMaxY)).toBeGreaterThanOrEqual(-g.topDepth - 1e-6);
      expect(g.topDepth).toBeLessThan(g.backDepth / 2);
      const tubes = bounds(g.tubes);
      expect(tubes.maxZ).toBeLessThan(0.1);
      expect(tubes.minZ).toBeLessThan(-g.backDepth + 0.1);
      // nada de poste vertical atras: acima de 40% da altura nada passa do topo raso
      const p = g.tubes.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) > h * 0.99) expect(p.getZ(i)).toBeGreaterThan(-g.topDepth - 0.2);
      }
    });
  }
});
