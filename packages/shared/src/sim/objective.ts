import { BALANCE } from "../data/balance";
import { OFFICE_MAP } from "../data/map";
import type { Match } from "../types";
import { grantXp } from "./progression";

export function roomNameAt(x: number, z: number): string {
  const r = OFFICE_MAP.rooms.find((r) => Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2);
  return r?.name ?? "escritório";
}

/** Zona "Reunião Relâmpago": pontua quem está sozinho dentro e troca de sala a cada ciclo. */
export function stepObjective(m: Match, dtMs: number): void {
  const o = m.objective;
  if (m.now >= o.cycleEndsAt) {
    let best: { id: string; ms: number } | null = null;
    for (const p of m.players.values()) {
      if (p.zoneCycleMs > 0 && (!best || p.zoneCycleMs > best.ms)) best = { id: p.id, ms: p.zoneCycleMs };
      p.zoneCycleMs = 0;
    }
    if (best) {
      const p = m.players.get(best.id)!;
      p.score += BALANCE.scoreZoneCycle;
      grantXp(m, p, BALANCE.xpCycle);
      m.events.push({ type: "info", text: `${p.name} dominou a reunião (+${BALANCE.scoreZoneCycle})` });
    }
    o.index = (o.index + 1) % OFFICE_MAP.objectivePoints.length;
    const next = OFFICE_MAP.objectivePoints[o.index];
    o.x = next.x;
    o.z = next.z;
    o.cycleEndsAt += BALANCE.objectiveCycleMs;
    m.events.push({ type: "info", text: `Reunião Relâmpago agora na ${roomNameAt(o.x, o.z)}` });
  }

  const inside = [...m.players.values()].filter((p) => p.alive && Math.hypot(p.pos.x - o.x, p.pos.z - o.z) <= o.radius);
  o.contested = inside.length > 1;
  o.owner = inside.length === 1 ? inside[0].id : null;
  if (!o.owner) return;
  const p = inside[0];
  p.zoneMs += dtMs;
  p.zoneCycleMs += dtMs;
  grantXp(m, p, (BALANCE.xpZonePerSec * dtMs) / 1000);
  while (p.zoneMs >= BALANCE.zoneTickMs) {
    p.zoneMs -= BALANCE.zoneTickMs;
    p.score += BALANCE.scoreZoneTick;
  }
}
