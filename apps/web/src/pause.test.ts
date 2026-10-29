import { describe, expect, it } from "vitest";
import { escAction, inputBlocked } from "./pause";

const none = { settingsOpen: false, chatOpen: false, pauseOpen: false };

describe("inputBlocked", () => {
  it("libera o comando sem nada aberto", () => {
    expect(inputBlocked(none)).toBe(false);
  });
  it("trava com o menu de pausa, as configurações ou o chat abertos", () => {
    expect(inputBlocked({ ...none, pauseOpen: true })).toBe(true);
    expect(inputBlocked({ ...none, settingsOpen: true })).toBe(true);
    expect(inputBlocked({ ...none, chatOpen: true })).toBe(true);
  });
});

describe("escAction", () => {
  const base = { settingsOpen: false, pauseOpen: false, inMatch: true, pointerLocked: false };
  it("abre o menu na partida", () => {
    expect(escAction(base)).toBe("openPause");
  });
  it("não abre fora da partida nem com o mouse preso", () => {
    expect(escAction({ ...base, inMatch: false })).toBe(null);
    expect(escAction({ ...base, pointerLocked: true })).toBe(null);
  });
  it("fecha o menu aberto", () => {
    expect(escAction({ ...base, pauseOpen: true })).toBe("closePause");
  });
  it("fecha as configurações antes do menu", () => {
    expect(escAction({ ...base, pauseOpen: true, settingsOpen: true })).toBe("closeSettings");
    expect(escAction({ ...base, inMatch: false, settingsOpen: true })).toBe("closeSettings");
  });
});
