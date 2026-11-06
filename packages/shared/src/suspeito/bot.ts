import type { Vec2 } from "../types";
import { hasLineOfSight, SECTORS, TASK_STATIONS } from "./map";
import { findSuspeitoPath } from "./nav";
import type { SuspeitoMatch, SuspeitoPlayerSim } from "./match";
import type { SuspeitoMeetingMessage, SuspeitoSabotageType, SuspeitoSectorId, SuspeitoTask } from "./types";

export interface SuspeitoBotBrain {
  goal: Vec2 | null;
  goalKind: "task" | "fake" | "wander" | "fix" | "body" | "hunt" | null;
  goalId: string | null;
  path: Vec2[];
  repathMs: number;
  taskTimerMs: number;
  taskDurationMs: number;
  stuckMs: number;
  lastPos: Vec2 | null;
  voteDelayMs: number;
  sabotageThinkMs: number;
  huntDelayMs: number;
  suspicion: Record<string, number>;
  lastSectorBeforeMeeting?: SuspeitoSectorId;
  spokenInMeeting?: boolean;
  speakDelayMs?: number;
}

export function createBotBrain(): SuspeitoBotBrain {
  return {
    goal: null,
    goalKind: null,
    goalId: null,
    path: [],
    repathMs: 0,
    taskTimerMs: 0,
    taskDurationMs: 0,
    stuckMs: 0,
    lastPos: null,
    voteDelayMs: 0,
    sabotageThinkMs: 4000 + Math.random() * 6000,
    huntDelayMs: 4000 + Math.random() * 10000,
    suspicion: {},
    lastSectorBeforeMeeting: "reuniao",
    spokenInMeeting: false,
    speakDelayMs: 0,
  };
}

export function resetBotForMeeting(
  brain: SuspeitoBotBrain,
  votingDelayMs: number,
  lastSector?: SuspeitoSectorId
): void {
  brain.goal = null;
  brain.goalKind = null;
  brain.goalId = null;
  brain.path = [];
  brain.taskTimerMs = 0;
  brain.lastPos = null;
  brain.voteDelayMs = votingDelayMs;
  brain.huntDelayMs = 4000 + Math.random() * 10000;
  if (lastSector) brain.lastSectorBeforeMeeting = lastSector;
  brain.spokenInMeeting = false;
  brain.speakDelayMs = 1400 + Math.random() * 6000;
}

export function canSeeFrom(a: Vec2, b: Vec2, radius: number): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return dx * dx + dz * dz <= radius * radius && hasLineOfSight(a, b);
}

export type SuspeitoBotAction =
  | { kind: "kill"; targetId: string }
  | { kind: "report"; bodyId: string }
  | { kind: "task"; taskId: string }
  | { kind: "fix" }
  | { kind: "sabotage"; type: SuspeitoSabotageType };

export interface SuspeitoBotContext {
  visionRadius: number;
  killRange: number;
  reportRange: number;
  fixRange: number;
  isTaskBlocked: (t: SuspeitoTask) => boolean;
}

function setGoal(brain: SuspeitoBotBrain, kind: SuspeitoBotBrain["goalKind"], pos: Vec2, id: string | null = null): void {
  const same =
    brain.goalKind === kind &&
    brain.goalId === id &&
    brain.goal !== null &&
    Math.hypot(brain.goal.x - pos.x, brain.goal.z - pos.z) < 0.75;
  if (same) return;
  brain.goalKind = kind;
  brain.goalId = id;
  brain.goal = { ...pos };
  brain.path = [];
  brain.repathMs = 0;
  brain.taskTimerMs = 0;
}

