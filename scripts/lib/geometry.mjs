/**
 * Geometry helpers for the code-authored models (WP-F).
 * three is used purely for geometry math (BufferGeometry, Matrix4, ...); nothing here touches a renderer.
 * All parts are built in model space: metres, +Y up, forward +Z, origin on the ground.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const DEG = Math.PI / 180;

// ------------------------------------------------------------------ colours
/** sRGB hex (#RRGGBB) → linear RGB floats, which is what glTF COLOR_0 stores. */
export function hexToLinear(hex) {
  const v = Number.parseInt(hex.slice(1), 16);
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((n) => n / 255);
  return c.map((s) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
}

export function mixColor(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function shade(color, factor) {
  return [color[0] * factor, color[1] * factor, color[2] * factor];
}

// ------------------------------------------------------------------ math helpers
export function v3(x = 0, y = 0, z = 0) {
  return new Vector3(x, y, z);
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Matrix from position, Euler XYZ rotation (degrees) and scale. */
export function transformMatrix({ position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 } = {}) {
  const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
  const q = new Quaternion().setFromEuler(new Euler(rotation[0] * DEG, rotation[1] * DEG, rotation[2] * DEG, 'XYZ'));
  return new Matrix4().compose(new Vector3(...position), q, new Vector3(...s));
}

/** Quaternion that rotates +Y onto the direction a→b. */
export function alignYTo(a, b) {
  const dir = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  return new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
}

// ------------------------------------------------------------------ primitive generators
/**
 * Superellipsoid: e=1 → ellipsoid, e≈0.4 → rounded box, small e → box.
 * rx/ry/rz are half extents. Returns an indexed BufferGeometry with smooth normals.
 */
export function superEllipsoid(rx, ry, rz, e1 = 1, e2 = 1, segsU = 16, segsV = 24) {
  const positions = [];
  const indices = [];
  const f = (w, e) => Math.sign(w) * Math.abs(w) ** e;
  for (let i = 0; i <= segsU; i++) {
    const eta = -Math.PI / 2 + (Math.PI * i) / segsU;
    const ce = Math.cos(eta);
    const se = Math.sin(eta);
    for (let j = 0; j <= segsV; j++) {
      const om = -Math.PI + (2 * Math.PI * j) / segsV;
      const co = Math.cos(om);
      const so = Math.sin(om);
      positions.push(rx * f(ce, e1) * f(co, e2), ry * f(se, e1), rz * f(ce, e1) * f(so, e2));
    }
  }
  for (let i = 0; i < segsU; i++) {
    for (let j = 0; j < segsV; j++) {
      const a = i * (segsV + 1) + j;
      const b = a + segsV + 1;
      indices.push(a, b + 1, a + 1, a, b, b + 1);
    }
  }
  let g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g = mergeVertices(g, 1e-6);
  g.computeVertexNormals();
  return g;
}

export function sphere(r, ws = 20, hs = 14) {
  return smooth(new SphereGeometry(r, ws, hs));
}

export function ellipsoid(rx, ry, rz, ws = 20, hs = 14) {
  const g = new SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return smooth(g);
}

export function box(w, h, d, segs = 1) {
  return new BoxGeometry(w, h, d, segs, segs, segs);
}

export function capsule(r, length, capSegs = 5, radial = 14) {
  return smooth(new CapsuleGeometry(r, length, capSegs, radial));
}

export function torus(R, r, radial = 10, tubular = 36) {
  return smooth(new TorusGeometry(R, r, radial, tubular));
}

/** Tapered segment from a to b: cylinder (ra→rb) with a sphere at the start joint. */
export function segment(a, b, ra, rb = ra, radial = 14, withJointSphere = true) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const cyl = new CylinderGeometry(rb, ra, len, radial, 1, true);
  cyl.translate(0, len / 2, 0);
  const q = alignYTo(a, b);
  const m = new Matrix4().compose(new Vector3(...a), q, new Vector3(1, 1, 1));
  cyl.applyMatrix4(m);
  const parts = [smooth(cyl)];
  if (withJointSphere) {
    const s = new SphereGeometry(ra, radial, Math.max(6, Math.round(radial * 0.6)));
    s.translate(a[0], a[1], a[2]);
    parts.push(smooth(s));
  }
  return mergeGeometries(parts.map(stripToPN), false);
}

/** Remove uv/other attributes, merge seams and recompute smooth normals. */
export function smooth(geometry) {
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');
  const g = mergeVertices(geometry, 1e-6);
  g.computeVertexNormals();
  return g;
}

function stripToPN(g) {
  const out = new BufferGeometry();
  out.setAttribute('position', g.getAttribute('position'));
  out.setAttribute('normal', g.getAttribute('normal'));
  out.setIndex(g.index);
  return out;
}

/** Apply a point deformation p→p' (in place) and recompute normals. */
export function deform(geometry, fn) {
  const pos = geometry.getAttribute('position');
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const q = fn(p.x, p.y, p.z);
    pos.setXYZ(i, q[0], q[1], q[2]);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// ------------------------------------------------------------------ part assembly
/**
 * A PartSet collects coloured primitives with a skin hint and merges them into one geometry.
 * `skin` is either a bone name (rigid) or an array of candidate bone names (distance-weighted).
 * `color` is an RGB linear triple or a function (x, y, z, nx, ny, nz) → RGB (model space, after transform).
 */
export class PartSet {
  constructor() {
    this.parts = [];
    this.skinSets = [];
  }

  add(geometry, { transform, color, skin = null, name = '' } = {}) {
    let g = geometry;
    if (transform) {
      const m = transform instanceof Matrix4 ? transform : transformMatrix(transform);
      g.applyMatrix4(m);
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    for (let i = 0; i < n; i++) {
      const c =
        typeof color === 'function'
          ? color(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i))
          : color;
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
    }
    g.setAttribute('color', new BufferAttribute(colors, 3));
    const key = JSON.stringify(skin);
    let setIndex = this.skinSets.findIndex((s) => s.key === key);
    if (setIndex < 0) {
      setIndex = this.skinSets.length;
      this.skinSets.push({ key, skin });
    }
    const sets = new Float32Array(n).fill(setIndex);
    g.setAttribute('skinset', new BufferAttribute(sets, 1));
    g.userData.name = name;
    this.parts.push(g);
    return this;
  }

  /** Merge into flat typed arrays. */
  merge() {
    const clean = this.parts.map((g) => {
      const out = new BufferGeometry();
      out.setAttribute('position', g.getAttribute('position'));
      out.setAttribute('normal', g.getAttribute('normal'));
      out.setAttribute('color', g.getAttribute('color'));
      out.setAttribute('skinset', g.getAttribute('skinset'));
      out.setIndex(g.index ?? sequentialIndex(g.getAttribute('position').count));
      return out;
    });
    const merged = mergeGeometries(clean, false);
    const positions = new Float32Array(merged.getAttribute('position').array);
    const normals = new Float32Array(merged.getAttribute('normal').array);
    // normalize normals defensively
    for (let i = 0; i < normals.length; i += 3) {
      const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
      normals[i] /= l;
      normals[i + 1] /= l;
      normals[i + 2] /= l;
    }
    const colors = new Float32Array(merged.getAttribute('color').array);
    const skinset = Array.from(merged.getAttribute('skinset').array, (v) => Math.round(v));
    const indices = dropDegenerate(merged.index.array, positions);
    return { positions, normals, colors, indices, skinset, skinSets: this.skinSets.map((s) => s.skin) };
  }
}

/** Remove triangles with repeated indices or (near) zero area, e.g. collapsed pole caps after mergeVertices. */
function dropDegenerate(index, positions) {
  const out = [];
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    if (a === b || b === c || a === c) continue;
    const ax = positions[b * 3] - positions[a * 3], ay = positions[b * 3 + 1] - positions[a * 3 + 1], az = positions[b * 3 + 2] - positions[a * 3 + 2];
    const bx = positions[c * 3] - positions[a * 3], by = positions[c * 3 + 1] - positions[a * 3 + 1], bz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (nx * nx + ny * ny + nz * nz < 1e-20) continue;
    out.push(a, b, c);
  }
  return new Uint32Array(out);
}

function sequentialIndex(n) {
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  return new BufferAttribute(idx, 1);
}

/** Bounds of a flat position array. */
export function bounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/** Convert linear float colours to normalized uint8 (glTF COLOR_0). */
export function colorsToUint8(colors) {
  const out = new Uint8Array(colors.length);
  for (let i = 0; i < colors.length; i++) out[i] = Math.round(clamp(colors[i], 0, 1) * 255);
  return out;
}
