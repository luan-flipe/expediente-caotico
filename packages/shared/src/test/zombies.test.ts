import { describe, expect, it } from "vitest";
import { getGroundHeight } from "../data/map";
import { applyDamage } from "../sim/combat";
import { ZOMBIE_WAVES, createMatch, stepMatch, buildSnapshot, getResults } from "../sim/match";
import type { MatchPlayerInfo } from "../sim/match";

const fakeAvatar = {
  name: "Test",
  skin: 0,
  hair: 0,
  hairColor: 0,
  beard: false,
  glasses: 0,
  shirt: 0,
  pants: 0,
  accessory: 0,
  height: 1,
};

const player1: MatchPlayerInfo = { id: "p1", name: "Alice", avatar: fakeAvatar, isBot: false };
const player2: MatchPlayerInfo = { id: "p2", name: "Bob", avatar: fakeAvatar, isBot: false };

describe("Escadas e relevos do mapa", () => {
  it("getGroundHeight retorna altura correta em plataformas elevadas e chão", () => {
    // Chão plano fora das plataformas
    expect(getGroundHeight(-25, -20)).toBe(0);

    // Colina Central em (0, 0)
    expect(getGroundHeight(0, 0)).toBe(1.0);

    // Mirante Norte em (18, -11)
    expect(getGroundHeight(18, -11)).toBe(1.2);

    // Mirante Sul em (-18, 11)
    expect(getGroundHeight(-18, 11)).toBe(1.1);
  });

  it("getGroundHeight interpola suavemente nas escadas", () => {
    // Escada oeste da Colina Central: centro -5.0, w=2.0 (x de -6.0 a -4.0), subindo com x crescente (direção 1)
    const midHeight = getGroundHeight(-5.0, 0);
    expect(midHeight).toBeGreaterThan(0.2);
    expect(midHeight).toBeLessThan(0.8);

    // No pé da escada oeste
    expect(getGroundHeight(-6.0, 0)).toBeCloseTo(0, 1);
    // No topo da escada oeste
    expect(getGroundHeight(-4.0, 0)).toBeCloseTo(1.0, 1);
  });
});

describe("Modo Sobrevivência Zumbi", () => {
  it("tem 5 hordas progressivas onde quantidade, vida e dano aumentam", () => {
    expect(ZOMBIE_WAVES).toHaveLength(5);
    for (let i = 0; i < ZOMBIE_WAVES.length - 1; i++) {
      const cur = ZOMBIE_WAVES[i];
      const next = ZOMBIE_WAVES[i + 1];
      expect(next.count).toBeGreaterThan(cur.count);
      expect(next.hp).toBeGreaterThan(cur.hp);
      expect(next.damage).toBeGreaterThan(cur.damage);
    }
  });

  it("cria partida no modo zumbi com estado inicial correto", () => {
    const m = createMatch({
      durationMs: 300000,
      seed: 42,
      players: [player1, player2],
      submode: "zombies",
    });

    expect(m.submode).toBe("zombies");
    expect(m.zombieState).toBeDefined();
    expect(m.zombieState?.wave).toBe(1);
    expect(m.zombieState?.maxWaves).toBe(5);
    expect(m.zombieState?.totalZombiesInWave).toBe(ZOMBIE_WAVES[0].count);
    expect(m.zombieState?.waveHp).toBe(ZOMBIE_WAVES[0].hp);
    expect(m.zombieState?.waveDamage).toBe(ZOMBIE_WAVES[0].damage);
  });

  it("desativa fogo amigo entre jogadores humanos no modo zumbi", () => {
    const m = createMatch({
      durationMs: 300000,
      seed: 42,
      players: [player1, player2],
      submode: "zombies",
    });
    m.phase = "active";

    const p1 = m.players.get("p1")!;
    const p2 = m.players.get("p2")!;
    const initialHp = p2.hp;

    // Player 1 ataca Player 2
    const dmg = applyDamage(m, p2, 30, p1.id);
    expect(dmg).toBe(0);
    expect(p2.hp).toBe(initialHp);
  });

  it("spawna zumbis e processa dano contra zumbis e contra humanos", () => {
    const m = createMatch({
      durationMs: 300000,
      seed: 123,
      players: [player1],
      submode: "zombies",
    });

    // Avança o countdown para a fase ativa
    stepMatch(m, m.countdownEndsAt + 100);
    expect(m.phase).toBe("active");
    expect(m.zombieState?.waveState).toBe("active");

    // Spawna um zumbi
    stepMatch(m, 100);
    stepMatch(m, 500);

    const zombies = [...m.players.values()].filter((p) => p.isZombie);
    expect(zombies.length).toBeGreaterThan(0);
    expect(zombies[0].isZombie).toBe(true);

    const p1 = m.players.get("p1")!;
    const z1 = zombies[0];
    p1.invulnUntil = 0;
    const initialHp = p1.hp;

    // Zumbi ataca jogador humano
    const dmgToHuman = applyDamage(m, p1, z1.zombieDamage ?? 10, z1.id);
    expect(dmgToHuman).toBeGreaterThan(0);
    expect(p1.hp).toBeLessThan(initialHp);

    // Humano dá dano no zumbi
    const zInitialHp = z1.hp;
    const dmgToZombie = applyDamage(m, z1, 25, p1.id);
    expect(dmgToZombie).toBe(25);
    expect(z1.hp).toBe(zInitialHp - 25);
  });

  it("snapshot contém informações da horda zumbi", () => {
    const m = createMatch({
      durationMs: 300000,
      seed: 777,
      players: [player1],
      submode: "zombies",
    });

    const snap = buildSnapshot(m);
    expect(snap.zombieWave).toBeDefined();
    expect(snap.zombieWave?.wave).toBe(1);
    expect(snap.zombieWave?.maxWaves).toBe(5);
  });

  it("getResults reporta equipe vitoriosa ao vencer todas as 5 hordas", () => {
    const m = createMatch({
      durationMs: 300000,
      seed: 999,
      players: [player1],
      submode: "zombies",
    });
    m.zombieState!.wave = 5;
    m.zombieState!.waveState = "victory";

    const results = getResults(m);
    expect(results).toHaveLength(1);
    expect(results[0].teamResult).toBe("victory");
    expect(results[0].waveReached).toBe(5);
  });
});
