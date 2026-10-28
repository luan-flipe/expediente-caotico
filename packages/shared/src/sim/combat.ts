import { BALANCE } from "../data/balance";
import type { Match, PlayerSim, StatusKind } from "../types";
import { grantXp } from "./progression";
import { handleDeath } from "./scoring";

export function isInvulnerable(p: PlayerSim, now: number): boolean {
  return now < p.invulnUntil || now < p.dodgeUntil;
}

export function hasStatus(p: PlayerSim, kind: StatusKind, now: number): boolean {
  return p.statuses.some((s) => s.kind === kind && s.until > now);
}

function statusMag(p: PlayerSim, kind: StatusKind, now: number, fallback: number): number {
  let best = fallback;
  for (const s of p.statuses) if (s.kind === kind && s.until > now) best = Math.max(best, s.mag);
  return best;
}

export function speedMult(p: PlayerSim, now: number): number {
  const slow = Math.min(BALANCE.maxSlowPct, statusMag(p, "slow", now, 0));
  const haste = statusMag(p, "haste", now, 1);
  return (1 - slow) * haste * (1 + p.stats.speed * BALANCE.statSpeed);
}

/** Aplica efeito com duração. Atordoamento respeita a janela de imunidade. */
export function applyStatus(m: Match, t: PlayerSim, kind: StatusKind, ms: number, mag = 0): void {
  if (!t.alive || ms <= 0) return;
  if (kind !== "haste" && isInvulnerable(t, m.now)) return;
  if (kind === "stun") {
    if (m.now < t.stunImmuneUntil) return;
    t.stunImmuneUntil = m.now + ms + BALANCE.stunImmunityMs;
  }
  const until = m.now + ms;
  const cur = t.statuses.find((s) => s.kind === kind && s.until > m.now);
  if (cur) {
    cur.until = Math.max(cur.until, until);
    cur.mag = Math.max(cur.mag, mag);
  } else {
    t.statuses = t.statuses.filter((s) => s.kind !== kind);
    t.statuses.push({ kind, until, mag });
  }
}

export function knockback(p: PlayerSim, dirX: number, dirZ: number, force: number): void {
  const len = Math.hypot(dirX, dirZ) || 1;
  p.push.x += (dirX / len) * force;
  p.push.z += (dirZ / len) * force;
}

/**
 * Único ponto de aplicação de dano. Retorna o dano efetivo (escudo + vida).
 * Dá XP ao atacante e resolve a eliminação.
 */
export function applyDamage(m: Match, target: PlayerSim, amount: number, sourceId: string | null): number {
  if (m.phase !== "active" || !target.alive || amount <= 0 || sourceId === target.id) return 0;
  if (isInvulnerable(target, m.now)) return 0;

  const src = sourceId ? m.players.get(sourceId) : undefined;
  // No modo cooperativo de zumbis: fogo amigo desativado (humanos não ferem humanos, zumbis não ferem zumbis)
  if (m.submode === "zombies" && src) {
    const srcIsZombie = !!src.isZombie;
    const tgtIsZombie = !!target.isZombie;
    if (srcIsZombie === tgtIsZombie) return 0;
  }

  let dmg = amount;
  let absorbed = 0;
  if (target.shield > 0 && m.now < target.shieldUntil) {
    absorbed = Math.min(target.shield, dmg);
    target.shield -= absorbed;
    dmg -= absorbed;
  }
  const hpDmg = Math.min(target.hp, dmg);
  target.hp -= hpDmg;
  const effective = absorbed + hpDmg;
  if (effective <= 0) return 0;
  m.events.push({ type: "hit", target: target.id, from: sourceId, amount: Math.round(effective), x: target.pos.x, z: target.pos.z });
  if (src) {
    target.damageLog.push({ from: src.id, amount: effective, at: m.now });
    src.damageDealt += effective;
    grantXp(m, src, effective);
  }
  if (target.hp <= 0) handleDeath(m, target, sourceId);
  return effective;
}
