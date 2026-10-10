/**
 * Navigation: a square grid (layout.gridStep) over the walkable rectangle minus the obstacles
 * (inflated by ACTOR_RADIUS), A* with eight neighbours (no corner cutting), then line-of-sight
 * smoothing so actors walk straight where nothing is in the way. Pure; the grid is cached per layout.
 */
import { ACTOR_RADIUS } from './layout';
import type { Obstacle, YardLayout, YardPoint } from './types';

interface Grid {
  cols: number;
  rows: number;
  step: number;
  originX: number;
  originZ: number;
  walkable: Uint8Array;
}

const gridCache = new WeakMap<YardLayout, Grid>();

function buildGrid(layout: YardLayout): Grid {
  const step = layout.gridStep;
  const originX = layout.bounds.min.x;
  const originZ = layout.bounds.min.z;
  const cols = Math.max(1, Math.round((layout.bounds.max.x - layout.bounds.min.x) / step));
  const rows = Math.max(1, Math.round((layout.bounds.max.z - layout.bounds.min.z) / step));
  const walkable = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = { x: originX + (c + 0.5) * step, z: originZ + (r + 0.5) * step };
      walkable[r * cols + c] = isFree(layout, p) ? 1 : 0;
    }
  }
  return { cols, rows, step, originX, originZ, walkable };
}

function grid(layout: YardLayout): Grid {
  let g = gridCache.get(layout);
  if (!g) {
    g = buildGrid(layout);
    gridCache.set(layout, g);
  }
  return g;
}

function insideBounds(layout: YardLayout, p: YardPoint, margin = ACTOR_RADIUS): boolean {
  return p.x >= layout.bounds.min.x + margin && p.x <= layout.bounds.max.x - margin && p.z >= layout.bounds.min.z + margin && p.z <= layout.bounds.max.z - margin;
}

function blockedBy(obstacle: Obstacle, p: YardPoint): boolean {
  return Math.hypot(p.x - obstacle.center.x, p.z - obstacle.center.z) < obstacle.radius + ACTOR_RADIUS;
}

/** Inside the fence (with margin) and outside every inflated obstacle. */
export function isFree(layout: YardLayout, p: YardPoint): boolean {
  if (!insideBounds(layout, p)) return false;
  for (const o of layout.obstacles) if (blockedBy(o, p)) return false;
  return true;
}

/** Clamps into the walkable rectangle and pushes out of obstacles (a few iterations are enough). */
export function clampToWalkable(layout: YardLayout, p: YardPoint): YardPoint {
  let x = Math.min(layout.bounds.max.x - ACTOR_RADIUS, Math.max(layout.bounds.min.x + ACTOR_RADIUS, p.x));
  let z = Math.min(layout.bounds.max.z - ACTOR_RADIUS, Math.max(layout.bounds.min.z + ACTOR_RADIUS, p.z));
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const o of layout.obstacles) {
      const dx = x - o.center.x;
      const dz = z - o.center.z;
      const d = Math.hypot(dx, dz);
      const min = o.radius + ACTOR_RADIUS + 1e-3;
      if (d < min) {
        if (d < 1e-6) {
          x = o.center.x + min;
        } else {
          x = o.center.x + (dx / d) * min;
          z = o.center.z + (dz / d) * min;
        }
        moved = true;
      }
    }
    x = Math.min(layout.bounds.max.x - ACTOR_RADIUS, Math.max(layout.bounds.min.x + ACTOR_RADIUS, x));
    z = Math.min(layout.bounds.max.z - ACTOR_RADIUS, Math.max(layout.bounds.min.z + ACTOR_RADIUS, z));
    if (!moved) break;
  }
  if (isFree(layout, { x, z })) return { x, z };
  // Still blocked (e.g. wedged between obstacle and fence): nearest free grid cell.
  const cell = nearestFreeCell(layout, { x, z });
  return cell ?? { x, z };
}

function toCell(g: Grid, p: YardPoint): { c: number; r: number } {
  return {
    c: Math.min(g.cols - 1, Math.max(0, Math.floor((p.x - g.originX) / g.step))),
    r: Math.min(g.rows - 1, Math.max(0, Math.floor((p.z - g.originZ) / g.step))),
  };
}

function cellCenter(g: Grid, c: number, r: number): YardPoint {
  return { x: g.originX + (c + 0.5) * g.step, z: g.originZ + (r + 0.5) * g.step };
}

