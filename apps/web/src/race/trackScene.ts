import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
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
  if (g.attributes.normal.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

function commitMerged(
  scene: THREE.Scene,
  geos: THREE.BufferGeometry[],
  mat: THREE.Material,
  shadow = true,
): void {
  if (geos.length === 0) return;
  const merged = BufferGeometryUtils.mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return;
  const m = new THREE.Mesh(merged, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  scene.add(m);
}

function addTransformed(
  list: THREE.BufferGeometry[],
  geo: THREE.BufferGeometry,
  pos: { x: number; y: number; z: number },
  ry = 0,
): void {
  if (ry !== 0) geo.rotateY(ry);
  geo.translate(pos.x, pos.y, pos.z);
  list.push(geo);
}

/** Monta o Circuito Corporativo com geometrias unificadas (alta performance em navegador). */
export function buildTrack(scene: THREE.Scene): void {
  const n = TRACK.points.length;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 120),
    new THREE.MeshStandardMaterial({ color: "#d9d3c6", roughness: 1 }),
  );
  ground.position.set(0, -0.02, 0);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(150, 75, "#000000", "#000000");
  (grid.material as THREE.Material).opacity = 0.06;
  (grid.material as THREE.Material).transparent = true;
  scene.add(grid);

  const edges = trackEdges(TRACK);
  const colors = TRACK.cum.map((s) => new THREE.Color(ROOM_FLOOR[roomAt(s)]));
  const floor = new THREE.Mesh(
    ribbon(edges.plus, edges.minus, 0.01, colors, true),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
  );
  floor.receiveShadow = true;
  scene.add(floor);

  // Fita amarela tracejada no meio unificada em 1 malha
  const tapeGeos: THREE.BufferGeometry[] = [];
  for (let s = 4; s < TRACK.length - 2; s += 4) {
    const at = pointAt(TRACK, s);
    addTransformed(tapeGeos, new THREE.BoxGeometry(0.18, 0.02, 1.6), { x: at.pos.x, y: 0.02, z: at.pos.z }, at.heading);
  }
  const tapeMat = new THREE.MeshStandardMaterial({ color: "#ffd23f", roughness: 0.6 });
  commitMerged(scene, tapeGeos, tapeMat, false);

  // Carpete na borda interna das curvas fechadas
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

  // Paredes agrupadas por ambiente e rodapé unificado
  const wallGeosByRoom = new Map<string, THREE.BufferGeometry[]>();
  const capGeos: THREE.BufferGeometry[] = [];

  for (const side of [edges.plus, edges.minus]) {
    for (let i = 0; i < n; i++) {
      const a = side[i];
      const b = side[(i + 1) % n];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const ry = Math.atan2(b.x - a.x, b.z - a.z);
      const room = roomAt(TRACK.cum[i]);

      let roomList = wallGeosByRoom.get(room);
      if (!roomList) {
        roomList = [];
        wallGeosByRoom.set(room, roomList);
      }
      addTransformed(roomList, new THREE.BoxGeometry(0.25, 1.0, len + 0.25), { x: mid.x, y: 0.5, z: mid.z }, ry);
      addTransformed(capGeos, new THREE.BoxGeometry(0.3, 0.06, len + 0.25), { x: mid.x, y: 1.03, z: mid.z }, ry);
    }
  }

  for (const [room, geos] of wallGeosByRoom) {
    const c = ROOM_WALL[room];
    const mat =
      c === "glass"
        ? new THREE.MeshStandardMaterial({ color: "#a9d4f0", transparent: true, opacity: 0.38, roughness: 0.1 })
        : new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true });
    commitMerged(scene, geos, mat, c !== "glass");
  }
  const capMat = new THREE.MeshStandardMaterial({ color: "#5a554c" });
  commitMerged(scene, capGeos, capMat, false);

  // Linha de largada
  const start = pointAt(TRACK, 0);
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(start.halfWidth * 2, 1.2),
    new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.8 }),
  );
  line.position.set(start.pos.x, 0.03, start.pos.z);
  line.rotation.set(-Math.PI / 2, 0, 0);
  line.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), start.heading);
  line.receiveShadow = true;
  scene.add(line);

  // Pórtico de largada
  const archMat = new THREE.MeshStandardMaterial({ color: "#ff5a3d", roughness: 0.6 });
  const nrm = sideNormal(Math.sin(start.heading), Math.cos(start.heading));
  const archGeos: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const x = start.pos.x + nrm.x * (start.halfWidth + 0.4) * s;
    const z = start.pos.z + nrm.z * (start.halfWidth + 0.4) * s;
    addTransformed(archGeos, new THREE.BoxGeometry(0.3, 4, 0.3), { x, y: 2, z });
  }
  commitMerged(scene, archGeos, archMat, true);

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

