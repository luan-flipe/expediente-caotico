import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "../data/avatar";
import { mulberry32 } from "../rng";
import { ITEM_FX, RACE } from "../race/balance";
import { DEFAULT_CHAIR } from "../race/chair";
import { giveItem, ITEM_IDS, ITEM_WEIGHTS, pickBoxes, rollItem, stepHazards, useItem } from "../race/items";
import { newKart } from "../race/kart";
import { createRace, stepRace } from "../race/match";
import { pointAt, sideNormal, TRACK } from "../race/track";
import type { RaceMatch, Racer } from "../race/types";

const DT = 1000 / 30;

/** Corrida já valendo, com as cadeiras paradas em fila na reta (s crescente = mais à frente). */
function setup(n: number): { race: RaceMatch; rs: Racer[] } {
  const race = createRace({
    seed: 7,
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, avatar: DEFAULT_AVATAR, chair: DEFAULT_CHAIR, isBot: false })),
  });
  race.now = RACE.countdownMs;
  race.phase = "active";
  const rs = [...race.racers.values()].sort((a, b) => a.id.localeCompare(b.id));
  rs.forEach((r, i) => place(r, 2 + i * 9));
  rs.forEach((r, i) => (r.place = n - i));
  race.boxes = [];
  return { race, rs };
}

function place(r: Racer, s: number, lateral = 0): void {
  const at = pointAt(TRACK, s);
  const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
  r.kart = newKart({ x: at.pos.x + nrm.x * lateral, z: at.pos.z + nrm.z * lateral }, at.heading);
}

function tick(race: RaceMatch, ms: number): void {
  for (let t = 0; t < ms; t += DT) {
    race.now += DT;
    stepHazards(race, DT);
  }
}

describe("caixas", () => {
  it("entrega só a quem está vazio e some até reaparecer", () => {
    const { race, rs } = setup(2);
    race.boxes = [{ id: 0, pos: { ...rs[0].kart.pos }, readyAt: 0 }];
    giveItem(rs[0], "pasta");
    pickBoxes(race);
    expect(rs[0].item).toBe("pasta");
    expect(race.boxes[0].readyAt).toBe(0);
    rs[0].item = null;
    pickBoxes(race);
    expect(rs[0].item).not.toBeNull();
    expect(race.boxes[0].readyAt).toBe(race.now + RACE.boxRespawnMs);
    rs[0].item = null;
    pickBoxes(race);
    expect(rs[0].item).toBeNull();
  });

  it("duas cadeiras na mesma caixa no mesmo tick: só uma recebe", () => {
    const { race, rs } = setup(2);
    rs[1].kart.pos = { ...rs[0].kart.pos };
    race.boxes = [{ id: 0, pos: { ...rs[0].kart.pos }, readyAt: 0 }];
    pickBoxes(race);
    expect(rs.filter((r) => r.item !== null)).toHaveLength(1);
  });

  it("usar item no mesmo tick em que pega a caixa não gasta o item novo", () => {
    const { race, rs } = setup(2);
    race.boxes = [{ id: 0, pos: { ...rs[0].kart.pos }, readyAt: 0 }];
    rs[0].useQueued = true;
    stepRace(race, DT);
    expect(rs[0].item).not.toBeNull();
    expect(rs[0].useQueued).toBe(false);
  });
});

describe("sorteio", () => {
  it("respeita os pesos e nunca dá aviãozinho ao 1º", () => {
    const rng = mulberry32(3);
    for (const [place, table] of [
      [3, ITEM_WEIGHTS.front],
      [8, ITEM_WEIGHTS.back],
    ] as const) {
      const count = Object.fromEntries(ITEM_IDS.map((id) => [id, 0]));
      const N = 10000;
      for (let i = 0; i < N; i++) count[rollItem(rng, place, 8)]++;
      for (const id of ITEM_IDS) expect(Math.abs((count[id] / N) * 100 - table[id])).toBeLessThan(2);
      if (place === 3) expect(count.aviao).toBe(0);
    }
  });

  it("1º e 2º nunca tiram post-it (não teriam em quem usar) nem aviãozinho", () => {
    const rng = mulberry32(5);
    for (const [place, total] of [
      [1, 8],
      [2, 8],
      [1, 2],
      [2, 2],
    ]) {
      for (let i = 0; i < 3000; i++) {
        const it = rollItem(rng, place, total);
        expect(it).not.toBe("postit");
        if (place === 1) expect(it).not.toBe("aviao");
      }
    }
  });

  it("quem já terminou não usa item", () => {
    const { race, rs } = setup(2);
    giveItem(rs[0], "grampeador");
    rs[0].lap.finishedAt = race.now;
    rs[0].useQueued = true;
    stepRace(race, DT);
    expect(rs[0].itemsUsed.grampeador).toBeUndefined();
    expect(race.hazards).toHaveLength(0);
  });
});

