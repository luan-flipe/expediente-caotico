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

export interface RankingView {
  mes: RankingTab<MonthRow>;
  tiroteio: RankingTab<ShooterRow>;
  rally: RankingTab<RallyRow>;
  voltas: RankingTab<LapRow>;
  /** Líder do mês anterior ("Funcionário do mês passado"). */
  mesPassado: { month: string; id: string; name: string; points: number } | null;
}
