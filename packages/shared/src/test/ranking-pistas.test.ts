import { describe, expect, it } from "vitest";
import { CHALLENGES, challengeDone, emptyProgress, weekKey, type WeekProgress } from "../ranking/challenges";
import { applyLap, applyRaceResult, applyWeeklyLap, emptyRankingData, MAIN_TRACK_ID, rankingView } from "../ranking/rules";
import type { RankingData } from "../ranking/types";

const NOW = Date.UTC(2026, 9, 15, 15, 0, 0);
const WEEK = weekKey(new Date(NOW));

function dataWith(ids: string[]): RankingData {
  const d = emptyRankingData();
  for (const id of ids) d.accounts[id] = { email: `${id}@x.com`, name: `Nome ${id}`, since: 1 };
  return d;
}

const podio3 = CHALLENGES.find((c) => c.id === "podio-3-pistas")!;

describe("recordes por pista", () => {
  it("voltas ficam na pista certa e cada pista tem a sua aba", () => {
    const d = dataWith(["a", "b"]);
    applyLap(d, "corporativo", "a", 30000, [], NOW);
    applyLap(d, "copa", "b", 12000, [], NOW);
    applyLap(d, "copa", "a", 13000, [], NOW);
    expect(Object.keys(d.laps.copa).sort()).toEqual(["a", "b"]);
    expect(Object.keys(d.laps.corporativo)).toEqual(["a"]);
    const v = rankingView(d, NOW, "a");
    expect(v.pistas.map((p) => [p.id, p.name])).toEqual([
      ["corporativo", "Circuito Corporativo"],
      ["estacionamento", "Estacionamento"],
      ["copa", "Copa"],
      ["parque", "Parque Ipanema"],
    ]);
    expect(v.pistas[0].voltas).toEqual(v.voltas);
    expect(v.pistas[1].voltas).toEqual({ rows: [], me: null });
    expect(v.pistas[2].voltas.rows.map((r) => [r.id, r.ms])).toEqual([
      ["b", 12000],
      ["a", 13000],
    ]);
    expect(v.pistas[2].voltas.me).toMatchObject({ id: "a", rank: 2 });
  });
});

describe("desafio: pódio em 3 pistas diferentes", () => {
  it("está na lista de desafios", () => {
    expect(podio3.text).toBe("Pódio em 3 pistas diferentes");
    expect(podio3.target).toBe(3);
  });

  it("conta pistas distintas, não pódios", () => {
    const d = dataWith(["a", "b"]);
    const race = (track: string, placeA: number) =>
      applyRaceResult(
        d,
        [
          { accountId: "a", place: placeA },
          { accountId: "b", place: placeA === 1 ? 2 : 1 },
        ],
        NOW,
        track,
      );
    race("copa", 1);
    race("copa", 2);
    race("copa", 1);
    const p = () => d.challenges[WEEK].a;
    expect(p().podiumTracks).toEqual(["copa"]);
    expect(podio3.value(p())).toBe(1);
    race("estacionamento", 3 + 1); // 4º lugar não é pódio
    expect(podio3.value(p())).toBe(1);
    race("estacionamento", 2);
    race("corporativo", 3);
    expect(p().podiumTracks!.sort()).toEqual(["copa", "corporativo", "estacionamento"]);
    expect(challengeDone(podio3, p())).toBe(true);
  });

  it("corrida sem pista informada conta como Circuito Corporativo", () => {
    const d = dataWith(["a", "b"]);
    applyRaceResult(
      d,
      [
        { accountId: "a", place: 1 },
        { accountId: "b", place: 2 },
      ],
      NOW,
    );
    expect(d.challenges[WEEK].a.podiumTracks).toEqual([MAIN_TRACK_ID]);
  });

  it("progresso antigo, sem pistas, continua válido", () => {
    const old = { ...emptyProgress(), racePodiums: 4 } as WeekProgress;
    delete old.podiumTracks;
    expect(podio3.value(old)).toBe(0);
    for (const c of CHALLENGES) expect(Number.isFinite(c.value(old))).toBe(true);
    const d = dataWith(["a", "b"]);
    d.challenges[WEEK] = { a: old };
    applyRaceResult(
      d,
      [
        { accountId: "a", place: 1 },
        { accountId: "b", place: 2 },
      ],
      NOW,
      "copa",
    );
    expect(d.challenges[WEEK].a.podiumTracks).toEqual(["copa"]);
    expect(d.challenges[WEEK].a.racePodiums).toBe(5);
  });
});

describe("desafio de volta só no Circuito Corporativo", () => {
  it("volta em outra pista não mexe na melhor volta da semana", () => {
    const d = dataWith(["a"]);
    applyWeeklyLap(d, "a", 11000, NOW, "copa");
    expect(d.challenges[WEEK]?.a?.bestLapMs ?? null).toBeNull();
    applyWeeklyLap(d, "a", 40000, NOW, "corporativo");
    expect(d.challenges[WEEK].a.bestLapMs).toBe(40000);
    applyWeeklyLap(d, "a", 11000, NOW, "estacionamento");
    expect(d.challenges[WEEK].a.bestLapMs).toBe(40000);
  });
});