describe("itens", () => {
  it("usar sem item não faz nada", () => {
    const { race, rs } = setup(2);
    expect(useItem(race, rs[0])).toBe(false);
    expect(race.hazards).toHaveLength(0);
  });

  it("café expresso dá 1,2 s de turbo e o triplo dá 3 usos", () => {
    const { race, rs } = setup(2);
    giveItem(rs[0], "expresso");
    useItem(race, rs[0]);
    expect(rs[0].kart.boostUntil - race.now).toBe(ITEM_FX.expressoMs);
    expect(rs[0].item).toBeNull();
    giveItem(rs[0], "triplo");
    expect(useItem(race, rs[0])).toBe(true);
    expect(useItem(race, rs[0])).toBe(true);
    expect(rs[0].item).toBe("triplo");
    expect(useItem(race, rs[0])).toBe(true);
    expect(rs[0].item).toBeNull();
    expect(useItem(race, rs[0])).toBe(false);
  });

  it("grampo acerta quem está à frente e faz rodopiar 1 s", () => {
    const { race, rs } = setup(2);
    giveItem(rs[0], "grampeador");
    useItem(race, rs[0]);
    tick(race, 600);
    expect(rs[1].kart.spinUntil).toBeGreaterThan(race.now);
    expect(rs[1].kart.spinUntil - race.now).toBeLessThanOrEqual(ITEM_FX.spinMs);
    expect(race.hazards).toHaveLength(0);
  });

  it("grampo para na parede", () => {
    const { race, rs } = setup(2);
    rs[1].kart.pos = { x: 999, z: 999 };
    rs[0].kart.heading += Math.PI / 2;
    giveItem(rs[0], "grampeador");
    useItem(race, rs[0]);
    tick(race, 400);
    expect(race.hazards).toHaveLength(0);
  });

  it("poça faz derrapar 0,8 s e some após o acerto", () => {
    const { race, rs } = setup(2);
    giveItem(rs[1], "poca");
    useItem(race, rs[1]);
    const h = race.hazards[0];
    rs[0].kart.pos = { ...h.pos };
    tick(race, DT);
    expect(rs[0].kart.slipUntil - race.now).toBeGreaterThan(ITEM_FX.pocaSlipMs - 2 * DT);
    expect(race.hazards).toHaveLength(0);
  });

  it("dono não cai na própria poça logo ao largar", () => {
    const { race, rs } = setup(2);
    giveItem(rs[0], "poca");
    useItem(race, rs[0]);
    rs[0].kart.pos = { ...race.hazards[0].pos };
    tick(race, DT);
    expect(rs[0].kart.slipUntil).toBe(0);
  });

  it("resma corta a velocidade de quem bate e some", () => {
    const { race, rs } = setup(2);
    giveItem(rs[1], "resma");
    useItem(race, rs[1]);
    rs[0].kart.speed = 15;
    rs[0].kart.pos = { ...race.hazards[0].pos };
    tick(race, DT);
    expect(rs[0].kart.speed).toBeCloseTo(15 * ITEM_FX.resmaSpeedKeep, 5);
    expect(race.hazards).toHaveLength(0);
  });

  it("aviãozinho persegue só quem está imediatamente à frente", () => {
    const { race, rs } = setup(4); // p0 é o 4º, p1 o 3º, p2 o 2º, p3 o 1º
    giveItem(rs[0], "aviao");
    useItem(race, rs[0]);
    expect(race.hazards[0].targetId).toBe("p1");
    tick(race, 1500);
    expect(rs[1].kart.spinUntil).toBeGreaterThan(0);
    expect(rs[2].kart.spinUntil).toBe(0);
    expect(rs[3].kart.spinUntil).toBe(0);
  });

  it("aviãozinho do 2º não mira o líder", () => {
    const { race, rs } = setup(2);
    giveItem(rs[0], "aviao");
    useItem(race, rs[0]);
    expect(race.hazards[0].targetId).toBeUndefined();
  });

  it("pasta anula um ataque e se gasta", () => {
    const { race, rs } = setup(2);
    giveItem(rs[1], "pasta");
    useItem(race, rs[1]);
    giveItem(rs[0], "grampeador");
    useItem(race, rs[0]);
    tick(race, 600);
    expect(rs[1].kart.spinUntil).toBe(0);
    expect(rs[1].shieldUntil).toBe(0);
    expect(race.events.some((e) => e.type === "hit" && e.kind === "blocked")).toBe(true);
  });

  it("post-it cobre a tela de quem está à frente, nunca do líder", () => {
    const { race, rs } = setup(3);
    giveItem(rs[0], "postit");
    expect(useItem(race, rs[0])).toBe(true);
    expect(rs[1].blindUntil - race.now).toBe(ITEM_FX.postitMs);
    giveItem(rs[1], "postit");
    expect(useItem(race, rs[1])).toBe(false);
    expect(rs[1].item).toBe("postit");
    expect(rs[2].blindUntil).toBe(0);
  });
});
