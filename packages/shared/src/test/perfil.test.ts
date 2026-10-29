import { describe, expect, it } from "vitest";
import { applyAwards, applyLap, applyRaceResult, applyShooterResult, emptyRankingData, HISTORY_KEPT, MAIN_TRACK_ID, profileOf } from "../ranking/rules";
import { CHALLENGES } from "../ranking/challenges";
import type { RankingData } from "../ranking/types";

const NOW = Date.UTC(2026, 9, 15, 15, 0, 0); // 15/10/2026

function dataWith(ids: string[]): RankingData {
  const d = emptyRankingData();
  for (const id of ids) d.accounts[id] = { email: `${id}@x.com`, name: `Nome ${id}`, since: 1 };
  return d;
}

const shooter = (d: RankingData, t = NOW) =>
  applyShooterResult(
    d,
    [
      { accountId: "a", rank: 1, kills: 7 },
      { accountId: "b", rank: 2, kills: 3 },
    ],
    t,
  );

function zero() {
  return { shooterMatches: 0, shooterWins: 0, shooterKills: 0, bestKills: 0, raceMatches: 0, raceFinished: 0, raceWins: 0, racePodiums: 0, bestLapMs: null, doneAt: null };
}

describe("histórico de partidas", () => {
  it("tiroteio que conta entra no histórico de cada conta com colocação e eliminações", () => {
    const d = dataWith(["a", "b"]);
    shooter(d);
    expect(d.accounts.a.history).toEqual([{ at: NOW, mode: "shooter", place: 1, kills: 7 }]);
    expect(d.accounts.b.history).toEqual([{ at: NOW, mode: "shooter", place: 2, kills: 3 }]);
  });

  it("corrida entra com pista, lugar e melhor volta", () => {
    const d = dataWith(["a", "b"]);
    applyRaceResult(
      d,
      [
        { accountId: "a", place: 2, bestLapMs: 31000 },
        { accountId: "b", place: 1, bestLapMs: null },
      ],
      NOW,
      "corporativo",
    );
    expect(d.accounts.a.history).toEqual([{ at: NOW, mode: "race", track: "corporativo", place: 2, bestLapMs: 31000 }]);
    expect(d.accounts.b.history?.[0]).toMatchObject({ mode: "race", place: 1, bestLapMs: null });
  });

  it("partida que não conta (um só logado) não entra no histórico", () => {
    const d = dataWith(["a"]);
    applyShooterResult(d, [{ accountId: "a", rank: 1, kills: 9 }, { accountId: null, rank: 2, kills: 1 }], NOW);
    applyRaceResult(d, [{ accountId: "a", place: 1 }, { accountId: null, place: 2 }], NOW);
    expect(d.accounts.a.history).toBeUndefined();
  });

  it("guarda só as últimas 20, as mais novas por último", () => {
    const d = dataWith(["a", "b"]);
    for (let i = 0; i < HISTORY_KEPT + 5; i++) shooter(d, NOW + i);
    const h = d.accounts.a.history!;
    expect(HISTORY_KEPT).toBe(20);
    expect(h).toHaveLength(20);
    expect(h[0].at).toBe(NOW + 5);
    expect(h[19].at).toBe(NOW + 24);
  });

  it("conta fora do arquivo de contas não quebra nem cria entrada", () => {
    const d = emptyRankingData();
    expect(() => shooter(d)).not.toThrow();
    expect(d.accounts).toEqual({});
  });
});

describe("desafios cumpridos", () => {
  it("cumprir o desafio da semana soma 1 no contador da conta (uma vez por semana)", () => {
    const d = dataWith(["a", "b"]);
    // fixa a lista num desafio só (o sorteio real muda com a semana)
    const real = CHALLENGES.splice(0, CHALLENGES.length, CHALLENGES.find((c) => c.id === "tiroteio-3-vitorias")!);
    try {
      for (let i = 0; i < 5; i++) shooter(d, NOW + i);
    } finally {
      CHALLENGES.splice(0, CHALLENGES.length, ...real);
    }
    expect(d.accounts.a.challengesDone).toBe(1);
    expect(d.accounts.b.challengesDone).toBeUndefined();
  });
});

