import { describe, expect, it } from 'vitest';
import { isGrowthAvailable } from '../../src/simulation/selectors';
import type { Save } from '../../src/simulation/types';
import { applied, chooseByRound, completeVisit, newSave, run, startVisit } from './fixtures/helpers';

/** L01, L02 completed helpfully; L03 closed through the care closure option. Three helpful visits, one care closure. */
function readyForGrowth(save: Save = newSave('standard')): Save {
  let current = completeVisit(save, 'L01', 'v1');
  current = completeVisit(current, 'L02', 'v2');
  current = completeVisit(current, 'L03', 'v3');
  return current;
}

describe('growth (02 Ausbau und Wachstum, 15)', () => {
  it('becomes available only with L01+L02+L03, ≥ 3 helpful visits and ≥ 1 care closure', () => {
    const save = readyForGrowth();
    expect(save.completedLessonIds).toEqual(['L01', 'L02', 'L03']);
    expect(save.helpfulVisitIds).toHaveLength(3);
    expect(save.careClosureVisitIds).toEqual(['v3']);
    expect(isGrowthAvailable(save)).toBe(true);
  });

  it('is not available without a care closure even with all lessons and three helpful visits', () => {
    const noClosure = chooseByRound({ L03_C: 'L03_C_2' });
    let save = completeVisit(newSave('standard'), 'L01', 'v1');
    save = completeVisit(save, 'L02', 'v2');
    save = completeVisit(save, 'L03', 'v3', noClosure, 'completed');
    expect(save.completedLessonIds).toEqual(['L01', 'L02', 'L03']);
    expect(save.helpfulVisitIds).toHaveLength(3);
    expect(save.careClosureVisitIds).toEqual([]);
    expect(isGrowthAvailable(save)).toBe(false);
    expect(run(save, { type: 'CONFIRM_GROWTH' })).toMatchObject({ outcome: 'rejected', reason: 'growth_not_available' });
  });

  it('is not available when a lesson is missing, even with enough helpful visits and a care closure', () => {
    let save = completeVisit(newSave('standard'), 'L01', 'v1');
    save = completeVisit(save, 'L01', 'v2');
    save = completeVisit(save, 'L03', 'v3');
    expect(save.helpfulVisitIds).toHaveLength(3);
    expect(save.careClosureVisitIds).toEqual(['v3']);
    expect(isGrowthAvailable(save)).toBe(false);
  });

  it('CONFIRM_GROWTH moves to growing once, keeps learned points, and is rejected the second time', () => {
    const save = readyForGrowth();
    const learnedBefore = [...save.dog.learnedPoints];
    expect(learnedBefore).toHaveLength(3);
    const result = run(save, { type: 'CONFIRM_GROWTH' });
    expect(result.outcome).toBe('applied');
    expect(result.save.dog.growthStage).toBe('growing');
    expect(result.save.growthConfirmed).toBe(true);
    expect(result.save.dog.learnedPoints).toEqual(learnedBefore);
    expect(result.save.school.marks).toBe(save.school.marks);
    expect(result.effects).toContainEqual({ type: 'growth', from: 'arriving', to: 'growing' });
    expect(result.save.pendingPresentation?.effects).toEqual([{ type: 'growth', from: 'arriving', to: 'growing' }]);
    expect(isGrowthAvailable(result.save)).toBe(false);
    expect(run(result.save, { type: 'CONFIRM_GROWTH' })).toMatchObject({ outcome: 'rejected', reason: 'growth_not_available' });
  });

  it('CONFIRM_GROWTH is rejected while a visit is in progress', () => {
    const save = startVisit(readyForGrowth(), 'L01', 'v4');
    expect(run(save, { type: 'CONFIRM_GROWTH' })).toMatchObject({ outcome: 'rejected', reason: 'visit_in_progress' });
    const abandoned = applied(save, { type: 'ABANDON_VISIT' });
    expect(run(abandoned, { type: 'CONFIRM_GROWTH' }).outcome).toBe('applied');
  });

  it('three regular visits yield six marks, enough for both upgrades without grinding', () => {
    const save = readyForGrowth();
    expect(save.school.marks).toBe(6);
    const first = applied(save, { type: 'BUY_UPGRADE', upgradeId: 'rest_place' });
    const second = applied(first, { type: 'BUY_UPGRADE', upgradeId: 'sniff_corner' });
    expect(second.school).toEqual({ marks: 1, upgrades: ['rest_place', 'sniff_corner'] });
  });
});