function steer(bot: SuspeitoPlayerSim, dtMs: number, ghost: boolean): { mx: number; mz: number; yaw: number } {
  const brain = bot.brain!;
  if (!brain.goal) return { mx: 0, mz: 0, yaw: bot.yaw };

  brain.repathMs -= dtMs;
  if (!ghost && (brain.path.length === 0 || brain.repathMs <= 0)) {
    brain.path = findSuspeitoPath(bot.pos, brain.goal);
    brain.repathMs = 2500 + Math.random() * 1000;
  }
  if (ghost) brain.path = [brain.goal];

  while (brain.path.length > 1 && Math.hypot(brain.path[0].x - bot.pos.x, brain.path[0].z - bot.pos.z) < 0.5) {
    brain.path.shift();
  }
  const next = brain.path[0] ?? brain.goal;
  const dx = next.x - bot.pos.x;
  const dz = next.z - bot.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.2) return { mx: 0, mz: 0, yaw: bot.yaw };

  if (brain.lastPos) {
    const moved = Math.hypot(bot.pos.x - brain.lastPos.x, bot.pos.z - brain.lastPos.z);
    brain.stuckMs = moved < 0.02 ? brain.stuckMs + dtMs : 0;
    if (brain.stuckMs > 700) {
      brain.stuckMs = 0;
      brain.repathMs = 0;
      brain.path = [];
    }
  }
  brain.lastPos = { ...bot.pos };

  return { mx: dx / d, mz: dz / d, yaw: Math.atan2(dx, dz) };
}

function distSq(a: Vec2, b: Vec2): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

function pickTask(bot: SuspeitoPlayerSim, ctx: SuspeitoBotContext): SuspeitoTask | null {
  const open = bot.tasks.filter((t) => !t.completed && !ctx.isTaskBlocked(t));
  if (!open.length) return null;
  open.sort((a, b) => distSq(a.pos, bot.pos) - distSq(b.pos, bot.pos));
  return Math.random() < 0.7 ? open[0] : open[Math.floor(Math.random() * open.length)];
}

function wander(bot: SuspeitoPlayerSim): void {
  const st = TASK_STATIONS[Math.floor(Math.random() * TASK_STATIONS.length)];
  setGoal(bot.brain!, "wander", st.pos, st.id);
}

