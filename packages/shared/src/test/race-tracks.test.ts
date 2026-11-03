import { describe, expect, it } from "vitest";
import { BOT_LEVELS } from "../botLevels";
import { DEFAULT_AVATAR } from "../data/avatar";
import { RACE } from "../race/balance";
import { DEFAULT_CHAIR } from "../race/chair";
import { createRace, getRaceResults, stepRace } from "../race/match";
import { boxSpots, checkpoints, getTrack, gridSlots, inCarpet, pointAt, progressOf, TRACK, TRACK_IDS, TRACKS } from "../race/track";

const DT = 1000 / 30;

/** Limites por pista: comprimento (m) e tempo máximo para uma corrida de 3 voltas só com bots. */
const LIMITS: Record<string, { min: number; max: number; raceMs: number }> = {
  corporativo: { min: 300, max: 400, raceMs: 150000 },
  estacionamento: { min: 300, max: 450, raceMs: 150000 },
  copa: { min: 150, max: 250, raceMs: 110000 },
  parque: { min: 500, max: 650, raceMs: 180000 },
};

describe("registro de pistas", () => {
  it("quatro pistas com nome, e o Circuito Corporativo continua sendo o padrão", () => {
    expect(TRACK_IDS).toEqual(["corporativo", "estacionamento", "copa", "parque"]);
    expect(TRACKS.corporativo).toBe(TRACK);
    expect(TRACKS.estacionamento.name).toBe("Estacionamento");
    expect(TRACKS.copa.name).toBe("Copa");
    expect(TRACKS.parque.name).toBe("Parque Ipanema");
    for (const id of TRACK_IDS) expect(TRACKS[id].id).toBe(id);
    expect(getTrack(undefined)).toBe(TRACK);
    expect(getTrack("nao-existe")).toBe(TRACK);
    expect(getTrack("copa")).toBe(TRACKS.copa);
    expect(getTrack("parque")).toBe(TRACKS.parque);
  });

  it("corrida sem pista usa o Circuito Corporativo", () => {
    const r = createRace({ seed: 1, players: [{ id: "a", name: "A", avatar: DEFAULT_AVATAR, chair: DEFAULT_CHAIR, isBot: true }] });
    expect(r.track).toBe(TRACK);
  });
});

for (const id of TRACK_IDS) {
  const t = TRACKS[id];
  const n = t.points.length;
  const lim = LIMITS[id];

  describe(`geometria: ${t.name}`, () => {
    it("fechada e com comprimento dentro do esperado", () => {
      const a = t.points[0];
      const b = t.points[n - 1];
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(6);
      expect(t.length).toBeGreaterThan(lim.min);
      expect(t.length).toBeLessThan(lim.max);
    });

    it("largura entre 8 e 14 m e curvas sem dobrar a borda interna", () => {
      for (const w of t.widths) {
        expect(w).toBeGreaterThanOrEqual(8);
        expect(w).toBeLessThanOrEqual(14);
      }
      // raio da curva (por três pontos seguidos) sempre maior que meia largura
      for (let i = 0; i < n; i++) {
        const p = t.points[(i - 1 + n) % n];
        const q = t.points[i];
        const r = t.points[(i + 1) % n];
        const a = Math.hypot(q.x - p.x, q.z - p.z);
        const b = Math.hypot(r.x - q.x, r.z - q.z);
        const c = Math.hypot(r.x - p.x, r.z - p.z);
        const area2 = Math.abs((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
        const radius = area2 < 1e-9 ? Infinity : (a * b * c) / (2 * area2);
        expect(radius, `ponto ${i}`).toBeGreaterThan(t.widths[i] / 2);
      }
    });

    it("sem cruzar nem encostar em outro trecho", () => {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const gap = Math.min(Math.abs(i - j), n - Math.abs(i - j));
          if (gap * t.spacing < 40) continue;
          const d = Math.hypot(t.points[i].x - t.points[j].x, t.points[i].z - t.points[j].z);
          expect(d, `pontos ${i} e ${j}`).toBeGreaterThan((t.widths[i] + t.widths[j]) / 2 + 1.5);
        }
      }
    });

    it("checkpoints em ordem a cada 20 m, começando na linha", () => {
      const cps = checkpoints(t);
      expect(cps[0]).toBe(0);
      for (let i = 1; i < cps.length; i++) expect(cps[i] - cps[i - 1]).toBe(RACE.checkpointEvery);
      expect(cps[cps.length - 1]).toBeLessThan(t.length);
      // cada checkpoint, projetado de volta, cai no próprio s (nenhum trecho "rouba" o outro)
      for (const s of cps) {
        const pr = progressOf(t, pointAt(t, s).pos);
        const diff = Math.abs(pr.s - s);
        expect(Math.min(diff, t.length - diff)).toBeLessThan(0.5);
      }
    });

    it("8 posições de largada dentro da pista e separadas", () => {
      const slots = gridSlots(t, 8);
      for (const a of slots) {
        const pr = progressOf(t, a.pos);
        expect(pr.dist).toBeLessThan(pr.halfWidth - 1);
        for (const b of slots) if (a !== b) expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)).toBeGreaterThan(1.5);
      }
    });

    it("caixas dentro da pista e fora do carpete", () => {
      const boxes = boxSpots(t);
      expect(boxes.length).toBeGreaterThanOrEqual(12);
      for (const b of boxes) {
        const pr = progressOf(t, b);
        expect(pr.dist).toBeLessThan(pr.halfWidth);
        expect(inCarpet(t, pr)).toBe(false);
      }
    });

    it("ambientes em ordem, começando na linha", () => {
      expect(t.rooms[0].ctrl).toBe(0);
      for (let i = 1; i < t.rooms.length; i++) expect(t.rooms[i].ctrl).toBeGreaterThan(t.rooms[i - 1].ctrl);
    });
  });

  describe(`bots: ${t.name}`, () => {
    for (const level of BOT_LEVELS) {
      it(`corrida de 3 voltas só com bots (${level}) termina a tempo`, () => {
        const r = createRace({
          seed: 7,
          laps: 3,
          botLevel: level,
          track: id,
          players: Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, avatar: DEFAULT_AVATAR, chair: DEFAULT_CHAIR, isBot: true })),
        });
        expect(r.track).toBe(t);
        while (r.phase !== "finished" && r.now < lim.raceMs + RACE.countdownMs) stepRace(r, DT);
        const rows = getRaceResults(r);
        // todos cruzam a linha antes de a tolerância acabar
        expect(rows.every((x) => x.totalMs !== null)).toBe(true);
        expect(Math.max(...rows.map((x) => x.totalMs!))).toBeLessThan(lim.raceMs);
      }, 30000);
    }
  });
}
