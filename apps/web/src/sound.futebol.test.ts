import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let nodes = 0;
class Param {
  value = 0;
  setValueAtTime() {
    return this;
  }
  exponentialRampToValueAtTime() {
    return this;
  }
  setTargetAtTime() {
    return this;
  }
  linearRampToValueAtTime() {
    return this;
  }
}
class Node {
  frequency = new Param();
  gain = new Param();
  Q = new Param();
  type = "";
  buffer: unknown = null;
  loop = false;
  connect() {
    return this;
  }
  start() {}
  stop() {}
}
class FakeCtx {
  state = "running";
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  createGain() {
    return new Node();
  }
  createOscillator() {
    nodes++;
    return new Node();
  }
  createBiquadFilter() {
    nodes++;
    return new Node();
  }
  createBufferSource() {
    nodes++;
    return new Node();
  }
  createBuffer(_c: number, n: number) {
    return { getChannelData: () => new Float32Array(n) };
  }
  resume() {}
}

async function load() {
  vi.resetModules();
  const settings = await import("./settings");
  const sound = await import("./sound");
  return { ...sound, ...settings };
}

describe("sons do futebol", () => {
  beforeEach(() => {
    nodes = 0;
    vi.stubGlobal("window", { AudioContext: FakeCtx, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("chute, rede e torcida criam som com o volume ligado", async () => {
    const s = await load();
    s.playKick(20);
    s.playNet();
    s.playCrowd("gol");
    s.playCrowd("quase");
    s.playCrowd("defesa");
    expect(nodes).toBeGreaterThan(5);
  });

  it("respeita o volume das configurações: mudo não cria nada", async () => {
    const s = await load();
    s.saveSettings({ ...s.getSettings(), volume: { master: 1, music: 1, effects: 0 } });
    s.playKick(20);
    s.playNet();
    s.playCrowd("gol");
    expect(nodes).toBe(0);
    s.saveSettings({ ...s.getSettings(), volume: { master: 0, music: 1, effects: 1 } });
    s.playCrowd("quase");
    expect(nodes).toBe(0);
  });

  it("sem Web Audio não quebra", async () => {
    vi.stubGlobal("window", { addEventListener: vi.fn() });
    const s = await load();
    expect(() => {
      s.playKick(1);
      s.playNet();
      s.playCrowd("gol");
    }).not.toThrow();
  });
});
