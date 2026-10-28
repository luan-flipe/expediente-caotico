import { describe, expect, it } from "vitest";
import { BALANCE } from "../data/balance";
import { OFFICE_MAP } from "../data/map";
import { castAbility, resolveAbility } from "../sim/abilities";
import { applyDamage, applyStatus, hasStatus, speedMult } from "../sim/combat";
import { stepMatch } from "../sim/match";
import { activeMatch, give } from "./helpers";

describe("dano e efeitos", () => {
  it("escudo absorve antes da vida", () => {
    const { m, ps } = activeMatch(2);
    ps[1].shield = 30;
    ps[1].shieldUntil = m.now + 4000;
    expect(applyDamage(m, ps[1], 20, "p0")).toBe(20);
    expect(ps[1].shield).toBe(10);
    expect(ps[1].hp).toBe(100);
  });

  it("invulnerável não toma dano nem dá XP", () => {
    const { m, ps } = activeMatch(2);
    ps[1].invulnUntil = m.now + 1000;
    const xp = ps[0].xp;
    expect(applyDamage(m, ps[1], 50, "p0")).toBe(0);
    expect(ps[0].xp).toBe(xp);
  });

  it("dano dá XP ao atacante", () => {
    const { m, ps } = activeMatch(2);
    applyDamage(m, ps[1], 15, "p0");
    expect(ps[0].xp).toBe(15);
  });

  it("segundo stun dentro da imunidade é ignorado", () => {
    const { m, ps } = activeMatch(2);
    applyStatus(m, ps[1], "stun", 800);
    expect(hasStatus(ps[1], "stun", m.now)).toBe(true);
    m.now += 900;
    applyStatus(m, ps[1], "stun", 800);
    expect(hasStatus(ps[1], "stun", m.now)).toBe(false);
    m.now += BALANCE.stunImmunityMs;
    applyStatus(m, ps[1], "stun", 800);
    expect(hasStatus(ps[1], "stun", m.now)).toBe(true);
  });

  it("lento 50% com acelerado 1,5 resulta em 0,75", () => {
    const { m, ps } = activeMatch(1);
    applyStatus(m, ps[0], "slow", 1000, 0.5);
    applyStatus(m, ps[0], "haste", 1000, 1.5);
    expect(speedMult(ps[0], m.now)).toBeCloseTo(0.75, 5);
  });

  it("dois golpes letais no mesmo tick contam uma eliminação", () => {
    const { m, ps } = activeMatch(3);
    ps[2].hp = 5;
    applyDamage(m, ps[2], 10, "p0");
    applyDamage(m, ps[2], 10, "p1");
    expect(ps[2].deaths).toBe(1);
    expect(ps[0].kills + ps[1].kills).toBe(1);
  });
});

describe("habilidades", () => {
  it("especialização A da Cadeira aumenta o raio em 40%", () => {
    const r = resolveAbility([{ id: "A2", level: 3, spec: "A", readyAt: 0 }], "A2");
    expect(r.radius).toBeCloseTo(3.5 * 1.4, 5);
    expect(r.damage).toBeCloseTo(20 * 1.3, 5);
  });

  it("sinergia Rede instável adiciona lentidão ao Choque", () => {
    const owned = [
      { id: "A1" as const, level: 1, readyAt: 0 },
      { id: "D1" as const, level: 1, readyAt: 0 },
    ];
    expect(resolveAbility(owned, "A1").slowMs).toBe(1000);
    expect(resolveAbility(owned.slice(0, 1), "A1").slowMs).toBeUndefined();
  });

  it("recarga ativa impede lançar e não muda o tempo", () => {
    const { m, ps } = activeMatch(2);
    give(ps[0], "A2");
    expect(castAbility(m, ps[0], 0, 0, 5)).toBe(true);
    const ready = ps[0].abilities[0].readyAt;
    expect(castAbility(m, ps[0], 0, 0, 5)).toBe(false);
    expect(ps[0].abilities[0].readyAt).toBe(ready);
  });

  it("atordoado ou morto não lança e não gasta recarga", () => {
    const { m, ps } = activeMatch(2);
    give(ps[0], "A2");
    applyStatus(m, ps[0], "stun", 800);
    expect(castAbility(m, ps[0], 0, 0, 5)).toBe(false);
    expect(ps[0].abilities[0].readyAt).toBe(0);
    ps[1].alive = false;
    give(ps[1], "A2");
    expect(castAbility(m, ps[1], 0, 0, 5)).toBe(false);
  });

  it("Choque do TI salta no máximo para chains alvos", () => {
    const { m, ps } = activeMatch(6);
    give(ps[0], "A1");
    // yaw pi/2 aponta para +x
    expect(castAbility(m, ps[0], 0, Math.PI / 2, 10)).toBe(true);
    const hit = ps.slice(1).filter((p) => p.hp < 100).length;
    expect(hit).toBe(3);
  });

  it("Choque do TI não atravessa parede", () => {
    const orig = OFFICE_MAP.boxes;
    try {
      OFFICE_MAP.boxes = [{ x: 5, z: -8, w: 10, d: 2, h: 3, kind: "wall" }];
      const { m, ps } = activeMatch(2);
      give(ps[0], "A1");
      ps[0].pos = { x: 5, z: -11 };
      ps[1].pos = { x: 5, z: -5 };
      castAbility(m, ps[0], 0, 0, 10);
      expect(ps[1].hp).toBe(100);
    } finally {
      OFFICE_MAP.boxes = orig;
    }
  });

  it("projétil para na parede", () => {
    const orig = OFFICE_MAP.boxes;
    try {
      OFFICE_MAP.boxes = [{ x: 5, z: -8, w: 10, d: 2, h: 3, kind: "wall" }];
      const { m, ps } = activeMatch(2);
      ps[0].pos = { x: 5, z: -11 };
      ps[1].pos = { x: 5, z: -5 };
      ps[0].input = { mx: 0, mz: 0, yaw: 0, fire: true };
      for (let i = 0; i < 60; i++) stepMatch(m, 1000 / 30);
      expect(ps[1].hp).toBe(100);
    } finally {
      OFFICE_MAP.boxes = orig;
    }
  });

  it("bolinha acerta em linha livre", () => {
    const { m, ps } = activeMatch(2);
    ps[0].input = { mx: 0, mz: 0, yaw: Math.PI / 2, fire: true };
    for (let i = 0; i < 10; i++) stepMatch(m, 1000 / 30);
    expect(ps[1].hp).toBeLessThan(100);
  });

  it("teletransporte não termina dentro de caixa", () => {
    const orig = OFFICE_MAP.boxes;
    try {
      OFFICE_MAP.boxes = [{ x: 4, z: -1, w: 4, d: 3, h: 1, kind: "desk" }];
      const { m, ps } = activeMatch(1);
      give(ps[0], "D3");
      ps[0].pos = { x: 4, z: 3 };
      castAbility(m, ps[0], 0, Math.PI, 5);
      const p = ps[0].pos;
      const inside = (bx: number, bz: number, w: number, d: number) =>
        Math.abs(p.x - bx) < w / 2 + BALANCE.playerRadius && Math.abs(p.z - bz) < d / 2 + BALANCE.playerRadius;
      expect(inside(4, -1, 4, 3)).toBe(false);
    } finally {
      OFFICE_MAP.boxes = orig;
    }
  });
});
