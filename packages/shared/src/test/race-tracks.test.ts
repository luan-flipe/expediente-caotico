import { describe, expect, it } from "vitest";
import { BOT_LEVELS } from "../botLevels";
import { DEFAULT_AVATAR } from "../data/avatar";
import { RACE } from "../race/balance";
import { DEFAULT_CHAIR } from "../race/chair";
import { newKart, stepKart } from "../race/kart";
import { createRace, getRaceResults, stepRace } from "../race/match";
import { boxSpots, checkpoints, corkscrewRoll, corkscrewTransform, getTrack, gridSlots, groundAt, inCarpet, pointAt, progressOf, routeAhead, TRACK, TRACK_IDS, TRACKS } from "../race/track";

const DT = 1000 / 30;

/** Limites por pista: comprimento (m) e tempo máximo para uma corrida de 3 voltas só com bots. */
const LIMITS: Record<string, { min: number; max: number; raceMs: number }> = {
  corporativo: { min: 300, max: 400, raceMs: 150000 },
  estacionamento: { min: 300, max: 450, raceMs: 150000 },
  copa: { min: 150, max: 250, raceMs: 110000 },
  parque: { min: 500, max: 650, raceMs: 180000 },
  deserto: { min: 650, max: 780, raceMs: 220000 },
};

describe("registro de pistas", () => {
  it("cinco pistas com nome, e o Circuito Corporativo continua sendo o padrão", () => {
    expect(TRACK_IDS).toEqual(["corporativo", "estacionamento", "copa", "parque", "deserto"]);
    expect(TRACKS.corporativo).toBe(TRACK);
    expect(TRACKS.estacionamento.name).toBe("Estacionamento");
    expect(TRACKS.copa.name).toBe("Copa");
    expect(TRACKS.parque.name).toBe("Parque Ipanema");
    expect(TRACKS.deserto.name).toBe("Pista do Deserto");
    for (const id of TRACK_IDS) expect(TRACKS[id].id).toBe(id);
    expect(getTrack(undefined)).toBe(TRACK);
    expect(getTrack("nao-existe")).toBe(TRACK);
    expect(getTrack("copa")).toBe(TRACKS.copa);
    expect(getTrack("parque")).toBe(TRACKS.parque);
    expect(getTrack("deserto")).toBe(TRACKS.deserto);
  });

  it("corrida sem pista usa o Circuito Corporativo", () => {
    const r = createRace({ seed: 1, players: [{ id: "a", name: "A", avatar: DEFAULT_AVATAR, chair: DEFAULT_CHAIR, isBot: true }] });
    expect(r.track).toBe(TRACK);
  });
});

