import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSettings } from "./settings";
import {
  playFinalLapChime,
  getLobbyMusicEnabled,
  getLobbyMusicVolume,
  nextRaceTrack,
  peekRaceTrack,
  preloadSounds,
  RACE_MUSIC_DUCK,
  RACE_MUSIC_FADE_IN,
  RACE_MUSIC_FADE_OUT,
  RACE_TRACKS,
  RaceMusic,
  raceTrackGain, setLobbyMusicEnabled, setLobbyMusicVolume, startLobbyMusic, stopLobbyMusic, subscribeLobbyMusic } from "./sound";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => void data.clear(),
  };
}

describe("sound system", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeStorage());
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("música do lobby começa ativada por padrão", () => {
    expect(getLobbyMusicEnabled()).toBe(true);
  });

  it("permite desativar e reativar a música do lobby salvando em storage e avisando ouvintes", () => {
    const listener = vi.fn();
    const unsub = subscribeLobbyMusic(listener);

    setLobbyMusicEnabled(false);
    expect(getLobbyMusicEnabled()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    setLobbyMusicEnabled(true);
    expect(getLobbyMusicEnabled()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);

    unsub();
    setLobbyMusicEnabled(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("startLobbyMusic e stopLobbyMusic tratam ambiente sem AudioContext sem quebrar", () => {
    expect(() => startLobbyMusic()).not.toThrow();
    expect(() => stopLobbyMusic()).not.toThrow();
  });

  it("preloadSounds não lança exceção em ambiente de teste", () => {
    expect(() => preloadSounds()).not.toThrow();
  });

  it("volume da música da sala é próprio: padrão 0,8, limitado a 0..1 e não mexe no volume de música das configurações", () => {
    const before = getSettings().volume.music;
    expect(getLobbyMusicVolume()).toBe(0.8);
    setLobbyMusicVolume(0.3);
    expect(getLobbyMusicVolume()).toBe(0.3);
    setLobbyMusicVolume(5);
    expect(getLobbyMusicVolume()).toBe(1);
    setLobbyMusicVolume(-1);
    expect(getLobbyMusicVolume()).toBe(0);
    setLobbyMusicEnabled(false);
    setLobbyMusicEnabled(true);
    expect(getSettings().volume.music).toBe(before);
  });

  it("valor guardado inválido volta ao padrão", () => {
    localStorage.setItem("ec_lobby_music_volume", "abc");
    expect(getLobbyMusicVolume()).toBe(0.8);
  });
});

function fakeCtx() {
  const ctx = { currentTime: 10 };
  const param = () => {
    const p = {
      value: 0,
      ramps: [] as { v: number; at: number }[],
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn((v: number, at: number) => void p.ramps.push({ v, at })),
    };
    return p;
  };
  const gain = { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
  const rateParam = { value: 1.0, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn((v: number) => { rateParam.value = v; }) };
  const src = { buffer: null as unknown, loop: false, playbackRate: rateParam, onended: null as null | (() => void), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  Object.assign(ctx, { createGain: () => gain, createBufferSource: () => src });
  return { ctx: ctx as unknown as BaseAudioContext, gain, src };
}

describe("música da corrida", () => {
  const buffer = {} as AudioBuffer;
  const out = {} as AudioNode;

  it("reveza as duas faixas a cada corrida e peek não avança a vez", () => {
    const first = peekRaceTrack();
    expect(nextRaceTrack()).toBe(first);
    const second = nextRaceTrack();
    expect(second).not.toBe(first);
    expect(RACE_TRACKS).toContain(second);
    expect(nextRaceTrack()).toBe(first);
  });

  it("entra em loop com fade até o ganho da faixa, que fica bem abaixo de 1", () => {
    const { ctx, gain, src } = fakeCtx();
    const m = new RaceMusic(ctx, out);
    m.play(RACE_TRACKS[1], buffer);
    expect(src.loop).toBe(true);
    expect(src.start).toHaveBeenCalled();
    expect(gain.gain.ramps.at(-1)).toEqual({ v: raceTrackGain(RACE_TRACKS[1]), at: 10 + RACE_MUSIC_FADE_IN });
    expect(raceTrackGain(RACE_TRACKS[0])).toBeLessThan(0.3);
  });

  it("baixa com o menu de pausa e volta ao fechar", () => {
    const { ctx, gain } = fakeCtx();
    const m = new RaceMusic(ctx, out);
    m.play(RACE_TRACKS[0], buffer);
    const full = raceTrackGain(RACE_TRACKS[0]);
    m.setDucked(true);
    expect(gain.gain.ramps.at(-1)?.v).toBeCloseTo(full * RACE_MUSIC_DUCK);
    m.setDucked(true);
    expect(gain.gain.ramps).toHaveLength(2);
    m.setDucked(false);
    expect(gain.gain.ramps.at(-1)?.v).toBe(full);
  });

  it("ao sair faz fade até zero, para o som e só então avisa; não toca de novo depois", () => {
    const { ctx, gain, src } = fakeCtx();
    const m = new RaceMusic(ctx, out);
    m.play(RACE_TRACKS[0], buffer);
    const done = vi.fn();
    m.stop(done);
    expect(gain.gain.ramps.at(-1)).toEqual({ v: 0, at: 10 + RACE_MUSIC_FADE_OUT });
    expect(src.stop).toHaveBeenCalledWith(10 + RACE_MUSIC_FADE_OUT);
    expect(done).not.toHaveBeenCalled();
    src.onended?.();
    expect(done).toHaveBeenCalledOnce();
    expect(gain.disconnect).toHaveBeenCalled();
    expect(m.playing).toBe(false);
    src.start.mockClear();
    m.play(RACE_TRACKS[0], buffer);
    expect(src.start).not.toHaveBeenCalled();
  });

  it("parar antes da faixa chegar avisa na hora e descarta o play atrasado", () => {
    const { ctx, src } = fakeCtx();
    const m = new RaceMusic(ctx, out);
    const done = vi.fn();
    m.stop(done);
    expect(done).toHaveBeenCalledOnce();
    m.play(RACE_TRACKS[0], buffer);
    expect(src.start).not.toHaveBeenCalled();
  });
  it("acelera a música para 1.15x na última volta e reseta ao parar", () => {
    const { ctx, src } = fakeCtx();
    const m = new RaceMusic(ctx, out);
    m.play(RACE_TRACKS[0], buffer);
    expect(m.finalLap).toBe(false);

    m.setFinalLap(true);
    expect(m.finalLap).toBe(true);
    expect(src.playbackRate.setTargetAtTime).toHaveBeenCalledWith(1.15, 10, 0.12);
    expect(src.playbackRate.value).toBe(1.15);

    m.setFinalLap(false);
    expect(m.finalLap).toBe(false);
    expect(src.playbackRate.setTargetAtTime).toHaveBeenCalledWith(1.0, 10, 0.12);

    m.setFinalLap(true);
    m.stop();
    expect(m.finalLap).toBe(false);
  });

  it("playFinalLapChime roda sem lançar exceções", () => {
    expect(() => playFinalLapChime()).not.toThrow();
  });
});