/** Móveis fora da pista com geometrias agrupadas e unificadas por material. */
function decorate(scene: THREE.Scene): void {
  const woodGeos: THREE.BufferGeometry[] = [];
  const whiteGeos: THREE.BufferGeometry[] = [];
  const darkGeos: THREE.BufferGeometry[] = [];
  const screenGeos: THREE.BufferGeometry[] = [];
  const leafGeos: THREE.BufferGeometry[] = [];
  const potGeos: THREE.BufferGeometry[] = [];
  const ledGeos: THREE.BufferGeometry[] = [];
  const sofaGeos: THREE.BufferGeometry[] = [];

  const free = (p: Vec2, r: number) => {
    const pr = progressOf(TRACK, p);
    return pr.dist > pr.halfWidth + r + 0.6;
  };

  const put = (room: string, p: Vec2, ry: number) => {
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    const rot = (lx: number, lz: number) => ({ x: p.x + lx * cos + lz * sin, z: p.z - lx * sin + lz * cos });

    switch (room) {
      case "Ilhas de mesas":
        addTransformed(woodGeos, new THREE.BoxGeometry(2.4, 0.08, 1.2), { x: p.x, y: 0.74, z: p.z }, ry);
        for (const x of [-1.1, 1.1]) {
          const pt = rot(x, 0);
          addTransformed(darkGeos, new THREE.BoxGeometry(0.06, 0.74, 1.1), { x: pt.x, y: 0.37, z: pt.z }, ry);
        }
        for (const x of [-0.6, 0.6]) {
          const pt = rot(x, -0.3);
          addTransformed(screenGeos, new THREE.BoxGeometry(0.55, 0.36, 0.04), { x: pt.x, y: 1.0, z: pt.z }, ry);
        }
        break;
      case "TI":
        addTransformed(darkGeos, new THREE.BoxGeometry(0.9, 2.1, 1.0), { x: p.x, y: 1.05, z: p.z }, ry);
        for (let y = 0; y < 6; y++) {
          const pt = rot(0.3 - (y % 2) * 0.2, 0.51);
          addTransformed(ledGeos, new THREE.BoxGeometry(0.06, 0.04, 0.02), { x: pt.x, y: 0.4 + y * 0.28, z: pt.z }, ry);
        }
        break;
      case "Copa":
        addTransformed(whiteGeos, new THREE.BoxGeometry(2.6, 0.95, 0.8), { x: p.x, y: 0.47, z: p.z }, ry);
        {
          const pt = rot(0.7, 0);
          addTransformed(darkGeos, new THREE.BoxGeometry(0.4, 0.5, 0.4), { x: pt.x, y: 1.2, z: pt.z }, ry);
        }
        break;
      case "Sala de reunião":
        addTransformed(woodGeos, new THREE.CylinderGeometry(1.6, 1.6, 0.08, 24), { x: p.x, y: 0.74, z: p.z }, ry);
        addTransformed(darkGeos, new THREE.CylinderGeometry(0.15, 0.3, 0.74, 10), { x: p.x, y: 0.37, z: p.z }, ry);
        break;
      case "Recepção":
        addTransformed(sofaGeos, new THREE.BoxGeometry(2.2, 0.7, 0.9), { x: p.x, y: 0.35, z: p.z }, ry);
        {
          const pt = rot(0, -0.35);
          addTransformed(sofaGeos, new THREE.BoxGeometry(2.2, 0.6, 0.25), { x: pt.x, y: 0.8, z: pt.z }, ry);
        }
        break;
      default:
        addTransformed(potGeos, new THREE.CylinderGeometry(0.3, 0.24, 0.5, 10), { x: p.x, y: 0.25, z: p.z }, ry);
        addTransformed(leafGeos, new THREE.IcosahedronGeometry(0.55, 0), { x: p.x, y: 0.95, z: p.z }, ry);
    }
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

  const meet = pointAt(TRACK, TRACK.ctrlS[14]);
  const nrm = sideNormal(Math.sin(meet.heading), Math.cos(meet.heading));
  const c = TRACK.carpet[2];
  const p = { x: meet.pos.x + nrm.x * (meet.halfWidth + 5) * c.side, z: meet.pos.z + nrm.z * (meet.halfWidth + 5) * c.side };
  if (free(p, 2)) put("Sala de reunião", p, 0);

  const wood = new THREE.MeshStandardMaterial({ color: "#c9a27a", roughness: 0.8, flatShading: true });
  const white = new THREE.MeshStandardMaterial({ color: "#f3efe6", roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: "#2b2f36", roughness: 0.6 });
  const screen = new THREE.MeshStandardMaterial({ color: "#1b2433", emissive: "#2a4f8a", emissiveIntensity: 0.6 });
  const leaf = new THREE.MeshStandardMaterial({ color: "#3e9b52", roughness: 0.9, flatShading: true });
  const pot = new THREE.MeshStandardMaterial({ color: "#7a5236" });
  const led = new THREE.MeshBasicMaterial({ color: "#5cff8a" });
  const sofa = new THREE.MeshStandardMaterial({ color: "#3f6b8a", roughness: 0.9 });

  commitMerged(scene, woodGeos, wood, true);
  commitMerged(scene, whiteGeos, white, true);
  commitMerged(scene, darkGeos, dark, true);
  commitMerged(scene, screenGeos, screenMatMerged(screen), false);
  commitMerged(scene, leafGeos, leaf, true);
  commitMerged(scene, potGeos, pot, true);
  commitMerged(scene, ledGeos, led, false);
  commitMerged(scene, sofaGeos, sofa, true);
}

function screenMatMerged(base: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  return base;
}
