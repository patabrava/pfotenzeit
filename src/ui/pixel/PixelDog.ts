/**
 * Canvas drawer for the pixel profile. Projects a PixelState + GrowthStage onto a 2D canvas with
 * integer scaling and nearest-neighbour sampling (06: "ganzzahlige Skalierung und nearest-neighbor").
 * The UI sets `image-rendering: pixelated` on the element; the background stays transparent.
 * Owns no state beyond a raster cache; never touches the domain.
 */
import type { GrowthStage, PixelState } from '../../simulation/types';
import { PALETTE, TRANSPARENT, hexToRgb, isPaletteChar } from './palette';
import { PIXEL_CANVAS, findSprite, type PixelSprite } from './sprites';

export interface PixelDogHandle {
  /** Draw the sprite for state/growth. `frame` wraps around the sprite's frame count. */
  render(state: PixelState, growth: GrowthStage, frame?: number): void;
  /** Number of frames of the sprite that would be shown for state/growth (1 = still image). */
  frameCount(state: PixelState, growth: GrowthStage): number;
  dispose(): void;
}

/** RGBA bytes of one frame on the 128 x 128 canvas (pure; shared logic with scripts/export-pixel.mjs). */
export function rasterizeFrame(sprite: PixelSprite, frameIndex: number): Uint8ClampedArray {
  const size = PIXEL_CANVAS;
  const data = new Uint8ClampedArray(size * size * 4);
  const rows = sprite.frames[frameIndex] ?? sprite.frames[0];
  if (!rows) return data;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < row.length; x++) {
      const ch = row[x] ?? TRANSPARENT;
      if (ch === TRANSPARENT || !isPaletteChar(ch)) continue;
      const px = sprite.origin.x + x;
      const py = sprite.origin.y + y;
      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      const [r, g, b] = hexToRgb(PALETTE[ch].hex);
      const i = (py * size + px) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

/** Integer scale so that 128 logical pixels fit the canvas' CSS box at device resolution. Never below 1. */
export function integerScale(cssSize: number, devicePixelRatio: number): number {
  const target = Math.floor(Math.max(0, cssSize) * Math.max(1, devicePixelRatio));
  return Math.max(1, Math.floor(target / PIXEL_CANVAS));
}

function frameKey(sprite: PixelSprite, frame: number): string {
  return `${sprite.name}#${frame}`;
}

export function createPixelDog(canvas: HTMLCanvasElement): PixelDogHandle {
  const ctx = canvas.getContext('2d');
  const cache = new Map<string, HTMLCanvasElement>();
  let disposed = false;

  function offscreen(sprite: PixelSprite, frame: number): HTMLCanvasElement {
    const key = frameKey(sprite, frame);
    const hit = cache.get(key);
    if (hit) return hit;
    const off = document.createElement('canvas');
    off.width = PIXEL_CANVAS;
    off.height = PIXEL_CANVAS;
    const octx = off.getContext('2d');
    if (octx) {
      const image = octx.createImageData(PIXEL_CANVAS, PIXEL_CANVAS);
      image.data.set(rasterizeFrame(sprite, frame));
      octx.putImageData(image, 0, 0);
    }
    cache.set(key, off);
    return off;
  }

  function currentScale(): number {
    const rect = canvas.getBoundingClientRect();
    const css = Math.min(rect.width, rect.height) || Math.min(canvas.clientWidth, canvas.clientHeight) || PIXEL_CANVAS;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return integerScale(css, dpr);
  }

  function render(state: PixelState, growth: GrowthStage, frame = 0): void {
    if (disposed || !ctx) return;
    const sprite = findSprite(state, growth);
    const count = sprite.frames.length;
    const f = ((Math.trunc(frame) % count) + count) % count;
    const scale = currentScale();
    const size = PIXEL_CANVAS * scale;
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(offscreen(sprite, f), 0, 0, size, size);
  }

  function frameCount(state: PixelState, growth: GrowthStage): number {
    return findSprite(state, growth).frames.length;
  }

  function dispose(): void {
    disposed = true;
    cache.clear();
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { render, frameCount, dispose };
}
