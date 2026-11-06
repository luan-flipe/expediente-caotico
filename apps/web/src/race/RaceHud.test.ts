// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, it, vi } from "vitest";
import type { RacePrivate, RaceSnapshot } from "@ec/shared";

vi.mock("../sound", () => ({ playCountdownBeep: () => undefined }));

import { setState } from "../store";
import { RaceHud } from "./RaceHud";

const snap = (t: number): RaceSnapshot => ({
  t,
  phase: "countdown",
  countdownMs: 2500,
  elapsedMs: 0,
  graceMs: null,
  laps: 3,
  timeTrial: false,
  itemsOff: false,
  karts: [],
  boxes: [],
  hazards: [],
  events: [],
});

const me = { item: null, charges: 0, lap: 1, place: 1, total: 4, lapMs: 0, lastLapMs: null, bestLapMs: null, sessionBestMs: null, raceMs: 0, blindMs: 0, shieldMs: 0, wrongWay: false, finished: false, ackSeq: 0 } as unknown as RacePrivate;

describe("RaceHud", () => {
  afterEach(() => setState({ rsnap: null, rme: null }));

  it("aguenta uma rajada de snapshots na contagem sem estourar a profundidade de atualizações do React", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    root.render(createElement(RaceHud, { myId: "eu" }));
    await new Promise((r) => setTimeout(r, 20));

    // a aba trava um instante e o navegador entrega os snapshots acumulados um atrás do outro
    for (let i = 0; i < 200; i++) {
      setState({ rsnap: snap(i), rme: me });
      await Promise.resolve();
    }
    await new Promise((r) => setTimeout(r, 20));
    root.unmount();
  });
});
