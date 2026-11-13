import { angleLerp } from "./cenaCampo";

/** Uma posição recebida do servidor (t = hora local da chegada). */
export interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  f: number;
}

/** Posição interpolada na hora rt; salto grande (saída, cobrança) vai direto, sem deslizar pelo campo. */
export function sampleAt(buf: Sample[], rt: number): Sample | null {
  if (!buf.length) return null;
  let a = buf[0];
  let c = buf[buf.length - 1];
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i].t <= rt && buf[i + 1].t >= rt) {
      a = buf[i];
      c = buf[i + 1];
      break;
    }
  }
  // salto grande (saída de bola, cobrança, reposição): vai direto, sem deslizar pelo campo
  if (Math.hypot(c.x - a.x, c.z - a.z) > 5 && rt >= a.t) return { ...c, t: rt };
  const k = c.t === a.t ? 1 : Math.max(0, Math.min(1, (rt - a.t) / (c.t - a.t)));
  return { t: rt, x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, z: a.z + (c.z - a.z) * k, f: angleLerp(a.f, c.f, k) };
}
