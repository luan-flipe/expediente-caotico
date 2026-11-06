import { getSettings } from "../settings";

let audioCtx: AudioContext | null = null;

function getCtx(): { ctx: AudioContext; vol: number } | null {
  if (typeof window === "undefined") return null;
  const s = getSettings();
  const vol = s.volume.master * s.volume.effects;
  if (vol <= 0.001) return null;

  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return { ctx: audioCtx, vol };
}

/** Acorde dramático na revelação de função secreta (Sabotador vs Colaborador) */
export function playRoleRevealSound(isSabotador: boolean): void {
  const c = getCtx();
  if (!c) return;
  const { ctx, vol } = c;
  const t = ctx.currentTime;

  if (isSabotador) {
    // Acorde tenso e grave de suspense (estilo Impostor)
    const freqs = [110, 130.81, 155.56, 207.65];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = idx === 0 ? "sawtooth" : "triangle";
      osc.frequency.setValueAtTime(f * 1.05, t + idx * 0.04);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.9);
      g.gain.setValueAtTime(0.0001, t + idx * 0.04);
      g.gain.exponentialRampToValueAtTime(0.14 * vol, t + idx * 0.04 + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t + idx * 0.04);
      osc.stop(t + 1.35);
    });
  } else {
    // Acorde limpo e corporativo (C5 - E5 - G5 - B5)
    const freqs = [523.25, 659.25, 783.99, 987.77];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      const start = t + idx * 0.06;
      osc.frequency.setValueAtTime(f, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.14 * vol, start + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.75);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.8);
    });
  }
}

/** Efeito sonoro de eliminação (golpe + impacto grave) */
export function playKillSound(): void {
  const c = getCtx();
  if (!c) return;
  const { ctx, vol } = c;
  const t = ctx.currentTime;

  // Corte rápido agudo->médio
  const slash = ctx.createOscillator();
  const sg = ctx.createGain();
  slash.type = "sawtooth";
  slash.frequency.setValueAtTime(920, t);
  slash.frequency.exponentialRampToValueAtTime(140, t + 0.14);
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.28 * vol, t + 0.015);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  slash.connect(sg);
  sg.connect(ctx.destination);
  slash.start(t);
  slash.stop(t + 0.18);

  // Impacto sub-grave
  const thud = ctx.createOscillator();
  const tg = ctx.createGain();
  thud.type = "sine";
  thud.frequency.setValueAtTime(150, t + 0.04);
  thud.frequency.exponentialRampToValueAtTime(42, t + 0.35);
  tg.gain.setValueAtTime(0.0001, t + 0.04);
  tg.gain.exponentialRampToValueAtTime(0.35 * vol, t + 0.06);
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
  thud.connect(tg);
  tg.connect(ctx.destination);
  thud.start(t + 0.04);
  thud.stop(t + 0.4);
}

/** Vinheta sonora dramática quando VOCÊ é eliminado pelo Sabotador (estilo Among Us) */
export function playEliminationCutsceneSound(): void {
  const c = getCtx();
  if (!c) return;
  const { ctx, vol } = c;
  const t = ctx.currentTime;

  // 1. Stinger grave de susto e tensão (acorde dissonante na abertura das barras)
  const stingerFreqs = [82.41, 98.0, 116.54, 155.56];
  stingerFreqs.forEach((f, idx) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = idx % 2 === 0 ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(f * 1.08, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.94, t + 1.15);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.3);
  });

  // 2. Golpe / Corte rápido em t + 0.42s
  const strikeTime = t + 0.42;
  const slash = ctx.createOscillator();
  const sg = ctx.createGain();
  slash.type = "sawtooth";
  slash.frequency.setValueAtTime(1180, strikeTime);
  slash.frequency.exponentialRampToValueAtTime(110, strikeTime + 0.18);
  sg.gain.setValueAtTime(0.0001, strikeTime);
  sg.gain.exponentialRampToValueAtTime(0.32 * vol, strikeTime + 0.015);
  sg.gain.exponentialRampToValueAtTime(0.0001, strikeTime + 0.22);
  slash.connect(sg);
  sg.connect(ctx.destination);
  slash.start(strikeTime);
  slash.stop(strikeTime + 0.24);

  // 3. Impacto pesado sub-grave em t + 0.46s
  const thud = ctx.createOscillator();
  const tg = ctx.createGain();
  thud.type = "sine";
  thud.frequency.setValueAtTime(165, strikeTime + 0.03);
  thud.frequency.exponentialRampToValueAtTime(36, strikeTime + 0.48);
  tg.gain.setValueAtTime(0.0001, strikeTime + 0.03);
  tg.gain.exponentialRampToValueAtTime(0.42 * vol, strikeTime + 0.06);
  tg.gain.exponentialRampToValueAtTime(0.0001, strikeTime + 0.52);
  thud.connect(tg);
  tg.connect(ctx.destination);
  thud.start(strikeTime + 0.03);
  thud.stop(strikeTime + 0.55);

  // 4. Eco dramático descendente após a queda do boneco (t + 0.85s)
  const echo = ctx.createOscillator();
  const eg = ctx.createGain();
  echo.type = "triangle";
  echo.frequency.setValueAtTime(220, t + 0.85);
  echo.frequency.exponentialRampToValueAtTime(65.41, t + 2.1);
  eg.gain.setValueAtTime(0.0001, t + 0.85);
  eg.gain.exponentialRampToValueAtTime(0.18 * vol, t + 0.92);
  eg.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  echo.connect(eg);
  eg.connect(ctx.destination);
  echo.start(t + 0.85);
  echo.stop(t + 2.25);
}

