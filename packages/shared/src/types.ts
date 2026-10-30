import type { BotLevel } from "./botLevels";
export type Vec2 = { x: number; z: number };

export type AbilityId = "A1" | "A2" | "A3" | "B1" | "B2" | "B3" | "C1" | "C2" | "C3" | "D1" | "D2" | "D3";
export type Spec = "A" | "B";

export interface AvatarDNA {
  name: string;
  /** Índice de MODELS: 0 monta o boneco pelo crachá, os demais são skins prontas. */
  model: number;
  skin: number;
  hair: number;
  hairColor: number;
  eyes: number;
  /** Índice de FACES (0 = neutro, o rosto da textura do boneco). */
  face: number;
  /** Peça da pasta de barbas (0 = sem barba), como o cabelo. */
  beard: number;
  /** Índice de HAIR_COLORS para a barba; crachá antigo sem o campo herda a cor do cabelo. */
  beardColor: number;
  glasses: number;
  /** Índice de TOPS: modelo da parte de cima, na cor de shirt. */
  top: number;
  /** Índice de BOTTOMS: modelo da parte de baixo, na cor de pants. O Vestido de TOPS dispensa. */
  bottom: number;
  shirt: number;
  pants: number;
  shoes: number;
  accessory: number;
  height: number;
}

export type StatusKind = "stun" | "blind" | "slow" | "haste";
export interface Status {
  kind: StatusKind;
  until: number;
  mag: number;
}

export interface OwnedAbility {
  id: AbilityId;
  level: number;
  spec?: Spec;
  readyAt: number;
}

export interface PlayerInput {
  mx: number;
  mz: number;
  yaw: number;
  fire: boolean;
}

export type PlayerAction =
  | { kind: "dodge"; yaw: number }
  | { kind: "ability"; slot: number; yaw: number; dist: number };

export type StatId = "hp" | "speed" | "ball";

export interface EvolutionOption {
  id: string;
  type: "unlock" | "upgrade" | "spec" | "stat";
  abilityId?: AbilityId;
  spec?: Spec;
  stat?: StatId;
  fromLevel?: number;
  toLevel?: number;
  title: string;
  desc: string;
}

export interface BotBrain {
  strafe: number;
  nextThink: number;
  targetId: string | null;
}

export interface PlayerSim {
  id: string;
  name: string;
  avatar: AvatarDNA;
  isBot: boolean;
  isZombie?: boolean;
  zombieDamage?: number;
  lastZombieAttackAt?: number;
  connected: boolean;
  pos: Vec2;
  yaw: number;
  moving: boolean;
  push: Vec2;
  hp: number;
  maxHp: number;
  shield: number;
  shieldUntil: number;
  alive: boolean;
  respawnAt: number;
  invulnUntil: number;
  stunImmuneUntil: number;
  statuses: Status[];
  input: PlayerInput;
  actions: PlayerAction[];
  lastShotAt: number;
  dodgeReadyAt: number;
  dodgeUntil: number;
  dodgeDir: Vec2;
  dashUntil: number;
  dashDir: Vec2;
  dashSpeed: number;
  dashHit: string[];
  xp: number;
  level: number;
  abilities: OwnedAbility[];
  options: EvolutionOption[] | null;
  /** Incrementa a cada rodada de opções; a escolha precisa citar a rodada certa. */
  choiceSeq: number;
  optionsExpireAt: number;
  pendingLevels: number;
  stats: Record<StatId, number>;
  score: number;
  kills: number;
  deaths: number;
  assists: number;
  damageLog: { from: string; amount: number; at: number }[];
  zoneMs: number;
  zoneCycleMs: number;
  /** Contadores só para os prêmios do fim: disparos da bola, acertos dela, dano causado e esquivas. */
  shots: number;
  shotHits: number;
  damageDealt: number;
  dodges: number;
  bot?: BotBrain;
}

export interface AbilityParams {
  damage?: number;
  range?: number;
  radius?: number;
  count?: number;
  spreadDeg?: number;
  speed?: number;
  knock?: number;
  stunMs?: number;
  blindMs?: number;
  slowMs?: number;
  slowPct?: number;
  shield?: number;
  heal?: number;
  durationMs?: number;
  hasteMult?: number;
  chains?: number;
  chainRange?: number;
  tickMs?: number;
  pierce?: boolean;
  cooldownPct?: number;
}