for (const id of TRACK_IDS) {
  const t = TRACKS[id];
  const n = t.points.length;
  const lim = LIMITS[id];

  describe(`geometria: ${t.name}`, () => {
    it("fechada e com comprimento dentro do esperado", () => {
      const a = t.points[0];
      const b = t.points[n - 1];
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(6);
      expect(t.length).toBeGreaterThan(lim.min);
      expect(t.length).toBeLessThan(lim.max);
    });

    it("largura entre 8 e 14 m e curvas sem dobrar a borda interna", () => {
      for (const w of t.widths) {
        expect(w).toBeGreaterThanOrEqual(8);
        expect(w).toBeLessThanOrEqual(14);
      }
      // raio da curva (por três pontos seguidos) sempre maior que meia largura
      for (let i = 0; i < n; i++) {
        const p = t.points[(i - 1 + n) % n];
        const q = t.points[i];
        const r = t.points[(i + 1) % n];
        const a = Math.hypot(q.x - p.x, q.z - p.z);
        const b = Math.hypot(r.x - q.x, r.z - q.z);
        const c = Math.hypot(r.x - p.x, r.z - p.z);
        const area2 = Math.abs((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
        const radius = area2 < 1e-9 ? Infinity : (a * b * c) / (2 * area2);
        expect(radius, `ponto ${i}`).toBeGreaterThan(t.widths[i] / 2);
      }
    });

    it("sem cruzar nem encostar em outro trecho", () => {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const gap = Math.min(Math.abs(i - j), n - Math.abs(i - j));
          if (gap * t.spacing < 40) continue;
          const d = Math.hypot(t.points[i].x - t.points[j].x, t.points[i].z - t.points[j].z);
          expect(d, `pontos ${i} e ${j}`).toBeGreaterThan((t.widths[i] + t.widths[j]) / 2 + 1.5);
        }
      }
    });

    it("checkpoints em ordem a cada 20 m, começando na linha", () => {
      const cps = checkpoints(t);
      expect(cps[0]).toBe(0);
      for (let i = 1; i < cps.length; i++) expect(cps[i] - cps[i - 1]).toBe(RACE.checkpointEvery);
      expect(cps[cps.length - 1]).toBeLessThan(t.length);
      // cada checkpoint, projetado de volta, cai no próprio s (nenhum trecho "rouba" o outro)
      for (const s of cps) {
        const pr = progressOf(t, pointAt(t, s).pos);
        const diff = Math.abs(pr.s - s);
        expect(Math.min(diff, t.length - diff)).toBeLessThan(0.5);
      }
    });

    it("8 posições de largada dentro da pista e separadas", () => {
      const slots = gridSlots(t, 8);
      for (const a of slots) {
        const pr = progressOf(t, a.pos);
        expect(pr.dist).toBeLessThan(pr.halfWidth - 1);
        for (const b of slots) if (a !== b) expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)).toBeGreaterThan(1.5);
      }
    });

    it("caixas dentro da pista e fora do carpete", () => {
      const boxes = boxSpots(t);
      expect(boxes.length).toBeGreaterThanOrEqual(12);
      for (const b of boxes) {
        const pr = progressOf(t, b);
        expect(pr.dist).toBeLessThan(pr.halfWidth);
        expect(inCarpet(t, pr)).toBe(false);
      }
    });

    it("ambientes em ordem, começando na linha", () => {
      expect(t.rooms[0].ctrl).toBe(0);
      for (let i = 1; i < t.rooms.length; i++) expect(t.rooms[i].ctrl).toBeGreaterThan(t.rooms[i - 1].ctrl);
    });
  });

  describe(`bots: ${t.name}`, () => {
    for (const level of BOT_LEVELS) {
      it(`corrida de 3 voltas só com bots (${level}) termina a tempo`, () => {
        const r = createRace({
          seed: 7,
          laps: 3,
          botLevel: level,
          track: id,
          players: Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, avatar: DEFAULT_AVATAR, chair: DEFAULT_CHAIR, isBot: true })),
        });
        expect(r.track).toBe(t);
        while (r.phase !== "finished" && r.now < lim.raceMs + RACE.countdownMs) stepRace(r, DT);
        const rows = getRaceResults(r);
        // todos cruzam a linha antes de a tolerância acabar
        expect(rows.every((x) => x.totalMs !== null)).toBe(true);
        expect(Math.max(...rows.map((x) => x.totalMs!))).toBeLessThan(lim.raceMs);
      }, 30000);
    }
  });
}

