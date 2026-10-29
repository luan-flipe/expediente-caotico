import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "../data/avatar";
import { RACE } from "../race/balance";
import { DEFAULT_CHAIR } from "../race/chair";
import { giveItem } from "../race/items";
import { buildRacePrivate, buildRaceSnapshot, createRace, endTraining, getRaceResults, queueItemUse, respawnRequest, setKartInput, stepRace } from "../race/match";
import { pilot } from "./race-pilot";
import { pointAt, TRACK } from "../race/track";

const DT = 1000 / 30;
const L = TRACK.length;

function trial(n = 1, timeTrial = true) {
  return createRace({
    seed: 5,
    timeTrial,
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, avatar: DEFAULT_AVATAR, chair: DEFAULT_CHAIR, isBot: false })),
  });
}

function startActive(r: ReturnType<typeof trial>) {
  while (r.phase === "countdown") stepRace(r, DT);
}

/** Leva a cadeira por teleporte, 1 m por tick, de s0 até s0 + dist. Devolve o s final. */
function drive(r: ReturnType<typeof trial>, id: string, s0: number, dist: number): number {
  const racer = r.racers.get(id)!;
  const steps = Math.round(dist);
  for (let i = 1; i <= steps; i++) {
    const at = pointAt(TRACK, (((s0 + i) % L) + L) % L);
    racer.kart.pos = at.pos;
    racer.kart.heading = at.heading;
    stepRace(r, DT);
  }
  return (s0 + steps) % L;
}

