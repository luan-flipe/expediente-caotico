export const FUT = {
  restartWaitMs: 8000,
  restartCountdownMs: 3000,
  walkSpeed: 6,
  sprintSpeed: 8.5,
  /** Inércia: aceleração (m/s2) até a velocidade de andar e daí até a de corrida, frenagem, e aderência lateral ao virar (andando e correndo). */
  accelWalk: 14.5,
  accelSprint: 5,
  brake: 22,
  gripWalk: 24,
  gripRun: 14,
  /** Multiplicadores da aceleração: conduzindo a bola, goleiro, e logo depois de perder a bola (por recoverMs). */
  carryAccel: 0.85,
  keeperAccel: 1.15,
  recoverAccel: 0.1,
  recoverMs: 400,
  doubleTapMs: 250,
  controlRadius: 0.9,
  /** Condução: a bola fica a dribbleTouch (m) do boneco andando e a sprintTouch na velocidade máxima (proporcional à velocidade entre as duas). */
  dribbleTouch: 0.55,
  sprintTouch: 0.9,
  /** Tempo (ms) para a carga de chute/passe chegar à força máxima. */
  chargeMaxMs: 400,
  shotMin: 10,
  shotMax: 28,
  passMin: 6,
  passMax: 18,
  ballRadius: 0.25,
  /** Chute forte: a partir desta força (0..1) a bola sobe; no máximo, a velocidade vertical é loftMax x a velocidade. */
  loftFrom: 0.5,
  loftMax: 0.42,
  /** Lançamento do goleiro (passe longo): razão vertical/velocidade e distância (m) a partir da qual lança em vez de rolar. */
  lobRatio: 0.6,
  lobFrom: 16,
  /** Velocidade horizontal máxima (m/s) do lançamento do goleiro (o passe comum para em passMax): alcança o outro lado do gramado inteiro. */
  lobMax: 21,
  /** Chute assistido: alcance (m) até a linha do gol, abertura lateral (em meias-traves) e imprecisão (rad) base, por força e por pressão. */
  assistRange: 32,
  assistReach: 2.4,
  assistErr: 0.012,
  assistErrPower: 0.03,
  assistErrPressure: 0.035,
  /** Chute assistido: o canto fica a esta fração da meia-trave; força a partir da qual vai no ângulo (alto), altura do alvo alto (m) e raio de pressão (m). */
  assistCorner: 0.78,
  assistHighFrom: 0.55,
  assistHighY: 1.6,
  assistPressureDist: 3,
  /** Falta: distância (m) da barreira à bola, efeito (rad/s) da cobrança, altura (m) que a bola precisa ter na barreira e folga (m) sob o travessão. */
  wallDist: 9,
  freeKickCurve: 0.3,
  wallClear: 2.25,
  barSlack: 0.35,
  /** Disputa em pé com velocidade de encontro acima disso (m/s) é tranco forte (falta se vier por trás ou for em corrida). */
  shoveSpeed: 6,
  /** A cada tantas faltas o jogador leva amarelo. */
  foulsForYellow: 3,
  goalCelebrateMs: 4000,
  kickoffWaitMs: 2000,
  gravity: 9.8,
  bounce: 0.55,
  groundFrictionPerSec: 0.35,
  ballStopSpeed: 0.05,
} as const;

/** Modelos de uniforme (kit = índice). */
export const FUT_KITS = ["Lisa", "Listrada", "Faixa"] as const;

/** Cores de uniforme (color = índice). O hex é o mesmo de CLOTH_COLORS (data/avatar.ts), para a camisa sair igual ao placar. */
export const FUT_COLORS = [
  { name: "Branco", hex: "#f4f1ea" },
  { name: "Preto", hex: "#232323" },
  { name: "Azul", hex: "#2f6fdf" },
  { name: "Ciano", hex: "#3fb8c4" },
  { name: "Verde", hex: "#24a06b" },
  { name: "Amarelo", hex: "#f2b632" },
  { name: "Vermelho", hex: "#e2483c" },
  { name: "Roxo", hex: "#7b4bd6" },
] as const;
/** Mapa Ipatingão já na escala do jogo (metros, centrado na origem, eixo comprido em X): meio comprimento e meia largura das linhas, e o gol que o próprio mapa traz (meia-boca 3,29 m, altura 2,27 m). */
/** Medidas do mapa ipatingao.glb: gramado e o gol que o mapa já traz (boca 3,29 m de cada lado, 2,27 m de altura). */
export const IPATINGAO = {
  grassHalfL: 48.52,
  grassHalfW: 30.35,
  goalHalfW: 3.29,
  goalH: 2.27,
  // linhas pintadas na textura do gramado (340x520 px, 0,2017 m/px), medidas pela borda de fora da linha, a partir da linha de fundo
  boxL: 14.72,
  boxHalfW: 17.85,
  penaltySpot: 10.59,
} as const;
