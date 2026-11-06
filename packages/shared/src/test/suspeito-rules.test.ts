import { describe, expect, it } from "vitest";
import {
  buildSuspeitoPrivate,
  createSuspeitoMatch,
  DEFAULT_ROOM_OPTIONS,
  findSuspeitoPath,
  moveSuspeitoPlayer,
  queueSuspeitoKill,
  queueSuspeitoReport,
  queueSuspeitoSabotage,
  queueSuspeitoStartTask,
  queueSuspeitoTaskAction,
  queueSuspeitoVote,
  removeSuspeitoPlayer,
  setSuspeitoInput,
  stepSuspeitoMatch,
  TASK_STATIONS,
  type AvatarDNA,
  type SuspeitoMatch,
  type SuspeitoPlayerInfo,
} from "../index";

const avatar = {} as AvatarDNA;

function players(n: number, bots = false): SuspeitoPlayerInfo[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, avatar, isBot: bots }));
}

function working(n = 5): SuspeitoMatch {
  const m = createSuspeitoMatch(players(n), DEFAULT_ROOM_OPTIONS, 777);
  m.phase = "working";
  const roles = ["sabotador", ...Array(n - 1).fill("colaborador")] as const;
  [...m.players.values()].forEach((p, i) => (p.role = roles[i]));
  return m;
}

describe("Expediente Suspeito — regras inspiradas em Among Us", () => {
  it("navegação contorna paredes até qualquer estação de tarefa", () => {
    for (const st of TASK_STATIONS) {
      let pos = { x: -4, z: -3 };
      const path = findSuspeitoPath(pos, st.pos);
      for (const wp of path) {
        for (let i = 0; i < 400 && Math.hypot(wp.x - pos.x, wp.z - pos.z) > 0.3; i++) {
          const dx = wp.x - pos.x;
          const dz = wp.z - pos.z;
          const d = Math.hypot(dx, dz);
          pos = moveSuspeitoPlayer(pos, dx / d, dz / d, 1 / 30);
        }
      }
      expect(Math.hypot(st.pos.x - pos.x, st.pos.z - pos.z), st.id).toBeLessThan(1.2);
    }
  });

  it("partida só de bots termina sem travar", () => {
    for (const seed of [1, 2, 3]) {
      const m = createSuspeitoMatch(players(7, true), { ...DEFAULT_ROOM_OPTIONS, suspeitoImpostors: 2 }, seed);
      for (let i = 0; i < 30 * 60 * 20 && m.phase !== "over"; i++) stepSuspeitoMatch(m, 1 / 30);
      expect(m.phase).toBe("over");
      expect(m.winner).not.toBeNull();
    }
  });

  it("fantasma atravessa paredes e continua fazendo tarefas que contam para a equipe", () => {
    const m = working();
    const ghost = m.players.get("p2")!;
    ghost.alive = false;
    ghost.pos = { x: -8, z: 5.5 };
    setSuspeitoInput(m, "p2", { mx: 0, mz: 1, yaw: 0 });
    stepSuspeitoMatch(m, 0.5);
    expect(ghost.pos.z).toBeGreaterThan(6.5);

    const task = ghost.tasks[0];
    ghost.pos = { ...task.pos };
    expect(queueSuspeitoStartTask(m, "p2", task.id)).toBe(true);
    expect(buildSuspeitoPrivate(m, "p2")!.visiblePlayerIds.length).toBe(5);
  });

  it("sabotador não elimina outro sabotador", () => {
    const m = working();
    const a = m.players.get("p1")!;
    const b = m.players.get("p2")!;
    b.role = "sabotador";
    a.killCooldownMs = 0;
    a.pos = { x: 0, z: 8 };
    b.pos = { x: 1, z: 8 };
    expect(queueSuspeitoKill(m, "p1", "p2")).toBe(false);
  });

  it("reunião limpa corpos, cancela emergência crítica e reinicia a recarga do sabotador", () => {
    const m = working();
    const killer = m.players.get("p1")!;
    killer.killCooldownMs = 0;
    killer.sabotageCooldownMs = 0;
    m.sabotageGlobalCooldownMs = 0;
    killer.pos = { x: 0, z: 8 };
    m.players.get("p2")!.pos = { x: 1, z: 8 };
    expect(queueSuspeitoKill(m, "p1", "p2")).toBe(true);
    expect(queueSuspeitoSabotage(m, "p1", "vazamento_dados")).toBe(true);

    m.players.get("p3")!.pos = { x: 1.5, z: 8 };
    expect(queueSuspeitoReport(m, "p3", m.bodies[0].id)).toBe(true);
    expect(m.bodies.length).toBe(0);
    expect(m.sabotage?.active).toBe(false);

    stepSuspeitoMatch(m, 60);
    for (const id of ["p1", "p3", "p4", "p5"]) queueSuspeitoVote(m, id, "skip");
    expect(m.phase).toBe("vote_result");
    stepSuspeitoMatch(m, 6);
    expect(m.phase).toBe("working");
    expect(killer.killCooldownMs).toBe((DEFAULT_ROOM_OPTIONS.suspeitoKillCooldownSec ?? 25) * 1000);
  });

  it("queda de rede bloqueia tarefas digitais", () => {
    const m = working();
    const p = m.players.get("p2")!;
    p.tasks[0] = { ...p.tasks[0], type: "termo", sector: "desenvolvimento" };
    p.pos = { ...p.tasks[0].pos };
    const sab = m.players.get("p1")!;
    sab.sabotageCooldownMs = 0;
    m.sabotageGlobalCooldownMs = 0;
    queueSuspeitoSabotage(m, "p1", "queda_rede");
    expect(queueSuspeitoStartTask(m, "p2", p.tasks[0].id)).toBe(false);
    expect(buildSuspeitoPrivate(m, "p2")!.nearbyInteractable?.blocked).toBe(true);
  });

  it("termo esgotado reinicia sozinho e acerto fecha depois de mostrar o resultado", () => {
    const m = working();
    const p = m.players.get("p2")!;
    p.tasks[0] = { ...p.tasks[0], type: "termo" };
    p.pos = { ...p.tasks[0].pos };
    queueSuspeitoStartTask(m, "p2", p.tasks[0].id);
    const entry = m.activeChallenges.get("p2")!;
    if (entry.challenge.type !== "termo") throw new Error("esperava termo");
    entry.challenge.challenge.state.failed = true;
    queueSuspeitoTaskAction(m, "p2", { termoGuess: "XXXXX" });
    stepSuspeitoMatch(m, 2);
    const fresh = m.activeChallenges.get("p2")!;
    expect(fresh).toBeDefined();
    expect(fresh.challenge.type === "termo" && fresh.challenge.challenge.state.failed).toBe(false);
  });

  it("jogador que sai durante a votação não trava o encerramento", () => {
    const m = working();
    m.phase = "voting";
    m.meeting = {
      phase: "voting",
      callerId: "p2",
      callerName: "P2",
      reason: "emergency",
      remainingMs: 0,
      totalDiscussionMs: 0,
      totalVotingMs: 30000,
      votes: {},
      ejectedId: null,
    };
    for (const id of ["p1", "p2", "p3", "p4"]) queueSuspeitoVote(m, id, "skip");
    expect(m.phase).toBe("voting");
    removeSuspeitoPlayer(m, "p5");
    expect(m.phase).toBe("vote_result");
  });
});
