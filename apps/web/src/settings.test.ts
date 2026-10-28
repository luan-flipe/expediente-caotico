import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, findConflict, keyLabel, loadSettings, sanitizeSettings, saveSettings, getSettings, type Settings } from "./settings";

const clone = (): Settings => JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("sanitizeSettings", () => {
  it("devolve o padrão para lixo, null e campos faltando", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings("oi")).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings([])).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ keys: { shooter: null, race: 7 }, volume: "alto" })).toEqual(DEFAULT_SETTINGS);
  });

  it("mescla com o padrão: só o que veio válido muda", () => {
    const s = sanitizeSettings({ invertY: true, volume: { music: 0.2 }, keys: { race: { acelerar: "KeyI" } } });
    expect(s.invertY).toBe(true);
    expect(s.volume).toEqual({ ...DEFAULT_SETTINGS.volume, music: 0.2 });
    expect(s.keys.race.acelerar).toBe("KeyI");
    expect(s.keys.race.frear).toBe(DEFAULT_SETTINGS.keys.race.frear);
    expect(s.keys.shooter).toEqual(DEFAULT_SETTINGS.keys.shooter);
  });

  it("corrige valores fora da faixa", () => {
    const s = sanitizeSettings({ mouseSens: 999, volume: { master: 999, music: -4, effects: 0.5 } });
    expect(s.mouseSens).toBe(3);
    expect(s.volume).toEqual({ master: 1, music: 0, effects: 0.5 });
    expect(sanitizeSettings({ mouseSens: 0.01 }).mouseSens).toBe(0.25);
    expect(sanitizeSettings({ mouseSens: "2" }).mouseSens).toBe(DEFAULT_SETTINGS.mouseSens);
    expect(sanitizeSettings({ mouseSens: NaN }).mouseSens).toBe(DEFAULT_SETTINGS.mouseSens);
    expect(sanitizeSettings({ volume: { master: Infinity } }).volume.master).toBe(DEFAULT_SETTINGS.volume.master);
  });

  it("qualidade e inverter Y inválidos voltam ao padrão", () => {
    expect(sanitizeSettings({ quality: "ultra" }).quality).toBe("alta");
    expect(sanitizeSettings({ quality: "leve" }).quality).toBe("leve");
    expect(sanitizeSettings({ invertY: "sim" }).invertY).toBe(false);
  });

  it("tecla que não é string, vazia, estranha ou Esc vira o padrão", () => {
    const s = sanitizeSettings({
      keys: { shooter: { frente: 42, tras: "", esquerda: "Esc ape", direita: "Escape", atirar: { a: 1 }, esquiva: "KeyZ" } },
    });
    const d = DEFAULT_SETTINGS.keys.shooter;
    expect(s.keys.shooter.frente).toBe(d.frente);
    expect(s.keys.shooter.tras).toBe(d.tras);
    expect(s.keys.shooter.esquerda).toBe(d.esquerda);
    expect(s.keys.shooter.direita).toBe(d.direita);
    expect(s.keys.shooter.atirar).toBe(d.atirar);
    expect(s.keys.shooter.esquiva).toBe("KeyZ");
  });

  it("tecla repetida no mesmo modo volta ao padrão nas ações em conflito", () => {
    const s = sanitizeSettings({ keys: { shooter: { frente: "KeyX", tras: "KeyX", esquiva: "KeyZ" } } });
    expect(s.keys.shooter.frente).toBe(DEFAULT_SETTINGS.keys.shooter.frente);
    expect(s.keys.shooter.tras).toBe(DEFAULT_SETTINGS.keys.shooter.tras);
    expect(s.keys.shooter.esquiva).toBe("KeyZ");
  });

  it("a mesma tecla em modos diferentes não é conflito", () => {
    const s = sanitizeSettings({ keys: { shooter: { habilidade1: "KeyJ" }, race: { item: "KeyJ" } } });
    expect(s.keys.shooter.habilidade1).toBe("KeyJ");
    expect(s.keys.race.item).toBe("KeyJ");
  });

  it("repetida com uma ação que ficou no padrão derruba as duas", () => {
    // direita customizada para a tecla padrão de esquerda: as duas voltam
    const s = sanitizeSettings({ keys: { race: { direita: "KeyA" } } });
    expect(s.keys.race.direita).toBe(DEFAULT_SETTINGS.keys.race.direita);
    expect(s.keys.race.esquerda).toBe(DEFAULT_SETTINGS.keys.race.esquerda);
  });

  it("o padrão não tem tecla repetida dentro de um modo", () => {
    for (const mode of ["shooter", "race"] as const) {
      const codes = Object.values(DEFAULT_SETTINGS.keys[mode]);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it("resolve conflitos em cadeia até não sobrar nenhum", () => {
    const s = sanitizeSettings({ keys: { shooter: { frente: "KeyX", tras: "KeyX", esquerda: "KeyW" } } });
    const codes = Object.values(s.keys.shooter);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("não devolve o mesmo objeto do padrão (sem mutação cruzada)", () => {
    const s = sanitizeSettings({});
    s.keys.race.acelerar = "KeyI";
    s.volume.master = 0;
    expect(DEFAULT_SETTINGS.keys.race.acelerar).toBe("KeyW");
    expect(DEFAULT_SETTINGS.volume.master).toBe(1);
  });
});

describe("loadSettings / saveSettings", () => {
  it("JSON quebrado ou storage vazio dá o padrão", () => {
    vi.stubGlobal("localStorage", fakeStorage({ "ec.settings": "{nao e json" }));
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    vi.stubGlobal("localStorage", fakeStorage());
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("sem localStorage (ou ele lançando erro) dá o padrão", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("bloqueado");
      },
    });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("configuração salva adulterada abre com valores válidos", () => {
    const bad = { mouseSens: 1e9, invertY: 1, volume: { master: 999, music: "x" }, keys: { race: { acelerar: "TeclaInexistente!!" } }, quality: "x" };
    vi.stubGlobal("localStorage", fakeStorage({ "ec.settings": JSON.stringify(bad) }));
    const s = loadSettings();
    expect(s.mouseSens).toBe(3);
    expect(s.volume.master).toBe(1);
    expect(s.volume.music).toBe(DEFAULT_SETTINGS.volume.music);
    expect(s.keys.race.acelerar).toBe("KeyW");
    expect(s.quality).toBe("alta");
  });

  it("salvar grava no localStorage e publica o valor novo", () => {
    const st = fakeStorage();
    vi.stubGlobal("localStorage", st);
    const next = clone();
    next.keys.race.acelerar = "KeyI";
    saveSettings(next);
    expect(getSettings().keys.race.acelerar).toBe("KeyI");
    expect(JSON.parse(st.data.get("ec.settings")!).keys.race.acelerar).toBe("KeyI");
    expect(loadSettings().keys.race.acelerar).toBe("KeyI");
    saveSettings(clone());
  });

  it("falha ao gravar não derruba nada", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("cheio");
      },
    });
    expect(() => saveSettings(clone())).not.toThrow();
  });
});

