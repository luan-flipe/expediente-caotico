import { describe, expect, it } from "vitest";
import {
  applyLap,
  applyRaceResult,
  applyShooterResult,
  emptyRankingData,
  matchCounts,
  monthKey,
  PARTICIPATION_POINTS,
  PLACE_POINTS,
  RECORD_POINTS,
  rankingView,
} from "../ranking/rules";
import type { GhostSample, RankingData } from "../ranking/types";

const NOW = Date.UTC(2026, 9, 15, 15, 0, 0); // 15/10/2026
const TRACK = "corporativo";

function dataWith(ids: string[]): RankingData {
  const d = emptyRankingData();
  for (const id of ids) d.accounts[id] = { email: `${id}@x.com`, name: `Nome ${id}`, since: 1 };
  return d;
}

const pts = (d: RankingData, id: string) => d.months["2026-10"]?.[id] ?? 0;
const ghost = (n: number): GhostSample[] => Array.from({ length: n }, (_, i) => [i * 100, i, i, 0]);

describe("constantes", () => {
  it("pontos do spec", () => {
    expect(PLACE_POINTS).toEqual([10, 6, 4]);
    expect(PARTICIPATION_POINTS).toBe(1);
    expect(RECORD_POINTS).toBe(5);
  });
});

describe("monthKey", () => {
  it("usa o horário de Brasília na virada do mês", () => {
    expect(monthKey(new Date("2026-11-01T02:30:00Z"))).toBe("2026-10");
    expect(monthKey(new Date("2026-11-01T02:59:59Z"))).toBe("2026-10");
    expect(monthKey(new Date("2026-11-01T03:00:00Z"))).toBe("2026-11");
    expect(monthKey(new Date("2026-01-01T02:00:00Z"))).toBe("2025-12");
  });
});

describe("matchCounts", () => {
  it("exige 2 ou mais contas distintas", () => {
    expect(matchCounts([])).toBe(false);
    expect(matchCounts([{ accountId: "a" }, { accountId: null }, { accountId: null }])).toBe(false);
    expect(matchCounts([{ accountId: "a" }, { accountId: "a" }])).toBe(false);
    expect(matchCounts([{ accountId: "a" }, { accountId: "b" }, { accountId: null }])).toBe(true);
  });
});

describe("tiroteio", () => {
  it("partida com 1 conta (e bots) não conta", () => {
    const d = dataWith(["a"]);
    applyShooterResult(d, [{ accountId: "a", rank: 1, kills: 9 }, { accountId: null, rank: 2, kills: 3 }], NOW);
    expect(d.stats).toEqual({});
    expect(d.months).toEqual({});
  });

  it("com 2 ou mais contas dá 10/6/4/1 e atualiza estatísticas", () => {
    const d = dataWith(["a", "b", "c", "d"]);
    applyShooterResult(
      d,
      [
        { accountId: "a", rank: 1, kills: 7 },
        { accountId: "b", rank: 2, kills: 4 },
        { accountId: "c", rank: 3, kills: 2 },
        { accountId: "d", rank: 4, kills: 0 },
      ],
      NOW,
    );
    expect([pts(d, "a"), pts(d, "b"), pts(d, "c"), pts(d, "d")]).toEqual([10, 6, 4, 1]);
    expect(d.stats.a).toMatchObject({ shooterWins: 1, shooterMatches: 1, shooterKills: 7 });
    expect(d.stats.b).toMatchObject({ shooterWins: 0, shooterMatches: 1, shooterKills: 4 });
    expect(d.stats.d.raceMatches).toBe(0);
  });

  it("conta repetida (duas abas) pontua uma vez, com a melhor colocação", () => {
    const d = dataWith(["a", "b"]);
    applyShooterResult(
      d,
      [
        { accountId: "a", rank: 3, kills: 5 },
        { accountId: "b", rank: 2, kills: 1 },
        { accountId: "a", rank: 1, kills: 2 },
      ],
      NOW,
    );
    expect(pts(d, "a")).toBe(10);
    expect(d.stats.a).toMatchObject({ shooterWins: 1, shooterMatches: 1, shooterKills: 2 });
  });

  it("duas abas da mesma conta, sozinhas, não contam", () => {
    const d = dataWith(["a"]);
    applyShooterResult(d, [{ accountId: "a", rank: 1, kills: 1 }, { accountId: "a", rank: 2, kills: 0 }], NOW);
    expect(d.stats).toEqual({});
  });

  it("empate no primeiro lugar dá vitória a todos os empatados", () => {
    const d = dataWith(["a", "b", "c"]);
    applyShooterResult(
      d,
      [
        { accountId: "a", rank: 1, kills: 5 },
        { accountId: "b", rank: 1, kills: 5 },
        { accountId: "c", rank: 3, kills: 1 },
      ],
      NOW,
    );
    expect(d.stats.a.shooterWins).toBe(1);
    expect(d.stats.b.shooterWins).toBe(1);
    expect(d.stats.c.shooterWins).toBe(0);
    expect([pts(d, "a"), pts(d, "b"), pts(d, "c")]).toEqual([10, 10, 4]);
  });

  it("acumula entre partidas", () => {
    const d = dataWith(["a", "b"]);
    const rows = [
      { accountId: "a", rank: 1, kills: 3 },
      { accountId: "b", rank: 2, kills: 1 },
    ];
    applyShooterResult(d, rows, NOW);
    applyShooterResult(d, rows, NOW);
    expect(d.stats.a).toMatchObject({ shooterWins: 2, shooterMatches: 2, shooterKills: 6 });
    expect(pts(d, "a")).toBe(20);
  });
});

