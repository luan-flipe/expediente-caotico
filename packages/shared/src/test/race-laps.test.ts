import { describe, expect, it } from "vitest";
import { lapsDone, newLapState, raceProgress, ranking, updateProgress, type LapState } from "../race/laps";
import { RACE } from "../race/balance";
import { checkpoints, TRACK, TRACK_IDS, TRACKS } from "../race/track";
import { flyingLap } from "./race-pilot";

const CPS = checkpoints(TRACK);
const L = TRACK.length;

/** Anda de s0 até s0 + dist (dist negativa = contramão) em passos de 0,5 m. */
function drive(l: LapState, s0: number, dist: number, t0 = 0): { l: LapState; now: number; laps: number } {
  let st = l;
  let now = t0;
  let laps = 0;
  const steps = Math.round(Math.abs(dist) / 0.5);
  for (let i = 1; i <= steps; i++) {
    now += 33;
    const s = (((s0 + Math.sign(dist) * i * 0.5) % L) + L) % L;
    const u = updateProgress(st, s, now, CPS, TRACK);
    st = u.state;
    if (u.lapDone) laps++;
  }
  return { l: st, now, laps };
}

describe("voltas", () => {
  const start = L - 6;

  it("volta completa conta 1", () => {
    const { l, laps } = drive(newLapState(start, 0), start, L + 10);
    expect(laps).toBe(1);
    expect(lapsDone(l, CPS)).toBe(1);
    expect(l.bestLapMs).toBeGreaterThan(0);
  });

  it("ir e voltar na linha de chegada não conta", () => {
    let st = newLapState(start, 0);
    let s = start;
    for (let k = 0; k < 5; k++) {
      st = drive(st, s, 12).l;
      s = (s + 12) % L;
      st = drive(st, s, -12).l;
      s = (s - 12 + L) % L;
    }
    expect(lapsDone(st, CPS)).toBe(0);
    expect(st.cpCount).toBe(1);
  });

  it("percorrer a pista ao contrário não conta", () => {
    const { l, laps } = drive(newLapState(start, 0), start, -(L * 2));
    expect(laps).toBe(0);
    expect(l.cpCount).toBe(0);
  });

  it("pular checkpoint por teleporte não conta até passar por ele", () => {
    let st = drive(newLapState(start, 0), start, 30).l; // passou a linha e o cp de 20 m
    expect(st.cpCount).toBe(2);
    st = updateProgress(st, 95, 5000, CPS, TRACK).state; // teleporte para 95 m
    st = drive(st, 95, L - 95 + 5).l; // segue até depois da linha
    expect(lapsDone(st, CPS)).toBe(0);
    expect(st.cpCount).toBe(2);
  });

  it("3 voltas terminam a corrida com melhor volta", () => {
    const { l } = drive(newLapState(start, 0), start, 3 * L + 20);
    expect(l.finishedAt).not.toBeNull();
    expect(lapsDone(l, CPS)).toBe(3);
    expect(l.bestLapMs).not.toBeNull();
  });

  it("progresso cresce ao andar e ranking põe terminados à frente", () => {
    const a = drive(newLapState(start, 0), start, 100).l;
    const b = drive(newLapState(start, 0), start, 60).l;
    const pa = raceProgress(a, a.lastS, CPS, TRACK);
    const pb = raceProgress(b, b.lastS, CPS, TRACK);
    expect(pa).toBeGreaterThan(pb);
    expect(pa).toBeCloseTo(94, 0);
    expect(raceProgress(newLapState(start, 0), start, CPS, TRACK)).toBeCloseTo(-6, 5);
    expect(
      ranking([
        { id: "lento", progress: 10, finishedAt: null },
        { id: "segundo", progress: 0, finishedAt: 900 },
        { id: "rapido", progress: 50, finishedAt: null },
        { id: "primeiro", progress: 0, finishedAt: 500 },
      ]),
    ).toEqual(["primeiro", "segundo", "rapido", "lento"]);
  });
});

describe("voltas pelo atalho", () => {
  it("volta pelo atalho fecha e passa por todos os checkpoints na ordem", () => {
    for (const id of TRACK_IDS) {
      const v = flyingLap(TRACKS[id], 0);
      expect(v.usedBranch, id).toBe(true);
      expect(v.cpOrder, id).toEqual([...v.cps.keys()].slice(1).concat(0));
      expect(v.maxStep, id).toBeLessThan(RACE.maxProgressStep);
    }
  });

  it("piloto perfeito ganha entre 0,4 e 1,5 s pelo atalho (Copa, volta de 13 s: a partir de 0,25 s)", () => {
    for (const id of TRACK_IDS) {
      const main = flyingLap(TRACKS[id], -1);
      const cut = flyingLap(TRACKS[id], 0);
      const gain = (main.ms - cut.ms) / 1000;
      expect(gain, `${id}: ${main.ms} x ${cut.ms}`).toBeGreaterThan(id === "copa" ? 0.25 : 0.4);
      expect(gain, `${id}: ${main.ms} x ${cut.ms}`).toBeLessThan(1.5);
    }
  });
});
