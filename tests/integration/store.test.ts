/**
 * Integration without DOM: real store + real reducer + real German content + memory repository.
 * Covers the cross-save behaviours the unit tests cannot (mode switch, archive, reload).
 */
import { describe, expect, it } from 'vitest';
import { content } from '../../src/content';
import { createTestProviders } from '../../src/simulation/fixtures';
import { createNewMeta, createNewSave } from '../../src/simulation/save';
import { getCurrentOptions } from '../../src/simulation/selectors';
import type { ReduceResult, Save } from '../../src/simulation/types';
import { createStore, type Store } from '../../src/state/store';
import { createMemoryRepository } from '../../src/storage/memoryRepository';

const HOUR = 3_600_000;

async function setup(): Promise<{ store: Store; repository: ReturnType<typeof createMemoryRepository>; providers: ReturnType<typeof createTestProviders> }> {
  const providers = createTestProviders();
  const repository = createMemoryRepository();
  const save = createNewSave('standard', providers, providers.nowUTC());
  const meta = createNewMeta(save.saveId);
  await repository.commit({ ...save, revision: 1 }, meta);
  const store = createStore({ repository, providers, content, save: { ...save, revision: 1 }, meta });
  return { store, repository, providers };
}

function expectApplied(result: ReduceResult, label: string): void {
  expect(result.outcome, `${label}: ${result.reason ?? ''}`).toBe('applied');
}

async function ack(store: Store): Promise<void> {
  const pending = store.get().save.pendingPresentation;
  expect(pending).not.toBeNull();
  expectApplied(await store.act('ACKNOWLEDGE_EFFECT', { presentedTransactionId: pending!.transactionId }), 'ack');
}

/** Plays one round: observe → decide → helpful option → ack → feedback. */
async function playRound(store: Store, lessonId: 'L01' | 'L02' | 'L03', roundIndex: number, pickHelpful = true): Promise<void> {
  const visit = store.get().save.currentVisit!;
  expect(visit.phase).toBe('observe');
  const round = content.lessons[lessonId].rounds[roundIndex]!;
  if (round.exercise) {
    // D-041: exercise rounds reach decide through an attempt whose context makes the dog succeed.
    const context = { handlerBand: 'far', otherDogBand: 'far', distractionBand: 'far', distraction: round.exercise.distraction, dogZone: null, handlerMoving: false } as const;
    expectApplied(await store.act('EXERCISE_ATTEMPT', { attemptId: store.providers.id('attempt'), context }), 'attempt');
    expect(store.get().save.currentVisit?.phase).toBe('exercise');
    await ack(store);
    expect(store.get().save.currentVisit?.phase).toBe('decide');
  } else {
    expectApplied(await store.act('NEXT_ROUND', {}), 'observe→decide');
  }
  const offered = getCurrentOptions(store.get().save, content);
  const option = offered.find((o) => o.helpful === pickHelpful && o.next !== 'retry') ?? offered.find((o) => o.helpful === pickHelpful)!;
  expectApplied(await store.act('SELECT_OPTION', { optionId: option.id }), `select ${option.id}`);
  // A careClosure option moves straight to reflect (D-018); everything else reacts first.
  expect(['react', 'reflect']).toContain(store.get().save.currentVisit?.phase);
  await ack(store);
}

async function playFullLesson(store: Store, lessonId: 'L01' | 'L02' | 'L03'): Promise<void> {
  expectApplied(await store.act('START_VISIT', { lessonId, visitId: store.providers.id('visit'), seed: store.providers.seed() }), 'start');
  expectApplied(await store.act('NEXT_ROUND', {}), 'prepare→observe');
  for (let i = 0; i < 3; i += 1) {
    await playRound(store, lessonId, i);
    const phase = store.get().save.currentVisit?.phase;
    if (phase === 'reflect') break;
    expect(phase).toBe('feedback');
    expectApplied(await store.act('NEXT_ROUND', {}), `feedback→next (${i})`);
  }
  const phase = store.get().save.currentVisit?.phase;
  expect(phase).toBe('reflect');
  const closure = lessonId === 'L02' ? 'completed' : 'careClosure';
  expectApplied(await store.act('COMPLETE_VISIT', { closure }), 'complete');
  await ack(store);
}

