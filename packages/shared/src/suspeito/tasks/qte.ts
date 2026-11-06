import type {
  QtePrinterState,
  QteSequenceState,
  QteTaskState,
  QteTimingState,
  QteWiresState,
} from "../types";

export interface QteChallenge {
  kind: "timing" | "sequence" | "wires" | "printer";
  state: QteTaskState;
}

const SEQUENCE_PRESETS = [
  ["4", "2", "8", "1"],
  ["9", "0", "3", "5"],
  ["1", "6", "4", "7"],
  ["A", "W", "D", "S"],
  ["W", "A", "S", "D"],
  ["F", "R", "O", "T"],
];

const WIRE_COLORS = ["red", "blue", "yellow", "green"];

const PRINTER_STEPS = [
  "Abrir trava da bandeja frontal",
  "Puxar folha de papel enroscada",
  "Fechar tampa e reiniciar alimentador",
];

export function createQteChallenge(
  type: "qte_reacao" | "qte_sequencia" | "qte_cabos" | "qte_impressora",
  rng = Math.random
): QteChallenge {
  if (type === "qte_reacao") {
    // Zona alvo entre 0.40 e 0.65
    const targetMin = 0.4 + rng() * 0.1;
    const targetMax = targetMin + 0.18;
    const state: QteTimingState = {
      kind: "timing",
      targetMin: Number(targetMin.toFixed(2)),
      targetMax: Number(targetMax.toFixed(2)),
      durationSec: 10,
      completed: false,
      failed: false,
    };
    return { kind: "timing", state };
  }

  if (type === "qte_sequencia") {
    const preset = SEQUENCE_PRESETS[Math.floor(rng() * SEQUENCE_PRESETS.length)];
    const state: QteSequenceState = {
      kind: "sequence",
      sequence: [...preset],
      currentIndex: 0,
      completed: false,
      failed: false,
    };
    return { kind: "sequence", state };
  }

  if (type === "qte_cabos") {
    const shuffled = [...WIRE_COLORS].sort(() => rng() - 0.5);
    const state: QteWiresState = {
      kind: "wires",
      colors: shuffled,
      connected: [],
      completed: false,
    };
    return { kind: "wires", state };
  }

  // qte_impressora
  const state: QtePrinterState = {
    kind: "printer",
    step: 0,
    stepLabels: PRINTER_STEPS,
    completed: false,
  };
  return { kind: "printer", state };
}

export function applyQteAction(
  challenge: QteChallenge,
  action: {
    kind: "timing" | "sequence" | "wire" | "printer";
    timingValue?: number;
    key?: string;
    color?: string;
    printerStep?: number;
  }
): { valid: boolean; completed: boolean; state: QteTaskState; error?: string } {
  if (challenge.state.completed) {
    return { valid: true, completed: true, state: challenge.state };
  }

  if (challenge.kind === "timing" && action.kind === "timing" && action.timingValue !== undefined) {
    const s = challenge.state as QteTimingState;
    const val = action.timingValue;
    if (val >= s.targetMin && val <= s.targetMax) {
      s.completed = true;
      return { valid: true, completed: true, state: s };
    } else {
      return { valid: true, completed: false, state: s, error: "Fora da área verde!" };
    }
  }

  if (challenge.kind === "sequence" && action.kind === "sequence" && action.key) {
    const s = challenge.state as QteSequenceState;
    const expected = s.sequence[s.currentIndex];
    if (action.key.toUpperCase() === expected.toUpperCase()) {
      s.currentIndex++;
      if (s.currentIndex >= s.sequence.length) {
        s.completed = true;
      }
      return { valid: true, completed: s.completed, state: s };
    } else {
      // Errou: reseta para o começo do código
      s.currentIndex = 0;
      return { valid: true, completed: false, state: s, error: "Sequência incorreta! Tente novamente." };
    }
  }

  if (challenge.kind === "wires" && action.kind === "wire" && action.color) {
    const s = challenge.state as QteWiresState;
    if (!s.connected.includes(action.color) && s.colors.includes(action.color)) {
      s.connected.push(action.color);
      if (s.connected.length >= s.colors.length) {
        s.completed = true;
      }
      return { valid: true, completed: s.completed, state: s };
    }
    return { valid: false, completed: s.completed, state: s };
  }

  if (challenge.kind === "printer" && action.kind === "printer") {
    const s = challenge.state as QtePrinterState;
    if (action.printerStep === s.step) {
      s.step++;
      if (s.step >= s.stepLabels.length) {
        s.completed = true;
      }
      return { valid: true, completed: s.completed, state: s };
    }
    return { valid: false, completed: s.completed, state: s };
  }

  return { valid: false, completed: false, state: challenge.state, error: "Ação inválida" };
}
