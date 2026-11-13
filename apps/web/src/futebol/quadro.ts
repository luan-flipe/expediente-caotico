/** Quadros por segundo que o futebol mira: em telas de 120/144 Hz desenha só 60, sobra GPU e o ritmo fica estável. */
export const ALVO_FPS = 60;
const INTERVALO = 1000 / ALVO_FPS;
/** Folga para o requestAnimationFrame que chega um pouco antes da hora (meio quadro de uma tela de 144 Hz). */
const FOLGA = 3.5;
/**
 * Quadro acima disso (ms) conta como lento (abaixo de 40 fps). Não pode ser 20 ms: travado em 60 numa tela de 144 Hz o
 * intervalo alterna 13,9 e 20,8 ms, e metade dos quadros contaria como lenta numa máquina folgada.
 */
const LENTO_MS = 25;
/** Quantos quadros cada decisão de resolução olha. */
const AMOSTRA = 90;
/** Degrau e piso da resolução (pixel ratio) adaptativa. */
const DEGRAU = 0.25;
const PISO = 0.75;

/**
 * Ritmo do quadro: decide se o quadro do requestAnimationFrame desenha (trava em 60 fps sem perder quadros em 60 Hz)
 * e se a resolução precisa cair (a maioria dos quadros lentos em uma amostra baixa um degrau, até o piso).
 */
export class RitmoQuadro {
  private proximo = -Infinity;
  private lentos = 0;
  private amostras = 0;
  private fpsQuadros = 0;
  private fpsDesde = -1;

  /** true quando este quadro deve desenhar. */
  desenha(ms: number): boolean {
    if (ms < this.proximo - FOLGA) return false;
    // atrasou mais de um quadro (aba escondida, travada): recomeça a contar daqui, sem tentar recuperar
    this.proximo = ms - this.proximo > INTERVALO ? ms + INTERVALO : this.proximo + INTERVALO;
    return true;
  }

  /**
   * Conta um quadro desenhado (ms desde o anterior) e devolve a nova resolução quando ela deve cair, senão null.
   * Quadros enormes (aba voltando, carregamento) não contam.
   */
  resolucao(quadroMs: number, atual: number): number | null {
    if (atual <= PISO || quadroMs > 250) return null;
    this.amostras++;
    if (quadroMs > LENTO_MS) this.lentos++;
    if (this.amostras < AMOSTRA) return null;
    const cai = this.lentos > this.amostras / 2;
    this.lentos = 0;
    this.amostras = 0;
    return cai ? Math.max(PISO, atual - DEGRAU) : null;
  }

  /** Zera a amostra (troca de qualidade, nova fase). */
  zerar(): void {
    this.lentos = 0;
    this.amostras = 0;
  }

  /** Conta um quadro desenhado e devolve o FPS a cada meio segundo (senão null). */
  fps(ms: number): number | null {
    if (this.fpsDesde < 0) {
      this.fpsDesde = ms;
      return null;
    }
    this.fpsQuadros++;
    const passou = ms - this.fpsDesde;
    if (passou < 500) return null;
    const fps = Math.round((this.fpsQuadros * 1000) / passou);
    this.fpsQuadros = 0;
    this.fpsDesde = ms;
    return fps;
  }
}
