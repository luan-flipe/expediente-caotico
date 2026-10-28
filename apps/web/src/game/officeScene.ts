import * as THREE from "three";
import { OFFICE_MAP, type Box } from "@ec/shared";
import { createOutdoorGroundMaterial, createRoomFloorMaterial } from "./floorTextures";

const COLORS: Record<Box["kind"], string> = {
  wall: "#25282e",     // Paredes pretas/grafite escuras idênticas à planta
  glass: "#a9d4f0",    // Vidro translúcido
  desk: "#c9a27a",     // Madeira de carvalho claro
  cabinet: "#454b54",  // Racks e armários metálicos escuros
  counter: "#d6d0c4",  // Pias e bancadas
  plant: "#7a5236",    // Vaso de planta
  partition: "#5a6473",// Divisórias de mesa
  sofa: "#3f6b8a",     // Sofás
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** Monta o escritório a partir da planta arquitetônica oficial. */
export function buildOffice(scene: THREE.Scene): void {
  const W = OFFICE_MAP.width;
  const D = OFFICE_MAP.depth;

  // Gramado/entorno externo com textura orgânica
  const groundMat = createOutdoorGroundMaterial();
  const ground = mesh(new THREE.PlaneGeometry(W + 50, D + 40), groundMat, 0, -0.02, 0, false);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Pisos das salas e corredores com texturas dedicadas e relevo tátil (bump map)
  for (const r of OFFICE_MAP.rooms) {
    const { material } = createRoomFloorMaterial(r);
    const floor = mesh(new THREE.PlaneGeometry(r.w, r.d), material, r.x, 0, r.z, false);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
  }

  const mats = new Map<string, THREE.Material>();
  const matOf = (kind: Box["kind"]) => {
    let m = mats.get(kind);
    if (!m) {
      m =
        kind === "glass"
          ? new THREE.MeshStandardMaterial({ color: COLORS.glass, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.15 })
          : new THREE.MeshStandardMaterial({ color: COLORS[kind], roughness: 0.82, flatShading: true });
      mats.set(kind, m);
    }
    return m;
  };

  const topWood = new THREE.MeshStandardMaterial({ color: "#d8b38a", roughness: 0.65 });
  const screen = new THREE.MeshStandardMaterial({ color: "#161b24", emissive: "#223f6e", emissiveIntensity: 0.55 });
  const leaf = new THREE.MeshStandardMaterial({ color: "#328c46", roughness: 0.9, flatShading: true });
  const wallTop = new THREE.MeshStandardMaterial({ color: "#17181c" });
  const chair = new THREE.MeshStandardMaterial({ color: "#1e2126", roughness: 0.75 });
  const ceramic = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.25 });

  // Renderização das caixas físicas do mapa
  for (const b of OFFICE_MAP.boxes) {
    if (b.kind === "plant") {
      scene.add(mesh(new THREE.CylinderGeometry(b.w * 0.4, b.w * 0.32, b.h * 0.4, 16), matOf("plant"), b.x, b.h * 0.2, b.z));
      scene.add(mesh(new THREE.IcosahedronGeometry(b.w * 0.65, 1), leaf, b.x, b.h * 0.7, b.z));
      continue;
    }

    if (b.kind === "desk") {
      // Tampo de madeira clara
      scene.add(mesh(new THREE.BoxGeometry(b.w, 0.08, b.d), topWood, b.x, b.h - 0.04, b.z));
      // Base/pernas da mesa
      scene.add(mesh(new THREE.BoxGeometry(b.w * 0.94, b.h - 0.08, b.d * 0.88), matOf("desk"), b.x, (b.h - 0.08) / 2, b.z));
      continue;
    }

    const m = mesh(new THREE.BoxGeometry(b.w, b.h, b.d), matOf(b.kind), b.x, b.h / 2, b.z, b.kind !== "glass");
    scene.add(m);

    // Acabamento superior das paredes escuras
    if (b.kind === "wall") {
      scene.add(mesh(new THREE.BoxGeometry(b.w + 0.02, 0.08, b.d + 0.02), wallTop, b.x, b.h + 0.04, b.z, false));
    }

    // Moldura metálica das divisórias de vidro
    if (b.kind === "glass") {
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b.w, b.h, b.d)), new THREE.LineBasicMaterial({ color: "#3d4b57" }));
      frame.position.copy(m.position);
      scene.add(frame);
    }
  }

  // =========================================================================
  // DETALHES DECORATIVOS DA PLANTA
  // =========================================================================

  // 1. Cozinha: Mesa Redonda com Tampo de Madeira e Vasinho de Planta
  const roundDesk = mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.08, 32), topWood, -20.0, 0.76, -1.0);
  const roundBase = mesh(new THREE.CylinderGeometry(0.25, 0.4, 0.72, 16), matOf("wall"), -20.0, 0.36, -1.0);
  scene.add(roundDesk, roundBase);

  // 2. Vasos Sanitários e Pias nos Banheiros
  const toilets: [number, number][] = [
    [-7.5, -19.0], // Banheiro sup
    [-3.5, -19.0], // Banheiro sup
    [-11.5, -3.5], // Banheiro feminino
    [-11.5, -0.5], // Banheiro feminino
  ];
  for (const [tx, tz] of toilets) {
    const bowl = mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.45, 16), ceramic, tx, 0.225, tz);
    const tank = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.25), ceramic, tx, 0.55, tz - 0.25);
    scene.add(bowl, tank);
  }

  // 3. Cadeiras de Escritório Conforme o Desenho
  const addChair = (cx: number, cz: number, facingAngle: number) => {
    const c = mesh(new THREE.BoxGeometry(0.55, 0.88, 0.55), chair, cx, 0.44, cz, true);
    c.rotation.y = facingAngle;
    scene.add(c);
  };

  // Cadeiras da Sala de Reunião Grande (10 lugares: 4 em cima, 4 em baixo, 2 nas pontas)
  for (let i = 0; i < 4; i++) {
    const offX = 11.0 + i * 2.6;
    addChair(offX, -17.2, 0);             // Cadeiras superiores viradas para baixo
    addChair(offX, -12.8, Math.PI);        // Cadeiras inferiores viradas para cima
  }
  addChair(8.5, -15.0, Math.PI / 2);      // Cabeceira esquerda
  addChair(21.5, -15.0, -Math.PI / 2);    // Cabeceira direita

  // Cadeiras da Sala do Comandante
  addChair(0.5, -15.0, -Math.PI / 2);

  // Cadeiras da Sala de Infra
  addChair(-18.5, -11.8, 0);
  addChair(-13.5, -11.8, 0);

  // Cadeiras das Ilhas da Sala dos Devs (12 lugares: 6 em cada ilha)
  for (const ilhaX of [-19.0, -11.0]) {
    for (let k = 0; k < 3; k++) {
      const cz = 12.0 + k * 3.0;
      addChair(ilhaX - 1.4, cz, Math.PI / 2);   // Virada para a mesa à direita
      addChair(ilhaX + 1.4, cz, -Math.PI / 2);  // Virada para a mesa à esquerda
      // Monitores sobre as mesas dos devs
      scene.add(mesh(new THREE.BoxGeometry(0.7, 0.45, 0.06), screen, ilhaX - 0.5, 1.05, cz));
      scene.add(mesh(new THREE.BoxGeometry(0.7, 0.45, 0.06), screen, ilhaX + 0.5, 1.05, cz));
    }
  }

  // Cadeiras da Sala Suporte
  for (const supX of [6.0, 12.0]) {
    for (let k = 0; k < 2; k++) {
      const cz = 13.0 + k * 3.5;
      addChair(supX - 1.3, cz, Math.PI / 2);
      addChair(supX + 1.3, cz, -Math.PI / 2);
    }
  }
  for (let k = 0; k < 3; k++) {
    const cx = 17.0 + k * 2.0;
    addChair(cx, 13.5, 0);
    addChair(cx, 16.5, Math.PI);
  }

  // Cadeiras das Mesas em T (Sala de Gestão e Sala Sup Esq)
  addChair(-29.0, -13.0, 0);
  addChair(-32.5, -15.0, -Math.PI / 2);
  addChair(-27.2, 15.0, -Math.PI / 2);
  addChair(-30.8, 15.0, Math.PI / 2);

  // 4. Placas com Nomes das Salas gravadas no piso
  for (const r of OFFICE_MAP.rooms) {
    if (r.w < 5 || r.d < 3) continue;
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 96;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(22,24,28,0.15)";
    g.font = "800 48px 'Bricolage Grotesque', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(r.name.toUpperCase(), 256, 48);

    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(r.w * 0.8, 12), 1.6),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
    );
    label.rotation.x = -Math.PI / 2;
    label.position.set(r.x, 0.016, r.z);
    scene.add(label);
  }
}
