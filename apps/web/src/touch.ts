import type { Quality } from "./settings";

/** Tela de toque como ponteiro principal (celular, tablet). Notebook com tela de toque e mouse não conta. */
export function isTouchPrimary(env: { coarse: boolean; touchPoints: number }): boolean {
  return env.coarse && env.touchPoints > 0;
}

/** Lido uma vez ao abrir o jogo: os controles na tela só aparecem quando isto é verdade. */
export const IS_TOUCH: boolean =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  isTouchPrimary({
    coarse: window.matchMedia("(pointer: coarse)").matches,
    // alguns navegadores (e emuladores) informam 0 pontos mesmo tendo eventos de toque
    touchPoints: Math.max(navigator.maxTouchPoints ?? 0, "ontouchstart" in window ? 1 : 0),
  });

/** Celular começa no Leve; o computador no Alta. Só vale enquanto o jogador não escolheu. */
export function defaultQuality(touch: boolean): Quality {
  return touch ? "leve" : "alta";
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

/** Tira a zona morta e reescala o resto para 0..1, sem salto logo depois dela. */
function shape(mag: number, deadzone: number): number {
  if (mag <= deadzone) return 0;
  return Math.min(1, (mag - deadzone) / (1 - deadzone));
}

/**
 * Analógico: deslocamento do dedo (px, y da tela cresce para baixo) vira vetor de força até 1.
 * y positivo é para frente (dedo para cima).
 */
export function stickVector(dx: number, dy: number, radius: number, deadzone: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  const mag = shape(len / radius, deadzone);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: (dx / len) * mag, y: (-dy / len) * mag };
}

/** Volante: arrasto horizontal desde onde o dedo encostou. Direita positivo, como as teclas. */
export function steerFromDrag(dx: number, radius: number, deadzone: number): number {
  const mag = shape(Math.abs(dx) / radius, deadzone);
  return clamp1(Math.sign(dx) * mag);
}

/** Estado analógico dos controles na tela, lido pelos motores a cada quadro. */
export const touchInput = {
  /** analógico do tiroteio: x direita, y frente */
  move: { x: 0, y: 0 },
  /** arrasto de mira acumulado em px desde a última leitura */
  look: { x: 0, y: 0 },
  /** volante da corrida (null: dedo fora, valem as teclas) */
  steer: null as number | null,
};

/** Devolve e zera o arrasto de mira acumulado. */
export function takeLook(): { x: number; y: number } {
  const l = { ...touchInput.look };
  touchInput.look.x = 0;
  touchInput.look.y = 0;
  return l;
}

export function resetTouchInput(): void {
  touchInput.move = { x: 0, y: 0 };
  touchInput.look = { x: 0, y: 0 };
  touchInput.steer = null;
}

/** Botões da tela apertam a mesma tecla que o teclado usa: o jogo segue um caminho só de entrada. */
export function pressKey(code: string, down: boolean): void {
  window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }));
}