describe('store integration with real content', () => {
  it('L01 happy path: visit mark + learning mark, memory, persisted end state, reload identical', async () => {
    const { store, repository } = await setup();
    await playFullLesson(store, 'L01');
    const save = store.get().save;
    expect(save.currentVisit).toBeNull();
    expect(save.school.marks).toBe(2);
    expect(save.completedLessonIds).toEqual(['L01']);
    expect(save.dog.learnedPoints).toEqual(['criterion_context']);
    expect(save.memories).toHaveLength(1);
    expect(save.careClosureVisitIds).toHaveLength(1);
    expect(save.pendingPresentation).toBeNull();

    const stored = await repository.loadSave(save.saveId);
    expect(stored).toEqual(save);
  });

  it('three lessons unlock growth; growth keeps learned points; upgrades cost exactly once', async () => {
    const { store } = await setup();
    await playFullLesson(store, 'L01');
    await playFullLesson(store, 'L02');
    await playFullLesson(store, 'L03');
    const save = store.get().save;
    expect(save.completedLessonIds).toEqual(['L01', 'L02', 'L03']);
    expect(save.helpfulVisitIds).toHaveLength(3);
    expect(save.school.marks).toBe(6);
    expect(save.dog.learnedPoints).toHaveLength(3);

    expectApplied(await store.act('BUY_UPGRADE', { upgradeId: 'rest_place' }), 'buy rest');
    await ack(store);
    const tx = store.providers.id('tx');
    const first = await store.dispatch({ type: 'BUY_UPGRADE', upgradeId: 'sniff_corner', transactionId: tx, nowUTC: store.providers.nowUTC() });
    const replay = await store.dispatch({ type: 'BUY_UPGRADE', upgradeId: 'sniff_corner', transactionId: tx, nowUTC: store.providers.nowUTC() });
    expect(first.outcome).toBe('applied');
    expect(replay.outcome).toBe('duplicate');
    expect(store.get().save.school.marks).toBe(1);
    expect(store.get().save.school.upgrades).toEqual(['rest_place', 'sniff_corner']);
    const broke = await store.act('BUY_UPGRADE', { upgradeId: 'rest_place' });
    expect(broke.outcome).toBe('rejected');

    expectApplied(await store.act('CONFIRM_GROWTH', {}), 'growth');
    expect(store.get().save.dog.growthStage).toBe('growing');
    expect(store.get().save.dog.learnedPoints).toHaveLength(3);
  });

  it('mode switch creates an isolated challenge save; switching back re-commits the standard save (D-013)', async () => {
    const { store, repository, providers } = await setup();
    await playFullLesson(store, 'L01');
    const standardId = store.get().save.saveId;

    await store.dispatchMeta({ type: 'SELECT_MODE', mode: 'challenge', nowUTC: providers.nowUTC() });
    const challenge = store.get().save;
    expect(challenge.mode).toBe('challenge');
    expect(challenge.saveId).not.toBe(standardId);
    expect(challenge.school.marks).toBe(0);
    expect(store.get().meta.activeMode).toBe('challenge');
    expect(store.get().app.storageError).toBeNull();

    // Challenge: 30 days away → max 8 h credited, never below 25, vitality untouched.
    providers.advanceUTC(30 * 24 * HOUR);
    const offline = await store.act('APPLY_OFFLINE', {});
    expectApplied(offline, 'offline');
    const after = store.get().save.dog;
    expect(after.satiety).toBeCloseTo(80 - 16, 5);
    expect(after.comfort).toBeCloseTo(80 - 8, 5);
    expect(after.vitality).toBe(100);
    expect(after.status).toBe('alive');

    // Back to standard: must not conflict and must be untouched by the challenge run.
    await store.dispatchMeta({ type: 'SELECT_MODE', mode: 'standard', nowUTC: providers.nowUTC() });
    expect(store.get().app.storageError).toBeNull();
    const standard = store.get().save;
    expect(standard.saveId).toBe(standardId);
    expect(standard.school.marks).toBe(2);
    expect(standard.dog.satiety).toBe(80); // standard: no offline loss after 30 days
    const persisted = await repository.loadSave(standardId);
    expect(persisted?.revision).toBe(standard.revision);
  });

  it('challenge loss is final for that run and never touches the standard save', async () => {
    const { store, providers } = await setup();
    const standardId = store.get().save.saveId;
    await store.dispatchMeta({ type: 'SELECT_MODE', mode: 'challenge', nowUTC: providers.nowUTC() });
    // Drive satiety to 0 through active time: 80 / 2 per minute = 40 minutes, then 20 minutes of neglect.
    expectApplied(await store.act('TICK_ACTIVE', { activeMs: 40 * 60_000 }), 'tick 40');
    expect(store.get().save.dog.satiety).toBe(0);
    // Minute 40 already applied −5 (decline, then check), so 18 more minutes reach vitality 5.
    expect(store.get().save.dog.vitality).toBe(95);
    expectApplied(await store.act('TICK_ACTIVE', { activeMs: 18 * 60_000 }), 'tick 18');
    expect(store.get().save.dog.vitality).toBe(5);
    expect(store.get().save.dog.status).toBe('alive');
    expectApplied(await store.act('TICK_ACTIVE', { activeMs: 60_000 }), 'tick 1');
    expect(store.get().save.dog.status).toBe('lost');
    expect((await store.act('CARE', { kind: 'meal' })).outcome).toBe('rejected');

    const lostId = store.get().save.saveId;
    await store.dispatchMeta({ type: 'ARCHIVE_CHALLENGE', nowUTC: providers.nowUTC() });
    expect(store.get().meta.activeMode).toBe('standard');
    expect(store.get().meta.saveIds.challenge).toBeNull();
    expect(store.get().meta.archives).toHaveLength(1);
    expect(store.get().meta.archives[0]?.reason).toBe('lost');
    expect(store.get().meta.archives[0]?.saveId).toBe(lostId);
    const standard: Save = store.get().save;
    expect(standard.saveId).toBe(standardId);
    expect(standard.dog.status).toBe('alive');
    expect(standard.dog.vitality).toBe(100);

    await store.dispatchMeta({ type: 'CREATE_SAVE', mode: 'challenge', nowUTC: providers.nowUTC() });
    expect(store.get().save.mode).toBe('challenge');
    expect(store.get().save.saveId).not.toBe(lostId);
    expect(store.get().save.dog.instanceId).not.toBe(standard.dog.instanceId);
    expect(store.get().save.dog.status).toBe('alive');
  });

  it('a failed commit pauses with a storage error instead of discarding progress', async () => {
    const { store, repository } = await setup();
    const { StorageError } = await import('../../src/storage/types');
    (repository as unknown as { failNextCommit(e: InstanceType<typeof StorageError>): void }).failNextCommit(new StorageError('full', 'quota'));
    const result = await store.act('CARE', { kind: 'meal' });
    expect(result.outcome).toBe('applied');
    expect(store.get().save.dog.satiety).toBe(100);
    expect(store.get().app.storageError).toContain('quota');
    expect(store.get().app.pauseReasons).toContain('storageError');
    // Next successful commit clears the error.
    await ack(store);
    expect(store.get().app.storageError).toBeNull();
  });
});
