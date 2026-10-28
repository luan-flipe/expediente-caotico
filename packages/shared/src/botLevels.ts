import { RACE } from "./race/balance";

/** Dificuldade dos bots, escolhida pelo anfitrião. "normal" é o comportamento de sempre. */
export const BOT_LEVELS = ["easy", "normal", "hard"] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];
export const DEFAULT_BOT_LEVEL: BotLevel = "normal";

export const BOT_LEVEL_NAMES: Record<BotLevel, string> = { easy: "Fácil", normal: "Normal", hard: "Difícil" };

export const LAPS_MIN = 1;
export const LAPS_MAX = 5;

/** Opções da sala que só o anfitrião muda. Um campo novo (ex.: pista) entra aqui sem mexer no resto. */
export interface RoomOptions {
  /** Voltas da corrida (o contra o relógio ignora). */
  laps: number;
  /** Caixas e itens na corrida (o contra o relógio nunca tem). */
  items: boolean;
  botLevel: BotLevel;
}

export const DEFAULT_ROOM_OPTIONS: RoomOptions = { laps: RACE.laps, items: true, botLevel: DEFAULT_BOT_LEVEL };

export interface ShooterBotParams {
  /** Intervalo entre "pensamentos" (troca de alvo e de lado): base + sorteio. Maior = reage mais devagar. */
  thinkBaseMs: number;
  thinkRangeMs: number;
  /** Erro máximo de mira, em radianos (sorteio de ±metade). */
  aimError: number;
  /** Fator sobre a velocidade de movimento (1 = pleno). */
  speed: number;
  /** Chance por tick de usar uma habilidade e de se esquivar com pouca vida. */
  abilityRate: number;
  dodgeRate: number;
  /** Distância máxima para atirar. */
  fireRange: number;
}

export const SHOOTER_BOT: Record<BotLevel, ShooterBotParams> = {
  easy: { thinkBaseMs: 600, thinkRangeMs: 700, aimError: 0.5, speed: 0.8, abilityRate: 0.01, dodgeRate: 0.004, fireRange: 16 },
  normal: { thinkBaseMs: 350, thinkRangeMs: 500, aimError: 0.24, speed: 1, abilityRate: 0.02, dodgeRate: 0.01, fireRange: 22 },
  hard: { thinkBaseMs: 200, thinkRangeMs: 300, aimError: 0.1, speed: 1, abilityRate: 0.035, dodgeRate: 0.02, fireRange: 26 },
};

export interface RaceBotParams {
  /** Distância à frente (m) onde o bot mira: base + velocidade * fator. Menor = reage tarde às curvas. */
  lookBase: number;
  lookSpeed: number;
  /** Força da correção de direção. */
  steerGain: number;
  /** Acelerador máximo (1 = pleno). */
  throttleMax: number;
  /** Acelerador nas curvas fechadas. */
  cornerThrottle: number;
  /** Largura do desvio lateral sorteado (1 = o de sempre). */
  laneSpread: number;
  /** Multiplica o tempo que segura o item antes de usar (maior = demora mais). */
  holdScale: number;
  /** Multiplica a distância em que acha que vale usar o item. */
  rangeScale: number;
}

export const RACE_BOT: Record<BotLevel, RaceBotParams> = {
  easy: { lookBase: 4, lookSpeed: 0.25, steerGain: 1.8, throttleMax: 0.85, cornerThrottle: 0.2, laneSpread: 1.2, holdScale: 1.8, rangeScale: 0.6 },
  normal: { lookBase: 6, lookSpeed: 0.35, steerGain: 2.5, throttleMax: 1, cornerThrottle: 0.2, laneSpread: 0.9, holdScale: 1, rangeScale: 1 },
  hard: { lookBase: 7, lookSpeed: 0.38, steerGain: 2.8, throttleMax: 1, cornerThrottle: 0.25, laneSpread: 0.5, holdScale: 0.6, rangeScale: 1.4 },
};
