/** Aleatório determinístico (mulberry32): a torcida nasce igual em todo cliente. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Anel das arquibancadas do mapa (elipse medida nos limites do .glb, em metros). */
export const STANDS = { a: 108, b: 89, sMin: 0.985, sMax: 1.12 } as const;
export const MAX_CROWD = 1500;
/** Distância mínima entre torcedores. */
export const SPACING = 0.95;

export interface Spot {
  x: number;
  z: number;
  /** Giro em y para olhar o centro do campo. */
  yaw: number;
}

/** Ponto candidato no anel, com mais densidade perto das cabeceiras (para onde a câmera mais olha). */
export function ringCandidate(r: () => number): Spot {
  for (;;) {
    const th = r() * Math.PI * 2;
    const c = Math.cos(th);
    if (r() > 0.4 + 0.6 * c * c) continue;
    const s = STANDS.sMin + r() * (STANDS.sMax - STANDS.sMin);
    const x = STANDS.a * s * c;
    const z = STANDS.b * s * Math.sin(th);
    return { x, z, yaw: Math.atan2(-x, -z) };
  }
}

export function cellKey(x: number, z: number): string {
  return `${Math.round(x / SPACING)},${Math.round(z / SPACING)}`;
}

/** Energia da festa (1 a 0) `since` segundos depois do gatilho; some em `dur`. */
export function crowdEnergy(since: number, dur = 3): number {
  if (since < 0 || since >= dur) return 0;
  const k = since / dur;
  return k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
}

/** Altura do pulo de um torcedor: balanço leve sempre, pulo forte conforme a energia. */
export function bounce(t: number, phase: number, energy: number): number {
  const idle = 0.025 * (1 + Math.sin(t * 1.7 + phase));
  const jump = energy * 0.6 * Math.abs(Math.sin(t * 7.5 + phase * 0.6));
  return idle + jump;
}

/** Torcedores desenhados por qualidade gráfica (dos MAX_CROWD assentos achados). */
export const CROWD_ALTA = 900;
export const CROWD_LEVE = 400;

/** Quantidade de torcedores conforme a qualidade gráfica. */
export function crowdCount(total: number, quality: string): number {
  return Math.min(total, quality === "leve" ? CROWD_LEVE : CROWD_ALTA);
}
