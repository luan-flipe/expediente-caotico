/** Números do modo corrida. Todas as cadeiras usam os mesmos valores. */
export const RACE = {
  maxSpeed: 16,
  accel: 8,
  brake: 14,
  coastDecel: 4,
  reverseMax: 5,
  turnRate: 2.4,
  minTurnRadius: 3.5,
  spinInPlace: 1.3,
  driftTurnBonus: 0.45,
  driftMinSpeed: 8,
  driftSlipRad: 0.22,
  driftLevel1Ms: 800,
  driftLevel2Ms: 1600,
  boost1Ms: 600,
  boost2Ms: 1000,
  boostSpeed: 22,
  overSpeedDecel: 10,
  wallSpeedKeep: 0.5,
  carpetMax: 0.6,
  carpetWidth: 3,
  kartRadius: 0.7,
  laps: 3,
  /** Tempo antes da largada: cena de abertura do Comandante (introMs) e depois 3, 2, 1. */
  countdownMs: 8000,
  introMs: 5000,
  finishGraceMs: 30000,
  maxRaceMs: 6 * 60000,
  /** Contra o relógio: sessão encerrada sozinha depois de tanto tempo de fase ativa. */
  trainingMaxMs: 20 * 60000,
  /** Contra o relógio não tem número de voltas: um valor que ninguém alcança. */
  trainingLaps: 1_000_000,
  /** Fantasma: uma amostra a cada tantos ticks; volta acima do limite de amostras não vira fantasma. */
  ghostEveryTicks: 3,
  ghostMaxSamples: 3000,
  respawnPenaltyMs: 2000,
  boxRespawnMs: 4000,
  boxRadius: 0.5,
  maxPlayers: 8,
  checkpointEvery: 20,
  /** Saltos maiores que isso (reposição) não contam checkpoint. */
  maxProgressStep: 5,
  wrongWayMs: 1000,
  /** Comandos guardados por jogador; acima disso os mais antigos são descartados. */
  maxQueuedInputs: 6,
  /** Ticks sem comando novo até soltar acelerador e direção (aba escondida, conexão caída). */
  idleInputTicks: 8,
  /** Passos guardados por quem ficou sem comando, para recuperar o atraso (no máximo 2 por tick). */
  maxStepCredit: 4,
};

/** Efeitos dos itens (spec §4.5). */
export const ITEM_FX = {
  expressoMs: 1200,
  triploCharges: 3,
  grampoSpeed: 35,
  grampoTtlMs: 2000,
  grampoRadius: 0.4,
  ownerGraceMs: 400,
  spinMs: 1000,
  pocaSlipMs: 800,
  pocaTtlMs: 20000,
  pocaRadius: 1.3,
  resmaRadius: 0.9,
  resmaTtlMs: 30000,
  resmaSpeedKeep: 0.3,
  aviaoSpeed: 24,
  aviaoRange: 40,
  aviaoTtlMs: 4000,
  aviaoRadius: 0.5,
  aviaoTurnRate: 4,
  pastaMs: 8000,
  postitMs: 2000,
  dropBehind: 2.2,
};
