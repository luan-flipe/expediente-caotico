import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "../data/avatar";
import { createFutebol, dropFutPlayer, reviveFutPlayer, setFutInput, stepFutebol } from "../index";
import type { FutInput, FutMatch } from "../index";

const DT = 1000 / 30;
const TEAMS: [{ name: string; kit: number; color: number }, { name: string; kit: number; color: number }] = [
  { name: "A", kit: 0, color: 0 },
  { name: "B", kit: 1, color: 1 },
];
const IDLE: FutInput = { mx: 0, mz: 0, aim: 0, sprint: false, kick: "none", pass: "none" };
const human = (id: string, side: 0 | 1) => ({ id, name: id, avatar: DEFAULT_AVATAR, side, isBot: false, accountId: null });
const make = (): FutMatch => createFutebol({ seed: 4, format: 3, durationMs: 120000, botLevel: "normal", players: [human("h0", 0), human("h1", 1)], teams: TEAMS });
function run(m: FutMatch, ms: number): void {
  for (let t = 0; t < ms; t += DT) stepFutebol(m, DT);
}
const pl = (m: FutMatch, id: string) => m.players.find((p) => p.id === id)!;

describe("queda de conexão no futebol", () => {
  it("o bot assume na hora e o boneco passa a se mover sozinho", () => {
    const m = make();
    run(m, 3000);
    const p = pl(m, "h0");
    dropFutPlayer(m, "h0");
    expect(p.isBot).toBe(true);
    expect(m.connected.has("h0")).toBe(false);
    // entrada que chegar de uma conexão velha não manda mais no boneco
    setFutInput(m, "h0", { ...IDLE, mx: -1 }, 99);
    expect(m.inputs.has("h0")).toBe(false);
    const x0 = p.x;
    const z0 = p.z;
    run(m, 6000);
    expect(Math.hypot(p.x - x0, p.z - z0)).toBeGreaterThan(0.5);
  });

  it("ao voltar o humano retoma o boneco no mesmo lugar, com a carga e a entrada antigas zeradas", () => {
    const m = make();
    run(m, 3000);
    const p = pl(m, "h0");
    setFutInput(m, "h0", { ...IDLE, mx: 1, kick: "charge" }, 40);
    run(m, 200);
    dropFutPlayer(m, "h0");
    run(m, 1000);
    p.chargeMs = 300;
    p.chargeKind = "kick";
    const where = { x: p.x, z: p.z };
    reviveFutPlayer(m, "h0");
    expect(p.isBot).toBe(false);
    expect(m.connected.has("h0")).toBe(true);
    expect(m.inputs.has("h0")).toBe(false);
    expect(p.chargeMs).toBe(0);
    expect(p.chargeKind).toBeNull();
    expect({ x: p.x, z: p.z }).toEqual(where);
  });

  it("o contador de entradas recomeça: a conexão nova (seq 1) volta a ser confirmada", () => {
    const m = make();
    setFutInput(m, "h1", IDLE, 500);
    expect(m.ack.get("h1")).toBe(500);
    dropFutPlayer(m, "h1");
    reviveFutPlayer(m, "h1");
    expect(m.ack.has("h1")).toBe(false);
    setFutInput(m, "h1", IDLE, 1);
    expect(m.ack.get("h1")).toBe(1);
  });

  it("bot da partida e goleiro nunca viram humano por engano", () => {
    const m = make();
    reviveFutPlayer(m, "bot-0-1");
    reviveFutPlayer(m, "gk-0");
    expect(pl(m, "bot-0-1").isBot).toBe(true);
    expect(pl(m, "gk-0").isBot).toBe(true);
    expect(m.connected.has("bot-0-1")).toBe(false);
  });

  it("sem nenhum humano a partida segue só com bots até o fim", () => {
    const m = make();
    dropFutPlayer(m, "h0");
    dropFutPlayer(m, "h1");
    run(m, 200000);
    expect(m.phase === "over" || m.phase === "penalties").toBe(true);
  });
});
