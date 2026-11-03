import { describe, expect, it } from "vitest";
import { FUT } from "@ec/shared";
import { BTN_LEFT, BTN_RIGHT, cancelCharges, chargePower, mouseSide, newCharge, newControlState, newMouse, pressMouse, readFutInput, releaseMouse, stepCharge, syncMouseButtons, type FutKeys } from "./controls";

const idle = (): FutKeys => ({ frente: false, tras: false, esquerda: false, direita: false, stick: { x: 0, y: 0 } });
const w = (): FutKeys => ({ ...idle(), frente: true });

describe("controles do futebol", () => {
  it("toque duplo em W liga a corrida", () => {
    const st = newControlState();
    const m = newMouse();
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
    const m = newMouse();
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

  it("segurar esquerdo é charge e soltar é release", () => {
    const st = newControlState();
    const m = newMouse();
    m.left = true;
    expect(readFutInput(idle(), m, 0, st).kick).toBe("charge");
    expect(readFutInput(idle(), m, 33, st).kick).toBe("charge");
    m.left = false;
    expect(readFutInput(idle(), m, 66, st).kick).toBe("release");
    expect(readFutInput(idle(), m, 99, st).kick).toBe("release");
    expect(readFutInput(idle(), m, 132, st).kick).toBe("none");
  });

  it("clique rápido que solta antes da leitura ainda vira charge e release", () => {
    const st = newControlState();
    const m = newMouse();
    m.leftHit = true;
    expect(readFutInput(idle(), m, 0, st).kick).toBe("charge");
    expect(readFutInput(idle(), m, 33, st).kick).toBe("release");
  });

  it("direito vira pass", () => {
    const st = newControlState();
    const m = newMouse();
    m.right = true;
    const a = readFutInput(idle(), m, 0, st);
    expect(a.pass).toBe("charge");
    expect(a.kick).toBe("none");
    m.right = false;
    expect(readFutInput(idle(), m, 33, st).pass).toBe("release");
  });

  it("andar é relativo à câmera e a mira segue a câmera", () => {
    const st = newControlState();
    const i = readFutInput(w(), newMouse(), 0, st, { yaw: Math.PI / 2 });
    expect(i.mx).toBeCloseTo(1);
    expect(i.mz).toBeCloseTo(0);
    expect(i.aim).toBeCloseTo(Math.PI / 2);
  });

  it("analógico na borda corre", () => {
    const st = newControlState();
    const k = { ...idle(), stick: { x: 0, y: 1 } };
    expect(readFutInput(k, newMouse(), 0, st).sprint).toBe(true);
    expect(readFutInput({ ...idle(), stick: { x: 0, y: 0.5 } }, newMouse(), 33, st).sprint).toBe(false);
  });
});

describe("botões do mouse", () => {
  it("o botão já apertado quando o mouse é preso vira carga", () => {
    const m = newMouse();
    syncMouseButtons(m, BTN_LEFT);
    expect(m.left).toBe(true);
    expect(readFutInput(idle(), m, 0, newControlState()).kick).toBe("charge");
  });

  it("mouseup perdido é corrigido pelo estado dos botões e solta o chute", () => {
    const st = newControlState();
    const m = newMouse();
    pressMouse(m, "left");
    expect(readFutInput(idle(), m, 0, st).kick).toBe("charge");
    syncMouseButtons(m, 0);
    expect(readFutInput(idle(), m, 33, st).kick).toBe("release");
  });

  it("os dois botões juntos funcionam e soltam em separado", () => {
    const st = newControlState();
    const m = newMouse();
    syncMouseButtons(m, BTN_LEFT | BTN_RIGHT);
    const a = readFutInput(idle(), m, 0, st);
    expect([a.kick, a.pass]).toEqual(["charge", "charge"]);
    syncMouseButtons(m, BTN_RIGHT);
    const b = readFutInput(idle(), m, 33, st);
    expect([b.kick, b.pass]).toEqual(["release", "charge"]);
  });

  it("cancelar a carga não chuta: a leitura seguinte é none", () => {
    const st = newControlState();
    const m = newMouse();
    pressMouse(m, "left");
    readFutInput(idle(), m, 0, st);
    cancelCharges(m, st);
    expect(readFutInput(idle(), m, 33, st).kick).toBe("none");
    expect(readFutInput(idle(), m, 66, st).kick).toBe("none");
  });

  it("só esquerdo e direito valem", () => {
    expect(mouseSide(0)).toBe("left");
    expect(mouseSide(2)).toBe("right");
    expect(mouseSide(1)).toBeNull();
  });

  it("apertar de novo depois de soltar gera novo aperto", () => {
    const m = newMouse();
    pressMouse(m, "right");
    m.rightHit = false;
    pressMouse(m, "right");
    expect(m.rightHit).toBe(false);
    releaseMouse(m, "right");
    pressMouse(m, "right");
    expect(m.rightHit).toBe(true);
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
