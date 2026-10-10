/**
 * D-041 playable exercises and moments: deterministic rules, lesson flow (observe → attempt → exercise → ACK → decide),
 * option filtering, retry limit, moment bounds, old-save default.
 */
import { describe, expect, it } from 'vitest';
import { content } from '../../src/content';
import { EXERCISE_MAX_ATTEMPTS, MOMENT_EFFECTS } from '../../src/simulation/defaults';
import { evaluateExercise } from '../../src/simulation/exercise';
import { createDemoSave } from '../../src/simulation/fixtures';
import { reduce } from '../../src/simulation/reducer';
import { validateSave } from '../../src/simulation/save';
import { getAttemptCount, getCurrentOptions, getCurrentRound, getLastAttempt, getSceneDirective } from '../../src/simulation/selectors';
import type { ExerciseContext, Save } from '../../src/simulation/types';

const ctx = (patch: Partial<ExerciseContext> = {}): ExerciseContext => ({
  handlerBand: 'far',
  otherDogBand: 'far',
  distractionBand: 'far',
  distraction: 'none',
  dogZone: null,
  handlerMoving: false,
  ...patch,
});

let tx = 0;
const next = (): string => `tx_${++tx}`;
const now = Date.UTC(2026, 9, 10, 10, 0, 0);

function applied(save: Save, action: Parameters<typeof reduce>[1]): Save {
  const result = reduce(save, action, content);
  if (result.outcome !== 'applied') throw new Error(`${action.type}: ${result.outcome} ${result.reason ?? ''}`);
  return result.save;
}

/** Starts L01 and walks to its exercise round (L01_B) in observe. */
function toExerciseRound(lessonId: 'L01' | 'L02' | 'L03' = 'L01'): Save {
  let save = createDemoSave();
  save = applied(save, { type: 'START_VISIT', lessonId, visitId: `v_${lessonId}`, seed: 1, nowUTC: now, transactionId: next() });
  save = applied(save, { type: 'NEXT_ROUND', nowUTC: now, transactionId: next() }); // prepare → observe (round A)
  save = applied(save, { type: 'NEXT_ROUND', nowUTC: now, transactionId: next() }); // observe → decide
  const helpful = getCurrentOptions(save, content).find((o) => o.helpful && o.next === 'advance')!;
  save = applied(save, { type: 'SELECT_OPTION', optionId: helpful.id, nowUTC: now, transactionId: next() });
  save = applied(save, { type: 'ACKNOWLEDGE_EFFECT', presentedTransactionId: save.pendingPresentation!.transactionId, nowUTC: now, transactionId: next() });
  save = applied(save, { type: 'NEXT_ROUND', nowUTC: now, transactionId: next() }); // feedback → round B observe
  for (let i = 0; i < 2 && !getCurrentRound(save, content)?.exercise; i++) {
    save = applied(save, { type: 'NEXT_ROUND', nowUTC: now, transactionId: next() });
    const opt = getCurrentOptions(save, content).find((o) => o.helpful && o.next === 'advance')!;
    save = applied(save, { type: 'SELECT_OPTION', optionId: opt.id, nowUTC: now, transactionId: next() });
    save = applied(save, { type: 'ACKNOWLEDGE_EFFECT', presentedTransactionId: save.pendingPresentation!.transactionId, nowUTC: now, transactionId: next() });
    save = applied(save, { type: 'NEXT_ROUND', nowUTC: now, transactionId: next() });
  }
  expect(getCurrentRound(save, content)?.exercise).toBeDefined();
  expect(save.currentVisit?.phase).toBe('observe');
  return save;
}

describe('evaluateExercise (deterministic rules)', () => {
  const calm = { stress: 20, energy: 80 };
  it('recall: comes only when far, undistracted, calm and rested', () => {
    expect(evaluateExercise('recall', ctx(), calm)).toBe('comes');
    expect(evaluateExercise('recall', ctx({ handlerBand: 'mid' }), calm)).toBe('hesitates');
    expect(evaluateExercise('recall', ctx({ distraction: 'toy', distractionBand: 'mid' }), calm)).toBe('distracted');
    expect(evaluateExercise('recall', ctx({ distraction: 'toy', distractionBand: 'far' }), calm)).toBe('comes');
    expect(evaluateExercise('recall', ctx({ otherDogBand: 'near' }), calm)).toBe('turns_away');
    expect(evaluateExercise('recall', ctx(), { stress: 50, energy: 80 })).toBe('hesitates');
    expect(evaluateExercise('recall', ctx(), { stress: 20, energy: 30 })).toBe('hesitates');
  });
  it('find_spot: settled only away from the other dog and the distraction, below the stress threshold', () => {
    expect(evaluateExercise('find_spot', ctx({ distraction: 'other_dog' }), calm)).toBe('settled');
    expect(evaluateExercise('find_spot', ctx({ distraction: 'other_dog', otherDogBand: 'mid' }), calm)).toBe('still_tense');
    expect(evaluateExercise('find_spot', ctx({ distraction: 'other_dog', distractionBand: 'mid' }), calm)).toBe('still_tense');
    expect(evaluateExercise('find_spot', ctx(), { stress: 55, energy: 80 })).toBe('still_tense');
  });
  it('look_at: the attempt exists only after the glance', () => {
    expect(evaluateExercise('look_at', ctx({ handlerBand: 'near' }), calm)).toBe('glance');
  });
});

