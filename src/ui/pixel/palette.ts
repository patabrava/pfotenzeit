/**
 * Pixel profile palette (06 Pixelprofil: 12–16 colours, hard edges). One character per entry;
 * sprites in ./sprites.ts reference these characters. '.' is transparent and not part of the palette.
 * Colours follow the Nala reference sheet (honey body, cream chest and forehead stripe, sage harness)
 * and the 06 UI palette (Salbei #AFC6AE, Kreide #F4F0E8, Tinte #243631, Aprikose #E4A67B).
 * No imports: this file is also loaded by scripts/export-pixel.mjs under Node.
 */

export const TRANSPARENT = '.' as const;

export interface PaletteEntry {
  name: string;
  hex: string;
}

export const PALETTE = {
  o: { name: 'outline', hex: '#4A3524' },
  h: { name: 'honey', hex: '#C9955A' },
  H: { name: 'honeyShade', hex: '#A8743C' },
  l: { name: 'honeyLight', hex: '#DDB078' },
  c: { name: 'cream', hex: '#F3E6C9' },
  C: { name: 'creamShade', hex: '#D9C39B' },
  s: { name: 'sage', hex: '#8FA98A' },
  S: { name: 'sageShade', hex: '#6E8A6C' },
  n: { name: 'nose', hex: '#3B2A22' },
  e: { name: 'eye', hex: '#2E1A12' },
  b: { name: 'blush', hex: '#E4A67B' },
  d: { name: 'blanket', hex: '#E7CDAA' },
  k: { name: 'ink', hex: '#243631' },
  f: { name: 'frameSage', hex: '#AFC6AE' },
  F: { name: 'chalk', hex: '#F4F0E8' },
} as const satisfies Record<string, PaletteEntry>;

export type PaletteChar = keyof typeof PALETTE;

export const PALETTE_CHARS: readonly string[] = Object.keys(PALETTE);

export function isPaletteChar(ch: string): ch is PaletteChar {
  return Object.prototype.hasOwnProperty.call(PALETTE, ch);
}

/** Parse '#RRGGBB' into [r, g, b]. */
export function hexToRgb(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}
