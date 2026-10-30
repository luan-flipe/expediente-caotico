import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "../data/avatar";
import { createFutebol, dropFutPlayer, reviveFutPlayer, FUT, FUT_COLORS, FUT_KITS, getFutResults, getFutScore, setFutInput, stepFutebol } from "../index";
import type { FutFormat, FutInput, FutMatch, TeamSide } from "../index";

const DT = 1000 / 30;
const TEAMS: [{ name: string; kit: number; color: number }, { name: string; kit: number; color: number }] = [
  { name: "A", kit: 0, color: 0 },
  { name: "B", kit: 1, color: 1 },
];
const IDLE: FutInput = { mx: 0, mz: 0, aim: 0, sprint: false, kick: "none", pass: "none" };

function human(id: string, side: TeamSide) {
  return { id, name: id, avatar: DEFAULT_AVATAR, side, isBot: false, accountId: `acc-${id}` };
}
function make(format: FutFormat, players: ReturnType<typeof human>[] = [], durationMs = 60000, seed = 5): FutMatch {
  return createFutebol({ seed, format, durationMs, botLevel: "normal", players, teams: TEAMS });
}
function run(m: FutMatch, ms: number): void {
  for (let t = 0; t < ms; t += DT) stepFutebol(m, DT);
}
/** Pula a espera da saída e deixa a bola livre, jogadores longe dela. */
function toPlay(m: FutMatch): void {
  m.phase = "play";
  m.restart = null;
  Object.assign(m.ball, { x: 0, y: FUT.ballRadius, z: 0, vx: 0, vy: 0, vz: 0, ownerId: null, lastTouch: null, prevTouch: null });
  for (const p of m.players) {
    if (p.role === "linha") p.z = 9;
  }
}
/** Chuta a bola de dentro rumo ao gol que o time `defending` defende, longe do goleiro. */
function shootAtGoal(m: FutMatch, defending: TeamSide): void {
  const sign = defending === 1 ? 1 : -1;
  const gk = m.players.find((p) => p.role === "goleiro" && p.side === defending)!;
  gk.z = -9;
  Object.assign(m.ball, { x: sign * (m.field.halfL - 0.8), y: FUT.ballRadius, z: 0, vx: sign * 20, vy: 0, vz: 0 });
}

