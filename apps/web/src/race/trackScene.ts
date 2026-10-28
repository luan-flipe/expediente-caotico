import * as THREE from "three";
import { pointAt, progressOf, sideNormal, TRACK, TRACK_ROOMS, trackEdges, RACE, type Vec2 } from "@ec/shared";

/** Piso de cada ambiente, na ordem de TRACK_ROOMS. */
const ROOM_FLOOR: Record<string, string> = {
  Recepção: "#b98a5e",
  Corredor: "#8e949b",
  "Ilhas de mesas": "#5f7590",
  Copa: "#cfc7b4",
  "Sala de reunião": "#7d6f8c",
  TI: "#5e6b62",
};
const ROOM_WALL: Record<string, string> = {
  Recepção: "#ece6da",
  Corredor: "#ece6da",
  "Ilhas de mesas": "#6d86a6",
  Copa: "#d8d2c4",
  "Sala de reunião": "glass",
  TI: "#3b4048",
};

function roomAt(s: number): string {
  const L = TRACK.length;
  const ss = ((s % L) + L) % L;
  let name = TRACK_ROOMS[0].name;
  for (const r of TRACK_ROOMS) if (ss >= TRACK.ctrlS[r.ctrl]) name = r.name;
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

function textSprite(text: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1d1b17";
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = "#ffd23f";
  g.fillRect(8, 8, 496, 112);
  g.fillStyle = "#1d1b17";
  g.font = "800 64px 'Bricolage Grotesque', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text.toUpperCase(), 256, 68);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c) }));
  s.scale.set(5, 1.25, 1);
  return s;
}

function checkerTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 32;
  const g = c.getContext("2d")!;
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? "#1d1b17" : "#fffdf7";
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
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

/** Monta o Circuito Corporativo a partir de TRACK (o mesmo traçado da simulação do servidor). */
export function buildTrack(scene: THREE.Scene): void {
  const n = TRACK.points.length;
  const ground = mesh(new THREE.PlaneGeometry(150, 120), new THREE.MeshStandardMaterial({ color: "#d9d3c6", roughness: 1 }), 0, -0.02, 0);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  scene.add(ground);
  const grid = new THREE.GridHelper(150, 75, "#000000", "#000000");
  (grid.material as THREE.Material).opacity = 0.06;
  (grid.material as THREE.Material).transparent = true;
  scene.add(grid);

  const edges = trackEdges(TRACK);
  const colors = TRACK.cum.map((s) => new THREE.Color(ROOM_FLOOR[roomAt(s)]));
  const floor = new THREE.Mesh(ribbon(edges.plus, edges.minus, 0.01, colors, true), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  floor.receiveShadow = true;
  scene.add(floor);

  // fita amarela tracejada no meio
  const tape = new THREE.MeshStandardMaterial({ color: "#ffd23f", roughness: 0.6 });
  const tapeGeo = new THREE.BoxGeometry(0.18, 0.02, 1.6);
  for (let s = 4; s < TRACK.length - 2; s += 4) {
    const at = pointAt(TRACK, s);
    scene.add(mesh(tapeGeo, tape, at.pos.x, 0.02, at.pos.z, at.heading));
  }

  // carpete na borda interna das curvas fechadas
  const rug = new THREE.MeshStandardMaterial({ color: "#6f8f5a", roughness: 1 });
  for (const c of TRACK.carpet) {
    const inner: Vec2[] = [];
    const outer: Vec2[] = [];
    const len = c.to >= c.from ? c.to - c.from : c.to + TRACK.length - c.from;
    for (let d = 0; d <= len; d += 1.5) {
      const at = pointAt(TRACK, c.from + d);
      const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
      const a = at.halfWidth - RACE.carpetWidth;
      inner.push({ x: at.pos.x + nrm.x * a * c.side, z: at.pos.z + nrm.z * a * c.side });
      outer.push({ x: at.pos.x + nrm.x * at.halfWidth * c.side, z: at.pos.z + nrm.z * at.halfWidth * c.side });
    }
    const m = new THREE.Mesh(ribbon(inner, outer, 0.025, null, false), rug);
    m.receiveShadow = true;
    scene.add(m);
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
      const room = roomAt(TRACK.cum[i]);
      scene.add(mesh(new THREE.BoxGeometry(0.25, 1.0, len + 0.25), wallMat(room), mid.x, 0.5, mid.z, ry));
      scene.add(mesh(new THREE.BoxGeometry(0.3, 0.06, len + 0.25), cap, mid.x, 1.03, mid.z, ry));
    }
  }

  // largada
  const start = pointAt(TRACK, 0);
  const line = mesh(new THREE.PlaneGeometry(start.halfWidth * 2, 1.2), new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.8 }), start.pos.x, 0.03, start.pos.z);
  line.rotation.set(-Math.PI / 2, 0, 0);
  line.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), start.heading);
  line.castShadow = false;
  scene.add(line);
  const arch = new THREE.MeshStandardMaterial({ color: "#ff5a3d", roughness: 0.6 });
  const nrm = sideNormal(Math.sin(start.heading), Math.cos(start.heading));
  for (const s of [-1, 1]) {
    const x = start.pos.x + nrm.x * (start.halfWidth + 0.4) * s;
    const z = start.pos.z + nrm.z * (start.halfWidth + 0.4) * s;
    scene.add(mesh(new THREE.BoxGeometry(0.3, 4, 0.3), arch, x, 2, z));
  }
  const banner = textSprite("Rally da Firma");
  banner.position.set(start.pos.x, 4.1, start.pos.z);
  banner.scale.set(start.halfWidth * 2, start.halfWidth * 0.5, 1);
  scene.add(banner);

  for (const r of TRACK_ROOMS.slice(1, -1)) {
    const at = pointAt(TRACK, TRACK.ctrlS[r.ctrl] + 4);
    const sign = textSprite(r.name);
    sign.position.set(at.pos.x, 3.4, at.pos.z);
    scene.add(sign);
  }

  decorate(scene);
}

