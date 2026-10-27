import { describe, expect, it } from "vitest";
import { brakeFromStick, STICK_RADIUS, steerFrom, stickVector } from "../ui/touch";

describe("joystick", () => {
  it("arrastar para cima é andar para a frente", () => {
    const v = stickVector(0, -STICK_RADIUS);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
  });

  it("passar da borda não passa de intensidade 1", () => {
    const v = stickVector(STICK_RADIUS * 3, STICK_RADIUS * 3);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBeLessThan(0);
  });

  it("tremida do polegar parado não anda", () => {
    expect(stickVector(3, -2)).toEqual({ x: 0, y: 0 });
  });
});

describe("volante da corrida", () => {
  it("vai de -1 a 1 e respeita a zona morta", () => {
    expect(steerFrom(STICK_RADIUS * 2)).toBe(1);
    expect(steerFrom(-STICK_RADIUS * 2)).toBe(-1);
    expect(steerFrom(2)).toBe(0);
  });

  it("é mais suave perto do centro", () => {
    expect(steerFrom(STICK_RADIUS / 2)).toBeLessThan(0.5);
    expect(steerFrom(STICK_RADIUS / 2)).toBeGreaterThan(0);
  });

  it("puxar bem para baixo aciona o freio/ré sem atrapalhar curvas laterais", () => {
    expect(brakeFromStick(STICK_RADIUS * 0.25)).toBe(false);
    expect(brakeFromStick(-STICK_RADIUS)).toBe(false);
    expect(brakeFromStick(STICK_RADIUS * 0.8)).toBe(true);
  });
});
