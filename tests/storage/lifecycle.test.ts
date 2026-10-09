import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLifecycle, describeReturn, type DocumentLike, type WindowLike } from '../../src/app/lifecycle';
import { INITIAL_APP_STATE, type AppState } from '../../src/app/appState';
import type { Store, StoreListener, StoreSnapshot } from '../../src/state/store';
import type { DomainAction, ReduceResult, Save } from '../../src/simulation/types';
import { createDemoSave, createTestProviders } from '../../src/simulation/fixtures';
import { createNewMeta } from '../../src/simulation/save';
import { createMemoryRepository } from '../../src/storage/memoryRepository';
import { content } from '../../src/content';

/**
 * Fake store: records dispatched actions, never touches the reducer (WP-A) so these tests only
 * verify the lifecycle's own behaviour.
 */
function createFakeStore(app: Partial<AppState> = {}) {
  const providers = createTestProviders();
  const save: Save = createDemoSave();
  const dispatched: DomainAction[] = [];
  const listeners = new Set<StoreListener>();
  let state: StoreSnapshot = { save, app: { ...INITIAL_APP_STATE, ownership: 'owner', ...app }, meta: createNewMeta(save.saveId) };
  let offlineEffects: ReduceResult['effects'] = [];

  const store: Store & { dispatched: DomainAction[]; setOfflineEffects(effects: ReduceResult['effects']): void } = {
    dispatched,
    setOfflineEffects(effects) {
      offlineEffects = effects;
    },
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async dispatch(action) {
      dispatched.push(action);
      const effects = action.type === 'APPLY_OFFLINE' ? offlineEffects : [];
      return { save: state.save, outcome: 'applied', effects };
    },
    async dispatchMeta() {},
    patchApp(patch) {
      const next = typeof patch === 'function' ? patch(state.app) : patch;
      state = { ...state, app: { ...state.app, ...next } };
      for (const listener of listeners) listener(state, 'app');
    },
    act(type, payload) {
      return store.dispatch({ ...(payload as object), type, transactionId: providers.id('tx'), nowUTC: providers.nowUTC() } as DomainAction);
    },
    providers,
    content,
    repository: createMemoryRepository(),
    async debugReplaceSave() {},
  };
  return { store, providers };
}

function createStubDocument() {
  const listeners = new Map<string, Set<() => void>>();
  let focused = true;
  const doc: DocumentLike & { emit(type: string): void; setFocus(value: boolean): void } = {
    visibilityState: 'visible',
    hasFocus: () => focused,
    addEventListener(type, listener) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type) {
      for (const listener of listeners.get(type) ?? []) listener();
    },
    setFocus(value) {
      focused = value;
    },
  };
  return doc;
}

function createStubWindow() {
  const listeners = new Map<string, Set<() => void>>();
  const win: WindowLike & { emit(type: string): void } = {
    navigator: { onLine: true },
    addEventListener(type, listener) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type) {
      for (const listener of listeners.get(type) ?? []) listener();
    },
  };
  return win;
}

/** Advances fake timers and the injected clocks together. */
async function elapse(providers: ReturnType<typeof createTestProviders>, ms: number, step = 1000): Promise<void> {
  let remaining = ms;
  while (remaining > 0) {
    const chunk = Math.min(step, remaining);
    providers.advanceMonotonic(chunk);
    providers.advanceUTC(chunk);
    await vi.advanceTimersByTimeAsync(chunk);
    remaining -= chunk;
  }
}

