import { ABILITIES } from "../data/abilities";
import { BALANCE } from "../data/balance";
import { OFFICE_MAP } from "../data/map";
import { SYNERGIES, type SynergyDef } from "../data/synergies";
import type { AbilityId, AbilityParams, Match, OwnedAbility, PlayerSim, Projectile } from "../types";
import { pointInBoxes, segmentBlocked, segmentBoxT } from "./collision";
import { applyDamage, applyStatus, hasStatus, knockback } from "./combat";

export type ResolvedAbility = AbilityParams & { cooldownMs: number };

/** Direção do yaw: yaw 0 olha para +z, yaw pi/2 olha para +x. */
export function dirOf(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

function addMod(target: AbilityParams, mod: AbilityParams): void {
  for (const [k, v] of Object.entries(mod) as [keyof AbilityParams, number | boolean][]) {
    if (typeof v === "boolean") (target as Record<string, unknown>)[k] = v;
    else (target as Record<string, number>)[k] = ((target[k] as number | undefined) ?? 0) + v;
  }
}

export function activeSynergies(owned: OwnedAbility[]): SynergyDef[] {
  const ids = new Set(owned.map((a) => a.id));
  return SYNERGIES.filter((s) => s.requires.every((r) => ids.has(r)));
}

/** Parâmetros finais: base + especialização + sinergias, escalados pelo nível. */
export function resolveAbility(owned: OwnedAbility[], id: AbilityId): ResolvedAbility {
  const def = ABILITIES[id];
  const o = owned.find((a) => a.id === id);
  const level = o?.level ?? 1;
  const p: AbilityParams = { ...def.base };
  if (o?.spec) addMod(p, (o.spec === "A" ? def.specA : def.specB).mod);
  for (const s of activeSynergies(owned)) if (s.target === id) addMod(p, s.mod);
  if (p.damage) p.damage *= 1 + BALANCE.levelDamageScale * (level - 1);
  const cooldownMs = def.cooldownMs * (1 - BALANCE.levelCooldownScale * (level - 1)) * (1 + (p.cooldownPct ?? 0));
  return { ...p, cooldownMs };
}

const enemiesOf = (m: Match, p: PlayerSim) => [...m.players.values()].filter((o) => o.id !== p.id && o.alive);

/** Efeitos de acerto compartilhados por projéteis, áreas e cone. */
export function applyHitEffects(m: Match, src: PlayerSim, t: PlayerSim, prm: AbilityParams, pushDir?: { x: number; z: number }): void {
  if (prm.damage) applyDamage(m, t, prm.damage, src.id);
  if (!t.alive) return;
  if (prm.stunMs) applyStatus(m, t, "stun", prm.stunMs);
  if (prm.blindMs) applyStatus(m, t, "blind", prm.blindMs);
  if (prm.slowMs) applyStatus(m, t, "slow", prm.slowMs, prm.slowPct ?? 0.3);
  if (prm.knock && pushDir) knockback(t, pushDir.x, pushDir.z, prm.knock);
}

export function spawnProjectile(m: Match, p: PlayerSim, kind: string, yaw: number, prm: AbilityParams, damage: number): void {
  const d = dirOf(yaw);
  const speed = prm.speed ?? BALANCE.ballSpeed;
  const range = prm.range ?? BALANCE.ballRange;
  const start = { x: p.pos.x + d.x * 0.6, z: p.pos.z + d.z * 0.6 };
  if (segmentBlocked(p.pos, start, OFFICE_MAP.boxes)) return;
  m.projectiles.push({
    id: m.nextId++,
    owner: p.id,
    kind,
    x: start.x,
    z: start.z,
    vx: d.x * speed,
    vz: d.z * speed,
    radius: prm.radius ?? BALANCE.ballRadius,
    ttl: (range / speed) * 1000,
    damage,
    params: prm,
    hit: [],
  });
}

export function fireBall(m: Match, p: PlayerSim, yaw: number): boolean {
  const haste = p.statuses.find((s) => s.kind === "haste" && s.until > m.now)?.mag ?? 1;
  if (m.now - p.lastShotAt < BALANCE.ballIntervalMs / haste) return false;
  p.lastShotAt = m.now;
  p.shots++;
  spawnProjectile(m, p, "ball", yaw, {}, BALANCE.ballDamage * (1 + p.stats.ball * BALANCE.statBall));
  return true;
}

function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

const yawTo = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Ponto mirado limitado pelo alcance e recuado antes da primeira parede. */
function aimPoint(p: PlayerSim, yaw: number, wanted: number, range: number) {
  const d = dirOf(yaw);
  const len = Math.max(0, Math.min(wanted, range));
  const end = { x: p.pos.x + d.x * len, z: p.pos.z + d.z * len };
  const t = segmentBoxT(p.pos, end, OFFICE_MAP.boxes, 0.2);
  const k = t === null ? 1 : Math.max(0, t - 0.05);
  return { x: p.pos.x + (end.x - p.pos.x) * k, z: p.pos.z + (end.z - p.pos.z) * k };
}

/** Lança a habilidade do espaço indicado. Sem efeito e sem gastar recarga quando inválido. */
export function castAbility(m: Match, p: PlayerSim, slot: number, yaw: number, wantDist: number): boolean {
  if (m.phase !== "active" || !p.alive || hasStatus(p, "stun", m.now)) return false;
  const o = p.abilities[slot];
  if (!o || m.now < o.readyAt) return false;
  const def = ABILITIES[o.id];
  const prm = resolveAbility(p.abilities, o.id);
  const d = dirOf(yaw);
  const boxes = OFFICE_MAP.boxes;

  switch (def.kind) {
    case "chain": {
      const range = prm.range ?? 14;
      const first = enemiesOf(m, p)
        .filter((e) => dist(p.pos, e.pos) <= range && !segmentBlocked(p.pos, e.pos, boxes))
        .filter((e) => dist(p.pos, e.pos) < 2.5 || angleDiff(yawTo(p.pos, e.pos), yaw) < 0.6)
        .sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos))[0];
      if (!first) return false;
      const chain = [first];
      for (let i = 0; i < (prm.chains ?? 0); i++) {
        const last = chain[chain.length - 1];
        const next = enemiesOf(m, p)
          .filter((e) => !chain.includes(e) && dist(last.pos, e.pos) <= (prm.chainRange ?? 7))
          .filter((e) => !segmentBlocked(last.pos, e.pos, boxes))
          .sort((a, b) => dist(last.pos, a.pos) - dist(last.pos, b.pos))[0];
        if (!next) break;
        chain.push(next);
      }
      const pts = [{ ...p.pos }, ...chain.map((e) => ({ ...e.pos }))];
      chain.forEach((e, i) => applyHitEffects(m, p, e, i === 0 ? prm : { ...prm, stunMs: 0 }));
      m.events.push({ type: "fx", kind: "A1", x: p.pos.x, z: p.pos.z, pts, owner: p.id });
      break;
    }
    case "nova": {
      const r = prm.radius ?? 3;
      for (const e of enemiesOf(m, p)) {
        if (dist(p.pos, e.pos) > r + BALANCE.playerRadius || segmentBlocked(p.pos, e.pos, boxes)) continue;
        applyHitEffects(m, p, e, prm, { x: e.pos.x - p.pos.x, z: e.pos.z - p.pos.z });
      }
      m.events.push({ type: "fx", kind: o.id, x: p.pos.x, z: p.pos.z, radius: r, owner: p.id });
      break;
    }
    case "cone": {
      const range = prm.range ?? 6;
      const half = ((prm.spreadDeg ?? 60) * Math.PI) / 360;
      for (const e of enemiesOf(m, p)) {
        if (dist(p.pos, e.pos) > range || segmentBlocked(p.pos, e.pos, boxes)) continue;
        if (angleDiff(yawTo(p.pos, e.pos), yaw) > half && dist(p.pos, e.pos) > 1) continue;
        applyHitEffects(m, p, e, prm, d);
      }
      m.events.push({ type: "fx", kind: o.id, x: p.pos.x, z: p.pos.z, yaw, radius: range, owner: p.id });
      break;
    }
    case "fan":
    case "projectile": {
      const count = Math.max(1, Math.round(prm.count ?? 1));
      const spread = ((prm.spreadDeg ?? 0) * Math.PI) / 180;
      for (let i = 0; i < count; i++) {
        const off = count === 1 ? 0 : spread * (i / (count - 1) - 0.5);
        spawnProjectile(m, p, o.id, yaw + off, prm, prm.damage ?? 0);
      }
      m.events.push({ type: "fx", kind: `${o.id}-cast`, x: p.pos.x, z: p.pos.z, yaw, owner: p.id });
      break;
    }
    case "dash": {
      const ms = prm.durationMs ?? 220;
      p.dashUntil = m.now + ms;
      p.dashDir = d;
      p.dashSpeed = (prm.range ?? 9) / (ms / 1000);
      p.dashHit = [];
      p.invulnUntil = Math.max(p.invulnUntil, m.now + ms);
      m.events.push({ type: "fx", kind: o.id, x: p.pos.x, z: p.pos.z, yaw, owner: p.id });
      break;
    }
    case "buff": {
      const ms = prm.durationMs ?? 4000;
      if (prm.shield) {
        p.shield = Math.max(p.shield, prm.shield);
        p.shieldUntil = m.now + ms;
      }
      if (prm.heal) p.hp = Math.min(p.maxHp, p.hp + prm.heal);
      if (prm.hasteMult) applyStatus(m, p, "haste", ms, prm.hasteMult);
      m.events.push({ type: "fx", kind: o.id, x: p.pos.x, z: p.pos.z, owner: p.id });
      break;
    }
    case "zone": {
      const at = aimPoint(p, yaw, wantDist, prm.range ?? 16);
      const r = prm.radius ?? 3;
      m.zones.push({
        id: m.nextId++,
        owner: p.id,
        kind: o.id,
        x: at.x,
        z: at.z,
        radius: r,
        until: m.now + (prm.durationMs ?? 3000),
        nextTick: m.now,
        params: { ...prm, stunMs: 0, shield: 0 },
      });
      if (prm.stunMs) {
        for (const e of enemiesOf(m, p)) if (dist(at, e.pos) <= r) applyStatus(m, e, "stun", prm.stunMs);
      }
      if (prm.shield) {
        p.shield = Math.max(p.shield, prm.shield);
        p.shieldUntil = m.now + 3000;
      }
      m.events.push({ type: "fx", kind: o.id, x: at.x, z: at.z, radius: r, owner: p.id });
      break;
    }
    case "teleport": {
      const len = Math.max(0, Math.min(wantDist, prm.range ?? 12));
      const from = { ...p.pos };
      const half = { x: OFFICE_MAP.width / 2 - BALANCE.playerRadius, z: OFFICE_MAP.depth / 2 - BALANCE.playerRadius };
      let dest = from;
      for (let k = 1; k >= 0; k -= 0.04) {
        const c = { x: from.x + d.x * len * k, z: from.z + d.z * len * k };
        if (Math.abs(c.x) > half.x || Math.abs(c.z) > half.z) continue;
        if (!pointInBoxes(c, BALANCE.playerRadius, OFFICE_MAP.boxes)) {
          dest = c;
          break;
        }
      }
      p.pos = dest;
      if (prm.shield) {
        p.shield = Math.max(p.shield, prm.shield);
        p.shieldUntil = m.now + (prm.durationMs ?? 3000);
      }
      m.events.push({ type: "fx", kind: o.id, x: from.x, z: from.z, pts: [from, { ...dest }], owner: p.id });
      break;
    }
  }
  o.readyAt = m.now + prm.cooldownMs;
  return true;
}

