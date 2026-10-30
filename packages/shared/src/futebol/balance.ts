export const FUT = {
  restartWaitMs: 8000,
  restartCountdownMs: 3000,
  walkSpeed: 6,
  sprintSpeed: 8.5,
  doubleTapMs: 250,
  controlRadius: 0.9,
  dribbleTouch: 0.7,
  sprintTouch: 1.6,
  chargeMaxMs: 1000,
  shotMin: 10,
  shotMax: 28,
  passMin: 6,
  passMax: 18,
  ballRadius: 0.25,
  goalCelebrateMs: 4000,
  kickoffWaitMs: 2000,
  gravity: 9.8,
  bounce: 0.55,
  groundFrictionPerSec: 0.35,
  ballStopSpeed: 0.05,
} as const;

/** Modelos de uniforme (kit = índice). */
export const FUT_KITS = ["Lisa", "Listrada", "Faixa"] as const;

/** Cores de uniforme (color = índice). */
export const FUT_COLORS = [
  { name: "Vermelho", hex: "#d62828" },
  { name: "Azul", hex: "#1d4ed8" },
  { name: "Verde", hex: "#16a34a" },
  { name: "Amarelo", hex: "#facc15" },
  { name: "Laranja", hex: "#f97316" },
  { name: "Roxo", hex: "#7e22ce" },
  { name: "Preto", hex: "#1f2937" },
  { name: "Branco", hex: "#f3f4f6" },
] as const;

/** Gramado do mapa Ipatingão já na escala do jogo (metros, centrado na origem, eixo comprido em X): meio comprimento e meia largura das linhas. */
export const IPATINGAO = { grassHalfL: 48.52, grassHalfW: 30.35 } as const;
