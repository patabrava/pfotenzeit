/**
 * Active-time clock and interruption handling (04 Zeitmodell, 15 Zeit, 05 Unterbrechungen).
 *
 * - A 1 s interval runs only while active; it reads monotonic deltas and accumulates. Every
 *   ≥ 60 000 ms accumulated, or at each 30 s checkpoint, TICK_ACTIVE{activeMs} is dispatched
 *   (the reducer keeps sub-minute remainders and refreshes lastSeenUTC).
 * - Active ⇔ visible && focused && isActiveRoute(app) && owner && no storage error.
 * - The monotonic reference is reset whenever activity resumes, so a return never produces a
 *   catch-up tick. Hidden → CLOSE_APP; visible → one APPLY_OFFLINE and a short return summary.
 * - Nothing is ever dispatched unless this tab is the owner.
 */
import type { DomainEffect, ReduceResult } from '../simulation/types';
import type { Store } from '../state/store';
import type { OwnershipState, TabOwnership } from '../storage/types';
import { isActiveRoute, type PauseReason } from './appState';

export interface DocumentLike {
  visibilityState: 'visible' | 'hidden' | string;
  hasFocus?: () => boolean;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface WindowLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  navigator?: { onLine?: boolean };
}

export interface LifecycleDeps {
  document?: DocumentLike;
  window?: WindowLike;
  ownership?: Pick<TabOwnership, 'onChange'>;
  /** Called when the app is interrupted (hidden/unload): stop audio, cancel presentations. */
  onInterrupt?: () => void;
  /** Interval between monotonic reads while active. Default 1000 ms. */
  tickIntervalMs?: number;
  /** Accumulated active ms that forces a TICK_ACTIVE. Default 60 000 ms. */
  tickThresholdMs?: number;
  /** Checkpoint cadence (flush whatever accumulated). Default 30 000 ms; null disables. */
  checkpointMs?: number | null;
  /** Minimum hidden duration before a return summary is shown. Default 60 000 ms. */
  summaryMinHiddenMs?: number;
}

export interface Lifecycle {
  start(): void;
  stop(): void;
  isActive(): boolean;
  /** Dispatches any accumulated active time now (before export, debug, unload). */
  flush(): Promise<void>;
  /** Accumulated active ms not yet dispatched (diagnostics). */
  pendingActiveMs(): number;
}

function withReason(reasons: PauseReason[], reason: PauseReason, present: boolean): PauseReason[] {
  const has = reasons.includes(reason);
  if (present && !has) return [...reasons, reason];
  if (!present && has) return reasons.filter((r) => r !== reason);
  return reasons;
}

function findOffline(effects: DomainEffect[]): Extract<DomainEffect, { type: 'offlineApplied' }> | null {
  for (const effect of effects) if (effect.type === 'offlineApplied') return effect;
  return null;
}

/** German return summary (05 Unterbrechungen). Calm, no blame. */
export function describeReturn(dogName: string, hiddenMs: number, result: ReduceResult | null): string {
  const offline = result ? findOffline(result.effects) : null;
  const hours = hiddenMs / 3_600_000;
  if (offline && offline.creditedHours >= 1 && Object.keys(offline.losses).length > 0) {
    const credited = Math.round(offline.creditedHours);
    const span = credited <= 1 ? 'etwa eine Stunde' : `etwa ${credited} Stunden`;
    return `Du warst ${span} weg. ${dogName} hat gewartet und freut sich jetzt über etwas Fürsorge.`;
  }
  if (hours >= 1) return `Du warst eine Weile weg. ${dogName} hat gewartet.`;
  return `Du warst kurz weg. ${dogName} hat gewartet.`;
}

