import { OFFICE_MAP } from "../data/map";
import type { Match, PlayerSim } from "../types";
import { segmentBlocked } from "./collision";
import { hasStatus } from "./combat";
import { chooseEvolution } from "./progression";

/** IA simples dos "estagiários": persegue, atira com erro, usa habilidades, escolhe evolução. */
export function stepBot(m: Match, p: PlayerSim): void {
  if (!p.alive) {
    p.input = { mx: 0, mz: 0, yaw: p.yaw, fire: false };
    return;
  }
  const brain = (p.bot ??= { strafe: 1, nextThink: 0, targetId: null });
  const rng = m.rng;

  if (p.options && m.now > p.optionsExpireAt - 6500) {
    chooseEvolution(m, p.id, p.options[Math.floor(rng() * p.options.length)].id);
  }

  if (m.now >= brain.nextThink) {
    brain.nextThink = m.now + 350 + rng() * 500;
    brain.strafe = rng() < 0.5 ? -1 : 1;
    let best: PlayerSim | null = null;
    let bestD = 30;
    for (const e of m.players.values()) {
      if (e.id === p.id || !e.alive) continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (d < bestD && !segmentBlocked(p.pos, e.pos, OFFICE_MAP.boxes)) {
        best = e;
        bestD = d;
      }
    }
    brain.targetId = best?.id ?? null;
  }

  const target = brain.targetId ? m.players.get(brain.targetId) : undefined;
  let gx = m.objective.x - p.pos.x;
  let gz = m.objective.z - p.pos.z;
  let fire = false;
  let yaw = Math.atan2(gx, gz);

  if (target?.alive) {
    const dx = target.pos.x - p.pos.x;
    const dz = target.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    const blind = hasStatus(p, "blind", m.now) ? 3 : 1;
    yaw = Math.atan2(dx, dz) + (rng() - 0.5) * 0.24 * blind;
    const forward = d > 9 ? 1 : d < 4 ? -1 : 0;
    gx = (dx / d) * forward + (-dz / d) * brain.strafe * 0.8;
    gz = (dz / d) * forward + (dx / d) * brain.strafe * 0.8;
    fire = d < 22;
    if (rng() < 0.02 && p.abilities.length > 0) {
      const slot = Math.floor(rng() * p.abilities.length);
      if (m.now >= p.abilities[slot].readyAt) p.actions.push({ kind: "ability", slot, yaw, dist: d });
    }
    if (p.hp < 40 && rng() < 0.01) p.actions.push({ kind: "dodge", yaw });
  } else if (Math.hypot(gx, gz) < 2) {
    gx = brain.strafe;
    gz = 0;
  }

  const len = Math.hypot(gx, gz) || 1;
  p.input = { mx: gx / len, mz: gz / len, yaw, fire };
}
