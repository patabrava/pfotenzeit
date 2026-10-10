import { describe, expect, it } from 'vitest';
import { ACTOR_RADIUS, createDefaultLayout } from '../../src/world/layout';
import { clampToWalkable, findPath, isFree, lineOfSight } from '../../src/world/nav';

const layout = createDefaultLayout();

describe('navigation', () => {
  it('routes around an obstacle with line-of-sight segments', () => {
    // the water slab at (1.8, 0.7) r 0.5 sits between these two points
    const from = { x: 1.8, z: -0.6 };
    const to = { x: 1.8, z: 2.0 };
    const path = findPath(layout, from, to);
    expect(path.length).toBeGreaterThanOrEqual(2);
    let anchor = from;
    for (const p of path) {
      expect(isFree(layout, p)).toBe(true);
      expect(lineOfSight(layout, anchor, p)).toBe(true);
      anchor = p;
    }
    expect(path[path.length - 1]).toEqual(to);
  });

  it('returns a single way point when the straight line is free', () => {
    expect(findPath(layout, { x: 0, z: 1.2 }, { x: 0, z: -0.5 })).toEqual([{ x: 0, z: -0.5 }]);
  });

  it('clamps points outside the fence into the walkable rectangle', () => {
    const p = clampToWalkable(layout, { x: -9, z: 9 }); // quiet corner side (no planter)
    expect(p.x).toBeCloseTo(layout.bounds.min.x + ACTOR_RADIUS, 6);
    expect(p.z).toBeCloseTo(layout.bounds.max.z - ACTOR_RADIUS, 6);
    expect(isFree(layout, p)).toBe(true);
  });

  it('moves a target inside an obstacle to a free spot next to it', () => {
    const inside = { x: 1.8, z: 0.7 };
    expect(isFree(layout, inside)).toBe(false);
    const p = clampToWalkable(layout, inside);
    expect(isFree(layout, p)).toBe(true);
    expect(Math.hypot(p.x - inside.x, p.z - inside.z)).toBeLessThan(0.8);
    const path = findPath(layout, { x: 0, z: 0 }, inside);
    expect(isFree(layout, path[path.length - 1]!)).toBe(true);
  });
});
