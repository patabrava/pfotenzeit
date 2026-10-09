/**
 * Domain reducer: de-duplicates by transactionId, validates, computes the effect once, returns a new save.
 * Pure. No DOM, no Three, no Date.now (nowUTC comes with the action).
 * Contract: types.ts (DomainAction, ReduceResult) and docs/workpackages/WP-A-simulation.md.
 *
 * Order per action: (1) shape check of transactionId/nowUTC, (2) duplicate check (so a replay of an action whose
 * preconditions have since vanished still answers `duplicate`), (3) semantic validation and effect, (4) deferred
 * loss resolution (D-009), (5) re-anchor lastSeenUTC, (6) pending presentation, (7) transaction record.
 */
import type { ContentCatalog } from '../content/types';
import { applyActiveTime, applyCareKind, applyOffline, CARE_POSES, pickNeeds, resolveLoss } from './careClock';
import { CARE_EFFECTS, DOG_NAME_MAX_LENGTH } from './defaults';
import { advanceRound, closureAcceptance, createVisit, selectOption } from './lessons';
import { buyUpgrade, confirmGrowth, rewardVisit } from './progression';
import { getReadiness, isTrainingLocked } from './selectors';
import {
  fail,
  hasApplied,
  isPresentableEffect,
  isValidTransactionId,
  ok,
  recordTransaction,
  type StepResult,
} from './transactions';
import type { DomainAction, DomainEffect, ReduceResult, Save, Settings } from './types';

export function reduce(save: Save, action: DomainAction, content: ContentCatalog): ReduceResult {
  if (!isValidTransactionId(action.transactionId) || !Number.isFinite(action.nowUTC)) {
    return { save, outcome: 'rejected', reason: 'invalid', effects: [] };
  }
  if (hasApplied(save, action.transactionId)) {
    return { save, outcome: 'duplicate', effects: [] };
  }

  const step = apply(save, action, content);
  if (!step.ok) {
    return { save, outcome: 'rejected', reason: step.reason, effects: [] };
  }

  const resolved = resolveLoss(step.save, action.nowUTC);
  const effects: DomainEffect[] = [...step.effects, ...resolved.effects];
  let next: Save = { ...resolved.save, lastSeenUTC: action.nowUTC };

  const presentable = effects.filter(isPresentableEffect);
  if (presentable.length > 0) {
    next = { ...next, pendingPresentation: { transactionId: action.transactionId, effects: presentable } };
  }
  next = recordTransaction(next, action.transactionId);
  return { save: next, outcome: 'applied', effects };
}

