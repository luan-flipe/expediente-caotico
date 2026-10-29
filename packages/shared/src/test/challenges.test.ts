import { describe, expect, it } from "vitest";
import { CHALLENGES, CHALLENGE_POINTS, LAP_CHALLENGE_MS, challengeDone, challengeOfWeek, emptyProgress, weekKey, type WeekProgress } from "../ranking/challenges";
import { applyLap, applyRaceResult, applyShooterResult, applyWeeklyLap, emptyRankingData, rankingView } from "../ranking/rules";
import type { RankingData } from "../ranking/types";

// 28/10/2026 é quarta-feira; a segunda dessa semana é 26/10.
const NOW = Date.UTC(2026, 9, 28, 15, 0, 0);
const WEEK = "2026-10-26";

function dataWith(ids: string[]): RankingData {
  const d = emptyRankingData();
  for (const id of ids) d.accounts[id] = { email: `${id}@x.com`, name: `Nome ${id}`, since: 1 };
  return d;
}

const prog = (patch: Partial<WeekProgress>): WeekProgress => ({ ...emptyProgress(), ...patch });
const byId = (id: string) => {
  const c = CHALLENGES.find((x) => x.id === id);
  if (!c) throw new Error(`desafio ${id} não existe`);
  return c;
};
/** Força o desafio da semana de NOW para o teste. */
function force(id: string): () => void {
  const real = CHALLENGES.splice(0, CHALLENGES.length, byId(id));
  return () => CHALLENGES.splice(0, CHALLENGES.length, ...real);
}
const month = (d: RankingData, id: string) => d.months["2026-10"]?.[id] ?? 0;

describe("weekKey", () => {
  it("segunda 0h de Brasília abre a semana (03:00 UTC)", () => {
    expect(weekKey(new Date("2026-10-26T02:59:59Z"))).toBe("2026-10-19");
    expect(weekKey(new Date("2026-10-26T03:00:00Z"))).toBe("2026-10-26");
  });
  it("domingo à noite ainda é da semana anterior; segunda de manhã já é da nova", () => {
    expect(weekKey(new Date("2026-11-01T02:59:59Z"))).toBe("2026-10-26"); // sábado 23:59 BRT
    expect(weekKey(new Date("2026-11-02T01:00:00Z"))).toBe("2026-10-26"); // domingo 22:00 BRT
    expect(weekKey(new Date("2026-11-02T03:00:00Z"))).toBe("2026-11-02");
    expect(weekKey(new Date("2026-10-28T15:00:00Z"))).toBe(WEEK);
  });
  it("vira o ano sem quebrar", () => {
    expect(weekKey(new Date("2027-01-01T12:00:00Z"))).toBe("2026-12-28");
    expect(weekKey(new Date("2027-01-04T02:59:59Z"))).toBe("2026-12-28");
    expect(weekKey(new Date("2027-01-04T03:00:00Z"))).toBe("2027-01-04");
    expect(weekKey(new Date("2026-01-01T12:00:00Z"))).toBe("2025-12-29");
  });
});

describe("sorteio da semana", () => {
  it("é determinístico pela chave da semana", () => {
    expect(challengeOfWeek(WEEK).id).toBe(challengeOfWeek(WEEK).id);
    expect(challengeOfWeek("2026-11-02")).toBe(challengeOfWeek("2026-11-02"));
  });
  it("nunca repete o desafio da semana anterior e usa vários da lista em um ano", () => {
    const seen = new Set<string>();
    let prev = "";
    for (let i = 0; i < 52; i++) {
      const key = weekKey(new Date(Date.UTC(2026, 0, 5 + i * 7, 12)));
      const id = challengeOfWeek(key).id;
      expect(id).not.toBe(prev);
      prev = id;
      seen.add(id);
    }
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });
});

