import type { AvatarDNA } from "../types";
import type { ChairDNA } from "../race/chair";

import type { WeekProgress } from "./challenges";

/** Amostra do fantasma: [tempo na volta (ms), x, z, direção]. t inteiro, demais com 2 casas. */
export type GhostSample = [number, number, number, number];

export interface PlayerStats {
  shooterWins: number;
  shooterMatches: number;
  shooterKills: number;
  raceWins: number;
  racePodiums: number;
  raceMatches: number;
  bestLapMs: number | null;
}

export interface RankingAccount {
  email: string;
  name: string;
  since: number;
  /** Último boneco e cadeira com que a pessoa jogou logada (usados no replay do recorde). */
  avatar?: AvatarDNA;
  chair?: ChairDNA;
}

/** Resposta de GET /api/replay: a volta de uma linha do ranking, sem nenhum id de conta. */
export interface ReplayData {
  name: string;
  ms: number;
  avatar: AvatarDNA;
  chair: ChairDNA;
  ghost: GhostSample[];
}

export interface StoredLap {
  ms: number;
  at: number;
  ghost: GhostSample[];
}

/** Arquivo de dados do ranking da firma (um JSON no servidor). */
export interface RankingData {
  version: 1;
  accounts: Record<string, RankingAccount>;
  stats: Record<string, PlayerStats>;
  /** "YYYY-MM" (Brasília) -> pontos por conta. */
  months: Record<string, Record<string, number>>;
  /** trackId -> melhor volta (com fantasma) por conta. */
  laps: Record<string, Record<string, StoredLap>>;
  /** Semana (segunda, "YYYY-MM-DD") -> progresso do desafio por conta. Arquivos antigos não têm: vale vazio. */
  challenges: Record<string, Record<string, WeekProgress>>;
}

/** Linha de qualquer aba; `rank` é a posição real (1 = líder), mesmo na linha `me`. */
export interface RankingRowBase {
  rank: number;
  id: string;
  name: string;
}
export interface MonthRow extends RankingRowBase {
  points: number;
}
export interface ShooterRow extends RankingRowBase {
  wins: number;
  matches: number;
  kills: number;
}
export interface RallyRow extends RankingRowBase {
  wins: number;
  podiums: number;
  matches: number;
}
export interface LapRow extends RankingRowBase {
  ms: number;
}

export interface RankingTab<R> {
  /** Até 20 linhas, já ordenadas. */
  rows: R[];
  /** Linha do jogador que está olhando, mesmo fora do top; null sem viewerId ou sem registro na aba. */
  me: R | null;
}

/** Desafio da semana como a tela mostra (ids de conta ainda crus; a API mascara). */
export interface ChallengeView {
  id: string;
  text: string;
  target: number;
  points: number;
  /** Segunda-feira que abre a semana. */
  week: string;
  /** Progresso de quem está olhando; null sem login. */
  mine: { value: number; target: number; done: boolean; bestLapMs: number | null } | null;
  /** Quem já cumpriu, na ordem em que cumpriu. */
  completed: { id: string; name: string }[];
}

export interface RankingView {
  mes: RankingTab<MonthRow>;
  tiroteio: RankingTab<ShooterRow>;
  rally: RankingTab<RallyRow>;
  /** Recordes de volta do Circuito Corporativo (o mesmo que pistas[0]). */
  voltas: RankingTab<LapRow>;
  /** Recordes de volta de cada pista, na ordem do seletor. */
  pistas: { id: string; name: string; voltas: RankingTab<LapRow> }[];
  /** Líder do mês anterior ("Funcionário do mês passado"). */
  desafio: ChallengeView;
  mesPassado: { month: string; id: string; name: string; points: number } | null;
}
