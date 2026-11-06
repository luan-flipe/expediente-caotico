import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let nodes = 0;
let live = 0;
let running = 0;
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
  connected = true;
  started = false;
  constructor() {
    live++;
  }
  connect() {
    return this;
  }
  disconnect() {
    if (this.connected) live--;
    this.connected = false;
  }
  start() {
    this.started = true;
    running++;
  }
  stop() {
    if (this.started) running--;
    this.started = false;
  }
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
    live = 0;
    running = 0;
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

  describe("torcida de fundo", () => {
    it("liga uma vez, segue o nível e ao parar solta todos os nós", async () => {
      const s = await load();
      // o contexto cria 3 ganhos fixos (mestre, música, efeitos) na primeira vez: ficam de base
      s.startCrowdAmbience();
      s.stopCrowdAmbience();
      const base = live;
      nodes = 0;
      s.startCrowdAmbience();
      const criados = nodes;
      expect(criados).toBeGreaterThan(3);
      expect(running).toBe(2);
      s.startCrowdAmbience();
      expect(nodes).toBe(criados);
      s.setCrowdAmbience(0.9);
      s.setCrowdAmbience(null);
      s.stopCrowdAmbience();
      expect(running).toBe(0);
      expect(live).toBe(base);
      expect(() => s.stopCrowdAmbience()).not.toThrow();
    });

    it("sai e entra várias vezes sem acumular nós", async () => {
      const s = await load();
      s.startCrowdAmbience();
      s.stopCrowdAmbience();
      const base = live;
      for (let i = 0; i < 5; i++) {
        s.startCrowdAmbience();
        s.stopCrowdAmbience();
      }
      expect(running).toBe(0);
      expect(live).toBe(base);
    });

    it("liga também com o volume em zero (o ganho dos efeitos cala; ao subir o volume ela toca)", async () => {
      const s = await load();
      s.saveSettings({ ...s.getSettings(), volume: { master: 1, music: 1, effects: 0 } });
      s.startCrowdAmbience();
      expect(running).toBe(2);
      s.stopCrowdAmbience();
    });

    it("sem Web Audio não quebra", async () => {
      vi.stubGlobal("window", { addEventListener: vi.fn() });
      const s = await load();
      expect(() => {
        s.startCrowdAmbience();
        s.setCrowdAmbience(0.5);
        s.stopCrowdAmbience();
      }).not.toThrow();
    });
  });
});
