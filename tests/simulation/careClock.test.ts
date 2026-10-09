import { describe, expect, it } from 'vitest';
import { offlineAfter } from '../../src/simulation/careClock';
import { getVitalityBand } from '../../src/simulation/selectors';
import { applied, DAY, HOUR, MINUTE, newSave, run, startVisit, T0, withDog } from './fixtures/helpers';

describe('offline accounting (04 Zeitmodell, 15 Offlineformel)', () => {
  it('standard: 30 days away leave needs and status unchanged, only the anchor moves', () => {
    const save = newSave('standard');
    const next = applied(save, { type: 'APPLY_OFFLINE', nowUTC: T0 + 30 * DAY });
    expect(next.dog).toEqual(save.dog);
    expect(next.lastSeenUTC).toBe(T0 + 30 * DAY);
  });

  it('challenge: 30 days away credit at most 8 hours (satiety −16, comfort −8), energy and vitality unchanged', () => {
    const save = newSave('challenge');
    const result = run(save, { type: 'APPLY_OFFLINE', nowUTC: T0 + 30 * DAY });
    expect(result.outcome).toBe('applied');
    expect(result.save.dog.satiety).toBe(64);
    expect(result.save.dog.comfort).toBe(72);
    expect(result.save.dog.energy).toBe(80);
    expect(result.save.dog.vitality).toBe(100);
    expect(result.save.dog.status).toBe('alive');
    expect(result.effects).toContainEqual({
      type: 'offlineApplied',
      creditedHours: 8,
      losses: { satiety: 16, comfort: 8 },
    });
  });

  it('challenge: a value above 25 is never reduced below 25 offline', () => {
    const save = withDog(newSave('challenge'), { satiety: 30 });
    const next = applied(save, { type: 'APPLY_OFFLINE', nowUTC: T0 + 30 * DAY });
    expect(next.dog.satiety).toBe(25);
  });

  it('challenge: before=10 stays 10, offline time never heals', () => {
    const save = withDog(newSave('challenge'), { satiety: 10, comfort: 12 });
    const next = applied(save, { type: 'APPLY_OFFLINE', nowUTC: T0 + 30 * DAY });
    expect(next.dog.satiety).toBe(10);
    expect(next.dog.comfort).toBe(12);
    expect(offlineAfter(10, 16)).toBe(10);
    expect(offlineAfter(26, 16)).toBe(25);
    expect(offlineAfter(80, 1.5)).toBe(78.5);
  });

  it('offline loss is fractional: 90 minutes away cost satiety 3 and comfort 1.5', () => {
    const save = newSave('challenge');
    const next = applied(save, { type: 'APPLY_OFFLINE', nowUTC: T0 + 1.5 * HOUR });
    expect(next.dog.satiety).toBe(77);
    expect(next.dog.comfort).toBe(78.5);
  });

  it('clock running backwards: no loss and no bonus', () => {
    const save = withDog(newSave('challenge'), { satiety: 50 });
    const next = applied(save, { type: 'APPLY_OFFLINE', nowUTC: T0 - 2 * DAY });
    expect(next.dog).toEqual(save.dog);
  });

  it('two return events within a minute apply the loss exactly once (D-007)', () => {
    const save = newSave('challenge');
    const first = applied(save, { type: 'APPLY_OFFLINE', nowUTC: T0 + 5 * HOUR });
    const second = applied(first, { type: 'APPLY_OFFLINE', nowUTC: T0 + 5 * HOUR + 30_000 });
    expect(first.dog.satiety).toBe(70);
    expect(second.dog).toEqual(first.dog);
    expect(second.lastSeenUTC).toBe(T0 + 5 * HOUR + 30_000);
  });

  it('offline time alone never kills: vitality 1 with empty needs survives 30 days', () => {
    const save = withDog(newSave('challenge'), { satiety: 0, energy: 0, vitality: 1 });
    const next = applied(save, { type: 'APPLY_OFFLINE', nowUTC: T0 + 30 * DAY });
    expect(next.dog.status).toBe('alive');
    expect(next.dog.vitality).toBe(1);
  });

  it('paused challenge: neither offline nor active decline; resume re-anchors without loss', () => {
    const paused = applied(newSave('challenge'), { type: 'PAUSE_CHALLENGE' });
    const offline = applied(paused, { type: 'APPLY_OFFLINE', nowUTC: T0 + 30 * DAY });
    expect(offline.dog).toEqual(paused.dog);
    const ticked = applied(offline, { type: 'TICK_ACTIVE', activeMs: 10 * MINUTE, nowUTC: T0 + 30 * DAY });
    expect(ticked.dog).toEqual(paused.dog);
    const resumed = applied(ticked, { type: 'RESUME_CHALLENGE', nowUTC: T0 + 31 * DAY });
    expect(resumed.challengePaused).toBe(false);
    expect(resumed.dog).toEqual(paused.dog);
    expect(resumed.lastSeenUTC).toBe(T0 + 31 * DAY);
  });

  it('CLOSE_APP only re-anchors the time', () => {
    const save = newSave('challenge');
    const next = applied(save, { type: 'CLOSE_APP', nowUTC: T0 + HOUR });
    expect(next.dog).toEqual(save.dog);
    expect(next.lastSeenUTC).toBe(T0 + HOUR);
  });
});