describe("partida de futebol", () => {
  it("completa os times com bots até o formato", () => {
    const m = make(3, [human("h1", 0)]);
    const linha = (s: TeamSide) => m.players.filter((p) => p.side === s && p.role === "linha");
    expect(linha(0)).toHaveLength(3);
    expect(linha(1)).toHaveLength(3);
    expect(linha(0).filter((p) => p.isBot)).toHaveLength(2);
    expect(linha(1).every((p) => p.isBot)).toBe(true);
  });

  it("tem sempre 2 goleiros da IA", () => {
    const m = make(2, [human("h1", 0), human("h2", 1)]);
    const gks = m.players.filter((p) => p.role === "goleiro");
    expect(gks).toHaveLength(2);
    expect(gks.map((g) => g.side).sort()).toEqual([0, 1]);
    expect(gks.every((g) => g.isBot)).toBe(true);
    expect(make(1).players.filter((p) => p.role === "goleiro")).toHaveLength(2);
  });

  it("gol soma placar e faz saída de quem sofreu", () => {
    const m = make(1);
    toPlay(m);
    const a = m.players.find((p) => p.side === 0 && p.role === "linha")!;
    m.ball.lastTouch = { id: a.id, side: 0 };
    shootAtGoal(m, 1);
    run(m, 300);
    expect(getFutScore(m).score).toEqual([1, 0]);
    expect(m.phase).toBe("goal");
    expect(m.events.some((e) => e.type === "goal" && e.side === 0 && e.scorerId === a.id)).toBe(true);
    run(m, FUT.goalCelebrateMs + 200);
    expect(m.restart?.kind).toBe("saida");
    expect(m.restart?.side).toBe(1);
    expect(m.phase).toBe("restart");
    expect(m.ball.x).toBe(0);
    expect(getFutResults(m).find((r) => r.id === a.id)?.goals).toBe(1);
  });

  it("assistência vai para o passe do companheiro", () => {
    const m = make(2);
    toPlay(m);
    const [a1, a2] = m.players.filter((p) => p.side === 0 && p.role === "linha");
    m.ball.prevTouch = { id: a1.id, side: 0, at: m.now };
    m.ball.lastTouch = { id: a2.id, side: 0 };
    shootAtGoal(m, 1);
    run(m, 300);
    const goal = m.events.find((e) => e.type === "goal");
    expect(goal).toMatchObject({ scorerId: a2.id, assistId: a1.id, own: false });
    const rows = getFutResults(m);
    expect(rows.find((r) => r.id === a1.id)?.assists).toBe(1);
    expect(rows.find((r) => r.id === a2.id)?.goals).toBe(1);
  });

  it("gol contra não dá assistência", () => {
    const m = make(2);
    toPlay(m);
    const mate = m.players.find((p) => p.side === 0 && p.role === "linha")!;
    const def = m.players.find((p) => p.side === 1 && p.role === "linha")!;
    m.ball.prevTouch = { id: mate.id, side: 0 };
    m.ball.lastTouch = { id: def.id, side: 1 };
    shootAtGoal(m, 1);
    run(m, 300);
    expect(m.events.find((e) => e.type === "goal")).toMatchObject({ side: 0, scorerId: def.id, assistId: null, own: true });
    expect(getFutScore(m).score).toEqual([1, 0]);
    const rows = getFutResults(m);
    expect(rows.every((r) => r.assists === 0 && r.goals === 0)).toBe(true);
  });

  it("tempo acaba com vitória", () => {
    const m = make(1, [], 2000);
    toPlay(m);
    m.ball.lastTouch = { id: m.players[0].id, side: 0 };
    shootAtGoal(m, 1);
    run(m, 20000);
    expect(m.phase).toBe("over");
    expect(getFutScore(m)).toEqual({ score: [1, 0], pens: null, winner: 0 });
  });

  it("empate vai aos pênaltis e decide", () => {
    const m = make(1, [], 1000);
    run(m, 4000);
    expect(m.phase).toBe("penalties");
    run(m, 400000);
    expect(m.phase).toBe("over");
    const res = getFutScore(m);
    expect(res.score).toEqual([0, 0]);
    expect(res.pens).not.toBeNull();
    expect(res.pens![0]).not.toBe(res.pens![1]);
    expect(res.winner).toBe(res.pens![0] > res.pens![1] ? 0 : 1);
  });

  it("gols de pênalti não contam como gol", () => {
    const m = make(1, [], 1000);
    run(m, 400000);
    expect(m.phase).toBe("over");
    const pens = getFutScore(m).pens!;
    expect(pens[0] + pens[1]).toBeGreaterThan(0);
    expect(getFutScore(m).score).toEqual([0, 0]);
    expect(getFutResults(m).every((r) => r.goals === 0)).toBe(true);
  });

  it("vermelho no 1v1 encerra com vitória do outro", () => {
    const m = make(1, [human("h0", 0), human("h1", 1)]);
    toPlay(m);
    const a = m.players.find((p) => p.id === "h0")!;
    const b = m.players.find((p) => p.id === "h1")!;
    Object.assign(a, { x: 4, z: 0 });
    Object.assign(b, { x: 5.5, z: 0 });
    m.ball.z = 8;
    const face = Math.PI / 2;
    setFutInput(m, "h1", { ...IDLE, mx: 1, aim: face });
    setFutInput(m, "h0", { ...IDLE, aim: face, kick: "charge" });
    run(m, DT * 3);
    setFutInput(m, "h1", { ...IDLE, mx: 1, aim: face });
    setFutInput(m, "h0", { ...IDLE, aim: face, kick: "release" });
    run(m, DT * 2);
    expect(a.sentOff).toBe(true);
    expect(m.phase).toBe("over");
    expect(getFutScore(m).winner).toBe(1);
    expect(m.events.some((e) => e.type === "card" && e.card === "red" && e.id === "h0")).toBe(true);
    expect(getFutResults(m).find((r) => r.id === "h0")?.red).toBe(1);
  });

  it("jogador que volta reassume o controle", () => {
    const m = make(2, [human("h1", 0), human("h2", 1)]);
    dropFutPlayer(m, "h1");
    reviveFutPlayer(m, "h1");
    expect(m.players.find((q) => q.id === "h1")!.isBot).toBe(false);
    expect(m.connected.has("h1")).toBe(true);
  });

  it("jogador que sai vira bot sem travar", () => {
    const m = make(2, [human("h1", 0), human("h2", 1)]);
    run(m, 3000);
    dropFutPlayer(m, "h1");
    const before = m.elapsedMs;
    run(m, 20000);
    const p = m.players.find((q) => q.id === "h1")!;
    expect(p.isBot).toBe(true);
    expect(m.connected.has("h1")).toBe(false);
    expect(m.elapsedMs).toBeGreaterThan(before + 10000);
    expect(m.players.every((q) => Number.isFinite(q.x) && Number.isFinite(q.z))).toBe(true);
    expect(getFutResults(m).find((r) => r.id === "h1")?.isBot).toBe(false);
  });

  it("mesma seed e mesmos inputs dão o mesmo placar", () => {
    const play = () => {
      const m = make(2, [human("h1", 0)], 60000, 77);
      for (let i = 0; i < 1800; i++) {
        const t = i * DT;
        setFutInput(m, "h1", {
          mx: Math.sin(t / 700), mz: Math.cos(t / 900), aim: t / 1000, sprint: i % 90 < 30,
          kick: i % 50 < 20 ? "charge" : i % 50 === 20 ? "release" : "none",
          pass: "none",
        });
        stepFutebol(m, DT);
      }
      return m;
    };
    const a = play();
    const b = play();
    expect(getFutScore(a)).toEqual(getFutScore(b));
    expect(a.ball).toEqual(b.ball);
    expect(a.players).toEqual(b.players);
    expect(a.elapsedMs).toBe(b.elapsedMs);
  });

  it("passe de mais de 6 s antes do gol não dá assistência", () => {
    const m = make(2);
    toPlay(m);
    const [a1, a2] = m.players.filter((p) => p.side === 0 && p.role === "linha");
    m.ball.prevTouch = { id: a1.id, side: 0, at: m.now };
    m.ball.lastTouch = { id: a2.id, side: 0 };
    m.now += 7000;
    shootAtGoal(m, 1);
    run(m, 300);
    expect(m.events.find((e) => e.type === "goal")).toMatchObject({ scorerId: a2.id, assistId: null });
    expect(getFutResults(m).every((r) => r.assists === 0)).toBe(true);
  });

  it("passe sem carimbo de tempo não dá assistência", () => {
    const m = make(2);
    toPlay(m);
    const [a1, a2] = m.players.filter((p) => p.side === 0 && p.role === "linha");
    m.ball.prevTouch = { id: a1.id, side: 0 };
    m.ball.lastTouch = { id: a2.id, side: 0 };
    shootAtGoal(m, 1);
    run(m, 300);
    expect(m.events.find((e) => e.type === "goal")).toMatchObject({ assistId: null });
  });

  it("uniforme fora da lista vira o primeiro", () => {
    expect(FUT_KITS).toEqual(["Lisa", "Listrada", "Faixa"]);
    expect(FUT_COLORS).toHaveLength(8);
    const m = createFutebol({
      seed: 1, format: 1, durationMs: 60000, botLevel: "normal", players: [],
      teams: [{ name: "A", kit: 7, color: -1 }, { name: "B", kit: 2, color: 7 }],
    });
    expect(m.teams[0]).toEqual({ name: "A", kit: 0, color: 0 });
    expect(m.teams[1]).toEqual({ name: "B", kit: 2, color: 7 });
  });

  it("apito de fim sai uma vez só, mesmo com pênaltis", () => {
    const m = make(1, [], 1000);
    const ends: number[] = [];
    for (let t = 0; t < 400000 && m.phase !== "over"; t += DT) {
      stepFutebol(m, DT);
      ends.push(m.events.filter((e) => e.type === "whistle" && e.kind === "end").length);
      m.events = [];
    }
    expect(m.phase).toBe("over");
    expect(ends.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("jogadores além do formato por lado são ignorados", () => {
    const m = make(1, [human("h1", 0), human("h2", 0), human("h3", 1)]);
    const linha = (s: TeamSide) => m.players.filter((p) => p.side === s && p.role === "linha");
    expect(linha(0).map((p) => p.id)).toEqual(["h1"]);
    expect(linha(1)).toHaveLength(1);
    expect(m.players.some((p) => p.id === "h2")).toBe(false);
  });

  it("depois que o goleiro segura, a bola volta a circular em até 4 s", () => {
    const m = make(2);
    toPlay(m);
    const gk = m.players.find((p) => p.role === "goleiro" && p.side === 1)!;
    Object.assign(m.ball, { x: gk.x - 0.6, z: gk.z, vx: 0, vz: 0, ownerId: null });
    let held = false;
    let freeAt = -1;
    for (let i = 0; i < 30 * 8; i++) {
      stepFutebol(m, DT);
      if (m.ball.ownerId === gk.id) held = true;
      if (held && m.ball.ownerId !== gk.id && freeAt < 0) freeAt = i;
    }
    expect(held).toBe(true);
    expect(freeAt).toBeGreaterThanOrEqual(0);
    expect(freeAt * DT).toBeLessThanOrEqual(4000);
  });

  it("partida de 3 min só com bots no normal fica entre 1 e 8 gols", () => {
    for (const [format, seed] of [[1, 3], [4, 1]] as const) {
      const m = make(format, [], 180000, seed);
      for (let i = 0; i < 30 * 400 && m.phase !== "over" && m.phase !== "penalties"; i++) stepFutebol(m, DT);
      const goals = m.score[0] + m.score[1];
      expect(goals).toBeGreaterThanOrEqual(1);
      expect(goals).toBeLessThanOrEqual(8);
    }
  });
});