export function stepSuspeitoBot(
  match: SuspeitoMatch,
  bot: SuspeitoPlayerSim,
  dtMs: number,
  ctx: SuspeitoBotContext
): { input: { mx: number; mz: number; yaw: number }; action?: SuspeitoBotAction } {
  const brain = bot.brain!;
  const ghost = !bot.alive;
  const others = [...match.players.values()].filter((o) => o.id !== bot.id && !o.left);
  const isSab = bot.role === "sabotador";
  let action: SuspeitoBotAction | undefined;

  if (bot.alive) {
    brain.lastSectorBeforeMeeting = bot.sector;
  }

  if (isSab && match.sabotage?.active !== true && bot.sabotageCooldownMs <= 0 && match.sabotageGlobalCooldownMs <= 0) {
    brain.sabotageThinkMs -= dtMs;
    if (brain.sabotageThinkMs <= 0) {
      brain.sabotageThinkMs = 8000 + Math.random() * 12000;
      if (Math.random() < 0.5) {
        const types: SuspeitoSabotageType[] = ["vazamento_dados", "falha_energia", "falha_energia", "queda_rede", "impressora_travada"];
        return { input: steer(bot, dtMs, ghost), action: { kind: "sabotage", type: types[Math.floor(Math.random() * types.length)] } };
      }
    }
  }

  if (ghost) {
    if (!isSab) {
      const t = brain.goalKind === "task" ? bot.tasks.find((x) => x.id === brain.goalId && !x.completed) : null;
      const task = t ?? pickTask(bot, ctx);
      if (task) {
        setGoal(brain, "task", task.pos, task.id);
        if (distSq(task.pos, bot.pos) < 1.2 * 1.2) {
          if (!brain.taskDurationMs) brain.taskDurationMs = 5000 + Math.random() * 5000;
          brain.taskTimerMs += dtMs;
          if (brain.taskTimerMs >= brain.taskDurationMs) {
            brain.taskTimerMs = 0;
            brain.taskDurationMs = 0;
            brain.goal = null;
            return { input: { mx: 0, mz: 0, yaw: bot.yaw }, action: { kind: "task", taskId: task.id } };
          }
          return { input: { mx: 0, mz: 0, yaw: bot.yaw } };
        }
      } else if (!brain.goal || distSq(brain.goal, bot.pos) < 1) {
        wander(bot);
      }
    } else if (!brain.goal || distSq(brain.goal, bot.pos) < 1) {
      wander(bot);
    }
    return { input: steer(bot, dtMs, true) };
  }

  const visibleOthers = others.filter((o) => o.alive && canSeeFrom(bot.pos, o.pos, ctx.visionRadius));

  // corpo à vista: colaborador vai reportar e desconfia de quem estava por perto
  if (!isSab) {
    const body = match.bodies.find((b) => !b.reported && canSeeFrom(bot.pos, b.pos, ctx.visionRadius));
    if (body) {
      for (const o of visibleOthers) {
        if (distSq(o.pos, body.pos) < 4 * 4) brain.suspicion[o.id] = (brain.suspicion[o.id] ?? 0) + 2;
      }
      if (distSq(body.pos, bot.pos) <= ctx.reportRange * ctx.reportRange) {
        return { input: { mx: 0, mz: 0, yaw: bot.yaw }, action: { kind: "report", bodyId: body.id } };
      }
      setGoal(brain, "body", body.pos, body.id);
      return { input: steer(bot, dtMs, false) };
    }
  }

  const sab = match.sabotage;
  if (!isSab && sab?.active) {
    const crew = others.filter((o) => o.alive && o.role === "colaborador");
    const myD = distSq(bot.pos, sab.fixPos);
    const closer = crew.filter((o) => distSq(o.pos, sab.fixPos) < myD).length;
    if (sab.critical ? closer < 3 : closer === 0) {
      if (myD <= ctx.fixRange * ctx.fixRange * 0.8) {
        return { input: { mx: 0, mz: 0, yaw: bot.yaw }, action: { kind: "fix" } };
      }
      setGoal(brain, "fix", sab.fixPos, sab.type);
      return { input: steer(bot, dtMs, false) };
    }
  }

  if (isSab && bot.killCooldownMs <= 0 && brain.huntDelayMs > 0) brain.huntDelayMs -= dtMs;
  if (isSab && bot.killCooldownMs <= 0 && brain.huntDelayMs <= 0) {
    const victims = visibleOthers.filter((o) => o.role !== "sabotador");
    const witnessesOf = (victimId: string) =>
      others.filter(
        (o) => o.alive && o.id !== victimId && o.role !== "sabotador" && canSeeFrom(o.pos, bot.pos, ctx.visionRadius)
      ).length;
    victims.sort((a, b) => distSq(a.pos, bot.pos) - distSq(b.pos, bot.pos));
    for (const v of victims) {
      if (witnessesOf(v.id) > 0) continue;
      if (distSq(v.pos, bot.pos) <= ctx.killRange * ctx.killRange * 0.8) {
        action = { kind: "kill", targetId: v.id };
        brain.huntDelayMs = 4000 + Math.random() * 10000;
        brain.goal = null;
        wander(bot);
        return { input: steer(bot, dtMs, false), action };
      }
      setGoal(brain, "hunt", v.pos, v.id);
      return { input: steer(bot, dtMs, false) };
    }
    if (brain.goalKind === "hunt") brain.goal = null;
  }

  // tarefas (reais para colaborador, encenadas para sabotador)
  if (brain.goalKind !== "task" && brain.goalKind !== "fake" && brain.goalKind !== "wander") brain.goal = null;
  if (!brain.goal) {
    const task = pickTask(bot, ctx);
    if (task) setGoal(brain, isSab ? "fake" : "task", task.pos, task.id);
    else wander(bot);
  }
  const goal = brain.goal!;
  if (distSq(goal, bot.pos) < 1.1 * 1.1) {
    if (brain.goalKind === "wander") {
      brain.goal = null;
      return { input: { mx: 0, mz: 0, yaw: bot.yaw } };
    }
    if (!brain.taskDurationMs) brain.taskDurationMs = 5000 + Math.random() * 5000;
    brain.taskTimerMs += dtMs;
    if (brain.taskTimerMs >= brain.taskDurationMs) {
      const id = brain.goalId;
      const kind = brain.goalKind;
      brain.taskTimerMs = 0;
      brain.taskDurationMs = 0;
      brain.goal = null;
      if (kind === "fake") {
        const t = bot.tasks.find((x) => x.id === id);
        if (t) t.completed = true;
        if (bot.tasks.every((x) => x.completed)) for (const x of bot.tasks) x.completed = false;
      } else if (id) {
        return { input: { mx: 0, mz: 0, yaw: bot.yaw }, action: { kind: "task", taskId: id } };
      }
    }
    return { input: { mx: 0, mz: 0, yaw: bot.yaw } };
  }
  return { input: steer(bot, dtMs, false) };
}