describe("findConflict", () => {
  it("acha a outra ação do mesmo modo que usa a tecla", () => {
    expect(findConflict(DEFAULT_SETTINGS.keys.shooter, "frente", "KeyS")).toBe("tras");
    expect(findConflict(DEFAULT_SETTINGS.keys.shooter, "frente", "KeyW")).toBeNull();
    expect(findConflict(DEFAULT_SETTINGS.keys.shooter, "frente", "KeyP")).toBeNull();
  });
});

describe("keyLabel", () => {
  it("traduz os códigos mais comuns", () => {
    expect(keyLabel("KeyW")).toBe("W");
    expect(keyLabel("Digit1")).toBe("1");
    expect(keyLabel("Space")).toBe("Espaço");
    expect(keyLabel("ArrowUp")).toBe("↑");
    expect(keyLabel("ArrowDown")).toBe("↓");
    expect(keyLabel("ArrowLeft")).toBe("←");
    expect(keyLabel("ArrowRight")).toBe("→");
    expect(keyLabel("ShiftLeft")).toBe("Shift");
    expect(keyLabel("ShiftRight")).toBe("Shift");
    expect(keyLabel("ControlLeft")).toBe("Ctrl");
    expect(keyLabel("Tab")).toBe("Tab");
    expect(keyLabel("Numpad5")).toBe("Num 5");
  });

  it("código desconhecido aparece como veio", () => {
    expect(keyLabel("IntlBackslash")).toBe("IntlBackslash");
  });
});
