/**
 * Lesson state machine (02, 03, 15): visit creation, option selection, round advance, supported retries,
 * inserted unsupported variant (D-005), care closure acceptance (D-006).
 * Pure; receives content as data. No DOM, no Three, no Date.now.
 */
import type { ContentCatalog, LessonDefinition, LessonOption, LessonRound } from '../content/types';
import { applyCareKind, clamp100, declineWithFloor, modeFloor } from './careClock';
import { CONTEXT_BASELINE, ROUND_ENERGY_COST } from './defaults';
import { getReadiness, isCareClosureOffered, isLearned } from './selectors';
import { fail, ok, type StepResult } from './transactions';
import type {
  DomainEffect,
  LessonContext,
  LessonId,
  Save,
  VisitClosure,
  VisitDecision,
  VisitState,
} from './types';

export type LessonResult = StepResult;

export function findRound(lesson: LessonDefinition, roundId: string): LessonRound | null {
  return lesson.rounds.find((round) => round.id === roundId) ?? null;
}

export function findOption(round: LessonRound, optionId: string): LessonOption | null {
  return round.options.find((option) => option.id === optionId) ?? null;
}

/** Merges a partial staging patch; explicit `undefined` entries are ignored. */
export function mergeContext(base: LessonContext, patch: Partial<LessonContext>): LessonContext {
  const next: LessonContext = { ...base };
  if (patch.arousal !== undefined) next.arousal = clamp100(patch.arousal);
  if (patch.stress !== undefined) next.stress = clamp100(patch.stress);
  if (patch.energyShown !== undefined) next.energyShown = patch.energyShown === null ? null : clamp100(patch.energyShown);
  if (patch.difficulty !== undefined) next.difficulty = patch.difficulty;
  return next;
}

/** Context on entering a round: energyShown resets to the real value unless the round stages it. */
export function contextOnEnter(current: LessonContext, round: LessonRound): LessonContext {
  return mergeContext({ ...current, energyShown: null }, round.contextBefore);
}

export function createVisit(
  lessonId: LessonId,
  visitId: string,
  seed: number,
  nowUTC: number,
  content: ContentCatalog,
): VisitState {
  const lesson = content.lessons[lessonId];
  const first = lesson.rounds[0];
  return {
    id: visitId,
    lessonId,
    seed,
    startedUTC: nowUTC,
    queue: lesson.rounds.map((round) => ({ roundId: round.id, supported: false, inserted: false })),
    index: 0,
    phase: 'prepare',
    decisions: [],
    completedRoundIds: [],
    context: first ? contextOnEnter(CONTEXT_BASELINE, first) : { ...CONTEXT_BASELINE },
    lastOptionId: null,
    insertedRetryUsed: false,
  };
}

/** Enters the round at `visit.index`: phase observe, contextBefore applied, option display cleared. */
function enterRound(save: Save, visit: VisitState, lesson: LessonDefinition): StepResult {
  const ref = visit.queue[visit.index];
  const round = ref ? findRound(lesson, ref.roundId) : null;
  if (!ref || !round) return fail('invalid');
  const next: VisitState = {
    ...visit,
    phase: 'observe',
    context: contextOnEnter(visit.context, round),
    lastOptionId: null,
  };
  return ok({ ...save, currentVisit: next });
}

/** NEXT_ROUND: prepare → observe, observe → decide, feedback → next round / inserted variant / reflect. */
export function advanceRound(save: Save, content: ContentCatalog): StepResult {
  const visit = save.currentVisit;
  if (!visit) return fail('no_visit');
  const lesson = content.lessons[visit.lessonId];
  switch (visit.phase) {
    case 'prepare':
      return enterRound(save, visit, lesson);
    case 'observe':
      return ok({ ...save, currentVisit: { ...visit, phase: 'decide' } });
    case 'feedback':
      return completeRound(save, visit, lesson);
    default:
      return fail('wrong_phase');
  }
}

