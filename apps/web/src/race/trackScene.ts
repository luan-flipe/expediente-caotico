import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { branchEdges, pathProgress, pointAt, progressOf, sideNormal, trackEdges, RACE, type Ramp, type Track, type Vec2 } from "@ec/shared";

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
  const map = new THREE.CanvasTexture(c);
  textures.push(map);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map }));
  s.scale.set(5, 1.25, 1);
  return s;
}

function checkerTexture(textures: THREE.Texture[]): THREE.CanvasTexture {
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
  textures.push(t);
  return t;
}

/**
 * Junta as malhas estáticas do grupo em uma malha por material (e sombra), em coordenadas de mundo.
 * Centenas de paredes, fitas e móveis viram poucas chamadas de desenho, em qualquer pista.
 */
function mergeStatic(group: THREE.Group): THREE.Mesh[] {
  group.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.Material;
    const key = `${mat.uuid}:${m.castShadow}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat, cast: m.castShadow, geos: [] }));
    b.geos.push(m.geometry.clone().applyMatrix4(m.matrixWorld));
  });
  const used = new Set<THREE.BufferGeometry>();
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) used.add(m.geometry);
  });
  used.forEach((g) => g.dispose());
  const out: THREE.Mesh[] = [];
  for (const b of buckets.values()) {
    // caixas e cilindros são indexados, o icosaedro não: mistura vira tudo não indexado
    const mixed = b.geos.some((g) => !g.index) && b.geos.some((g) => g.index);
    const geos = mixed ? b.geos.map((g) => (g.index ? g.toNonIndexed() : g)) : b.geos;
    const merged = mergeGeometries(geos, false);
    b.geos.forEach((g) => g.dispose());
    if (mixed) geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    out.push(mesh);
  }
  return out;
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

/** Ponto do caminho path na medida d da rampa (s da principal, ou bs do próprio atalho). */
function along(track: Track, path: number, d: number): { pos: Vec2; heading: number; halfWidth: number } {
  const b = track.branches[path];
  if (!b) return pointAt(track, d);
  const n = b.points.length;
  const i = Math.max(0, Math.min(n - 2, Math.floor(d / b.spacing)));
  const t = Math.max(0, Math.min(1, (d - b.cum[i]) / b.spacing));
  const p = b.points[i];
  const q = b.points[i + 1];
  return { pos: { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t }, heading: Math.atan2(q.x - p.x, q.z - p.z), halfWidth: (b.widths[i] + (b.widths[i + 1] - b.widths[i]) * t) / 2 };
}

/** Bordas (lado +1 e -1) do caminho entre d0 e d1, a cada step. */
function edgesBetween(track: Track, path: number, d0: number, d1: number, step = 0.5): { plus: Vec2[]; minus: Vec2[]; at: ReturnType<typeof along>[] } {
  const plus: Vec2[] = [];
  const minus: Vec2[] = [];
  const at: ReturnType<typeof along>[] = [];
  const count = Math.max(1, Math.ceil((d1 - d0) / step));
  for (let k = 0; k <= count; k++) {
    const a = along(track, path, d0 + ((d1 - d0) * k) / count);
    const nrm = sideNormal(Math.sin(a.heading), Math.cos(a.heading));
    plus.push({ x: a.pos.x + nrm.x * a.halfWidth, z: a.pos.z + nrm.z * a.halfWidth });
    minus.push({ x: a.pos.x - nrm.x * a.halfWidth, z: a.pos.z - nrm.z * a.halfWidth });
    at.push(a);
  }
  return { plus, minus, at };
}

/** Rampa como cunha: tampo cinza subindo até height, laterais e a queda do topo em faixas amarelas e pretas. */
function rampMesh(track: Track, r: Ramp): THREE.Mesh {
  const e = edgesBetween(track, r.path, r.sFrom, r.sTo, 0.5);
  const n = e.plus.length;
  const pos: number[] = [];
  const col: number[] = [];
  const gray = new THREE.Color("#8d9096");
  const stripe = (i: number) => new THREE.Color(i % 2 ? "#1d1d1d" : "#f2c230");
  const quad = (a: number[], b: number[], c: number[], d: number[], color: THREE.Color) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let k = 0; k < 6; k++) col.push(color.r, color.g, color.b);
  };
  const h = (i: number) => (r.height * i) / (n - 1) + 0.02;
  for (let i = 0; i + 1 < n; i++) {
    const [p0, p1, m0, m1] = [e.plus[i], e.plus[i + 1], e.minus[i], e.minus[i + 1]];
    quad([p0.x, h(i), p0.z], [p1.x, h(i + 1), p1.z], [m1.x, h(i + 1), m1.z], [m0.x, h(i), m0.z], gray);
    quad([p0.x, 0, p0.z], [p1.x, 0, p1.z], [p1.x, h(i + 1), p1.z], [p0.x, h(i), p0.z], stripe(i));
    quad([m0.x, 0, m0.z], [m1.x, 0, m1.z], [m1.x, h(i + 1), m1.z], [m0.x, h(i), m0.z], stripe(i));
  }
  // queda do topo: faixas em diagonal
  const top = n - 1;
  const parts = 8;
  for (let k = 0; k < parts; k++) {
    const a = { x: e.plus[top].x + ((e.minus[top].x - e.plus[top].x) * k) / parts, z: e.plus[top].z + ((e.minus[top].z - e.plus[top].z) * k) / parts };
    const b = { x: e.plus[top].x + ((e.minus[top].x - e.plus[top].x) * (k + 1)) / parts, z: e.plus[top].z + ((e.minus[top].z - e.plus[top].z) * (k + 1)) / parts };
    quad([a.x, 0, a.z], [b.x, 0, b.z], [b.x, h(top), b.z], [a.x, h(top), a.z], stripe(k));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Vão: buraco no piso com paredes de concreto descendo até o subsolo, 3 m abaixo. */
function gapPit(track: Track, r: Ramp): { group: THREE.Group; outline: Vec2[] } {
  const gap = r.gap!;
  const e = edgesBetween(track, r.path, gap.sFrom, gap.sTo, 0.5);
  const outline = [...e.plus, ...[...e.minus].reverse()];
  const group = new THREE.Group();
  const depth = 3;
  const wallMat = new THREE.MeshStandardMaterial({ color: "#4a4b4f", roughness: 1, side: THREE.DoubleSide });
  const pos: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    pos.push(a.x, 0.012, a.z, b.x, 0.012, b.z, b.x, -depth, b.z, a.x, 0.012, a.z, b.x, -depth, b.z, a.x, -depth, a.z);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  wg.computeVertexNormals();
  group.add(new THREE.Mesh(wg, wallMat));
  // piso do subsolo, escuro, com uma faixa de vaga
  const floor = new THREE.Mesh(ribbon(e.plus, e.minus, -depth, null, false), new THREE.MeshStandardMaterial({ color: "#26272b", roughness: 1 }));
  group.add(floor);
  const mid = e.at[Math.floor(e.at.length / 2)];
  const line = mesh(new THREE.BoxGeometry(0.15, 0.02, mid.halfWidth * 1.6), new THREE.MeshStandardMaterial({ color: "#d8d8d0" }), mid.pos.x, -depth + 0.02, mid.pos.z, mid.heading + Math.PI / 2);
  group.add(line);
  // borda amarela de aviso na beira
  const edge = new THREE.MeshStandardMaterial({ color: "#f2c230", roughness: 0.6 });
  for (const side of [e.plus, e.minus]) {
    for (let i = 0; i + 1 < side.length; i++) {
      const a = side[i];
      const b = side[i + 1];
      group.add(mesh(new THREE.BoxGeometry(0.2, 0.06, Math.hypot(b.x - a.x, b.z - a.z) + 0.05), edge, (a.x + b.x) / 2, 0.03, (a.z + b.z) / 2, Math.atan2(b.x - a.x, b.z - a.z)));
    }
  }
  return { group, outline };
}

/**
 * Monta a pista a partir do traçado (o mesmo da simulação do servidor).
 * Devolve a função que libera as texturas de canvas (placas e faixa de largada); geometrias e materiais saem com a cena.
 */
export function buildTrack(scene: THREE.Scene, track: Track): () => void {
  const textures: THREE.Texture[] = [];
  const n = track.points.length;
  // tudo que não se mexe e não tem textura própria entra aqui e é unido no fim
  const stat = new THREE.Group();
  // chão em volta do traçado, com folga para a decoração
  const xs = track.points.map((p) => p.x);
  const zs = track.points.map((p) => p.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const gw = Math.max(...xs) - Math.min(...xs) + 50;
  const gd = Math.max(...zs) - Math.min(...zs) + 50;
  const parking = track.id === "estacionamento";
  // vãos das rampas viram buracos no chão (o piso em volta é recortado)
  const pits = track.ramps.filter((r) => r.gap).map((r) => gapPit(track, r));
  const groundShape = new THREE.Shape([new THREE.Vector2(-gw / 2, -gd / 2), new THREE.Vector2(gw / 2, -gd / 2), new THREE.Vector2(gw / 2, gd / 2), new THREE.Vector2(-gw / 2, gd / 2)]);
  // o plano deitado (rotation.x = -90 graus) leva o y local para -z do mundo
  for (const p of pits) groundShape.holes.push(new THREE.Path(p.outline.map((q) => new THREE.Vector2(q.x - cx, -(q.z - cz)))));
  const ground = mesh(new THREE.ShapeGeometry(groundShape), new THREE.MeshStandardMaterial({ color: parking ? "#9a9c9f" : "#d9d3c6", roughness: 1 }), cx, -0.02, cz);
  ground.rotation.x = -Math.PI / 2;
  for (const p of pits) scene.add(p.group);
  for (const r of track.ramps) scene.add(rampMesh(track, r));
  ground.castShadow = false;
  scene.add(ground);
  const grid = new THREE.GridHelper(Math.max(gw, gd), Math.round(Math.max(gw, gd) / 2), "#000000", "#000000");
  grid.position.set(cx, 0, cz);
  (grid.material as THREE.Material).opacity = 0.06;
  (grid.material as THREE.Material).transparent = true;
  scene.add(grid);

  const edges = trackEdges(track);
  const colors = track.cum.map((s) => new THREE.Color(ROOM_FLOOR[roomAt(track, s)]));
  const floor = new THREE.Mesh(ribbon(edges.plus, edges.minus, 0.01, colors, true), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  floor.receiveShadow = true;
  scene.add(floor);
  // atalhos: piso um pouco acima da principal para não brigar com ela nas bocas
  track.branches.forEach((br, j) => {
    const e = branchEdges(track, j);
    const cols = br.sOff.map((o) => new THREE.Color(ROOM_FLOOR[roomAt(track, br.sFrom + o)]).multiplyScalar(0.9));
    const gap = track.ramps.find((r) => r.path === j && r.gap)?.gap;
    // com vão, o piso do atalho para na beira dele e recomeça do outro lado
    const pieces = gap
      ? [
          { from: 0, to: Math.floor(gap.sFrom / br.spacing), endAt: gap.sFrom, startAt: null as number | null },
          { from: Math.ceil(gap.sTo / br.spacing), to: br.points.length - 1, endAt: null as number | null, startAt: gap.sTo },
        ]
      : [{ from: 0, to: br.points.length - 1, endAt: null, startAt: null }];
    for (const pc of pieces) {
      const plus = e.plus.slice(pc.from, pc.to + 1);
      const minus = e.minus.slice(pc.from, pc.to + 1);
      const cc = cols.slice(pc.from, pc.to + 1);
      if (pc.startAt !== null) {
        const ed = edgesBetween(track, j, pc.startAt, pc.startAt, 1);
        plus.unshift(ed.plus[0]);
        minus.unshift(ed.minus[0]);
        cc.unshift(cc[0]);
      }
      if (pc.endAt !== null) {
        const ed = edgesBetween(track, j, pc.endAt, pc.endAt, 1);
        plus.push(ed.plus[0]);
        minus.push(ed.minus[0]);
        cc.push(cc[cc.length - 1]);
      }
      const m = new THREE.Mesh(ribbon(plus, minus, 0.012, cc, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
      m.receiveShadow = true;
      scene.add(m);
    }
  });

  // fita amarela tracejada no meio
  const tape = new THREE.MeshStandardMaterial({ color: "#ffd23f", roughness: 0.6 });
  const tapeGeo = new THREE.BoxGeometry(0.18, 0.02, 1.6);
  for (let s = 4; s < track.length - 2; s += 4) {
    const at = pointAt(track, s);
    stat.add(mesh(tapeGeo, tape, at.pos.x, 0.02, at.pos.z, at.heading));
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
  // parede de a até b, sem os trechos que caem dentro de outro corredor (boca do atalho fica aberta)
  const wall = (a: Vec2, b: Vec2, room: string, open: (p: Vec2) => boolean) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const parts = Math.max(1, Math.ceil(len / 0.8));
    const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    let from = -1;
    for (let k = 0; k <= parts; k++) {
      const keep = k < parts && !open(at((k + 0.5) / parts));
      if (keep && from < 0) from = k;
      if (!keep && from >= 0) {
        const p = at(from / parts);
        const q = at(k / parts);
        const l = Math.hypot(q.x - p.x, q.z - p.z);
        const ry = Math.atan2(q.x - p.x, q.z - p.z);
        stat.add(mesh(new THREE.BoxGeometry(0.25, 1.0, l + 0.25), wallMat(room), (p.x + q.x) / 2, 0.5, (p.z + q.z) / 2, ry));
        stat.add(mesh(new THREE.BoxGeometry(0.3, 0.06, l + 0.25), cap, (p.x + q.x) / 2, 1.03, (p.z + q.z) / 2, ry));
        from = -1;
      }
    }
  };
  const inPath = (path: number, p: Vec2) => {
    const pr = pathProgress(track, path, p);
    return pr.dist < pr.halfWidth - 0.15;
  };
  const inBranch = (p: Vec2) => track.branches.some((_, j) => inPath(j, p));
  for (const side of [edges.plus, edges.minus]) {
    for (let i = 0; i < n; i++) wall(side[i], side[(i + 1) % n], roomAt(track, track.cum[i]), inBranch);
  }
  track.branches.forEach((br, j) => {
    const e = branchEdges(track, j);
    const room = roomAt(track, br.sFrom + br.sOff[Math.floor(br.points.length / 2)]);
    const open = (p: Vec2) => inPath(-1, p) || track.branches.some((_, o) => o !== j && inPath(o, p));
    for (const side of [e.plus, e.minus]) {
      for (let k = 0; k + 1 < side.length; k++) wall(side[k], side[k + 1], room, open);
    }
  });

  // largada
  const start = pointAt(track, 0);
  const line = mesh(new THREE.PlaneGeometry(start.halfWidth * 2, 1.2), new THREE.MeshStandardMaterial({ map: checkerTexture(textures), roughness: 0.8 }), start.pos.x, 0.03, start.pos.z);
  line.rotation.set(-Math.PI / 2, 0, 0);
  line.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), start.heading);
  line.castShadow = false;
  scene.add(line);
  const arch = new THREE.MeshStandardMaterial({ color: "#ff5a3d", roughness: 0.6 });
  const nrm = sideNormal(Math.sin(start.heading), Math.cos(start.heading));
  for (const s of [-1, 1]) {
    const x = start.pos.x + nrm.x * (start.halfWidth + 0.4) * s;
    const z = start.pos.z + nrm.z * (start.halfWidth + 0.4) * s;
    stat.add(mesh(new THREE.BoxGeometry(0.3, 4, 0.3), arch, x, 2, z));
  }
  const banner = textSprite("Rally da Firma", textures);
  banner.position.set(start.pos.x, 4.1, start.pos.z);
  banner.scale.set(start.halfWidth * 2, start.halfWidth * 0.5, 1);
  scene.add(banner);

  for (const r of track.rooms.slice(1, -1)) {
    const at = pointAt(track, track.ctrlS[r.ctrl] + 4);
    const sign = textSprite(r.name, textures);
    sign.position.set(at.pos.x, 3.4, at.pos.z);
    scene.add(sign);
  }

  decorate(stat, track);
  for (const m of mergeStatic(stat)) scene.add(m);
  return () => textures.forEach((t) => t.dispose());
}

/** Móveis fora da pista, por ambiente. Só entram onde não encostam em nenhum trecho. */
function decorate(scene: THREE.Group, track: Track): void {
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
    scene.add(g);
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
  // beira dos atalhos: mesas baixas no escritório, prateleiras na despensa, cones na garagem
  for (const br of track.branches) {
    for (let k = 1; k < br.points.length - 1; k += 2) {
      const a = br.points[k - 1];
      const b = br.points[k + 1];
      const h = Math.atan2(b.x - a.x, b.z - a.z);
      const nrm = sideNormal(Math.sin(h), Math.cos(h));
      for (const side of [-1, 1]) {
        const off = br.widths[k] / 2 + 1;
        const p = { x: br.points[k].x + nrm.x * off * side, z: br.points[k].z + nrm.z * off * side };
        if (!free(p, 0.6)) continue;
        const g = new THREE.Group();
        g.position.set(p.x, 0, p.z);
        g.rotation.y = h;
        if (track.id === "copa") {
          g.add(mesh(new THREE.BoxGeometry(0.4, 1.6, 1.4), wood, 0, 0.8, 0));
          for (const y of [0.5, 1.0, 1.45]) g.add(mesh(new THREE.BoxGeometry(0.3, 0.18, 0.3), cars[(k + Math.round(y * 2)) % cars.length], 0.05, y + 0.12, 0.3 - y * 0.3));
        } else if (track.id === "estacionamento") {
          g.add(mesh(new THREE.ConeGeometry(0.25, 0.7, 8), cars[0], 0, 0.35, 0));
          g.add(mesh(new THREE.BoxGeometry(0.2, 0.08, 0.5), paint, 0, 0.45, 0));
        } else {
          g.add(mesh(new THREE.BoxGeometry(1.2, 0.06, 0.8), wood, 0, 0.45, 0));
          for (const x of [-0.5, 0.5]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.45, 0.7), dark, x, 0.22, 0));
        }
        scene.add(g);
      }
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
