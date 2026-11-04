import { describe, expect, it } from "vitest";
import { fieldFor } from "@ec/shared";
import { BOLA_DIST, BOLA_MAX_Y, BOLA_MIN_Y, bolaFocus, bolaPose, offscreenDir } from "./cameraBola";
import { GRASS_EDGE } from "./arenaLayout";

const field = fieldFor(3);
const ball = { x: 10, y: 0.25, z: 4 };

describe("câmera fixa na bola", () => {
  it("primeiro quadro salta para a bola; depois suaviza sem chegar de uma vez", () => {
    expect(bolaFocus(null, ball, 0.016)).toEqual(ball);
    const f = bolaFocus({ x: 0, y: 0.25, z: 0 }, { x: 30, y: 0.25, z: 0 }, 0.016);
    expect(f.x).toBeGreaterThan(0);
    expect(f.x).toBeLessThan(5);
  });

  it("converge para a bola com o tempo", () => {
    let f = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 120; i++) f = bolaFocus(f, ball, 1 / 60);
    expect(Math.hypot(f.x - ball.x, f.z - ball.z)).toBeLessThan(0.01);
  });

  it("olha para a bola e fica atrás dela conforme o yaw", () => {
    const p = bolaPose(ball, 0, -0.3, field);
    expect(p.look.x).toBeCloseTo(ball.x);
    expect(p.look.z).toBeCloseTo(ball.z);
    // yaw 0 olha para +z: a câmera fica em z menor que a bola
    expect(p.pos.z).toBeLessThan(ball.z - BOLA_DIST * 0.5);
  });

  it("girar o yaw orbita a bola mantendo a distância horizontal", () => {
    const a = bolaPose(ball, 0, -0.3, field);
    const b = bolaPose(ball, 1.5, -0.3, field);
    const da = Math.hypot(a.pos.x - ball.x, a.pos.z - ball.z);
    const db = Math.hypot(b.pos.x - ball.x, b.pos.z - ball.z);
    expect(Math.abs(da - db)).toBeLessThan(0.5);
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)).toBeGreaterThan(3);
  });

  it("nunca vai para baixo do chão nem acima do teto", () => {
    for (const pitch of [-0.6, 0, 0.5]) {
      const p = bolaPose(ball, 0.7, pitch, field);
      expect(p.pos.y).toBeGreaterThanOrEqual(BOLA_MIN_Y);
      expect(p.pos.y).toBeLessThanOrEqual(BOLA_MAX_Y);
    }
  });

  it("não sai do gramado do mapa quando a bola está no canto", () => {
    for (const yaw of [0, 1.57, 3.14, -1.57]) {
      const p = bolaPose({ x: field.halfL, y: 0.25, z: field.halfW }, yaw, -0.3, field);
      expect(Math.abs(p.pos.x)).toBeLessThan(Math.max(field.halfL, GRASS_EDGE.halfL));
      expect(Math.abs(p.pos.z)).toBeLessThan(Math.max(field.halfW, GRASS_EDGE.halfW));
    }
  });
});

describe("indicador do meu jogador", () => {
  it("dentro da tela não mostra seta", () => {
    expect(offscreenDir(0.2, -0.3, true)).toBeNull();
  });

  it("fora da tela aponta para a borda certa", () => {
    const r = offscreenDir(3, 0.5, true)!;
    expect(r.x).toBeGreaterThan(0.9);
    expect(Math.abs(r.y)).toBeLessThan(0.3);
  });

  it("atrás da câmera inverte a direção", () => {
    const r = offscreenDir(0.4, 0.1, false)!;
    expect(r.x).toBeLessThan(0);
  });
});
