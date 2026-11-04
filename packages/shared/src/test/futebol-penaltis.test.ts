import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "../data/avatar";
import { buildFutSnapshot, createFutebol, setFutInput, startShootout, stepFutebol } from "../index";
import type { FutInput, FutMatch, TeamSide } from "../index";

const DT = 1000 / 30;
const TEAMS: [{ name: string; kit: number; color: number }, { name: string; kit: number; color: number }] = [
  { name: "A", kit: 0, color: 0 },
  { name: "B", kit: 1, color: 1 },
];
const IDLE: FutInput = { mx: 0, mz: 0, aim: 0, sprint: false, kick: "none", pass: "none" };

const human = (id: string, side: TeamSide) => ({ id, name: id, avatar: DEFAULT_AVATAR, side, isBot: false, accountId: null });

/** 1v1 com humanos nos dois lados, direto na disputa, com o time `turn` cobrando. */
function shootout(turn: TeamSide): FutMatch {
  const m = createFutebol({ seed: 9, format: 1, durationMs: 60000, botLevel: "normal", players: [human("h0", 0), human("h1", 1)], teams: TEAMS });
  // a vez inicial é sorteada: repete até cair no lado pedido
  for (let i = 0; i < 50; i++) {
    startShootout(m);
    if (m.shootout!.turn === turn) {
      break;
    }
  }
  return m;
}
function press(m: FutMatch, id: string, input: Partial<FutInput>): void {
  setFutInput(m, id, { ...IDLE, ...input });
}
function run(m: FutMatch, ms: number): void {
  for (let t = 0; t < ms; t += DT) stepFutebol(m, DT);
}

describe("disputa de pênaltis com humanos", () => {
  it("o cobrador escolhe o canto andando para o lado", () => {
    for (const lado of [1, -1]) {
      const m = shootout(0);
      const taker = m.shootout!.takerId;
      expect(taker.startsWith("h")).toBe(true);
      press(m, taker, { mz: lado, kick: "charge", aim: Math.PI / 2 });
      run(m, 300);
      press(m, taker, { mz: lado, kick: "release", aim: Math.PI / 2 });
      run(m, 200);
      expect(m.shootout!.stage).not.toBe("aim");
      expect(Math.sign(m.ball.vz) || Math.sign(m.ball.z)).toBe(lado);
    }
  });

  it("o cobrador não sai do ponto ao apertar o lado", () => {
    const m = shootout(0);
    const taker = m.players.find((p) => p.id === m.shootout!.takerId)!;
    const x0 = taker.x;
    press(m, taker.id, { mz: 1, mx: 1, sprint: true });
    run(m, 500);
    expect(taker.x).toBeCloseTo(x0, 5);
    expect(taker.z).toBeCloseTo(0, 5);
  });

  it("goleiro humano escolhe o lado do pulo e o servidor não vaza a escolha", () => {
    const m = shootout(0);
    const taker = m.shootout!.takerId;
    const keeperHuman = taker === "h0" ? "h1" : "h0";
    press(m, keeperHuman, { mz: -1 });
    run(m, 200);
    press(m, taker, { mz: 1, kick: "charge", aim: Math.PI / 2 });
    run(m, 200);
    press(m, taker, { mz: 1, kick: "release", aim: Math.PI / 2 });
    run(m, 100);
    const keeper = m.players.find((p) => p.id === m.shootout!.keeperId)!;
    expect(keeper.z).toBeLessThan(-1);
    expect(JSON.stringify(buildFutSnapshot(m))).not.toContain("dive");
  });

  it("o snapshot traz fase, vez, goleiro e morte súbita", () => {
    const m = shootout(1);
    const pens = buildFutSnapshot(m).pens!;
    expect(pens).toMatchObject({ stage: "aim", turn: 1, sudden: false });
    expect(pens.keeperId).toBe(m.shootout!.keeperId);
    m.shootout!.taken = [5, 5];
    expect(buildFutSnapshot(m).pens!.sudden).toBe(true);
  });
});
