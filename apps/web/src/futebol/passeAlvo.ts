import * as THREE from "three";
import { passTarget, type FutPlayer, type FutSnapshot } from "@ec/shared";

type Jogador = FutSnapshot["players"][number];

/**
 * Para quem o passe iria agora: a mesma escolha do servidor (passTarget), com as posições desenhadas na tela e a direção
 * do meu boneco previsto. null sem companheiro disponível.
 */
export function alvoDoPasse(eu: { id: string; side: 0 | 1; x: number; z: number; facing: number }, jogadores: readonly Jogador[], posDe: (id: string) => { x: number; z: number } | undefined): string | null {
  const lista: FutPlayer[] = [];
  for (const j of jogadores) {
    const pos = j.id === eu.id ? eu : (posDe(j.id) ?? j);
    lista.push({ ...j, x: pos.x, z: pos.z, downMs: j.down ? 1 : 0 } as unknown as FutPlayer);
  }
  const me = { ...eu, role: "linha", sentOff: false, downMs: 0 } as unknown as FutPlayer;
  return passTarget(me, lista)?.id ?? null;
}

/** Seta azul (a cor do passe) que flutua sobre o companheiro que vai receber. */
export function criarMarcaPasse(): THREE.Mesh {
  const geo = new THREE.ConeGeometry(0.22, 0.36, 4);
  geo.rotateX(Math.PI);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: "#5ad1ff", transparent: true, opacity: 0.9, depthTest: false }));
  m.renderOrder = 6;
  m.visible = false;
  return m;
}