describe('exercise round flow', () => {
  it('observe refuses NEXT_ROUND in an exercise round; the attempt leads to exercise → ACK → decide with filtered options', () => {
    let save = toExerciseRound('L01');
    const blocked = reduce(save, { type: 'NEXT_ROUND', nowUTC: now, transactionId: next() }, content);
    expect(blocked.outcome).toBe('rejected');
    expect(blocked.reason).toBe('exercise_not_ready');

    const result = reduce(save, { type: 'EXERCISE_ATTEMPT', attemptId: 'a1', context: ctx({ distraction: 'other_dog', otherDogBand: 'mid' }), nowUTC: now, transactionId: next() }, content);
    expect(result.outcome).toBe('applied');
    expect(result.effects[0]).toMatchObject({ type: 'exercise', response: 'still_tense', pose: 'tense_idle' });
    save = result.save;
    expect(save.currentVisit?.phase).toBe('exercise');
    expect(getLastAttempt(save)?.response).toBe('still_tense');
    expect(getAttemptCount(save, content)).toEqual({ used: 1, max: EXERCISE_MAX_ATTEMPTS });
    // Inputs locked while the response is presented.
    expect(reduce(save, { type: 'CARE', kind: 'meal', nowUTC: now, transactionId: next() }, content).reason).toBe('wrong_phase');
    expect(reduce(save, { type: 'EXERCISE_ATTEMPT', attemptId: 'a2', context: ctx(), nowUTC: now, transactionId: next() }, content).reason).toBe('wrong_phase');

    save = applied(save, { type: 'ACKNOWLEDGE_EFFECT', presentedTransactionId: save.pendingPresentation!.transactionId, nowUTC: now, transactionId: next() });
    expect(save.currentVisit?.phase).toBe('decide');
    const offered = getCurrentOptions(save, content).map((o) => o.id);
    expect(offered).toEqual(['L01_B_distance', 'L01_B_lure']);
    // An option not offered for this response is rejected.
    expect(reduce(save, { type: 'SELECT_OPTION', optionId: 'L01_B_stay', nowUTC: now, transactionId: next() }, content).reason).toBe('unknown_option');
  });

  it('retry returns to observe without charging the round; at the limit it advances', () => {
    let save = toExerciseRound('L01');
    const energyBefore = save.dog.energy;
    for (let attempt = 1; attempt <= EXERCISE_MAX_ATTEMPTS; attempt++) {
      save = applied(save, { type: 'EXERCISE_ATTEMPT', attemptId: `a${attempt}`, context: ctx({ distraction: 'other_dog', otherDogBand: 'near' }), nowUTC: now, transactionId: next() });
      save = applied(save, { type: 'ACKNOWLEDGE_EFFECT', presentedTransactionId: save.pendingPresentation!.transactionId, nowUTC: now, transactionId: next() });
      save = applied(save, { type: 'SELECT_OPTION', optionId: 'L01_B_distance', nowUTC: now, transactionId: next() });
      expect(save.currentVisit?.phase).toBe('react');
      save = applied(save, { type: 'ACKNOWLEDGE_EFFECT', presentedTransactionId: save.pendingPresentation!.transactionId, nowUTC: now, transactionId: next() });
      expect(save.currentVisit?.phase).toBe('feedback');
      save = applied(save, { type: 'NEXT_ROUND', nowUTC: now, transactionId: next() });
      if (attempt < EXERCISE_MAX_ATTEMPTS) {
        expect(save.currentVisit?.phase).toBe('observe');
        expect(getCurrentRound(save, content)?.id).toBe('L01_B');
        expect(save.dog.energy).toBe(energyBefore);
      }
    }
    // Third retry at the limit behaves as advance: next round, charged once.
    expect(getCurrentRound(save, content)?.id).toBe('L01_C');
    expect(save.dog.energy).toBe(energyBefore - 4);
    expect(reduce(toExerciseRound('L01'), { type: 'EXERCISE_ATTEMPT', attemptId: 'a1', context: ctx(), nowUTC: now, transactionId: next() }, content).outcome).toBe('applied');
  });

  it('a settled attempt offers the counting option and completes the learning path', () => {
    let save = toExerciseRound('L01');
    save = applied(save, { type: 'EXERCISE_ATTEMPT', attemptId: 'a1', context: ctx({ distraction: 'other_dog' }), nowUTC: now, transactionId: next() });
    expect(getLastAttempt(save)?.response).toBe('settled');
    save = applied(save, { type: 'ACKNOWLEDGE_EFFECT', presentedTransactionId: save.pendingPresentation!.transactionId, nowUTC: now, transactionId: next() });
    expect(getCurrentOptions(save, content).map((o) => o.id)).toEqual(['L01_B_stay', 'L01_B_lure']);
    save = applied(save, { type: 'SELECT_OPTION', optionId: 'L01_B_stay', nowUTC: now, transactionId: next() });
    expect(save.helpfulScenariosByLearningPoint.criterion_context).toContain('L01_bruno_loud');
    // Attempt limit refuses a fourth attempt id even in observe.
    const limit = reduce({ ...save, currentVisit: { ...save.currentVisit!, phase: 'observe', attempts: [1, 2, 3].map((n) => ({ ...save.currentVisit!.attempts[0]!, attemptId: `x${n}` })) } }, { type: 'EXERCISE_ATTEMPT', attemptId: 'a9', context: ctx(), nowUTC: now, transactionId: next() }, content);
    expect(limit.reason).toBe('attempt_limit');
  });

  it('L02_C recall with the ball: distracted at mid distance, comes when far from the ball', () => {
    let save = toExerciseRound('L02');
    expect(getCurrentRound(save, content)?.id).toBe('L02_C');
    const r1 = reduce(save, { type: 'EXERCISE_ATTEMPT', attemptId: 'a1', context: ctx({ distraction: 'toy', distractionBand: 'mid' }), nowUTC: now, transactionId: next() }, content);
    expect(r1.effects[0]).toMatchObject({ type: 'exercise', response: 'distracted' });
    save = applied(save, { type: 'EXERCISE_ATTEMPT', attemptId: 'a1', context: ctx({ distraction: 'toy', distractionBand: 'far' }), nowUTC: now, transactionId: next() });
    expect(getLastAttempt(save)?.response).toBe('comes');
    save = applied(save, { type: 'ACKNOWLEDGE_EFFECT', presentedTransactionId: save.pendingPresentation!.transactionId, nowUTC: now, transactionId: next() });
    expect(getCurrentOptions(save, content).map((o) => o.id)).toEqual(['L02_C_reward', 'L02_C_nothing']);
  });

  it('the scene directive puts exercise rounds into the yard view with both dogs; static mode keeps the closeup', () => {
    const save = toExerciseRound('L01');
    const yard = getSceneDirective(save, content, { route: 'lesson' });
    expect(yard.view).toBe('yard');
    expect(yard.dogs.map((d) => d.id)).toEqual(['dog_nala', 'dog_bruno']);
    const classic = getSceneDirective(save, content, { route: 'lesson', yardMode: 'static' });
    expect(classic.view).toBe('closeup');
    expect(getSceneDirective(createDemoSave(), content, { route: 'home' }).view).toBe('yard');
    expect(getSceneDirective(createDemoSave(), content, { route: 'home', yardMode: 'static' }).view).toBe('school');
  });

  it('abandoning drops a pending exercise presentation', () => {
    let save = toExerciseRound('L01');
    save = applied(save, { type: 'EXERCISE_ATTEMPT', attemptId: 'a1', context: ctx(), nowUTC: now, transactionId: next() });
    save = applied(save, { type: 'ABANDON_VISIT', nowUTC: now, transactionId: next() });
    expect(save.currentVisit).toBeNull();
    expect(save.pendingPresentation).toBeNull();
  });
});

