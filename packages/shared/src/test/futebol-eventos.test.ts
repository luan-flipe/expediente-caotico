import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "../data/avatar";
import { buildFutSnapshot, createFutebol, FUT, getFutScore, recordKicks, stepFutebol } from "../index";
import { keeperSave } from "../futebol/goalkeeping";
import type { FutMatch, TeamSide } from "../index";

const DT = 1000 / 30;
const TEAMS: [{ name: string; kit: number; color: number }, { name: string; kit: number; color: number }] = [
  { name: "A", kit: 0, color: 0 },
  { name: "B", kit: 1, color: 1 },
];
const human = (id: string, side: TeamSide) => ({ id, name: id, avatar: DEFAULT_AVATAR, side, isBot: false, accountId: null });

function make(): FutMatch {
  const m = createFutebol({ seed: 3, format: 2, durationMs: 120000, botLevel: "normal", players: [human("h0", 0), human("h1", 1)], teams: TEAMS });
  m.phase = "play";
  m.restart = null;
  for (const p of m.players) {
    if (p.role === "linha") {
      p.z = 11;
    }
  }
  return m;
}
const kicker = (m: FutMatch) => m.players.find((p) => p.id === "h0")!;

describe("eventos e estatísticas do jogo", () => {
  it("chute no gol vira kick + shot no alvo e conta chute e chute no gol", () => {
    const m = make();
    const k = kicker(m);
    Object.assign(m.ball, { x: 10, y: FUT.ballRadius, z: 0, vx: 18, vy: 0, vz: 0, ownerId: null });
    recordKicks(m, [{ t: "kick", id: k.id, ok: true }]);
    expect(m.events.map((e) => e.type)).toEqual(["kick", "shot"]);
    expect(m.events[1]).toMatchObject({ type: "shot", side: 0, onTarget: true });
    expect(m.info.get(k.id)).toMatchObject({ shots: 1, shotsOn: 1 });
  });

  it("chute para fora do alvo conta chute, mas não chute no gol; chute para longe do gol não é chute", () => {
    const m = make();
    const k = kicker(m);
    Object.assign(m.ball, { x: 10, y: FUT.ballRadius, z: 0, vx: 18, vy: 0, vz: 6 });
    recordKicks(m, [{ t: "kick", id: k.id, ok: true }]);
    expect(m.info.get(k.id)).toMatchObject({ shots: 1, shotsOn: 0 });
    m.events = [];
    Object.assign(m.ball, { vx: -18, vz: 0 });
    recordKicks(m, [{ t: "kick", id: k.id, ok: true }]);
    expect(m.events.map((e) => e.type)).toEqual(["kick"]);
    expect(m.info.get(k.id)!.shots).toBe(1);
  });

  it("passe conta passe; na disputa de pênaltis nada entra na estatística", () => {
    const m = make();
    const k = kicker(m);
    Object.assign(m.ball, { x: 0, vx: 8, vz: 0 });
    recordKicks(m, [{ t: "pass", id: k.id, ok: true }]);
    expect(m.info.get(k.id)!.passes).toBe(1);
    Object.assign(m.ball, { x: 10, vx: 18 });
    recordKicks(m, [{ t: "kick", id: k.id, ok: true }], false);
    expect(m.info.get(k.id)).toMatchObject({ shots: 0, passes: 1 });
  });

  it("goleiro que para chute de adversário gera o evento de defesa", () => {
    const m = make();
    const gk = m.players.find((p) => p.role === "goleiro" && p.side === 1)!;
    const k = kicker(m);
    Object.assign(m.ball, { x: gk.x - 1, y: FUT.ballRadius, z: gk.z, vx: 10, vy: 0, vz: 0, ownerId: null, lastTouch: { id: k.id, side: 0 }, prevTouch: null });
    keeperSave(m, gk);
    expect(m.events).toContainEqual({ type: "save", keeperId: gk.id, side: 1 });
    // bola do próprio time (recuo) não é defesa
    m.events = [];
    Object.assign(m.ball, { x: gk.x - 1, vx: 10, ownerId: null, lastTouch: { id: "x", side: 1 } });
    keeperSave(m, gk);
    expect(m.events.some((e) => e.type === "save")).toBe(false);
  });

  it("bola que sai rente à trave vira trave; longe do gol não vira nada", () => {
    const m = make();
    const f = m.field;
    Object.assign(m.ball, { x: f.halfL + 0.4, y: FUT.ballRadius, z: f.goalHalfW + 0.2, vx: 15, vz: 0, ownerId: null, lastTouch: { id: "h0", side: 0 } });
    stepFutebol(m, DT);
    expect(m.events).toContainEqual({ type: "near", side: 0, post: true });
    const n = make();
    Object.assign(n.ball, { x: f.halfL + 0.4, y: FUT.ballRadius, z: f.goalHalfW + 1.2, vx: 15, vz: 0, ownerId: null, lastTouch: { id: "h0", side: 0 } });
    stepFutebol(n, DT);
    expect(n.events).toContainEqual({ type: "near", side: 0, post: false });
    const far = make();
    Object.assign(far.ball, { x: f.halfL + 0.4, y: FUT.ballRadius, z: f.goalHalfW + 4, vx: 15, vz: 0, ownerId: null, lastTouch: { id: "h0", side: 0 } });
    stepFutebol(far, DT);
    expect(far.events.some((e) => e.type === "near")).toBe(false);
  });

  it("posse de bola soma o tempo de quem tem a bola", () => {
    const m = make();
    const k = kicker(m);
    Object.assign(m.ball, { x: 0, z: 0, ownerId: k.id });
    k.x = 0;
    k.z = 0;
    for (let i = 0; i < 30; i++) {
      stepFutebol(m, DT);
    }
    expect(m.possMs[0]).toBeGreaterThan(500);
    expect(m.possMs[1]).toBe(0);
    expect(getFutScore(m).score).toEqual([0, 0]);
    expect(buildFutSnapshot(m).events.length).toBeGreaterThanOrEqual(0);
  });
});