describe("prêmios bobos", () => {
  it("acumulam por nome do prêmio e por conta", () => {
    const d = dataWith(["a", "b"]);
    applyAwards(d, [
      { accountId: "a", title: "Mão de alface" },
      { accountId: "a", title: "Mão de alface" },
      { accountId: "a", title: "Rei do café" },
      { accountId: "b", title: "Mão de alface" },
      { accountId: null, title: "Rei do café" },
    ]);
    applyAwards(d, [{ accountId: "a", title: "Mão de alface" }]);
    expect(d.accounts.a.awards).toEqual({ "Mão de alface": 3, "Rei do café": 1 });
    expect(d.accounts.b.awards).toEqual({ "Mão de alface": 1 });
  });

  it("ignora conta que não existe", () => {
    const d = dataWith([]);
    applyAwards(d, [{ accountId: "x", title: "Qualquer" }]);
    expect(d.accounts).toEqual({});
  });
});

describe("profileOf", () => {
  it("conta de arquivo antigo (sem os campos novos) vira perfil vazio", () => {
    const d = dataWith(["a"]);
    const p = profileOf(d, "a", NOW)!;
    expect(p.name).toBe("Nome a");
    expect(p.awards).toEqual([]);
    expect(p.history).toEqual([]);
    expect(p.laps).toEqual([]);
    expect(p.stats).toMatchObject({ shooterWins: 0, raceMatches: 0 });
    expect(p.month).toMatchObject({ month: "2026-10", points: 0, position: null });
    expect(p.challenges.completed).toBe(0);
  });

  it("conta inexistente devolve null", () => {
    expect(profileOf(dataWith([]), "zz", NOW)).toBeNull();
  });

  it("junta totais, posição no mês, recorde com rank, prêmios e histórico mais novo primeiro", () => {
    const d = dataWith(["a", "b"]);
    shooter(d, NOW);
    shooter(d, NOW + 1000);
    applyLap(d, MAIN_TRACK_ID, "b", 28000, [], NOW);
    applyLap(d, MAIN_TRACK_ID, "a", 29000, [], NOW);
    applyAwards(d, [{ accountId: "a", title: "Rei do café" }]);
    const p = profileOf(d, "a", NOW + 2000)!;
    expect(p.stats).toMatchObject({ shooterWins: 2, shooterMatches: 2, shooterKills: 14 });
    expect(p.month.position).toBe(1);
    expect(p.month.points).toBe(20);
    expect(p.laps).toEqual([{ track: MAIN_TRACK_ID, trackName: expect.any(String), ms: 29000, rank: 2 }]);
    expect(p.awards).toEqual([{ title: "Rei do café", count: 1 }]);
    expect(p.history.map((h) => h.at)).toEqual([NOW + 1000, NOW]);
  });

  it("não vaza e-mail nem id de conta", () => {
    const d = dataWith(["g-secreto-1", "g-secreto-2"]);
    d.accounts["g-secreto-1"].name = "Ana";
    d.accounts["g-secreto-1"].history = [{ at: 1, mode: "shooter", place: 1, kills: 1 }];
    const json = JSON.stringify(profileOf(d, "g-secreto-1", NOW));
    expect(json).not.toContain("g-secreto");
    expect(json).not.toContain("@x.com");
  });

  it("campos corrompidos no arquivo não derrubam o perfil", () => {
    const d = dataWith(["a"]);
    (d.accounts.a as unknown as Record<string, unknown>).history = "lixo";
    (d.accounts.a as unknown as Record<string, unknown>).awards = [1, 2];
    expect(() => profileOf(d, "a", NOW)).not.toThrow();
    expect(profileOf(d, "a", NOW)!.history).toEqual([]);
    expect(profileOf(d, "a", NOW)!.awards).toEqual([]);
  });

  it("desafios cumpridos e situação da semana atual", () => {
    const d = dataWith(["a", "b"]);
    d.challenges["2026-10-12"] = { a: { ...zero(), doneAt: 5 }, b: zero() };
    const p = profileOf(d, "a", NOW)!;
    expect(p.challenges.completed).toBe(1);
    expect(p.challenges.week.done).toBe(true);
    expect(profileOf(d, "b", NOW)!.challenges.week.done).toBe(false);
  });

  it("o contador guardado vence a contagem das semanas que sobraram no arquivo", () => {
    const d = dataWith(["a"]);
    d.accounts.a.challengesDone = 9;
    d.challenges["2026-10-12"] = { a: { ...zero(), doneAt: 5 } };
    expect(profileOf(d, "a", NOW)!.challenges.completed).toBe(9);
  });
});
