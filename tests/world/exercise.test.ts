import { describe, expect, it } from 'vitest';
import { LOOK_AT_STILL_S } from '../../src/simulation/defaults';
import type { ExerciseResponse } from '../../src/simulation/types';
import { api, CALM, dist, run, spec } from './helpers';

const RESPONSES: ExerciseResponse[] = ['comes', 'hesitates', 'distracted', 'turns_away', 'settled', 'still_tense', 'glance'];

describe('exercise readiness (plan §6 step 1)', () => {
  it('recall is ready only at ≥ minDistanceM', () => {
    const w0 = api.create(31);
    let r = api.step(w0, 0, [{ type: 'beginExercise', spec: spec('recall', 'none', 2.0), roundId: 'L02_C' }], CALM);
    expect(r.world.dogMode.kind).toBe('free');
    expect(r.context.exerciseReady).toBe(false);
    r = api.step(r.world, 0, [{ type: 'teleport', actor: 'handler', position: { x: r.world.actors.dog.position.x - 2.2, z: r.world.actors.dog.position.z } }], CALM);
    expect(r.context.exerciseReady).toBe(true);
    expect(r.events.some((e) => e.type === 'exerciseReadyChanged' && e.ready)).toBe(true);
  });

  it('recall with the toy sends the dog to the toy and keeps it there', () => {
    const w0 = api.create(32);
    const r = run(w0, 4, [{ type: 'beginExercise', spec: spec('recall', 'toy', 2.0), roundId: 'L02_C' }]);
    expect(dist(r.world.actors.dog.position, w0.layout.distractionSpots.toy)).toBeLessThan(0.8);
    expect(r.context.distraction).toBe('toy');
    expect(api.exerciseContext(r.world, CALM).distractionBand).toBe('near');
  });

  it('find_spot is ready while the handler stands still, not while walking', () => {
    const w0 = api.create(33);
    let r = run(w0, 0.3, [{ type: 'beginExercise', spec: spec('find_spot', 'other_dog'), roundId: 'L01_B' }, { type: 'moveTo', target: { x: -2.4, z: 2.2 } }]);
    expect(r.context.exerciseReady).toBe(false);
    r = run(r.world, 6);
    expect(r.context.handlerMoving).toBe(false);
    expect(r.context.exerciseReady).toBe(true);
  });

  it('look_at offers the glance after LOOK_AT_STILL_S of calm standing and withdraws it when the handler moves', () => {
    const w0 = api.create(34);
    let r = run(w0, LOOK_AT_STILL_S - 0.5, [
      { type: 'beginExercise', spec: spec('look_at'), roundId: 'L02_A' },
      { type: 'teleport', actor: 'handler', position: { x: -1.0, z: 1.0 } },
      { type: 'teleport', actor: 'dog', position: { x: -0.4, z: 1.2 } },
    ]);
    expect(r.all.some((e) => e.type === 'glanceOffered')).toBe(false);
    r = run(r.world, 1);
    expect(r.all.some((e) => e.type === 'glanceOffered')).toBe(true);
    expect(r.context.exerciseReady).toBe(true);
    expect(api.directive(r.world, CALM).actors.find((a) => a.key === 'dog')!.pose).toBe('look_at_handler');
    r = run(r.world, 0.3, [{ type: 'moveTo', target: { x: -2.5, z: 2.0 } }]);
    expect(r.context.exerciseReady).toBe(false);
  });

  it('exerciseContext mirrors the recorded shape', () => {
    const w0 = api.create(35);
    const ctx = api.exerciseContext(w0, CALM);
    expect(Object.keys(ctx).sort()).toEqual(['distraction', 'distractionBand', 'dogZone', 'handlerBand', 'handlerMoving', 'otherDogBand'].sort());
    expect(ctx.distraction).toBe('none');
    expect(ctx.distractionBand).toBe('far');
  });
});