describe('moments', () => {
  it('RESPOND_MOMENT applies the bounded effect once, clamps, and is refused for unknown pairs', () => {
    const save = createDemoSave();
    const result = reduce(save, { type: 'RESPOND_MOMENT', kind: 'settle_beside', response: 'sit_with', nowUTC: now, transactionId: next() }, content);
    expect(result.outcome).toBe('applied');
    expect(result.save.dog.stress).toBe(save.dog.stress - 10);
    expect(result.save.dog.comfort).toBe(Math.min(100, save.dog.comfort + 10));
    expect(result.effects[0]).toMatchObject({ type: 'moment', kind: 'settle_beside', pose: 'rest_loop' });
    expect(result.save.pendingPresentation?.effects[0]?.type).toBe('moment');
    expect(reduce(save, { type: 'RESPOND_MOMENT', kind: 'settle_beside', response: 'allow', nowUTC: now, transactionId: next() }, content).reason).toBe('invalid');
    const full = { ...save, dog: { ...save.dog, comfort: 100, stress: 0 } };
    const clamped = reduce(full, { type: 'RESPOND_MOMENT', kind: 'sniff_spot', response: 'allow', nowUTC: now, transactionId: next() }, content).save.dog;
    expect(clamped.comfort).toBe(100);
    expect(clamped.stress).toBe(0);
  });
  it('every moment effect stays within ±10 per need', () => {
    for (const byKind of Object.values(MOMENT_EFFECTS)) {
      for (const delta of Object.values(byKind)) {
        for (const value of Object.values(delta)) expect(Math.abs(value)).toBeLessThanOrEqual(10);
      }
    }
  });
});

describe('save compatibility', () => {
  it('a visit without attempts validates and defaults to an empty list', () => {
    const save = toExerciseRound('L01');
    const json = JSON.parse(JSON.stringify(save)) as Record<string, unknown>;
    delete (json.currentVisit as Record<string, unknown>).attempts;
    const result = validateSave(json);
    expect(result.ok, result.errors.join('; ')).toBe(true);
    expect(result.value?.currentVisit?.attempts).toEqual([]);
  });
});
