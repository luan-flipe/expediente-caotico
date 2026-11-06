import { describe, expect, it } from "vitest";
import { YAW_MAX_SPEED, YAW_MIN_DIST, approachYaw, cameraYawTarget, wrapAngle, yawToward } from "./cameraBola";

describe("yaw até a bola", () => {
  it("aponta para a bola (yaw 0 olha para +z)", () => {
    expect(yawToward({ x: 0, z: 0 }, { x: 0, z: 10 }, 1)).toBeCloseTo(0);
    expect(yawToward({ x: 0, z: 0 }, { x: 10, z: 0 }, 0)).toBeCloseTo(Math.PI / 2);
    expect(yawToward({ x: 0, z: 0 }, { x: -10, z: 0 }, 0)).toBeCloseTo(-Math.PI / 2);
  });

  it("bola muito perto mantém o último yaw", () => {
    expect(yawToward({ x: 3, z: 3 }, { x: 3 + YAW_MIN_DIST * 0.5, z: 3 }, 0.7)).toBe(0.7);
    expect(yawToward({ x: 3, z: 3 }, { x: 3, z: 3 }, -2)).toBe(-2);
  });
});

describe("giro suave", () => {
  it("wrapAngle fica em (-PI, PI]", () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(2 * Math.PI + 0.3)).toBeCloseTo(0.3);
  });

  it("gira pelo caminho curto atravessando +-PI", () => {
    // de 3.0 para -3.0: o caminho curto é subir (passando por PI), não descer 6 rad
    const a = approachYaw(3.0, -3.0, 0.016);
    expect(a).toBeGreaterThan(3.0);
  });

  it("não passa do alvo e converge", () => {
    let y = 0;
    for (let i = 0; i < 300; i++) {
      y = approachYaw(y, 2, 1 / 60);
      expect(y).toBeLessThanOrEqual(2 + 1e-9);
    }
    expect(y).toBeCloseTo(2, 2);
  });

  it("giro de 180 graus é limitado por quadro, sem tranco", () => {
    const dt = 1 / 60;
    const a = approachYaw(0, Math.PI, dt);
    expect(Math.abs(a)).toBeLessThanOrEqual(YAW_MAX_SPEED * dt + 1e-9);
    expect(Math.abs(a)).toBeGreaterThan(0);
  });
});

describe("alvo da câmera na partida", () => {
  const goal = { x: 20, z: 0 };
  it("com a bola olha o gol adversário, mesmo com a bola em outra direção", () => {
    expect(cameraYawTarget({ x: 0, z: 0 }, { x: 0, z: 5 }, goal, true, 0)).toBeCloseTo(Math.PI / 2);
    expect(cameraYawTarget({ x: 5, z: 8 }, { x: 5, z: 8.5 }, goal, true, 0)).toBeCloseTo(Math.atan2(15, -8));
  });

  it("sem a bola continua olhando a bola", () => {
    expect(cameraYawTarget({ x: 0, z: 0 }, { x: 0, z: 5 }, goal, false, 1)).toBeCloseTo(0);
  });

  it("colado no gol mantém o último yaw", () => {
    expect(cameraYawTarget({ x: 19.5, z: 0 }, { x: 0, z: 0 }, goal, true, 0.4)).toBe(0.4);
  });
});
