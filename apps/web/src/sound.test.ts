import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLobbyMusicEnabled, preloadSounds, setLobbyMusicEnabled, startLobbyMusic, stopLobbyMusic, subscribeLobbyMusic } from "./sound";

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
});
