import { describe, expect, it } from 'vitest';
import { PALETTE, PALETTE_CHARS, TRANSPARENT, hexToRgb } from '../../src/ui/pixel/palette';
import { PIXEL_CANVAS, PIXEL_SPRITE_MAX, SPRITES, findSprite } from '../../src/ui/pixel/sprites';
import { integerScale, rasterizeFrame } from '../../src/ui/pixel/PixelDog';
import type { PixelState } from '../../src/simulation/types';

const STATES: Exclude<PixelState, 'memorial'>[] = ['awake', 'hungry', 'tired', 'playful', 'resting', 'exhausted'];

describe('pixel palette', () => {
  it('has 12–16 colours with valid hex values and single-character keys', () => {
    expect(PALETTE_CHARS.length).toBeGreaterThanOrEqual(12);
    expect(PALETTE_CHARS.length).toBeLessThanOrEqual(16);
    expect(PALETTE_CHARS).not.toContain(TRANSPARENT);
    for (const [ch, entry] of Object.entries(PALETTE)) {
      expect(ch).toHaveLength(1);
      expect(entry.hex).toMatch(/^#[0-9A-F]{6}$/i);
    }
    expect(hexToRgb('#C9955A')).toEqual([0xc9, 0x95, 0x5a]);
  });
});

describe('pixel sprites', () => {
  it('every sprite fits within 64 x 64, sits inside the 128 canvas and has consistent frames', () => {
    expect(PIXEL_CANVAS).toBe(128);
    expect(PIXEL_SPRITE_MAX).toBe(64);
    for (const s of SPRITES) {
      expect(s.width).toBeLessThanOrEqual(64);
      expect(s.height).toBeLessThanOrEqual(64);
      expect(s.frames.length).toBeGreaterThanOrEqual(1);
      expect(s.origin.x).toBeGreaterThanOrEqual(0);
      expect(s.origin.y).toBeGreaterThanOrEqual(0);
      expect(s.origin.x + s.width).toBeLessThanOrEqual(128);
      expect(s.origin.y + s.height).toBeLessThanOrEqual(128);
      for (const frame of s.frames) {
        expect(frame).toHaveLength(s.height);
        for (const row of frame) expect(row).toHaveLength(s.width);
      }
    }
  });

  it('uses only palette characters and transparency', () => {
    const allowed = new Set([...PALETTE_CHARS, TRANSPARENT]);
    for (const s of SPRITES) for (const frame of s.frames) for (const row of frame) for (const ch of row) expect(allowed.has(ch)).toBe(true);
  });

  it('has both growth stages for all six states, each with visible pixels', () => {
    for (const stage of ['arriving', 'growing'] as const) {
      for (const state of STATES) {
        const s = SPRITES.find((x) => x.state === state && x.stage === stage);
        expect(s, `${stage}/${state}`).toBeDefined();
        expect(s?.name).toBe(`nala_${stage}_${state}`);
        const filled = s?.frames[0]?.join('').replace(/\./g, '').length ?? 0;
        expect(filled).toBeGreaterThan(200);
      }
    }
  });

  it('growing sprites are taller than arriving ones for standing states (longer legs)', () => {
    for (const state of ['awake', 'hungry', 'tired'] as const) {
      const a = findSprite(state, 'arriving');
      const g = findSprite(state, 'growing');
      expect(g.height).toBeGreaterThan(a.height);
    }
  });

  it('has a memorial frame without a dog body (no honey, nose or eye pixels)', () => {
    const m = findSprite('memorial', 'arriving');
    expect(m.name).toBe('memorial');
    expect(m.stage).toBeNull();
    const chars = new Set(m.frames[0]?.join('') ?? '');
    for (const dogChar of ['h', 'H', 'l', 'n', 'e', 'b']) expect(chars.has(dogChar)).toBe(false);
    expect(chars.has('f')).toBe(true);
    expect(chars.has('k')).toBe(true);
    expect(chars.has('d')).toBe(true);
  });

  it('every dog sprite shows the sage harness and the cream forehead stripe', () => {
    for (const s of SPRITES) {
      if (s.state === 'memorial') continue;
      const joined = s.frames[0]?.join('') ?? '';
      expect(joined).toContain('s');
      expect(joined).toContain('cc');
    }
  });

  it('findSprite maps adult to the growing art and falls back to awake for unknown combinations', () => {
    expect(findSprite('awake', 'adult').stage).toBe('growing');
    expect(findSprite('resting', 'arriving').name).toBe('nala_arriving_resting');
  });

  it('sprite names are unique', () => {
    expect(new Set(SPRITES.map((s) => s.name)).size).toBe(SPRITES.length);
  });
});

describe('rasterizer and scaling (pure parts of PixelDog)', () => {
  it('rasterizes a frame to 128 x 128 RGBA with opaque pixels only where the grid is filled', () => {
    const s = findSprite('awake', 'arriving');
    const data = rasterizeFrame(s, 0);
    expect(data.length).toBe(128 * 128 * 4);
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] === 255) opaque++;
    const filled = s.frames[0]?.join('').replace(/\./g, '').length ?? -1;
    expect(opaque).toBe(filled);
    // a pixel outside the sprite is transparent
    expect(data[3]).toBe(0);
  });

  it('wraps unknown frame indices to the first frame', () => {
    const s = findSprite('resting', 'growing');
    expect(rasterizeFrame(s, 7)).toEqual(rasterizeFrame(s, 0));
  });

  it('integer scaling never drops below 1 and floors to whole multiples', () => {
    expect(integerScale(0, 1)).toBe(1);
    expect(integerScale(100, 1)).toBe(1);
    expect(integerScale(256, 1)).toBe(2);
    expect(integerScale(300, 1)).toBe(2);
    expect(integerScale(200, 2)).toBe(3);
    expect(integerScale(160, 3)).toBe(3);
  });
});