/** Móveis fora da pista, por ambiente. Só entram onde não encostam em nenhum trecho. */
function decorate(scene: THREE.Scene): void {
  const wood = new THREE.MeshStandardMaterial({ color: "#c9a27a", roughness: 0.8, flatShading: true });
  const white = new THREE.MeshStandardMaterial({ color: "#f3efe6", roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: "#2b2f36", roughness: 0.6 });
  const screen = new THREE.MeshStandardMaterial({ color: "#1b2433", emissive: "#2a4f8a", emissiveIntensity: 0.6 });
  const leaf = new THREE.MeshStandardMaterial({ color: "#3e9b52", roughness: 0.9, flatShading: true });
  const pot = new THREE.MeshStandardMaterial({ color: "#7a5236" });
  const led = new THREE.MeshBasicMaterial({ color: "#5cff8a" });
  const sofa = new THREE.MeshStandardMaterial({ color: "#3f6b8a", roughness: 0.9 });

  const free = (p: Vec2, r: number) => {
    const pr = progressOf(TRACK, p);
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
      default:
        g.add(mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.5, 10), pot, 0, 0.25, 0));
        g.add(mesh(new THREE.IcosahedronGeometry(0.55, 0), leaf, 0, 0.95, 0));
    }
    scene.add(g);
  };

  for (let s = 6; s < TRACK.length; s += 11) {
    const at = pointAt(TRACK, s);
    const room = roomAt(s);
    const nrm = sideNormal(Math.sin(at.heading), Math.cos(at.heading));
    for (const side of [-1, 1]) {
      const off = at.halfWidth + 2.6;
      const p = { x: at.pos.x + nrm.x * off * side, z: at.pos.z + nrm.z * off * side };
      if (free(p, 1.6)) put(room, p, at.heading);
    }
  }
  // mesa de reunião grande no miolo da curva larga
  const meet = pointAt(TRACK, TRACK.ctrlS[14]);
  const nrm = sideNormal(Math.sin(meet.heading), Math.cos(meet.heading));
  const c = TRACK.carpet[2];
  const p = { x: meet.pos.x + nrm.x * (meet.halfWidth + 5) * c.side, z: meet.pos.z + nrm.z * (meet.halfWidth + 5) * c.side };
  if (free(p, 2)) put("Sala de reunião", p, 0);
}
