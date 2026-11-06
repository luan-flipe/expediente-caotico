import type { Vec2 } from "../types";
import type { SuspeitoBody, SuspeitoRole, SuspeitoTask } from "./types";
import { TASK_STATIONS } from "./map";

export interface SuspeitoBotBrain {
  targetPos: Vec2 | null;
  targetTaskId: string | null;
  taskTimerMs: number;
  wanderCooldownMs: number;
  voteCooldownMs: number;
}

export function createBotBrain(): SuspeitoBotBrain {
  return {
    targetPos: null,
    targetTaskId: null,
    taskTimerMs: 0,
    wanderCooldownMs: 0,
    voteCooldownMs: 0,
  };
}

export function stepSuspeitoBot(params: {
  botId: string;
  pos: Vec2;
  role: SuspeitoRole;
  brain: SuspeitoBotBrain;
  tasks: SuspeitoTask[];
  bodies: SuspeitoBody[];
  otherPlayers: { id: string; pos: Vec2; alive: boolean }[];
  canKill: boolean;
  killCooldownMs: number;
  phase: string;
  dtMs: number;
}): {
  input: { mx: number; mz: number; yaw: number };
  action?: "kill" | "report" | "task" | "vote";
  targetId?: string;
  sabotage?: boolean;
} {
  const { pos, role, brain, tasks, bodies, otherPlayers, canKill, phase, dtMs } = params;

  if (phase !== "working") {
    // Durante reunião, o bot decide um voto após um breve tempo de reflexão
    if (phase === "voting" && brain.voteCooldownMs <= 0) {
      brain.voteCooldownMs = 3000 + Math.random() * 5000;
      const aliveOthers = otherPlayers.filter((p) => p.alive);
      if (aliveOthers.length > 0 && Math.random() < 0.75) {
        const picked = aliveOthers[Math.floor(Math.random() * aliveOthers.length)];
        return { input: { mx: 0, mz: 0, yaw: 0 }, action: "vote", targetId: picked.id };
      }
      return { input: { mx: 0, mz: 0, yaw: 0 }, action: "vote", targetId: "skip" };
    }
    if (phase === "voting") {
      brain.voteCooldownMs -= dtMs;
    }
    return { input: { mx: 0, mz: 0, yaw: 0 } };
  }

  // 1. Verificar se vê algum corpo no chão para reportar
  for (const b of bodies) {
    if (b.reported) continue;
    const dx = b.pos.x - pos.x;
    const dz = b.pos.z - pos.z;
    const dSq = dx * dx + dz * dz;
    if (dSq <= 6.0 * 6.0) {
      if (dSq <= 2.0 * 2.0) {
        return { input: { mx: 0, mz: 0, yaw: 0 }, action: "report", targetId: b.id };
      }
      // Corre em direção ao corpo
      const d = Math.sqrt(dSq);
      return { input: { mx: dx / d, mz: dz / d, yaw: Math.atan2(dx, dz) } };
    }
  }

  // 2. Comportamento do Sabotador: caçar vítimas isoladas
  if (role === "sabotador" && canKill) {
    for (const p of otherPlayers) {
      if (!p.alive) continue;
      const dx = p.pos.x - pos.x;
      const dz = p.pos.z - pos.z;
      const dSq = dx * dx + dz * dz;

      // Se estiver no alcance de eliminação (<= 1.8m)
      if (dSq <= 2.0 * 2.0) {
        return { input: { mx: 0, mz: 0, yaw: 0 }, action: "kill", targetId: p.id };
      }

      // Se a vítima estiver a uma distância razoável (<= 10m)
      if (dSq <= 10.0 * 10.0) {
        const d = Math.sqrt(dSq);
        return { input: { mx: dx / d, mz: dz / d, yaw: Math.atan2(dx, dz) } };
      }
    }
  }

  // 3. Comportamento normal: ir até estações de tarefas
  if (!brain.targetPos || brain.wanderCooldownMs <= 0) {
    const incompleteTasks = tasks.filter((t) => !t.completed);
    if (incompleteTasks.length > 0 && Math.random() < 0.8) {
      const task = incompleteTasks[Math.floor(Math.random() * incompleteTasks.length)];
      brain.targetPos = { ...task.pos };
      brain.targetTaskId = task.id;
    } else {
      // Pega uma estação qualquer para circular
      const st = TASK_STATIONS[Math.floor(Math.random() * TASK_STATIONS.length)];
      brain.targetPos = { ...st.pos };
      brain.targetTaskId = null;
    }
    brain.wanderCooldownMs = 10000 + Math.random() * 5000;
  } else {
    brain.wanderCooldownMs -= dtMs;
  }

  const dx = brain.targetPos.x - pos.x;
  const dz = brain.targetPos.z - pos.z;
  const distSq = dx * dx + dz * dz;

  // Chegou na estação
  if (distSq <= 1.5 * 1.5) {
    if (brain.targetTaskId) {
      brain.taskTimerMs += dtMs;
      // Simula tempo executando tarefa (~3.5 segundos)
      if (brain.taskTimerMs >= 3500) {
        brain.taskTimerMs = 0;
        const taskToComplete = brain.targetTaskId;
        brain.targetTaskId = null;
        brain.targetPos = null;
        return { input: { mx: 0, mz: 0, yaw: 0 }, action: "task", targetId: taskToComplete };
      }
    } else {
      brain.targetPos = null;
    }
    return { input: { mx: 0, mz: 0, yaw: 0 } };
  }

  const dist = Math.sqrt(distSq);
  const mx = dx / dist;
  const mz = dz / dist;
  const yaw = Math.atan2(dx, dz);

  return { input: { mx, mz, yaw } };
}