describe("rally", () => {
  it("partida com 1 conta não conta", () => {
    const d = dataWith(["a"]);
    applyRaceResult(d, [{ accountId: "a", place: 1 }, { accountId: null, place: 2 }], NOW);
    expect(d.stats).toEqual({});
    expect(d.months).toEqual({});
  });

  it("com 2 ou mais contas dá 10/6/4/1, vitórias, pódios e corridas", () => {
    const d = dataWith(["a", "b", "c", "d"]);
    applyRaceResult(
      d,
      [
        { accountId: "a", place: 1 },
        { accountId: "b", place: 2 },
        { accountId: "c", place: 3 },
        { accountId: "d", place: 4 },
      ],
      NOW,
    );
    expect([pts(d, "a"), pts(d, "b"), pts(d, "c"), pts(d, "d")]).toEqual([10, 6, 4, 1]);
    expect(d.stats.a).toMatchObject({ raceWins: 1, racePodiums: 1, raceMatches: 1 });
    expect(d.stats.c).toMatchObject({ raceWins: 0, racePodiums: 1, raceMatches: 1 });
    expect(d.stats.d).toMatchObject({ raceWins: 0, racePodiums: 0, raceMatches: 1 });
    expect(d.stats.a.shooterMatches).toBe(0);
  });

  it("conta repetida pontua uma vez, com a melhor colocação", () => {
    const d = dataWith(["a", "b"]);
    applyRaceResult(d, [{ accountId: "a", place: 4 }, { accountId: "b", place: 2 }, { accountId: "a", place: 1 }], NOW);
    expect(pts(d, "a")).toBe(10);
    expect(d.stats.a).toMatchObject({ raceWins: 1, raceMatches: 1 });
  });
});