describe('showResponse (plan §6 step 3)', () => {
  it.each(RESPONSES)('%s emits responseShown within 3 s and freezes the dog in its pose', (response) => {
    const w0 = api.create(40);
    const start = api.step(w0, 0, [
      { type: 'beginExercise', spec: spec('recall', 'toy', 2.0), roundId: 'L02_C' },
      { type: 'teleport', actor: 'handler', position: { x: -1.5, z: 1.5 } },
      { type: 'teleport', actor: 'dog', position: { x: 1.0, z: 0.5 } },
    ], CALM);
    let r = run(start.world, 3.0, [{ type: 'showResponse', response }]);
    const shown = r.all.filter((e) => e.type === 'responseShown');
    expect(shown).toHaveLength(1);
    expect(shown[0]).toEqual({ type: 'responseShown', response });
    expect(r.world.exercise?.responding).toBe(response);
    expect(r.world.exercise?.attempts).toBe(1);
    expect(r.context.exerciseReady).toBe(false);
    const pose = api.directive(r.world, CALM).actors.find((a) => a.key === 'dog')!.pose;
    expect(pose).not.toBe('walk');
    const before = { ...r.world.actors.dog.position };
    r = run(r.world, 2);
    expect(dist(r.world.actors.dog.position, before)).toBeLessThan(1e-6);
  });

  it('comes ends sitting close to the handler', () => {
    const w0 = api.create(41);
    const start = api.step(w0, 0, [
      { type: 'beginExercise', spec: spec('recall', 'none', 2.0), roundId: 'L02_C' },
      { type: 'teleport', actor: 'handler', position: { x: -2.0, z: 1.5 } },
      { type: 'teleport', actor: 'dog', position: { x: 1.0, z: 0.5 } },
    ], CALM);
    const r = run(start.world, 3, [{ type: 'showResponse', response: 'comes' }]);
    expect(r.context.dogHandlerDistance).toBeLessThan(1.2);
    expect(r.world.dogMode).toEqual({ kind: 'held', pose: 'sit' });
    expect(api.directive(r.world, CALM).actors.find((a) => a.key === 'dog')!.pose).toBe('sit');
  });

  it('holdDog null releases the dog for a retry; endExercise clears the distraction', () => {
    const w0 = api.create(42);
    const shown = run(w0, 3, [{ type: 'beginExercise', spec: spec('find_spot', 'other_dog'), roundId: 'L01_B' }, { type: 'showResponse', response: 'still_tense' }]);
    expect(shown.world.exercise?.responding).toBe('still_tense');
    const released = api.step(shown.world, 0, [{ type: 'holdDog', pose: null }], CALM);
    expect(released.world.exercise?.responding).toBeNull();
    expect(released.world.exercise?.attempts).toBe(1);
    expect(released.world.dogMode.kind).toBe('follow');
    const ended = api.step(released.world, 0, [{ type: 'endExercise' }], CALM);
    expect(ended.world.exercise).toBeNull();
    expect(ended.context.distraction).toBe('none');
  });
});

describe('directive', () => {
  it('lists the five actors with the handler as a marker and the focus on the handler', () => {
    const w0 = api.create(50);
    const d = api.directive(w0, CALM);
    expect(d.actors.map((a) => a.key).sort()).toEqual(['alex', 'dog', 'handler', 'mira', 'other_dog']);
    expect(d.actors.find((a) => a.key === 'handler')!.characterId).toBe('handler');
    expect(d.actors.find((a) => a.key === 'dog')!.characterId).toBe('dog_nala');
    expect(d.focus).toEqual(w0.actors.handler.position);
    expect(d.attention).toBe('relaxed');
    // the handler spawns standing inside the training circle, which offers its prompt
    expect(d.prompt?.zoneId).toBe('circle');
  });

  it('shows walk while moving and the attention pose while standing', () => {
    const w0 = api.create(51);
    let r = run(w0, 0.5, [{ type: 'moveTo', target: { x: 0, z: -2.5 } }]);
    const dog = () => api.directive(r.world, CALM).actors.find((a) => a.key === 'dog')!;
    expect(dog().pose).toBe('walk');
    expect(dog().speed).toBeGreaterThan(0);
    r = run(r.world, 6);
    expect(['idle_relaxed', 'look_at_handler']).toContain(dog().pose);
  });
});