describe("contra o relógio (shared)", () => {
  it("não tem caixas, bots, hazards nem limite de voltas", () => {
    const r = createRace({
      seed: 5,
      timeTrial: true,
      players: [
        { id: "a", name: "A", avatar: DEFAULT_AVATAR, chair: DEFAULT_CHAIR, isBot: false },
        { id: "bot", name: "B", avatar: DEFAULT_AVATAR, chair: DEFAULT_CHAIR, isBot: true },
      ],
    });
    expect(r.timeTrial).toBe(true);
    expect(r.boxes).toHaveLength(0);
    expect([...r.racers.keys()]).toEqual(["a"]);
    expect(r.laps).toBeGreaterThan(1000);
    const snap = buildRaceSnapshot(r);
    expect(snap.timeTrial).toBe(true);
    expect(snap.boxes).toEqual([]);
    expect(buildRaceSnapshot(trial(1, false)).timeTrial).toBe(false);
  });

  it("itens são ignorados", () => {
    const r = trial();
    startActive(r);
    const p = r.racers.get("p0")!;
    giveItem(p, "grampeador");
    queueItemUse(r, "p0");
    stepRace(r, DT);
    expect(p.item).toBe("grampeador");
    expect(r.hazards).toHaveLength(0);
    expect(r.events.some((e) => e.type === "item")).toBe(false);
  });

  it("duas cadeiras sobrepostas não se empurram (na corrida normal elas se separam)", () => {
    const place = (r: ReturnType<typeof trial>) => {
      startActive(r);
      const [a, b] = [...r.racers.values()];
      b.kart.pos = { ...a.kart.pos };
      stepRace(r, DT);
      return Math.hypot(a.kart.pos.x - b.kart.pos.x, a.kart.pos.z - b.kart.pos.z);
    };
    expect(place(trial(2, false))).toBeGreaterThan(0.5);
    expect(place(trial(2, true))).toBeLessThan(1e-6);
  });

  it("volta completa vira entrada em completedLaps, com amostras de tempo crescente", () => {
    const r = trial();
    startActive(r);
    const start = r.racers.get("p0")!.lap.lastS;
    // grid até a linha não conta; depois uma volta inteira
    let s = drive(r, "p0", start, L - start + 2);
    expect(r.completedLaps).toHaveLength(0);
    s = drive(r, "p0", s, L + 2);
    expect(r.completedLaps).toHaveLength(1);
    const lap = r.completedLaps[0];
    expect(lap.id).toBe("p0");
    expect(lap.ms).toBeGreaterThan(0);
    expect(lap.ghost.length).toBeGreaterThan(10);
    expect(lap.ghost[0][0]).toBe(0);
    for (let i = 1; i < lap.ghost.length; i++) expect(lap.ghost[i][0]).toBeGreaterThan(lap.ghost[i - 1][0]);
    expect(lap.ghost.at(-1)![0]).toBe(lap.ms);
    for (const smp of lap.ghost) {
      // 4 números no chão; o 5º (altura) só aparece em cima da rampa
      expect(smp.length === 4 || (smp.length === 5 && smp[4]! > 0)).toBe(true);
      expect(Number.isInteger(smp[0])).toBe(true);
      expect(Math.round(smp[1] * 100) / 100).toBe(smp[1]);
    }
    expect(buildRacePrivate(r, "p0")!.sessionBestMs).toBe(lap.ms);
    // a segunda volta também entra, com amostras novas
    drive(r, "p0", s, L);
    expect(r.completedLaps).toHaveLength(2);
    expect(r.completedLaps[1].ghost[0][0]).toBe(0);
  });

  it("reposição (R) no meio da volta suja a volta; a seguinte volta limpa entra", () => {
    const r = trial();
    startActive(r);
    const start = r.racers.get("p0")!.lap.lastS;
    const s0 = drive(r, "p0", start, L - start + 2);
    drive(r, "p0", s0, 80);
    respawnRequest(r, "p0");
    stepRace(r, DT);
    const racer = r.racers.get("p0")!;
    // depois do R a cadeira segue de onde foi reposta; terminar a volta suja não gera entrada
    const s = drive(r, "p0", racer.lap.lastS, L);
    expect(r.completedLaps).toHaveLength(0);
    expect(buildRacePrivate(r, "p0")!.sessionBestMs).toBeNull();
    drive(r, "p0", s, L);
    expect(r.completedLaps).toHaveLength(1);
  });

  it("corrida normal também grava voltas dos humanos (bots não)", () => {
    const r = createRace({
      seed: 5,
      laps: 2,
      players: [
        { id: "h", name: "H", avatar: DEFAULT_AVATAR, chair: DEFAULT_CHAIR, isBot: false },
        { id: "bot", name: "B", avatar: DEFAULT_AVATAR, chair: DEFAULT_CHAIR, isBot: true },
      ],
    });
    startActive(r);
    const start = r.racers.get("h")!.lap.lastS;
    const s = drive(r, "h", start, L - start + 2);
    drive(r, "h", s, 2 * L);
    // a última volta (a que termina a corrida) também vale
    expect(r.racers.get("h")!.lap.finishedAt).not.toBeNull();
    expect(r.completedLaps.map((l) => l.id)).toEqual(["h", "h"]);
  });

  it("endTraining encerra e a lista de resultados ordena pela melhor volta da sessão", () => {
    const r = trial(3);
    startActive(r);
    const starts = new Map([...r.racers.values()].map((x) => [x.id, x.lap.lastS]));
    // p0 não fecha volta; p1 fecha uma; p2 fecha uma mais lenta (anda parado alguns ticks)
    for (const id of ["p1", "p2"]) {
      const s = drive(r, id, starts.get(id)!, L - starts.get(id)! + 2);
      if (id === "p2") for (let i = 0; i < 30; i++) stepRace(r, DT);
      drive(r, id, s, L + 2);
    }
    expect(r.phase).toBe("active");
    endTraining(r);
    expect(r.phase).toBe("finished");
    const rows = getRaceResults(r);
    expect(rows.map((x) => x.id)).toEqual(["p1", "p2", "p0"]);
    expect(rows.map((x) => x.place)).toEqual([1, 2, 3]);
    expect(rows.every((x) => x.totalMs === null)).toBe(true);
    expect(rows[0].bestLapMs).toBe(r.completedLaps.find((l) => l.id === "p1")!.ms);
    expect(rows[2].bestLapMs).toBeNull();
    stepRace(r, DT);
    expect(r.phase).toBe("finished");
  });

  it("encerra sozinho depois de 20 minutos de fase ativa", () => {
    expect(RACE.trainingMaxMs).toBe(20 * 60000);
    const r = trial();
    startActive(r);
    stepRace(r, RACE.trainingMaxMs - 2 * DT);
    expect(r.phase).toBe("active");
    stepRace(r, 3 * DT);
    expect(r.phase).toBe("finished");
  });

  it("o snapshot e o estado privado não carregam amostras de fantasma", () => {
    const r = trial();
    startActive(r);
    const start = r.racers.get("p0")!.lap.lastS;
    drive(r, "p0", start, L - start + 20);
    const json = JSON.stringify(buildRaceSnapshot(r)) + JSON.stringify(buildRacePrivate(r, "p0"));
    expect(json).not.toContain("completedLaps");
    expect(json).not.toContain("ghost");
    expect(json).not.toContain("samples");
  });
});

describe("altura no fantasma e no snapshot", () => {
  it("volta com salto grava amostras com altura; snapshot e privado mostram o voo", () => {
    const r = trial();
    startActive(r);
    const p = r.racers.get("p0")!;
    let sawAir = false;
    let sawChute = false;
    let privAir = false;
    for (let i = 0; i < 3000 && r.completedLaps.length === 0; i++) {
      setKartInput(r, "p0", pilot(r.track, p.kart, -1));
      stepRace(r, DT);
      const k = buildRaceSnapshot(r).karts[0];
      if (k.flags.includes("air")) {
        sawAir = true;
        expect(k.y).toBeGreaterThan(0);
      }
      if (k.flags.includes("chute")) sawChute = true;
      const pk = buildRacePrivate(r, "p0")!.kart;
      if (pk.air) privAir = privAir || (pk.y ?? 0) > 0;
    }
    expect(sawAir).toBe(true);
    expect(sawChute).toBe(true);
    expect(privAir).toBe(true);
    const ghost = r.completedLaps[0].ghost;
    expect(ghost.some((g) => (g[4] ?? 0) > 0)).toBe(true);
    // no chão a amostra continua com 4 números
    expect(ghost[0]).toHaveLength(4);
  });
});