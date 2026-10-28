import { useSyncExternalStore } from "react";
import { readJson, writeJson } from "./storage";

export type Quality = "alta" | "leve";

export interface Settings {
  /** Multiplicador da sensibilidade de mira por arrasto no tiroteio (0.25 a 3). */
  aimSens: number;
  invertY: boolean;
  volume: { master: number; music: number; effects: number };
  quality: Quality;
  /** Segurar o botão de tiro atira continuamente; desligado, cada toque dispara uma vez. */
  touchAutoFire: boolean;
}

export const SENS_MIN = 0.25;
export const SENS_MAX = 3;

export const DEFAULT_SETTINGS: Settings = {
  aimSens: 1,
  invertY: false,
  volume: { master: 1, music: 1, effects: 1 },
  // celular começa no Leve por padrão, igual ao defaultQuality(true) da versão web
  quality: "leve",
  touchAutoFire: true,
};

const STORAGE_KEY = "ec.settings";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function num(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
}

export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  const src = isObj(raw) ? raw : {};
  const vol = isObj(src.volume) ? src.volume : {};
  // aceita tanto aimSens quanto mouseSens caso venha de JSON compartilhado
  const rawSens = src.aimSens ?? src.mouseSens;
  return {
    aimSens: num(rawSens, SENS_MIN, SENS_MAX, d.aimSens),
    invertY: typeof src.invertY === "boolean" ? src.invertY : d.invertY,
    volume: {
      master: num(vol.master, 0, 1, d.volume.master),
      music: num(vol.music, 0, 1, d.volume.music),
      effects: num(vol.effects, 0, 1, d.volume.effects),
    },
    quality: src.quality === "leve" || src.quality === "alta" ? src.quality : d.quality,
    touchAutoFire: typeof src.touchAutoFire === "boolean" ? src.touchAutoFire : d.touchAutoFire,
  };
}

let current: Settings = sanitizeSettings(readJson<unknown>(STORAGE_KEY));
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function saveSettings(s: Settings): void {
  current = sanitizeSettings(s);
  writeJson(STORAGE_KEY, current);
  for (const l of listeners) l();
}

export function patchSettings(patch: Partial<Settings>): void {
  saveSettings({ ...current, ...patch, volume: { ...current.volume, ...patch.volume } });
}

export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings);
}
