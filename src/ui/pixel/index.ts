/**
 * Pixel profile: data-authored sprites (D-011) and a canvas drawer. Code-authored pixel art, not final art.
 */
export { PALETTE, PALETTE_CHARS, TRANSPARENT, hexToRgb, isPaletteChar } from './palette';
export type { PaletteChar, PaletteEntry } from './palette';
export { PIXEL_CANVAS, PIXEL_SPRITE_MAX, SPRITES, SPRITE_NAMES, findSprite } from './sprites';
export type { PixelSprite } from './sprites';
export { createPixelDog, integerScale, rasterizeFrame } from './PixelDog';
export type { PixelDogHandle } from './PixelDog';
