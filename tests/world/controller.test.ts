import { describe, expect, it } from 'vitest';
import { INITIAL_APP_STATE, type AppState } from '../../src/app/appState';
import { createWorldController, type WorldController } from '../../src/app/world';
import { content } from '../../src/content';
import type { RendererHandle, RendererStatus } from '../../src/render/types';
import { createDemoSave, createTestProviders } from '../../src/simulation/fixtures';
import { createVisit } from '../../src/simulation/lessons';
import { createNewMeta } from '../../src/simulation/save';
import type { DomainAction, ExerciseAttempt, Save, WorldDirective } from '../../src/simulation/types';
import type { Store, StoreListener, StoreSnapshot } from '../../src/state/store';
import { createMemoryRepository } from '../../src/storage/memoryRepository';

/** Fake store: records dispatches (the controller must never make any) and lets tests patch the save. */
function createFakeStore(app: Partial<AppState> = {}, saveOverrides: Partial<Save> = {}) {
  const providers = createTestProviders();
  const dispatched: DomainAction[] = [];
  const listeners = new Set<StoreListener>();
  let state: StoreSnapshot = {
    save: createDemoSave(saveOverrides),
    app: { ...INITIAL_APP_STATE, ownership: 'owner', rendererStatus: 'ready', ...app },
    meta: createNewMeta('save_standard'),
  };
  const emit = (change: 'save' | 'app') => {
    for (const listener of listeners) listener(state, change);
  };
  const store: Store & { dispatched: DomainAction[]; patchSave(patch: Partial<Save>): void } = {
    dispatched,
    patchSave(patch) {
      state = { ...state, save: { ...state.save, ...patch } };
      emit('save');
    },
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async dispatch(action) {
      dispatched.push(action);
      return { save: state.save, outcome: 'applied', effects: [] };
    },
    async dispatchMeta() {},
    patchApp(patch) {
      const next = typeof patch === 'function' ? patch(state.app) : patch;
      state = { ...state, app: { ...state.app, ...next } };
      emit('app');
    },
    act(type, payload) {
      return store.dispatch({ ...(payload as object), type, transactionId: providers.id('tx'), nowUTC: providers.nowUTC() } as DomainAction);
    },
    providers,
    content,
    repository: createMemoryRepository(),
    async debugReplaceSave() {},
  };
  return store;
}

function createFakeRenderer(status: RendererStatus = 'ready') {
  const updates: WorldDirective[] = [];
  const renderer = {
    updates,
    getStatus: () => status,
    updateWorld: (w: WorldDirective) => void updates.push(w),
  } as unknown as RendererHandle & { updates: WorldDirective[] };
  return renderer;
}

/** Deterministic frame clock: `tick(ms)` advances time and runs the queued frame once. */
function createClock() {
  let nowMs = 1000;
  let queued: (() => void) | null = null;
  return {
    now: () => nowMs,
    requestFrame: (cb: () => void) => {
      queued = cb;
      return 1;
    },
    cancelFrame: () => {
      queued = null;
    },
    tick(ms: number, frames = 1) {
      for (let i = 0; i < frames; i++) {
        nowMs += ms;
        const cb = queued;
        queued = null;
        cb?.();
      }
    },
    hasFrame: () => queued !== null,
  };
}

function setup(app: Partial<AppState> = {}, saveOverrides: Partial<Save> = {}, rendererStatus: RendererStatus | null = 'ready') {
  const store = createFakeStore(app, saveOverrides);
  const renderer = rendererStatus ? createFakeRenderer(rendererStatus) : null;
  const clock = createClock();
  const controller: WorldController = createWorldController({
    store,
    renderer: () => renderer,
    seed: 3,
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });
  return { store, renderer, clock, controller };
}

/** A visit standing at L01_B (find_spot exercise, D-041) in the given phase. */
function visitAtExercise(phase: 'observe' | 'exercise', attempts: ExerciseAttempt[] = []) {
  const visit = createVisit('L01', 'visit_1', 7, Date.UTC(2026, 9, 9), content);
  return { ...visit, index: 1, phase, attempts };
}

const ATTEMPT: ExerciseAttempt = {
  roundId: 'L01_B',
  attemptId: 'attempt_1',
  kind: 'find_spot',
  response: 'still_tense',
  context: { handlerBand: 'near', otherDogBand: 'near', distraction: 'other_dog', distractionBand: 'near', dogZone: 'alex_bruno', handlerMoving: false },
};

