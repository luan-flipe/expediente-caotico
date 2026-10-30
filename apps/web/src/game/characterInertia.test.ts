import { describe, expect, it } from "vitest";
import { CharacterPhysicsInertia, createCharacter } from "./character";
import { DEFAULT_AVATAR } from "@ec/shared";

describe("CharacterPhysicsInertia", () => {
  it("initializes with zeroed inertia values", () => {
    const inertia = new CharacterPhysicsInertia();
    expect(inertia.bodyRoll).toBe(0);
    expect(inertia.bodyShiftX).toBe(0);
    expect(inertia.bodyPitch).toBe(0);
    expect(inertia.squashY).toBe(0);
    expect(inertia.squashVel).toBe(0);
    expect(inertia.chatterY).toBe(0);
    expect(inertia.chatterRot).toBe(0);
  });

  it("leans into turns and drifts (centrifugal lean-in towards apex)", () => {
    const inertia = new CharacterPhysicsInertia();
    // Drift to the right (driftDir = 1, steer = 0)
    inertia.update(0.1, 12, 0, 1, false, false, false);
    expect(inertia.bodyRoll).toBeLessThan(0); // Leans inward
    expect(inertia.bodyShiftX).toBeLessThan(0);

    // Drift to the left (driftDir = -1)
    const inertiaLeft = new CharacterPhysicsInertia();
    inertiaLeft.update(0.1, 12, 0, -1, false, false, false);
    expect(inertiaLeft.bodyRoll).toBeGreaterThan(0);
    expect(inertiaLeft.bodyShiftX).toBeGreaterThan(0);
  });

  it("applies longitudinal G-forces for boost vs hard braking", () => {
    const inertiaBoost = new CharacterPhysicsInertia();
    inertiaBoost.update(0.1, 16, 0, 0, true, false, false);
    expect(inertiaBoost.bodyPitch).toBeLessThan(0); // Pressed back into seat

    const inertiaBrake = new CharacterPhysicsInertia();
    inertiaBrake.update(0.1, 10, 0, 0, false, false, true);
    expect(inertiaBrake.bodyPitch).toBeGreaterThan(0); // Pitched forward over handlebars/armrests
  });

  it("triggers squash & stretch damped harmonic bounce on landing", () => {
    const inertia = new CharacterPhysicsInertia();
    // In air
    inertia.update(0.1, 12, 0, 0, false, true, false);
    expect(inertia.squashVel).toBe(0);

    // Touch down: landing impact
    inertia.update(0.016, 12, 0, 0, false, false, false);
    expect(inertia.squashVel).toBeLessThan(0); // Downward squash impulse
    expect(inertia.squashY).toBeLessThan(0);

    // After settling over time
    for (let i = 0; i < 60; i++) {
      inertia.update(0.016, 12, 0, 0, false, false, false);
    }
    expect(Math.abs(inertia.squashY)).toBeLessThan(0.05); // Dampened out
  });

  it("applies aerial trick stretch and deeper landing boost squash than normal landing", () => {
    const normalInertia = new CharacterPhysicsInertia();
    normalInertia.update(0.1, 14, 0, 0, false, true, false, false);
    normalInertia.update(0.016, 14, 0, 0, false, false, false, false);

    const trickInertia = new CharacterPhysicsInertia();
    // In air executing a trick
    for (let i = 0; i < 10; i++) {
      trickInertia.update(0.05, 14, 0, 0, false, true, false, true);
    }
    expect(trickInertia.squashY).toBeGreaterThan(0.05); // Aerodynamic acrobatic lift

    // Land after trick
    trickInertia.update(0.016, 14, 0, 0, false, false, false, false);
    expect(trickInertia.squashVel).toBeLessThan(normalInertia.squashVel); // Deeper landing compression
  });

  it("activates tactile road chatter vibration at high speeds", () => {
    const inertia = new CharacterPhysicsInertia();
    inertia.update(0.1, 14, 0, 0, false, false, false);
    expect(Math.abs(inertia.chatterY)).toBeGreaterThan(0);
    expect(Math.abs(inertia.chatterRot)).toBeGreaterThan(0);
  });

  it("resets all states properly", () => {
    const inertia = new CharacterPhysicsInertia();
    inertia.update(0.2, 16, 1, 1, true, false, true);
    inertia.reset();
    expect(inertia.bodyRoll).toBe(0);
    expect(inertia.bodyShiftX).toBe(0);
    expect(inertia.bodyPitch).toBe(0);
    expect(inertia.squashY).toBe(0);
    expect(inertia.squashVel).toBe(0);
  });
});

describe("Character seated with inertia & tricks", () => {
  it("renders procedural character and executes updateSeated with all trick types cleanly", () => {
    const char = createCharacter(DEFAULT_AVATAR);
    expect(char).toBeDefined();

    char.sit?.();

    // Test each trick maneuver type (0: Spin, 1: Backflip, 2: Corkscrew, 3: Kick-out)
    for (let trickType = 0; trickType <= 3; trickType++) {
      char.updateSeated?.(0.016, 15, 0.5, 0, false, undefined, {
        driftLevel: 0,
        isBraking: false,
        inAir: true,
        isTricking: true,
        trickType,
        trickProgress: 0.5,
        draft: false,
        spinning: false,
      });
      char.update(0.016, 15);

      expect(Number.isFinite(char.root.position.x)).toBe(true);
      expect(Number.isFinite(char.root.scale.y)).toBe(true);
    }
  });
});
