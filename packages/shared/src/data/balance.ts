/** Números globais do jogo. Ajuste aqui, nunca espalhado pelo código. */
export const BALANCE = {
  tickHz: 30,
  snapshotEvery: 2,

  playerRadius: 0.45,
  moveSpeed: 6.2,
  knockDecayPerSec: 7,

  maxHp: 100,
  ballDamage: 9,
  ballIntervalMs: 350,
  ballSpeed: 34,
  ballRange: 30,
  ballRadius: 0.22,

  dodgeDistance: 4.5,
  dodgeMs: 250,
  dodgeCooldownMs: 3000,

  respawnMs: 3000,
  spawnInvulnMs: 1500,
  stunImmunityMs: 2000,
  maxSlowPct: 0.7,

  countdownMs: 3000,
  evolutionTimeoutMs: 8000,

  assistWindowMs: 8000,
  assistMinDamage: 20,

  scoreKill: 100,
  scoreAssist: 40,
  scoreZoneTick: 10,
  zoneTickMs: 5000,
  scoreZoneCycle: 50,
  objectiveCycleMs: 45000,
  objectiveRadius: 4,

  xpKill: 60,
  xpAssist: 25,
  xpZonePerSec: 4,
  xpCycle: 40,

  statHp: 15,
  statSpeed: 0.08,
  statBall: 0.12,

  levelDamageScale: 0.15,
  levelCooldownScale: 0.06,
  maxAbilities: 3,
  maxAbilityLevel: 5,

  shotHeight: 1.2,
  coverHeight: 1.2,

  maxPlayers: 8,
  reconnectMs: 30000,
  emptyRoomMs: 60000,
} as const;

export const DURATIONS_MS = [180000, 300000, 600000] as const;