describe("voltas", () => {
  it("primeira volta vira fantasma e recorde", () => {
    const d = dataWith(["a"]);
    const r = applyLap(d, TRACK, "a", 60000, ghost(3), NOW);
    expect(r).toEqual({ personalBest: true, record: true });
    expect(d.laps[TRACK].a).toEqual({ ms: 60000, at: NOW, ghost: ghost(3) });
    expect(d.stats.a.bestLapMs).toBe(60000);
    expect(pts(d, "a")).toBe(RECORD_POINTS);
  });

  it("volta pior não troca o fantasma nem pontua", () => {
    const d = dataWith(["a"]);
    applyLap(d, TRACK, "a", 60000, ghost(3), NOW);
    const r = applyLap(d, TRACK, "a", 61000, ghost(5), NOW + 1000);
    expect(r).toEqual({ personalBest: false, record: false });
    expect(d.laps[TRACK].a).toEqual({ ms: 60000, at: NOW, ghost: ghost(3) });
    expect(d.stats.a.bestLapMs).toBe(60000);
    expect(pts(d, "a")).toBe(RECORD_POINTS);
  });

  it("volta igual à própria não troca o fantasma", () => {
    const d = dataWith(["a"]);
    applyLap(d, TRACK, "a", 60000, ghost(3), NOW);
    expect(applyLap(d, TRACK, "a", 60000, ghost(5), NOW + 1)).toEqual({ personalBest: false, record: false });
    expect(d.laps[TRACK].a.ghost).toEqual(ghost(3));
  });

  it("melhor que a própria, mas longe do recorde da firma: troca o fantasma, sem pontos", () => {
    const d = dataWith(["a", "b"]);
    applyLap(d, TRACK, "a", 50000, ghost(2), NOW);
    applyLap(d, TRACK, "b", 70000, ghost(3), NOW);
    const r = applyLap(d, TRACK, "b", 65000, ghost(4), NOW + 5);
    expect(r).toEqual({ personalBest: true, record: false });
    expect(d.laps[TRACK].b).toEqual({ ms: 65000, at: NOW + 5, ghost: ghost(4) });
    expect(d.stats.b.bestLapMs).toBe(65000);
    expect(pts(d, "b")).toBe(0);
  });

  it("recorde novo da firma soma 5 pontos no mês", () => {
    const d = dataWith(["a", "b"]);
    applyLap(d, TRACK, "a", 50000, ghost(2), NOW);
    const r = applyLap(d, TRACK, "b", 49000, ghost(3), NOW + 1);
    expect(r).toEqual({ personalBest: true, record: true });
    expect(pts(d, "b")).toBe(RECORD_POINTS);
  });

  it("melhorar o próprio recorde continua sendo recorde, mas não soma pontos de novo", () => {
    const d = dataWith(["a", "b"]);
    applyLap(d, TRACK, "b", 52000, ghost(2), NOW);
    applyLap(d, TRACK, "a", 50000, ghost(2), NOW + 1);
    expect(pts(d, "a")).toBe(RECORD_POINTS);
    expect(applyLap(d, TRACK, "a", 49000, ghost(3), NOW + 2)).toEqual({ personalBest: true, record: true });
    expect(applyLap(d, TRACK, "a", 48000, ghost(3), NOW + 3)).toEqual({ personalBest: true, record: true });
    expect(pts(d, "a")).toBe(RECORD_POINTS);
    expect(d.laps[TRACK].a.ms).toBe(48000);
  });

  it("empatar o recorde da firma não é recorde novo", () => {
    const d = dataWith(["a", "b"]);
    applyLap(d, TRACK, "a", 50000, ghost(2), NOW);
    expect(applyLap(d, TRACK, "b", 50000, ghost(3), NOW + 1)).toEqual({ personalBest: true, record: false });
    expect(pts(d, "b")).toBe(0);
  });

  it("os pontos do recorde caem no mês de Brasília", () => {
    const d = dataWith(["a"]);
    applyLap(d, TRACK, "a", 50000, ghost(2), Date.parse("2026-11-01T02:30:00Z"));
    expect(d.months["2026-10"].a).toBe(RECORD_POINTS);
    expect(d.months["2026-11"]).toBeUndefined();
  });
});

