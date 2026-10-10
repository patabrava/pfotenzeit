import { describe, expect, it } from 'vitest';
import { DISTANCE_BANDS, YARD_SPEEDS } from '../../src/simulation/defaults';
import { api, BANDS, CALM, dist, run } from './helpers';

describe('handler movement', () => {
  it('reaches a moveTo target and emits arrived', () => {
    const w0 = api.create(7);
    const target = { x: -2.4, z: 2.2 };
    const r = run(w0, 6, [{ type: 'moveTo', target }]);
    expect(dist(r.world.actors.handler.position, target)).toBeLessThan(0.05);
    expect(r.all.some((e) => e.type === 'arrived' && e.actor === 'handler')).toBe(true);
    expect(r.context.handlerMoving).toBe(false);
  });

  it('walks at the configured speed (yard crossing ≈ 5 s)', () => {
    const w0 = api.create(1);
    const r = run(w0, 1, [{ type: 'moveTo', target: { x: 0, z: -2.5 } }]);
    const moved = dist(r.world.actors.handler.position, w0.actors.handler.position);
    expect(moved).toBeGreaterThan(YARD_SPEEDS.handler * 0.8);
    expect(moved).toBeLessThanOrEqual(YARD_SPEEDS.handler * 1.0 + 1e-6);
  });

  it('holds a moveDir until stop and never leaves the fence', () => {
    const w0 = api.create(2);
    let r = run(w0, 1, [{ type: 'moveDir', dx: 1, dz: 0 }]);
    expect(r.world.actors.handler.position.x).toBeGreaterThan(1.0);
    expect(r.context.handlerMoving).toBe(true);
    r = run(r.world, 10);
    expect(r.world.actors.handler.position.x).toBeLessThanOrEqual(w0.layout.bounds.max.x);
    r = run(r.world, 0.5, [{ type: 'stop' }]);
    expect(r.context.handlerMoving).toBe(false);
    const x = r.world.actors.handler.position.x;
    r = run(r.world, 1);
    expect(r.world.actors.handler.position.x).toBe(x);
  });

  it('splits large dt into sub-steps and advances time exactly', () => {
    const w0 = api.create(3);
    const r = api.step(w0, 0.75, [], CALM);
    expect(r.world.time).toBeCloseTo(0.75, 9);
  });
});

describe('dog following', () => {
  it('follows the handler with a loose leash and settles after the handler stops', () => {
    const w0 = api.create(11);
    let r = run(w0, 1.0, [{ type: 'moveTo', target: { x: -2.0, z: -0.5 } }]);
    expect(r.world.actors.dog.speed).toBeGreaterThan(0);
    r = run(r.world, 4);
    expect(r.context.handlerMoving).toBe(false);
    r = run(r.world, 1.5);
    expect(r.context.dogMoving).toBe(false);
    expect(r.context.dogHandlerDistance).toBeGreaterThan(0.4);
    expect(r.context.dogHandlerDistance).toBeLessThan(1.7);
  });

  it('never pushes through the handler', () => {
    const w0 = api.create(12);
    let r = run(w0, 3, [{ type: 'moveTo', target: { x: 0.5, z: -1.0 } }]);
    r = run(r.world, 3);
    expect(r.context.dogHandlerDistance).toBeGreaterThan(0.4);
  });
});

describe('bands and fallback points', () => {
  it('derives bands from the dog–handler distance', () => {
    const w0 = api.create(4);
    const at = (x: number) => api.step(w0, 0, [{ type: 'teleport', actor: 'dog', position: { x: 0, z: 0 } }, { type: 'teleport', actor: 'handler', position: { x, z: 0 } }], CALM).context;
    expect(at(0.8).handlerBand).toBe('near');
    expect(at(DISTANCE_BANDS.nearMax + 0.3).handlerBand).toBe('mid');
    expect(at(DISTANCE_BANDS.midMax + 0.3).handlerBand).toBe('far');
  });

  it.each(BANDS)('pointForBand(%s) yields that band', (band) => {
    const w0 = api.create(5);
    const p = api.pointForBand(w0, band);
    const r = api.step(w0, 0, [{ type: 'teleport', actor: 'handler', position: p }], CALM);
    expect(r.context.handlerBand).toBe(band);
  });

  it('setBand teleports the handler into the band even when the dog stands by the fence', () => {
    const w0 = api.create(6);
    let r = api.step(w0, 0, [{ type: 'teleport', actor: 'dog', position: { x: 3.0, z: 2.8 } }], CALM);
    r = api.step(r.world, 0, [{ type: 'setBand', band: 'far' }], CALM);
    expect(r.context.handlerBand).toBe('far');
    expect(r.context.handlerMoving).toBe(false);
  });
});

describe('zones and prompts', () => {
  it('offers the prompt when the handler arrives in a zone and stands', () => {
    const w0 = api.create(8);
    const r = run(w0, 6, [{ type: 'moveTo', target: { x: -2.4, z: 2.2 } }]);
    expect(r.context.handlerZone).toBe('quiet_corner');
    expect(r.context.prompt).toBe('quiet_corner');
    expect(r.all.some((e) => e.type === 'promptChanged' && e.prompt === 'quiet_corner')).toBe(true);
    expect(r.all.some((e) => e.type === 'zoneChanged' && e.actor === 'handler' && e.zone === 'quiet_corner')).toBe(true);
  });

  it('shows no prompt while walking through the circle', () => {
    const w0 = api.create(9);
    const r = run(w0, 0.4, [{ type: 'moveTo', target: { x: 0, z: -2.5 } }]);
    expect(r.context.handlerZone).toBe('circle');
    expect(r.context.prompt).toBeNull();
  });
});
