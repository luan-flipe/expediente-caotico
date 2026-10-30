/**
 * Rival do Contra o relógio: a volta salva logo à frente da sua melhor (a que você precisa passar).
 * Fica de fora a sua própria volta e a do recordista, que já têm fantasma. Sem volta sua ainda, não há rival.
 */
export function pickRival(laps: { id: string; ms: number }[], myId: string | null, myMs: number | null, recordMs: number | null): string | null {
  if (myMs === null) return null;
  let best: { id: string; ms: number } | null = null;
  for (const l of laps) {
    if (l.id === myId || l.ms >= myMs || l.ms === recordMs) continue;
    if (!best || l.ms > best.ms) best = l;
  }
  return best?.id ?? null;
}
