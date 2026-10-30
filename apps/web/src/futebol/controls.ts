import { FUT, type FutInput } from "@ec/shared";

/** Teclas de movimento já resolvidas (o motor traduz o mapa de teclas) e o analógico da tela (x direita, y frente). */
export interface FutKeys {
  frente: boolean;
  tras: boolean;
  esquerda: boolean;
  direita: boolean;
  stick: { x: number; y: number };
}

/** Botões do mouse (ou os botões da tela). left/right = segurado agora; leftHit/rightHit = apertou desde a última leitura, mesmo que já tenha soltado. */
export interface FutMouse {
  left: boolean;
  right: boolean;
  leftHit: boolean;
  rightHit: boolean;
}

export interface FutControlState {
  /** Instante do último aperto de W (para o toque duplo). */
  lastFrente: number;
  frenteHeld: boolean;
  running: boolean;
  /** Quantas leituras ainda mandam "release" depois de soltar (redundância contra pacote trocado no mesmo tick). */
  kickRelease: number;
  passRelease: number;
  kickHeld: boolean;
  passHeld: boolean;
}

/** Quantas leituras seguidas mandam "release": a segunda cobre o caso de duas mensagens caírem no mesmo tick do servidor. */
const RELEASE_STEPS = 2;
/** Analógico além disso conta como borda: corrida. */
export const STICK_RUN_EDGE = 0.92;

export function newMouse(): FutMouse {
  return { left: false, right: false, leftHit: false, rightHit: false };
}

export function newControlState(): FutControlState {
  return { lastFrente: -Infinity, frenteHeld: false, running: false, kickRelease: 0, passRelease: 0, kickHeld: false, passHeld: false };
}

function phase(down: boolean, held: boolean, release: number): { out: FutInput["kick"]; held: boolean; release: number } {
  if (down) return { out: "charge", held: true, release: 0 };
  if (held) return { out: "release", held: false, release: RELEASE_STEPS - 1 };
  if (release > 0) return { out: "release", held: false, release: release - 1 };
  return { out: "none", held: false, release: 0 };
}

/**
 * Uma leitura dos controles por passo de envio. Toque duplo em W (até FUT.doubleTapMs) liga a corrida até soltar W;
 * esquerdo = chute (carrega enquanto segura, solta = release), direito = passe. `yaw` é a câmera (frente = para onde ela olha);
 * `aim` é a direção do chute/passe (padrão: a câmera). Os botões Hit são consumidos aqui.
 */
export function readFutInput(keys: FutKeys, mouse: FutMouse, now: number, state: FutControlState, view: { yaw: number; aim?: number } = { yaw: 0 }): FutInput {
  if (keys.frente && !state.frenteHeld && now - state.lastFrente <= FUT.doubleTapMs) state.running = true;
  if (keys.frente && !state.frenteHeld) state.lastFrente = now;
  if (!keys.frente) state.running = false;
  state.frenteHeld = keys.frente;

  const f = (keys.frente ? 1 : 0) - (keys.tras ? 1 : 0) + keys.stick.y;
  const r = (keys.direita ? 1 : 0) - (keys.esquerda ? 1 : 0) + keys.stick.x;
  const sy = Math.sin(view.yaw);
  const cy = Math.cos(view.yaw);
  let mx = f * sy - r * cy;
  let mz = f * cy + r * sy;
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const stickRun = Math.hypot(keys.stick.x, keys.stick.y) >= STICK_RUN_EDGE;

  const k = phase(mouse.left || mouse.leftHit, state.kickHeld, state.kickRelease);
  const p = phase(mouse.right || mouse.rightHit, state.passHeld, state.passRelease);
  mouse.leftHit = false;
  mouse.rightHit = false;
  state.kickHeld = k.held;
  state.kickRelease = k.release;
  state.passHeld = p.held;
  state.passRelease = p.release;

  return { mx, mz, aim: view.aim ?? view.yaw, sprint: (state.running && keys.frente) || stickRun, kick: k.out, pass: p.out };
}

/** Alcance (m) da bola solta para o botão de chute valer como chute (igual ao do servidor: sprintTouch + 0,1). */
const LOOSE_REACH = FUT.sprintTouch + 0.1;

/** true = o botão esquerdo chuta e o direito passa; false = viram carrinho e disputa. */
export function hasBallReach(ball: { x: number; y: number; z: number; ownerId: string | null }, me: { id: string; x: number; z: number }): boolean {
  if (ball.ownerId === me.id) return true;
  return ball.ownerId === null && ball.y <= 1.2 && Math.hypot(ball.x - me.x, ball.z - me.z) <= LOOSE_REACH;
}

/** Códigos de tecla dos botões da tela (o toque aperta a mesma tecla que o teclado usa). */
export const TOUCH_KICK = "FutChute";
export const TOUCH_PASS = "FutPasse";
