import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { pointAt, progressOf, sideNormal, trackEdges, RACE, type Track, type Vec2 } from "@ec/shared";
import { Canvas2D } from "./canvas";

/** Piso de cada ambiente (nomes de track.rooms, de todas as pistas). */
const ROOM_FLOOR: Record<string, string> = {
  Recepção: "#b98a5e",
  Corredor: "#8e949b",
  "Ilhas de mesas": "#5f7590",
  Copa: "#cfc7b4",
  "Sala de reunião": "#7d6f8c",
  TI: "#5e6b62",
  Cancela: "#6b6f74",
  Vagas: "#56595e",
  Rampa: "#7b7f86",
  Pilares: "#4f5358",
  "Vagas do fundo": "#56595e",
  Balcão: "#d9cfb8",
  Mesas: "#c3b79c",
  Geladeira: "#b8c4c8",
  Cafeteira: "#a88b6c",
};
const ROOM_WALL: Record<string, string> = {
  Recepção: "#ece6da",
  Corredor: "#ece6da",
  "Ilhas de mesas": "#6d86a6",
  Copa: "#d8d2c4",
  "Sala de reunião": "glass",
  TI: "#3b4048",
  Cancela: "#f2c230",
  Vagas: "#f2c230",
  Rampa: "#f2c230",
  Pilares: "#f2c230",
  "Vagas do fundo": "#f2c230",
  Balcão: "#ece6da",
  Mesas: "#e3d8c3",
  Geladeira: "#ece6da",
  Cafeteira: "#8a6a4a",
};

function roomAt(track: Track, s: number): string {
  const L = track.length;
  const ss = ((s % L) + L) % L;
  let name = track.rooms[0].name;
  for (const r of track.rooms) if (ss >= track.ctrlS[r.ctrl]) name = r.name;
  return name;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function textSprite(text: string, textures: THREE.Texture[]): THREE.Sprite {
  const g = new Canvas2D(512, 128);
  g.fillStyle = "#1d1b17";
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = "#ffd23f";
  g.fillRect(8, 8, 496, 112);
  g.fillStyle = "#1d1b17";
  g.font = "800 64px 'Bricolage Grotesque', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text.toUpperCase(), 256, 68);
  const map = g.texture();
  textures.push(map);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map }));
  s.scale.set(5, 1.25, 1);
  return s;
}

function checkerTexture(textures: THREE.Texture[]): THREE.DataTexture {
  const g = new Canvas2D(256, 32);
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? "#1d1b17" : "#fffdf7";
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const t = g.texture();
  t.magFilter = THREE.NearestFilter;
  textures.push(t);
  return t;
}

