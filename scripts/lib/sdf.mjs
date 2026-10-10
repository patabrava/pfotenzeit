/**
 * Signed-distance-field tools for the blended dog body (WP-G, creative plan F3).
 * Primitives (ellipsoid, rounded cone), polynomial smooth-min, naive surface nets extraction on a
 * regular grid, Laplacian smoothing, re-projection onto an iso-surface and gradient normals.
 * Pure math; three is only used for vector arithmetic. Units: metres.
 */

/** Polynomial smooth minimum (Inigo Quilez). k is the blend radius in metres. */
export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function sdSphere(p, c, r) {
  return Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r;
}

/** Approximate ellipsoid distance (good enough for blending; exact on the axes). */
export function sdEllipsoid(p, c, r) {
  const kx = (p[0] - c[0]) / r[0];
  const ky = (p[1] - c[1]) / r[1];
  const kz = (p[2] - c[2]) / r[2];
  const k0 = Math.hypot(kx, ky, kz);
  const k1 = Math.hypot(kx / r[0], ky / r[1], kz / r[2]);
  if (k1 === 0) return -Math.min(r[0], r[1], r[2]);
  return (k0 * (k0 - 1)) / k1;
}

/** Exact rounded cone: capsule from a (radius r1) to b (radius r2). */
export function sdRoundCone(p, a, b, r1, r2) {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = p[0] - a[0];
  const pay = p[1] - a[1];
  const paz = p[2] - a[2];
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const qx = pax * l2 - bax * y;
  const qy = pay * l2 - bay * y;
  const qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

export function sdCapsule(p, a, b, r) {
  return sdRoundCone(p, a, b, r, r);
}

/** Central-difference gradient. */
export function gradAt(fn, p, eps = 1e-3) {
  const dx = fn([p[0] + eps, p[1], p[2]]) - fn([p[0] - eps, p[1], p[2]]);
  const dy = fn([p[0], p[1] + eps, p[2]]) - fn([p[0], p[1] - eps, p[2]]);
  const dz = fn([p[0], p[1], p[2] + eps]) - fn([p[0], p[1], p[2] - eps]);
  const l = Math.hypot(dx, dy, dz) || 1;
  return [dx / l, dy / l, dz / l];
}

/** Move p onto the iso-surface fn = iso with a few Newton steps along the gradient. */
export function projectPoint(fn, p, iso = 0, steps = 4, eps = 1e-3) {
  let q = [p[0], p[1], p[2]];
  for (let i = 0; i < steps; i++) {
    const d = fn(q) - iso;
    if (Math.abs(d) < 1e-5) break;
    const g = gradAt(fn, q, eps);
    q = [q[0] - d * g[0], q[1] - d * g[1], q[2] - d * g[2]];
  }
  return q;
}

/** Naive surface nets on a regular grid. Returns { positions, indices } with shared vertices. */
export function surfaceNets(fn, min, max, h) {
  const nx = Math.ceil((max[0] - min[0]) / h);
  const ny = Math.ceil((max[1] - min[1]) / h);
  const nz = Math.ceil((max[2] - min[2]) / h);
  const sy = nz + 1;
  const sx = (ny + 1) * sy;
  const field = new Float32Array((nx + 1) * sx);
  for (let i = 0; i <= nx; i++) {
    const x = min[0] + i * h;
    for (let j = 0; j <= ny; j++) {
      const y = min[1] + j * h;
      for (let k = 0; k <= nz; k++) {
        field[i * sx + j * sy + k] = fn([x, y, min[2] + k * h]);
      }
    }
  }
  const cidx = (i, j, k) => (i * ny + j) * nz + k;
  const cellVertex = new Int32Array(nx * ny * nz).fill(-1);
  const positions = [];
  const EDGES = [
    [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7],
  ];
  const corner = new Float64Array(8);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        let mask = 0;
        for (let m = 0; m < 8; m++) {
          const v = field[(i + (m & 1)) * sx + (j + ((m >> 1) & 1)) * sy + (k + (m >> 2))];
          corner[m] = v;
          if (v < 0) mask |= 1 << m;
        }
        if (mask === 0 || mask === 255) continue;
        let cx = 0;
        let cy = 0;
        let cz = 0;
        let count = 0;
        for (const [a, b] of EDGES) {
          const va = corner[a];
          const vb = corner[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          const ax = a & 1, ay = (a >> 1) & 1, az = a >> 2;
          const bx = b & 1, by = (b >> 1) & 1, bz = b >> 2;
          cx += ax + (bx - ax) * t;
          cy += ay + (by - ay) * t;
          cz += az + (bz - az) * t;
          count++;
        }
        cellVertex[cidx(i, j, k)] = positions.length / 3;
        positions.push(min[0] + (i + cx / count) * h, min[1] + (j + cy / count) * h, min[2] + (k + cz / count) * h);
      }
    }
  }
  const indices = [];
  const quad = (cells, outward) => {
    const a = cellVertex[cells[0]], b = cellVertex[cells[1]], c = cellVertex[cells[2]], d = cellVertex[cells[3]];
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // orient by the diagonal cross product against the expected outward axis
    const ux = positions[c * 3] - positions[a * 3], uy = positions[c * 3 + 1] - positions[a * 3 + 1], uz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const vx = positions[d * 3] - positions[b * 3], vy = positions[d * 3 + 1] - positions[b * 3 + 1], vz = positions[d * 3 + 2] - positions[b * 3 + 2];
    const nx_ = uy * vz - uz * vy, ny_ = uz * vx - ux * vz, nz_ = ux * vy - uy * vx;
    const dot = nx_ * outward[0] + ny_ * outward[1] + nz_ * outward[2];
    if (dot >= 0) indices.push(a, b, c, a, c, d);
    else indices.push(a, c, b, a, d, c);
  };
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= ny; j++) {
      for (let k = 0; k <= nz; k++) {
        const v0 = field[i * sx + j * sy + k];
        const inside = v0 < 0;
        if (i < nx && j >= 1 && j < ny && k >= 1 && k < nz) {
          const v1 = field[(i + 1) * sx + j * sy + k];
          if (inside !== v1 < 0) quad([cidx(i, j - 1, k - 1), cidx(i, j, k - 1), cidx(i, j, k), cidx(i, j - 1, k)], [inside ? 1 : -1, 0, 0]);
        }
        if (j < ny && i >= 1 && i < nx && k >= 1 && k < nz) {
          const v1 = field[i * sx + (j + 1) * sy + k];
          if (inside !== v1 < 0) quad([cidx(i - 1, j, k - 1), cidx(i, j, k - 1), cidx(i, j, k), cidx(i - 1, j, k)], [0, inside ? 1 : -1, 0]);
        }
        if (k < nz && i >= 1 && i < nx && j >= 1 && j < ny) {
          const v1 = field[i * sx + j * sy + k + 1];
          if (inside !== v1 < 0) quad([cidx(i - 1, j - 1, k), cidx(i, j - 1, k), cidx(i, j, k), cidx(i - 1, j, k)], [0, 0, inside ? 1 : -1]);
        }
      }
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

function adjacency(count, indices) {
  const adj = Array.from({ length: count }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    adj[a].add(b).add(c);
    adj[b].add(a).add(c);
    adj[c].add(a).add(b);
  }
  return adj.map((s) => [...s]);
}

/** In-place Laplacian smoothing (umbrella operator). */
export function laplacianSmooth(positions, indices, iterations = 2, lambda = 0.5) {
  const n = positions.length / 3;
  const adj = adjacency(n, indices);
  const next = new Float32Array(positions.length);
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      const nb = adj[i];
      if (nb.length === 0) {
        next[i * 3] = positions[i * 3];
        next[i * 3 + 1] = positions[i * 3 + 1];
        next[i * 3 + 2] = positions[i * 3 + 2];
        continue;
      }
      let mx = 0, my = 0, mz = 0;
      for (const j of nb) {
        mx += positions[j * 3];
        my += positions[j * 3 + 1];
        mz += positions[j * 3 + 2];
      }
      mx /= nb.length;
      my /= nb.length;
      mz /= nb.length;
      next[i * 3] = positions[i * 3] + lambda * (mx - positions[i * 3]);
      next[i * 3 + 1] = positions[i * 3 + 1] + lambda * (my - positions[i * 3 + 1]);
      next[i * 3 + 2] = positions[i * 3 + 2] + lambda * (mz - positions[i * 3 + 2]);
    }
    positions.set(next);
  }
  return positions;
}