describe("Pista do Deserto: mecânicas específicas (salto do cânion e boost pads)", () => {
  const t = TRACKS.deserto;
  const ramp = t.ramps.find((r) => r.gap)!;

  it("tem rampa de salto com vão livre (gap) configurado", () => {
    expect(ramp).toBeDefined();
    expect(ramp.gap).toBeDefined();
    expect(ramp.height).toBeGreaterThan(2);
    expect(ramp.gap!.sTo).toBeGreaterThan(ramp.gap!.sFrom);
  });

  it("tem placas de boost distribuídas estrategicamente", () => {
    expect(t.boostPads).toBeDefined();
    expect(t.boostPads!.length).toBeGreaterThanOrEqual(6);
  });

  it("kart passando por placa de dash ganha impulso de turbo (boostUntil e boostSpeed = 24)", () => {
    const padS = t.boostPads![0];
    const beforePad = pointAt(t, padS - 5);
    let kart = newKart(beforePad.pos, beforePad.heading);
    kart.speed = 14;

    let boosted = false;
    for (let step = 0; step < 20; step++) {
      const res = stepKart(kart, { throttle: 1, steer: 0, drift: false }, DT, (step + 1) * DT, t);
      kart = res.state;
      if (kart.boostUntil > (step + 1) * DT && kart.boostSpeed === 24) {
        boosted = true;
        break;
      }
    }
    expect(boosted).toBe(true);
  });

  it("kart sem velocidade suficiente cai no vão do cânion", () => {
    const at = pointAt(t, ramp.sTo - 1);
    let kart = newKart(at.pos, at.heading);
    kart.speed = 8;

    let fell = false;
    for (let step = 0; step < 100; step++) {
      const pr = progressOf(t, kart.pos, kart.path);
      const ahead = routeAhead(t, pr, -1, 10);
      const want = Math.atan2(ahead.pos.x - kart.pos.x, ahead.pos.z - kart.pos.z);
      const diff = Math.atan2(Math.sin(want - kart.heading), Math.cos(want - kart.heading));
      const steer = Math.max(-1, Math.min(1, -diff * 3.5));

      const res = stepKart(kart, { throttle: 0, steer, drift: false }, DT, step * DT, t);
      kart = res.state;
      if (res.fell) {
        fell = true;
        break;
      }
    }
    expect(fell).toBe(true);
  });

  it("kart com impulso de velocidade cruza o salto do cânion normalmente sem cair", () => {
    const at = pointAt(t, ramp.sFrom - 10);
    let kart = newKart(at.pos, at.heading);
    kart.speed = 24;
    kart.boostUntil = 5000;
    kart.boostSpeed = 24;

    let fell = false;
    let tookAir = false;
    let reachedOtherSide = false;

    for (let step = 0; step < 120; step++) {
      const pr = progressOf(t, kart.pos, kart.path);
      const ahead = routeAhead(t, pr, -1, 10);
      const want = Math.atan2(ahead.pos.x - kart.pos.x, ahead.pos.z - kart.pos.z);
      const diff = Math.atan2(Math.sin(want - kart.heading), Math.cos(want - kart.heading));
      const steer = Math.max(-1, Math.min(1, -diff * 3.5));

      const res = stepKart(kart, { throttle: 1, steer, drift: false }, DT, step * DT, t);
      kart = res.state;
      if (kart.air) tookAir = true;
      if (res.fell) {
        fell = true;
        break;
      }
      if (pr.s > ramp.gap!.sTo + 8) {
        reachedOtherSide = true;
        break;
      }
    }
    expect(tookAir).toBe(true);
    expect(fell).toBe(false);
    expect(reachedOtherSide).toBe(true);
  });

  describe("Saca-rolhas 360° (Corkscrew Loop) no Túnel do Deserto", () => {
    it("tem saca-rolhas configurado nos pontos de controle 14 a 20 com axisY = 9.4", () => {
      expect(t.corkscrew).toBeDefined();
      expect(t.corkscrew!.sStart).toBe(t.ctrlS[14]);
      expect(t.corkscrew!.sEnd).toBe(t.ctrlS[20]);
      expect(t.corkscrew!.sEnd).toBeGreaterThan(t.corkscrew!.sStart);
      expect(t.corkscrew!.axisY).toBe(9.4);
      expect(TRACKS.corporativo.corkscrew).toBeUndefined();
    });

    it("corkscrewRoll varia suavemente de 0 a 2*PI no trecho do saca-rolhas e 0 fora dele", () => {
      const { sStart, sEnd } = t.corkscrew!;
      // Fora do saca-rolhas
      expect(corkscrewRoll(t, sStart - 10)).toBe(0);
      expect(corkscrewRoll(t, sEnd + 10)).toBe(0);
      expect(corkscrewRoll(TRACKS.corporativo, 50)).toBe(0);

      // Início do saca-rolhas
      expect(corkscrewRoll(t, sStart)).toBeCloseTo(0, 5);

      // Meio do saca-rolhas (180° - kart de cabeça para baixo)
      const sMid = (sStart + sEnd) / 2;
      expect(corkscrewRoll(t, sMid)).toBeCloseTo(Math.PI, 4);

      // Fim do saca-rolhas (360° completo = 2*PI)
      expect(corkscrewRoll(t, sEnd)).toBeCloseTo(2 * Math.PI, 4);

      // Monotonicamente crescente
      let prevRoll = -0.001;
      for (let i = 0; i <= 20; i++) {
        const s = sStart + ((sEnd - sStart) * i) / 20;
        const roll = corkscrewRoll(t, s);
        expect(roll).toBeGreaterThanOrEqual(prevRoll);
        prevRoll = roll;
      }
    });

    it("corkscrewTransform projeta deslocamento lateral e altura em 3D", () => {
      const { sStart, sEnd, axisY } = t.corkscrew!;
      // No início (roll = 0): sem rotação
      const startTr = corkscrewTransform(t, sStart, 2, 0);
      expect(startTr.lateral).toBeCloseTo(2, 4);
      expect(startTr.y).toBeCloseTo(0, 4);
      expect(startTr.roll).toBeCloseTo(0, 4);

      // No meio (roll = PI): lateral invertido, y no topo do tubo (2 * axisY)
      const sMid = (sStart + sEnd) / 2;
      const midTr = corkscrewTransform(t, sMid, 3, 0);
      expect(midTr.lateral).toBeCloseTo(-3, 4);
      expect(midTr.y).toBeCloseTo(2 * axisY, 4);
      expect(midTr.roll).toBeCloseTo(Math.PI, 4);
    });

    it("kart no saca-rolhas mantém velocidade mínima de 18 m/s e aderência sem cair ou voar", () => {
      const { sStart } = t.corkscrew!;
      const at = pointAt(t, sStart + 5);
      const kart = newKart(at.pos, at.heading);
      kart.speed = 4; // velocidade muito baixa tentando desacelerar

      // Passo da física no saca-rolhas com freio (throttle = -1)
      const res = stepKart(kart, { throttle: -1, steer: 0, drift: false }, DT, DT, t);
      expect(res.corkscrew).toBe(true);
      expect(res.state.speed).toBeGreaterThanOrEqual(18);
      expect(res.state.air).toBeFalsy();
      expect(res.state.fell).toBeFalsy();
      expect(res.state.roll).toBeGreaterThan(0);
      expect(res.state.y).toBe(groundAt(t, res.progress!).y);
    });

    it("kart atravessa o saca-rolhas 360° inteiro sem cair nem decolar", () => {
      const { sStart, sEnd } = t.corkscrew!;
      const at = pointAt(t, sStart - 5);
      let kart = newKart(at.pos, at.heading);
      kart.speed = 20;

      let maxRoll = 0;
      let reachedEnd = false;

      for (let step = 0; step < 220; step++) {
        const pr = progressOf(t, kart.pos, kart.path);
        const ahead = routeAhead(t, pr, -1, 10);
        const want = Math.atan2(ahead.pos.x - kart.pos.x, ahead.pos.z - kart.pos.z);
        const diff = Math.atan2(Math.sin(want - kart.heading), Math.cos(want - kart.heading));
        const steer = Math.max(-1, Math.min(1, -diff * 3.5));

        const res = stepKart(kart, { throttle: 1, steer, drift: false }, DT, step * DT, t);
        kart = res.state;

        if (res.corkscrew) {
          expect(kart.speed).toBeGreaterThanOrEqual(18);
          expect(kart.air).toBeFalsy();
          expect(kart.fell).toBeFalsy();
          if (kart.roll) maxRoll = Math.max(maxRoll, kart.roll);
        }

        if (pr.s > sEnd + 5) {
          reachedEnd = true;
          break;
        }
      }

      expect(reachedEnd).toBe(true);
      // Passou pelo meio invertido (roll >= Math.PI)
      expect(maxRoll).toBeGreaterThanOrEqual(Math.PI);
      // Ao sair do saca-rolhas, roll é removido
      expect(kart.roll).toBeUndefined();
    });
  });
});
