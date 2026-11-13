import * as THREE from "three";
import type { TeamSide } from "@ec/shared";
import type { Character } from "../game/character";
import { DeslizeDeJoelhos, slideDistance } from "../game/joelhos";

export type Comemoracao = "papel" | "caneca" | "cracha" | "dancinha";
export const COMEMORACOES: readonly Comemoracao[] = ["papel", "caneca", "cracha", "dancinha"];

export interface GolCena {
  /** Autor do gol (null no gol contra: só chove papel). */
  scorer: Character | null;
  /** Colegas de time do autor, em campo. */
  mates: Character[];
  /** Goleiro do time que tomou o gol. */
  keeper: Character | null;
  /** Cor do time que fez o gol. */
  color: string;
  /** Onde o gol aconteceu (centro da chuva de papel). */
  at: THREE.Vector3;
}

export interface Ator {
  char: Character;
  side: TeamSide;
}

const PAPER_COUNT = 180;
const PAPER_PALETTE = ["#ffffff", "#ffe14d", "#ff5a3d", "#5ad1ff"];

function badgeTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 320;
  const g = c.getContext("2d")!;
  g.fillStyle = "#3a3a3a";
  g.fillRect(118, 0, 20, 70);
  g.fillStyle = "#fffdf7";
  g.strokeStyle = "#1d1b17";
  g.lineWidth = 8;
  g.beginPath();
  g.roundRect(24, 60, 208, 250, 18);
  g.fill();
  g.stroke();
  g.fillStyle = "#1d1b17";
  g.fillRect(104, 76, 48, 10);
  g.font = "800 30px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText("CRACHÁ", 128, 132);
  g.font = "800 40px system-ui, sans-serif";
  g.fillText("GOLEIRO", 128, 200);
  g.fillStyle = "#c9c4b4";
  g.fillRect(52, 230, 152, 14);
  g.fillRect(52, 256, 100, 14);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stampTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.translate(160, 64);
  g.rotate(-0.28);
  g.strokeStyle = "#d62f2f";
  g.fillStyle = "#d62f2f";
  g.lineWidth = 9;
  g.beginPath();
  g.roundRect(-140, -42, 280, 84, 10);
  g.stroke();
  g.font = "900 46px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("FRANGOU", 0, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mug(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.15, 14), new THREE.MeshStandardMaterial({ color: "#fffdf7", roughness: 0.5 }));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: "#fffdf7", roughness: 0.5 }));
  handle.position.x = 0.075;
  handle.rotation.z = -Math.PI / 2;
  g.add(body, handle);
  return g;
}

/**
 * Comemorações do Futebol da Firma, só visuais. Reaproveitam as animações do boneco (cafe, tchau)
 * e acrescentam adereços criados em código: papel picado, caneca, crachá carimbado, dancinha dos colegas.
 * O autor do gol sempre desliza de joelhos (pose em código, ver game/joelhos.ts), seja qual for a comemoração dos colegas.
 * O motor chama update() depois de posicionar os bonecos no quadro.
 */
/**
 * Uma peça de cada material que só aparece no gol (chuva de papel e caneca), para o motor compilar os shaders antes do
 * apito: sem isso o primeiro gol trava o quadro. Quem chama libera tudo depois.
 */
export function pecasParaAquecer(): THREE.Group {
  const g = new THREE.Group();
  const paper = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.26), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 1);
  paper.setColorAt(0, new THREE.Color("#ffffff"));
  g.add(paper, mug());
  return g;
}

export class Comemoracoes {
  private kind: Comemoracao | null = null;
  private t = 0;
  private props: THREE.Object3D[] = [];
  private scorer: Character | null = null;
  private slide: DeslizeDeJoelhos | null = null;
  private mates: Character[] = [];
  private nextCup = 0;
  private paper: { mesh: THREE.InstancedMesh; seeds: Float32Array; center: THREE.Vector3 } | null = null;
  private stamp: THREE.Sprite | null = null;
  private badge: THREE.Sprite | null = null;
  private dummy = new THREE.Object3D();
  private finalT = 0;
  private finalPlay = 0;

  constructor(private readonly scene: THREE.Scene) {}

  get active(): boolean {
    return this.kind !== null;
  }

  /** Quanto (m) o autor do gol já deslizou para a frente: a câmera da comemoração se afasta dele por esse tanto. */
  get slideDist(): number {
    return this.slide ? slideDistance(this.t) : 0;
  }

  /** Dispara uma comemoração (sorteada se não for informada). */
  start(cena: GolCena, kind: Comemoracao = COMEMORACOES[Math.floor(Math.random() * COMEMORACOES.length)]): void {
    this.clear();
    this.kind = cena.scorer ? kind : "papel";
    this.scorer = cena.scorer;
    this.slide = cena.scorer ? new DeslizeDeJoelhos(cena.scorer.root) : null;
    this.mates = cena.mates;
    this.t = 0;
    this.nextCup = 0;
    if (this.kind === "papel") this.startPaper(cena);
    else if (this.kind === "caneca") {
      for (const c of [cena.scorer, ...cena.mates]) if (c) this.attachMug(c);
    } else if (this.kind === "cracha") this.startBadge(cena);
    else {
      for (const m of cena.mates) m.play("tchau");
    }
  }

