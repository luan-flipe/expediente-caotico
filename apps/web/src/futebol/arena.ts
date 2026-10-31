import * as THREE from "three";
import type { Field } from "@ec/shared";
import { ANUNCIANTES, ROTACAO_ANUNCIOS_S, type Anunciante } from "./anunciantes";
import { BOARD_H, BOARD_LEN, BOARD_TILT, adIndex, adStep, boardSlots, frameRects, type BoardSlot } from "./arenaLayout";

const FRAME_Y = 0.012;
const TILE_M = 5;

/** Piso do entorno: terra batida clara, bem diferente do gramado, para a área sem uso não parecer parte do campo. Gerada por código. */
function groundTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#b8976a";
  g.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const l = 48 + rnd() * 20;
    g.fillStyle = `hsl(${30 + rnd() * 12} ${28 + rnd() * 14}% ${l}%)`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 2 + rnd() * 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const AD_W = 512;
const AD_H = Math.round((AD_W * BOARD_H * 0.9) / (BOARD_LEN - 0.2));

/** Desenha uma placa: fundo, pontinhos de LED, logo (se houver) ou o nome. */
function drawAd(g: CanvasRenderingContext2D, a: Anunciante, img?: HTMLImageElement): void {
  g.fillStyle = a.cor;
  g.fillRect(0, 0, AD_W, AD_H);
  g.fillStyle = "rgba(0,0,0,0.12)";
  for (let y = 0; y < AD_H; y += 4) g.fillRect(0, y, AD_W, 1);
  if (a.destaque) {
    g.strokeStyle = a.corTexto;
    g.lineWidth = 6;
    g.setLineDash([22, 14]);
    g.strokeRect(8, 8, AD_W - 16, AD_H - 16);
    g.setLineDash([]);
  }
  if (img?.complete && img.naturalWidth > 0) {
    const k = Math.min((AD_W * 0.86) / img.naturalWidth, (AD_H * 0.8) / img.naturalHeight);
    g.drawImage(img, (AD_W - img.naturalWidth * k) / 2, (AD_H - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
    return;
  }
  let size = 64;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = a.corTexto;
  do {
    g.font = `800 ${size}px 'Bricolage Grotesque', sans-serif`;
    size -= 4;
  } while (g.measureText(a.nome).width > AD_W * 0.86 && size > 18);
  g.fillText(a.nome, AD_W / 2, AD_H / 2 + 3);
}

/**
 * Entorno do campo: moldura de piso por cima do gramado do mapa fora do campo jogável
 * e placas de LED em volta. Só objetos novos na cena; o mapa não é tocado.
 */
export class Arena {
  private group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private faces: THREE.InstancedMesh[] = [];
  private slots: BoardSlot[];
  private step = -1;
  private tex: THREE.CanvasTexture[] = [];
  private tmp = new THREE.Object3D();
  private redraws: (() => void)[] = [];
  private dead = false;
  private back: THREE.InstancedMesh | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    f: Field,
    private readonly ads: readonly Anunciante[] = ANUNCIANTES,
  ) {
    this.buildFrame(f);
    this.slots = boardSlots(f);
    this.buildBoards();
    this.scene.add(this.group);
  }

  private own<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  private buildFrame(f: Field): void {
    const tex = this.own(groundTexture());
    const mat = this.own(new THREE.MeshStandardMaterial({ map: tex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    for (const r of frameRects(f)) {
      const geo = this.own(new THREE.PlaneGeometry(r.w, r.d));
      // textura em escala fixa: o tile se repete a cada TILE_M metros
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * r.w) / TILE_M, (uv.getY(i) * r.d) / TILE_M);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(r.x, FRAME_Y, r.z);
      m.receiveShadow = true;
      this.group.add(m);
    }
  }

  private buildBoards(): void {
    const n = this.slots.length;
    if (!n) return;
    const body = this.own(new THREE.InstancedMesh(this.own(new THREE.BoxGeometry(BOARD_LEN, BOARD_H, 0.14)), this.own(new THREE.MeshStandardMaterial({ color: "#14120f", roughness: 0.6 })), n));
    this.group.add(body);
    const faceGeo = this.own(new THREE.PlaneGeometry(BOARD_LEN - 0.2, BOARD_H * 0.9));
    this.ads.forEach((a, i) => {
      const c = document.createElement("canvas");
      c.width = AD_W;
      c.height = AD_H;
      const g = c.getContext("2d")!;
      let img: HTMLImageElement | undefined;
      const t = this.own(new THREE.CanvasTexture(c));
      const redraw = () => {
        if (this.dead) return;
        drawAd(g, a, img);
        t.needsUpdate = true;
      };
      redraw();
      this.redraws.push(redraw);
      t.colorSpace = THREE.SRGBColorSpace;
      this.tex.push(t);
      if (a.imagem) {
        const im = new Image();
        im.onload = () => {
          img = im;
          redraw();
        };
        im.src = a.imagem;
      }
      const face = this.own(new THREE.InstancedMesh(faceGeo, this.own(new THREE.MeshBasicMaterial({ map: t, toneMapped: false })), n));
      face.userData.ad = i;
      face.frustumCulled = false;
      this.faces.push(face);
      this.group.add(face);
    });
    this.buildBack(n);
    // a fonte do nome pode chegar depois: redesenha quando carregar
    void document.fonts?.ready.then(() => this.redraws.forEach((f) => f()));
    // corpo das placas: matriz fixa
    const o = this.tmp;
    this.slots.forEach((s, i) => {
      this.place(o, s, 0);
      body.setMatrixAt(i, o.matrix);
      if (this.back) {
        // verso: mesma inclinação, virado para fora
        o.rotation.set(BOARD_TILT, s.yaw + Math.PI, 0);
        o.position.set(s.x, (BOARD_H / 2) * Math.cos(BOARD_TILT), s.z);
        o.translateZ(0.075);
        o.updateMatrix();
        this.back.setMatrixAt(i, o.matrix);
      }
    });
    if (this.back) this.back.instanceMatrix.needsUpdate = true;
    body.instanceMatrix.needsUpdate = true;
    body.frustumCulled = false;
    this.assign(0);
  }

  /** Verso das placas: painel de LED desligado com o mesmo amarelo do destaque, em vez de uma faixa preta. */
  private buildBack(n: number): void {
    const c = document.createElement("canvas");
    c.width = AD_W;
    c.height = AD_H;
    const g = c.getContext("2d")!;
    g.fillStyle = "#26231f";
    g.fillRect(0, 0, AD_W, AD_H);
    g.fillStyle = "#34302a";
    for (let x = 0; x < AD_W; x += 64) g.fillRect(x, 0, 3, AD_H);
    g.fillStyle = "#ffd21f";
    g.fillRect(0, AD_H - 10, AD_W, 10);
    const t = this.own(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    const back = this.own(new THREE.InstancedMesh(this.own(new THREE.PlaneGeometry(BOARD_LEN - 0.2, BOARD_H * 0.9)), this.own(new THREE.MeshBasicMaterial({ map: t })), n));
    back.frustumCulled = false;
    this.back = back;
    this.group.add(back);
  }

  /** Coloca `o` na placa `s`; `lift` afasta a face do corpo. */
  private place(o: THREE.Object3D, s: BoardSlot, lift: number): void {
    o.rotation.order = "YXZ";
    o.rotation.set(-BOARD_TILT, s.yaw, 0);
    // o centro sobe com a inclinação e a face fica um pouco à frente do corpo (ao longo da normal inclinada)
    o.position.set(s.x, (BOARD_H / 2) * Math.cos(BOARD_TILT), s.z);
    o.translateZ(lift);
    o.updateMatrix();
  }

  /** Reparte as placas entre os anunciantes para o passo do rodízio. */
  private assign(step: number): void {
    if (step === this.step || !this.faces.length) return;
    this.step = step;
    const counts = this.faces.map(() => 0);
    const o = this.tmp;
    this.slots.forEach((s, i) => {
      const a = adIndex(i, step, this.faces.length);
      this.place(o, s, 0.075);
      this.faces[a].setMatrixAt(counts[a]++, o.matrix);
    });
    this.faces.forEach((f, a) => {
      f.count = counts[a];
      f.instanceMatrix.needsUpdate = true;
    });
  }

  /** `t` em segundos desde o começo da partida. */
  update(t: number): void {
    this.assign(adStep(t, ROTACAO_ANUNCIOS_S));
  }

  dispose(): void {
    this.dead = true;
    this.scene.remove(this.group);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.faces = [];
  }
}