function apply(save: Save, action: DomainAction, content: ContentCatalog): StepResult {
  switch (action.type) {
    case 'START_VISIT': {
      if (save.dog.status === 'lost') return fail('dog_lost');
      if (save.currentVisit) return fail('visit_in_progress');
      if (!Object.prototype.hasOwnProperty.call(content.lessons, action.lessonId)) return fail('unknown_lesson');
      if (typeof action.visitId !== 'string' || action.visitId.length === 0) return fail('invalid');
      if (!Number.isFinite(action.seed)) return fail('invalid');
      if (save.challengePaused) return fail('challenge_paused');
      if (isTrainingLocked(save)) return fail('training_locked');
      if (getReadiness(save).readiness === 'needs_care') return fail('needs_care');
      const visit = createVisit(action.lessonId, action.visitId, action.seed, action.nowUTC, content);
      return ok({ ...save, currentVisit: visit, visitCount: save.visitCount + 1 });
    }

    case 'NEXT_ROUND': {
      if (!save.currentVisit) return fail('no_visit');
      if (save.dog.status === 'lost') return fail('dog_lost');
      return advanceRound(save, content);
    }

    case 'SELECT_OPTION': {
      if (!save.currentVisit) return fail('no_visit');
      if (save.dog.status === 'lost') return fail('dog_lost');
      return selectOption(save, action.optionId, content);
    }

    case 'COMPLETE_VISIT': {
      if (!save.currentVisit) return fail('no_visit');
      if (save.dog.status === 'lost') return fail('dog_lost');
      if (action.closure !== 'completed' && action.closure !== 'careClosure') return fail('invalid');
      const rejection = closureAcceptance(save, action.closure, content);
      if (rejection) return rejection;
      return rewardVisit(save, action.closure, action.nowUTC, content);
    }

    case 'ABANDON_VISIT': {
      if (!save.currentVisit) return fail('no_visit');
      const pending = save.pendingPresentation;
      const dropPending = pending !== null && pending.effects.some((effect) => effect.type === 'decision');
      return ok({ ...save, currentVisit: null, pendingPresentation: dropPending ? null : pending });
    }

    case 'CARE': {
      if (save.dog.status === 'lost') return fail('dog_lost');
      if (!Object.prototype.hasOwnProperty.call(CARE_EFFECTS, action.kind)) return fail('invalid');
      if (save.currentVisit?.phase === 'react') return fail('wrong_phase');
      const before = pickNeeds(save.dog);
      const dog = applyCareKind(save.dog, action.kind);
      return ok({ ...save, dog }, [
        { type: 'care', kind: action.kind, before, after: pickNeeds(dog), pose: CARE_POSES[action.kind] },
      ]);
    }

    case 'BUY_UPGRADE':
      return buyUpgrade(save, action.upgradeId);

    case 'CONFIRM_GROWTH':
      return confirmGrowth(save);

    case 'RENAME_DOG': {
      if (typeof action.name !== 'string') return fail('invalid_name');
      const name = action.name.trim();
      if (name.length < 1 || name.length > DOG_NAME_MAX_LENGTH) return fail('invalid_name');
      return ok({ ...save, dog: { ...save.dog, name } });
    }

    case 'PAUSE_CHALLENGE': {
      if (save.mode !== 'challenge') return fail('challenge_only');
      return ok(save.challengePaused ? save : { ...save, challengePaused: true });
    }

    case 'RESUME_CHALLENGE': {
      if (save.mode !== 'challenge') return fail('challenge_only');
      // lastSeenUTC is re-anchored by reduce(); the pause window never counts as absence.
      return ok(save.challengePaused ? { ...save, challengePaused: false } : save);
    }

    case 'CLOSE_APP':
      return ok(save);

    case 'APPLY_OFFLINE': {
      const result = applyOffline(save, action.nowUTC);
      return ok(result.save, result.effects);
    }

    case 'TICK_ACTIVE': {
      if (!Number.isFinite(action.activeMs) || action.activeMs < 0) return fail('invalid');
      if (save.dog.status === 'lost' || save.challengePaused) return ok(save);
      const result = applyActiveTime(save, action.activeMs, action.nowUTC);
      return ok(result.save, result.effects);
    }

    case 'ACKNOWLEDGE_EFFECT': {
      const pending = save.pendingPresentation;
      if (pending && pending.transactionId !== action.presentedTransactionId) return fail('invalid');
      const visit = save.currentVisit;
      const leavesReact = visit !== null && visit.phase === 'react';
      return ok({
        ...save,
        pendingPresentation: null,
        currentVisit: leavesReact ? { ...visit, phase: 'feedback' } : visit,
      });
    }

    case 'UPDATE_SETTINGS':
      return updateSettings(save, action.patch);

    default:
      return fail('invalid');
  }
}

const REDUCED_MOTION_VALUES: readonly Settings['reducedMotionOverride'][] = ['system', 'on', 'off'];
const QUALITY_TIER_VALUES: readonly Settings['qualityTier'][] = ['auto', 'low', 'high'];

/** Validates known keys; unknown keys are ignored; an invalid value rejects the whole patch. */
function updateSettings(save: Save, patch: Partial<Settings> | null | undefined): StepResult {
  if (!patch || typeof patch !== 'object') return fail('invalid');
  const next: Settings = { ...save.settings };
  const input = patch as Record<string, unknown>;
  if ('audioEnabled' in input) {
    if (typeof input.audioEnabled !== 'boolean') return fail('invalid');
    next.audioEnabled = input.audioEnabled;
  }
  if ('observationTextEnabled' in input) {
    if (typeof input.observationTextEnabled !== 'boolean') return fail('invalid');
    next.observationTextEnabled = input.observationTextEnabled;
  }
  if ('reducedMotionOverride' in input) {
    const value = input.reducedMotionOverride;
    if (!REDUCED_MOTION_VALUES.includes(value as Settings['reducedMotionOverride'])) return fail('invalid');
    next.reducedMotionOverride = value as Settings['reducedMotionOverride'];
  }
  if ('qualityTier' in input) {
    const value = input.qualityTier;
    if (!QUALITY_TIER_VALUES.includes(value as Settings['qualityTier'])) return fail('invalid');
    next.qualityTier = value as Settings['qualityTier'];
  }
  return ok({ ...save, settings: next });
}
