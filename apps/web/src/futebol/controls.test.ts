import { describe, expect, it } from "vitest";
import { FUT } from "@ec/shared";
import { TAP_PASS_MS, cancelCharges, chargePower, newButtons, newCharge, newControlState, pressButton, readFutInput, releaseButton, stepCharge, type FutKeys } from "./controls";

const idle = (): FutKeys => ({ frente: false, tras: false, esquerda: false, direita: false, correr: false, stick: { x: 0, y: 0 } });
const w = (): FutKeys => ({ ...idle(), frente: true });
const COM_BOLA = { yaw: 0, hasBall: true };

describe("controles do futebol", () => {
  it("toque duplo em W liga a corrida", () => {
    const st = newControlState();
    const m = newButtons();
    expect(readFutInput(w(), m, 1000, st).sprint).toBe(false);
    readFutInput(idle(), m, 1100, st);
    const again = readFutInput(w(), m, 1000 + FUT.doubleTapMs - 10, st);
    expect(again.sprint).toBe(true);
    // segue correndo enquanto W fica apertado e para ao soltar
    expect(readFutInput(w(), m, 2000, st).sprint).toBe(true);
    readFutInput(idle(), m, 2100, st);
    expect(readFutInput(w(), m, 5000, st).sprint).toBe(false);
  });

  it("W segurado sem toque duplo só anda", () => {
    const st = newControlState();
    const m = newButtons();
    for (let t = 0; t < 2000; t += 33) {
      const i = readFutInput(w(), m, t, st);
      expect(i.sprint).toBe(false);
      expect(Math.hypot(i.mx, i.mz)).toBeCloseTo(1);
    }
    // dois toques mais lentos que a janela também não corre
    readFutInput(idle(), m, 2100, st);
    readFutInput(w(), m, 2200, st);
    readFutInput(idle(), m, 2300, st);
    expect(readFutInput(w(), m, 2200 + FUT.doubleTapMs + 50, st).sprint).toBe(false);
  });

  it("Shift corre enquanto anda, em qualquer direção, e parado não corre", () => {
    const st = newControlState();
    const m = newButtons();
    expect(readFutInput({ ...w(), correr: true }, m, 0, st).sprint).toBe(true);
    expect(readFutInput({ ...idle(), direita: true, correr: true }, m, 33, st).sprint).toBe(true);
    expect(readFutInput({ ...idle(), correr: true }, m, 66, st).sprint).toBe(false);
    expect(readFutInput(w(), m, 5000, st).sprint).toBe(false);
  });

  it("andar é relativo à câmera e a mira segue a câmera", () => {
    const st = newControlState();
    const i = readFutInput(w(), newButtons(), 0, st, { yaw: Math.PI / 2 });
    expect(i.mx).toBeCloseTo(1);
    expect(i.mz).toBeCloseTo(0);
    expect(i.aim).toBeCloseTo(Math.PI / 2);
  });

  it("analógico na borda corre", () => {
    const st = newControlState();
    const k = { ...idle(), stick: { x: 0, y: 1 } };
    expect(readFutInput(k, newButtons(), 0, st).sprint).toBe(true);
    expect(readFutInput({ ...idle(), stick: { x: 0, y: 0.5 } }, newButtons(), 33, st).sprint).toBe(false);
  });
});

