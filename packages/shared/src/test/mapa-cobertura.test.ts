import { describe, expect, it } from "vitest";
import { BALANCE } from "../data/balance";
import { DEFAULT_AVATAR } from "../data/avatar";
import { OFFICE_MAP, type Box } from "../data/map";
import { createMatch, stepMatch } from "../sim/match";

const R = BALANCE.playerRadius;
const TICK = 1000 / 30;

/** Folga entre as bordas de duas caixas alinhadas aos eixos (0 se encostam ou se sobrepõem). */
function gap(a: Box, b: Box): number {
  const dx = Math.max(0, Math.abs(a.x - b.x) - (a.w + b.w) / 2);
  const dz = Math.max(0, Math.abs(a.z - b.z) - (a.d + b.d) / 2);
  return Math.hypot(dx, dz);
}

/** Folga entre uma caixa e um retângulo (centro x, z, largura w, profundidade d). */
function gapToRect(b: Box, r: { x: number; z: number; w: number; d: number }): number {
  return gap(b, { ...r, h: 0, kind: "wall" });
}

describe("cobertura do Tiroteio", () => {
  const { boxes } = OFFICE_MAP;

  it("tem de 6 a 10 caixas, todas dentro do campo", () => {
    expect(boxes.length).toBeGreaterThanOrEqual(6);
    expect(boxes.length).toBeLessThanOrEqual(10);
    for (const b of boxes) {
      expect(Math.abs(b.x) + b.w / 2).toBeLessThan(OFFICE_MAP.width / 2 - 2 * R);
      expect(Math.abs(b.z) + b.d / 2).toBeLessThan(OFFICE_MAP.depth / 2 - 2 * R);
    }
  });

  it("spawns e objetivos ficam longe das caixas (passa um boneco dos dois lados)", () => {
    for (const p of [...OFFICE_MAP.spawns, ...OFFICE_MAP.objectivePoints]) {
      for (const b of boxes) expect(gapToRect(b, { x: p.x, z: p.z, w: 0, d: 0 })).toBeGreaterThan(2 * R + 1);
    }
  });

  it("caixas não tocam escadas nem colinas e sempre deixam passagem", () => {
    for (const b of boxes) {
      for (const s of OFFICE_MAP.stairs) expect(gapToRect(b, s), s.id).toBeGreaterThan(2 * R);
      for (const e of OFFICE_MAP.elevations) expect(gapToRect(b, e), e.id).toBeGreaterThan(2 * R);
    }
  });

  it("sem cantos fechados: toda dupla de caixas tem folga larga entre si", () => {
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(gap(boxes[i], boxes[j]), `${i}-${j}`).toBeGreaterThan(4 * R);
    }
  });
});

describe("bots no mapa com cobertura", () => {
  it("nenhum bot fica preso: todos seguem se movendo, atravessam o campo e há abates", () => {
    const m = createMatch({
      durationMs: 5 * 60 * 1000,
      seed: 7,
      players: Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, avatar: DEFAULT_AVATAR, isBot: true })),
    });
    const WINDOW = Math.round(8000 / TICK);
    const TICKS = Math.round(120000 / TICK);
    const players = [...m.players.values()];
    const last = new Map(players.map((p) => [p.id, { x: p.pos.x, z: p.pos.z }]));
    const travelled = new Map(players.map((p) => [p.id, 0]));
    const aliveAll = new Map(players.map((p) => [p.id, true]));
    let minTravel = Infinity;

    for (let t = 1; t <= TICKS; t++) {
      stepMatch(m, TICK);
      for (const p of players) {
        const prev = last.get(p.id)!;
        const step = Math.hypot(p.pos.x - prev.x, p.pos.z - prev.z);
        last.set(p.id, { x: p.pos.x, z: p.pos.z });
        // respawn teleporta: o salto não conta como andar, e a janela recomeça
        if (!p.alive || step > 3) aliveAll.set(p.id, false);
        else travelled.set(p.id, travelled.get(p.id)! + step);
        for (const b of OFFICE_MAP.boxes) {
          const inside = Math.abs(p.pos.x - b.x) < b.w / 2 + R - 0.01 && Math.abs(p.pos.z - b.z) < b.d / 2 + R - 0.01;
          expect(inside, `${p.id} dentro de caixa no tick ${t}`).toBe(false);
        }
      }
      if (t % WINDOW === 0 && m.phase === "active") {
        for (const p of players) {
          if (aliveAll.get(p.id)) minTravel = Math.min(minTravel, travelled.get(p.id)!);
          expect(!aliveAll.get(p.id) || travelled.get(p.id)! > 2, `${p.id} preso até o tick ${t}`).toBe(true);
          travelled.set(p.id, 0);
          aliveAll.set(p.id, true);
        }
      } else if (t % WINDOW === 0) {
        for (const p of players) {
          travelled.set(p.id, 0);
          aliveAll.set(p.id, true);
        }
      }
    }

    expect(minTravel).toBeGreaterThan(2);
    expect(players.reduce((n, p) => n + p.kills, 0)).toBeGreaterThan(0);
  });
});
