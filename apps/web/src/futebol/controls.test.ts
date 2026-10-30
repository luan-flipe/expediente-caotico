import { describe, expect, it } from "vitest";
import { FUT } from "@ec/shared";
import { newControlState, newMouse, readFutInput, type FutKeys } from "./controls";

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