/** Faixa no chão entre duas listas de pontos (mesmo tamanho). */
function ribbon(a: Vec2[], b: Vec2[], y: number, colors: THREE.Color[] | null, closed: boolean): THREE.BufferGeometry {
  const n = a.length;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    pos.push(a[i].x, y, a[i].z, b[i].x, y, b[i].z);
    if (colors) col.push(colors[i].r, colors[i].g, colors[i].b, colors[i].r, colors[i].g, colors[i].b);
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (colors) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // a ordem dos vértices depende do lado; o piso precisa sempre apontar para cima
  if (g.attributes.normal.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

/**
 * Monta a pista a partir do traçado (o mesmo da simulação do servidor).
 * Devolve a função que libera as texturas de canvas (placas e faixa de largada); geometrias e materiais saem com a cena.
 */
export function buildTrack(scene: THREE.Scene, track: Track): () => void {
  const textures: THREE.Texture[] = [];
  const parts = new THREE.Group();
  const n = track.points.length;
  // chão em volta do traçado, com folga para a decoração
  const xs = track.points.map((p) => p.x);
  const zs = track.points.map((p) => p.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const gw = Math.max(...xs) - Math.min(...xs) + 50;
  const gd = Math.max(...zs) - Math.min(...zs) + 50;
  const parking = track.id === "estacionamento";
  const ground = mesh(new THREE.PlaneGeometry(gw, gd), new THREE.MeshStandardMaterial({ color: parking ? "#9a9c9f" : "#d9d3c6", roughness: 1 }), cx, -0.02, cz);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  parts.add(ground);
  const grid = new THREE.GridHelper(Math.max(gw, gd), Math.round(Math.max(gw, gd) / 2), "#000000", "#000000");
  grid.position.set(cx, 0, cz);
  (grid.material as THREE.Material).opacity = 0.06;
  (grid.material as THREE.Material).transparent = true;
  parts.add(grid);

  const edges = trackEdges(track);
  const colors = track.cum.map((s) => new THREE.Color(ROOM_FLOOR[roomAt(track, s)]));
  const floor = new THREE.Mesh(ribbon(edges.plus, edges.minus, 0.01, colors, true), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  floor.receiveShadow = true;
  parts.add(floor);

  // fita amarela tracejada no meio
  const tape = new THREE.MeshStandardMaterial({ color: "#ffd23f", roughness: 0.6 });
  const tapeGeo = new THREE.BoxGeometry(0.18, 0.02, 1.6);
  for (let s = 4; s < track.length - 2; s += 4) {
    const at = pointAt(track, s);
    parts.add(mesh(tapeGeo, tape, at.pos.x, 0.02, at.pos.z, at.heading));
  }

  // carpete na borda interna das curvas fechadas
  const rug = new THREE.MeshStandardMaterial({ color: "#6f8f5a", roughness: 1 });
  for (const c of track.carpet) {
    const inner: Vec2[] = [];
    const outer: Vec2[] = [];
    const len = c.to >= c.from ? c.to - c.from : c.to + track.length - c.from;
    for (let d = 0; d <= len; d += 1.5) {
      const at = pointAt(track, c.from + d);
      const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
      const a = at.halfWidth - RACE.carpetWidth;
      inner.push({ x: at.pos.x + nrm.x * a * c.side, z: at.pos.z + nrm.z * a * c.side });
      outer.push({ x: at.pos.x + nrm.x * at.halfWidth * c.side, z: at.pos.z + nrm.z * at.halfWidth * c.side });
    }
    const m = new THREE.Mesh(ribbon(inner, outer, 0.025, null, false), rug);
    m.receiveShadow = true;
    parts.add(m);
  }

  // paredes nas bordas: divisórias, vidro na sala de reunião, racks na TI
  const wallMats = new Map<string, THREE.Material>();
  const wallMat = (room: string) => {
    let m = wallMats.get(room);
    if (!m) {
      const c = ROOM_WALL[room];
      m =
        c === "glass"
          ? new THREE.MeshStandardMaterial({ color: "#a9d4f0", transparent: true, opacity: 0.38, roughness: 0.1 })
          : new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true });
      wallMats.set(room, m);
    }
    return m;
  };
  const cap = new THREE.MeshStandardMaterial({ color: "#5a554c" });
  for (const side of [edges.plus, edges.minus]) {
    for (let i = 0; i < n; i++) {
      const a = side[i];
      const b = side[(i + 1) % n];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const ry = Math.atan2(b.x - a.x, b.z - a.z);
      const room = roomAt(track, track.cum[i]);
      parts.add(mesh(new THREE.BoxGeometry(0.25, 1.0, len + 0.25), wallMat(room), mid.x, 0.5, mid.z, ry));
      parts.add(mesh(new THREE.BoxGeometry(0.3, 0.06, len + 0.25), cap, mid.x, 1.03, mid.z, ry));
    }
  }

  // largada
  const start = pointAt(track, 0);
  const line = mesh(new THREE.PlaneGeometry(start.halfWidth * 2, 1.2), new THREE.MeshStandardMaterial({ map: checkerTexture(textures), roughness: 0.8 }), start.pos.x, 0.03, start.pos.z);
  line.rotation.set(-Math.PI / 2, 0, 0);
  line.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), start.heading);
  line.castShadow = false;
  parts.add(line);
  const arch = new THREE.MeshStandardMaterial({ color: "#ff5a3d", roughness: 0.6 });
  const nrm = sideNormal(Math.sin(start.heading), Math.cos(start.heading));
  for (const s of [-1, 1]) {
    const x = start.pos.x + nrm.x * (start.halfWidth + 0.4) * s;
    const z = start.pos.z + nrm.z * (start.halfWidth + 0.4) * s;
    parts.add(mesh(new THREE.BoxGeometry(0.3, 4, 0.3), arch, x, 2, z));
  }
  const banner = textSprite("Rally da Firma", textures);
  banner.position.set(start.pos.x, 4.1, start.pos.z);
  banner.scale.set(start.halfWidth * 2, start.halfWidth * 0.5, 1);
  parts.add(banner);

  for (const r of track.rooms.slice(1, -1)) {
    const at = pointAt(track, track.ctrlS[r.ctrl] + 4);
    const sign = textSprite(r.name, textures);
    sign.position.set(at.pos.x, 3.4, at.pos.z);
    parts.add(sign);
  }

  decorate(parts, track);
  scene.add(mergeStatic(parts));
  return () => textures.forEach((t) => t.dispose());
}

/**
 * A pista não se mexe: junta as peças de mesmo material num mesh só. No expo-gl cada chamada de desenho
 * passa pela thread JS, e as 350 a 780 peças soltas (desenhadas de novo no mapa de sombra) travavam o quadro.
 */
