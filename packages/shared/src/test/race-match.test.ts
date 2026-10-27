import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "../data/avatar";
import { RACE } from "../race/balance";
import { DEFAULT_CHAIR } from "../race/chair";
import { buildRacePrivate, buildRaceSnapshot, createRace, getRaceResults, respawnRequest, setKartInput, stepRace } from "../race/match";
import { progressOf, TRACK } from "../race/track";

const DT = 1000 / 30;

function race(n: number, bots: boolean, laps?: number) {
  return createRace({
    seed: 11,
    laps,
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, avatar: DEFAULT_AVATAR, chair: DEFAULT_CHAIR, isBot: bots })),
  });
}

describe("partida de corrida", () => {
  it("ninguém anda durante a contagem", () => {
    const r = race(4, false);
    const before = [...r.racers.values()].map((x) => ({ ...x.kart.pos }));
    for (const id of r.racers.keys()) setKartInput(r, id, { steer: 0, throttle: 1, drift: false });
    for (let t = 0; t < RACE.countdownMs - DT; t += DT) stepRace(r, DT);
    expect(r.phase).toBe("countdown");
    expect([...r.racers.values()].map((x) => x.kart.pos)).toEqual(before);
    stepRace(r, DT * 2);
    expect(r.phase).toBe("active");
  });

  it("corrida só com 8 bots termina, com todos na 2ª volta ou adiante", () => {
    const r = race(8, true);
    let t = 0;
    let firstAt: number | null = null;
    while (r.phase !== "finished" && t < 6 * 60000) {
      stepRace(r, DT);
      t += DT;
      if (firstAt === null && r.graceEndsAt !== null) firstAt = r.now;
    }
    expect(r.phase).toBe("finished");
    expect(firstAt).not.toBeNull();
    expect(r.now - firstAt!).toBeLessThanOrEqual(RACE.finishGraceMs + DT);
    const rows = getRaceResults(r);
    for (const row of rows) expect(row.lapsDone).toBeGreaterThanOrEqual(1);
    expect(rows[0].totalMs).not.toBeNull();
    expect(rows.map((x) => x.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const finishers = rows.filter((x) => x.totalMs !== null);
    for (let i = 1; i < finishers.length; i++) expect(finishers[i].totalMs!).toBeGreaterThanOrEqual(finishers[i - 1].totalMs!);
    expect(rows.some((x) => x.itemsUsed > 0)).toBe(true);
  }, 20000);

  it("jogador desconectado não segura o fim da corrida", () => {
    const r = race(3, true, 1);
    const human = r.racers.get("p0")!;
    human.isBot = false;
    human.connected = false;
    let t = 0;
    while (r.phase !== "finished" && t < 3 * 60000) {
      stepRace(r, DT);
      t += DT;
    }
    expect(r.phase).toBe("finished");
    expect(r.graceEndsAt === null || r.now < r.graceEndsAt).toBe(true);
    expect(getRaceResults(r).at(-1)!.id).toBe("p0");
  });

  it("R reposiciona no último checkpoint, parado por 2 s", () => {
    const r = race(2, false);
    for (let t = 0; t < RACE.countdownMs + 100; t += DT) stepRace(r, DT);
    const p = r.racers.get("p0")!;
    setKartInput(r, "p0", { steer: 0, throttle: 1, drift: false });
    for (let t = 0; t < 3000; t += DT) stepRace(r, DT);
    expect(p.lap.cpCount).toBeGreaterThanOrEqual(2);
    const cpS = r.cps[(p.lap.cpCount - 1) % r.cps.length];
    respawnRequest(r, "p0");
    stepRace(r, DT);
    expect(Math.abs(progressOf(TRACK, p.kart.pos).s - cpS)).toBeLessThan(1.5);
    const pos = { ...p.kart.pos };
    for (let t = 0; t < 1500; t += DT) stepRace(r, DT);
    expect(p.kart.pos).toEqual(pos);
    for (let t = 0; t < 1000; t += DT) stepRace(r, DT);
    expect(p.kart.pos).not.toEqual(pos);
  });

  it("entrada inválida vira zero e snapshot não expõe item dos outros", () => {
    const r = race(2, false);
    setKartInput(r, "p0", { steer: NaN, throttle: 5, drift: true });
    expect(r.racers.get("p0")!.input).toEqual({ steer: 0, throttle: 1, drift: true });
    r.racers.get("p1")!.item = "grampeador";
    const s = JSON.stringify(buildRaceSnapshot(r));
    expect(s).not.toContain("grampeador");
    expect(buildRacePrivate(r, "p1")!.item).toBe("grampeador");
    expect(buildRacePrivate(r, "ninguem")).toBeNull();
  });
});
