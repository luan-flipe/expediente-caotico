import type { QuickTaskState } from "../types";

export interface QuickTaskChallenge {
  state: QuickTaskState;
}

export function createQuickTaskChallenge(totalSteps = 4): QuickTaskChallenge {
  return {
    state: {
      step: 0,
      totalSteps,
      completed: false,
    },
  };
}

export function advanceQuickTask(challenge: QuickTaskChallenge): { step: number; completed: boolean } {
  if (challenge.state.completed) return { step: challenge.state.step, completed: true };

  challenge.state.step++;
  if (challenge.state.step >= challenge.state.totalSteps) {
    challenge.state.completed = true;
  }

  return {
    step: challenge.state.step,
    completed: challenge.state.completed,
  };
}