describe("rankingView", () => {
  it("dados vazios devolvem as 4 abas vazias", () => {
    const v = rankingView(emptyRankingData(), NOW);
    for (const tab of [v.mes, v.tiroteio, v.rally, v.voltas]) {
      expect(tab.rows).toEqual([]);
      expect(tab.me).toBeNull();
    }
    expect(v.mesPassado).toBeNull();
  });

  it("ordena as abas e usa os nomes das contas", () => {
    const d = dataWith(["a", "b", "c"]);
    applyShooterResult(
      d,
      [
        { accountId: "a", rank: 2, kills: 9 },
        { accountId: "b", rank: 1, kills: 3 },
        { accountId: "c", rank: 3, kills: 0 },
      ],
      NOW,
    );
    applyRaceResult(d, [{ accountId: "c", place: 1 }, { accountId: "a", place: 2 }, { accountId: "b", place: 3 }], NOW);
    applyLap(d, TRACK, "a", 61000, ghost(1), NOW);
    applyLap(d, TRACK, "b", 59000, ghost(1), NOW);
    const v = rankingView(d, NOW);
    expect(v.tiroteio.rows.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(v.tiroteio.rows[0]).toMatchObject({ rank: 1, name: "Nome b", wins: 1, matches: 1, kills: 3 });
    expect(v.rally.rows.map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(v.rally.rows[0]).toMatchObject({ name: "Nome c", wins: 1, podiums: 1, matches: 1 });
    expect(v.voltas.rows.map((r) => r.id)).toEqual(["b", "a"]);
    expect(v.voltas.rows[0]).toMatchObject({ name: "Nome b", ms: 59000 });
    // b: 10 (tiroteio) + 4 (rally) + 5 (recorde) = 19; a: 6 + 6 + 5 = 17; c: 4 + 10 = 14
    expect(v.mes.rows.map((r) => [r.id, r.points])).toEqual([
      ["b", 19],
      ["a", 17],
      ["c", 14],
    ]);
  });

  it("mostra só 20 linhas e destaca o jogador fora do top", () => {
    const ids = Array.from({ length: 25 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const d = dataWith(ids);
    d.months["2026-10"] = {};
    d.laps[TRACK] = {};
    ids.forEach((id, i) => {
      d.stats[id] = { shooterWins: 0, shooterMatches: 1, shooterKills: 100 - i, raceWins: 0, racePodiums: 0, raceMatches: 0, bestLapMs: null };
      d.months["2026-10"][id] = 1000 - i;
      d.laps[TRACK][id] = { ms: 50000 + i, at: 1, ghost: [] };
    });
    const v = rankingView(d, NOW, "p24");
    for (const tab of [v.mes, v.tiroteio, v.voltas]) {
      expect(tab.rows).toHaveLength(20);
      expect(tab.rows.some((r) => r.id === "p24")).toBe(false);
      expect(tab.me).toMatchObject({ id: "p24", rank: 25, name: "Nome p24" });
    }
    expect(v.mes.me?.points).toBe(976);
    expect(v.rally.rows).toEqual([]);
    expect(v.rally.me).toBeNull();
    expect(rankingView(d, NOW, "p02").mes.me).toMatchObject({ id: "p02", rank: 3 });
    expect(rankingView(d, NOW).mes.me).toBeNull();
  });

  it("mês anterior fica guardado e o mês atual zera", () => {
    const d = dataWith(["a", "b"]);
    const oct = Date.UTC(2026, 9, 20, 12);
    const nov = Date.UTC(2026, 10, 2, 12);
    applyShooterResult(d, [{ accountId: "a", rank: 2, kills: 0 }, { accountId: "b", rank: 1, kills: 0 }], oct);
    const v = rankingView(d, nov, "a");
    expect(v.mes.rows).toEqual([]);
    expect(v.mes.me).toBeNull();
    expect(v.mesPassado).toEqual({ month: "2026-10", id: "b", name: "Nome b", points: 10 });
    expect(rankingView(d, oct).mesPassado).toBeNull();
  });

  it("vencedor do mês passado atravessa a virada de ano", () => {
    const d = dataWith(["a"]);
    d.months["2025-12"] = { a: 7 };
    const v = rankingView(d, Date.UTC(2026, 0, 10, 12));
    expect(v.mesPassado).toMatchObject({ month: "2025-12", id: "a", points: 7 });
  });
});
