import type { AvatarDNA } from "../types";
import type { ChairDNA } from "../race/chair";

import type { WeekProgress } from "./challenges";

/**
 * Amostra do fantasma: [tempo na volta (ms), x, z, direção, altura?]. t inteiro, demais com 2 casas.
 * A altura só vai no voo da rampa; sem ela (e nos fantasmas antigos) a cadeira está no chão.
 */
export type GhostSample = [number, number, number, number, number?];

export interface PlayerStats {
  shooterWins: number;
  shooterMatches: number;
  shooterKills: number;
  raceWins: number;
  racePodiums: number;
  raceMatches: number;
  bestLapMs: number | null;
}

/** Resumo de uma partida que contou para o ranking (o perfil mostra as últimas). */
export interface MatchSummary {
  at: number;
  mode: "shooter" | "race";
  /** Pista da corrida (só no rally). */
  track?: string;
  /** Colocação final (1 = vencedor). */
  place: number;
  /** Eliminações (só no tiroteio). */
  kills?: number;
  /** Melhor volta da corrida; null se não fechou nenhuma (só no rally). */
  bestLapMs?: number | null;
}

export interface RankingAccount {
  email: string;
  name: string;
  since: number;
  /** Último boneco e cadeira com que a pessoa jogou logada (usados no replay do recorde). */
  avatar?: AvatarDNA;
  chair?: ChairDNA;
  /** Prêmios bobos ganhos em partidas que contam: nome do prêmio -> vezes. Arquivos antigos não têm: vale vazio. */
  awards?: Record<string, number>;
  /** Últimas partidas que contaram (as mais novas por último). Arquivos antigos não têm: vale vazio. */
  history?: MatchSummary[];
  /** Desafios da semana cumpridos desde que o contador existe (o progresso por semana é podado). */
  challengesDone?: number;
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
  /** Limpezas únicas já aplicadas ao arquivo (ver RESETS no store do servidor). Arquivos antigos não têm. */
  resets?: string[];
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

/** Resposta de GET /api/perfil: tudo do jogador para a página de perfil, sem id de conta nem e-mail. */
export interface PlayerProfile {
  /** Apelido público (o mesmo do link ?perfil=). */
  id: string;
  name: string;
  avatar: AvatarDNA;
  chair: ChairDNA;
  stats: Omit<PlayerStats, "bestLapMs">;
  /** Melhor volta por pista (só as que a pessoa tem); rank é a linha da aba Recordes de volta (e do replay). */
  laps: { track: string; trackName: string; ms: number; rank: number }[];
  /** Pontos do mês atual e posição na aba do mês (null sem pontos). */
  month: { month: string; points: number; position: number | null };
  challenges: { completed: number; week: { text: string; target: number; value: number; done: boolean } };
  /** Prêmios bobos, do mais frequente para o menos. */
  awards: { title: string; count: number }[];
  /** Últimas partidas, da mais nova para a mais antiga. */
  history: (MatchSummary & { trackName?: string })[];
}