describe('world controller: loop', () => {
  it('steps with frame deltas while home in yard mode and feeds renderer.updateWorld each step', () => {
    const { controller, clock, renderer, store } = setup();
    controller.start();
    expect(clock.hasFrame()).toBe(true);
    clock.tick(16); // first frame: dt 0 (no previous timestamp)
    expect(controller.getState()!.time).toBe(0);
    controller.send({ type: 'moveTo', target: { x: 0, z: -2.0 } });
    clock.tick(100, 10);
    expect(controller.isRunning()).toBe(true);
    expect(controller.getState()!.time).toBeCloseTo(1.0, 6);
    expect(controller.getState()!.actors.handler.position.z).toBeLessThan(0.5);
    expect(renderer!.updates.length).toBe(12); // first frame + the send + 10 frames
    expect(renderer!.updates.at(-1)!.actors.map((a) => a.key)).toContain('dog');
    expect(store.dispatched).toEqual([]);
    controller.stop();
    expect(clock.hasFrame()).toBe(false);
  });

  it('freezes outside yard routes and while paused, and caps a long stall', () => {
    const { controller, clock, store } = setup();
    controller.start();
    clock.tick(16);
    store.patchApp({ route: 'settings' });
    clock.tick(100, 5);
    expect(controller.isRunning()).toBe(false);
    expect(controller.getState()!.time).toBe(0);
    store.patchApp({ route: 'home' });
    clock.tick(16); // re-entry frame: dt 0
    clock.tick(5000); // stall → capped at 0.5 s
    expect(controller.getState()!.time).toBeCloseTo(0.5, 6);
    store.patchApp({ pauseReasons: ['hidden'] });
    clock.tick(100, 3);
    expect(controller.getState()!.time).toBeCloseTo(0.5, 6);
    expect(store.dispatched).toEqual([]);
  });

  it('applies send() immediately (dt 0) before the loop started', () => {
    const { controller, store } = setup();
    controller.send({ type: 'teleport', actor: 'handler', position: { x: -2.4, z: 2.2 } });
    expect(controller.getContext()!.handlerZone).toBe('quiet_corner');
    expect(controller.getContext()!.prompt).toBe('quiet_corner');
    expect(store.dispatched).toEqual([]);
  });

  it('keeps a moveDir across frames until stop', () => {
    const { controller, clock } = setup();
    controller.start();
    clock.tick(16);
    controller.send({ type: 'moveDir', dx: 0, dz: -1 });
    clock.tick(100, 5);
    const z1 = controller.getState()!.actors.handler.position.z;
    clock.tick(100, 5);
    const z2 = controller.getState()!.actors.handler.position.z;
    expect(z2).toBeLessThan(z1);
    controller.send({ type: 'stop' });
    clock.tick(100, 3);
    expect(controller.getState()!.actors.handler.position.z).toBe(z2);
  });

  it('sets the prompt in the same step that emits arrived and fires onChange', () => {
    const { controller, clock } = setup();
    let promptAtArrival: string | null | undefined;
    controller.onEvent((event) => {
      if (event.type === 'arrived' && event.actor === 'handler') promptAtArrival = controller.getContext()!.prompt;
    });
    let changes = 0;
    controller.onChange(() => changes++);
    controller.start();
    clock.tick(16);
    controller.send({ type: 'moveTo', target: { x: -2.4, z: 2.2 } });
    clock.tick(50, 120);
    expect(promptAtArrival).toBe('quiet_corner');
    expect(changes).toBeGreaterThan(0);
  });
});

describe('world controller: directive and availability', () => {
  it('returns the yard directive with world attached at home and null in static mode', () => {
    const { controller, store } = setup();
    const d = controller.directive();
    expect(d?.view).toBe('yard');
    expect(d?.world?.actors.length).toBe(5);
    store.patchApp({ yardMode: 'static' });
    expect(controller.directive()).toBeNull();
    expect(controller.isAvailable()).toBe(false);
  });

  it('returns null outside yard views (settings route)', () => {
    const { controller, store } = setup({ route: 'settings' });
    expect(controller.directive()).toBeNull();
    store.patchApp({ route: 'home' });
    expect(controller.directive()).not.toBeNull();
  });

  it('is unavailable without a ready renderer', () => {
    expect(setup({}, {}, null).controller.isAvailable()).toBe(false);
    expect(setup({}, {}, 'loading').controller.isAvailable()).toBe(false);
    expect(setup().controller.isAvailable()).toBe(true);
  });

  it('hides the sniff corner prompt until the upgrade is owned', () => {
    const { controller, store } = setup();
    controller.send({ type: 'teleport', actor: 'handler', position: { x: 2.1, z: -1.2 } });
    expect(controller.getContext()!.handlerZone).toBe('sniff_corner');
    expect(controller.getContext()!.prompt).toBeNull();
    expect(controller.directive()!.world!.prompt).toBeNull();
    store.patchSave({ school: { ...store.get().save.school, upgrades: ['sniff_corner'] } });
    expect(controller.getContext()!.prompt).toBe('sniff_corner');
    expect(controller.directive()!.world!.prompt?.zoneId).toBe('sniff_corner');
  });
});

