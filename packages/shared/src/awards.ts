import { mulberry32 } from "./rng";

/** Prêmio bobo do fim da partida. Não vale pontos e bots podem levar. */
export interface Award {
  id: string;
  title: string;
  winnerId: string;
  winnerName: string;
  /** Número que justifica o prêmio, já em texto ("12 esquivas"). */
  detail: string;
}

export const MAX_AWARDS = 3;

/** Sorteia até MAX_AWARDS entre os candidatos. Mesma semente e mesmos candidatos dão o mesmo resultado. */
export function pickAwards(candidates: Award[], seed: number): Award[] {
  const list = [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rng = mulberry32((seed ^ 0x5eed) >>> 0);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, MAX_AWARDS);
}

interface Who {
  id: string;
  name: string;
}

/** Quem tem o maior (ou menor) valor, só se for único e passar do mínimo. Empate no topo anula o prêmio. */
function leader<T extends Who>(list: T[], value: (x: T) => number | null, mode: "max" | "min", valid: (v: number) => boolean): { who: T; v: number } | null {
  const rows = list.flatMap((x) => {
    const v = value(x);
    return v === null || !Number.isFinite(v) ? [] : [{ who: x, v }];
  });
  if (rows.length < 2) return null;
  rows.sort((a, b) => (mode === "max" ? b.v - a.v : a.v - b.v));
  if (rows[0].v === rows[1].v || !valid(rows[0].v)) return null;
  return rows[0];
}

const award = (id: string, title: string, l: { who: Who; v: number } | null, detail: (v: number) => string): Award[] =>
  l ? [{ id, title, winnerId: l.who.id, winnerName: l.who.name, detail: detail(l.v) }] : [];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface ShooterStat extends Who {
  shots: number;
  hits: number;
  damage: number;
  deaths: number;
  dodges: number;
}

/** Disparos mínimos para a pior mira valer prêmio. */
export const MIN_SHOTS_AIM = 20;

export function shooterCandidates(players: ShooterStat[]): Award[] {
  const accuracy = (p: ShooterStat) => (p.shots >= MIN_SHOTS_AIM ? p.hits / p.shots : null);
  const worst = leader(players, accuracy, "min", () => true);
  return [
    ...award("cafe", "Mais café derramado", leader(players, (p) => p.damage, "max", (v) => v > 0), (v) => `${Math.round(v)} de dano`),
    ...award("kamikaze", "Kamikaze", leader(players, (p) => p.deaths, "max", (v) => v > 0), (v) => `eliminado ${plural(v, "vez", "vezes")}`),
    ...award("pacifista", "Pacifista", leader(players, (p) => p.shots, "min", () => true), (v) => (v === 0 ? "nenhum disparo" : plural(v, "disparo", "disparos"))),
    ...award("mira", "Mira de estagiário", worst, (v) => {
      const p = worst!.who;
      return `${Math.round(v * 100)}% de acerto (${p.hits} de ${p.shots})`;
    }),
    ...award("esquivador", "Esquivador profissional", leader(players, (p) => p.dodges, "max", (v) => v > 0), (v) => plural(v, "esquiva", "esquivas")),
  ];
}

export interface RaceStat extends Who {
  wrongMs: number;
  itemHits: number;
  wallHits: number;
  stoppedMs: number;
  bestLapMs: number | null;
}

/** Tempo mínimo (ms) na contramão e parado para o prêmio valer. */
export const MIN_WRONG_MS = 2000;
export const MIN_STOPPED_MS = 3000;

const secs = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

export function raceCandidates(racers: RaceStat[]): Award[] {
  return [
    ...award("contramao", "Mais tempo na contramão", leader(racers, (r) => r.wrongMs, "max", (v) => v >= MIN_WRONG_MS), (v) => secs(v)),
    ...award("grampeador", "Rei do grampeador", leader(racers, (r) => r.itemHits, "max", (v) => v > 0), (v) => plural(v, "acerto", "acertos")),
    ...award("muro", "Mais batidas no muro", leader(racers, (r) => r.wallHits, "max", (v) => v > 0), (v) => plural(v, "batida", "batidas")),
    ...award("turista", "Turista", leader(racers, (r) => r.stoppedMs, "max", (v) => v >= MIN_STOPPED_MS), (v) => `${secs(v)} parado`),
    ...award("volta", "Volta mais rápida", leader(racers, (r) => r.bestLapMs, "min", (v) => v > 0), (v) => secs(v)),
  ];
}
