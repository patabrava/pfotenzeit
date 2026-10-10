/**
 * Texture helpers for the textured asset contract (D-036): slot inventory, decoded-size estimate,
 * PNG decode/encode with node:zlib only and a box-filter downscale to a power-of-two cap.
 * No sharp, no ndarray: gltf-transform's textureCompress/textureResize need sharp, which is not a
 * dependency of this project. JPEG inputs cannot be decoded here; they pass through unchanged when
 * they are within the cap and are reported otherwise.
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { ImageUtils } from '@gltf-transform/core';

export const TEXTURE_SLOTS = ['baseColor', 'normal', 'metallicRoughness', 'occlusion', 'emissive'];

const SLOT_GETTER = {
  baseColor: (m) => m.getBaseColorTexture(),
  normal: (m) => m.getNormalTexture(),
  metallicRoughness: (m) => m.getMetallicRoughnessTexture(),
  occlusion: (m) => m.getOcclusionTexture(),
  emissive: (m) => m.getEmissiveTexture(),
};

/** Decoded GPU estimate used by the budget: RGBA8 plus a 1/3 mip chain. */
export function decodedEstimate(width, height) {
  return Math.round(width * height * 4 * 1.33);
}

/** Pixel size of an encoded image, or null when the container is unknown. */
export function imageSize(bytes, mime) {
  try {
    return ImageUtils.getSize(bytes, mime);
  } catch {
    return null;
  }
}

/**
 * One row per (material, slot) with a texture: { slot, material, name, mime, width, height, bytes,
 * decodedBytes, texture }. Textures shared by several materials/slots appear once per use.
 */
export function listTextureSlots(doc) {
  const rows = [];
  for (const m of doc.getRoot().listMaterials()) {
    for (const slot of TEXTURE_SLOTS) {
      const t = SLOT_GETTER[slot](m);
      if (!t) continue;
      const image = t.getImage();
      const mime = t.getMimeType() || ImageUtils.getMimeType(image);
      const size = image ? imageSize(image, mime) : null;
      rows.push({
        slot,
        material: m.getName(),
        name: t.getName(),
        mime,
        width: size ? size[0] : 0,
        height: size ? size[1] : 0,
        bytes: image ? image.byteLength : 0,
        decodedBytes: size ? decodedEstimate(size[0], size[1]) : 0,
        texture: t,
      });
    }
  }
  return rows;
}

