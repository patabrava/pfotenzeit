/**
 * Yard layout (docs/WORLD_PLAN.md §2). Mirrors the courtyard GLB stage positions
 * (scripts/lib/environment.mjs STAGE): camera on +Z, origin at the yard centre, metres.
 *
 * Zones are places the handler can act in; obstacles are what nobody walks through (shelter posts,
 * tree, planters, water slab, potted plant). The rest deck itself is walkable (the dog rests on it).
 */
import type { YardLayout, YardPoint, Zone, ZoneId } from './types';

export const YARD_BOUNDS = { min: { x: -3.2, z: -3.0 }, max: { x: 3.2, z: 3.0 } } as const;

/** Radius an actor keeps from obstacle edges and the fence when navigating. */
export const ACTOR_RADIUS = 0.22;

const ZONES: Zone[] = [
  { id: 'mira', center: { x: -1.0, z: -1.4 }, radius: 1.1 },
  { id: 'bowl', center: { x: 0.6, z: -1.5 }, radius: 0.9 },
  // deck centre of the environment GLB (footprint x −3.3…−1.75, z −2.25…−0.8); the stage rest spot (−2.7, −0.95) lies inside
  { id: 'rest_deck', center: { x: -2.5, z: -1.5 }, radius: 1.1 },
  // stage sniff spot: clear of the planter boxes and visible from the yard camera
  { id: 'sniff_corner', center: { x: 2.1, z: -1.2 }, radius: 1.1, requiresUpgrade: 'sniff_corner' },
  { id: 'circle', center: { x: 0, z: 0.1 }, radius: 2.1 },
  { id: 'quiet_corner', center: { x: -2.4, z: 2.2 }, radius: 1.0 },
  { id: 'alex_bruno', center: { x: 2.4, z: 1.6 }, radius: 1.2 },
  { id: 'gate', center: { x: 0, z: 2.9 }, radius: 0.8 },
  { id: 'shelter', center: { x: -0.4, z: -2.4 }, radius: 1.0 },
];

/** Zones whose arrival offers a prompt (§4). `shelter` is a walkway, `gate` has no action. */
export const PROMPT_ZONES: ReadonlySet<ZoneId> = new Set<ZoneId>(['mira', 'bowl', 'rest_deck', 'sniff_corner', 'quiet_corner', 'alex_bruno', 'circle']);

export function createDefaultLayout(): YardLayout {
  return {
    bounds: { min: { ...YARD_BOUNDS.min }, max: { ...YARD_BOUNDS.max } },
    zones: ZONES.map((z) => ({ ...z, center: { ...z.center } })),
    obstacles: [
      // shelter front posts (STAGE.shelter x0 −1.5 / x1 0.75, z1 −1.8)
      { center: { x: -1.42, z: -1.88 }, radius: 0.14 },
      { center: { x: 0.67, z: -1.88 }, radius: 0.14 },
      // bench inside the shelter back wall is outside the walkable bounds; the tree stands at the back-left
      { center: { x: -2.75, z: -3.0 }, radius: 0.3 },
      // planter boxes of the sniff corner (renderer footprints: 1.2 × 0.5 box at (2.6, −1.9), box at (3.1, −1.0))
      { center: { x: 2.3, z: -1.9 }, radius: 0.3 },
      { center: { x: 2.9, z: -1.9 }, radius: 0.3 },
      { center: { x: 3.1, z: -1.0 }, radius: 0.3 },
      // raised water slab (the water prop stands on it)
      { center: { x: 1.8, z: 0.7 }, radius: 0.5 },
      // potted plant at the front
      { center: { x: 0.45, z: 3.05 }, radius: 0.25 },
    ],
    spawn: {
      handler: { x: 0, z: 1.2 },
      dog: { x: 0.5, z: 1.4 },
      mira: { x: -1.0, z: -1.3 },
      alex: { x: 2.4, z: 1.4 },
      other_dog: { x: 2.0, z: 1.9 },
    },
    distractionSpots: { toy: { x: 0.8, z: 0.4 }, otherDog: { x: 2.0, z: 1.9 } },
    gridStep: 0.25,
  };
}

export function distance(a: YardPoint, b: YardPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Smallest zone containing the point (most specific first), or null. */
export function zoneAt(layout: YardLayout, p: YardPoint): ZoneId | null {
  let best: Zone | null = null;
  for (const zone of layout.zones) {
    if (distance(zone.center, p) > zone.radius) continue;
    if (!best || zone.radius < best.radius) best = zone;
  }
  return best ? best.id : null;
}

export function zoneById(layout: YardLayout, id: ZoneId): Zone | null {
  return layout.zones.find((z) => z.id === id) ?? null;
}
