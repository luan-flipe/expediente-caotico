import { getSettings, subscribeSettings } from "./settings";

const LOBBY_MUSIC_URL = "/assets/audio/lobby-music.mp3";
const SHOOT_URL = "/assets/audio/tiro.mp3";
const ZOMBIE_GROWL_URL = "/assets/audio/zumbi-grunhido.mp3";

/**
 * Trecho em loop da música da sala, em segundos. O MP3 começa com o atraso do codificador (1105 amostras a 48 kHz)
 * e termina com enchimento; sem cortar os dois, o loop teria um respiro de silêncio. O original tem 821448 amostras.
 */
const LOBBY_LOOP_START = 1105 / 48000;
const LOBBY_LOOP_END = LOBBY_LOOP_START + 821448 / 48000;

/**
 * Mixagem (RMS medido decodificando cada arquivo com Web Audio, em dBFS):
 * lobby-music -21.6, turbo_pixel_drift -17.5, race-select-chiptune -18.8, helicoptero -18.0 (x0.6 = -22.4 perto),
 * rolamento das rodinhas -29.2 e derrapagem -38.0 no máximo antigo.
 * Efeitos da corrida subiram (rolamento -23.2, derrapagem -30.8) e as músicas da corrida ficam em -32,
 * uns 9 a 10 dB abaixo do rolamento e do helicóptero. O lobby, sem efeitos competindo, fica em -29.5
 * no volume padrão da sala (0.8): a troca lobby -> corrida baixa só 2.5 dB.
 */
const LOBBY_TRACK_GAIN = 0.5;

const STORAGE_KEY_LOBBY_MUSIC_ENABLED = "ec_lobby_music_enabled";
const STORAGE_KEY_LOBBY_MUSIC_VOLUME = "ec_lobby_music_volume";
const DEFAULT_LOBBY_MUSIC_VOLUME = 0.8;

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let effectsGain: GainNode | null = null;

const bufferCache = new Map<string, Promise<AudioBuffer | null>>();
let resumeArmed = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const CtxClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!CtxClass) return null;
    audioCtx = new CtxClass();

    masterGain = audioCtx.createGain();
    musicGain = audioCtx.createGain();
    effectsGain = audioCtx.createGain();

    musicGain.connect(masterGain);
    effectsGain.connect(masterGain);
    masterGain.connect(audioCtx.destination);

    applyVolumeSettings();
    subscribeSettings(applyVolumeSettings);
  }

  if (audioCtx.state === "suspended" && !resumeArmed) {
    // uma escuta só até o primeiro gesto, não uma nova a cada som tocado antes dele
    resumeArmed = true;
    const resume = () => {
      resumeArmed = false;
      if (audioCtx && audioCtx.state === "suspended") {
        void audioCtx.resume();
      }
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      window.removeEventListener("click", resume);
    };
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    window.addEventListener("click", resume, { once: true });
  }

  return audioCtx;
}

function applyVolumeSettings(): void {
  if (!masterGain || !musicGain || !effectsGain || !audioCtx) return;
  const s = getSettings();
  const t = audioCtx.currentTime;
  masterGain.gain.setTargetAtTime(s.volume.master, t, 0.05);
  effectsGain.gain.setTargetAtTime(s.volume.effects, t, 0.05);

  // o volume da sala é por cima do volume de música das configurações, sem alterá-lo
  const musicVol = getLobbyMusicEnabled() ? s.volume.music * getLobbyMusicVolume() * LOBBY_TRACK_GAIN : 0;
  musicGain.gain.setTargetAtTime(musicVol, t, 0.05);
}