/** Alarme de corpo reportado ou reunião de emergência convocada */
export function playReportAlarmSound(isEmergency = false): void {
  const c = getCtx();
  if (!c) return;
  const { ctx, vol } = c;
  const t = ctx.currentTime;

  const notes = isEmergency ? [784, 987.77, 784, 1174.66] : [880, 622.25, 880, 587.33];
  notes.forEach((f, idx) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    const start = t + idx * 0.12;
    const dur = idx === notes.length - 1 ? 0.35 : 0.1;
    osc.frequency.setValueAtTime(f, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.18 * vol, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  });
}

/** Sirene de sabotagem iniciada ou pulso de sabotagem crítica */
export function playSabotageBeepSound(critical = false): void {
  const c = getCtx();
  if (!c) return;
  const { ctx, vol } = c;
  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(critical ? 440 : 330, t);
  osc.frequency.linearRampToValueAtTime(critical ? 293.66 : 246.94, t + 0.24);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime((critical ? 0.16 : 0.14) * vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.28);
}

/** Clique/chime curto de interação ou avanço de etapa de tarefa */
export function playTaskStepSound(stepIndex = 0): void {
  const c = getCtx();
  if (!c) return;
  const { ctx, vol } = c;
  const t = ctx.currentTime;

  const baseFreq = 620 + Math.min(4, Math.max(0, stepIndex)) * 90;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(baseFreq, t);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.32, t + 0.08);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16 * vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.12);
}

/** Fanfarra curta de conclusão de tarefa */
export function playTaskCompleteSound(): void {
  const c = getCtx();
  if (!c) return;
  const { ctx, vol } = c;
  const t = ctx.currentTime;

  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, idx) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    const start = t + idx * 0.065;
    const dur = idx === notes.length - 1 ? 0.32 : 0.11;
    osc.frequency.setValueAtTime(f, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.2 * vol, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  });
}

/** Som de erro em minijogo */
export function playTaskErrorSound(): void {
  const c = getCtx();
  if (!c) return;
  const { ctx, vol } = c;
  const t = ctx.currentTime;

  [220, 185].forEach((f, idx) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    const start = t + idx * 0.09;
    osc.frequency.setValueAtTime(f, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.14 * vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.14);
  });
}

/** Confirmação de voto na reunião */
export function playVoteCastSound(): void {
  const c = getCtx();
  if (!c) return;
  const { ctx, vol } = c;
  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(440, t);
  osc.frequency.setValueAtTime(660, t + 0.05);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18 * vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.18);
}

/** Fim de partida: arpejo maior subindo na vitória, acorde menor descendo na derrota */
export function playEndGameSound(victory: boolean): void {
  const c = getCtx();
  if (!c) return;
  const { ctx, vol } = c;
  const t = ctx.currentTime + 0.15;

  const notes = victory ? [392, 523.25, 659.25, 783.99, 1046.5] : [329.63, 277.18, 233.08, 196, 146.83];
  notes.forEach((f, idx) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = victory ? "triangle" : "sawtooth";
    const start = t + idx * (victory ? 0.11 : 0.18);
    const last = idx === notes.length - 1;
    const dur = last ? 1.4 : 0.22;
    osc.frequency.setValueAtTime(f, start);
    if (!victory && last) osc.frequency.exponentialRampToValueAtTime(f * 0.94, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime((victory ? 0.18 : 0.1) * vol, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  });
}