  private startPaper(c: GolCena): void {
    const geo = new THREE.PlaneGeometry(0.16, 0.26);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geo, mat, PAPER_COUNT);
    const color = new THREE.Color();
    const seeds = new Float32Array(PAPER_COUNT * 6);
    for (let i = 0; i < PAPER_COUNT; i++) {
      const palette = i % 3 === 0 ? c.color : PAPER_PALETTE[i % PAPER_PALETTE.length];
      mesh.setColorAt(i, color.set(palette));
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 7;
      seeds.set([Math.cos(a) * r, Math.sin(a) * r, Math.random() * 9, 1.4 + Math.random() * 1.2, Math.random() * 6.28, 2 + Math.random() * 5], i * 6);
    }
    mesh.frustumCulled = false;
    this.paper = { mesh, seeds, center: c.at.clone() };
    this.add(mesh);
  }

  private attachMug(c: Character): void {
    const m = mug();
    const hand = c.root.getObjectByName("punho_D");
    if (hand) {
      m.position.set(0, -0.06, 0.04);
      hand.add(m);
    } else {
      m.position.set(0.3, 1.25, 0.25);
      c.root.add(m);
    }
    this.props.push(m);
  }

  private startBadge(c: GolCena): void {
    const k = c.keeper;
    if (!k) return;
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(), transparent: true, depthTest: false }));
    badge.position.set(0, 3.1, 0);
    badge.scale.set(0.001, 0.001, 1);
    badge.renderOrder = 6;
    const stamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: stampTexture(), transparent: true, depthTest: false, opacity: 0 }));
    stamp.position.set(0, 2.85, 0);
    stamp.renderOrder = 7;
    k.root.add(badge, stamp);
    this.badge = badge;
    this.stamp = stamp;
    this.props.push(badge, stamp);
  }

  private add(o: THREE.Object3D): void {
    this.scene.add(o);
    this.props.push(o);
  }

  /** Avança a cena. Chamar depois de os bonecos terem sido posicionados no quadro. */
  update(dt: number): void {
    if (!this.kind) return;
    this.t += dt;
    const t = this.t;
    if (this.kind === "papel" && this.paper) this.updatePaper(t);
    else if (this.kind === "caneca") {
      // o clipe do café dura menos que a comemoração: repete
      if (t >= this.nextCup) {
        this.nextCup = t + 1.1;
        this.scorer?.play("cafe");
        for (const m of this.mates) m.play("cafe");
      }
    } else if (this.kind === "cracha" && this.badge && this.stamp) {
      const pop = Math.min(1, t / 0.35);
      const s = 1.5 * (1 - Math.pow(1 - pop, 3));
      this.badge.scale.set(s * 0.8, s, 1);
      // o carimbo cai em cima do crachá meio segundo depois
      const st = Math.min(1, Math.max(0, (t - 0.6) / 0.15));
      const ss = 2.2 - st * 1.2;
      this.stamp.scale.set(ss * 1.25, ss * 0.5, 1);
      (this.stamp.material as THREE.SpriteMaterial).opacity = st;
    }
    // por último: a pose e o deslize sobrescrevem o que a animação e o motor puseram neste quadro
    this.slide?.apply(t);
  }

  private updatePaper(t: number): void {
    const p = this.paper!;
    const d = this.dummy;
    for (let i = 0; i < PAPER_COUNT; i++) {
      const o = i * 6;
      const [ox, oz, h0, fall, ph, spin] = [p.seeds[o], p.seeds[o + 1], p.seeds[o + 2], p.seeds[o + 3], p.seeds[o + 4], p.seeds[o + 5]];
      // chove sem parar: o papel que chega ao chão volta ao alto, enquanto a cena dura
      const y = 10 + h0 - fall * t;
      const wrapped = ((y % 11) + 11) % 11;
      d.position.set(p.center.x + ox + Math.sin(t * 1.6 + ph) * 0.5, wrapped, p.center.z + oz + Math.cos(t * 1.3 + ph) * 0.5);
      d.rotation.set(t * spin + ph, t * spin * 0.7, ph);
      d.updateMatrix();
      p.mesh.setMatrixAt(i, d.matrix);
    }
    p.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Fim de jogo: quem ganhou pula e acena, quem perdeu fica de cabeça baixa. Chamar todo quadro depois de posicionar os bonecos. */
  final(dt: number, winner: TeamSide | null, atores: Ator[]): void {
    this.finalT += dt;
    const t = this.finalT;
    atores.forEach(({ char, side }, i) => {
      const r = char.root;
      if (winner === null) return;
      if (side === winner) {
        r.position.y += Math.abs(Math.sin(t * 5 + i)) * 0.3;
      } else {
        // cabeça baixa: o corpo pende para a frente
        r.rotation.x = 0.32;
      }
    });
    if (winner !== null && t >= this.finalPlay) {
      this.finalPlay = t + 3.3;
      for (const a of atores) if (a.side === winner) a.char.play("tchau");
    }
  }

  clear(): void {
    this.slide?.restore();
    this.slide = null;
    this.kind = null;
    this.scorer = null;
    this.mates = [];
    this.badge = null;
    this.stamp = null;
    this.paper?.mesh.dispose();
    for (const p of this.props) {
      p.removeFromParent();
      p.traverse((o) => {
        const m = o as THREE.Mesh | THREE.Sprite;
        // a geometria do Sprite é compartilhada pelo three: só a de malha própria morre aqui
        if (!(o as THREE.Sprite).isSprite) (m as THREE.Mesh).geometry?.dispose();
        const mat = m.material as (THREE.Material & { map?: THREE.Texture | null }) | undefined;
        mat?.map?.dispose();
        mat?.dispose();
      });
    }
    this.props = [];
    this.paper = null;
  }

  dispose(): void {
    this.clear();
  }
}