export interface Projectile {
  id: number;
  owner: string;
  kind: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  ttl: number;
  damage: number;
  params: AbilityParams;
  hit: string[];
}

export interface AbilityZone {
  id: number;
  owner: string;
  kind: AbilityId;
  x: number;
  z: number;
  radius: number;
  until: number;
  nextTick: number;
  params: AbilityParams;
}

export interface Objective {
  index: number;
  x: number;
  z: number;
  radius: number;
  cycleEndsAt: number;
  owner: string | null;
  contested: boolean;
}

export type GameEvent =
  | { type: "kill"; killer: string | null; victim: string; assists: string[] }
  | { type: "hit"; target: string; from: string | null; amount: number; x: number; z: number }
  | { type: "fx"; kind: string; x: number; z: number; yaw?: number; radius?: number; pts?: Vec2[]; owner?: string }
  | { type: "info"; text: string; player?: string };

export type Phase = "countdown" | "active" | "finished";

export interface ZombieWaveState {
  wave: number;
  maxWaves: number;
  remainingZombies: number;
  waveState: "waiting" | "active" | "cleared" | "defeat" | "victory";
  nextWaveCountdownMs: number;
}

export interface ZombieInternalState {
  wave: number;
  maxWaves: number;
  waveState: "waiting" | "active" | "cleared" | "defeat" | "victory";
  nextWaveAt: number;
  totalZombiesInWave: number;
  spawnedZombiesInWave: number;
  nextSpawnAt: number;
  aliveZombies: number;
  waveHp: number;
  waveDamage: number;
  waveSpeed: number;
}

export interface Match {
  now: number;
  phase: Phase;
  submode?: "pvp" | "zombies";
  zombieState?: ZombieInternalState;
  countdownEndsAt: number;
  endsAt: number;
  durationMs: number;
  players: Map<string, PlayerSim>;
  projectiles: Projectile[];
  zones: AbilityZone[];
  objective: Objective;
  events: GameEvent[];
  /** Opção do anfitrião: dificuldade dos bots. */
  botLevel: BotLevel;
  rng: () => number;
  nextId: number;
  /** Semente da partida: também decide o sorteio dos prêmios. */
  seed: number;
}

export interface PublicAbility {
  id: AbilityId;
  level: number;
  spec?: Spec;
}

export interface PublicPlayer {
  id: string;
  name: string;
  x: number;
  z: number;
  y?: number;
  yaw: number;
  hp: number;
  maxHp: number;
  shield: number;
  alive: boolean;
  level: number;
  score: number;
  kills: number;
  deaths: number;
  assists: number;
  flags: string[];
  moving: boolean;
  isBot: boolean;
  isZombie?: boolean;
  connected: boolean;
  abilities: PublicAbility[];
}

export interface Snapshot {
  t: number;
  phase: Phase;
  remainingMs: number;
  countdownMs: number;
  zombieWave?: ZombieWaveState;
  players: PublicPlayer[];
  projectiles: { id: number; kind: string; x: number; z: number; vx: number; vz: number; owner: string; radius: number }[];
  zones: { id: number; kind: AbilityId; x: number; z: number; radius: number; owner: string }[];
  objective: { x: number; z: number; radius: number; owner: string | null; contested: boolean; cycleMs: number };
  events: GameEvent[];
}

export interface PrivateState {
  xp: number;
  xpNext: number;
  level: number;
  abilities: (PublicAbility & { readyInMs: number; cooldownMs: number })[];
  dodgeInMs: number;
  options: EvolutionOption[] | null;
  optionsSeq: number;
  optionsInMs: number;
  pendingLevels: number;
  synergies: string[];
  stats: Record<StatId, number>;
  respawnInMs: number;
  speedMult: number;
  blindMs: number;
  stunned: boolean;
}

export interface ResultRow {
  id: string;
  name: string;
  avatar: AvatarDNA;
  isBot: boolean;
  isZombie?: boolean;
  score: number;
  kills: number;
  deaths: number;
  assists: number;
  abilities: PublicAbility[];
  rank: number;
  tie: boolean;
  teamResult?: "victory" | "defeat";
  waveReached?: number;
}