/** Gera depoimento espontâneo do bot durante a reunião baseado no que ele presenciou ou onde estava. */
export function decideSuspeitoBotStatement(
  match: SuspeitoMatch,
  bot: SuspeitoPlayerSim,
  dtMs: number
): { text: string; kind: SuspeitoMeetingMessage["kind"]; targetId?: string } | null {
  const brain = bot.brain;
  if (!brain || brain.spokenInMeeting || !bot.alive) return null;

  brain.speakDelayMs = (brain.speakDelayMs ?? 2000) - dtMs;
  if (brain.speakDelayMs > 0) return null;
  brain.spokenInMeeting = true;

  const candidates = [...match.players.values()].filter((o) => o.alive && o.id !== bot.id && !o.left);
  const sectorId = brain.lastSectorBeforeMeeting ?? bot.tasks[0]?.sector ?? "reuniao";
  const sectorName = SECTORS[sectorId]?.name ?? "Escritório";

  if (bot.role === "colaborador") {
    let best: SuspeitoPlayerSim | null = null;
    let bestScore = 0;
    for (const c of candidates) {
      const s = brain.suspicion[c.id] ?? 0;
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (best && bestScore >= 80) {
      return {
        text: `👀 Eu vi ${best.name} cometendo o crime na minha frente! Votem nele(a)!`,
        kind: "accuse",
        targetId: best.id,
      };
    }
    if (best && bestScore >= 2) {
      return {
        text: `⚠️ Desconfio de ${best.name}, estava muito perto da ocorrência!`,
        kind: "accuse",
        targetId: best.id,
      };
    }
    if (Math.random() < 0.75) {
      return {
        text: `📋 Eu estava em ${sectorName} adiantando minhas tarefas.`,
        kind: "alibi",
      };
    }
  } else {
    // Sabotador finge álibi convincente
    const fakeTaskSector = bot.tasks[0]?.sector ?? sectorId;
    const fakeSectorName = SECTORS[fakeTaskSector]?.name ?? sectorName;
    if (Math.random() < 0.8) {
      return {
        text: `📋 Eu estava tranquilo lá em ${fakeSectorName} trabalhando, não vi nada.`,
        kind: "alibi",
      };
    }
  }

  return null;
}

/** Decide o voto do bot; null = ainda pensando. */
export function decideSuspeitoBotVote(match: SuspeitoMatch, bot: SuspeitoPlayerSim, dtMs: number): string | null {
  const brain = bot.brain!;
  brain.voteDelayMs -= dtMs;
  if (brain.voteDelayMs > 0) return null;

  const candidates = [...match.players.values()].filter((o) => o.alive && o.id !== bot.id);
  const votes = match.meeting?.votes ?? {};
  const tally: Record<string, number> = {};
  for (const t of Object.values(votes)) if (t !== "skip") tally[t] = (tally[t] ?? 0) + 1;

  if (bot.role === "sabotador") {
    const crew = candidates.filter((c) => c.role !== "sabotador");
    const lead = crew.sort((a, b) => (tally[b.id] ?? 0) - (tally[a.id] ?? 0))[0];
    if (lead && (tally[lead.id] ?? 0) > 0) return lead.id;
    if (crew.length && Math.random() < 0.25) return crew[Math.floor(Math.random() * crew.length)].id;
    return "skip";
  }

  let best: SuspeitoPlayerSim | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const s = brain.suspicion[c.id] ?? 0;
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  if (best && bestScore >= 2) return best.id;

  const lead = candidates.sort((a, b) => (tally[b.id] ?? 0) - (tally[a.id] ?? 0))[0];
  if (lead && (tally[lead.id] ?? 0) >= 2 && Math.random() < 0.6) return lead.id;
  return "skip";
}
