import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "../data/avatar";
import { RACE } from "../race/balance";
import { DEFAULT_CHAIR } from "../race/chair";
import { buildRacePrivate, buildRaceSnapshot, createRace, getRaceResults, respawnRequest, setKartInput, stepRace } from "../race/match";
import { respawnAt } from "../race/kart";
import { deltaS, pointAt, progressOf, rampStart, TRACK, TRACKS } from "../race/track";
import { stepRaceBot } from "../race/bots";
import { collideKarts, newKart as newKartAt } from "../race/kart";
import { pilot } from "./race-pilot";

const DT = 1000 / 30;

function race(n: number, bots: boolean, laps?: number) {
  return createRace({
    seed: 11,
    laps,
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, avatar: DEFAULT_AVATAR, chair: DEFAULT_CHAIR, isBot: bots })),
  });
}

describe("partida de corrida", () => {
  it("ninguém anda durante a contagem", () => {
    const r = race(4, false);
    const before = [...r.racers.values()].map((x) => ({ ...x.kart.pos }));
    for (const id of r.racers.keys()) setKartInput(r, id, { steer: 0, throttle: 1, drift: false });
    for (let t = 0; t < RACE.countdownMs - DT; t += DT) stepRace(r, DT);
    expect(r.phase).toBe("countdown");
    expect([...r.racers.values()].map((x) => x.kart.pos)).toEqual(before);
    stepRace(r, DT * 2);
    expect(r.phase).toBe("active");
  });

  it("corrida só com 8 bots termina, com todos na 2ª volta ou adiante", () => {
    const r = race(8, true);
    let t = 0;
    let firstAt: number | null = null;
    while (r.phase !== "finished" && t < 6 * 60000) {
      stepRace(r, DT);
      t += DT;
      if (firstAt === null && r.graceEndsAt !== null) firstAt = r.now;
    }
    expect(r.phase).toBe("finished");
    expect(firstAt).not.toBeNull();
    expect(r.now - firstAt!).toBeLessThanOrEqual(RACE.finishGraceMs + DT);
    const rows = getRaceResults(r);
    for (const row of rows) expect(row.lapsDone).toBeGreaterThanOrEqual(1);
    expect(rows[0].totalMs).not.toBeNull();
    expect(rows.map((x) => x.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const finishers = rows.filter((x) => x.totalMs !== null);
    for (let i = 1; i < finishers.length; i++) expect(finishers[i].totalMs!).toBeGreaterThanOrEqual(finishers[i - 1].totalMs!);
    expect(rows.some((x) => x.itemsUsed > 0)).toBe(true);
  }, 20000);

  it("jogador desconectado não segura o fim da corrida", () => {
    const r = race(3, true, 1);
    const human = r.racers.get("p0")!;
    human.isBot = false;
    human.connected = false;
    let t = 0;
    while (r.phase !== "finished" && t < 3 * 60000) {
      stepRace(r, DT);
      t += DT;
    }
    expect(r.phase).toBe("finished");
    expect(r.graceEndsAt === null || r.now < r.graceEndsAt).toBe(true);
    expect(getRaceResults(r).at(-1)!.id).toBe("p0");
  });

  it("R reposiciona no último checkpoint, parado por 2 s", () => {
    const r = race(2, false);
    for (let t = 0; t < RACE.countdownMs + 100; t += DT) stepRace(r, DT);
    const p = r.racers.get("p0")!;
    setKartInput(r, "p0", { steer: 0, throttle: 1, drift: false });
    for (let t = 0; t < 3000; t += DT) stepRace(r, DT);
    expect(p.lap.cpCount).toBeGreaterThanOrEqual(2);
    const cpS = r.cps[(p.lap.cpCount - 1) % r.cps.length];
    respawnRequest(r, "p0");
    stepRace(r, DT);
    expect(Math.abs(progressOf(TRACK, p.kart.pos).s - cpS)).toBeLessThan(1.5);
    const pos = { ...p.kart.pos };
    for (let t = 0; t < 1500; t += DT) stepRace(r, DT);
    expect(p.kart.pos).toEqual(pos);
    for (let t = 0; t < 1000; t += DT) stepRace(r, DT);
    expect(p.kart.pos).not.toEqual(pos);
  });

  it("dentro do atalho: andar certo não é contramão e R volta no atalho", () => {
    const r = race(2, false);
    for (let t = 0; t < RACE.countdownMs + DT; t += DT) stepRace(r, DT);
    const p = r.racers.get("p0")!;
    const b = TRACK.branches[0];
    // percorre o atalho até a metade, passando pelos checkpoints da principal
    const span = deltaS(TRACK, b.sFrom, b.sTo);
    p.kart = { ...p.kart, ...respawnAt(TRACK, b.sFrom - 4, -1), path: -1, speed: 0 };
    p.lap = { ...p.lap, lastS: b.sFrom - 4 };
    for (let i = 0; i < 90 && deltaS(TRACK, b.sFrom + span * 0.6, progressOf(TRACK, p.kart.pos, p.kart.path).s) < 0; i++) {
      setKartInput(r, "p0", pilot(TRACK, p.kart, 0));
      stepRace(r, DT);
      expect(p.wrongMs).toBe(0);
    }
    expect(p.kart.path).toBe(0);
    respawnRequest(r, "p0");
    stepRace(r, DT);
    expect(p.kart.path).toBe(0);
    expect(progressOf(TRACK, p.kart.pos, 0).path).toBe(0);
  });

  it("bots pegam o atalho conforme o nível e não ficam presos nele", () => {
    const b = TRACK.branches[0];
    const share = (botLevel: "easy" | "hard") => {
      let used = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const r = createRace({ seed, botLevel, players: [{ id: "b", name: "B", avatar: DEFAULT_AVATAR, chair: DEFAULT_CHAIR, isBot: true }] });
        const bot = r.racers.get("b")!;
        let took = false;
        for (let i = 0; i < 1200 && bot.lap.cpCount < 1 + Math.ceil((b.sTo + 10) / RACE.checkpointEvery); i++) {
          stepRace(r, DT);
          if (bot.kart.path === 0) {
            // no miolo do atalho (as bocas se confundem com a curva da principal)
            if (deltaS(TRACK, b.sFrom, bot.lap.lastS) > deltaS(TRACK, b.sFrom, b.sTo) / 2) took = true;
            expect(bot.kart.frozenUntil, `semente ${seed}`).toBeLessThanOrEqual(r.countdownEndsAt);
          }
        }
        if (took) used++;
      }
      return used / 200;
    };
    const hard = share("hard");
    expect(hard).toBeGreaterThan(0.6);
    expect(hard).toBeLessThan(0.9);
    expect(share("easy")).toBeLessThan(0.25);
  });

  it("comandos numerados: um por tick, na ordem, e o privado confirma o último aplicado", () => {
    const r = race(2, false);
    for (let t = 0; t < RACE.countdownMs + DT; t += DT) stepRace(r, DT);
    const p = r.racers.get("p0")!;
    setKartInput(r, "p0", { steer: 0, throttle: 1, drift: false }, 1);
    setKartInput(r, "p0", { steer: 1, throttle: 1, drift: false }, 2);
    setKartInput(r, "p0", { steer: -1, throttle: 0, drift: false }, 3);
    stepRace(r, DT);
    expect(buildRacePrivate(r, "p0")!.ackSeq).toBe(1);
    expect(p.input.steer).toBe(0);
    stepRace(r, DT);
    expect(buildRacePrivate(r, "p0")!.ackSeq).toBe(2);
    expect(p.input.steer).toBe(1);
    stepRace(r, DT);
    expect(buildRacePrivate(r, "p0")!.ackSeq).toBe(3);
    // sem comandos novos repete o último por pouco tempo e depois solta tudo
    stepRace(r, DT);
    expect(p.input.steer).toBe(-1);
    for (let i = 0; i < 10; i++) stepRace(r, DT);
    expect(p.input).toEqual({ steer: 0, throttle: 0, drift: false });
  });

  it("um passo da cadeira por comando: sem comando novo a cadeira espera, sem andar sozinha", () => {
    const r = race(2, false);
    for (let t = 0; t < RACE.countdownMs + DT; t += DT) stepRace(r, DT);
    const p = r.racers.get("p0")!;
    for (let i = 1; i <= 20; i++) {
      setKartInput(r, "p0", { steer: 0, throttle: 1, drift: false }, i);
      stepRace(r, DT);
    }
    const pos = { ...p.kart.pos };
    stepRace(r, DT);
    stepRace(r, DT);
    expect(p.kart.pos).toEqual(pos);
    // o comando que chega atrasado é aplicado e o seguinte também, recuperando o atraso
    setKartInput(r, "p0", { steer: 0, throttle: 1, drift: false }, 21);
    setKartInput(r, "p0", { steer: 0, throttle: 1, drift: false }, 22);
    stepRace(r, DT);
    expect(p.ackSeq).toBe(22);
  });

  it("mandar comandos rápido demais não dá passos extras", () => {
    const r = race(2, false);
    for (let t = 0; t < RACE.countdownMs + DT; t += DT) stepRace(r, DT);
    const fast = r.racers.get("p0")!;
    const fair = r.racers.get("p1")!;
    const start = { fast: fast.progress, fair: fair.progress };
    let seq = 0;
    for (let i = 0; i < 40; i++) {
      for (let j = 0; j < 3; j++) setKartInput(r, "p0", { steer: 0, throttle: 1, drift: false }, ++seq);
      setKartInput(r, "p1", { steer: 0, throttle: 1, drift: false }, i + 1);
      stepRace(r, DT);
    }
    const gained = fast.progress - start.fast - (fair.progress - start.fair);
    expect(gained).toBeLessThan(2);
  });

  it("entrada inválida vira zero e snapshot não expõe item dos outros", () => {
    const r = race(2, false);
    setKartInput(r, "p0", { steer: NaN, throttle: 5, drift: true });
    expect(r.racers.get("p0")!.input).toEqual({ steer: 0, throttle: 1, drift: true });
    r.racers.get("p1")!.item = "grampeador";
    const s = JSON.stringify(buildRaceSnapshot(r));
    expect(s).not.toContain("grampeador");
    expect(buildRacePrivate(r, "p1")!.item).toBe("grampeador");
    expect(buildRacePrivate(r, "ninguem")).toBeNull();
  });

  it("coleta de xícaras de café na pista incrementa o contador e entra em recarga", () => {
    const r = race(2, false);
    for (let t = 0; t < RACE.countdownMs + DT; t += DT) stepRace(r, DT);
    const p = r.racers.get("p0")!;
    expect(r.cups.length).toBeGreaterThan(0);
    // Coloca a cadeira exatamente sobre a primeira xícara
    p.kart.pos = { ...r.cups[0].pos };
    stepRace(r, DT);
    expect(p.kart.cups).toBe(1);
    expect(r.cups[0].readyAt).toBeGreaterThan(r.now);
    expect(r.events.some((e) => e.type === "cup" && e.id === "p0")).toBe(true);
  });

  it("vácuo dinâmico (slipstream) atrás de outro kart por tempo suficiente aciona turbo de vácuo", () => {
    const r = race(2, false);
    for (let t = 0; t < RACE.countdownMs + DT; t += DT) stepRace(r, DT);
    const lead = r.racers.get("p1")!;
    const follow = r.racers.get("p0")!;
    const at = pointAt(TRACK, 10);
    lead.kart.pos = { ...at.pos };
    lead.kart.heading = at.heading;
    lead.kart.speed = 10;

    // Follower fica 4 metros logo atrás do líder na mesma direção
    follow.kart.pos = {
      x: at.pos.x - Math.sin(at.heading) * 4,
      z: at.pos.z - Math.cos(at.heading) * 4,
    };
    follow.kart.heading = at.heading;
    follow.kart.speed = 10;

    // Simula tempo de vácuo até carregar
    setKartInput(r, "p0", { steer: 0, throttle: 1, drift: false });
    setKartInput(r, "p1", { steer: 0, throttle: 1, drift: false });
    for (let t = 0; t < RACE.slipstreamChargeMs + 200; t += DT) {
      follow.kart.pos = {
        x: lead.kart.pos.x - Math.sin(lead.kart.heading) * 4,
        z: lead.kart.pos.z - Math.cos(lead.kart.heading) * 4,
      };
      follow.kart.heading = lead.kart.heading;
      lead.kart.speed = 10;
      follow.kart.speed = 10;
      stepRace(r, DT);
    }
    expect(r.events.some((e) => e.type === "draft" && e.id === "p0")).toBe(true);
    expect(r.events.some((e) => e.type === "boost" && e.id === "p0" && e.level === "draft")).toBe(true);
    expect(follow.kart.boostUntil).toBeGreaterThan(r.now);
  });
});

describe("rampas na partida", () => {
  function estac(isBot = false) {
    const r = createRace({ seed: 3, track: "estacionamento", timeTrial: !isBot, players: [{ id: "a", name: "A", avatar: DEFAULT_AVATAR, chair: DEFAULT_CHAIR, isBot }] });
    r.now = RACE.countdownMs;
    r.phase = "active";
    return r;
  }

  it("queda no vão volta antes da rampa, com espaço para embalar, parada como na reposição, e suja a volta", () => {
    const r = estac();
    const a = r.racers.get("a")!;
    const T = r.track;
    const ramp = T.ramps[0];
    const b = T.branches[0];
    const k = b.points[Math.round((ramp.gap!.sFrom + ramp.gap!.sTo) / 2 / b.spacing)];
    a.kart = { ...newKartAt(k, 0), path: 0, fell: true, y: RACE.fallDepth + 0.01, vy: -5 };
    a.rec.startedAt = r.now - 1000;
    stepRace(r, DT);
    const start = rampStart(T, ramp);
    expect(a.kart.pos).toEqual(start.pos);
    expect(a.kart.path ?? -1).toBe(start.path);
    // dá para chegar de novo na rampa acima da velocidade mínima
    expect(deltaS(T, progressOf(T, start.pos, start.path).s, T.branches[0].sFrom)).toBeGreaterThan(10);
    expect(a.kart.fell).toBeFalsy();
    expect(a.kart.y ?? 0).toBe(0);
    expect(a.kart.frozenUntil).toBe(r.now + RACE.respawnPenaltyMs);
    expect(a.rec.dirty).toBe(true);
    expect(r.events.some((e) => e.type === "fall" && e.id === "a")).toBe(true);
  });

  it("duas cadeiras com mais de 1 m de altura de diferença não colidem", () => {
    const a = { ...newKartAt({ x: 0, z: 0 }, 0), y: 2, air: true };
    const b = newKartAt({ x: 0.3, z: 0 }, 0);
    expect(collideKarts(a, b)).toBe(false);
    expect(collideKarts({ ...a, y: 0.5 }, b)).toBe(true);
  });

  it("bot só toma o atalho com vão se estiver rápido para atravessar", () => {
    const route = (speed: number) => {
      const r = estac(true);
      r.botLevel = "hard";
      r.rng = () => 0;
      const a = r.racers.get("a")!;
      const at = pointAt(r.track, r.track.branches[0].sFrom - 15);
      a.kart = { ...newKartAt(at.pos, at.heading), speed };
      a.lap = { ...a.lap, lastS: progressOf(r.track, at.pos).s };
      stepRaceBot(r, a, DT);
      return a.bot!.route;
    };
    expect(route(RACE.minLaunchSpeed + 3)).toBe(-1);
    expect(route(RACE.minLaunchSpeed + 6)).toBe(0);
  });

  it("Corporativo: a rampa fica na principal, longe da boca do atalho", () => {
    const T = TRACKS.corporativo;
    expect(deltaS(T, T.ramps[0].sTo, T.branches[0].sFrom)).toBeGreaterThan(20);
  });
});