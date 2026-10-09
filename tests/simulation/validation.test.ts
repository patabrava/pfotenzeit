import { describe, expect, it } from 'vitest';
import { createNewMeta, validateMeta, validateSave } from '../../src/simulation/save';
import type { Save } from '../../src/simulation/types';
import { applied, newSave, playToReflect, startVisit } from './fixtures/helpers';

function clone(save: Save): Record<string, unknown> {
  return JSON.parse(JSON.stringify(save)) as Record<string, unknown>;
}

describe('validateSave (15 Import streng validieren)', () => {
  it('round-trips a fresh save unchanged', () => {
    const save = newSave('standard');
    const result = validateSave(clone(save));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.value).toEqual(save);
  });

  it('round-trips a mid-visit save in react with a pending presentation', () => {
    const decide = applied(applied(startVisit(newSave('challenge'), 'L01', 'v1'), { type: 'NEXT_ROUND' }), { type: 'NEXT_ROUND' });
    const react = applied(decide, { type: 'SELECT_OPTION', optionId: 'L01_A_2' });
    const result = validateSave(clone(react));
    expect(result.ok).toBe(true);
    expect(result.value).toEqual(react);
    expect(result.value?.currentVisit?.queue).toHaveLength(4);
  });

  it('round-trips a save with memories, learned points and a care closure', () => {
    const reflect = playToReflect(startVisit(newSave('standard'), 'L03', 'v1'));
    const done = applied(reflect, { type: 'COMPLETE_VISIT', closure: 'careClosure' });
    const result = validateSave(clone(done));
    expect(result.ok).toBe(true);
    expect(result.value).toEqual(done);
  });

  it('rejects satiety 500 with an error naming the field', () => {
    const tampered = clone(newSave('standard'));
    (tampered.dog as Record<string, unknown>).satiety = 500;
    const result = validateSave(tampered);
    expect(result.ok).toBe(false);
    expect(result.value).toBeNull();
    expect(result.errors.some((error) => error.includes('save.dog.satiety'))).toBe(true);
  });

  it('rejects an unknown mode', () => {
    const tampered = { ...clone(newSave('standard')), mode: 'hardcore' };
    const result = validateSave(tampered);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('save.mode'))).toBe(true);
  });

  it('rejects a missing dog', () => {
    const tampered = clone(newSave('standard'));
    delete tampered.dog;
    const result = validateSave(tampered);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('save.dog'))).toBe(true);
  });

  it('rejects a wrong schema version, bad enums inside arrays and malformed records', () => {
    expect(validateSave({ ...clone(newSave('standard')), schemaVersion: 2 }).ok).toBe(false);
    expect(validateSave({ ...clone(newSave('standard')), completedLessonIds: ['L01', 'L99'] }).ok).toBe(false);
    expect(validateSave({ ...clone(newSave('standard')), helpfulScenariosByLearningPoint: { criterion_context: [] } }).ok).toBe(false);
    expect(validateSave({ ...clone(newSave('standard')), settings: { ...newSave('standard').settings, qualityTier: 'ultra' } }).ok).toBe(false);
    expect(validateSave({ ...clone(newSave('standard')), dog: { ...newSave('standard').dog, status: 'lost' } }).ok).toBe(false);
  });

  it('strips unknown extra keys', () => {
    const extra = { ...clone(newSave('standard')), hacked: true, dog: { ...newSave('standard').dog, superpower: 1 } };
    const result = validateSave(extra);
    expect(result.ok).toBe(true);
    expect(result.value).not.toHaveProperty('hacked');
    expect(result.value?.dog).not.toHaveProperty('superpower');
    expect(result.value).toEqual(newSave('standard'));
  });

  it('never throws on garbage input', () => {
    for (const input of [null, undefined, 42, 'save', [], {}, { schemaVersion: 1 }, { schemaVersion: 1, dog: 'nope', currentVisit: 'x' }]) {
      const result = validateSave(input);
      expect(result.ok).toBe(false);
      expect(result.value).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

describe('validateMeta', () => {
  it('round-trips a valid meta record', () => {
    const meta = createNewMeta('save_standard_0001');
    const result = validateMeta(JSON.parse(JSON.stringify(meta)));
    expect(result.ok).toBe(true);
    expect(result.value).toEqual(meta);
  });

  it('rejects bad modes, empty ids and malformed archives', () => {
    const meta = createNewMeta('save_standard_0001');
    expect(validateMeta({ ...meta, activeMode: 'x' }).ok).toBe(false);
    expect(validateMeta({ ...meta, saveIds: { standard: '', challenge: null } }).ok).toBe(false);
    expect(validateMeta({ ...meta, archives: [{ saveId: 'a' }] }).ok).toBe(false);
    expect(validateMeta(null).ok).toBe(false);
    expect(validateMeta({ ...meta, schemaVersion: 0 }).ok).toBe(false);
  });
});
