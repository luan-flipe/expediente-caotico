import { describe, expect, it } from "vitest";
import { DEFAULT_CHAIR, sanitizeChair } from "../race/chair";
import { boxSpots, checkpoints, clampToTrack, gridSlots, inCarpet, pointAt, progressOf, TRACK } from "../race/track";

describe("pista", () => {
  const n = TRACK.points.length;

  it("linha fechada com comprimento entre 300 e 400 m", () => {
    const a = TRACK.points[0];
    const b = TRACK.points[n - 1];
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(6);
    expect(TRACK.length).toBeGreaterThan(300);
    expect(TRACK.length).toBeLessThan(400);
  });

  it("largura entre 8 e 12 m e tudo dentro de 120 x 90 m", () => {
    for (const w of TRACK.widths) {
      expect(w).toBeGreaterThanOrEqual(8);
      expect(w).toBeLessThanOrEqual(12);
    }
    for (const p of TRACK.points) {
      expect(Math.abs(p.x)).toBeLessThan(60 - 6);
      expect(Math.abs(p.z)).toBeLessThan(45 - 6);
    }
  });

  it("nenhum trecho encosta em outro trecho distante", () => {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const gap = Math.min(Math.abs(i - j), n - Math.abs(i - j));
        if (gap * TRACK.spacing < 40) continue;
        const d = Math.hypot(TRACK.points[i].x - TRACK.points[j].x, TRACK.points[i].z - TRACK.points[j].z);
        expect(d, `pontos ${i} e ${j}`).toBeGreaterThan((TRACK.widths[i] + TRACK.widths[j]) / 2 + 1.5);
      }
    }
  });

  it("progressOf de um ponto da linha central devolve o s dele", () => {
    for (const s of [0, 37.3, 120, 201.5, TRACK.length - 3]) {
      const at = pointAt(TRACK, s);
      const pr = progressOf(TRACK, at.pos);
      const diff = Math.abs(pr.s - s);
      expect(Math.min(diff, TRACK.length - diff)).toBeLessThan(0.5);
      expect(pr.dist).toBeLessThan(0.3);
    }
  });

  it("clampToTrack devolve para dentro quem sai", () => {
    const at = pointAt(TRACK, 50);
    const out = { x: at.pos.x + 30, z: at.pos.z + 30 };
    const c = clampToTrack(TRACK, out, 0.7);
    expect(c.hit).toBe(true);
    const pr = progressOf(TRACK, c.pos);
    expect(pr.dist).toBeLessThanOrEqual(pr.halfWidth - 0.7 + 1e-6);
  });

  it("8 posições de largada dentro da pista e separadas", () => {
    const slots = gridSlots(TRACK, 8);
    for (const a of slots) {
      const pr = progressOf(TRACK, a.pos);
      expect(pr.dist).toBeLessThan(pr.halfWidth - 1);
      for (const b of slots) if (a !== b) expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)).toBeGreaterThan(1.5);
    }
  });

  it("checkpoints a cada 20 m, começando na linha", () => {
    const cps = checkpoints(TRACK);
    expect(cps[0]).toBe(0);
    expect(cps.length).toBe(Math.floor((TRACK.length - 10) / 20) + 1);
  });

  it("16 caixas dentro da pista e carpete só na borda", () => {
    const boxes = boxSpots(TRACK);
    expect(boxes).toHaveLength(16);
    for (const b of boxes) {
      const pr = progressOf(TRACK, b);
      expect(pr.dist).toBeLessThan(pr.halfWidth);
      expect(inCarpet(TRACK, pr)).toBe(false);
    }
    expect(inCarpet(TRACK, progressOf(TRACK, pointAt(TRACK, TRACK.carpet[0].from + 3).pos))).toBe(false);
  });
});

describe("cadeira", () => {
  it("sanitizeChair corrige valores inválidos", () => {
    expect(sanitizeChair(null)).toEqual(DEFAULT_CHAIR);
    expect(sanitizeChair({ seat: 99, base: -1, wheels: 1.5, back: "x", trinket: 2 })).toEqual({ ...DEFAULT_CHAIR, trinket: 2 });
    expect(sanitizeChair({ seat: 3, base: 2, wheels: 2, back: 0, trinket: 5 })).toEqual({ seat: 3, base: 2, wheels: 2, back: 0, trinket: 5 });
  });
});
