import { describe, expect, it } from "vitest";
import { MAX_AWARDS, pickAwards, raceCandidates, shooterCandidates, type Award, type RaceStat, type ShooterStat } from "../awards";

const sp = (id: string, o: Partial<ShooterStat> = {}): ShooterStat => ({ id, name: id.toUpperCase(), shots: 30, hits: 15, damage: 100, deaths: 2, dodges: 3, ...o });
const rc = (id: string, o: Partial<RaceStat> = {}): RaceStat => ({ id, name: id.toUpperCase(), wrongMs: 0, itemHits: 0, wallHits: 0, stoppedMs: 0, bestLapMs: 60000, ...o });
const ids = (a: Award[]) => a.map((x) => x.id);

describe("prêmios do tiroteio", () => {
  it("cada prêmio vai para quem tem o maior ou menor valor", () => {
    const c = shooterCandidates([
      sp("a", { damage: 300, deaths: 1, shots: 25, hits: 20, dodges: 1 }),
      sp("b", { damage: 100, deaths: 6, shots: 80, hits: 4, dodges: 9 }),
      sp("c", { damage: 50, deaths: 2, shots: 40, hits: 30, dodges: 2 }),
    ]);
    const by = Object.fromEntries(c.map((x) => [x.id, x.winnerId]));
    expect(by).toEqual({ cafe: "a", kamikaze: "b", pacifista: "a", mira: "b", esquivador: "b" });
    expect(c.find((x) => x.id === "mira")!.detail).toBe("5% de acerto (4 de 80)");
    expect(c.find((x) => x.id === "kamikaze")!.winnerName).toBe("B");
  });

  it("sem dado não tem prêmio: zeros e empates ficam de fora", () => {
    const z = { damage: 0, deaths: 0, dodges: 0, shots: 5, hits: 0 };
    expect(shooterCandidates([sp("a", z), sp("b", z)])).toEqual([]);
  });

  it("mira só vale com disparos suficientes", () => {
    const c = shooterCandidates([sp("a", { shots: 19, hits: 0 }), sp("b", { shots: 25, hits: 10 })]);
    expect(ids(c)).not.toContain("mira");
  });

  it("um jogador sozinho não ganha nada", () => {
    expect(shooterCandidates([sp("a")])).toEqual([]);
  });
});

describe("prêmios do Rally", () => {
  it("só entram prêmios com dado real", () => {
    const c = raceCandidates([rc("a", { wallHits: 4, bestLapMs: 52000 }), rc("b", { wrongMs: 5000, itemHits: 3, stoppedMs: 4500, bestLapMs: 58000 })]);
    const by = Object.fromEntries(c.map((x) => [x.id, x.winnerId]));
    expect(by).toEqual({ contramao: "b", grampeador: "b", muro: "a", turista: "b", volta: "a" });
    expect(c.find((x) => x.id === "turista")!.detail).toBe("4,5 s parado");
  });

  it("tudo zerado não gera nada além da volta mais rápida", () => {
    const c = raceCandidates([rc("a", { bestLapMs: 50000 }), rc("b", { bestLapMs: 51000 })]);
    expect(ids(c)).toEqual(["volta"]);
  });

  it("quem não fechou volta não concorre à volta mais rápida", () => {
    expect(ids(raceCandidates([rc("a", { bestLapMs: null }), rc("b", { bestLapMs: 50000 })]))).not.toContain("volta");
  });
});

describe("sorteio", () => {
  const all = raceCandidates([rc("a", { wallHits: 4, bestLapMs: 52000 }), rc("b", { wrongMs: 5000, itemHits: 3, stoppedMs: 4500, bestLapMs: 58000 })]);

  it("no máximo 3 e todos distintos", () => {
    expect(all.length).toBe(5);
    const r = pickAwards(all, 7);
    expect(r.length).toBe(MAX_AWARDS);
    expect(new Set(ids(r)).size).toBe(MAX_AWARDS);
  });

  it("com menos de 3 candidatos devolve todos; sem candidato, vazio", () => {
    expect(pickAwards(all.slice(0, 2), 1).length).toBe(2);
    expect(pickAwards([], 1)).toEqual([]);
  });

  it("mesma semente dá o mesmo resultado, mesmo com a lista embaralhada", () => {
    expect(pickAwards([...all].reverse(), 99)).toEqual(pickAwards(all, 99));
  });

  it("sementes diferentes variam a escolha", () => {
    const sets = new Set(Array.from({ length: 30 }, (_, s) => ids(pickAwards(all, s)).join()));
    expect(sets.size).toBeGreaterThan(1);
  });
});
