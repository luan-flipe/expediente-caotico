import type { Vec2 } from "../types";
import { hasLineOfSight, MAP_BOUNDS, SUSPEITO_WALLS } from "./map";

const CELL = 0.5;
const CLEARANCE = 0.55;
const COLS = Math.ceil((MAP_BOUNDS.maxX - MAP_BOUNDS.minX) / CELL);
const ROWS = Math.ceil((MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ) / CELL);

let blocked: Uint8Array | null = null;

function grid(): Uint8Array {
  if (blocked) return blocked;
  blocked = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = MAP_BOUNDS.minX + (c + 0.5) * CELL;
      const z = MAP_BOUNDS.minZ + (r + 0.5) * CELL;
      for (const w of SUSPEITO_WALLS) {
        const cx = Math.max(w.minX, Math.min(w.maxX, x));
        const cz = Math.max(w.minZ, Math.min(w.maxZ, z));
        if ((x - cx) ** 2 + (z - cz) ** 2 < CLEARANCE * CLEARANCE) {
          blocked[r * COLS + c] = 1;
          break;
        }
      }
    }
  }
  return blocked;
}

function cellOf(p: Vec2): number {
  const c = Math.max(0, Math.min(COLS - 1, Math.floor((p.x - MAP_BOUNDS.minX) / CELL)));
  const r = Math.max(0, Math.min(ROWS - 1, Math.floor((p.z - MAP_BOUNDS.minZ) / CELL)));
  return r * COLS + c;
}

function centerOf(i: number): Vec2 {
  return {
    x: MAP_BOUNDS.minX + ((i % COLS) + 0.5) * CELL,
    z: MAP_BOUNDS.minZ + (Math.floor(i / COLS) + 0.5) * CELL,
  };
}

function nearestFree(i: number): number {
  const g = grid();
  if (!g[i]) return i;
  const c0 = i % COLS;
  const r0 = Math.floor(i / COLS);
  for (let rad = 1; rad < 8; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
        if (!g[r * COLS + c]) return r * COLS + c;
      }
    }
  }
  return i;
}

/** A* em grade 8-conectada; devolve waypoints já simplificados por linha de visão (sem o ponto de partida). */
export function findSuspeitoPath(from: Vec2, to: Vec2): Vec2[] {
  if (hasLineOfSight(from, to)) return [{ ...to }];
  const g = grid();
  const start = nearestFree(cellOf(from));
  const goal = nearestFree(cellOf(to));
  const n = COLS * ROWS;
  const gScore = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open: number[] = [start];
  const fScore = new Float32Array(n).fill(Infinity);
  gScore[start] = 0;
  const gc = goal % COLS;
  const gr = Math.floor(goal / COLS);
  const h = (i: number) => Math.hypot((i % COLS) - gc, Math.floor(i / COLS) - gr);
  fScore[start] = h(start);

  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (fScore[open[k]] < fScore[open[bi]]) bi = k;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cc = cur % COLS;
    const cr = Math.floor(cur / COLS);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const r = cr + dr;
        const c = cc + dc;
        if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
        const ni = r * COLS + c;
        if (g[ni] || closed[ni]) continue;
        if (dr && dc && (g[cr * COLS + c] || g[r * COLS + cc])) continue;
        const ng = gScore[cur] + (dr && dc ? Math.SQRT2 : 1);
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          fScore[ni] = ng + h(ni);
          came[ni] = cur;
          open.push(ni);
        }
      }
    }
  }

  if (came[goal] === -1 && goal !== start) return [{ ...to }];

  const cells: Vec2[] = [];
  for (let i = goal; i !== -1 && i !== start; i = came[i]) cells.push(centerOf(i));
  cells.reverse();
  cells.push({ ...to });

  const out: Vec2[] = [];
  let anchor = from;
  let k = 0;
  while (k < cells.length) {
    let far = k;
    for (let j = cells.length - 1; j > k; j--) {
      if (clearPath(anchor, cells[j])) {
        far = j;
        break;
      }
    }
    out.push(cells[far]);
    anchor = cells[far];
    k = far + 1;
  }
  return out;
}

/** Linha de visão com folga lateral: evita que o atalho raspe na quina da parede. */
function clearPath(a: Vec2, b: Vec2): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return true;
  const ox = (-dz / len) * 0.4;
  const oz = (dx / len) * 0.4;
  return (
    hasLineOfSight(a, b) &&
    hasLineOfSight({ x: a.x + ox, z: a.z + oz }, { x: b.x + ox, z: b.z + oz }) &&
    hasLineOfSight({ x: a.x - ox, z: a.z - oz }, { x: b.x - ox, z: b.z - oz })
  );
}
