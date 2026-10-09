/**
 * Test drivers around reduce(). Every helper asserts the outcome it expects so a silent rejection fails loudly.
 */
import { expect } from 'vitest';
import type { ContentCatalog, LessonOption, LessonRound } from '../../../src/content/types';
import { reduce } from '../../../src/simulation/reducer';
import { createNewSave } from '../../../src/simulation/save';
import { createTestProviders } from '../../../src/simulation/fixtures';
import type {
  DogState,
  DomainAction,
  LessonId,
  Mode,
  ReduceResult,
  RoundRef,
  Save,
} from '../../../src/simulation/types';
import { testContent } from './content';

export const T0 = Date.UTC(2026, 9, 9, 9, 0, 0);
export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

let txCounter = 0;
export function tx(): string {
  txCounter += 1;
  return `tx_${txCounter}`;
}

type ActionInput = DomainAction extends infer A
  ? A extends DomainAction
    ? Omit<A, 'transactionId' | 'nowUTC'> & { transactionId?: string; nowUTC?: number }
    : never
  : never;

export function makeAction(input: ActionInput): DomainAction {
  return { transactionId: tx(), nowUTC: T0, ...input } as DomainAction;
}

export function run(save: Save, input: ActionInput, content: ContentCatalog = testContent): ReduceResult {
  return reduce(save, makeAction(input), content);
}

/** Reduce and assert `applied`; returns the next save. */
export function applied(save: Save, input: ActionInput, content: ContentCatalog = testContent): Save {
  const result = run(save, input, content);
  expect(result, `${input.type} should be applied`).toMatchObject({ outcome: 'applied' });
  return result.save;
}

export function newSave(mode: Mode = 'standard', overrides: Partial<Save> = {}): Save {
  const providers = createTestProviders(T0);
  return { ...createNewSave(mode, providers, T0), ...overrides };
}

export function withDog(save: Save, patch: Partial<DogState>): Save {
  return { ...save, dog: { ...save.dog, ...patch } };
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

export type Chooser = (ref: RoundRef, round: LessonRound) => string;

export const chooseHelpful: Chooser = (_ref, round) => {
  const option = round.options.find((entry) => entry.helpful);
  if (!option) throw new Error(`no helpful option in ${round.id}`);
  return option.id;
};

export const chooseUnhelpful: Chooser = (_ref, round) => {
  const option = round.options.find((entry) => !entry.helpful);
  if (!option) throw new Error(`no unhelpful option in ${round.id}`);
  return option.id;
};

/** Picks by round id; supported replays use `<roundId>:supported`, inserted variants `<roundId>:inserted`, else the plain id. */
export function chooseByRound(map: Record<string, string>, fallback: Chooser = chooseHelpful): Chooser {
  return (ref, round) => {
    const key = ref.supported ? `${round.id}:supported` : ref.inserted ? `${round.id}:inserted` : round.id;
    return map[key] ?? map[round.id] ?? fallback(ref, round);
  };
}

export function currentRound(save: Save, content: ContentCatalog = testContent): { ref: RoundRef; round: LessonRound } {
  const visit = save.currentVisit;
  if (!visit) throw new Error('no visit');
  const ref = visit.queue[visit.index];
  if (!ref) throw new Error('queue exhausted');
  const round = content.lessons[visit.lessonId].rounds.find((entry) => entry.id === ref.roundId);
  if (!round) throw new Error(`unknown round ${ref.roundId}`);
  return { ref, round };
}

export function optionOf(lessonId: LessonId, optionId: string, content: ContentCatalog = testContent): LessonOption {
  for (const round of content.lessons[lessonId].rounds) {
    const option = round.options.find((entry) => entry.id === optionId);
    if (option) return option;
  }
  throw new Error(`unknown option ${optionId}`);
}

export function startVisit(save: Save, lessonId: LessonId, visitId: string, nowUTC = T0): Save {
  return applied(save, { type: 'START_VISIT', lessonId, visitId, seed: 7, nowUTC });
}

/**
 * Drives the visit until `reflect`, choosing options with `choose`. Each round goes
 * observe → decide → react (acknowledged) → feedback → NEXT_ROUND. Stops early if the visit ends.
 */
export function playToReflect(save: Save, choose: Chooser = chooseHelpful, nowUTC = T0): Save {
  let current = save;
  for (let guard = 0; guard < 100; guard += 1) {
    const visit = current.currentVisit;
    if (!visit || visit.phase === 'reflect') return current;
    switch (visit.phase) {
      case 'prepare':
      case 'observe':
      case 'feedback':
        current = applied(current, { type: 'NEXT_ROUND', nowUTC });
        break;
      case 'decide': {
        const { ref, round } = currentRound(current);
        current = applied(current, { type: 'SELECT_OPTION', optionId: choose(ref, round), nowUTC });
        break;
      }
      case 'react': {
        const pending = current.pendingPresentation;
        if (!pending) throw new Error('react without pending presentation');
        current = applied(current, { type: 'ACKNOWLEDGE_EFFECT', presentedTransactionId: pending.transactionId, nowUTC });
        break;
      }
      default:
        throw new Error(`unexpected phase ${visit.phase}`);
    }
  }
  throw new Error('visit did not reach reflect');
}

/** Starts, plays and completes a visit. Closure defaults to the one the lesson ended with. */
export function completeVisit(
  save: Save,
  lessonId: LessonId,
  visitId: string,
  choose: Chooser = chooseHelpful,
  closure?: 'completed' | 'careClosure',
  nowUTC = T0,
): Save {
  const started = startVisit(save, lessonId, visitId, nowUTC);
  const reflect = playToReflect(started, choose, nowUTC);
  const visit = reflect.currentVisit;
  if (!visit) throw new Error('visit vanished');
  const exhausted = visit.index >= visit.queue.length;
  return applied(reflect, { type: 'COMPLETE_VISIT', closure: closure ?? (exhausted ? 'completed' : 'careClosure'), nowUTC });
}