const types = (actions: DomainAction[]) => actions.map((action) => action.type);
const ticks = (actions: DomainAction[]) =>
  actions.filter((action): action is Extract<DomainAction, { type: 'TICK_ACTIVE' }> => action.type === 'TICK_ACTIVE');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('lifecycle – active clock', () => {
  it('61 s visible dispatches one TICK_ACTIVE with ≥ 60 000 ms (checkpoints disabled)', async () => {
    const { store, providers } = createFakeStore();
    const doc = createStubDocument();
    const win = createStubWindow();
    const lifecycle = createLifecycle(store, { document: doc, window: win, checkpointMs: null });
    lifecycle.start();
    expect(lifecycle.isActive()).toBe(true);
    await elapse(providers, 61_000);
    const sent = ticks(store.dispatched);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.activeMs).toBeGreaterThanOrEqual(60_000);
    lifecycle.stop();
  });

  it('checkpoint cadence: flushes every 30 s; 61 s credits ≥ 60 000 ms in total', async () => {
    const { store, providers } = createFakeStore();
    const doc = createStubDocument();
    const lifecycle = createLifecycle(store, { document: doc, window: createStubWindow() });
    lifecycle.start();
    await elapse(providers, 61_000);
    const sent = ticks(store.dispatched);
    expect(sent.length).toBe(2);
    expect(sent.reduce((sum, tick) => sum + tick.activeMs, 0)).toBeGreaterThanOrEqual(60_000);
    expect(sent.every((tick) => tick.activeMs <= 30_000 + 1000)).toBe(true);
    lifecycle.stop();
  });

  it('hidden state accumulates nothing; return after 2 h dispatches exactly one APPLY_OFFLINE and no catch-up tick', async () => {
    const { store, providers } = createFakeStore();
    const doc = createStubDocument();
    const win = createStubWindow();
    const lifecycle = createLifecycle(store, { document: doc, window: win, checkpointMs: null });
    lifecycle.start();
    await elapse(providers, 10_000);
    doc.visibilityState = 'hidden';
    doc.emit('visibilitychange');
    await vi.advanceTimersByTimeAsync(0);
    // Hidden: the 10 s measured before are credited, then CLOSE_APP; the clock is off.
    expect(types(store.dispatched)).toEqual(['TICK_ACTIVE', 'CLOSE_APP']);
    expect(store.get().app.pauseReasons).toContain('hidden');
    expect(lifecycle.isActive()).toBe(false);

    await elapse(providers, 2 * 3_600_000, 60_000);
    expect(types(store.dispatched)).toEqual(['TICK_ACTIVE', 'CLOSE_APP']);

    doc.visibilityState = 'visible';
    doc.emit('visibilitychange');
    await vi.advanceTimersByTimeAsync(0);
    expect(types(store.dispatched)).toEqual(['TICK_ACTIVE', 'CLOSE_APP', 'APPLY_OFFLINE']);
    expect(store.get().app.pauseReasons).not.toContain('hidden');
    expect(store.get().app.returnSummary).toMatch(/Nala/);
    expect(lifecycle.isActive()).toBe(true);

    // One more second of activity produces at most a 1 s delta, never the 2 h.
    await elapse(providers, 1000);
    expect(lifecycle.pendingActiveMs()).toBeLessThanOrEqual(1000);
    lifecycle.stop();
  });

  it('short hidden phases (< 60 s) show no return summary', async () => {
    const { store, providers } = createFakeStore();
    const doc = createStubDocument();
    const lifecycle = createLifecycle(store, { document: doc, window: createStubWindow(), checkpointMs: null });
    lifecycle.start();
    doc.visibilityState = 'hidden';
    doc.emit('visibilitychange');
    await elapse(providers, 20_000);
    doc.visibilityState = 'visible';
    doc.emit('visibilitychange');
    await vi.advanceTimersByTimeAsync(0);
    expect(store.get().app.returnSummary).toBeNull();
    expect(types(store.dispatched)).toEqual(['CLOSE_APP', 'APPLY_OFFLINE']);
    lifecycle.stop();
  });

  it('focus loss stops accumulation; focus resumes without catch-up', async () => {
    const { store, providers } = createFakeStore();
    const doc = createStubDocument();
    const win = createStubWindow();
    const lifecycle = createLifecycle(store, { document: doc, window: win, checkpointMs: null });
    lifecycle.start();
    await elapse(providers, 5000);
    doc.setFocus(false);
    win.emit('blur');
    expect(store.get().app.pauseReasons).toContain('blur');
    expect(lifecycle.isActive()).toBe(false);
    // Flushed the 5 s on deactivation.
    expect(ticks(store.dispatched).map((tick) => tick.activeMs)).toEqual([5000]);
    await elapse(providers, 120_000);
    expect(ticks(store.dispatched)).toHaveLength(1);
    expect(types(store.dispatched)).not.toContain('APPLY_OFFLINE');
    doc.setFocus(true);
    win.emit('focus');
    expect(lifecycle.isActive()).toBe(true);
    await elapse(providers, 2000);
    expect(lifecycle.pendingActiveMs()).toBe(2000);
    lifecycle.stop();
  });

  it('non-active routes and pause reasons stop the clock (isActiveRoute)', async () => {
    const { store, providers } = createFakeStore();
    const doc = createStubDocument();
    const lifecycle = createLifecycle(store, { document: doc, window: createStubWindow(), checkpointMs: null });
    lifecycle.start();
    store.patchApp({ route: 'settings' });
    expect(lifecycle.isActive()).toBe(false);
    await elapse(providers, 90_000);
    expect(ticks(store.dispatched)).toHaveLength(0);
    store.patchApp({ route: 'profile' });
    expect(lifecycle.isActive()).toBe(false);
    store.patchApp({ presenting: true });
    expect(lifecycle.isActive()).toBe(true);
    store.patchApp({ presenting: false, route: 'home' });
    expect(lifecycle.isActive()).toBe(true);
    store.patchApp({ pauseReasons: ['user'] });
    expect(lifecycle.isActive()).toBe(false);
    lifecycle.stop();
  });

  it('never dispatches when this tab is not the owner', async () => {
    const { store, providers } = createFakeStore({ ownership: 'other', pauseReasons: ['otherTab'] });
    const doc = createStubDocument();
    const win = createStubWindow();
    const lifecycle = createLifecycle(store, { document: doc, window: win, checkpointMs: null });
    lifecycle.start();
    expect(lifecycle.isActive()).toBe(false);
    await elapse(providers, 120_000);
    doc.visibilityState = 'hidden';
    doc.emit('visibilitychange');
    doc.visibilityState = 'visible';
    doc.emit('visibilitychange');
    win.emit('pagehide');
    await vi.advanceTimersByTimeAsync(0);
    expect(store.dispatched).toHaveLength(0);
    lifecycle.stop();
  });

  it('storage error pauses the clock', async () => {
    const { store, providers } = createFakeStore();
    const lifecycle = createLifecycle(store, { document: createStubDocument(), window: createStubWindow(), checkpointMs: null });
    lifecycle.start();
    store.patchApp({ storageError: 'quota: full', pauseReasons: ['storageError'] });
    expect(lifecycle.isActive()).toBe(false);
    await elapse(providers, 90_000);
    expect(ticks(store.dispatched)).toHaveLength(0);
    lifecycle.stop();
  });

  it('pagehide dispatches CLOSE_APP once and credits pending time', async () => {
    const { store, providers } = createFakeStore();
    const doc = createStubDocument();
    const win = createStubWindow();
    const lifecycle = createLifecycle(store, { document: doc, window: win, checkpointMs: null });
    lifecycle.start();
    await elapse(providers, 7000);
    win.emit('beforeunload');
    win.emit('pagehide');
    await vi.advanceTimersByTimeAsync(0);
    expect(types(store.dispatched)).toEqual(['TICK_ACTIVE', 'CLOSE_APP']);
    expect(ticks(store.dispatched)[0]?.activeMs).toBe(7000);
    lifecycle.stop();
  });

  it('mirrors online/offline and ownership changes into app state', async () => {
    const { store } = createFakeStore();
    const win = createStubWindow();
    const ownershipListeners: Array<(state: 'pending' | 'owner' | 'other') => void> = [];
    const lifecycle = createLifecycle(store, {
      document: createStubDocument(),
      window: win,
      ownership: {
        onChange(listener) {
          ownershipListeners.push(listener);
          return () => undefined;
        },
      },
    });
    lifecycle.start();
    win.navigator!.onLine = false;
    win.emit('offline');
    expect(store.get().app.online).toBe(false);
    win.emit('online');
    expect(store.get().app.online).toBe(true);
    ownershipListeners.forEach((listener) => listener('other'));
    expect(store.get().app.ownership).toBe('other');
    expect(store.get().app.pauseReasons).toContain('otherTab');
    expect(lifecycle.isActive()).toBe(false);
    lifecycle.stop();
  });

  it('calls the interrupt hook when hidden', () => {
    const { store } = createFakeStore();
    const doc = createStubDocument();
    const onInterrupt = vi.fn();
    const lifecycle = createLifecycle(store, { document: doc, window: createStubWindow(), onInterrupt });
    lifecycle.start();
    doc.visibilityState = 'hidden';
    doc.emit('visibilitychange');
    expect(onInterrupt).toHaveBeenCalledTimes(1);
    lifecycle.stop();
  });
});

describe('describeReturn', () => {
  it('summarises challenge losses with credited hours', () => {
    const text = describeReturn('Nala', 3 * 3_600_000, {
      save: createDemoSave(),
      outcome: 'applied',
      effects: [{ type: 'offlineApplied', creditedHours: 3, losses: { satiety: 6, comfort: 3 } }],
    });
    expect(text).toContain('etwa 3 Stunden');
    expect(text).toContain('Nala');
  });

  it('uses calm wording for short and long absences without losses', () => {
    expect(describeReturn('Nala', 120_000, null)).toBe('Du warst kurz weg. Nala hat gewartet.');
    expect(describeReturn('Nala', 2 * 3_600_000, { save: createDemoSave(), outcome: 'rejected', effects: [] })).toBe(
      'Du warst eine Weile weg. Nala hat gewartet.',
    );
  });
});