function mergeStatic(parts: THREE.Group): THREE.Group {
  parts.updateMatrixWorld(true);
  const out = new THREE.Group();
  const batches = new Map<string, THREE.Mesh[]>();
  const loose: THREE.Object3D[] = [];
  parts.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) {
      if (o.parent === parts && !(o as THREE.Group).isGroup) loose.push(o);
      return;
    }
    const g = m.geometry;
    const key = [(m.material as THREE.Material).uuid, m.castShadow, m.receiveShadow, !!g.index, Object.keys(g.attributes).sort().join()].join("|");
    const list = batches.get(key);
    if (list) list.push(m);
    else batches.set(key, [m]);
  });
  for (const o of loose) out.add(o);
  for (const list of batches.values()) {
    const merged = mergeGeometries(list.map((m) => m.geometry.clone().applyMatrix4(m.matrixWorld)));
    if (!merged) {
      for (const m of list) {
        m.matrixWorld.decompose(m.position, m.quaternion, m.scale);
        out.add(m);
      }
      continue;
    }
    const src = list[0];
    const m = new THREE.Mesh(merged, src.material);
    m.castShadow = src.castShadow;
    m.receiveShadow = src.receiveShadow;
    out.add(m);
  }
  return out;
}

/** Móveis fora da pista, por ambiente. Só entram onde não encostam em nenhum trecho. */
function decorate(parts: THREE.Group, track: Track): void {
  const wood = new THREE.MeshStandardMaterial({ color: "#c9a27a", roughness: 0.8, flatShading: true });
  const white = new THREE.MeshStandardMaterial({ color: "#f3efe6", roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: "#2b2f36", roughness: 0.6 });
  const screen = new THREE.MeshStandardMaterial({ color: "#1b2433", emissive: "#2a4f8a", emissiveIntensity: 0.6 });
  const leaf = new THREE.MeshStandardMaterial({ color: "#3e9b52", roughness: 0.9, flatShading: true });
  const pot = new THREE.MeshStandardMaterial({ color: "#7a5236" });
  const led = new THREE.MeshBasicMaterial({ color: "#5cff8a" });
  const sofa = new THREE.MeshStandardMaterial({ color: "#3f6b8a", roughness: 0.9 });
  const concrete = new THREE.MeshStandardMaterial({ color: "#b7b4ad", roughness: 0.95, flatShading: true });
  const yellow = new THREE.MeshStandardMaterial({ color: "#f2c230", roughness: 0.6 });
  const paint = new THREE.MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: "#2b3a4a", roughness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: "#d6dadf", roughness: 0.35, metalness: 0.3 });
  const red = new THREE.MeshBasicMaterial({ color: "#ff5a3d" });
  const cars = ["#c0392b", "#2e6da4", "#e8e4dc", "#2b2f36", "#7f8c8d", "#d4a017"].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, flatShading: true }));
  let carIdx = 0;

  const free = (p: Vec2, r: number) => {
    const pr = progressOf(track, p);
    return pr.dist > pr.halfWidth + r + 0.6;
  };
  const put = (room: string, p: Vec2, ry: number) => {
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.rotation.y = ry;
    switch (room) {
      case "Ilhas de mesas":
        g.add(mesh(new THREE.BoxGeometry(2.4, 0.08, 1.2), wood, 0, 0.74, 0));
        for (const x of [-1.1, 1.1]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.74, 1.1), dark, x, 0.37, 0));
        for (const x of [-0.6, 0.6]) g.add(mesh(new THREE.BoxGeometry(0.55, 0.36, 0.04), screen, x, 1.0, -0.3));
        break;
      case "TI":
        g.add(mesh(new THREE.BoxGeometry(0.9, 2.1, 1.0), dark, 0, 1.05, 0));
        for (let y = 0; y < 6; y++) g.add(mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), led, 0.3 - (y % 2) * 0.2, 0.4 + y * 0.28, 0.51));
        break;
      case "Copa":
      case "Balcão":
        g.add(mesh(new THREE.BoxGeometry(2.6, 0.95, 0.8), white, 0, 0.47, 0));
        g.add(mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), dark, 0.7, 1.2, 0));
        break;
      case "Sala de reunião":
        g.add(mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.08, 24), wood, 0, 0.74, 0));
        g.add(mesh(new THREE.CylinderGeometry(0.15, 0.3, 0.74, 10), dark, 0, 0.37, 0));
        break;
      case "Recepção":
        g.add(mesh(new THREE.BoxGeometry(2.2, 0.7, 0.9), sofa, 0, 0.35, 0));
        g.add(mesh(new THREE.BoxGeometry(2.2, 0.6, 0.25), sofa, 0, 0.8, -0.35));
        break;
      // estacionamento: carros nas vagas (com a faixa branca), pilares, cones e a guarita da cancela
      case "Vagas":
      case "Vagas do fundo": {
        const body = cars[carIdx++ % cars.length];
        g.add(mesh(new THREE.BoxGeometry(1.8, 0.7, 4.0), body, 0, 0.55, 0));
        g.add(mesh(new THREE.BoxGeometry(1.6, 0.6, 2.0), glass, 0, 1.15, -0.2));
        for (const [x, z] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) g.add(mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.25, 10), dark, x, 0.33, z, 0).rotateZ(Math.PI / 2));
        for (const x of [-1.35, 1.35]) g.add(mesh(new THREE.BoxGeometry(0.12, 0.02, 4.8), paint, x, 0.03, 0));
        break;
      }
      case "Pilares":
        g.add(mesh(new THREE.BoxGeometry(0.9, 3.2, 0.9), concrete, 0, 1.6, 0));
        for (const y of [0.25, 0.75]) g.add(mesh(new THREE.BoxGeometry(0.94, 0.25, 0.94), y === 0.25 ? yellow : dark, 0, y, 0));
        break;
      case "Rampa":
        for (const x of [-0.8, 0, 0.8]) {
          g.add(mesh(new THREE.ConeGeometry(0.25, 0.7, 10), red, x, 0.35, 0));
          g.add(mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.1, 10), paint, x, 0.4, 0));
        }
        break;
      case "Cancela":
        g.add(mesh(new THREE.BoxGeometry(1.6, 2.3, 1.6), paint, 0, 1.15, 0));
        g.add(mesh(new THREE.BoxGeometry(1.64, 0.7, 1.64), glass, 0, 1.5, 0));
        g.add(mesh(new THREE.BoxGeometry(1.9, 0.12, 1.9), yellow, 0, 2.35, 0));
        break;
      // copa: mesinhas com banquetas, geladeira e máquina de café
      case "Mesas":
        g.add(mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 16), white, 0, 0.75, 0));
        g.add(mesh(new THREE.CylinderGeometry(0.06, 0.25, 0.75, 8), steel, 0, 0.37, 0));
        for (const x of [-1, 1]) {
          g.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 12), wood, x, 0.48, 0));
          g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.46, 6), steel, x, 0.23, 0));
        }
        break;
      case "Geladeira":
        g.add(mesh(new THREE.BoxGeometry(0.9, 1.9, 0.75), steel, 0, 0.95, 0));
        g.add(mesh(new THREE.BoxGeometry(0.92, 0.03, 0.77), dark, 0, 1.3, 0));
        g.add(mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), dark, 0.35, 1.55, 0.4));
        g.add(mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), dark, 0.35, 0.9, 0.4));
        break;
      case "Cafeteira":
        g.add(mesh(new THREE.BoxGeometry(1.6, 0.95, 0.7), wood, 0, 0.47, 0));
        g.add(mesh(new THREE.BoxGeometry(0.55, 0.7, 0.45), dark, -0.3, 1.3, 0));
        g.add(mesh(new THREE.BoxGeometry(0.1, 0.06, 0.02), red, -0.3, 1.5, 0.23));
        g.add(mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.12, 10), white, 0.4, 1.01, 0.1));
        break;
      default:
        g.add(mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.5, 10), pot, 0, 0.25, 0));
        g.add(mesh(new THREE.IcosahedronGeometry(0.55, 0), leaf, 0, 0.95, 0));
    }
    parts.add(g);
  };

  // estacionamento enche mais as laterais; a copa é apertada e já tem bastante coisa perto
  const every = track.id === "estacionamento" ? 8 : track.id === "copa" ? 7 : 11;
  for (let s = 6; s < track.length; s += every) {
    const at = pointAt(track, s);
    const room = roomAt(track, s);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    for (const side of [-1, 1]) {
      const off = at.halfWidth + 2.6;
      const p = { x: at.pos.x + nrm.x * off * side, z: at.pos.z + nrm.z * off * side };
      if (free(p, 1.6)) put(room, p, at.heading);
    }
  }
  // mesa de reunião grande no miolo da curva larga (só no Circuito Corporativo)
  if (track.id !== "corporativo") return;
  const meet = pointAt(track, track.ctrlS[14]);
  const nrm = sideNormal(Math.sin(meet.heading), Math.cos(meet.heading));
  const c = track.carpet[2];
  const p = { x: meet.pos.x + nrm.x * (meet.halfWidth + 5) * c.side, z: meet.pos.z + nrm.z * (meet.halfWidth + 5) * c.side };
  if (free(p, 2)) put("Sala de reunião", p, 0);
}
