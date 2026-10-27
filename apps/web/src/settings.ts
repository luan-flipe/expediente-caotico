import { useSyncExternalStore } from "react";

/** Ações com tecla própria no tiroteio. O clique esquerdo do mouse também atira (fixo). */
export const SHOOTER_ACTIONS = ["frente", "tras", "esquerda", "direita", "atirar", "habilidade1", "habilidade2", "habilidade3", "esquiva", "evolucao1", "evolucao2", "evolucao3", "placar"] as const;
/** Ações com tecla própria na corrida. As setas e o clique esquerdo (item) valem sempre como alternativa. */
export const RACE_ACTIONS = ["acelerar", "frear", "esquerda", "direita", "derrapar", "item", "voltar", "placar", "mudo"] as const;

export type ShooterAction = (typeof SHOOTER_ACTIONS)[number];
export type RaceAction = (typeof RACE_ACTIONS)[number];
export type Quality = "alta" | "leve";

export interface Settings {
  mouseSens: number;
  invertY: boolean;
  volume: { master: number; music: number; effects: number };
  keys: { shooter: Record<ShooterAction, string>; race: Record<RaceAction, string> };
  quality: Quality;
}

export const SENS_MIN = 0.25;
export const SENS_MAX = 3;

/** Única fonte de teclas do jogo (códigos de `KeyboardEvent.code`). */
export const DEFAULT_SETTINGS: Settings = {
  mouseSens: 1,
  invertY: false,
  volume: { master: 1, music: 1, effects: 1 },
  keys: {
    shooter: {
      frente: "KeyW",
      tras: "KeyS",
      esquerda: "KeyA",
      direita: "KeyD",
      atirar: "KeyF",
      habilidade1: "KeyQ",
      habilidade2: "KeyE",
      habilidade3: "KeyR",
      esquiva: "Space",
      evolucao1: "Digit1",
      evolucao2: "Digit2",
      evolucao3: "Digit3",
      placar: "Tab",
    },
    race: {
      acelerar: "KeyW",
      frear: "KeyS",
      esquerda: "KeyA",
      direita: "KeyD",
      derrapar: "Space",
      item: "KeyE",
      voltar: "KeyR",
      placar: "Tab",
      mudo: "KeyM",
    },
  },
  quality: "alta",
};

export const SHOOTER_LABELS: Record<ShooterAction, string> = {
  frente: "Andar para frente",
  tras: "Andar para trás",
  esquerda: "Andar para a esquerda",
  direita: "Andar para a direita",
  atirar: "Atirar (o clique também atira)",
  habilidade1: "Habilidade 1",
  habilidade2: "Habilidade 2",
  habilidade3: "Habilidade 3",
  esquiva: "Esquiva",
  evolucao1: "Evolução 1",
  evolucao2: "Evolução 2",
  evolucao3: "Evolução 3",
  placar: "Placar completo",
};

export const RACE_LABELS: Record<RaceAction, string> = {
  acelerar: "Acelerar",
  frear: "Frear e dar ré",
  esquerda: "Virar à esquerda",
  direita: "Virar à direita",
  derrapar: "Derrapar (solte para o turbo)",
  item: "Usar item (o clique também usa)",
  voltar: "Voltar para a pista",
  placar: "Placar da corrida",
  mudo: "Silenciar tudo",
};

const STORAGE_KEY = "ec.settings";
/** Esc é reservado: fecha as configurações e cancela a captura de tecla. */
const RESERVED = new Set(["Escape"]);
const VALID_CODE = /^[A-Za-z][A-Za-z0-9]{0,23}$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function num(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
}

function validCode(v: unknown): v is string {
  return typeof v === "string" && VALID_CODE.test(v) && !RESERVED.has(v);
}

/** Dois campos com a mesma tecla: as ações em conflito voltam ao padrão, repetindo até não sobrar conflito. */
function dropConflicts<A extends string>(keys: Record<A, string>, defaults: Record<A, string>): void {
  for (;;) {
    const byCode = new Map<string, A[]>();
    for (const a of Object.keys(keys) as A[]) byCode.set(keys[a], [...(byCode.get(keys[a]) ?? []), a]);
    let changed = false;
    for (const group of byCode.values()) {
      if (group.length < 2) continue;
      for (const a of group) {
        if (keys[a] !== defaults[a]) {
          keys[a] = defaults[a];
          changed = true;
        }
      }
    }
    // o padrão não repete tecla, então todo conflito tem alguém fora do padrão e a conta sempre termina
    if (!changed) return;
  }
}

function sanitizeKeys<A extends string>(raw: unknown, defaults: Record<A, string>): Record<A, string> {
  const src = isObj(raw) ? raw : {};
  const out = { ...defaults };
  for (const a of Object.keys(defaults) as A[]) if (validCode(src[a])) out[a] = src[a];
  dropConflicts(out, defaults);
  return out;
}

/** Aceita qualquer coisa (JSON antigo, adulterado, parcial) e devolve configurações válidas e novas. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  const src = isObj(raw) ? raw : {};
  const vol = isObj(src.volume) ? src.volume : {};
  const keys = isObj(src.keys) ? src.keys : {};
  return {
    mouseSens: num(src.mouseSens, SENS_MIN, SENS_MAX, d.mouseSens),
    invertY: typeof src.invertY === "boolean" ? src.invertY : d.invertY,
    volume: {
      master: num(vol.master, 0, 1, d.volume.master),
      music: num(vol.music, 0, 1, d.volume.music),
      effects: num(vol.effects, 0, 1, d.volume.effects),
    },
    keys: {
      shooter: sanitizeKeys(keys.shooter, d.keys.shooter),
      race: sanitizeKeys(keys.race, d.keys.race),
    },
    quality: src.quality === "leve" || src.quality === "alta" ? src.quality : d.quality,
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeSettings(null);
  }
}

let current: Settings = loadSettings();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

/** Aplica na hora (quem assina é avisado) e grava no navegador. */
export function saveSettings(s: Settings): void {
  current = sanitizeSettings(s);
  for (const l of listeners) l();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* sem storage */
  }
}

export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings);
}

/** Outra ação do mesmo modo que já usa essa tecla (null se livre). */
export function findConflict<A extends string>(keys: Record<A, string>, action: A, code: string): A | null {
  for (const a of Object.keys(keys) as A[]) if (a !== action && keys[a] === code) return a;
  return null;
}

const LABELS: Record<string, string> = {
  Space: "Espaço",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl",
  AltLeft: "Alt",
  AltRight: "Alt",
  Tab: "Tab",
  Enter: "Enter",
  Backspace: "Backspace",
  CapsLock: "Caps Lock",
};

/** Texto curto da tecla para a interface: "KeyW" vira "W", "Space" vira "Espaço". */
export function keyLabel(code: string): string {
  if (LABELS[code]) return LABELS[code];
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  const pad = /^Numpad([0-9])$/.exec(code);
  if (pad) return `Num ${pad[1]}`;
  return code;
}
