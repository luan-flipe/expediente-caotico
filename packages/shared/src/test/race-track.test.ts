import { describe, expect, it } from "vitest";
import { DEFAULT_CHAIR, SCOOTER, randomChair, sanitizeChair } from "../race/chair";
import { RACE } from "../race/balance";
import { mulberry32 } from "../rng";
import { boxSpots, branchPointAt, checkpoints, clampToTrack, deltaS, gridSlots, inCarpet, pointAt, progressOf, TRACK, TRACK_IDS, TRACKS } from "../race/track";

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

describe("atalhos", () => {
  const T = TRACKS.corporativo;

  function insideAny(p: { x: number; z: number }, r = 0): boolean {
    return [-1, 0].some((path) => {
      const pr = progressOf(T, p, path);
      return pr.path === path && pr.dist <= pr.halfWidth - r;
    });
  }

  it("atalho existe nas 3 pistas", () => {
    for (const id of TRACK_IDS) expect(TRACKS[id].branches.length, id).toBe(1);
  });

  it("progresso no atalho vira s da principal", () => {
    const b = T.branches[0];
    const mid = b.points[Math.floor(b.points.length / 2)];
    const pr = progressOf(T, mid, 0);
    expect(pr.path).toBe(0);
    expect(deltaS(T, b.sFrom, pr.s)).toBeGreaterThan(0);
    expect(deltaS(T, pr.s, b.sTo)).toBeGreaterThan(0);
  });

  it("s cresce ao percorrer o atalho", () => {
    for (const id of TRACK_IDS) {
      const tr = TRACKS[id];
      const b = tr.branches[0];
      const span = deltaS(tr, b.sFrom, b.sTo);
      let prev = progressOf(tr, branchPointAt(tr, 0, b.sFrom).pos, 0);
      let path = 0;
      for (let d = 1; d < b.length; d += 1) {
        const pos = branchPointAt(tr, 0, b.sFrom + (d / b.length) * span).pos;
        const pr = progressOf(tr, pos, path);
        path = pr.path;
        const step = deltaS(tr, prev.s, pr.s);
        expect(step, `${id} em ${d} m`).toBeGreaterThan(0);
        expect(step, `${id} em ${d} m`).toBeLessThan(RACE.maxProgressStep);
        prev = pr;
      }
    }
  });

  it("boca da bifurcação respeita prefer, sem trocar de caminho nem de s parado no meio", () => {
    for (const id of TRACK_IDS) {
      const tr = TRACKS[id];
      const s = tr.branches[0].sFrom + 2;
      const a = pointAt(tr, s).pos;
      const b = branchPointAt(tr, 0, s).pos;
      // equidistante dos dois centros (bissecção entre os dois pontos)
      const near = (p: { x: number; z: number }, path: number) => {
        let d = Infinity;
        for (let ds = -8; ds <= 8; ds += 0.05) {
          const q = branchPointAt(tr, path, s + ds).pos;
          d = Math.min(d, Math.hypot(q.x - p.x, q.z - p.z));
        }
        return d;
      };
      let lo = 0;
      let hi = 1;
      let pos = a;
      for (let i = 0; i < 30; i++) {
        const m = (lo + hi) / 2;
        pos = { x: a.x + (b.x - a.x) * m, z: a.z + (b.z - a.z) * m };
        if (near(pos, -1) < near(pos, 0)) lo = m;
        else hi = m;
      }
      const onMain = progressOf(tr, pos, -1);
      const onBranch = progressOf(tr, pos, 0);
      expect(onMain.path, id).toBe(-1);
      expect(onBranch.path, id).toBe(0);
      expect(onBranch.s, id).toBeCloseTo(onMain.s, 6);
      // clamp parado ali também não troca
      expect(clampToTrack(tr, pos, 0.7, -1).progress.path, id).toBe(-1);
      expect(clampToTrack(tr, pos, 0.7, 0).progress.path, id).toBe(0);
    }
  });

  it("clamp fora dos corredores", () => {
    const b = T.branches[0];
    const mid = b.points[Math.floor(b.points.length / 2)];
    const main = pointAt(T, b.sFrom + deltaS(T, b.sFrom, b.sTo) / 2).pos;
    // ponto no infield entre o atalho e a principal, fora dos dois
    let p = { x: (mid.x + main.x) / 2, z: (mid.z + main.z) / 2 };
    for (let f = 0.45; f > 0.05 && insideAny(p); f -= 0.05) p = { x: mid.x + (main.x - mid.x) * f, z: mid.z + (main.z - mid.z) * f };
    expect(insideAny(p)).toBe(false);
    const c = clampToTrack(T, p, 0.7);
    expect(c.hit).toBe(true);
    expect(insideAny(c.pos, 0.7 - 1e-6)).toBe(true);
  });

  it("atalho não encosta no resto da pista", () => {
    for (const id of TRACK_IDS) {
      const tr = TRACKS[id];
      const b = tr.branches[0];
      const span = deltaS(tr, b.sFrom, b.sTo);
      for (let i = 0; i < tr.points.length; i++) {
        // perto das bocas a principal encosta no atalho por definição
        const into = deltaS(tr, b.sFrom - 20, tr.cum[i]);
        if (into >= 0 && into <= span + 40) continue;
        for (let k = 0; k < b.points.length; k++) {
          const d = Math.hypot(tr.points[i].x - b.points[k].x, tr.points[i].z - b.points[k].z);
          expect(d, `${id}: ponto ${i} e atalho ${k}`).toBeGreaterThan(tr.widths[i] / 2 + b.widths[k] / 2 + 3);
        }
      }
    }
  });
});

describe("cadeira", () => {
  it("sanitizeChair corrige valores inválidos", () => {
    expect(sanitizeChair(null)).toEqual(DEFAULT_CHAIR);
    expect(sanitizeChair({ seat: 99, base: -1, wheels: 1.5, back: "x", trinket: 2 })).toEqual({ ...DEFAULT_CHAIR, trinket: 2 });
    expect(sanitizeChair({ seat: 3, base: 2, wheels: 2, back: 0, trinket: 5 })).toEqual({ vehicle: 0, seat: 3, base: 2, wheels: 2, back: 0, trinket: 5 });
  });

  it("crachá salvo antes do patinete fica na cadeira, e veículo fora da lista também", () => {
    expect(sanitizeChair({ vehicle: SCOOTER, seat: 3 })).toEqual({ ...DEFAULT_CHAIR, vehicle: SCOOTER, seat: 3 });
    expect(sanitizeChair({ vehicle: 7 }).vehicle).toBe(0);
    expect(sanitizeChair({ vehicle: "1" }).vehicle).toBe(0);
  });

  it("sorteio dos bots sai sempre válido e às vezes de patinete", () => {
    const rng = mulberry32(7);
    const picks = Array.from({ length: 200 }, () => randomChair(rng));
    for (const c of picks) expect(sanitizeChair(c)).toEqual(c);
    expect(picks.some((c) => c.vehicle === SCOOTER)).toBe(true);
    expect(picks.some((c) => c.vehicle === 0)).toBe(true);
  });
});
