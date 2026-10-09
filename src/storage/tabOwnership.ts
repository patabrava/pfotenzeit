/**
 * Exactly one tab owns the simulation clock and the write role (09 "Speichern und Zeit").
 *
 * Primary: Web Locks. `navigator.locks.request(name, { ifAvailable: true }, ...)` is held for the
 * page lifetime (the callback's promise never resolves until release()). A second tab resolves
 * 'other' and queues a normal request; when the owner closes, the lock is granted and listeners get
 * 'owner' (boot reloads the page at that point so it runs the full sequence).
 *
 * Fallback: BroadcastChannel lease. The owner heartbeats; a candidate claims, waits briefly for an
 * owner's reply, and takes over when no heartbeat arrives within the lease. Ties between two
 * simultaneous claims resolve by tabId. When two owners meet (owner was throttled past its lease),
 * the older one yields to the newer, which took over legitimately.
 *
 * No BroadcastChannel either: single-tab assumption, resolves 'owner'.
 */
import type { OwnershipState, TabOwnership } from './types';

export const OWNER_LOCK_NAME = 'pfotenzeit-owner';

/** Minimal BroadcastChannel surface so tests can inject an in-memory bus. */
export interface ChannelLike {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export interface LockManagerLike {
  request(name: string, options: { ifAvailable?: boolean; mode?: 'exclusive' | 'shared' }, callback: (lock: unknown) => Promise<unknown> | unknown): Promise<unknown>;
}

export interface TabOwnershipOptions {
  name?: string;
  tabId?: string;
  /** Returns a channel or null when BroadcastChannel is unavailable. Default: real BroadcastChannel. */
  channelFactory?: (name: string) => ChannelLike | null;
  /** Web Locks manager or null to force the fallback. Default: navigator.locks when present. */
  locks?: LockManagerLike | null;
  /** Fallback timing. */
  heartbeatMs?: number;
  leaseMs?: number;
  claimWaitMs?: number;
  now?: () => number;
}

type LeaseMessage =
  | { type: 'claim'; tabId: string }
  | { type: 'heartbeat'; tabId: string; since: number }
  | { type: 'release'; tabId: string };

function defaultChannelFactory(name: string): ChannelLike | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(name) as unknown as ChannelLike;
  } catch {
    return null;
  }
}

function defaultLocks(): LockManagerLike | null {
  if (typeof navigator === 'undefined') return null;
  const locks = (navigator as { locks?: LockManagerLike }).locks;
  return locks && typeof locks.request === 'function' ? locks : null;
}

function randomTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createTabOwnership(options: TabOwnershipOptions = {}): TabOwnership & { readonly tabId: string; getState(): OwnershipState } {
  const name = options.name ?? OWNER_LOCK_NAME;
  const tabId = options.tabId ?? randomTabId();
  const channelFactory = options.channelFactory ?? defaultChannelFactory;
  const locks = options.locks === undefined ? defaultLocks() : options.locks;
  const heartbeatMs = options.heartbeatMs ?? 2000;
  const leaseMs = options.leaseMs ?? heartbeatMs * 4;
  const claimWaitMs = options.claimWaitMs ?? 300;
  const now = options.now ?? (() => Date.now());

  let state: OwnershipState = 'pending';
  let released = false;
  const listeners = new Set<(state: OwnershipState) => void>();
  let acquirePromise: Promise<OwnershipState> | null = null;

  // Web Locks bookkeeping
  let releaseHeldLock: (() => void) | null = null;

  // Fallback bookkeeping
  let channel: ChannelLike | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let leaseTimer: ReturnType<typeof setTimeout> | null = null;
  let ownerSince = 0;
  let lastHeartbeatAt = 0;

  function setState(next: OwnershipState): void {
    if (state === next) return;
    state = next;
    for (const listener of listeners) {
      try {
        listener(next);
      } catch (error) {
        console.error('[ownership] listener failed', error);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Web Locks path
  // -------------------------------------------------------------------------

  function holdLock(): Promise<void> {
    return new Promise<void>((resolve) => {
      releaseHeldLock = resolve;
    });
  }

  async function acquireWithLocks(manager: LockManagerLike): Promise<OwnershipState> {
    let granted = false;
    const immediate = new Promise<boolean>((resolve) => {
      manager
        .request(name, { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(false);
            return undefined;
          }
          granted = true;
          resolve(true);
          return holdLock();
        })
        .catch((error: unknown) => {
          console.warn('[ownership] lock request failed', error);
          resolve(false);
        });
    });
    const ok = await immediate;
    if (ok && granted) {
      setState('owner');
      return 'owner';
    }
    setState('other');
    // Queue for the lock; granted once the current owner closes or releases.
    manager
      .request(name, { mode: 'exclusive' }, (lock) => {
        if (released || !lock) return undefined;
        setState('owner');
        return holdLock();
      })
      .catch((error: unknown) => console.warn('[ownership] queued lock request failed', error));
    return 'other';
  }

  // -------------------------------------------------------------------------
  // BroadcastChannel lease fallback
  // -------------------------------------------------------------------------

  function post(message: LeaseMessage): void {
    try {
      channel?.postMessage(message);
    } catch (error) {
      console.warn('[ownership] postMessage failed', error);
    }
  }

  function stopHeartbeat(): void {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function stopLeaseWatch(): void {
    if (leaseTimer !== null) {
      clearTimeout(leaseTimer);
      leaseTimer = null;
    }
  }

  function becomeOwner(): void {
    stopLeaseWatch();
    ownerSince = now();
    post({ type: 'heartbeat', tabId, since: ownerSince });
    stopHeartbeat();
    heartbeatTimer = setInterval(() => post({ type: 'heartbeat', tabId, since: ownerSince }), heartbeatMs);
    setState('owner');
  }

  function becomeOther(): void {
    stopHeartbeat();
    setState('other');
    watchLease();
  }

  function watchLease(): void {
    stopLeaseWatch();
    if (released) return;
    leaseTimer = setTimeout(() => {
      leaseTimer = null;
      if (released || state !== 'other') return;
      if (now() - lastHeartbeatAt >= leaseMs) {
        // Owner went silent: claim again (fast path) and take over if nobody answers.
        void claim().then((result) => {
          if (result === 'free' && !released && state === 'other') becomeOwner();
          else if (result === 'taken') watchLease();
        });
      } else {
        watchLease();
      }
    }, leaseMs);
  }

  function claim(): Promise<'free' | 'taken'> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: 'free' | 'taken') => {
        if (settled) return;
        settled = true;
        pendingClaimResolver = null;
        resolve(result);
      };
      pendingClaimResolver = finish;
      post({ type: 'claim', tabId });
      setTimeout(() => finish('free'), claimWaitMs);
    });
  }

  let pendingClaimResolver: ((result: 'free' | 'taken') => void) | null = null;
  /** Tabs that announced release; a heartbeat of theirs still in flight must not cancel a takeover. */
  const releasedTabs = new Set<string>();

  function handleMessage(data: unknown): void {
    if (released) return;
    const message = data as LeaseMessage | null;
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') return;
    if (message.tabId === tabId) return;
    switch (message.type) {
      case 'claim': {
        releasedTabs.delete(message.tabId);
        if (state === 'owner') {
          post({ type: 'heartbeat', tabId, since: ownerSince });
        } else if (state === 'pending' && pendingClaimResolver) {
          // Two candidates claimed at the same time: the lexically smaller id wins. Re-announce so a
          // candidate whose channel did not exist yet when we claimed learns about us.
          if (message.tabId < tabId) pendingClaimResolver('taken');
          else post({ type: 'claim', tabId });
        }
        return;
      }
      case 'heartbeat': {
        if (releasedTabs.has(message.tabId)) return;
        lastHeartbeatAt = now();
        if (state === 'owner') {
          // Two owners: the one that took over later did so after our lease expired → we yield.
          if (message.since > ownerSince || (message.since === ownerSince && message.tabId < tabId)) {
            becomeOther();
          } else {
            post({ type: 'heartbeat', tabId, since: ownerSince });
          }
          return;
        }
        if (pendingClaimResolver) pendingClaimResolver('taken');
        if (state === 'other') watchLease();
        return;
      }
      case 'release': {
        releasedTabs.add(message.tabId);
        if (state === 'other') {
          lastHeartbeatAt = 0;
          stopLeaseWatch();
          void claim().then((result) => {
            if (result === 'free' && !released && state === 'other') becomeOwner();
            else watchLease();
          });
        }
        return;
      }
      default:
        return;
    }
  }

  async function acquireWithChannel(): Promise<OwnershipState> {
    channel = channelFactory(name);
    if (!channel) {
      // No coordination primitive at all: single-tab assumption.
      setState('owner');
      return 'owner';
    }
    channel.onmessage = (event) => handleMessage(event.data);
    const result = await claim();
    if (released) return state;
    if (result === 'free') {
      becomeOwner();
      return 'owner';
    }
    lastHeartbeatAt = now();
    becomeOther();
    return 'other';
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  return {
    tabId,
    getState: () => state,
    acquire(): Promise<OwnershipState> {
      if (acquirePromise) return acquirePromise;
      acquirePromise = locks ? acquireWithLocks(locks) : acquireWithChannel();
      return acquirePromise;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    release(): void {
      if (released) return;
      released = true;
      stopHeartbeat();
      stopLeaseWatch();
      if (state === 'owner' && channel) post({ type: 'release', tabId });
      if (releaseHeldLock) {
        releaseHeldLock();
        releaseHeldLock = null;
      }
      if (channel) {
        channel.onmessage = null;
        channel.close();
        channel = null;
      }
      setState('other');
    },
  };
}