describe("Espaço: segurar chuta, toque rápido passa", () => {
  it("segurar é charge de chute e soltar depois do limiar é release de chute", () => {
    const st = newControlState();
    const m = newButtons();
    m.space = true;
    expect(readFutInput(idle(), m, 0, st, COM_BOLA).kick).toBe("charge");
    expect(readFutInput(idle(), m, 100, st, COM_BOLA).kick).toBe("charge");
    expect(readFutInput(idle(), m, TAP_PASS_MS + 33, st, COM_BOLA).kick).toBe("charge");
    m.space = false;
    const a = readFutInput(idle(), m, TAP_PASS_MS + 66, st, COM_BOLA);
    expect([a.kick, a.pass]).toEqual(["release", "none"]);
    expect(readFutInput(idle(), m, TAP_PASS_MS + 99, st, COM_BOLA).kick).toBe("release");
    expect(readFutInput(idle(), m, TAP_PASS_MS + 132, st, COM_BOLA).kick).toBe("none");
  });

  it("toque rápido com a bola vira passe, sem chute", () => {
    const st = newControlState();
    const m = newButtons();
    m.space = true;
    expect(readFutInput(idle(), m, 0, st, COM_BOLA).kick).toBe("charge");
    m.space = false;
    const a = readFutInput(idle(), m, 66, st, COM_BOLA);
    expect([a.kick, a.pass]).toEqual(["none", "release"]);
    const b = readFutInput(idle(), m, 99, st, COM_BOLA);
    expect([b.kick, b.pass]).toEqual(["none", "release"]);
    const c = readFutInput(idle(), m, 132, st, COM_BOLA);
    expect([c.kick, c.pass]).toEqual(["none", "none"]);
  });

  it("toque que solta antes da leitura ainda vale como passe", () => {
    const st = newControlState();
    const m = newButtons();
    pressButton(m, "space");
    releaseButton(m, "space");
    expect(readFutInput(idle(), m, 0, st, COM_BOLA).kick).toBe("charge");
    const a = readFutInput(idle(), m, 33, st, COM_BOLA);
    expect([a.kick, a.pass]).toEqual(["none", "release"]);
  });

  it("sem a bola o toque rápido também é carrinho (kick release)", () => {
    const st = newControlState();
    const m = newButtons();
    m.space = true;
    readFutInput(idle(), m, 0, st, { yaw: 0, hasBall: false });
    m.space = false;
    const a = readFutInput(idle(), m, 66, st, { yaw: 0, hasBall: false });
    expect([a.kick, a.pass]).toEqual(["release", "none"]);
  });

  it("apertar de novo depois de soltar gera nova carga", () => {
    const st = newControlState();
    const m = newButtons();
    pressButton(m, "space");
    m.spaceHit = false;
    pressButton(m, "space");
    expect(m.spaceHit).toBe(false);
    releaseButton(m, "space");
    pressButton(m, "space");
    expect(m.spaceHit).toBe(true);
    expect(readFutInput(idle(), m, 0, st).kick).toBe("charge");
  });

  it("cancelar a carga não chuta nem passa: a leitura seguinte é none", () => {
    const st = newControlState();
    const m = newButtons();
    pressButton(m, "space");
    readFutInput(idle(), m, 0, st, COM_BOLA);
    cancelCharges(m, st);
    for (const t of [33, 66, 99]) {
      const i = readFutInput(idle(), m, t, st, COM_BOLA);
      expect([i.kick, i.pass]).toEqual(["none", "none"]);
    }
  });
});

describe("botões da tela (toque)", () => {
  it("segurar Chute é charge e soltar é release", () => {
    const st = newControlState();
    const m = newButtons();
    m.kick = true;
    expect(readFutInput(idle(), m, 0, st).kick).toBe("charge");
    expect(readFutInput(idle(), m, 33, st).kick).toBe("charge");
    m.kick = false;
    expect(readFutInput(idle(), m, 66, st).kick).toBe("release");
    expect(readFutInput(idle(), m, 99, st).kick).toBe("release");
    expect(readFutInput(idle(), m, 132, st).kick).toBe("none");
  });

  it("toque rápido no Chute que solta antes da leitura ainda vira charge e release", () => {
    const st = newControlState();
    const m = newButtons();
    pressButton(m, "kick");
    releaseButton(m, "kick");
    expect(readFutInput(idle(), m, 0, st).kick).toBe("charge");
    expect(readFutInput(idle(), m, 33, st).kick).toBe("release");
  });

  it("Passe vira pass", () => {
    const st = newControlState();
    const m = newButtons();
    m.pass = true;
    const a = readFutInput(idle(), m, 0, st);
    expect(a.pass).toBe("charge");
    expect(a.kick).toBe("none");
    m.pass = false;
    expect(readFutInput(idle(), m, 33, st).pass).toBe("release");
  });

  it("cancelar a carga não chuta", () => {
    const st = newControlState();
    const m = newButtons();
    pressButton(m, "kick");
    readFutInput(idle(), m, 0, st);
    cancelCharges(m, st);
    expect(readFutInput(idle(), m, 33, st).kick).toBe("none");
    expect(readFutInput(idle(), m, 66, st).kick).toBe("none");
  });
});

describe("barra de força", () => {
  it("aparece no passo do aperto, com ou sem a bola, e some no release", () => {
    const c = newCharge();
    stepCharge(c, { kick: "none", pass: "none" }, 0);
    expect(c.kind).toBeNull();
    stepCharge(c, { kick: "charge", pass: "none" }, 100);
    expect(c.kind).toBe("kick");
    expect(chargePower(c, 100 + FUT.chargeMaxMs / 2)).toBeCloseTo(0.5);
    stepCharge(c, { kick: "release", pass: "none" }, 133);
    expect(c.kind).toBeNull();
    expect(chargePower(c, 200)).toBe(0);
  });

  it("segurar continua a mesma carga e o tempo não reinicia", () => {
    const c = newCharge();
    stepCharge(c, { kick: "charge", pass: "none" }, 100);
    stepCharge(c, { kick: "charge", pass: "none" }, 400);
    expect(c.since).toBe(100);
  });

  it("os dois botões não trocam de tipo nem reiniciam; a força passa de 1 só satura", () => {
    const c = newCharge();
    stepCharge(c, { kick: "none", pass: "charge" }, 0);
    stepCharge(c, { kick: "charge", pass: "charge" }, 33);
    expect(c.kind).toBe("pass");
    expect(c.since).toBe(0);
    expect(chargePower(c, 10 * FUT.chargeMaxMs)).toBe(1);
  });
});
