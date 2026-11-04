import { describe, expect, it } from "vitest";
import { fieldFor, type FutSnapshot } from "@ec/shared";
import { CAM_KINDS, REPLAY_SHOTS, camPose, replayPose, shotAt, type CamCtx } from "./cameras";
import { HISTORY_MS, ReplayBuffer, sampleClip } from "./replay";

const field = fieldFor(3);
const ctx = (over: Partial<CamCtx["ball"]> = {}, extra: Partial<CamCtx> = {}): CamCtx => ({
  field,
  ball: { x: 10, y: 0.25, z: 4, vx: 0, vz: 0, ...over },
  ...extra,
});

describe("câmeras do espectador", () => {
  it("todas olham para perto da jogada e ficam acima do chão", () => {
    for (const k of CAM_KINDS) {
      const p = camPose(k, ctx({ vx: 8, vz: 2 }, { target: { x: 8, z: 3, facing: 1 } }));
      expect(p.pos[1]).toBeGreaterThan(1);
      expect(Math.hypot(p.look[0] - 10, p.look[2] - 4)).toBeLessThan(12);
      expect(p.fov).toBeGreaterThan(30);
    }
  });

  it("TV lateral fica fora da linha lateral, atrás do gol fica fora da linha de fundo", () => {
    const tv = camPose("tv", ctx());
    expect(Math.abs(tv.pos[2])).toBeGreaterThan(field.halfW);
    const atras = camPose("atras", ctx());
    expect(Math.abs(atras.pos[0])).toBeGreaterThan(field.halfL);
    expect(Math.sign(atras.pos[0])).toBe(1);
    expect(Math.sign(camPose("atras", ctx({ x: -10 })).pos[0])).toBe(-1);
    expect(camPose("atras", ctx({ x: -10 }, { goalSide: 1 })).pos[0]).toBeGreaterThan(field.halfL);
  });

  it("aérea é a mais alta e bola segue atrás da direção do chute", () => {
    const heights = CAM_KINDS.map((k) => camPose(k, ctx()).pos[1]);
    expect(Math.max(...heights)).toBe(camPose("aerea", ctx()).pos[1]);
    const p = camPose("bola", ctx({ vx: 10, vz: 0 }));
    expect(p.pos[0]).toBeLessThan(10);
    expect(p.look[0]).toBeGreaterThan(10);
  });

  it("seguir jogador fica atrás dele, olhando para a frente", () => {
    const p = camPose("jogador", ctx({}, { target: { x: 0, z: 0, facing: Math.PI / 2 } }));
    expect(p.pos[0]).toBeLessThan(0);
    expect(p.look[0]).toBeGreaterThan(0);
  });
});

describe("planos do replay", () => {
  it("os planos se alternam em fatias iguais", () => {
    expect(REPLAY_SHOTS.map((_, i) => shotAt((i + 0.5) / REPLAY_SHOTS.length))).toEqual([...REPLAY_SHOTS]);
    expect(shotAt(0)).toBe(REPLAY_SHOTS[0]);
    expect(shotAt(1)).toBe(REPLAY_SHOTS[REPLAY_SHOTS.length - 1]);
    expect(shotAt(-3)).toBe(REPLAY_SHOTS[0]);
  });

  it("a câmera da equipe fica atrás das placas e de perto da bola", () => {
    const p = replayPose("equipe", ctx({ x: field.halfL - 5, z: field.halfW - 2 }));
    expect(Math.abs(p.pos[2])).toBeGreaterThan(field.halfW);
    expect(Math.abs(p.pos[0] - (field.halfL - 5))).toBeLessThan(field.halfL);
    expect(p.fov).toBeLessThan(45);
  });

  it("atrás do gol do replay usa o gol marcado", () => {
    const p = replayPose("atras", ctx({ x: field.halfL }, { goalSide: -1 }));
    expect(p.pos[0]).toBeLessThan(-field.halfL);
  });
});

function snap(t: number, ball: [number, number, number], players: [string, number, number, number, boolean][]): FutSnapshot {
  return {
    t,
    ball: { x: ball[0], y: ball[1], z: ball[2], vx: 0, vy: 0, vz: 0, ownerId: null },
    players: players.map(([id, x, z, facing, down]) => ({ id, x, z, facing, down })),
  } as unknown as FutSnapshot;
}

describe("gravador do replay", () => {
  it("guarda só os últimos segundos", () => {
    const b = new ReplayBuffer();
    for (let t = 0; t <= HISTORY_MS * 2; t += 100) {
      b.push(snap(t, [t / 1000, 0.25, 0], []));
    }
    expect(b.frames[0].t).toBeGreaterThanOrEqual(HISTORY_MS);
    expect(b.lastT).toBe(HISTORY_MS * 2);
  });

  it("ignora snapshot repetido ou atrasado", () => {
    const b = new ReplayBuffer();
    b.push(snap(100, [0, 0.25, 0], []));
    b.push(snap(100, [5, 0.25, 0], []));
    b.push(snap(50, [6, 0.25, 0], []));
    expect(b.frames).toHaveLength(1);
  });

  it("corta o clipe com folga e interpola bola e jogadores", () => {
    const b = new ReplayBuffer();
    for (let t = 0; t <= 1000; t += 100) {
      b.push(snap(t, [t / 100, 0.25, 0], [["a", t / 100, 0, 0, false]]));
    }
    const clip = b.slice(200, 500)!;
    expect(clip.frames[0].t).toBeLessThanOrEqual(200);
    expect(clip.frames[clip.frames.length - 1].t).toBeGreaterThanOrEqual(500);
    const s = sampleClip(clip, 350)!;
    expect(s.ball.x).toBeCloseTo(3.5, 5);
    expect(s.players.get("a")!.x).toBeCloseTo(3.5, 5);
    expect(s.players.get("a")!.speed).toBeCloseTo(10, 5);
    expect(s.ball.vx).toBeCloseTo(10, 5);
  });

  it("salto grande (reposição) não desliza", () => {
    const b = new ReplayBuffer();
    b.push(snap(0, [0, 0.25, 0], [["a", 0, 0, 0, false]]));
    b.push(snap(100, [0, 0.25, 0], [["a", 30, 0, 0, false]]));
    const s = sampleClip(b.slice(0, 100)!, 50)!;
    expect(s.players.get("a")!.x).toBe(30);
    expect(s.players.get("a")!.speed).toBe(0);
  });

  it("sem quadros suficientes não há clipe", () => {
    const b = new ReplayBuffer();
    expect(b.slice(0, 100)).toBeNull();
    b.push(snap(0, [0, 0.25, 0], []));
    expect(b.slice(0, 100)).toBeNull();
  });
});
