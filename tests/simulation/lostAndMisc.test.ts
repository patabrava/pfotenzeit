import { describe, expect, it } from 'vitest';
import { DOG_NAME_MAX_LENGTH } from '../../src/simulation/defaults';
import { getPixelState, getVitalityBand } from '../../src/simulation/selectors';
import type { Save } from '../../src/simulation/types';
import { applied, DAY, MINUTE, newSave, run, withDog } from './fixtures/helpers';

function lostChallenge(): Save {
  const save = withDog(newSave('challenge'), { satiety: 0, vitality: 5 });
  return applied(save, { type: 'TICK_ACTIVE', activeMs: MINUTE });
}

describe('lost challenge dog (04 Abschied, 15)', () => {
  it('rejects care and training with dog_lost and ignores ticks', () => {
    const lost = lostChallenge();
    expect(lost.dog.status).toBe('lost');
    expect(run(lost, { type: 'CARE', kind: 'meal' })).toMatchObject({ outcome: 'rejected', reason: 'dog_lost' });
    expect(run(lost, { type: 'START_VISIT', lessonId: 'L01', visitId: 'v1', seed: 1 })).toMatchObject({ outcome: 'rejected', reason: 'dog_lost' });
    const ticked = run(lost, { type: 'TICK_ACTIVE', activeMs: 10 * MINUTE });
    expect(ticked.outcome).toBe('applied');
    expect(ticked.save.dog).toEqual(lost.dog);
    expect(ticked.effects).toEqual([]);
    const offline = applied(lost, { type: 'APPLY_OFFLINE', nowUTC: lost.lastSeenUTC + DAY });
    expect(offline.dog).toEqual(lost.dog);
  });

  it('reports band lost and the memorial pixel state', () => {
    const lost = lostChallenge();
    expect(getVitalityBand(lost.dog, 'challenge')).toBe('lost');
    expect(getPixelState(lost)).toBe('memorial');
  });

  it('a challenge loss leaves the standard save untouched', () => {
    const standard = newSave('standard');
    const challenge = withDog(newSave('challenge', { saveId: 'save_challenge_x' }), { instanceId: 'dog_challenge_x', satiety: 0, vitality: 5 });
    const lost = applied(challenge, { type: 'TICK_ACTIVE', activeMs: MINUTE });
    expect(lost.dog.status).toBe('lost');
    expect(standard.dog.status).toBe('alive');
    expect(standard.dog.vitality).toBe(100);
    expect(standard.saveId).not.toBe(lost.saveId);
    expect(standard.dog.instanceId).not.toBe(lost.dog.instanceId);
  });
});

describe('care actions (04 Werte und Aktionen, D-003)', () => {
  it('meal is free, unlimited and caps satiety at 100 with a before/after effect and the eat pose', () => {
    const save = withDog(newSave('standard'), { satiety: 90 });
    const result = run(save, { type: 'CARE', kind: 'meal' });
    expect(result.outcome).toBe('applied');
    expect(result.save.dog.satiety).toBe(100);
    expect(result.save.school.marks).toBe(0);
    expect(result.effects).toEqual([
      { type: 'care', kind: 'meal', before: pickNeeds(save.dog), after: pickNeeds(result.save.dog), pose: 'eat' },
    ]);
    expect(result.effects[0]).toMatchObject({ before: { satiety: 90 }, after: { satiety: 100 } });
    expect(result.save.pendingPresentation).toEqual({ transactionId: result.save.appliedTransactionIds[0], effects: result.effects });
    const again = applied(result.save, { type: 'CARE', kind: 'meal' });
    expect(again.dog.satiety).toBe(100);
  });

  it('rest, play and calm apply the shared constants with their poses', () => {
    const save = withDog(newSave('standard'), { energy: 50, stress: 50, comfort: 50 });
    const rested = run(save, { type: 'CARE', kind: 'rest' });
    expect(rested.save.dog).toMatchObject({ energy: 80, stress: 30 });
    expect(rested.effects[0]).toMatchObject({ type: 'care', pose: 'rest_loop' });
    const played = run(save, { type: 'CARE', kind: 'play' });
    expect(played.save.dog).toMatchObject({ comfort: 70 });
    expect(played.effects[0]).toMatchObject({ type: 'care', pose: 'play_bow' });
    const calmed = run(save, { type: 'CARE', kind: 'calm' });
    expect(calmed.save.dog).toMatchObject({ stress: 30, comfort: 60 });
    expect(calmed.effects[0]).toMatchObject({ type: 'care', pose: 'recover' });
  });

  it('care never changes vitality directly', () => {
    const save = withDog(newSave('challenge'), { vitality: 40 });
    for (const kind of ['meal', 'rest', 'play', 'calm'] as const) {
      expect(applied(save, { type: 'CARE', kind }).dog.vitality).toBe(40);
    }
  });

  it('a stale acknowledgement is harmless once nothing is pending', () => {
    const save = newSave('standard');
    const result = run(save, { type: 'ACKNOWLEDGE_EFFECT', presentedTransactionId: 'whatever' });
    expect(result.outcome).toBe('applied');
    expect(result.save.pendingPresentation).toBeNull();
    expect(result.save.dog).toEqual(save.dog);
  });
});

describe('rename and settings', () => {
  it('RENAME_DOG trims and bounds the name', () => {
    const save = newSave('standard');
    expect(applied(save, { type: 'RENAME_DOG', name: '  Kira ' }).dog.name).toBe('Kira');
    expect(run(save, { type: 'RENAME_DOG', name: '   ' })).toMatchObject({ outcome: 'rejected', reason: 'invalid_name' });
    expect(run(save, { type: 'RENAME_DOG', name: 'x'.repeat(DOG_NAME_MAX_LENGTH + 1) })).toMatchObject({ outcome: 'rejected', reason: 'invalid_name' });
    expect(applied(save, { type: 'RENAME_DOG', name: 'x'.repeat(DOG_NAME_MAX_LENGTH) }).dog.name).toHaveLength(DOG_NAME_MAX_LENGTH);
  });

  it('UPDATE_SETTINGS validates enums and ignores unknown keys', () => {
    const save = newSave('standard');
    const next = applied(save, { type: 'UPDATE_SETTINGS', patch: { audioEnabled: true, qualityTier: 'low', bogus: 1 } as never });
    expect(next.settings).toEqual({ ...save.settings, audioEnabled: true, qualityTier: 'low' });
    expect(next.settings).not.toHaveProperty('bogus');
    expect(run(save, { type: 'UPDATE_SETTINGS', patch: { qualityTier: 'ultra' } as never })).toMatchObject({ outcome: 'rejected', reason: 'invalid' });
    expect(run(save, { type: 'UPDATE_SETTINGS', patch: { reducedMotionOverride: 'on' } }).save.settings.reducedMotionOverride).toBe('on');
    expect(run(save, { type: 'UPDATE_SETTINGS', patch: { audioEnabled: 'yes' } as never })).toMatchObject({ outcome: 'rejected', reason: 'invalid' });
  });
});

function pickNeeds(dog: Save['dog']): Record<string, number> {
  return {
    satiety: dog.satiety,
    energy: dog.energy,
    comfort: dog.comfort,
    arousal: dog.arousal,
    stress: dog.stress,
    vitality: dog.vitality,
  };
}
