import { BALANCE } from "../data/balance";
import type { Match, PlayerSim, ResultRow } from "../types";
import { grantXp } from "./progression";

/** Resolve uma eliminação. Idempotente: vítima já morta é ignorada. */
export function handleDeath(m: Match, victim: PlayerSim, killerId: string | null): void {
  if (!victim.alive) return;
  victim.alive = false;
  victim.hp = 0;
  victim.deaths++;
  victim.respawnAt = m.now + BALANCE.respawnMs;
  victim.statuses = [];
  victim.shield = 0;
  victim.push = { x: 0, z: 0 };
  victim.dashUntil = 0;

  const killer = killerId && killerId !== victim.id ? m.players.get(killerId) : undefined;
  if (killer) {
    killer.kills++;
    killer.score += BALANCE.scoreKill;
    grantXp(m, killer, BALANCE.xpKill);
  }

  const byPlayer = new Map<string, number>();
  for (const d of victim.damageLog) {
    if (m.now - d.at > BALANCE.assistWindowMs) continue;
    if (d.from === killer?.id || d.from === victim.id) continue;
    byPlayer.set(d.from, (byPlayer.get(d.from) ?? 0) + d.amount);
  }
  const assists: string[] = [];
  for (const [id, total] of byPlayer) {
    const p = m.players.get(id);
    if (!p || total < BALANCE.assistMinDamage) continue;
    p.assists++;
    p.score += BALANCE.scoreAssist;
    grantXp(m, p, BALANCE.xpAssist);
    assists.push(id);
  }
  victim.damageLog = [];
  m.events.push({ type: "kill", killer: killer?.id ?? null, victim: victim.id, assists });
}

type Rankable = Pick<ResultRow, "id" | "name" | "avatar" | "isBot" | "score" | "kills" | "deaths" | "assists" | "abilities">;

const key = (r: Rankable) => [r.score, r.kills, r.assists] as const;

/** Ordena por pontos, depois eliminações, depois assistências. Iguais nos três dividem a posição. */
export function rankPlayers(players: (Rankable | PlayerSim)[]): ResultRow[] {
  const rows: Rankable[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    isBot: p.isBot,
    score: p.score,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    abilities: p.abilities.map((a) => ({ id: a.id, level: a.level, spec: a.spec })),
  }));
  rows.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return 0;
  });
  const same = (a: Rankable, b: Rankable) => key(a).every((v, i) => v === key(b)[i]);
  const out: ResultRow[] = [];
  rows.forEach((r, i) => {
    const rank = i > 0 && same(r, rows[i - 1]) ? out[i - 1].rank : i + 1;
    const tie = rows.some((o) => o !== r && same(o, r));
    out.push({ ...r, rank, tie });
  });
  return out;
}
