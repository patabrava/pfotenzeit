/**
 * Tiny software rasterizer used only during development to eyeball the generated models
 * (orthographic views, vertex colours, Lambert shading, z-buffer). Writes PNGs with node:zlib.
 * Not used by the game.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { Matrix4, Vector3 } from 'three';

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function writePng(path, width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy ? rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
      : raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** CPU linear-blend skinning. boneMatrices: Matrix4[] world matrices of the posed bones; ibm Float32Array. */
export function skinPositions(positions, normals, joints, weights, boneMatrices, ibm) {
  const n = positions.length / 3;
  const out = new Float32Array(positions.length);
  const outN = new Float32Array(normals.length);
  const skinMats = boneMatrices.map((m, i) => new Matrix4().fromArray(ibm, i * 16).premultiply(m));
  const v = new Vector3();
  const nv = new Vector3();
  const acc = new Vector3();
  const accN = new Vector3();
  for (let i = 0; i < n; i++) {
    acc.set(0, 0, 0);
    accN.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = weights[i * 4 + k];
      if (w === 0) continue;
      const m = skinMats[joints[i * 4 + k]];
      v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).applyMatrix4(m);
      acc.addScaledVector(v, w);
      nv.set(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]).transformDirection(m);
      accN.addScaledVector(nv, w);
    }
    out[i * 3] = acc.x; out[i * 3 + 1] = acc.y; out[i * 3 + 2] = acc.z;
    accN.normalize();
    outN[i * 3] = accN.x; outN[i * 3 + 1] = accN.y; outN[i * 3 + 2] = accN.z;
  }
  return { positions: out, normals: outN };
}

/**
 * Render an orthographic view. view: { yaw (deg, around Y), pitch (deg, camera looks down), size: world units
 * spanning the image height, center: [x,y,z], width, height }.
 */
export function renderView({ positions, normals, colors, indices }, view) {
  const { width = 512, height = 512, yaw = 0, pitch = 0, size = 1, center = [0, 0, 0], ground = true } = view;
  const rgba = Buffer.alloc(width * height * 4);
  const zbuf = new Float32Array(width * height).fill(-Infinity);
  // background
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 244; rgba[i * 4 + 1] = 240; rgba[i * 4 + 2] = 232; rgba[i * 4 + 3] = 255;
  }
  const rot = new Matrix4().makeRotationY(-yaw * Math.PI / 180);
  const tilt = new Matrix4().makeRotationX(pitch * Math.PI / 180);
  const cam = new Matrix4().multiplyMatrices(tilt, rot);
  const scale = height / size;
  const light = new Vector3(-0.4, 0.8, 0.6).normalize();
  const p = [new Vector3(), new Vector3(), new Vector3()];
  const n = new Vector3();
  const nCount = indices.length / 3;
  const project = (x, y, z, out) => {
    out.set(x - center[0], y - center[1], z - center[2]).applyMatrix4(cam);
    out.x = width / 2 + out.x * scale;
    out.y = height / 2 - out.y * scale;
    return out;
  };
  // ground shadow line (y = 0 plane as subtle band) for scale reading
  if (ground) {
    const g0 = project(-10, 0, 0, new Vector3());
    const g1 = project(10, 0, 0, new Vector3());
    for (let x = 0; x < width; x++) {
      const t = x / width;
      const y = Math.round(g0.y + (g1.y - g0.y) * t);
      if (y >= 0 && y < height) {
        const i = (y * width + x) * 4;
        rgba[i] = 200; rgba[i + 1] = 196; rgba[i + 2] = 188;
      }
    }
  }
  for (let t = 0; t < nCount; t++) {
    const ia = indices[t * 3], ib = indices[t * 3 + 1], ic = indices[t * 3 + 2];
    project(positions[ia * 3], positions[ia * 3 + 1], positions[ia * 3 + 2], p[0]);
    project(positions[ib * 3], positions[ib * 3 + 1], positions[ib * 3 + 2], p[1]);
    project(positions[ic * 3], positions[ic * 3 + 1], positions[ic * 3 + 2], p[2]);
    const minX = Math.max(0, Math.floor(Math.min(p[0].x, p[1].x, p[2].x)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(p[0].x, p[1].x, p[2].x)));
    const minY = Math.max(0, Math.floor(Math.min(p[0].y, p[1].y, p[2].y)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(p[0].y, p[1].y, p[2].y)));
    if (minX > maxX || minY > maxY) continue;
    const area = (p[1].x - p[0].x) * (p[2].y - p[0].y) - (p[2].x - p[0].x) * (p[1].y - p[0].y);
    if (Math.abs(area) < 1e-9) continue;
    const verts = [ia, ib, ic];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((p[1].x - px) * (p[2].y - py) - (p[2].x - px) * (p[1].y - py)) / area;
        const w1 = ((p[2].x - px) * (p[0].y - py) - (p[0].x - px) * (p[2].y - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * p[0].z + w1 * p[1].z + w2 * p[2].z;
        const zi = y * width + x;
        if (z <= zbuf[zi]) continue;
        zbuf[zi] = z;
        const ws = [w0, w1, w2];
        let r = 0, g = 0, b = 0;
        n.set(0, 0, 0);
        for (let k = 0; k < 3; k++) {
          const vi = verts[k];
          r += colors[vi * 3] * ws[k]; g += colors[vi * 3 + 1] * ws[k]; b += colors[vi * 3 + 2] * ws[k];
          n.x += normals[vi * 3] * ws[k]; n.y += normals[vi * 3 + 1] * ws[k]; n.z += normals[vi * 3 + 2] * ws[k];
        }
        n.normalize();
        const lam = Math.max(0, n.dot(light));
        const shade = 0.42 + 0.62 * lam;
        const i = zi * 4;
        rgba[i] = Math.round(linearToSrgb(Math.min(1, r * shade)) * 255);
        rgba[i + 1] = Math.round(linearToSrgb(Math.min(1, g * shade)) * 255);
        rgba[i + 2] = Math.round(linearToSrgb(Math.min(1, b * shade)) * 255);
        rgba[i + 3] = 255;
      }
    }
  }
  return rgba;
}

/** Compose several views side by side into one PNG. */
export function contactSheet(path, geometry, views, cell = 360) {
  const cols = views.length;
  const sheet = Buffer.alloc(cell * cols * cell * 4);
  views.forEach((v, c) => {
    const img = renderView(geometry, { ...v, width: cell, height: cell });
    for (let y = 0; y < cell; y++) {
      img.copy(sheet, (y * cell * cols + c * cell) * 4, y * cell * 4, (y + 1) * cell * 4);
    }
  });
  writePng(path, cell * cols, cell, sheet);
}
