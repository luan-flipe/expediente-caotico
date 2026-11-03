import * as THREE from "three";
import { PRESETS, type AvatarDNA, type Field, type FutTeamConfig } from "@ec/shared";
import { createCharacter, type Character } from "../game/character";
import { refereeColor, uniformDNA } from "./uniforme";

/** Distância (m) que o juiz mantém da bola, velocidade (m/s) de corrida dele e folga (m) da linha do campo. */
const KEEP = 9;
const SPEED = 6.5;
const EDGE = 2;
/** Quanto (s) o cartão fica erguido e o apito/aceno dura. */
const CARD_S = 2.4;
const POINT_S = 1.6;

/**
 * Juiz em campo: o mesmo boneco do jogo com camisa de cor própria, sem time. Só visual (fora da sim): segue a jogada de
 * longe, olhando para a bola, não toca nela, aponta a falta e ergue o cartão. A posição sai da bola do snapshot, então
 * todo mundo vê o juiz mais ou menos no mesmo lugar.
 */
export class Juiz {
  readonly char: Character;
  private card: THREE.Mesh;
  private cardLeft = 0;
  private pointLeft = 0;
  private facing = 0;
  private speed = 0;
  private colorKey: string;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly field: Field,
    teams: [FutTeamConfig, FutTeamConfig],
  ) {
    this.colorKey = teams.map((t) => t.color).join("/");
    this.char = createCharacter(this.dna(teams));
    this.char.root.rotation.order = "YXZ";
    this.char.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
    // cartão na mão erguida (aparece só quando mostrado)
    this.card = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.02), new THREE.MeshBasicMaterial({ color: "#f2b632" }));
    this.card.position.set(0.32, 2.15, 0.12);
    this.card.visible = false;
    this.char.root.add(this.card);
    this.char.root.position.set(-KEEP, 0, field.halfW * 0.5);
    this.scene.add(this.char.root);
  }

  private dna(teams: [FutTeamConfig, FutTeamConfig]): AvatarDNA {
    return uniformDNA(PRESETS[3 % PRESETS.length].dna, { name: "Juiz", kit: 0, color: refereeColor(teams) });
  }

  /** Aponta para o local da falta e olha para ele. */
  foul(x: number, z: number): void {
    const p = this.char.root.position;
    this.facing = Math.atan2(x - p.x, z - p.z);
    this.pointLeft = POINT_S;
    this.char.playTaunt?.("point", POINT_S);
  }

  /** Ergue o cartão (amarelo ou vermelho). */
  showCard(card: "yellow" | "red"): void {
    (this.card.material as THREE.MeshBasicMaterial).color.set(card === "yellow" ? "#f2b632" : "#e2483c");
    this.card.visible = true;
    this.cardLeft = CARD_S;
    this.char.playTaunt?.("fist", CARD_S);
  }

  /** Segue a jogada: fica a KEEP metros da bola, do lado do centro do campo, sem passar das linhas. */
  update(dt: number, ballX: number, ballZ: number): void {
    const p = this.char.root.position;
    if (this.cardLeft > 0) {
      this.cardLeft -= dt;
      if (this.cardLeft <= 0) this.card.visible = false;
    }
    this.pointLeft = Math.max(0, this.pointLeft - dt);

    // ponto de espera: da bola em direção ao centro do campo (diagonal), a KEEP metros dela
    let dx = -ballX;
    let dz = -ballZ;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) {
      dx = 0;
      dz = 1;
    } else {
      dx /= len;
      dz /= len;
    }
    const tx = Math.max(-this.field.halfL + EDGE, Math.min(this.field.halfL - EDGE, ballX + dx * KEEP));
    const tz = Math.max(-this.field.halfW + EDGE, Math.min(this.field.halfW - EDGE, ballZ + dz * KEEP));
    const ex = tx - p.x;
    const ez = tz - p.z;
    const d = Math.hypot(ex, ez);
    const step = Math.min(d, SPEED * dt);
    if (d > 0.3) {
      p.x += (ex / d) * step;
      p.z += (ez / d) * step;
    }
    // nunca em cima da bola (sem colisão: só não atrapalha a vista)
    const bx = p.x - ballX;
    const bz = p.z - ballZ;
    const bd = Math.hypot(bx, bz);
    if (bd < KEEP * 0.5 && bd > 1e-3) {
      p.x = ballX + (bx / bd) * KEEP * 0.5;
      p.z = ballZ + (bz / bd) * KEEP * 0.5;
    }
    this.speed = d > 0.3 ? step / dt : 0;
    if (this.pointLeft <= 0) this.facing = Math.atan2(ballX - p.x, ballZ - p.z);
    let diff = (this.facing - this.char.root.rotation.y) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    this.char.root.rotation.y += diff * Math.min(1, dt * 8);
    this.char.update(dt, Math.min(1, this.speed / 6));
  }

  /** Cor da camisa mudou (times trocaram de cor): refaz o boneco. */
  retint(teams: [FutTeamConfig, FutTeamConfig]): boolean {
    const key = teams.map((t) => t.color).join("/");
    return key !== this.colorKey;
  }

  dispose(): void {
    this.scene.remove(this.char.root);
    this.card.geometry.dispose();
    (this.card.material as THREE.Material).dispose();
    this.char.dispose();
  }
}
