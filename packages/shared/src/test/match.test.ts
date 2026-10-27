import { describe, expect, it } from "vitest";
import { BALANCE } from "../data/balance";
import { DEFAULT_AVATAR } from "../data/avatar";
import { applyDamage } from "../sim/combat";
import { buildSnapshot, createMatch, getResults, queueAction, stepMatch } from "../sim/match";
import { rankPlayers } from "../sim/scoring";
import { activeMatch } from "./helpers";

const TICK = 1000 / 30;

describe("pontuação", () => {
  it("eliminação e assistência", () => {
    const { m, ps } = activeMatch(3);
    applyDamage(m, ps[2], 25, "p1");
    m.now += 1000;
    applyDamage(m, ps[2], 100, "p0");
    expect(ps[0].score).toBe(BALANCE.scoreKill);
    expect(ps[0].kills).toBe(1);
    expect(ps[1].score).toBe(BALANCE.scoreAssist);
    expect(ps[1].assists).toBe(1);
    expect(ps[0].assists).toBe(0);
  });

  it("dano antigo não conta assistência", () => {
    const { m, ps } = activeMatch(3);
    applyDamage(m, ps[2], 25, "p1");
    m.now += BALANCE.assistWindowMs + 100;
    applyDamage(m, ps[2], 100, "p0");
    expect(ps[1].assists).toBe(0);
  });

  it("respawn após 3 s com invulnerabilidade", () => {
    const { m, ps } = activeMatch(2);
    applyDamage(m, ps[1], 200, "p0");
    expect(ps[1].alive).toBe(false);
    stepMatch(m, BALANCE.respawnMs - 100);
    expect(ps[1].alive).toBe(false);
    stepMatch(m, 200);
    expect(ps[1].alive).toBe(true);
    expect(ps[1].hp).toBe(ps[1].maxHp);
    expect(applyDamage(m, ps[1], 10, "p0")).toBe(0);
  });

  it("desempate por eliminações, depois assistências, depois empate", () => {
    const base = { avatar: DEFAULT_AVATAR, isBot: false, abilities: [] };
    const mk = (id: string, score: number, kills: number, assists: number) =>
      ({ ...base, id, name: id, score, kills, assists, deaths: 0 }) as never;
    const r = rankPlayers([mk("a", 100, 1, 0), mk("b", 100, 2, 0), mk("c", 100, 2, 1)]);
    expect(r.map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(r[0].tie).toBe(false);
    const t = rankPlayers([mk("a", 50, 1, 1), mk("b", 50, 1, 1)]);
    expect(t[0].tie).toBe(true);
    expect(t[0].rank).toBe(1);
    expect(t[1].rank).toBe(1);
  });
});

describe("zona de controle", () => {
  function onZone(n: number) {
    const { m, ps } = activeMatch(n);
    for (const p of ps) p.pos = { x: m.objective.x, z: m.objective.z };
    for (const p of ps) p.options = null;
    return { m, ps };
  }

  it("disputada não pontua", () => {
    const { m, ps } = onZone(2);
    for (let i = 0; i < 6 * 30; i++) stepMatch(m, TICK);
    expect(ps[0].score + ps[1].score).toBe(0);
    expect(m.objective.contested).toBe(true);
  });

  it("sozinho por 5 s ganha 10", () => {
    const { m, ps } = onZone(1);
    for (let i = 0; i < 5 * 30 + 2; i++) stepMatch(m, TICK);
    expect(ps[0].score).toBe(BALANCE.scoreZoneTick);
  });

  it("fim do ciclo dá bônus e muda de lugar", () => {
    const { m, ps } = onZone(1);
    const first = { x: m.objective.x, z: m.objective.z };
    const ticks = Math.ceil(BALANCE.objectiveCycleMs / TICK) + 2;
    for (let i = 0; i < ticks; i++) stepMatch(m, TICK);
    expect(ps[0].score).toBeGreaterThanOrEqual(BALANCE.scoreZoneCycle + 80);
    expect({ x: m.objective.x, z: m.objective.z }).not.toEqual(first);
  });
});

describe("ciclo da partida", () => {
  it("countdown, ativa e termina no tempo", () => {
    const m = createMatch({
      durationMs: 5000,
      seed: 1,
      players: [
        { id: "a", name: "A", avatar: DEFAULT_AVATAR, isBot: false },
        { id: "b", name: "B", avatar: DEFAULT_AVATAR, isBot: false },
      ],
    });
    expect(m.phase).toBe("countdown");
    stepMatch(m, BALANCE.countdownMs);
    expect(m.phase).toBe("active");
    stepMatch(m, 5000);
    expect(m.phase).toBe("finished");
    const a = m.players.get("a")!;
    a.abilities.push({ id: "A2", level: 1, readyAt: 0 });
    queueAction(m, "a", { kind: "ability", slot: 0, yaw: 0, dist: 3 });
    stepMatch(m, TICK);
    expect(a.abilities[0].readyAt).toBe(0);
    expect(getResults(m)).toHaveLength(2);
    expect(buildSnapshot(m).phase).toBe("finished");
  });

  it("partida só de bots roda 120 s sem erro", () => {
    const { m, ps } = activeMatch(4, { bots: true, durationMs: 200000 });
    ps.forEach((p, i) => (p.pos = { ...[{ x: -9, z: 5 }, { x: 19, z: 4.5 }, { x: 9, z: 19 }, { x: -1, z: -10.5 }][i] }));
    for (let i = 0; i < 120 * 30; i++) stepMatch(m, TICK);
    const kills = ps.reduce((s, p) => s + p.kills, 0);
    expect(kills).toBeGreaterThan(0);
    expect(ps.every((p) => p.level > 1)).toBe(true);
  });
});