/** Move every vertex back onto fn = iso (counteracts smoothing shrinkage, keeps features). */
export function projectToIso(positions, fn, iso = 0, steps = 2, eps = 1e-3) {
  for (let i = 0; i < positions.length; i += 3) {
    const q = projectPoint(fn, [positions[i], positions[i + 1], positions[i + 2]], iso, steps, eps);
    positions[i] = q[0];
    positions[i + 1] = q[1];
    positions[i + 2] = q[2];
  }
  return positions;
}

/** Normals from the field gradient (outward, smooth across blends). */
export function gradientNormals(positions, fn, eps = 1e-3) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const g = gradAt(fn, [positions[i], positions[i + 1], positions[i + 2]], eps);
    normals[i] = g[0];
    normals[i + 1] = g[1];
    normals[i + 2] = g[2];
  }
  return normals;
}

/**
 * Extract a smooth mesh of fn = 0: surface nets → smoothing → re-projection → gradient normals.
 * Returns { positions, normals, indices } (Float32Array / Uint32Array).
 */
export function extractSurface(fn, min, max, h, { smoothIterations = 3, lambda = 0.5 } = {}) {
  const { positions, indices } = surfaceNets(fn, min, max, h);
  laplacianSmooth(positions, indices, smoothIterations, lambda);
  projectToIso(positions, fn, 0, 3, h * 0.25);
  const normals = gradientNormals(positions, fn, h * 0.25);
  return { positions, normals, indices };
}
