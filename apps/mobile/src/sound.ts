import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { getSettings, subscribeSettings } from "./settings";
import { readJson, writeJson } from "./storage";
import { MUSICA_LOBBY, SOM_TIRO, SOM_ZUMBI } from "./three/assets";

/**
 * Trecho em loop da música da sala, em segundos. O MP3 começa com o atraso do codificador (1105 amostras a 48 kHz)
 * e termina com enchimento; voltamos ao início um instante antes do fim para o loop ficar contínuo.
 */
const LOBBY_LOOP_START = 1105 / 48000;
const LOBBY_LOOP_END = LOBBY_LOOP_START + 821448 / 48000 - 0.08;

const STORAGE_KEY_LOBBY_MUSIC_ENABLED = "ec.lobbyMusicEnabled";
const STORAGE_KEY_LOBBY_MUSIC_VOLUME = "ec.lobbyMusicVolume";
const DEFAULT_LOBBY_MUSIC_VOLUME = 0.8;

let lobbyEnabled: boolean = readJson<boolean>(STORAGE_KEY_LOBBY_MUSIC_ENABLED) ?? true;
let lobbyVolume: number = (() => {
  const v = readJson<number>(STORAGE_KEY_LOBBY_MUSIC_VOLUME);
  return typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_LOBBY_MUSIC_VOLUME;
})();
let globalMuted = false;

const lobbyListeners = new Set<() => void>();

export function setGlobalAudioMuted(muted: boolean): void {
  globalMuted = muted;
  syncLobbyVolume();
}

export function effectiveMusicGain(): number {
  if (globalMuted) return 0;
  const s = getSettings();
  return s.volume.master * s.volume.music;
}

export function effectiveEffectsGain(): number {
  if (globalMuted) return 0;
  const s = getSettings();
  return s.volume.master * s.volume.effects;
}

export function getLobbyMusicEnabled(): boolean {
  return lobbyEnabled;
}

export function setLobbyMusicEnabled(enabled: boolean): void {
  lobbyEnabled = enabled;
  writeJson(STORAGE_KEY_LOBBY_MUSIC_ENABLED, enabled);
  syncLobbyVolume();
  for (const fn of lobbyListeners) fn();
}

export function getLobbyMusicVolume(): number {
  return lobbyVolume;
}

export function setLobbyMusicVolume(v: number): void {
  lobbyVolume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_LOBBY_MUSIC_VOLUME;
  writeJson(STORAGE_KEY_LOBBY_MUSIC_VOLUME, lobbyVolume);
  syncLobbyVolume();
  for (const fn of lobbyListeners) fn();
}

export function subscribeLobbyMusic(fn: () => void): () => void {
  lobbyListeners.add(fn);
  return () => lobbyListeners.delete(fn);
}

export function useLobbyMusic(): { enabled: boolean; volume: number } {
  const enabled = useSyncExternalStore(subscribeLobbyMusic, getLobbyMusicEnabled);
  const volume = useSyncExternalStore(subscribeLobbyMusic, getLobbyMusicVolume);
  return { enabled, volume };
}

let lobbyPlayer: AudioPlayer | null = null;
let lobbyPlaying = false;
let lobbyTimer: ReturnType<typeof setInterval> | null = null;

function syncLobbyVolume(): void {
  if (!lobbyPlayer) return;
  lobbyPlayer.volume = lobbyEnabled ? effectiveMusicGain() * lobbyVolume * 0.45 : 0;
}

subscribeSettings(syncLobbyVolume);

AppState.addEventListener("change", (state) => {
  if (!lobbyPlayer || !lobbyPlaying) return;
  if (state === "active") lobbyPlayer.play();
  else lobbyPlayer.pause();
});

export function startLobbyMusic(): void {
  if (lobbyPlaying) return;
  lobbyPlaying = true;
  try {
    lobbyPlayer ??= createAudioPlayer(MUSICA_LOBBY);
    lobbyPlayer.loop = true;
    syncLobbyVolume();
    void lobbyPlayer.seekTo(LOBBY_LOOP_START);
    if (AppState.currentState === "active") lobbyPlayer.play();
    lobbyTimer ??= setInterval(() => {
      if (!lobbyPlayer || !lobbyPlaying) return;
      if (lobbyPlayer.currentTime >= LOBBY_LOOP_END || lobbyPlayer.currentTime < LOBBY_LOOP_START - 0.05) {
        void lobbyPlayer.seekTo(LOBBY_LOOP_START);
      }
    }, 60);
  } catch (err) {
    console.warn("música da sala não carregou", err);
  }
}

export function stopLobbyMusic(): void {
  lobbyPlaying = false;
  if (lobbyTimer) {
    clearInterval(lobbyTimer);
    lobbyTimer = null;
  }
  try {
    lobbyPlayer?.pause();
  } catch {
    /* noop */
  }
}

export interface SoundPosition {
  x?: number;
  z?: number;
  listenerX?: number;
  listenerZ?: number;
}

export function calculateAttenuation(pos?: SoundPosition, maxDistance = 35): number {
  if (!pos || pos.x === undefined || pos.z === undefined || pos.listenerX === undefined || pos.listenerZ === undefined) {
    return 1;
  }
  const dist = Math.hypot(pos.x - pos.listenerX, pos.z - pos.listenerZ);
  if (dist <= 2) return 1;
  if (dist >= maxDistance) return 0;
  return Math.max(0, 1 - dist / maxDistance);
}

/** Pool pequeno de AudioPlayers para tiros/grunhidos consecutivos não cortarem uns aos outros nem alocarem a cada quadro. */
class SfxPool {
  private players: AudioPlayer[] = [];
  private cursor = 0;
  private broken = false;

  constructor(
    private readonly mod: number,
    private readonly size: number,
  ) {}

  play(volume: number, rate = 1): void {
    if (this.broken || volume <= 0.01) return;
    try {
      if (this.players.length < this.size) {
        const p = createAudioPlayer(this.mod);
        p.loop = false;
        this.players.push(p);
      }
      const p = this.players[this.cursor++ % this.players.length];
      p.volume = Math.min(1, Math.max(0, volume));
      try {
        p.shouldCorrectPitch = false;
        p.setPlaybackRate(rate);
      } catch {
        /* plataforma sem ajuste fino de taxa */
      }
      void p.seekTo(0);
      p.play();
    } catch (err) {
      this.broken = true;
      console.warn("efeito sonoro indisponível", err);
    }
  }
}

const shootPool = new SfxPool(SOM_TIRO, 5);
const zombiePool = new SfxPool(SOM_ZUMBI, 3);

export function playShootSound(opts?: SoundPosition & { isLocal?: boolean }): void {
  const gain = effectiveEffectsGain();
  if (gain <= 0) return;
  const att = opts?.isLocal ? 1 : calculateAttenuation(opts, 40);
  if (att <= 0.02) return;
  const rate = 0.94 + Math.random() * 0.12;
  shootPool.play(gain * att * 0.75, rate);
}

export function playZombieSound(opts?: SoundPosition & { volume?: number }): void {
  const gain = effectiveEffectsGain();
  if (gain <= 0) return;
  const att = calculateAttenuation(opts, 45);
  if (att <= 0.02) return;
  const rate = 0.9 + Math.random() * 0.2;
  zombiePool.play(gain * att * (opts?.volume ?? 1) * 0.85, rate);
}
