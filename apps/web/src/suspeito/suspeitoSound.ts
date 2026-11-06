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
