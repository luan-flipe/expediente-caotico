import { describe, expect, it } from "vitest";
import {
  buildSuspeitoPrivate,
  buildSuspeitoSnapshot,
  createSuspeitoMatch,
  DEFAULT_ROOM_OPTIONS,
  queueSuspeitoEmergency,
  queueSuspeitoFixSabotage,
  queueSuspeitoKill,
  queueSuspeitoReport,
  queueSuspeitoSabotage,
  queueSuspeitoVote,
  setSuspeitoInput,
  stepSuspeitoMatch,
  type SuspeitoPlayerInfo,
} from "../index";

const mockPlayers: SuspeitoPlayerInfo[] = [
  { id: "p1", name: "Ana", avatar: {} as any, isBot: false },
  { id: "p2", name: "Beto", avatar: {} as any, isBot: false },
  { id: "p3", name: "Carlos", avatar: {} as any, isBot: false },
  { id: "p4", name: "Duda", avatar: {} as any, isBot: false },
  { id: "p5", name: "Edu", avatar: {} as any, isBot: false },
];

describe("Partida de Expediente Suspeito", () => {
  it("cria partida com funções secretas e tarefas distribuídas", () => {
    const match = createSuspeitoMatch(mockPlayers, DEFAULT_ROOM_OPTIONS, 12345);
    expect(match.players.size).toBe(5);

    const roles = [...match.players.values()].map((p) => p.role);
    const sabotadores = roles.filter((r) => r === "sabotador");
    const colaboradores = roles.filter((r) => r === "colaborador");

    expect(sabotadores.length).toBe(1);
    expect(colaboradores.length).toBe(4);

    for (const p of match.players.values()) {
      expect(p.tasks.length).toBeGreaterThan(0);
    }
  });

  it("permite movimentação e identifica o setor do mapa", () => {
    const match = createSuspeitoMatch(mockPlayers, DEFAULT_ROOM_OPTIONS, 12345);
    match.phase = "working"; // Pula fase intro para testes

    const p1 = match.players.get("p1")!;
    p1.pos = { x: -4, z: 0 }; // Sala de reuniões
    expect(p1.sector).toBe("reuniao");

    // Move em direção ao Desenvolvimento (x positivo, z negativo)
    setSuspeitoInput(match, "p1", { mx: 1, mz: 0, yaw: 0 });
    stepSuspeitoMatch(match, 1.0); // 1 segundo de passo

    expect(p1.pos.x).toBeGreaterThan(-4);
  });

  it("sabotador elimina colaborador próximo gerando corpo no mapa", () => {
    const match = createSuspeitoMatch(mockPlayers, DEFAULT_ROOM_OPTIONS, 12345);
    match.phase = "working";

    // Força p1 como sabotador e p2 como colaborador próximos
    const p1 = match.players.get("p1")!;
    const p2 = match.players.get("p2")!;
    p1.role = "sabotador";
    p1.killCooldownMs = 0;
    p2.role = "colaborador";
    p2.alive = true;

    p1.pos = { x: 0, z: 0 };
    p2.pos = { x: 1.0, z: 0 }; // A 1.0 metro (dentro do alcance)

    const killed = queueSuspeitoKill(match, "p1", "p2");
    expect(killed).toBe(true);
    expect(p2.alive).toBe(false);
    expect(p1.stats.kills).toBe(1);
    expect(match.bodies.length).toBe(1);
    expect(match.bodies[0].victimId).toBe("p2");
  });

  it("reportar corpo inicia reunião emergencial com teletransporte", () => {
    const match = createSuspeitoMatch(mockPlayers, DEFAULT_ROOM_OPTIONS, 12345);
    match.phase = "working";

    // Cria um corpo no mapa
    match.bodies.push({
      id: "body_test",
      victimId: "p5",
      victimName: "Edu",
      avatar: {} as any,
      pos: { x: 6, z: 15 },
      sector: "copa",
      reported: false,
    });

    const p3 = match.players.get("p3")!;
    p3.pos = { x: 6.5, z: 15 }; // Perto do corpo na copa

    const reported = queueSuspeitoReport(match, "p3", "body_test");
    expect(reported).toBe(true);
    expect(match.phase).toBe("meeting");
    expect(match.meeting?.reason).toBe("body");
    expect(match.meeting?.reportedVictimName).toBe("Edu");

    // Jogadores vivos foram levados à Sala de Reunião
    expect(p3.sector).toBe("reuniao");
  });

  it("votação ejeta o participante mais votado e revela função", () => {
    const match = createSuspeitoMatch(mockPlayers, DEFAULT_ROOM_OPTIONS, 12345);
    match.phase = "working";

    // P1 convoca reunião de emergência
    const p1 = match.players.get("p1")!;
    p1.pos = { x: -4, z: 0 }; // Mesa de reunião
    match.emergencyCooldownMs = 0;
    queueSuspeitoEmergency(match, "p1");

    expect(match.phase).toBe("meeting");

    // Avança para a fase de votação
    stepSuspeitoMatch(match, 30.0);
    expect(match.phase).toBe("voting");

    // P4 é sabotador
    const p4 = match.players.get("p4")!;
    p4.role = "sabotador";

    // Votos em P4
    queueSuspeitoVote(match, "p1", "p4");
    queueSuspeitoVote(match, "p2", "p4");
    queueSuspeitoVote(match, "p3", "p4");
    queueSuspeitoVote(match, "p4", "skip");
    queueSuspeitoVote(match, "p5", "p4");

    // Todos votaram -> transiciona para vote_result
    expect(match.phase).toBe("vote_result");
    expect(match.meeting?.ejectedId).toBe("p4");
    expect(match.meeting?.ejectedRole).toBe("sabotador");
    expect(p4.alive).toBe(false);
  });

  it("conclusão de 100% das tarefas dá vitória aos colaboradores", () => {
    const match = createSuspeitoMatch(mockPlayers, DEFAULT_ROOM_OPTIONS, 12345);
    match.phase = "working";

    // Completa todas as tarefas dos colaboradores
    for (const p of match.players.values()) {
      if (p.role === "colaborador") {
        for (const t of p.tasks) t.completed = true;
      }
    }

    stepSuspeitoMatch(match, 0.1);
    expect(match.phase).toBe("over");
    expect(match.winner).toBe("colaborador");
    expect(match.winReason).toBe("tasks_completed");
  });

  it("sabotagem crítica de vazamento de dados não contida dá vitória aos sabotadores", () => {
    const match = createSuspeitoMatch(mockPlayers, DEFAULT_ROOM_OPTIONS, 12345);
    match.phase = "working";

    const p1 = match.players.get("p1")!;
    p1.role = "sabotador";
    p1.sabotageCooldownMs = 0;
    match.sabotageGlobalCooldownMs = 0;

    queueSuspeitoSabotage(match, "p1", "vazamento_dados");
    expect(match.sabotage?.active).toBe(true);
    expect(match.sabotage?.critical).toBe(true);

    // Avança 40 segundos sem consertar (duração é 35s)
    stepSuspeitoMatch(match, 40.0);

    expect(match.phase).toBe("over");
    expect(match.winner).toBe("sabotador");
    expect(match.winReason).toBe("sabotage_critical");
  });

  it("VIS-01 e COL-01: paredes bloqueiam visão, colisão e eliminação", () => {
    const match = createSuspeitoMatch(mockPlayers, DEFAULT_ROOM_OPTIONS, 12345);
    match.phase = "working";

    const p1 = match.players.get("p1")!;
    const p2 = match.players.get("p2")!;
    p1.role = "sabotador";
    p1.killCooldownMs = 0;
    p2.role = "colaborador";
    p2.alive = true;

    // Coloca p1 dentro da Sala de Reuniões (x: -4, z: 5.5)
    // E p2 no corredor Sul logo do outro lado da parede sul de Reunião (x: -4, z: 6.5)
    // Distância euclidiana: apenas 1.0m (dentro do raio de 2m de kill!), mas separados pela parede em z = 6.0
    p1.pos = { x: -8, z: 5.5 };
    p2.pos = { x: -8, z: 6.5 };

    // 1. Tentar eliminar através da parede DEVE ser rejeitado
    const killed = queueSuspeitoKill(match, "p1", "p2");
    expect(killed).toBe(false);
    expect(p2.alive).toBe(true);

    // 2. Visibilidade: P2 NÃO deve constar em visiblePlayerIds de P1
    const privP1 = buildSuspeitoPrivate(match, "p1")!;
    expect(privP1.visiblePlayerIds).not.toContain("p2");
    expect(privP1.canKill).toBe(false);

    // 3. Colisão física: mover P1 em direção à parede (mz: 1) não deve atravessá-la
    setSuspeitoInput(match, "p1", { mx: 0, mz: 1, yaw: 0 });
    stepSuspeitoMatch(match, 0.5);
    // Parede está em z = 6.0, com raio 0.45 p1.pos.z deve ficar antes de 6.0
    expect(p1.pos.z).toBeLessThan(6.0);
  });

  it("VIS-03: corpo atrás de parede não aparece em visibleBodyIds e não pode ser reportado", () => {
    const match = createSuspeitoMatch(mockPlayers, DEFAULT_ROOM_OPTIONS, 12345);
    match.phase = "working";

    // P1 dentro da sala (x: -8, z: 5.5)
    const p1 = match.players.get("p1")!;
    p1.pos = { x: -8, z: 5.5 };

    // Corpo no corredor logo atrás da parede opaca (x: -8, z: 6.5)
    match.bodies.push({
      id: "body_behind_wall",
      victimId: "p5",
      victimName: "Edu",
      avatar: {} as any,
      pos: { x: -8, z: 6.5 },
      sector: "rh",
      reported: false,
    });

    const priv = buildSuspeitoPrivate(match, "p1")!;
    expect(priv.visibleBodyIds).not.toContain("body_behind_wall");
    expect(priv.canReport).toBe(false);

    const reported = queueSuspeitoReport(match, "p1", "body_behind_wall");
    expect(reported).toBe(false);
  });
});