describe("lista de desafios", () => {
  it("tem cerca de 12 com ids únicos, texto sem travessão e alvo positivo", () => {
    expect(CHALLENGES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
    for (const c of CHALLENGES) {
      expect(c.text).not.toContain("—");
      expect(c.target).toBeGreaterThan(0);
    }
    expect(CHALLENGE_POINTS).toBe(8);
  });

  it("cada desafio cumpre só com o seu critério", () => {
    const cases: [string, Partial<WeekProgress>, Partial<WeekProgress>][] = [
      ["volta-rapida", { bestLapMs: LAP_CHALLENGE_MS - 1 }, { bestLapMs: LAP_CHALLENGE_MS }],
      ["tiroteio-3-vitorias", { shooterWins: 3 }, { shooterWins: 2 }],
      ["corridas-5", { raceFinished: 5 }, { raceFinished: 4, raceMatches: 9 }],
      ["eliminacoes-10-partida", { bestKills: 10 }, { bestKills: 9, shooterKills: 40 }],
      ["tiroteio-4-partidas", { shooterMatches: 4 }, { shooterMatches: 3 }],
      ["eliminacoes-25-semana", { shooterKills: 25 }, { shooterKills: 24 }],
      ["rally-2-vitorias", { raceWins: 2 }, { raceWins: 1 }],
      ["rally-3-podios", { racePodiums: 3 }, { racePodiums: 2 }],
      ["vencer-os-dois", { shooterWins: 1, raceWins: 1 }, { shooterWins: 5 }],
      ["tres-de-cada", { shooterMatches: 3, raceMatches: 3 }, { shooterMatches: 3, raceMatches: 2 }],
      ["seis-partidas", { shooterMatches: 2, raceMatches: 4 }, { shooterMatches: 2, raceMatches: 3 }],
      ["rally-1-vitoria", { raceWins: 1 }, { racePodiums: 7 }],
      ["podio-3-pistas", { podiumTracks: ["corporativo", "copa", "estacionamento"] }, { podiumTracks: ["copa", "copa"], racePodiums: 9 }],
    ];
    expect(cases.map(([id]) => id).sort()).toEqual(CHALLENGES.map((c) => c.id).sort());
    for (const [id, ok, no] of cases) {
      expect(challengeDone(byId(id), prog(ok)), `${id} deveria cumprir`).toBe(true);
      expect(challengeDone(byId(id), prog(no)), `${id} não deveria cumprir`).toBe(false);
    }
    expect(challengeDone(byId("volta-rapida"), emptyProgress())).toBe(false);
  });
});

describe("progresso acumula só em partidas que contam", () => {
  it("tiroteio com 2 contas acumula; com 1 conta (resto bot ou visitante) não", () => {
    const d = dataWith(["a", "b"]);
    applyShooterResult(d, [{ accountId: "a", rank: 1, kills: 7 }, { accountId: null, rank: 2, kills: 1 }], NOW);
    expect(d.challenges[WEEK]).toBeUndefined();
    applyShooterResult(d, [{ accountId: "a", rank: 1, kills: 7 }, { accountId: "b", rank: 2, kills: 3 }], NOW);
    expect(d.challenges[WEEK].a).toMatchObject({ shooterMatches: 1, shooterWins: 1, shooterKills: 7, bestKills: 7 });
    expect(d.challenges[WEEK].b).toMatchObject({ shooterMatches: 1, shooterWins: 0, shooterKills: 3, bestKills: 3 });
    applyShooterResult(d, [{ accountId: "a", rank: 2, kills: 4 }, { accountId: "b", rank: 1, kills: 9 }], NOW);
    expect(d.challenges[WEEK].a).toMatchObject({ shooterMatches: 2, shooterWins: 1, shooterKills: 11, bestKills: 7 });
    expect(d.challenges[WEEK].b).toMatchObject({ shooterMatches: 2, shooterWins: 1, shooterKills: 12, bestKills: 9 });
  });

  it("rally: terminar, vitória, pódio e partidas; quem não terminou joga mas não termina", () => {
    const d = dataWith(["a", "b", "c", "d"]);
    applyRaceResult(
      d,
      [
        { accountId: "a", place: 1, finished: true },
        { accountId: "b", place: 2, finished: true },
        { accountId: "c", place: 3, finished: true },
        { accountId: "d", place: 4, finished: false },
      ],
      NOW,
    );
    expect(d.challenges[WEEK].a).toMatchObject({ raceMatches: 1, raceFinished: 1, raceWins: 1, racePodiums: 1 });
    expect(d.challenges[WEEK].c).toMatchObject({ raceMatches: 1, raceFinished: 1, raceWins: 0, racePodiums: 1 });
    expect(d.challenges[WEEK].d).toMatchObject({ raceMatches: 1, raceFinished: 0, raceWins: 0, racePodiums: 0 });
    const solo = dataWith(["a"]);
    applyRaceResult(solo, [{ accountId: "a", place: 1, finished: true }, { accountId: null, place: 2, finished: true }], NOW);
    expect(solo.challenges[WEEK]).toBeUndefined();
  });

  it("semanas diferentes têm progresso separado", () => {
    const d = dataWith(["a", "b"]);
    const rows = [{ accountId: "a", rank: 1, kills: 2 }, { accountId: "b", rank: 2, kills: 1 }];
    applyShooterResult(d, rows, NOW);
    applyShooterResult(d, rows, NOW + 7 * 86400000);
    expect(d.challenges[WEEK].a.shooterMatches).toBe(1);
    expect(d.challenges["2026-11-02"].a.shooterMatches).toBe(1);
  });

  it("guarda só as últimas semanas", () => {
    const d = dataWith(["a", "b"]);
    const rows = [{ accountId: "a", rank: 1, kills: 2 }, { accountId: "b", rank: 2, kills: 1 }];
    for (let i = 0; i < 12; i++) applyShooterResult(d, rows, NOW + i * 7 * 86400000);
    expect(Object.keys(d.challenges).length).toBeLessThanOrEqual(6);
    expect(d.challenges["2027-01-11"]).toBeDefined();
  });
});

describe("volta no desafio", () => {
  it("conta sozinha (sem 2 contas) e guarda a melhor da semana", () => {
    const d = dataWith(["a"]);
    expect(applyWeeklyLap(d, "a", 41000, NOW).length).toBe(0);
    expect(applyWeeklyLap(d, "a", 45000, NOW).length).toBe(0);
    expect(d.challenges[WEEK].a.bestLapMs).toBe(41000);
  });

  it("abaixo do limite cumpre e paga +8 uma vez", () => {
    const restore = force("volta-rapida");
    try {
      const d = dataWith(["a"]);
      expect(applyWeeklyLap(d, "a", LAP_CHALLENGE_MS, NOW)).toEqual([]);
      expect(month(d, "a")).toBe(0);
      expect(applyWeeklyLap(d, "a", LAP_CHALLENGE_MS - 100, NOW)).toEqual(["a"]);
      expect(month(d, "a")).toBe(CHALLENGE_POINTS);
      expect(applyWeeklyLap(d, "a", LAP_CHALLENGE_MS - 500, NOW)).toEqual([]);
      expect(month(d, "a")).toBe(CHALLENGE_POINTS);
    } finally {
      restore();
    }
  });

  it("applyLap segue independente (recorde continua valendo)", () => {
    const d = dataWith(["a"]);
    const res = applyLap(d, "corporativo", "a", 29000, [], NOW);
    expect(res.record).toBe(true);
    expect(d.challenges[WEEK]).toBeUndefined();
  });
});

describe("pontos do desafio", () => {
  it("cumprir paga +8 uma vez por semana e devolve quem cumpriu", () => {
    const restore = force("tiroteio-4-partidas");
    try {
      const d = dataWith(["a", "b"]);
      const rows = [{ accountId: "a", rank: 1, kills: 1 }, { accountId: "b", rank: 2, kills: 1 }];
      for (let i = 0; i < 3; i++) expect(applyShooterResult(d, rows, NOW)).toEqual([]);
      const done = applyShooterResult(d, rows, NOW);
      expect(done.sort()).toEqual(["a", "b"]);
      expect(month(d, "a")).toBe(3 * 10 + 10 + CHALLENGE_POINTS);
      expect(applyShooterResult(d, rows, NOW)).toEqual([]);
      expect(month(d, "a")).toBe(5 * 10 + CHALLENGE_POINTS);
      expect(d.challenges[WEEK].a.doneAt).toBe(NOW);
      // na semana seguinte (mesmo desafio forçado) paga de novo
      const next = NOW + 7 * 86400000;
      for (let i = 0; i < 3; i++) applyShooterResult(d, rows, next);
      expect(applyShooterResult(d, rows, next)).toEqual(["a", "b"]);
    } finally {
      restore();
    }
  });
});

describe("rankingView.desafio", () => {
  it("traz texto, alvo, progresso de quem olha e quem já cumpriu (por nome, ordem de cumprimento)", () => {
    const restore = force("rally-1-vitoria");
    try {
      const d = dataWith(["a", "b", "c"]);
      applyRaceResult(d, [{ accountId: "a", place: 2, finished: true }, { accountId: "b", place: 1, finished: true }, { accountId: "c", place: 3, finished: true }], NOW);
      applyRaceResult(d, [{ accountId: "a", place: 1, finished: true }, { accountId: "b", place: 2, finished: true }], NOW + 1000);
      const v = rankingView(d, NOW + 2000, "a");
      expect(v.desafio).toMatchObject({ id: "rally-1-vitoria", target: 1, points: CHALLENGE_POINTS, week: WEEK });
      expect(v.desafio.text).toBeTruthy();
      expect(v.desafio.mine).toEqual({ value: 1, target: 1, done: true, bestLapMs: null });
      expect(v.desafio.completed.map((c) => c.name)).toEqual(["Nome b", "Nome a"]);
      expect(rankingView(d, NOW + 2000, "c").desafio.mine).toMatchObject({ value: 0, done: false });
      expect(rankingView(d, NOW + 2000).desafio.mine).toBeNull();
      // semana nova: ninguém cumpriu
      expect(rankingView(d, NOW + 8 * 86400000, "a").desafio.completed).toEqual([]);
    } finally {
      restore();
    }
  });
});
