import type { ItemId } from "@ec/shared";

/**
 * Pose dinâmica na cadeira de corrida: inclinação do corpo, cabeça na curva, braços esterçando, pés no
 * drift e o gesto de cada item. Os ângulos saem como desvio da pose sentada parada (0 = como sentou),
 * em radianos em volta de x, y e z do osso; o boneco aplica nos ossos dele.
 */
export interface SeatedAngles {
  head: [number, number, number];
  body: [number, number, number];
  armD: [number, number, number];
  armE: [number, number, number];
  legD: number;
  legE: number;
}

/** Braço no apoio e perna para a frente na pose sentada parada (a referência dos desvios). */
const ARM_REST = -0.75;
const LEG_REST = -Math.PI / 2;

export class SeatedPose {
  private headX = 0;
  private headY = 0;
  private headZ = 0;
  private bodyX = 0;
  private bodyZ = 0;
  private armD = ARM_REST;
  private armE = ARM_REST;
  private legD = LEG_REST;
  private legE = LEG_REST;
  private gesture: { item: ItemId; time: number; duration: number } | null = null;

  playItemGesture(item: ItemId): void {
    this.gesture = { item, time: 0, duration: 0.45 };
  }

  step(dt: number, speed: number, steer: number, driftDir: number, boosting: boolean): SeatedAngles {
    // Proporção de velocidade para a postura aerodinâmica de vácuo (a partir de 4 m/s até a velocidade máxima)
    const speedRatio = Math.min(1, Math.max(0, (speed - 4) / 12));

    // Gestos animados para cada power-up / item usado
    let gArmD_x = 0;
    let gArmD_y = 0;
    let gArmD_z = 0;
    let gArmE_x = 0;
    let gArmE_y = 0;
    let gArmE_z = 0;
    let gBody_x = 0;
    let gBody_y = 0;
    let gBody_z = 0;
    let gHead_x = 0;
    let gHead_y = 0;

    if (this.gesture) {
      this.gesture.time += dt;
      const u = this.gesture.time / this.gesture.duration;
      if (u >= 1) {
        this.gesture = null;
      } else {
        const peak = Math.sin(u * Math.PI);
        switch (this.gesture.item) {
          case "resma":
            // Jogar resma pesada para trás: gira tronco e braço direito arremessa para trás
            gBody_y = -0.35 * peak;
            gBody_x = 0.12 * peak;
            gArmD_x = 1.35 * peak;
            gArmD_y = -0.25 * peak;
            gArmD_z = 0.3 * peak;
            gHead_y = -0.25 * peak;
            break;
          case "pasta":
            // Pasta do Jurídico: postura de bloqueio/escudo defensivo com os dois braços
            gArmD_x = -0.75 * peak;
            gArmD_z = -0.35 * peak;
            gArmE_x = -0.75 * peak;
            gArmE_z = 0.35 * peak;
            gBody_x = 0.15 * peak;
            gHead_x = -0.2 * peak;
            break;
          case "aviao":
            // Aviãozinho de papel: arremesso vigoroso por cima do ombro
            if (u < 0.35) {
              const p = u / 0.35;
              gArmD_x = 0.5 * p;
              gArmD_z = -0.25 * p;
              gBody_y = 0.2 * p;
              gHead_y = 0.15 * p;
            } else {
              const p = (1 - u) / 0.65;
              gArmD_x = -0.95 * p;
              gArmD_z = 0.15 * p;
              gBody_x = -0.2 * p;
              gHead_x = 0.2 * p;
            }
            break;
          case "grampeador":
            // Disparo do grampeador: mira à frente e recuo no disparo
            if (u < 0.25) {
              const p = u / 0.25;
              gArmD_x = -0.8 * p;
            } else {
              const p = (1 - u) / 0.75;
              gArmD_x = -0.3 * p;
              gArmD_z = 0.15 * p;
              gBody_x = 0.12 * p;
            }
            break;
          case "poca":
            // Poça de café: despeja a caneca quente pelo lado/traseira esquerda
            gBody_z = -0.22 * peak;
            gBody_y = 0.18 * peak;
            gArmE_x = 1.15 * peak;
            gArmE_y = 0.25 * peak;
            gArmE_z = -0.4 * peak;
            gHead_y = 0.3 * peak;
            break;
          case "postit":
            // Tapa de post-it na tela: estocada rápida com a palma aberta para a frente
            gArmD_x = -0.9 * peak;
            gArmD_z = 0.2 * peak;
            gBody_x = -0.15 * peak;
            gHead_x = 0.25 * peak;
            break;
          case "expresso":
          case "triplo":
            // Gole rápido de café puro antes da arrancada
            gArmD_x = -0.6 * peak;
            gArmD_z = -0.25 * peak;
            gHead_x = -0.3 * peak;
            break;
        }
      }
    }

    // 1. Inclinação do corpo para a frente: no boost de café mergulha (~17°), em alta velocidade pega
    // vácuo (~11°). Nunca inclina para trás, para não atravessar o encosto da cadeira.
    const targetBodyX = Math.max(0, (boosting ? 0.3 : speed > 2 ? 0.2 * speedRatio : 0) + gBody_x);
    // 2. Com o tronco inclinado para a frente, a cabeça ergue o queixo para mirar a pista
    const targetHeadX = (boosting ? -0.24 : speed > 2 ? -0.15 * speedRatio : 0) + gHead_x;
    // 3. Olhar e inclinação na curva e no drift
    const targetHeadY = -steer * 0.38 - driftDir * 0.42 + gHead_y;
    const targetHeadZ = steer * 0.08 + driftDir * 0.12;
    const targetBodyZ = (driftDir !== 0 ? driftDir * 0.18 : -steer * 0.12) + gBody_z;
    // 4. Braços firmes esticados nos apoios
    const armForward = boosting ? -0.2 : -speedRatio * 0.1;
    const targetArmD = ARM_REST + armForward + steer * 0.22 + driftDir * 0.18 + gArmD_x;
    const targetArmE = ARM_REST + armForward - steer * 0.22 - driftDir * 0.18 + gArmE_x;

    const k = Math.min(1, dt * 12);
    this.headX += (targetHeadX - this.headX) * k;
    this.headY += (targetHeadY - this.headY) * k;
    this.headZ += (targetHeadZ - this.headZ) * k;
    this.bodyX += (targetBodyX - this.bodyX) * k;
    this.bodyZ += (targetBodyZ - this.bodyZ) * k;
    this.armD += (targetArmD - this.armD) * k;
    this.armE += (targetArmE - this.armE) * k;

    // Vibração intensa de alta frequência do café expresso (efeito cafeína pura no turbo)
    const now = performance.now();
    const jitterTorsoX = boosting ? Math.sin(now * 0.065) * 0.025 : 0;
    const jitterTorsoY = boosting ? Math.cos(now * 0.052) * 0.02 : 0;
    const jitterHeadX = boosting ? -Math.sin(now * 0.07) * 0.025 : 0;
    const jitterHeadZ = boosting ? Math.cos(now * 0.06) * 0.02 : 0;
    const jitterArm = boosting ? Math.sin(now * 0.08) * 0.035 : 0;

    // Pé no chão no drift para apoio e remadas na arrancada lenta
    let legD = LEG_REST;
    let legE = LEG_REST;
    if (driftDir > 0) {
      legD += 0.38; // pé direito raspa no asfalto apoiando o drift à direita
    } else if (driftDir < 0) {
      legE += 0.38; // pé esquerdo raspa no asfalto apoiando o drift à esquerda
    } else if (speed > 0.1 && speed < 3.2) {
      const push = Math.sin(now * 0.012);
      legD += Math.max(0, push) * 0.32;
      legE += Math.max(0, -push) * 0.32;
    }
    const kl = Math.min(1, dt * 10);
    this.legD += (legD - this.legD) * kl;
    this.legE += (legE - this.legE) * kl;

    return {
      head: [this.headX + jitterHeadX, this.headY, this.headZ + jitterHeadZ],
      body: [Math.max(0, this.bodyX + jitterTorsoX), (boosting ? jitterTorsoY : 0) + gBody_y, this.bodyZ],
      armD: [this.armD + jitterArm - ARM_REST, gArmD_y, gArmD_z],
      armE: [this.armE - jitterArm - ARM_REST, gArmE_y, gArmE_z],
      legD: this.legD - LEG_REST,
      legE: this.legE - LEG_REST,
    };
  }
}