export function loadAudioBuffer(url: string): Promise<AudioBuffer | null> {
  const ctx = getAudioContext();
  if (!ctx) return Promise.resolve(null);
  let promise = bufferCache.get(url);
  if (!promise) {
    promise = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} ao carregar ${url}`);
        return res.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .catch((err) => {
        console.warn(`Falha ao carregar áudio (${url}):`, err);
        bufferCache.delete(url);
        return null;
      });
    bufferCache.set(url, promise);
  }
  return promise;
}

export function preloadSounds(): void {
  void loadAudioBuffer(LOBBY_MUSIC_URL);
  void loadAudioBuffer(SHOOT_URL);
  void loadAudioBuffer(ZOMBIE_GROWL_URL);
}

// ==================== LOBBY MUSIC ====================

let lobbySource: AudioBufferSourceNode | null = null;
let lobbyPlaying = false;
const lobbyListeners = new Set<() => void>();

export function getLobbyMusicEnabled(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_KEY_LOBBY_MUSIC_ENABLED);
    return val !== "false";
  } catch {
    return true;
  }
}

export function setLobbyMusicEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_LOBBY_MUSIC_ENABLED, enabled ? "true" : "false");
  } catch {
    /* sem storage */
  }
  applyVolumeSettings();
  for (const fn of lobbyListeners) fn();
}

/** Volume só da música da sala (0 a 1), multiplicado pelo volume de música das configurações. */
export function getLobbyMusicVolume(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOBBY_MUSIC_VOLUME);
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_LOBBY_MUSIC_VOLUME;
  } catch {
    return DEFAULT_LOBBY_MUSIC_VOLUME;
  }
}

export function setLobbyMusicVolume(v: number): void {
  const clamped = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_LOBBY_MUSIC_VOLUME;
  try {
    localStorage.setItem(STORAGE_KEY_LOBBY_MUSIC_VOLUME, String(clamped));
  } catch {
    /* sem storage */
  }
  applyVolumeSettings();
  for (const fn of lobbyListeners) fn();
}

export function subscribeLobbyMusic(fn: () => void): () => void {
  lobbyListeners.add(fn);
  return () => lobbyListeners.delete(fn);
}

export function startLobbyMusic(): void {
  if (lobbyPlaying) return;
  lobbyPlaying = true;
  const ctx = getAudioContext();
  if (!ctx) return;

  void loadAudioBuffer(LOBBY_MUSIC_URL).then((buffer) => {
    if (!buffer || !lobbyPlaying) return;

    if (lobbySource) {
      try {
        lobbySource.stop();
        lobbySource.disconnect();
      } catch {
        /* noop */
      }
      lobbySource = null;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = LOBBY_LOOP_START;
    src.loopEnd = Math.min(LOBBY_LOOP_END, buffer.duration);
    src.connect(musicGain!);

    // Começa reprodução
    src.start(0, LOBBY_LOOP_START);
    lobbySource = src;
  });
}

export function stopLobbyMusic(): void {
  lobbyPlaying = false;
  if (lobbySource) {
    try {
      lobbySource.stop();
      lobbySource.disconnect();
    } catch {
      /* noop */
    }
    lobbySource = null;
  }
}

// ==================== MÚSICA DA CORRIDA ====================

/** As duas faixas se revezam a cada corrida (Rally, Contra o relógio e treino), para a trilha não cansar. */
export const RACE_TRACKS = ["/assets/audio/turbo_pixel_drift.mp3", "/assets/audio/race-select-chiptune.mp3"] as const;
/** Ganho de cada faixa para chegar em -32 dBFS de RMS (ver mixagem no topo do arquivo). */
const RACE_TRACK_GAIN: Record<string, number> = { [RACE_TRACKS[0]]: 0.19, [RACE_TRACKS[1]]: 0.22 };
export const RACE_MUSIC_FADE_IN = 1.5;
export const RACE_MUSIC_FADE_OUT = 0.6;
/** Menu de pausa aberto: a música cai uns 9 dB. */
export const RACE_MUSIC_DUCK = 0.35;
const DUCK_RAMP = 0.25;

let raceTrackTurn = 0;

/** A faixa da próxima corrida, sem avançar a vez (para baixar com antecedência). */
export function peekRaceTrack(): string {
  return RACE_TRACKS[raceTrackTurn % RACE_TRACKS.length];
}

/** A faixa desta corrida; a seguinte usa a outra. */
export function nextRaceTrack(): string {
  const url = peekRaceTrack();
  raceTrackTurn++;
  return url;
}

export function raceTrackGain(url: string): number {
  return RACE_TRACK_GAIN[url] ?? 0.2;
}

/**
 * Trilha de uma corrida: loop com fade ao entrar e ao sair, e ducking enquanto o menu de pausa está aberto.
 * Toca no contexto e no canal de música de quem chama (a corrida passa o seu, que segue os volumes e o mudo).
 */
export class RaceMusic {
  private gain: GainNode;
  private src: AudioBufferSourceNode | null = null;
  private base = 0;
  private ducked = false;
  private stopped = false;

  constructor(
    private ctx: BaseAudioContext,
    out: AudioNode,
  ) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(out);
  }

  get playing(): boolean {
    return this.src !== null;
  }

  private target(): number {
    return this.base * (this.ducked ? RACE_MUSIC_DUCK : 1);
  }

  private rampTo(value: number, seconds: number): void {
    const g = this.gain.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(value, t + seconds);
  }

  play(url: string, buffer: AudioBuffer): void {
    if (this.stopped || this.src) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.gain);
    src.start();
    this.src = src;
    this.base = raceTrackGain(url);
    this.rampTo(this.target(), RACE_MUSIC_FADE_IN);
  }

  setDucked(ducked: boolean): void {
    if (ducked === this.ducked) return;
    this.ducked = ducked;
    if (this.src && !this.stopped) this.rampTo(this.target(), DUCK_RAMP);
  }

  /** Fade de saída; `onDone` roda quando o som de fato parou (ou na hora, se nada tocava). */
  stop(onDone?: () => void): void {
    if (this.stopped) return;
    this.stopped = true;
    const src = this.src;
    this.src = null;
    if (!src) {
      this.gain.disconnect();
      onDone?.();
      return;
    }
    this.rampTo(0, RACE_MUSIC_FADE_OUT);
    src.onended = () => {
      src.disconnect();
      this.gain.disconnect();
      onDone?.();
    };
    src.stop(this.ctx.currentTime + RACE_MUSIC_FADE_OUT);
  }
}

// ==================== EFEITOS SONOROS (SFX) ====================

export interface SoundPosition {
  x?: number;
  z?: number;
  listenerX?: number;
  listenerZ?: number;
}

function calculateAttenuation(pos?: SoundPosition, maxDistance = 35): number {
  if (!pos || pos.x === undefined || pos.z === undefined || pos.listenerX === undefined || pos.listenerZ === undefined) {
    return 1;
  }
  const dist = Math.hypot(pos.x - pos.listenerX, pos.z - pos.listenerZ);
  if (dist <= 2) return 1;
  if (dist >= maxDistance) return 0;
  return Math.max(0, 1 - dist / maxDistance);
}

/** Toca o som de tiro (bolinha de papel / projétil). */
export function playShootSound(opts?: SoundPosition & { isLocal?: boolean }): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  const s = getSettings();
  if (s.volume.master <= 0 || s.volume.effects <= 0) return;

  const att = opts?.isLocal ? 1 : calculateAttenuation(opts, 40);
  if (att <= 0.02) return;

  void loadAudioBuffer(SHOOT_URL).then((buffer) => {
    if (!buffer) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    // Leve variação de tom (+/- 6%) para dar naturalidade a tiros consecutivos
    const detune = (Math.random() - 0.5) * 120;
    src.detune.value = detune;

    const gain = ctx.createGain();
    const vol = att * 0.75;
    gain.gain.value = vol;

    src.connect(gain);
    gain.connect(effectsGain!);

    src.start();
  });
}

/** Toca o som de zumbi (ataque ou grunhido ambiente). */
export function playZombieSound(opts?: SoundPosition & { volume?: number }): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  const s = getSettings();
  if (s.volume.master <= 0 || s.volume.effects <= 0) return;

  const att = calculateAttenuation(opts, 45);
  if (att <= 0.02) return;

  void loadAudioBuffer(ZOMBIE_GROWL_URL).then((buffer) => {
    if (!buffer) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    // Variação orgânica no tom dos zumbis
    const detune = (Math.random() - 0.5) * 160;
    src.detune.value = detune;

    const gain = ctx.createGain();
    const baseVol = opts?.volume ?? 1.0;
    const vol = att * baseVol * 0.85;
    gain.gain.value = vol;

    src.connect(gain);
    gain.connect(effectsGain!);

    src.start();
  });
}
