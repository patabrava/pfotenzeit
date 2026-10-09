import { describe, expect, it } from 'vitest';
import { getReadiness, isTrainingLocked } from '../../src/simulation/selectors';
import { applied, newSave, playToReflect, run, startVisit, withDog } from './fixtures/helpers';

describe('readiness (02) and training lock (04)', () => {
  it.each([
    ['satiety', { satiety: 30 }, 'meal'],
    ['energy', { energy: 34 }, 'rest'],
    ['stress', { stress: 61 }, 'calm'],
    ['arousal', { arousal: 71 }, 'calm'],
    ['comfort', { comfort: 20 }, 'play'],
  ] as const)('real low/high %s blocks START_VISIT with needs_care and suggests a care action', (_name, patch, suggestion) => {
    const save = withDog(newSave('standard'), patch);
    expect(getReadiness(save)).toEqual({ readiness: 'needs_care', suggestion });
    const result = run(save, { type: 'START_VISIT', lessonId: 'L01', visitId: 'v1', seed: 1 });
    expect(result).toMatchObject({ outcome: 'rejected', reason: 'needs_care' });
    expect(result.save).toBe(save);
  });

  it('care restores readiness and the visit can start', () => {
    const hungry = withDog(newSave('standard'), { satiety: 30 });
    const fed = applied(hungry, { type: 'CARE', kind: 'meal' });
    expect(getReadiness(fed).readiness).toBe('ready');
    expect(run(fed, { type: 'START_VISIT', lessonId: 'L01', visitId: 'v1', seed: 1 }).outcome).toBe('applied');
  });

  it('scenario stress inside a lesson neither blocks the rounds nor alters the real dog', () => {
    const reflect = playToReflect(startVisit(newSave('standard'), 'L03', 'v1'));
    expect(reflect.dog.stress).toBe(0);
    expect(reflect.dog.arousal).toBe(20);
    expect(reflect.currentVisit?.decisions).toHaveLength(3);
    const readyAgain = applied(reflect, { type: 'COMPLETE_VISIT', closure: 'careClosure' });
    expect(getReadiness(readyAgain).readiness).toBe('ready');
  });

  it('challenge critical band locks training but leaves care and pause available', () => {
    const save = withDog(newSave('challenge'), { vitality: 20 });
    expect(isTrainingLocked(save)).toBe(true);
    expect(run(save, { type: 'START_VISIT', lessonId: 'L01', visitId: 'v1', seed: 1 })).toMatchObject({ outcome: 'rejected', reason: 'training_locked' });
    expect(run(save, { type: 'CARE', kind: 'rest' }).outcome).toBe('applied');
    expect(run(save, { type: 'PAUSE_CHALLENGE' }).outcome).toBe('applied');
  });

  it('challenge impaired band does not lock training', () => {
    const save = withDog(newSave('challenge'), { vitality: 45 });
    expect(isTrainingLocked(save)).toBe(false);
    expect(run(save, { type: 'START_VISIT', lessonId: 'L01', visitId: 'v1', seed: 1 }).outcome).toBe('applied');
  });

  it('standard is never locked, whatever the vitality value says', () => {
    const save = withDog(newSave('standard'), { vitality: 5 });
    expect(isTrainingLocked(save)).toBe(false);
  });

  it('a paused challenge rejects new visits until resumed; standard cannot pause', () => {
    const paused = applied(newSave('challenge'), { type: 'PAUSE_CHALLENGE' });
    expect(run(paused, { type: 'START_VISIT', lessonId: 'L01', visitId: 'v1', seed: 1 })).toMatchObject({ outcome: 'rejected', reason: 'challenge_paused' });
    const resumed = applied(paused, { type: 'RESUME_CHALLENGE' });
    expect(run(resumed, { type: 'START_VISIT', lessonId: 'L01', visitId: 'v1', seed: 1 }).outcome).toBe('applied');
    expect(run(newSave('standard'), { type: 'PAUSE_CHALLENGE' })).toMatchObject({ outcome: 'rejected', reason: 'challenge_only' });
    expect(run(newSave('standard'), { type: 'RESUME_CHALLENGE' })).toMatchObject({ outcome: 'rejected', reason: 'challenge_only' });
  });
});
