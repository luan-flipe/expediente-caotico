import * as THREE from "three";
import type { ChairDNA } from "@ec/shared";

/** Paraquedas de escritório: guarda-chuva, folha de flipchart, saco de papel do café ou pasta suspensa. */
export type ParachuteKind = "guardachuva" | "flipchart" | "saco" | "pasta";

const KINDS: ParachuteKind[] = ["guardachuva", "flipchart", "saco", "pasta"];

/** Um fixo por cadeira, para todo mundo ver sempre o mesmo paraquedas do mesmo jogador. */
export function parachuteFor(chair: ChairDNA): ParachuteKind {
  const h = chair.seat * 7 + chair.base * 5 + chair.wheels * 3 + chair.back * 11 + chair.trinket * 13;
  return KINDS[h % KINDS.length];
}

const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide });

/** Cordinhas do topo do encosto (0, 1.5, 0) até os cantos do pano. */
function strings(g: THREE.Group, top: number, corners: [number, number][]): void {
  const pts: number[] = [];
  for (const [x, z] of corners) pts.push(0, 1.5, 0, x, top, z);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#3b3b3b" })));
}

/** Geometria simples (sem GLB): fica presa acima do boneco, em coordenadas da cadeira. */
export function buildParachute(kind: ParachuteKind): THREE.Group {
  const g = new THREE.Group();
  const top = 3.1;
  if (kind === "guardachuva") {
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.7, 8, 1, true), mat("#1f3c88"));
    canopy.position.y = top + 0.35;
    g.add(canopy);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, top - 1.4, 6), mat("#2a2a2a"));
    handle.position.y = 1.4 + (top - 1.4) / 2;
    g.add(handle);
  } else if (kind === "flipchart") {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6, 4, 1), mat("#fbfbf6"));
    // folha curvada pelo vento
    const pos = sheet.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, -0.25 * Math.cos((pos.getX(i) / 1.1) * (Math.PI / 2)));
    sheet.geometry.computeVertexNormals();
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.y = top;
    g.add(sheet);
    const scrawl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.12), mat("#d63031"));
    scrawl.rotation.x = -Math.PI / 2;
    scrawl.position.set(0, top + 0.02, 0.2);
    g.add(scrawl);
    strings(g, top, [[-1.1, -0.8], [1.1, -0.8], [-1.1, 0.8], [1.1, 0.8]]);
  } else if (kind === "saco") {
    const bag = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.75, 1.0, 10, 1, true), mat("#b9895a"));
    bag.position.y = top + 0.4;
    g.add(bag);
    const fold = new THREE.Mesh(new THREE.CircleGeometry(1.0, 10), mat("#a3784e"));
    fold.rotation.x = -Math.PI / 2;
    fold.position.y = top + 0.9;
    g.add(fold);
    strings(g, top - 0.1, [[-0.75, 0], [0.75, 0], [0, -0.75], [0, 0.75]]);
  } else {
    // pasta suspensa aberta, em V invertido
    for (const s of [-1, 1]) {
      const flap = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), mat("#3f9b5f"));
      flap.rotation.set(-Math.PI / 2, s * 0.45, 0, "YXZ");
      flap.position.set(s * 0.5, top + 0.22, 0);
      g.add(flap);
    }
    const hook = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.05), mat("#555"));
    hook.position.y = top + 0.45;
    g.add(hook);
    strings(g, top, [[-1, -0.7], [1, -0.7], [-1, 0.7], [1, 0.7]]);
  }
  g.traverse((o) => (o.castShadow = o instanceof THREE.Mesh));
  g.visible = false;
  return g;
}