/** Leaving feedback: charge the round once (unsupported only), then advance or close the queue. */
function completeRound(save: Save, visit: VisitState, lesson: LessonDefinition): StepResult {
  const ref = visit.queue[visit.index];
  if (!ref) return fail('invalid');

  let dog = save.dog;
  let completedRoundIds = visit.completedRoundIds;
  if (!ref.supported && !completedRoundIds.includes(ref.roundId)) {
    completedRoundIds = [...completedRoundIds, ref.roundId];
    dog = { ...dog, energy: clamp100(declineWithFloor(dog.energy, ROUND_ENERGY_COST, modeFloor(save.mode))) };
  }

  const nextIndex = visit.index + 1;
  let next: VisitState = { ...visit, completedRoundIds, index: nextIndex };
  const withDog: Save = { ...save, dog };

  if (nextIndex < next.queue.length) {
    return enterRound(withDog, next, lesson);
  }

  const firstSupported = next.queue.find((item) => item.supported);
  if (firstSupported && !next.insertedRetryUsed && !isLearned(save, lesson.learningPointId)) {
    next = {
      ...next,
      queue: [...next.queue, { roundId: firstSupported.roundId, supported: false, inserted: true }],
      insertedRetryUsed: true,
    };
    return enterRound(withDog, next, lesson);
  }

  return ok({ ...withDog, currentVisit: { ...next, phase: 'reflect' } });
}

/** SELECT_OPTION: records the decision, stages context, applies a real care effect, queues a supported retry. */
export function selectOption(save: Save, optionId: string, content: ContentCatalog): StepResult {
  const visit = save.currentVisit;
  if (!visit) return fail('no_visit');
  if (visit.phase !== 'decide') return fail('wrong_phase');
  const ref = visit.queue[visit.index];
  const lesson = content.lessons[visit.lessonId];
  const round = ref ? findRound(lesson, ref.roundId) : null;
  if (!ref || !round) return fail('invalid');
  const option = findOption(round, optionId);
  if (!option) return fail('unknown_option');

  const countsForLearning = option.helpful && option.countsForLearning && !ref.supported;
  const decision: VisitDecision = {
    roundId: round.id,
    scenarioId: round.scenarioId,
    optionId: option.id,
    helpful: option.helpful,
    supported: ref.supported,
    countsForLearning,
  };

  let queue = visit.queue;
  if (option.next === 'supportedRetry' && !ref.supported) {
    queue = [
      ...queue.slice(0, visit.index + 1),
      { roundId: round.id, supported: true, inserted: false },
      ...queue.slice(visit.index + 1),
    ];
  }

  let scenarios = save.helpfulScenariosByLearningPoint;
  if (countsForLearning) {
    const point = lesson.learningPointId;
    const list = scenarios[point];
    if (!list.includes(round.scenarioId)) {
      scenarios = { ...scenarios, [point]: [...list, round.scenarioId] };
    }
  }

  const dog = option.careEffect ? applyCareKind(save.dog, option.careEffect) : save.dog;
  const nextVisit: VisitState = {
    ...visit,
    queue,
    phase: option.next === 'careClosure' ? 'reflect' : 'react',
    decisions: [...visit.decisions, decision],
    context: option.contextAfter ? mergeContext(visit.context, option.contextAfter) : visit.context,
    lastOptionId: option.id,
  };
  const effect: DomainEffect = {
    type: 'decision',
    roundId: round.id,
    optionId: option.id,
    helpful: option.helpful,
    supported: ref.supported,
    poseAfter: option.poseAfter,
    dogId: round.dogId,
  };
  return ok({ ...save, dog, currentVisit: nextVisit, helpfulScenariosByLearningPoint: scenarios }, [effect]);
}

/** True when all planned (and inserted) rounds were played through. */
export function isQueueExhausted(visit: VisitState): boolean {
  return visit.index >= visit.queue.length;
}

/**
 * Whether COMPLETE_VISIT with the given closure is acceptable now (D-006).
 * completed: only in reflect after the queue is exhausted.
 * careClosure: in reflect always; in observe/decide/feedback when the real dog needs care or at least one
 * round has a decision. prepare and react never accept a closure.
 */
export function closureAcceptance(save: Save, closure: VisitClosure, content: ContentCatalog): StepResult | null {
  const visit = save.currentVisit;
  if (!visit) return fail('no_visit');
  if (visit.phase === 'reflect') {
    if (closure === 'careClosure') return null;
    return isQueueExhausted(visit) ? null : fail('not_meaningful');
  }
  if (visit.phase === 'observe' || visit.phase === 'decide' || visit.phase === 'feedback') {
    if (closure !== 'careClosure') return fail('wrong_phase');
    const needsCare = getReadiness(save).readiness === 'needs_care';
    const roundDone = visit.decisions.length >= 1 || isCareClosureOffered(save, content);
    return needsCare || roundDone ? null : fail('not_meaningful');
  }
  return fail('wrong_phase');
}