function segPointDist(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

export function stepProjectiles(m: Match, dtMs: number): void {
  const dt = dtMs / 1000;
  const keep: Projectile[] = [];
  for (const pr of m.projectiles) {
    const a = { x: pr.x, z: pr.z };
    let b = { x: pr.x + pr.vx * dt, z: pr.z + pr.vz * dt };
    const wallT = segmentBoxT(a, b, OFFICE_MAP.boxes);
    if (wallT !== null) b = { x: a.x + (b.x - a.x) * wallT, z: a.z + (b.z - a.z) * wallT };
    const owner = m.players.get(pr.owner);
    let alive = wallT === null;
    const hits = [...m.players.values()]
      .filter((t) => t.alive && t.id !== pr.owner && !pr.hit.includes(t.id))
      .filter((t) => segPointDist(a.x, a.z, b.x, b.z, t.pos.x, t.pos.z) <= pr.radius + BALANCE.playerRadius)
      .sort((p1, p2) => dist(a, p1.pos) - dist(a, p2.pos));
    for (const t of hits) {
      pr.hit.push(t.id);
      if (pr.kind === "ball" && owner) owner.shotHits++;
      if (owner) applyHitEffects(m, owner, t, { ...pr.params, damage: pr.damage }, { x: pr.vx, z: pr.vz });
      else applyDamage(m, t, pr.damage, null);
      m.events.push({ type: "fx", kind: "impact", x: t.pos.x, z: t.pos.z });
      if (!pr.params.pierce) {
        alive = false;
        break;
      }
    }
    pr.x = b.x;
    pr.z = b.z;
    pr.ttl -= dtMs;
    if (wallT !== null) m.events.push({ type: "fx", kind: "impact", x: b.x, z: b.z });
    if (alive && pr.ttl > 0) keep.push(pr);
  }
  m.projectiles = keep;
}

export function stepZones(m: Match): void {
  m.zones = m.zones.filter((z) => m.now < z.until);
  for (const z of m.zones) {
    if (m.now < z.nextTick) continue;
    z.nextTick += z.params.tickMs ?? 500;
    const owner = m.players.get(z.owner);
    for (const e of m.players.values()) {
      if (!e.alive || e.id === z.owner || dist(z, e.pos) > z.radius) continue;
      if (owner) applyHitEffects(m, owner, e, z.params);
    }
  }
}

/** Movimento de arrancada (Sprint do Estagiário) com dano opcional por contato. */
export function dashContacts(m: Match, p: PlayerSim): void {
  const sprint = p.abilities.find((a) => a.id === "C1");
  if (!sprint) return;
  const prm = resolveAbility(p.abilities, "C1");
  if (!prm.damage) return;
  for (const e of enemiesOf(m, p)) {
    if (p.dashHit.includes(e.id) || dist(p.pos, e.pos) > BALANCE.playerRadius * 2 + 0.4) continue;
    p.dashHit.push(e.id);
    applyHitEffects(m, p, e, prm, p.dashDir);
  }
}
