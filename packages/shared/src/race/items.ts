import type { Vec2 } from "../types";
import { ITEM_FX, RACE } from "./balance";
import { pointAt, progressOf, sideNormal, TRACK } from "./track";
import type { Hazard, ItemId, RaceMatch, Racer } from "./types";

export const ITEM_IDS: ItemId[] = ["expresso", "triplo", "grampeador", "poca", "resma", "aviao", "pasta", "postit"];

export const ITEM_NAMES: Record<ItemId, string> = {
  expresso: "Café Expresso",
  triplo: "Café Expresso Triplo",
  grampeador: "Grampeador",
  poca: "Poça de Café",
  resma: "Resma de Papel",
  aviao: "Aviãozinho de Papel",
  pasta: "Pasta do Jurídico",
  postit: "Post-it na Tela",
};

/**
 * Chance de cada item (soma 100) pela metade do pelotão. Ajuda leve para quem está atrás:
 * a metade de trás tira mais turbo e aviãozinho; a da frente, defesa e armadilha.
 * Nenhum item mira o 1º colocado (o aviãozinho nunca sai para o 1º, e ninguém o persegue).
 */
export const ITEM_WEIGHTS: { front: Record<ItemId, number>; back: Record<ItemId, number> } = {
  front: { expresso: 15, triplo: 0, grampeador: 25, poca: 20, resma: 15, aviao: 0, pasta: 15, postit: 10 },
  back: { expresso: 30, triplo: 15, grampeador: 15, poca: 5, resma: 5, aviao: 20, pasta: 0, postit: 10 },
};

export function rollItem(rng: () => number, place: number, total: number): ItemId {
  const base = place <= Math.ceil(total / 2) ? ITEM_WEIGHTS.front : ITEM_WEIGHTS.back;
  // 1º e 2º não teriam em quem usar o post-it (ele nunca vai no líder)
  const weight = (id: ItemId) => (id === "postit" && place <= 2 ? 0 : base[id]);
  const sum = ITEM_IDS.reduce((a, id) => a + weight(id), 0);
  let x = rng() * sum;
  for (const id of ITEM_IDS) {
    x -= weight(id);
    if (x < 0 && weight(id) > 0) return id;
  }
  return "expresso";
}

export function giveItem(r: Racer, item: ItemId): void {
  r.item = item;
  r.charges = item === "triplo" ? ITEM_FX.triploCharges : 1;
}

const dirOf = (h: number): Vec2 => ({ x: Math.sin(h), z: Math.cos(h) });

/** Quem está imediatamente à frente, desde que não seja o 1º colocado. */
function targetAhead(race: RaceMatch, r: Racer): Racer | null {
  if (r.place <= 2) return null;
  for (const o of race.racers.values()) if (o.place === r.place - 1 && o.lap.finishedAt === null) return o;
  return null;
}

function addHazard(race: RaceMatch, h: Omit<Hazard, "id" | "bornAt">): void {
  race.hazards.push({ ...h, id: race.nextId++, bornAt: race.now });
}

/** Usa o item do jogador. Devolve false se não havia item ou não havia alvo. */
export function useItem(race: RaceMatch, r: Racer): boolean {
  const item = r.item;
  if (!item) return false;
  const k = r.kart;
  const now = race.now;
  const fwd = dirOf(k.heading);
  const front = { x: k.pos.x + fwd.x * (RACE.kartRadius + 0.6), z: k.pos.z + fwd.z * (RACE.kartRadius + 0.6) };
  const behind = { x: k.pos.x - fwd.x * ITEM_FX.dropBehind, z: k.pos.z - fwd.z * ITEM_FX.dropBehind };
  switch (item) {
    case "expresso":
    case "triplo":
      k.boostUntil = Math.max(k.boostUntil, now + ITEM_FX.expressoMs);
      break;
    case "grampeador": {
      const v = ITEM_FX.grampoSpeed + Math.max(0, k.speed);
      addHazard(race, { kind: "grampo", pos: front, vel: { x: fwd.x * v, z: fwd.z * v }, owner: r.id, until: now + ITEM_FX.grampoTtlMs });
      break;
    }
    case "poca":
      addHazard(race, { kind: "poca", pos: behind, vel: { x: 0, z: 0 }, owner: r.id, until: now + ITEM_FX.pocaTtlMs });
      break;
    case "resma":
      addHazard(race, { kind: "resma", pos: behind, vel: { x: 0, z: 0 }, owner: r.id, until: now + ITEM_FX.resmaTtlMs });
      break;
    case "aviao": {
      const t = targetAhead(race, r);
      const inRange = t && Math.hypot(t.kart.pos.x - k.pos.x, t.kart.pos.z - k.pos.z) <= ITEM_FX.aviaoRange;
      addHazard(race, {
        kind: "aviao",
        pos: front,
        vel: { x: fwd.x * ITEM_FX.aviaoSpeed, z: fwd.z * ITEM_FX.aviaoSpeed },
        targetId: inRange ? t.id : undefined,
        owner: r.id,
        until: now + ITEM_FX.aviaoTtlMs,
      });
      break;
    }
    case "pasta":
      r.shieldUntil = now + ITEM_FX.pastaMs;
      break;
    case "postit": {
      const t = targetAhead(race, r);
      if (!t) return false;
      t.blindUntil = now + ITEM_FX.postitMs;
      race.events.push({ type: "hit", id: t.id, by: r.id, kind: "postit" });
      break;
    }
  }
  r.charges--;
  if (r.charges <= 0) {
    r.item = null;
    r.charges = 0;
  }
  r.itemsUsed[item] = (r.itemsUsed[item] ?? 0) + 1;
  race.events.push({ type: "item", id: r.id, item });
  return true;
}

