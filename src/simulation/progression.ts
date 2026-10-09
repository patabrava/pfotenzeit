/**
 * Rewards, bond, learning criterion, upgrades, growth (02, 15, D-004). Pure.
 */
import type { ContentCatalog } from '../content/types';
import { LEARNING_POINT_IDS, MARK_PER_LEARNING_POINT, MARK_PER_VISIT, UPGRADE_COSTS } from './defaults';
import { isGrowthAvailable, isLearned } from './selectors';
import { fail, ok, type StepResult } from './transactions';
import type { BondMemory, DomainEffect, LearningPointId, Save, UpgradeId, VisitClosure, VisitState } from './types';

export function marksAvailable(save: Save): number {
  return save.school.marks;
}

export function helpfulDecisionCount(visit: VisitState): number {
  return visit.decisions.filter((decision) => decision.helpful).length;
}

export function bondMemoryId(visitId: string): string {
  return `memory_${visitId}`;
}

function pushUnique<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? [...list] : [...list, item];
}

/**
 * Closes the current visit with rewards granted at most once per visitId:
 * visit mark, lesson completion, bond memory (≥1 helpful decision), care closure, learning marks.
 * Context returns to baseline by dropping the visit. Caller validated phase and closure.
 */
export function rewardVisit(save: Save, closure: VisitClosure, nowUTC: number, content: ContentCatalog): StepResult {
  const visit = save.currentVisit;
  if (!visit) return fail('no_visit');
  const lesson = content.lessons[visit.lessonId];

  let marks = save.school.marks;
  const visitMark = !save.rewardedVisitIds.includes(visit.id);
  if (visitMark) marks += MARK_PER_VISIT;

  const helpful = helpfulDecisionCount(visit);
  const bond = helpful >= 1 && !save.helpfulVisitIds.includes(visit.id);
  let memories = save.memories;
  let helpfulVisitIds = save.helpfulVisitIds;
  let bondMemories = save.dog.bondMemories;
  if (bond) {
    const memory: BondMemory = {
      id: bondMemoryId(visit.id),
      visitId: visit.id,
      lessonId: visit.lessonId,
      dateUTC: nowUTC,
      closure,
      helpfulDecisions: helpful,
    };
    // Bond grows by BOND_PER_HELPFUL_VISIT (= one entry) per visit id, never more.
    helpfulVisitIds = pushUnique(helpfulVisitIds, visit.id);
    if (!memories.some((entry) => entry.id === memory.id)) memories = [...memories, memory];
    bondMemories = pushUnique(bondMemories, memory.id);
  }

  const careClosureVisitIds =
    closure === 'careClosure' ? pushUnique(save.careClosureVisitIds, visit.id) : save.careClosureVisitIds;

  const newlyLearned: LearningPointId[] = [];
  let rewardedLearningIds = save.rewardedLearningIds;
  let learnedPoints = save.dog.learnedPoints;
  const firstHelpfulByLearningPoint = { ...save.firstHelpfulByLearningPoint };
  for (const point of LEARNING_POINT_IDS) {
    if (!isLearned(save, point) || rewardedLearningIds.includes(point)) continue;
    newlyLearned.push(point);
    rewardedLearningIds = [...rewardedLearningIds, point];
    learnedPoints = pushUnique(learnedPoints, point);
    firstHelpfulByLearningPoint[point] = visit.id;
  }
  const learningMarks = newlyLearned.length * MARK_PER_LEARNING_POINT;
  marks += learningMarks;

  const effect: DomainEffect = {
    type: 'visitRewarded',
    visitId: visit.id,
    lessonId: lesson.id,
    closure,
    visitMark,
    bond,
    newlyLearned,
    learningMarks,
  };

  return ok(
    {
      ...save,
      dog: { ...save.dog, bondMemories, learnedPoints },
      school: { ...save.school, marks },
      currentVisit: null,
      rewardedVisitIds: visitMark ? [...save.rewardedVisitIds, visit.id] : save.rewardedVisitIds,
      rewardedLearningIds,
      completedLessonIds: pushUnique(save.completedLessonIds, lesson.id),
      helpfulVisitIds,
      careClosureVisitIds,
      firstHelpfulByLearningPoint,
      memories,
    },
    [effect],
  );
}

export function buyUpgrade(save: Save, upgradeId: UpgradeId): StepResult {
  if (!Object.prototype.hasOwnProperty.call(UPGRADE_COSTS, upgradeId)) return fail('unknown_upgrade');
  if (save.school.upgrades.includes(upgradeId)) return fail('already_owned');
  const cost = UPGRADE_COSTS[upgradeId];
  if (save.school.marks < cost) return fail('insufficient_marks');
  return ok(
    {
      ...save,
      school: { marks: save.school.marks - cost, upgrades: [...save.school.upgrades, upgradeId] },
    },
    [{ type: 'upgradeBought', upgradeId, cost }],
  );
}

/** Growth from arriving to growing; learned points and everything else untouched. */
export function confirmGrowth(save: Save): StepResult {
  if (save.currentVisit) return fail('visit_in_progress');
  if (!isGrowthAvailable(save)) return fail('growth_not_available');
  return ok(
    { ...save, dog: { ...save.dog, growthStage: 'growing' }, growthConfirmed: true },
    [{ type: 'growth', from: save.dog.growthStage, to: 'growing' }],
  );
}
