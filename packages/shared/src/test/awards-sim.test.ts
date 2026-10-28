import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "../data/avatar";
import { ITEM_FX, RACE } from "../race/balance";
import { DEFAULT_CHAIR } from "../race/chair";
import { hitRacer } from "../race/items";
import { newKart } from "../race/kart";
import { createRace, getRaceAwards, stepRace } from "../race/match";
import { pointAt, TRACK } from "../race/track";
import type { RaceMatch, Racer } from "../race/types";
import { fireBall, stepProjectiles } from "../sim/abilities";
import { getAwards, queueAction, stepMatch } from "../sim/match";
import { activeMatch } from "./helpers";

const DT = 1000 / 30;

describe("contadores do tiroteio", () => {
  it("disparo conta; acerto da bola e dano causado também", () => {
    const { m, ps } = activeMatch(2);
    ps[1].pos = { x: ps[0].pos.x + 3, z: ps[0].pos.z };
    expect(fireBall(m, ps[0], Math.PI / 2)).toBe(true);
    expect(ps[0].shots).toBe(1);
    for (let i = 0; i < 20 && ps[0].shotHits === 0; i++) stepProjectiles(m, DT);
    expect(ps[0].shotHits).toBe(1);
    expect(ps[0].damageDealt).toBeGreaterThan(0);
    expect(ps[1].shots).toBe(0);
  });

  it("disparo bloqueado pelo intervalo não conta", () => {
    const { m, ps } = activeMatch(2);
    fireBall(m, ps[0], 0);
    expect(fireBall(m, ps[0], 0)).toBe(false);
    expect(ps[0].shots).toBe(1);
  });

  it("esquiva conta só quando executada", () => {
    const { m, ps } = activeMatch(2);
    queueAction(m, "p0", { kind: "dodge", yaw: 0 });
    stepMatch(m, DT);
    expect(ps[0].dodges).toBe(1);
    queueAction(m, "p0", { kind: "dodge", yaw: 0 });
    stepMatch(m, DT);
    expect(ps[0].dodges).toBe(1);
  });

  it("a partida leva a semente e getAwards respeita só dados reais", () => {
    const { m, ps } = activeMatch(3);
    expect(m.seed).toBe(42);
    expect(getAwards(m)).toEqual([]);
    ps[0].deaths = 5;
    ps[1].dodges = 7;
    const a = getAwards(m);
    expect(a.map((x) => x.id).sort()).toEqual(["esquivador", "kamikaze"]);
    expect(a.find((x) => x.id === "kamikaze")!.winnerId).toBe("p0");
    expect(getAwards(m)).toEqual(a);
  });
});

function setup(n: number, opts: { timeTrial?: boolean } = {}): { race: RaceMatch; rs: Racer[] } {
  const race = createRace({
    seed: 7,
    timeTrial: opts.timeTrial,
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, avatar: DEFAULT_AVATAR, chair: DEFAULT_CHAIR, isBot: false })),
  });
  race.now = RACE.countdownMs;
  race.phase = "active";
  const rs = [...race.racers.values()].sort((a, b) => a.id.localeCompare(b.id));
  rs.forEach((r, i) => {
    const at = pointAt(TRACK, 20 + i * 9);
    r.kart = newKart(at.pos, at.heading);
  });
  return { race, rs };
}

describe("contadores do Rally", () => {
  it("acerto em outro conta para quem atacou; Pasta e autoacerto não contam", () => {
    const { race, rs } = setup(2);
    hitRacer(race, rs[1], "spin", "p0");
    expect(rs[0].itemHits).toBe(1);
    rs[1].shieldUntil = race.now + 1000;
    hitRacer(race, rs[1], "spin", "p0");
    expect(rs[0].itemHits).toBe(1);
    hitRacer(race, rs[0], "slip", "p0");
    hitRacer(race, rs[0], "slip", null);
    expect(rs[0].itemHits).toBe(1);
    expect(ITEM_FX.spinMs).toBeGreaterThan(0);
  });

  it("parado conta tempo; andando, não", () => {
    const { race, rs } = setup(2);
    for (let i = 0; i < 30; i++) stepRace(race, DT);
    expect(rs[0].stoppedMs).toBeGreaterThan(900);
    const before = rs[0].stoppedMs;
    rs[0].kart.speed = 10;
    stepRace(race, DT);
    expect(rs[0].stoppedMs).toBe(before);
  });

  it("contramão acumula sem zerar quando volta a andar certo", () => {
    const { race, rs } = setup(2);
    const at = pointAt(TRACK, 20);
    rs[0].kart = newKart(at.pos, at.heading + Math.PI);
    rs[0].kart.speed = 8;
    for (let i = 0; i < 15; i++) {
      rs[0].kart.speed = 8;
      stepRace(race, DT);
    }
    const total = rs[0].wrongTotalMs;
    expect(total).toBeGreaterThan(0);
    rs[0].kart = newKart(at.pos, at.heading);
    stepRace(race, DT);
    expect(rs[0].wrongTotalMs).toBe(total);
  });

  it("batida no muro conta", () => {
    const { race, rs } = setup(2);
    const at = pointAt(TRACK, 20);
    rs[0].kart = newKart(at.pos, at.heading + Math.PI / 2);
    for (let i = 0; i < 90 && rs[0].wallHits === 0; i++) {
      rs[0].kart.speed = 14;
      stepRace(race, DT);
    }
    expect(rs[0].wallHits).toBeGreaterThan(0);
  });

  it("prêmios da corrida: só com dados, vazio no contra o relógio", () => {
    const { race, rs } = setup(3);
    rs[0].itemHits = 4;
    rs[1].wallHits = 2;
    rs[2].lap.bestLapMs = 50000;
    const a = getRaceAwards(race);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(3);
    expect(getRaceAwards(race)).toEqual(a);
    const tt = setup(2, { timeTrial: true });
    tt.rs[0].itemHits = 3;
    expect(getRaceAwards(tt.race)).toEqual([]);
  });
});
