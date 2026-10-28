import { describe, expect, it } from "vitest";
import { ClientMsg } from "../protocol";
import { DEFAULT_AVATAR } from "../data/avatar";
import { RACE } from "../race/balance";
import { DEFAULT_CHAIR } from "../race/chair";
import { createRace, queueItemUse, stepRace } from "../race/match";
import { giveItem } from "../race/items";
import { BOT_LEVELS, LAPS_MAX, LAPS_MIN, RACE_BOT, SHOOTER_BOT, type BotLevel } from "../botLevels";
import { createMatch, stepMatch } from "../sim/match";

const DT = 1000 / 30;

function botRace(level: BotLevel | undefined, opts: { laps?: number; itemsOff?: boolean } = {}) {
  return createRace({
    seed: 11,
    laps: opts.laps,
    itemsOff: opts.itemsOff,
    botLevel: level,
    players: Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, avatar: DEFAULT_AVATAR, chair: DEFAULT_CHAIR, isBot: true })),
  });
}

const totalProgress = (ms: number, level: BotLevel | undefined) => {
  const r = botRace(level);
  for (let t = 0; t < ms; t += DT) stepRace(r, DT);
  return [...r.racers.values()].reduce((a, x) => a + x.progress, 0);
};

describe("mensagem de opções da sala (Zod)", () => {
  it("aceita voltas de 1 a 5, itens e dificuldade", () => {
    for (let laps = LAPS_MIN; laps <= LAPS_MAX; laps++) expect(ClientMsg.safeParse({ t: "options", laps }).success).toBe(true);
    expect(ClientMsg.safeParse({ t: "options", items: false, botLevel: "hard" }).success).toBe(true);
  });
  it("recusa voltas 0 e 6, fracionadas e dificuldade desconhecida", () => {
    expect(ClientMsg.safeParse({ t: "options", laps: 0 }).success).toBe(false);
    expect(ClientMsg.safeParse({ t: "options", laps: 6 }).success).toBe(false);
    expect(ClientMsg.safeParse({ t: "options", laps: 2.5 }).success).toBe(false);
    expect(ClientMsg.safeParse({ t: "options", botLevel: "impossivel" }).success).toBe(false);
  });
});

describe("dificuldade dos bots", () => {
  it("normal é exatamente o comportamento de antes", () => {
    expect(SHOOTER_BOT.normal).toEqual({ thinkBaseMs: 350, thinkRangeMs: 500, aimError: 0.24, speed: 1, abilityRate: 0.02, dodgeRate: 0.01, fireRange: 22 });
    expect(RACE_BOT.normal).toEqual({ lookBase: 6, lookSpeed: 0.35, steerGain: 2.5, throttleMax: 1, cornerThrottle: 0.2, laneSpread: 0.9, holdScale: 1, rangeScale: 1 });
    expect(BOT_LEVELS).toEqual(["easy", "normal", "hard"]);
  });

  it("sem nível informado a corrida e o tiroteio se comportam como normal", () => {
    expect(totalProgress(40000, undefined)).toBe(totalProgress(40000, "normal"));
    const run = (level?: BotLevel) => {
      const m = createMatch({ durationMs: 60000, seed: 5, botLevel: level, players: ["a", "b", "c"].map((id) => ({ id, name: id, avatar: DEFAULT_AVATAR, isBot: true })) });
      for (let t = 0; t < 20000; t += DT) stepMatch(m, DT);
      return [...m.players.values()].map((p) => [p.pos.x, p.pos.z, p.hp, p.score]);
    };
    expect(run()).toEqual(run("normal"));
  });

  it("difícil é mais forte e fácil mais fraco, nos números do tiroteio", () => {
    const { easy, normal, hard } = SHOOTER_BOT;
    expect(hard.aimError).toBeLessThan(normal.aimError);
    expect(normal.aimError).toBeLessThan(easy.aimError);
    expect(hard.thinkBaseMs).toBeLessThan(normal.thinkBaseMs);
    expect(easy.thinkBaseMs).toBeGreaterThan(normal.thinkBaseMs);
    expect(easy.speed).toBeLessThan(normal.speed);
    expect(hard.abilityRate).toBeGreaterThan(normal.abilityRate);
    expect(easy.fireRange).toBeLessThan(hard.fireRange);
  });

  it("na pista, bots difíceis andam mais que normais e os fáceis menos", () => {
    const easy = totalProgress(60000, "easy");
    const normal = totalProgress(60000, "normal");
    const hard = totalProgress(60000, "hard");
    expect(easy).toBeLessThan(normal);
    expect(hard).toBeGreaterThan(normal);
  });
});

describe("opções da corrida", () => {
  it("sem itens: nenhuma caixa e o uso de item não faz nada", () => {
    const r = botRace(undefined, { itemsOff: true });
    expect(r.boxes).toHaveLength(0);
    const racer = [...r.racers.values()][0];
    giveItem(racer, "expresso");
    queueItemUse(r, racer.id);
    expect(racer.useQueued).toBe(false);
    for (let t = 0; t < 30000; t += DT) stepRace(r, DT);
    expect(r.hazards).toHaveLength(0);
    expect(Object.keys(racer.itemsUsed)).toHaveLength(0);
  });

  it("com itens (padrão) as caixas existem", () => {
    expect(botRace(undefined).boxes.length).toBeGreaterThan(0);
  });

  it("a opção de voltas encerra a corrida depois de N voltas", () => {
    const r = botRace("normal", { laps: 1 });
    expect(r.laps).toBe(1);
    let t = 0;
    while (r.phase !== "finished" && t < 6 * 60000) {
      stepRace(r, DT);
      t += DT;
    }
    expect(r.phase).toBe("finished");
    expect([...r.racers.values()].some((x) => x.lap.finishedAt !== null)).toBe(true);
    expect(botRace(undefined).laps).toBe(RACE.laps);
  });
});