export function createLifecycle(store: Store, deps: LifecycleDeps = {}): Lifecycle {
  const doc: DocumentLike | null = deps.document ?? (typeof document !== 'undefined' ? document : null);
  const win: WindowLike | null = deps.window ?? (typeof window !== 'undefined' ? window : null);
  const tickIntervalMs = deps.tickIntervalMs ?? 1000;
  const tickThresholdMs = deps.tickThresholdMs ?? 60_000;
  const checkpointMs = deps.checkpointMs === undefined ? 30_000 : deps.checkpointMs;
  const summaryMinHiddenMs = deps.summaryMinHiddenMs ?? 60_000;
  const { providers } = store;

  let started = false;
  let active = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let reference = 0;
  let accumulated = 0;
  let sinceCheckpoint = 0;
  let hiddenAtUTC: number | null = null;
  /** True once CLOSE_APP was dispatched for the current interruption (avoid duplicates on unload). */
  let closed = false;
  let evaluating = false;
  let evaluateAgain = false;
  const cleanups: Array<() => void> = [];

  function isOwner(): boolean {
    return store.get().app.ownership === 'owner';
  }

  function isVisible(): boolean {
    return !doc || doc.visibilityState !== 'hidden';
  }

  function isFocused(): boolean {
    if (!doc || typeof doc.hasFocus !== 'function') return true;
    try {
      return doc.hasFocus();
    } catch {
      return true;
    }
  }

  function shouldBeActive(): boolean {
    const { app } = store.get();
    return isVisible() && isFocused() && isActiveRoute(app) && app.ownership === 'owner' && !app.storageError;
  }

  async function dispatchSafe<T extends 'TICK_ACTIVE' | 'CLOSE_APP' | 'APPLY_OFFLINE'>(
    type: T,
    payload: T extends 'TICK_ACTIVE' ? { activeMs: number } : Record<string, never>,
  ): Promise<ReduceResult | null> {
    if (!isOwner()) return null;
    try {
      return await store.act(type, payload as never);
    } catch (error) {
      console.warn(`[lifecycle] ${type} failed`, error);
      return null;
    }
  }

  function flushSync(): Promise<void> {
    if (accumulated <= 0) return Promise.resolve();
    const activeMs = Math.round(accumulated);
    accumulated = 0;
    sinceCheckpoint = 0;
    return dispatchSafe('TICK_ACTIVE', { activeMs }).then(() => undefined);
  }

  function tick(): void {
    if (!active) return;
    const now = providers.monotonic();
    const delta = Math.max(0, now - reference);
    reference = now;
    accumulated += delta;
    sinceCheckpoint += delta;
    if (accumulated >= tickThresholdMs || (checkpointMs !== null && sinceCheckpoint >= checkpointMs)) {
      void flushSync();
    }
  }

  function activate(): void {
    if (active) return;
    active = true;
    closed = false;
    reference = providers.monotonic();
    sinceCheckpoint = 0;
    timer = setInterval(tick, tickIntervalMs);
  }

  function deactivate(): void {
    if (!active) return;
    active = false;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    // Credit the time measured so far; the reference is re-read on the next activation.
    void flushSync();
  }

  function evaluate(): void {
    if (!started) return;
    if (evaluating) {
      evaluateAgain = true;
      return;
    }
    evaluating = true;
    try {
      do {
        evaluateAgain = false;
        if (shouldBeActive()) activate();
        else deactivate();
      } while (evaluateAgain);
    } finally {
      evaluating = false;
    }
  }

  function setReason(reason: PauseReason, present: boolean): void {
    const { app } = store.get();
    const next = withReason(app.pauseReasons, reason, present);
    if (next !== app.pauseReasons) store.patchApp({ pauseReasons: next });
  }

  async function closeApp(): Promise<void> {
    if (closed) return;
    closed = true;
    await flushSync();
    await dispatchSafe('CLOSE_APP', {});
  }

  function onHidden(): void {
    hiddenAtUTC = providers.nowUTC();
    deactivate();
    store.patchApp((app) => ({ pauseReasons: withReason(app.pauseReasons, 'hidden', true), returnSummary: null }));
    try {
      deps.onInterrupt?.();
    } catch (error) {
      console.warn('[lifecycle] onInterrupt failed', error);
    }
    void closeApp();
  }

  async function onVisible(): Promise<void> {
    const hiddenMs = hiddenAtUTC === null ? 0 : Math.max(0, providers.nowUTC() - hiddenAtUTC);
    hiddenAtUTC = null;
    closed = false;
    const result = await dispatchSafe('APPLY_OFFLINE', {});
    const dogName = store.get().save.dog.name;
    const summary = hiddenMs >= summaryMinHiddenMs ? describeReturn(dogName, hiddenMs, result) : null;
    store.patchApp((app) => ({ pauseReasons: withReason(app.pauseReasons, 'hidden', false), returnSummary: summary }));
    evaluate();
  }

  function onVisibilityChange(): void {
    if (isVisible()) void onVisible();
    else onHidden();
  }

  function onBlur(): void {
    setReason('blur', true);
    evaluate();
  }

  function onFocus(): void {
    setReason('blur', false);
    evaluate();
  }

  function onUnload(): void {
    deactivate();
    void closeApp();
  }

  function onOnline(): void {
    store.patchApp({ online: true });
  }

  function onOffline(): void {
    store.patchApp({ online: false });
  }

  function onOwnership(state: OwnershipState): void {
    store.patchApp((app) => ({
      ownership: state,
      pauseReasons: withReason(app.pauseReasons, 'otherTab', state === 'other'),
    }));
    evaluate();
  }

  function listen(target: DocumentLike | WindowLike | null, type: string, listener: () => void): void {
    if (!target) return;
    target.addEventListener(type, listener);
    cleanups.push(() => target.removeEventListener(type, listener));
  }

  const lifecycle: Lifecycle = {
    start() {
      if (started) return;
      started = true;
      listen(doc, 'visibilitychange', onVisibilityChange);
      listen(win, 'blur', onBlur);
      listen(win, 'focus', onFocus);
      listen(win, 'pagehide', onUnload);
      listen(win, 'beforeunload', onUnload);
      listen(win, 'online', onOnline);
      listen(win, 'offline', onOffline);
      if (deps.ownership) cleanups.push(deps.ownership.onChange(onOwnership));
      cleanups.push(
        store.subscribe((_snapshot, change) => {
          if (change === 'app') evaluate();
        }),
      );
      // Initial state: mirror visibility/focus into pause reasons without dispatching anything.
      const initialReasons = withReason(
        withReason(store.get().app.pauseReasons, 'hidden', !isVisible()),
        'blur',
        !isFocused(),
      );
      const online = win?.navigator?.onLine;
      store.patchApp({ pauseReasons: initialReasons, ...(typeof online === 'boolean' ? { online } : {}) });
      if (!isVisible()) hiddenAtUTC = providers.nowUTC();
      evaluate();
    },
    stop() {
      if (!started) return;
      started = false;
      deactivate();
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
    isActive: () => active,
    flush() {
      if (active) {
        const now = providers.monotonic();
        accumulated += Math.max(0, now - reference);
        reference = now;
      }
      return flushSync();
    },
    pendingActiveMs: () => accumulated,
  };

  return lifecycle;
}
