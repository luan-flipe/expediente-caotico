import type { SuspeitoSabotageState, SuspeitoSabotageType } from "./types";
import { SABOTAGE_FIX_POSITIONS } from "./map";

export const SABOTAGE_CONFIGS: Record<
  SuspeitoSabotageType,
  {
    title: string;
    description: string;
    critical: boolean;
    durationMs: number;
  }
> = {
  vazamento_dados: {
    title: "Vazamento Crítico de Dados",
    description: "Contenha o vazamento na Sala de Servidores antes que os dados da empresa vazem!",
    critical: true,
    durationMs: 35000,
  },
  falha_energia: {
    title: "Queda Geral de Energia",
    description: "Restaure os disjuntores no quadro de força da Infraestrutura.",
    critical: false,
    durationMs: 45000,
  },
  queda_rede: {
    title: "Queda dos Switches de Rede",
    description: "Reinicie os roteadores centrais na sala de Desenvolvimento.",
    critical: false,
    durationMs: 40000,
  },
  impressora_travada: {
    title: "Fila de Impressão Travada",
    description: "Destrave o atolamento de papel no setor de Impressão.",
    critical: false,
    durationMs: 30000,
  },
};

export function startSabotage(type: SuspeitoSabotageType): SuspeitoSabotageState {
  const cfg = SABOTAGE_CONFIGS[type];
  const fix = SABOTAGE_FIX_POSITIONS[type] ?? { sector: "servidores", pos: { x: 0, z: 0 } };

  return {
    type,
    title: cfg.title,
    description: cfg.description,
    critical: cfg.critical,
    active: true,
    remainingMs: cfg.durationMs,
    totalMs: cfg.durationMs,
    fixSector: fix.sector,
    fixPos: fix.pos,
    fixed: false,
  };
}

export function stepSabotage(state: SuspeitoSabotageState, dtMs: number): { expired: boolean } {
  if (!state.active || state.fixed) return { expired: false };

  state.remainingMs = Math.max(0, state.remainingMs - dtMs);
  return { expired: state.remainingMs <= 0 };
}