/** Aplica um ataque. A Pasta do Jurídico ativa anula um ataque e se gasta. */
export function hitRacer(race: RaceMatch, t: Racer, kind: "spin" | "slip" | "resma", by: string | null): void {
  const k = t.kart;
  if (t.shieldUntil > race.now) {
    t.shieldUntil = 0;
    race.events.push({ type: "hit", id: t.id, by, kind: "blocked" });
    return;
  }
  const attacker = by ? race.racers.get(by) : undefined;
  if (attacker && attacker !== t) attacker.itemHits++;
  if (kind === "spin") k.spinUntil = race.now + ITEM_FX.spinMs;
  if (kind === "slip") k.slipUntil = race.now + ITEM_FX.pocaSlipMs;
  if (kind === "resma") k.speed *= ITEM_FX.resmaSpeedKeep;
  k.drifting = false;
  k.driftDir = 0;
  k.driftMs = 0;
  race.events.push({ type: "hit", id: t.id, by, kind });
}

const RADIUS: Record<Hazard["kind"], number> = {
  grampo: ITEM_FX.grampoRadius,
  aviao: ITEM_FX.aviaoRadius,
  poca: ITEM_FX.pocaRadius,
  resma: ITEM_FX.resmaRadius,
};

function steerAviao(race: RaceMatch, h: Hazard, dt: number): void {
  const t = h.targetId ? race.racers.get(h.targetId) : undefined;
  let aim: Vec2;
  if (t && Math.hypot(t.kart.pos.x - h.pos.x, t.kart.pos.z - h.pos.z) < 12) {
    aim = t.kart.pos;
  } else {
    // segue a pista até chegar perto do alvo, sem atravessar paredes
    const pr = progressOf(TRACK, h.pos);
    const ahead = pointAt(TRACK, pr.s + 6);
    const lateral = t ? progressOf(TRACK, t.kart.pos).lateral * 0.5 : 0;
    const n = sideNormal(Math.sin(ahead.heading), Math.cos(ahead.heading));
    aim = { x: ahead.pos.x + n.x * lateral, z: ahead.pos.z + n.z * lateral };
  }
  const cur = Math.atan2(h.vel.x, h.vel.z);
  const want = Math.atan2(aim.x - h.pos.x, aim.z - h.pos.z);
  const diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
  const turn = Math.max(-ITEM_FX.aviaoTurnRate * dt, Math.min(ITEM_FX.aviaoTurnRate * dt, diff));
  const h2 = cur + turn;
  h.vel = { x: Math.sin(h2) * ITEM_FX.aviaoSpeed, z: Math.cos(h2) * ITEM_FX.aviaoSpeed };
}

/** Move projéteis, aplica acertos e remove o que expirou ou bateu. */
export function stepHazards(race: RaceMatch, dtMs: number): void {
  const dt = dtMs / 1000;
  const now = race.now;
  const gone = new Set<number>();
  for (const h of race.hazards) {
    if (now >= h.until) {
      gone.add(h.id);
      continue;
    }
    const moving = h.kind === "grampo" || h.kind === "aviao";
    if (moving) {
      if (h.kind === "aviao") steerAviao(race, h, dt);
      h.pos = { x: h.pos.x + h.vel.x * dt, z: h.pos.z + h.vel.z * dt };
      const pr = progressOf(TRACK, h.pos);
      if (pr.dist > pr.halfWidth) {
        gone.add(h.id);
        continue;
      }
      // grampo ou aviãozinho que acerta uma resma: os dois somem
      const block = race.hazards.find(
        (o) => o.kind === "resma" && !gone.has(o.id) && Math.hypot(o.pos.x - h.pos.x, o.pos.z - h.pos.z) < RADIUS.resma + RADIUS[h.kind],
      );
      if (block) {
        gone.add(h.id);
        gone.add(block.id);
        continue;
      }
    }
    for (const r of race.racers.values()) {
      if (r.id === h.owner && now - h.bornAt < ITEM_FX.ownerGraceMs) continue;
      if (h.kind === "aviao" && h.targetId && r.id !== h.targetId) continue;
      if (Math.hypot(r.kart.pos.x - h.pos.x, r.kart.pos.z - h.pos.z) >= RADIUS[h.kind] + RACE.kartRadius) continue;
      hitRacer(race, r, h.kind === "poca" ? "slip" : h.kind === "resma" ? "resma" : "spin", h.owner);
      gone.add(h.id);
      break;
    }
  }
  if (gone.size) race.hazards = race.hazards.filter((h) => !gone.has(h.id));
}

/** Caixas prontas dão item a quem passa com o espaço vazio; cada caixa serve um só. */
export function pickBoxes(race: RaceMatch): void {
  const total = race.racers.size;
  for (const b of race.boxes) {
    if (b.readyAt > race.now) continue;
    for (const r of race.racers.values()) {
      if (r.item || r.lap.finishedAt !== null) continue;
      if (Math.hypot(r.kart.pos.x - b.pos.x, r.kart.pos.z - b.pos.z) >= RACE.boxRadius + RACE.kartRadius + 0.3) continue;
      giveItem(r, rollItem(race.rng, r.place, total));
      b.readyAt = race.now + RACE.boxRespawnMs;
      race.events.push({ type: "box", id: r.id, box: b.id });
      break;
    }
  }
}