/** Manifest `textures` array (D-036): unique (texture, slot) pairs without the object handle. */
export function manifestTextures(doc) {
  const seen = new Set();
  const out = [];
  for (const r of listTextureSlots(doc)) {
    const id = `${r.slot}:${r.name}:${r.bytes}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ slot: r.slot, width: r.width, height: r.height, bytes: r.bytes, mime: r.mime });
  }
  return out;
}

/** Target size for a cap: unchanged when within, else the nearest power of two per side ≤ cap. */
export function capSize(width, height, cap) {
  if (Math.max(width, height) <= cap) return [width, height];
  const s = cap / Math.max(width, height);
  const p2 = (v) => Math.max(1, Math.min(cap, 2 ** Math.round(Math.log2(Math.max(1, v)))));
  return [p2(width * s), p2(height * s)];
}

// ---------------------------------------------------------------- PNG (node:zlib only)
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function pngInfo(buf) {
  if (buf.length < 33) return null;
  for (let i = 0; i < 8; i++) if (buf[i] !== PNG_SIG[i]) return null;
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), bitDepth: b[24], colorType: b[25], interlace: b[28] };
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Decode a non-interlaced PNG (all bit depths and colour types) to RGBA8. */
export function decodePng(bytes) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const info = pngInfo(buf);
  if (!info) throw new Error('not a PNG');
  if (info.interlace) throw new Error('interlaced PNG not supported');
  const { width: w, height: h, bitDepth: bd, colorType: ct } = info;
  const channels = CHANNELS[ct];
  if (!channels) throw new Error(`PNG colour type ${ct} not supported`);
  const idat = [];
  let plte = null;
  let trns = null;
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = Math.max(1, Math.ceil((channels * bd) / 8));
  const stride = Math.ceil((w * channels * bd) / 8);
  const lines = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    const cur = lines.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let x = raw[p + i];
      if (f === 1) x += a;
      else if (f === 2) x += b;
      else if (f === 3) x += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        x += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = x & 255;
    }
    p += stride;
    prev = cur;
  }
  const maxv = (1 << bd) - 1;
  const sample = (line, idx) => {
    if (bd === 8) return line[idx];
    if (bd === 16) return line[idx * 2];
    const perByte = 8 / bd;
    const byte = line[Math.floor(idx / perByte)];
    const shift = 8 - bd * (1 + (idx % perByte));
    const v = (byte >> shift) & maxv;
    return ct === 3 ? v : Math.round((v * 255) / maxv);
  };
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const line = lines.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ct === 0) {
        const g = sample(line, x);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g;
        rgba[o + 3] = 255;
      } else if (ct === 2) {
        rgba[o] = sample(line, x * 3);
        rgba[o + 1] = sample(line, x * 3 + 1);
        rgba[o + 2] = sample(line, x * 3 + 2);
        rgba[o + 3] = 255;
      } else if (ct === 3) {
        const i = sample(line, x);
        rgba[o] = plte ? plte[i * 3] : 0;
        rgba[o + 1] = plte ? plte[i * 3 + 1] : 0;
        rgba[o + 2] = plte ? plte[i * 3 + 2] : 0;
        rgba[o + 3] = trns && i < trns.length ? trns[i] : 255;
      } else if (ct === 4) {
        const g = sample(line, x * 2);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g;
        rgba[o + 3] = sample(line, x * 2 + 1);
      } else {
        rgba[o] = sample(line, x * 4);
        rgba[o + 1] = sample(line, x * 4 + 1);
        rgba[o + 2] = sample(line, x * 4 + 2);
        rgba[o + 3] = sample(line, x * 4 + 3);
      }
    }
  }
  const hasAlpha = ct === 4 || ct === 6 || (ct === 3 && !!trns);
  return { width: w, height: h, rgba, hasAlpha, colorType: ct, bitDepth: bd };
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([len, typeBytes, data, crc]);
}

/**
 * Encode RGBA8 as PNG (colour type 6, or 2 when alpha=false drops the alpha channel). Per-line filter
 * chosen by the minimum-sum heuristic (none/sub/up/average/paeth), deflate level 9.
 */
export function encodePng(width, height, rgba, { alpha = true } = {}) {
  const ch = alpha ? 4 : 3;
  const stride = width * ch;
  const raw = Buffer.alloc((stride + 1) * height);
  const cur = Buffer.alloc(stride);
  let prev = Buffer.alloc(stride);
  const cand = Array.from({ length: 5 }, () => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      cur[x * ch] = rgba[s];
      cur[x * ch + 1] = rgba[s + 1];
      cur[x * ch + 2] = rgba[s + 2];
      if (alpha) cur[x * ch + 3] = rgba[s + 3];
    }
    let bestF = 0;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = cand[f];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= ch ? cur[i - ch] : 0;
        const b = prev[i];
        const c = i >= ch ? prev[i - ch] : 0;
        let v = cur[i];
        if (f === 1) v -= a;
        else if (f === 2) v -= b;
        else if (f === 3) v -= (a + b) >> 1;
        else if (f === 4) {
          const pp = a + b - c;
          const pa = Math.abs(pp - a);
          const pb = Math.abs(pp - b);
          const pc = Math.abs(pp - c);
          v -= pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        v &= 255;
        out[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        bestF = f;
      }
    }
    raw[y * (stride + 1)] = bestF;
    cand[bestF].copy(raw, y * (stride + 1) + 1);
    prev = Buffer.from(cur);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from(PNG_SIG),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Box-filter (area average) downscale of RGBA8. Averages in the stored encoding (sRGB stays sRGB). */
export function downscaleRgba(src, w, h, tw, th) {
  const out = new Uint8Array(tw * th * 4);
  for (let ty = 0; ty < th; ty++) {
    const y0 = Math.floor((ty * h) / th);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * h) / th));
    for (let tx = 0; tx < tw; tx++) {
      const x0 = Math.floor((tx * w) / tw);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * w) / tw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const s = (y * w + x) * 4;
          r += src[s];
          g += src[s + 1];
          b += src[s + 2];
          a += src[s + 3];
          n++;
        }
      }
      const o = (ty * tw + tx) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

/**
 * Resize one gltf-transform Texture in place to the cap. Returns a report row; PNGs are decoded,
 * box-filtered to the capSize and re-encoded; other formats are left untouched and flagged when
 * above the cap (no decoder available without a dependency).
 */
export function resizeTextureToCap(texture, cap) {
  const image = texture.getImage();
  const mime = texture.getMimeType() || (image ? ImageUtils.getMimeType(image) : '');
  const row = { name: texture.getName(), mime, changed: false, from: null, to: null, bytesBefore: image ? image.byteLength : 0, bytesAfter: image ? image.byteLength : 0, note: '' };
  if (!image) {
    row.note = 'texture has no image data';
    return row;
  }
  const size = imageSize(image, mime);
  if (!size) {
    row.note = `size unknown for ${mime}`;
    return row;
  }
  row.from = size;
  const target = capSize(size[0], size[1], cap);
  row.to = target;
  if (target[0] === size[0] && target[1] === size[1]) return row;
  if (mime !== 'image/png') {
    row.note = `${mime} ${size[0]}x${size[1]} above cap ${cap}: no decoder in this pipeline, resize outside the sandbox`;
    return row;
  }
  const decoded = decodePng(image);
  const small = downscaleRgba(decoded.rgba, decoded.width, decoded.height, target[0], target[1]);
  const png = encodePng(target[0], target[1], small, { alpha: decoded.hasAlpha });
  texture.setImage(new Uint8Array(png.buffer, png.byteOffset, png.byteLength)).setMimeType('image/png');
  row.changed = true;
  row.bytesAfter = png.byteLength;
  return row;
}