describe('world controller: store sync', () => {
  it('mirrors a lesson exercise round: begin → showResponse from the committed attempt → release on retry → end', () => {
    const { controller, clock, store } = setup({ route: 'lesson' });
    controller.start();
    clock.tick(16);
    store.patchSave({ currentVisit: visitAtExercise('observe') });
    expect(controller.getState()!.exercise?.roundId).toBe('L01_B');
    expect(controller.getState()!.exercise?.spec.kind).toBe('find_spot');
    expect(controller.getContext()!.distraction).toBe('other_dog');

    const shown: string[] = [];
    controller.onEvent((e) => {
      if (e.type === 'responseShown') shown.push(e.response);
    });
    store.patchSave({ currentVisit: visitAtExercise('exercise', [ATTEMPT]) });
    expect(controller.getState()!.exercise?.responding).toBe('still_tense');
    clock.tick(100, 30);
    expect(shown).toEqual(['still_tense']);
    // a duplicate showResponse from the UI for the same attempt changes nothing
    controller.send({ type: 'showResponse', response: 'still_tense' });
    expect(controller.getState()!.exercise?.attempts).toBe(1);

    store.patchSave({ currentVisit: visitAtExercise('observe', [ATTEMPT]) });
    expect(controller.getState()!.exercise?.responding).toBeNull();
    expect(controller.getState()!.dogMode.kind).toBe('follow');

    store.patchSave({ currentVisit: null });
    expect(controller.getState()!.exercise).toBeNull();
    expect(store.dispatched).toEqual([]);
  });

  it('holds the dog in the care pose while a care effect is presented and releases afterwards', () => {
    const { controller, store } = setup();
    controller.start();
    const needs = store.get().save.dog;
    store.patchSave({
      pendingPresentation: {
        transactionId: 'tx_meal',
        effects: [{ type: 'care', kind: 'meal', before: needs, after: needs, pose: 'eat' }],
      },
    });
    store.patchApp({ presenting: true });
    expect(controller.getState()!.dogMode).toEqual({ kind: 'held', pose: 'eat' });
    store.patchSave({ pendingPresentation: null });
    store.patchApp({ presenting: false });
    expect(controller.getState()!.dogMode.kind).toBe('follow');
    expect(store.dispatched).toEqual([]);
  });

  it('mirrors the lesson observation hold (no moments, no following) into the world', () => {
    const { controller, store } = setup({ route: 'lesson' });
    controller.start();
    expect(controller.getState()!.hold).toBe(false);
    const visit = createVisit('L01', 'visit_2', 7, Date.UTC(2026, 9, 9), content);
    store.patchSave({ currentVisit: { ...visit, index: 0, phase: 'observe' } });
    expect(controller.getState()!.hold).toBe(true);
    store.patchSave({ currentVisit: { ...visit, index: 0, phase: 'react' } });
    expect(controller.getState()!.hold).toBe(false);
  });
});

describe('world controller: practice', () => {
  it('finishes a response in static mode and permits another practice attempt', () => {
    const { controller, clock } = setup({ route: 'practice', yardMode: 'static' }, {}, null);
    controller.start();
    controller.startPractice(content.practice.find_spot, 'none');
    controller.send({ type: 'setBand', band: 'far' });
    expect(controller.getContext()!.exerciseReady).toBe(true);
    expect(controller.practiceAttempt()).toBe('settled');
    clock.tick(100, 30);
    controller.practiceAgain();
    expect(controller.getState()!.exercise?.responding).toBeNull();
    expect(controller.practiceAttempt()).toBe('settled');
    controller.stop();
  });
  it('runs a practice exercise without touching the store', () => {
    const { controller, clock, store } = setup({ route: 'practice' });
    controller.start();
    clock.tick(16);
    controller.startPractice(content.practice.find_spot, 'none');
    expect(controller.getPractice()).toMatchObject({ attempts: 0, lastResponse: null });
    expect(controller.getState()!.exercise?.roundId).toBeNull();
    const response = controller.practiceAttempt();
    expect(response).not.toBeNull();
    expect(controller.getPractice()).toMatchObject({ attempts: 1, lastResponse: response });
    expect(controller.practiceAttempt()).toBeNull(); // still responding
    clock.tick(100, 30);
    controller.practiceAgain();
    expect(controller.getState()!.exercise?.responding).toBeNull();
    expect(controller.practiceAttempt()).not.toBeNull();
    expect(controller.getPractice()!.attempts).toBe(2);
    controller.stopPractice();
    expect(controller.getPractice()).toBeNull();
    expect(controller.getState()!.exercise).toBeNull();
    expect(store.dispatched).toEqual([]);
  });

  it('ends practice when the route changes', () => {
    const { controller, store } = setup({ route: 'practice' });
    controller.start();
    controller.startPractice(content.practice.recall, 'toy');
    expect(controller.getContext()!.distraction).toBe('toy');
    store.patchApp({ route: 'home' });
    expect(controller.getPractice()).toBeNull();
    expect(controller.getContext()!.distraction).toBe('none');
  });
});
