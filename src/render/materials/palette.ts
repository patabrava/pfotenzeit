/**
 * Palette (06_ART_DIRECTION) and material factory for the procedural tier.
 *
 * Colour space: every hex here is an sRGB colour. `Color.set(hex)` converts to linear working
 * space (three r152+ defaults, ColorManagement enabled), so no manual conversion happens here.
 */
import { Color, DoubleSide, MeshStandardMaterial, type Material } from 'three';

export const PALETTE = {
  chalk: '#F4F0E8',
  ink: '#243631',
  sage: '#AFC6AE',
  forest: '#326B58',
  apricot: '#E4A67B',
  gold: '#D1AE62',
  /** Scene fill colours derived from the palette (not in 06, tuned for the yard). */
  ground: '#D8C9A3',
  groundTraining: '#CDBE96',
  gravel: '#C9BFA9',
  wood: '#C7A77C',
  woodDark: '#A98858',
  plantGreen: '#7FA07A',
  plantDark: '#5E8460',
  planter: '#B08B68',
  terracotta: '#C07B59',
  ceramic: '#E9E2D4',
  water: '#9FC2CF',
  blanket: '#C9B5CF',
  fence: '#D9CDB0',
  stone: '#B9B3A6',
  shadow: '#3A3A30',
} as const;

/** sRGB background clear colour; never white, so there is no white flash before the first frame. */
export const BACKGROUND_HEX = PALETTE.chalk;

const cache = new Map<string, MeshStandardMaterial>();

export interface MaterialOptions {
  roughness?: number;
  metalness?: number;
  vertexColors?: boolean;
  transparent?: boolean;
  opacity?: number;
  doubleSide?: boolean;
  flatShading?: boolean;
}

/**
 * Shared, cached MeshStandardMaterial (roughness 0.8 by default: matte fabric, fur blocks, wood).
 * Materials are shared across meshes; dispose through disposeSharedMaterials() only on renderer disposal.
 */
export function standardMaterial(hex: string, options: MaterialOptions = {}): MeshStandardMaterial {
  const key = JSON.stringify([hex, options]);
  const found = cache.get(key);
  if (found) return found;
  const material = new MeshStandardMaterial({
    color: new Color(hex),
    roughness: options.roughness ?? 0.8,
    metalness: options.metalness ?? 0,
    vertexColors: options.vertexColors ?? false,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    flatShading: options.flatShading ?? false,
  });
  if (options.doubleSide) material.side = DoubleSide;
  material.name = `mat_${hex.replace('#', '')}`;
  cache.set(key, material);
  return material;
}

/** Single vertex-coloured material shared by all procedural merged meshes (one draw call per actor). */
export function vertexColorMaterial(): MeshStandardMaterial {
  return standardMaterial('#FFFFFF', { vertexColors: true, roughness: 0.8 });
}

export function disposeSharedMaterials(): void {
  for (const material of cache.values()) material.dispose();
  cache.clear();
}

export function isMaterialArray(material: Material | Material[]): material is Material[] {
  return Array.isArray(material);
}

export function toLinearRgb(hex: string): [number, number, number] {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
}
