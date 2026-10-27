import { ABILITIES, ABILITY_IDS } from "../data/abilities";
import { BALANCE } from "../data/balance";
import type { EvolutionOption, Match, PlayerSim, StatId } from "../types";

export function xpToNext(level: number): number {
  return 80 + 40 * level;
}

const ROMAN = ["", "I", "II", "III", "IV", "V"];
const STAT_TEXT: Record<StatId, { title: string; desc: string }> = {
  hp: { title: "Plano de saúde", desc: `+${BALANCE.statHp} de vida máxima` },
  speed: { title: "Tênis novo", desc: `+${Math.round(BALANCE.statSpeed * 100)}% de velocidade` },
  ball: { title: "Papel A3", desc: `+${Math.round(BALANCE.statBall * 100)}% de dano da bolinha` },
};
const MAX_SPEED_STACKS = 4;

function shuffle<T>(rng: () => number, list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function statOption(stat: StatId): EvolutionOption {
  return { id: `st:${stat}`, type: "stat", stat, ...STAT_TEXT[stat] };
}

/**
 * Gera até 3 opções distintas e aplicáveis. Blocos: habilidade nova (1 vaga),
 * melhoria (1 vaga) e par de especializações A/B (2 vagas). Sobras viram atributos.
 */
export function generateOptions(p: PlayerSim, rng: () => number): EvolutionOption[] {
  const owned = new Set(p.abilities.map((a) => a.id));
  const unlocks: EvolutionOption[] = shuffle(rng, ABILITY_IDS.filter((id) => !owned.has(id))).map((id) => ({
    id: `u:${id}`,
    type: "unlock",
    abilityId: id,
    toLevel: 1,
    title: ABILITIES[id].name,
    desc: ABILITIES[id].desc,
  }));
  if (p.abilities.length === 0) return unlocks.slice(0, 3);

  const units: EvolutionOption[][] = [];
  if (p.abilities.length < BALANCE.maxAbilities) for (const u of unlocks.slice(0, 2)) units.push([u]);
  for (const a of p.abilities) {
    if (a.level >= BALANCE.maxAbilityLevel) continue;
    const def = ABILITIES[a.id];
    if (a.level === 2) {
      units.push(
        (["A", "B"] as const).map((s) => {
          const spec = s === "A" ? def.specA : def.specB;
          return {
            id: `s:${a.id}:${s}`,
            type: "spec" as const,
            abilityId: a.id,
            spec: s,
            fromLevel: 2,
            toLevel: 3,
            title: `${def.name}: ${spec.name}`,
            desc: spec.desc,
          };
        }),
      );
    } else {
      units.push([
        {
          id: `up:${a.id}:${a.level + 1}`,
          type: "upgrade",
          abilityId: a.id,
          fromLevel: a.level,
          toLevel: a.level + 1,
          title: `${def.name} ${ROMAN[a.level + 1]}`,
          desc: "Mais dano e menos recarga",
        },
      ]);
    }
  }

  const out: EvolutionOption[] = [];
  for (const unit of shuffle(rng, units)) {
    if (out.length + unit.length <= 3) out.push(...unit);
  }
  const stats = shuffle(rng, ["hp", "speed", "ball"] as StatId[]).filter(
    (s) => s !== "speed" || p.stats.speed < MAX_SPEED_STACKS,
  );
  for (const s of stats) if (out.length < 3) out.push(statOption(s));
  return out;
}

/** Aplica uma opção se ainda for válida para o jogador. Atômico: ou aplica tudo ou nada. */
export function applyOption(p: PlayerSim, o: EvolutionOption): boolean {
  const owned = o.abilityId ? p.abilities.find((a) => a.id === o.abilityId) : undefined;
  switch (o.type) {
    case "unlock":
      if (!o.abilityId || owned || p.abilities.length >= BALANCE.maxAbilities) return false;
      p.abilities.push({ id: o.abilityId, level: 1, readyAt: 0 });
      return true;
    case "upgrade":
      if (!owned || owned.level === 2 || owned.level >= BALANCE.maxAbilityLevel) return false;
      owned.level++;
      return true;
    case "spec":
      if (!owned || owned.level !== 2 || owned.spec || !o.spec) return false;
      owned.level = 3;
      owned.spec = o.spec;
      return true;
    case "stat":
      if (!o.stat) return false;
      if (o.stat === "speed" && p.stats.speed >= MAX_SPEED_STACKS) return false;
      p.stats[o.stat]++;
      if (o.stat === "hp") {
        p.maxHp += BALANCE.statHp;
        if (p.alive) p.hp += BALANCE.statHp;
      }
      return true;
  }
}

export function openNextChoice(m: Match, p: PlayerSim): void {
  if (p.options || p.pendingLevels <= 0) return;
  p.pendingLevels--;
  p.choiceSeq++;
  p.options = generateOptions(p, m.rng);
  p.optionsExpireAt = Math.max(m.now, m.countdownEndsAt) + BALANCE.evolutionTimeoutMs;
}

export function grantXp(m: Match, p: PlayerSim, amount: number): void {
  if (m.phase !== "active" || amount <= 0) return;
  p.xp += amount;
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++;
    p.pendingLevels++;
  }
  openNextChoice(m, p);
}

export function chooseEvolution(m: Match, playerId: string, optionId: string, seq: number): boolean {
  const p = m.players.get(playerId);
  if (!p?.options || m.phase === "finished" || seq !== p.choiceSeq) return false;
  const opt = p.options.find((o) => o.id === optionId);
  if (!opt || !applyOption(p, opt)) return false;
  p.options = null;
  openNextChoice(m, p);
  return true;
}

/** Escolha automática da primeira opção válida quando o tempo acaba. */
export function expireEvolutions(m: Match): void {
  for (const p of m.players.values()) {
    if (!p.options || m.now < p.optionsExpireAt) continue;
    const opt = p.options.find((o) => applyOption(p, o));
    p.options = null;
    if (opt) m.events.push({ type: "info", player: p.id, text: `Escolha automática: ${opt.title}` });
    openNextChoice(m, p);
  }
}
