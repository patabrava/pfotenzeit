import { describe, expect, it } from 'vitest';
import { EXERCISE_RULES } from '../../src/simulation/defaults';
import type { WorldInput } from '../../src/world/types';
import { api, CALM, run } from './helpers';

const far: WorldInput[] = [
  { type: 'teleport', actor: 'handler', position: { x: -1.0, z: 1.0 } },
  { type: 'teleport', actor: 'dog', position: { x: -0.5, z: 1.2 } },
];

describe('attention (plan §3)', () => {
  it('is relaxed by default', () => {
    const r = api.step(api.create(1), 0, far, CALM);
    expect(r.context.attention).toBe('relaxed');
  });

  it('is tense when the other dog is near', () => {
    const w = api.create(1);
    const bruno = w.actors.other_dog.position;
    const r = api.step(w, 0, [{ type: 'teleport', actor: 'dog', position: { x: bruno.x - 0.8, z: bruno.z } }], CALM);
    expect(r.context.otherDogBand).toBe('near');
    expect(r.context.attention).toBe('tense');
  });

  it('is tense at stress ≥ 50 with the other dog in mid range', () => {
    const w = api.create(1);
    const bruno = w.actors.other_dog.position;
    const inputs: WorldInput[] = [{ type: 'teleport', actor: 'dog', position: { x: bruno.x - 2.0, z: bruno.z } }];
    expect(api.step(w, 0, inputs, CALM).context.attention).toBe('relaxed');
    expect(api.step(w, 0, inputs, { ...CALM, stress: EXERCISE_RULES.stressHesitate }).context.attention).toBe('tense');
  });

  it('is distracted near the toy when the toy distraction is set', () => {
    const w = api.create(1);
    const toy = w.layout.distractionSpots.toy;
    const inputs: WorldInput[] = [{ type: 'teleport', actor: 'dog', position: { x: toy.x + 0.6, z: toy.z } }, { type: 'teleport', actor: 'handler', position: { x: -2.5, z: 2.5 } }];
    expect(api.step(w, 0, inputs, CALM).context.attention).toBe('relaxed');
    expect(api.step(w, 0, [...inputs, { type: 'setDistraction', level: 'toy' }], CALM).context.attention).toBe('distracted');
  });

  it('is tired below the energy threshold', () => {
    const r = api.step(api.create(1), 0, far, { ...CALM, energy: EXERCISE_RULES.energyTired - 1 });
    expect(r.context.attention).toBe('tired');
  });

  it('becomes focused after the handler stood still for 2 s within mid range', () => {
    const w0 = api.create(1);
    let r = run(w0, 1.0, far);
    expect(r.context.attention).toBe('relaxed');
    r = run(r.world, 1.5);
    expect(r.context.attention).toBe('focused');
    expect(r.all.some((e) => e.type === 'attentionChanged' && e.to === 'focused')).toBe(true);
    r = run(r.world, 0.2, [{ type: 'moveTo', target: { x: -2.5, z: 2.0 } }]);
    expect(r.context.attention).toBe('relaxed');
  });

  it('is resting while held in rest_loop', () => {
    const r = api.step(api.create(1), 0, [...far, { type: 'holdDog', pose: 'rest_loop' }], CALM);
    expect(r.context.attention).toBe('resting');
  });
});
