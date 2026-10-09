#!/usr/bin/env node
/**
 * Exports the pixel profile sprites to public/assets/pixel/<name>.png (128 x 128 RGBA) plus index.json.
 * Reads the same authored data as the runtime (src/ui/pixel/sprites.ts, palette.ts) via Node's native
 * TypeScript type stripping (Node >= 22.18 / 23.6; package.json requires >= 22.12 — older 22.x needs
 * `node --experimental-strip-types`). PNG encoding uses only node:zlib; no dependencies.
 * The runtime never loads these PNGs; they document the asset for the manifest (16_ASSET_PRODUCTION).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

let SPRITES, PIXEL_CANVAS, PALETTE, TRANSPARENT;
try {
  ({ SPRITES, PIXEL_CANVAS } = await import('../src/ui/pixel/sprites.ts'));
  ({ PALETTE, TRANSPARENT } = await import('../src/ui/pixel/palette.ts'));
} catch (err) {
  console.error('Could not load src/ui/pixel/*.ts. Node >= 22.18 strips types natively; on older 22.x run:');
  console.error('  node --experimental-strip-types scripts/export-pixel.mjs');
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
}

// ---------------------------------------------------------------- raster (mirrors rasterizeFrame in PixelDog.ts)
function hexToRgb(hex) {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function rasterize(sprite, frameIndex) {
  const size = PIXEL_CANVAS;
  const data = new Uint8Array(size * size * 4);
  const rows = sprite.frames[frameIndex];
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === TRANSPARENT) continue;
      const entry = PALETTE[ch];
      if (!entry) throw new Error(`${sprite.name}: unknown palette char '${ch}' at ${x},${y}`);
      const px = sprite.origin.x + x;
      const py = sprite.origin.y + y;
      if (px < 0 || py < 0 || px >= size || py >= size) throw new Error(`${sprite.name}: pixel outside canvas at ${px},${py}`);
      const [r, g, b] = hexToRgb(entry.hex);
      const i = (py * size + px) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

// ---------------------------------------------------------------- PNG encoder (zlib only)
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
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- export
const outDir = join(root, 'public', 'assets', 'pixel');
mkdirSync(outDir, { recursive: true });

const entries = [];
let files = 0;
for (const sprite of SPRITES) {
  if (sprite.width > 64 || sprite.height > 64) throw new Error(`${sprite.name}: ${sprite.width}x${sprite.height} exceeds 64x64`);
  const frameFiles = [];
  sprite.frames.forEach((_, i) => {
    const file = i === 0 ? `${sprite.name}.png` : `${sprite.name}_${i}.png`;
    const png = encodePng(PIXEL_CANVAS, PIXEL_CANVAS, rasterize(sprite, i));
    writeFileSync(join(outDir, file), png);
    frameFiles.push({ file, bytes: png.length });
    files++;
  });
  entries.push({
    name: sprite.name,
    state: sprite.state,
    stage: sprite.stage,
    width: PIXEL_CANVAS,
    height: PIXEL_CANVAS,
    sprite: { width: sprite.width, height: sprite.height, origin: sprite.origin },
    frames: frameFiles,
  });
}

const index = {
  version: 1,
  generatedUTC: new Date().toISOString(),
  canvas: PIXEL_CANVAS,
  colors: Object.keys(PALETTE).length,
  status: 'code-authored',
  source: 'authored in src/ui/pixel/sprites.ts',
  license: 'project-internal, code-authored pixel art',
  sprites: entries,
};
writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');

console.log(`pixel export: ${entries.length} sprites, ${files} PNG files -> public/assets/pixel/`);
for (const e of entries) console.log(`  ${e.name}  ${e.sprite.width}x${e.sprite.height} @(${e.sprite.origin.x},${e.sprite.origin.y})  frames=${e.frames.length}`);