describe('active minutes (15 Tickreihenfolge)', () => {
  it('a 0 ms tick changes nothing; the reducer never ticks unless told', () => {
    const save = newSave('challenge');
    const result = run(save, { type: 'TICK_ACTIVE', activeMs: 0 });
    expect(result.outcome).toBe('applied');
    expect(result.save.dog).toEqual(save.dog);
    expect(result.save.careActiveMsRemainder).toBe(0);
    expect(result.effects).toEqual([]);
  });

  it('only full minutes are evaluated; the remainder accumulates across ticks', () => {
    const save = newSave('challenge');
    const partial = applied(save, { type: 'TICK_ACTIVE', activeMs: 59_000 });
    expect(partial.dog).toEqual(save.dog);
    expect(partial.careActiveMsRemainder).toBe(59_000);
    const full = applied(partial, { type: 'TICK_ACTIVE', activeMs: 1_500 });
    expect(full.dog.satiety).toBe(78);
    expect(full.careActiveMsRemainder).toBe(500);
  });

  it('challenge minute: satiety −2, energy −1, comfort −1 and vitality +2 while both needs are ≥ 35', () => {
    const next = applied(withDog(newSave('challenge'), { vitality: 90 }), { type: 'TICK_ACTIVE', activeMs: MINUTE });
    expect(next.dog).toMatchObject({ satiety: 78, energy: 79, comfort: 79, vitality: 92 });
  });

  it('no regeneration when one need is below 35 but above 0', () => {
    const next = applied(withDog(newSave('challenge'), { satiety: 34, vitality: 50 }), { type: 'TICK_ACTIVE', activeMs: MINUTE });
    expect(next.dog.vitality).toBe(50);
  });

  it('satiety 0 and vitality 100: 19 active minutes leave vitality 5, alive and critical', () => {
    const save = withDog(newSave('challenge'), { satiety: 0 });
    const result = run(save, { type: 'TICK_ACTIVE', activeMs: 19 * MINUTE });
    expect(result.save.dog.vitality).toBe(5);
    expect(result.save.dog.status).toBe('alive');
    expect(getVitalityBand(result.save.dog, 'challenge')).toBe('critical');
    expect(result.effects).toContainEqual({ type: 'band', band: 'critical' });
    expect(result.effects.some((effect) => effect.type === 'lost')).toBe(false);
  });

  it('one more unattended minute: lost, with lostAtUTC and a pending loss presentation', () => {
    const save = withDog(newSave('challenge'), { satiety: 0, vitality: 5 });
    const result = run(save, { type: 'TICK_ACTIVE', activeMs: MINUTE, nowUTC: T0 + MINUTE });
    expect(result.save.dog.status).toBe('lost');
    expect(result.save.dog.vitality).toBe(0);
    expect(result.save.lostAtUTC).toBe(T0 + MINUTE);
    expect(result.effects).toContainEqual({ type: 'lost' });
    expect(result.save.pendingPresentation?.effects).toContainEqual({ type: 'lost' });
  });

  it('the same neglect in standard never touches vitality or status', () => {
    const save = withDog(newSave('standard'), { satiety: 0 });
    const next = applied(save, { type: 'TICK_ACTIVE', activeMs: 60 * MINUTE });
    expect(next.dog.vitality).toBe(100);
    expect(next.dog.status).toBe('alive');
    expect(getVitalityBand(next.dog, 'standard')).toBe('stable');
  });

  it('both needs at 0 still cost 5 per minute, not 10', () => {
    const save = withDog(newSave('challenge'), { satiety: 0, energy: 0 });
    const next = applied(save, { type: 'TICK_ACTIVE', activeMs: MINUTE });
    expect(next.dog.vitality).toBe(95);
  });

  it('a free meal in the critical band raises satiety and stops the loss', () => {
    const save = withDog(newSave('challenge'), { satiety: 0, vitality: 10 });
    const fed = applied(save, { type: 'CARE', kind: 'meal' });
    expect(fed.dog.satiety).toBe(35);
    expect(fed.school.marks).toBe(save.school.marks);
    const later = applied(fed, { type: 'TICK_ACTIVE', activeMs: 3 * MINUTE });
    expect(later.dog.vitality).toBeGreaterThanOrEqual(10);
    expect(later.dog.status).toBe('alive');
  });

  it('regeneration resumes at +2 per minute once both needs are ≥ 35', () => {
    // Decline runs before the vitality check (15 Tickreihenfolge): 37 → 35 still regenerates, 35 → 33 does not.
    const save = withDog(newSave('challenge'), { satiety: 37, energy: 37, vitality: 40 });
    const next = applied(save, { type: 'TICK_ACTIVE', activeMs: MINUTE });
    expect(next.dog.vitality).toBe(42);
    expect(next.dog.satiety).toBe(35);
    const after = applied(next, { type: 'TICK_ACTIVE', activeMs: MINUTE });
    expect(after.dog.vitality).toBe(42);
  });

  it('standard floors satiety, energy and comfort at 25 during active decline', () => {
    const save = withDog(newSave('standard'), { satiety: 26, energy: 25, comfort: 40 });
    const next = applied(save, { type: 'TICK_ACTIVE', activeMs: 30 * MINUTE });
    expect(next.dog).toMatchObject({ satiety: 25, energy: 25, comfort: 25, vitality: 100 });
  });

  it('emits a band effect when the band changes and none otherwise', () => {
    const save = withDog(newSave('challenge'), { satiety: 0, vitality: 62 });
    const crossing = run(save, { type: 'TICK_ACTIVE', activeMs: MINUTE });
    expect(crossing.effects).toEqual([{ type: 'band', band: 'impaired' }]);
    const steady = run(crossing.save, { type: 'TICK_ACTIVE', activeMs: MINUTE });
    expect(steady.effects).toEqual([]);
  });

  it('defers the loss while a reaction is being shown and resolves it when the phase leaves react (D-009)', () => {
    const inVisit = startVisit(newSave('challenge'), 'L01', 'v1');
    const observe = applied(inVisit, { type: 'NEXT_ROUND' });
    const decide = applied(observe, { type: 'NEXT_ROUND' });
    // Neglect sets in while the reaction is on screen: satiety empty, vitality on its last 5 points.
    const reacting = withDog(applied(decide, { type: 'SELECT_OPTION', optionId: 'L01_A_1' }), { satiety: 0, vitality: 5 });
    expect(reacting.currentVisit?.phase).toBe('react');
    const ticked = applied(reacting, { type: 'TICK_ACTIVE', activeMs: MINUTE });
    expect(ticked.dog.vitality).toBe(0);
    expect(ticked.dog.status).toBe('alive');
    const pending = ticked.pendingPresentation;
    const result = run(ticked, { type: 'ACKNOWLEDGE_EFFECT', presentedTransactionId: pending?.transactionId ?? '' , nowUTC: T0 + 5 * MINUTE });
    expect(result.outcome).toBe('applied');
    expect(result.save.dog.status).toBe('lost');
    expect(result.save.lostAtUTC).toBe(T0 + 5 * MINUTE);
    expect(result.effects).toContainEqual({ type: 'lost' });
    expect(result.save.currentVisit?.phase).toBe('feedback');
  });

  it('rejects a negative tick as invalid', () => {
    const result = run(newSave('challenge'), { type: 'TICK_ACTIVE', activeMs: -1 });
    expect(result).toMatchObject({ outcome: 'rejected', reason: 'invalid' });
  });
});
