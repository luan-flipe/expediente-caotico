import * as THREE from "three";
import type { Field, TeamSide } from "@ec/shared";

// Peças de cena do futebol sem estado: nome sobre o jogador, sombra redonda, linhas do campo e contas de ângulo.

export const angleLerp = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/** Direção de ataque em ângulo (0 = +z): o time 0 ataca +x, o time 1 ataca -x. */
export const attackYaw = (side: TeamSide) => (side === 0 ? Math.PI / 2 : -Math.PI / 2);

export function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Tamanho base (m) do nome sobre o jogador; o quadro multiplica por tagScale(distância da câmera). */
export const TAG_W = 2.1;
export const TAG_H = 0.525;

export function makeTag(name: string, hex: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 80;
  const g = c.getContext("2d")!;
  // nomes longos encolhem a fonte em vez de vazar da etiqueta
  let size = 40;
  g.font = `800 ${size}px 'Bricolage Grotesque', sans-serif`;
  const w = g.measureText(name).width;
  if (w > 300) {
    size = Math.max(22, Math.floor((size * 300) / w));
    g.font = `800 ${size}px 'Bricolage Grotesque', sans-serif`;
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 9;
  g.strokeStyle = "rgba(20,18,15,0.95)";
  g.strokeText(name, 160, 30);
  g.fillStyle = "#fffdf7";
  g.fillText(name, 160, 30);
  g.fillStyle = "rgba(20,18,15,0.95)";
  g.fillRect(70, 54, 180, 16);
  g.fillStyle = hex;
  g.fillRect(74, 57, 172, 10);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(TAG_W, TAG_H, 1);
  s.renderOrder = 5;
  return s;
}

/** Sombra redonda (gradiente) sob os pés: geometria e material divididos por todos os bonecos. */
export function createBlob(): { geo: THREE.PlaneGeometry; mat: THREE.MeshBasicMaterial } {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(0, 0, 0, 0.55)");
    grad.addColorStop(0.5, "rgba(0, 0, 0, 0.35)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const geo = new THREE.PlaneGeometry(1.3, 1.3);
  geo.rotateX(-Math.PI / 2);
  return { geo, mat: new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }) };
}

/** Libera o material e todas as texturas que ele guarda (mapa, normal, rugosidade, emissivo...). */
export function disposeMaterial(m: THREE.Material): void {
  for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) (v as THREE.Texture).dispose();
  m.dispose();
}

/** Plano fino no chão (linha do campo). */
function flat(w: number, d: number, x: number, z: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.05, z);
  m.renderOrder = 1;
  return m;
}

/** Linhas do campo do formato, centradas na origem, por cima do gramado. */
export function buildLines(f: Field, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const T = 0.14;
  const L = f.halfL * 2;
  const W = f.halfW * 2;
  // contorno
  g.add(flat(L + T, T, 0, -f.halfW, mat), flat(L + T, T, 0, f.halfW, mat), flat(T, W + T, -f.halfL, 0, mat), flat(T, W + T, f.halfL, 0, mat));
  // meio de campo e círculo central
  g.add(flat(T, W, 0, 0, mat));
  // campo do estádio: círculo central de 9,15 m
  const r = Math.min(f.halfW * 0.3, f.halfW > 25 ? 9.15 : 5);
  const ring = new THREE.Mesh(new THREE.RingGeometry(r - T / 2, r + T / 2, 56), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.05, 0);
  ring.renderOrder = 1;
  g.add(ring);
  const dot = (x: number, z: number) => {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), mat);
    d.rotation.x = -Math.PI / 2;
    d.position.set(x, 0.05, z);
    d.renderOrder = 1;
    g.add(d);
  };
  dot(0, 0);
  for (const s of [-1, 1]) {
    const gx = s * f.halfL;
    const bx = gx - s * f.boxL;
    // grande área
    g.add(flat(T, f.boxHalfW * 2, bx, 0, mat), flat(f.boxL, T, gx - (s * f.boxL) / 2, -f.boxHalfW, mat), flat(f.boxL, T, gx - (s * f.boxL) / 2, f.boxHalfW, mat));
    // pequena área (metade da profundidade e da largura)
    const sl = f.boxL * 0.45;
    const sw = f.boxHalfW * 0.5;
    g.add(flat(T, sw * 2, gx - s * sl, 0, mat), flat(sl, T, gx - (s * sl) / 2, -sw, mat), flat(sl, T, gx - (s * sl) / 2, sw, mat));
    dot(gx - s * f.penaltySpot, 0);
  }
  return g;
}
