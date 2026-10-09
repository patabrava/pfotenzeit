import { describe, expect, it } from 'vitest';
import { TRANSACTION_HISTORY_LIMIT } from '../../src/simulation/defaults';
import { reduce } from '../../src/simulation/reducer';
import { testContent } from './fixtures/content';
import { applied, deepFreeze, HOUR, makeAction, newSave, playToReflect, run, startVisit, T0 } from './fixtures/helpers';

describe('idempotent transactions (15 Transaktionen)', () => {
  it('replaying CARE returns duplicate with the identical save and no effects', () => {
    const save = newSave('standard');
    const action = makeAction({ type: 'CARE', kind: 'meal' });
    const first = reduce(save, action, testContent);
    expect(first.outcome).toBe('applied');
    const replay = reduce(first.save, action, testContent);
    expect(replay.outcome).toBe('duplicate');
    expect(replay.save).toBe(first.save);
    expect(replay.effects).toEqual([]);
  });

  it('replaying BUY_UPGRADE charges exactly once', () => {
    const save = { ...newSave('standard'), school: { marks: 5, upgrades: [] } };
    const action = makeAction({ type: 'BUY_UPGRADE', upgradeId: 'rest_place' });
    const first = reduce(save, action, testContent);
    expect(first.save.school).toEqual({ marks: 3, upgrades: ['rest_place'] });
    const replay = reduce(first.save, action, testContent);
    expect(replay.outcome).toBe('duplicate');
    expect(replay.save.school).toEqual({ marks: 3, upgrades: ['rest_place'] });
  });

  it('replaying COMPLETE_VISIT after a reload grants nothing twice', () => {
    const reflect = playToReflect(startVisit(newSave('standard'), 'L01', 'v1'));
    const action = makeAction({ type: 'COMPLETE_VISIT', closure: 'completed' });
    const first = reduce(reflect, action, testContent);
    expect(first.outcome).toBe('applied');
    expect(first.save.school.marks).toBe(2);
    const replay = reduce(first.save, action, testContent);
    expect(replay.outcome).toBe('duplicate');
    expect(replay.save).toBe(first.save);
    expect(replay.save.school.marks).toBe(2);
    expect(replay.save.rewardedVisitIds).toEqual(['v1']);
  });

  it('replaying SELECT_OPTION records one decision and one queue change', () => {
    const decide = applied(applied(startVisit(newSave('standard'), 'L01', 'v1'), { type: 'NEXT_ROUND' }), { type: 'NEXT_ROUND' });
    const action = makeAction({ type: 'SELECT_OPTION', optionId: 'L01_A_2' });
    const first = reduce(decide, action, testContent);
    expect(first.outcome).toBe('applied');
    expect(first.save.currentVisit?.queue).toHaveLength(4);
    const replay = reduce(first.save, action, testContent);
    expect(replay.outcome).toBe('duplicate');
    expect(replay.save).toBe(first.save);
    expect(replay.save.currentVisit?.decisions).toHaveLength(1);
  });

  it('a purchase with 0 marks is an explained no-op', () => {
    const save = newSave('standard');
    const result = run(save, { type: 'BUY_UPGRADE', upgradeId: 'sniff_corner' });
    expect(result).toMatchObject({ outcome: 'rejected', reason: 'insufficient_marks' });
    expect(result.save).toBe(save);
    expect(result.effects).toEqual([]);
  });

  it('buying an owned upgrade with a new transaction is rejected as already_owned', () => {
    const save = { ...newSave('standard'), school: { marks: 10, upgrades: [] } };
    const owned = applied(save, { type: 'BUY_UPGRADE', upgradeId: 'rest_place' });
    const again = run(owned, { type: 'BUY_UPGRADE', upgradeId: 'rest_place' });
    expect(again).toMatchObject({ outcome: 'rejected', reason: 'already_owned' });
    expect(again.save.school.marks).toBe(8);
  });

  it('a rejected action leaves the save untouched and records no transaction', () => {
    const save = newSave('standard');
    const result = run(save, { type: 'NEXT_ROUND' });
    expect(result).toMatchObject({ outcome: 'rejected', reason: 'no_visit' });
    expect(result.save).toBe(save);
    expect(result.save.appliedTransactionIds).toEqual([]);
  });

  it('rejects actions without a transaction id or with a non-finite time', () => {
    const save = newSave('standard');
    expect(run(save, { type: 'CARE', kind: 'meal', transactionId: '' })).toMatchObject({ outcome: 'rejected', reason: 'invalid' });
    expect(run(save, { type: 'CARE', kind: 'meal', nowUTC: Number.NaN })).toMatchObject({ outcome: 'rejected', reason: 'invalid' });
  });

  it('bounds the transaction history and forgets the oldest ids first', () => {
    let save = newSave('standard');
    for (let i = 0; i < TRANSACTION_HISTORY_LIMIT + 10; i += 1) {
      save = applied(save, { type: 'CLOSE_APP', transactionId: `close_${i}` });
    }
    expect(save.appliedTransactionIds).toHaveLength(TRANSACTION_HISTORY_LIMIT);
    expect(save.appliedTransactionIds[0]).toBe('close_10');
    expect(run(save, { type: 'CLOSE_APP', transactionId: 'close_5' }).outcome).toBe('applied');
    expect(run(save, { type: 'CLOSE_APP', transactionId: 'close_200' }).outcome).toBe('duplicate');
  });

  it('never mutates the input save', () => {
    const frozen = deepFreeze(newSave('challenge'));
    let save = applied(frozen, { type: 'CARE', kind: 'rest' });
    save = deepFreeze(startVisit(save, 'L03', 'v1'));
    save = deepFreeze(playToReflect(save));
    save = applied(save, { type: 'COMPLETE_VISIT', closure: 'careClosure' });
    save = applied(deepFreeze(save), { type: 'APPLY_OFFLINE', nowUTC: T0 + 3 * HOUR });
    expect(frozen.dog.energy).toBe(80);
    expect(frozen.currentVisit).toBeNull();
    expect(frozen.appliedTransactionIds).toEqual([]);
    // visit mark + learning mark (L03 A and B are two distinct helpful scenarios)
    expect(save.school.marks).toBe(2);
  });

  it('every applied action re-anchors lastSeenUTC to the action time', () => {
    const save = newSave('standard');
    const fed = applied(save, { type: 'CARE', kind: 'meal', nowUTC: T0 + 1_000 });
    expect(fed.lastSeenUTC).toBe(T0 + 1_000);
    const renamed = applied(fed, { type: 'RENAME_DOG', name: 'Kira', nowUTC: T0 + 2_000 });
    expect(renamed.lastSeenUTC).toBe(T0 + 2_000);
  });
});