function nearestFreeCell(layout: YardLayout, p: YardPoint): YardPoint | null {
  const g = grid(layout);
  const start = toCell(g, p);
  for (let radius = 0; radius < Math.max(g.cols, g.rows); radius++) {
    let best: YardPoint | null = null;
    let bestD = Infinity;
    for (let r = start.r - radius; r <= start.r + radius; r++) {
      for (let c = start.c - radius; c <= start.c + radius; c++) {
        if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) continue;
        if (Math.max(Math.abs(r - start.r), Math.abs(c - start.c)) !== radius) continue;
        if (!g.walkable[r * g.cols + c]) continue;
        const q = cellCenter(g, c, r);
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = q;
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** Segment a→b stays free of inflated obstacles and inside the bounds (sampled every ~5 cm plus analytic circle test). */
export function lineOfSight(layout: YardLayout, a: YardPoint, b: YardPoint): boolean {
  if (!insideBounds(layout, a) || !insideBounds(layout, b)) return false;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  for (const o of layout.obstacles) {
    const min = o.radius + ACTOR_RADIUS;
    let t = len2 > 0 ? ((o.center.x - a.x) * dx + (o.center.z - a.z) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    if (Math.hypot(px - o.center.x, pz - o.center.z) < min) return false;
  }
  return true;
}

/**
 * Way points from `from` to `to` (excluding `from`, ending at the reachable target). Empty when
 * already there. Targets inside an obstacle are moved to the nearest free spot first.
 */
export function findPath(layout: YardLayout, from: YardPoint, to: YardPoint): YardPoint[] {
  const target = isFree(layout, to) ? to : clampToWalkable(layout, to);
  if (Math.hypot(target.x - from.x, target.z - from.z) < 1e-3) return [];
  if (lineOfSight(layout, from, target)) return [target];
  const g = grid(layout);
  const start = toCell(g, from);
  const goal = toCell(g, target);
  const startIdx = start.r * g.cols + start.c;
  const goalIdx = goal.r * g.cols + goal.c;
  const n = g.cols * g.rows;
  const gScore = new Float64Array(n).fill(Infinity);
  const fScore = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open: number[] = [startIdx];
  gScore[startIdx] = 0;
  fScore[startIdx] = heuristic(g, startIdx, goalIdx);
  const neighbours = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ] as const;
  let found = false;
  while (open.length) {
    // smallest f (linear scan; the grid has ≤ 26 × 24 cells)
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (fScore[open[i]!]! < fScore[open[bi]!]!) bi = i;
    const current = open[bi]!;
    if (current === goalIdx) {
      found = true;
      break;
    }
    open.splice(bi, 1);
    closed[current] = 1;
    const cr = Math.floor(current / g.cols);
    const cc = current - cr * g.cols;
    for (const [dc, dr, cost] of neighbours) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue;
      const ni = nr * g.cols + nc;
      if (!g.walkable[ni] || closed[ni]) continue;
      // no corner cutting: both orthogonal neighbours of a diagonal step must be free
      if (dc !== 0 && dr !== 0 && (!g.walkable[cr * g.cols + nc] || !g.walkable[nr * g.cols + cc])) continue;
      const tentative = gScore[current]! + cost;
      if (tentative < gScore[ni]!) {
        cameFrom[ni] = current;
        gScore[ni] = tentative;
        fScore[ni] = tentative + heuristic(g, ni, goalIdx);
        if (!open.includes(ni)) open.push(ni);
      }
    }
  }
  if (!found) {
    // unreachable (should not happen in the yard): walk straight as far as the clamp allows
    return [clampToWalkable(layout, target)];
  }
  const cells: YardPoint[] = [];
  for (let i = goalIdx; i !== -1 && i !== startIdx; i = cameFrom[i]!) {
    const r = Math.floor(i / g.cols);
    cells.push(cellCenter(g, i - r * g.cols, r));
  }
  cells.reverse();
  cells[cells.length - 1] = target;
  return smooth(layout, from, cells);
}

function heuristic(g: Grid, a: number, b: number): number {
  const ar = Math.floor(a / g.cols);
  const ac = a - ar * g.cols;
  const br = Math.floor(b / g.cols);
  const bc = b - br * g.cols;
  const dx = Math.abs(ac - bc);
  const dz = Math.abs(ar - br);
  return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
}

/** Greedy line-of-sight smoothing: keep the farthest visible way point each time. */
function smooth(layout: YardLayout, from: YardPoint, points: YardPoint[]): YardPoint[] {
  const out: YardPoint[] = [];
  let anchor = from;
  let i = 0;
  while (i < points.length) {
    let far = i;
    for (let j = points.length - 1; j > i; j--) {
      if (lineOfSight(layout, anchor, points[j]!)) {
        far = j;
        break;
      }
    }
    out.push(points[far]!);
    anchor = points[far]!;
    i = far + 1;
  }
  return out;
}
