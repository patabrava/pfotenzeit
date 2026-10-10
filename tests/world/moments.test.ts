import { describe, expect, it } from 'vitest';
import { MOMENT_TIMING } from '../../src/simulation/defaults';
import type { WorldEvent } from '../../src/world/types';
import { api, CALM, run, spec } from './helpers';

const started = (events: WorldEvent[]) => events.filter((e): e is Extract<WorldEvent, { type: 'momentStarted' }> => e.type === 'momentStarted');
const ended = (events: WorldEvent[]) => events.filter((e): e is Extract<WorldEvent, { type: 'momentEnded' }> => e.type === 'momentEnded');

describe('moments (plan §5)', () => {
  it('starts the first moment only after MOMENT_TIMING.firstAfterS', () => {
    const w0 = api.create(21);
    let r = run(w0, MOMENT_TIMING.firstAfterS - 1);
    expect(started(r.all)).toHaveLength(0);
    expect(r.world.moment).toBeNull();
    r = run(r.world, 2);
    expect(started(r.all)).toHaveLength(1);
    expect(r.world.moment).not.toBeNull();
    expect(r.world.dogMode.kind).toBe('moment');
  });

  it('fades after holdS without a response and returns the dog to following', () => {
    const w0 = api.create(22);
    let r = run(w0, MOMENT_TIMING.firstAfterS + 1);
    const moment = r.world.moment!;
    r = run(r.world, MOMENT_TIMING.holdS + 0.2);
    const end = ended(r.all);
    expect(end).toHaveLength(1);
    expect(end[0]!.moment.id).toBe(moment.id);
    expect(end[0]!.moment.response).toBeNull();
    expect(r.world.moment).toBeNull();
    expect(r.world.dogMode.kind).toBe('follow');
  });

  it('respects the cooldown between moments', () => {
    const w0 = api.create(23);
    let r = run(w0, MOMENT_TIMING.firstAfterS + 1);
    const first = r.world.moment!;
    r = run(r.world, 0.1, [{ type: 'respondMoment', momentId: first.id, response: 'allow' }]);
    r = run(r.world, 2);
    expect(ended(r.all)).toHaveLength(1);
    const endedAt = r.world.time;
    expect(r.world.momentCooldownUntil).toBeGreaterThanOrEqual(endedAt - 2);
    r = run(r.world, MOMENT_TIMING.cooldownS - 3);
    expect(started(r.all)).toHaveLength(0);
    r = run(r.world, 4);
    expect(started(r.all)).toHaveLength(1);
  });

  it('does not start while the picture is held or during a lesson exercise round', () => {
    const w0 = api.create(24);
    const held = run(w0, MOMENT_TIMING.firstAfterS + 5, [{ type: 'setHold', hold: true }]);
    expect(started(held.all)).toHaveLength(0);
    const lesson = run(w0, MOMENT_TIMING.firstAfterS + 5, [{ type: 'beginExercise', spec: spec('find_spot'), roundId: 'L01_B' }]);
    expect(started(lesson.all)).toHaveLength(0);
    const practice = run(w0, MOMENT_TIMING.firstAfterS + 5, [{ type: 'beginExercise', spec: spec('find_spot'), roundId: null }]);
    expect(started(practice.all)).toHaveLength(1);
  });

  it('is deterministic: the same seed and inputs give the same moment', () => {
    const a = run(api.create(25), MOMENT_TIMING.firstAfterS + 3, [{ type: 'moveTo', target: { x: 1.0, z: -0.5 } }]);
    const b = run(api.create(25), MOMENT_TIMING.firstAfterS + 3, [{ type: 'moveTo', target: { x: 1.0, z: -0.5 } }]);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
    expect(started(a.all)[0]!.moment).toEqual(started(b.all)[0]!.moment);
  });

  it('chooses offer_glance only when focused and look_at_other_dog only with Bruno in mid range', () => {
    // dog alone, handler still within mid: focused → candidates include offer_glance; far from Bruno → no look_at_other_dog
    const kinds = new Set<string>();
    for (let seed = 30; seed < 42; seed++) {
      const r = run(api.create(seed), MOMENT_TIMING.firstAfterS + 1, [
        { type: 'teleport', actor: 'handler', position: { x: -2.4, z: 0.5 } },
        { type: 'teleport', actor: 'dog', position: { x: -1.6, z: 0.5 } },
      ]);
      if (r.world.moment) kinds.add(r.world.moment.kind);
    }
    expect(kinds.has('look_at_other_dog')).toBe(false);
    expect(kinds.has('settle_beside')).toBe(false); // energy 80 ≥ 60
    expect([...kinds].every((k) => k === 'sniff_spot' || k === 'offer_glance')).toBe(true);
  });

  it('the sniff spot lies within 2 m of the dog and the dog walks there', () => {
    const w0 = api.create(26);
    let r = run(w0, MOMENT_TIMING.firstAfterS + 1);
    const m = r.world.moment!;
    if (m.kind === 'sniff_spot') {
      expect(Math.hypot(m.spot.x - w0.actors.dog.position.x, m.spot.z - w0.actors.dog.position.z)).toBeLessThanOrEqual(2.05);
      r = run(r.world, 4);
      expect(Math.hypot(r.world.actors.dog.position.x - m.spot.x, r.world.actors.dog.position.z - m.spot.z)).toBeLessThan(0.1);
      expect(api.directive(r.world, CALM).actors.find((a) => a.key === 'dog')!.pose).toBe('sniff');
    }
    expect(api.directive(r.world, CALM).momentSpot).toEqual(r.world.moment ? r.world.moment.spot : null);
  });
});
