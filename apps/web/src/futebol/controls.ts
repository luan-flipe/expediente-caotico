import { FUT, type FutInput } from "@ec/shared";

/** Teclas de movimento já resolvidas (o motor traduz o mapa de teclas) e o analógico da tela (x direita, y frente). `correr` = Shift. */
export interface FutKeys {
  frente: boolean;
  tras: boolean;
  esquerda: boolean;
  direita: boolean;
  correr: boolean;
  stick: { x: number; y: number };
}

/** Botões de ação: Espaço do teclado (chute e passe) e Chute/Passe da tela. O mouse não faz parte: ele só gira a câmera de quem cobra uma reposição.
 *  Cada um: segurado agora; xHit = apertou desde a última leitura, mesmo que já tenha soltado. */
export interface FutButtons {
  space: boolean;
  spaceHit: boolean;
  kick: boolean;
  kickHit: boolean;
  pass: boolean;
  passHit: boolean;
}

export type FutButton = "space" | "kick" | "pass";

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
  /** Espaço: segurado na leitura anterior, instante do aperto e quantas leituras ainda faltam do passe de um toque rápido. */
  spaceHeld: boolean;
  spaceSince: number;
  tapRelease: number;
}

/** Quantas leituras seguidas mandam "release": a segunda cobre o caso de duas mensagens caírem no mesmo tick do servidor. */
const RELEASE_STEPS = 2;
/** Analógico além disso conta como borda: corrida. */
export const STICK_RUN_EDGE = 0.92;
/** Espaço solto antes disso (ms) é um toque rápido: passe. Segurar mais que isso carrega o chute. */
export const TAP_PASS_MS = 150;

export function newButtons(): FutButtons {
  return { space: false, spaceHit: false, kick: false, kickHit: false, pass: false, passHit: false };
}

export function newControlState(): FutControlState {
  return {
    lastFrente: -Infinity,
    frenteHeld: false,
    running: false,
    kickRelease: 0,
    passRelease: 0,
    kickHeld: false,
    passHeld: false,
    spaceHeld: false,
    spaceSince: 0,
    tapRelease: 0,
  };
}

function phase(down: boolean, held: boolean, release: number): { out: FutInput["kick"]; held: boolean; release: number } {
  if (down) return { out: "charge", held: true, release: 0 };
  if (held) return { out: "release", held: false, release: RELEASE_STEPS - 1 };
  if (release > 0) return { out: "release", held: false, release: release - 1 };
  return { out: "none", held: false, release: 0 };
}

/**
 * Uma leitura dos controles por passo de envio. Toque duplo em W (até FUT.doubleTapMs) ou Shift ligam a corrida.
 * Espaço segurado carrega o chute (soltar = release); solto antes de TAP_PASS_MS, com a bola, vira passe. Sem a bola o
 * toque rápido continua sendo "kick" (o servidor lê como carrinho). Chute/Passe da tela fazem o mesmo por botão.
 * `yaw` é a câmera (frente = para onde ela olha); `aim` é a direção do chute/passe (padrão: a câmera). Os Hit são consumidos aqui.
 */
export function readFutInput(
  keys: FutKeys,
  btn: FutButtons,
  now: number,
  state: FutControlState,
  view: { yaw: number; aim?: number; hasBall?: boolean } = { yaw: 0 },
): FutInput {
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
  const shiftRun = keys.correr && len > 0;

  const spaceDown = btn.space || btn.spaceHit;
  if (spaceDown && !state.spaceHeld) {
    state.spaceHeld = true;
    state.spaceSince = now;
  } else if (!spaceDown && state.spaceHeld) {
    state.spaceHeld = false;
    if (view.hasBall && now - state.spaceSince < TAP_PASS_MS) state.tapRelease = RELEASE_STEPS;
  }

  let k = phase(spaceDown || btn.kick || btn.kickHit, state.kickHeld, state.kickRelease);
  let p = phase(btn.pass || btn.passHit, state.passHeld, state.passRelease);
  if (state.tapRelease > 0) {
    // toque rápido com a bola: o que seria soltar o chute vira o passe
    state.tapRelease--;
    k = { out: "none", held: false, release: 0 };
    if (p.out === "none") p = { out: "release", held: false, release: 0 };
  }
  btn.spaceHit = false;
  btn.kickHit = false;
  btn.passHit = false;
  state.kickHeld = k.held;
  state.kickRelease = k.release;
  state.passHeld = p.held;
  state.passRelease = p.release;

  return { mx, mz, aim: view.aim ?? view.yaw, sprint: (state.running && keys.frente) || stickRun || shiftRun, kick: k.out, pass: p.out };
}

/** Alcance (m) da bola solta para o botão de chute valer como chute (igual ao do servidor: sprintTouch + 0,1). */
const LOOSE_REACH = FUT.sprintTouch + 0.1;

/** true = chute e passe valem como chute e passe; false = sem alcance da bola: viram carrinho e disputa. */
export function hasBallReach(ball: { x: number; y: number; z: number; ownerId: string | null }, me: { id: string; x: number; z: number }): boolean {
  if (ball.ownerId === me.id) return true;
  return ball.ownerId === null && ball.y <= 1.2 && Math.hypot(ball.x - me.x, ball.z - me.z) <= LOOSE_REACH;
}

/** Códigos de tecla dos botões da tela (o toque aperta a mesma tecla que o teclado usa). */
export const TOUCH_KICK = "FutChute";
export const TOUCH_PASS = "FutPasse";

// ---------- botões de ação ----------

const HIT = { space: "spaceHit", kick: "kickHit", pass: "passHit" } as const;

export function pressButton(b: FutButtons, which: FutButton): void {
  if (!b[which]) b[HIT[which]] = true;
  b[which] = true;
}

export function releaseButton(b: FutButtons, which: FutButton): void {
  b[which] = false;
}

/**
 * Cancela a carga em andamento sem chutar (perdeu o mouse preso, foco, menu ou chat por cima): os botões voltam a
 * "soltos" e o estado de leitura esquece o aperto, então a próxima leitura manda "none" (e não "release", que chutaria).
 * Quem ainda está com o dedo no botão precisa apertar de novo.
 */
export function cancelCharges(b: FutButtons, st: FutControlState): void {
  b.space = b.spaceHit = b.kick = b.kickHit = b.pass = b.passHit = false;
  st.kickHeld = st.passHeld = st.spaceHeld = false;
  st.kickRelease = st.passRelease = st.tapRelease = 0;
}

// ---------- barra de força ----------

export interface ChargeState {
  kind: "kick" | "pass" | null;
  /** Instante em que a carga atual começou. */
  since: number;
}

export function newCharge(): ChargeState {
  return { kind: null, since: 0 };
}

/**
 * A barra segue o INPUT LOCAL (o que acabou de ser enviado), não o servidor: aparece no mesmo passo em que o botão
 * é apertado, com ou sem a bola (o servidor decide ao soltar: chute/passe com a bola, carrinho/disputa sem ela).
 * Com os dois botões juntos fica no que já estava carregando, sem reiniciar.
 */
export function stepCharge(c: ChargeState, input: Pick<FutInput, "kick" | "pass">, now: number): void {
  const kick = input.kick === "charge";
  const pass = input.pass === "charge";
  const kind = kick && pass ? (c.kind ?? "kick") : kick ? "kick" : pass ? "pass" : null;
  if (kind !== c.kind) c.since = now;
  c.kind = kind;
}

/** Força 0..1 da carga no instante `now`. */
export function chargePower(c: ChargeState, now: number): number {
  return c.kind ? Math.max(0, Math.min(1, (now - c.since) / FUT.chargeMaxMs)) : 0;
}
