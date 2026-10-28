import * as THREE from "three";
import { CHAT_BUBBLE_MS, CHAT_EMOTES, CHAT_PHRASES } from "@ec/shared";
import { Canvas2D } from "./canvas";

/** Texto de uma mensagem do chat rápido, a partir do que o servidor mandou (índice inválido vira null). */
export function chatText(kind: "phrase" | "emote", index: number): string | null {
  return (kind === "phrase" ? CHAT_PHRASES[index] : CHAT_EMOTES[index]) ?? null;
}

function makeBubble(text: string, emote: boolean): THREE.Sprite {
  const g = new Canvas2D(384, 128);
  g.fillStyle = "#fffdf7";
  g.strokeStyle = "#14120f";
  g.lineWidth = 6;
  g.speechBubble(8, 8, 368, 88, 28, 192, 122, 20);
  g.fillStyle = "#14120f";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = emote ? "56px emoji" : "800 40px 'Bricolage Grotesque', sans-serif";
  g.fillText(text, 192, 54, 340);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.texture(), depthTest: false, transparent: true }));
  s.scale.set(2.4, 0.8, 1);
  s.renderOrder = 6;
  return s;
}

/** Balões de chat sobre os bonecos/cadeiras, um por jogador, que somem sozinhos depois de CHAT_BUBBLE_MS. */
export class ChatBubbles {
  private items = new Map<string, { sprite: THREE.Sprite; until: number }>();

  /** `y` é a altura do balão em relação ao objeto de quem falou. */
  constructor(private readonly y: number) {}

  show(id: string, text: string, emote: boolean, now: number): void {
    this.drop(id);
    const sprite = makeBubble(text, emote);
    sprite.position.y = this.y;
    this.items.set(id, { sprite, until: now + CHAT_BUBBLE_MS });
  }

  /** Chame todo quadro: prende o balão no objeto atual de cada jogador (que pode ser recriado) e apaga os vencidos. */
  update(now: number, rootOf: (id: string) => THREE.Object3D | undefined): void {
    for (const [id, it] of this.items) {
      const root = rootOf(id);
      if (now >= it.until || !root) {
        if (now >= it.until) this.drop(id);
        else it.sprite.removeFromParent();
        continue;
      }
      if (it.sprite.parent !== root) root.add(it.sprite);
    }
  }

  private drop(id: string): void {
    const it = this.items.get(id);
    if (!it) return;
    it.sprite.removeFromParent();
    it.sprite.material.map?.dispose();
    it.sprite.material.dispose();
    this.items.delete(id);
  }

  dispose(): void {
    for (const id of [...this.items.keys()]) this.drop(id);
  }
}
