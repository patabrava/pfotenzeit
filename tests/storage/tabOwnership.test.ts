import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTabOwnership, type ChannelLike, type LockManagerLike } from '../../src/storage/tabOwnership';

/** In-memory BroadcastChannel bus: messages reach every other channel with the same name asynchronously. */
function createBus() {
  const channels = new Map<string, Set<ChannelLike>>();
  const muted = new Set<ChannelLike>();
  const created: ChannelLike[] = [];
  return {
    created,
    /** Simulates a tab that died without a release message: its posts no longer reach anyone. */
    mute(channel: ChannelLike) {
      muted.add(channel);
    },
    factory(name: string): ChannelLike {
      const set = channels.get(name) ?? new Set<ChannelLike>();
      channels.set(name, set);
      const channel: ChannelLike = {
        onmessage: null,
        postMessage(message) {
          if (muted.has(channel)) return;
          for (const other of set) {
            if (other === channel) continue;
            setTimeout(() => other.onmessage?.({ data: structuredClone(message) }), 0);
          }
        },
        close() {
          set.delete(channel);
        },
      };
      set.add(channel);
      created.push(channel);
      return channel;
    },
  };
}

/** Minimal Web Locks stand-in: one exclusive lock per name, FIFO queue. */
function createLocks(): LockManagerLike {
  const held = new Map<string, Promise<void>>();
  const queues = new Map<string, Array<() => void>>();
  return {
    async request(name, options, callback) {
      if (held.has(name)) {
        if (options.ifAvailable) return callback(null);
        await new Promise<void>((resolve) => {
          const queue = queues.get(name) ?? [];
          queue.push(resolve);
          queues.set(name, queue);
        });
      }
      let release!: () => void;
      const holding = new Promise<void>((resolve) => {
        release = resolve;
      });
      held.set(name, holding);
      try {
        return await callback({ name, mode: 'exclusive' });
      } finally {
        held.delete(name);
        release();
        const next = queues.get(name)?.shift();
        next?.();
      }
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('tab ownership – BroadcastChannel fallback', () => {
  it('first instance becomes owner, second resolves other', async () => {
    const bus = createBus();
    const first = createTabOwnership({ locks: null, channelFactory: bus.factory, tabId: 'a', claimWaitMs: 100, heartbeatMs: 200 });
    const firstPromise = first.acquire();
    await vi.advanceTimersByTimeAsync(150);
    expect(await firstPromise).toBe('owner');

    const second = createTabOwnership({ locks: null, channelFactory: bus.factory, tabId: 'b', claimWaitMs: 100, heartbeatMs: 200 });
    const secondPromise = second.acquire();
    await vi.advanceTimersByTimeAsync(150);
    expect(await secondPromise).toBe('other');
    expect(first.getState()).toBe('owner');
    first.release();
    second.release();
  });

  it('second instance takes over after the owner releases, and listeners are notified', async () => {
    const bus = createBus();
    const first = createTabOwnership({ locks: null, channelFactory: bus.factory, tabId: 'a', claimWaitMs: 100, heartbeatMs: 200 });
    const p1 = first.acquire();
    await vi.advanceTimersByTimeAsync(150);
    await p1;
    const second = createTabOwnership({ locks: null, channelFactory: bus.factory, tabId: 'b', claimWaitMs: 100, heartbeatMs: 200 });
    const p2 = second.acquire();
    await vi.advanceTimersByTimeAsync(150);
    expect(await p2).toBe('other');
    const states: string[] = [];
    second.onChange((state) => states.push(state));
    first.release();
    await vi.advanceTimersByTimeAsync(300);
    expect(second.getState()).toBe('owner');
    expect(states).toEqual(['owner']);
    second.release();
  });

  it('takes over when the owner stops heartbeating past the lease', async () => {
    const bus = createBus();
    const first = createTabOwnership({ locks: null, channelFactory: bus.factory, tabId: 'a', claimWaitMs: 100, heartbeatMs: 200, leaseMs: 800 });
    const p1 = first.acquire();
    await vi.advanceTimersByTimeAsync(150);
    await p1;
    const second = createTabOwnership({ locks: null, channelFactory: bus.factory, tabId: 'b', claimWaitMs: 100, heartbeatMs: 200, leaseMs: 800 });
    const p2 = second.acquire();
    await vi.advanceTimersByTimeAsync(150);
    expect(await p2).toBe('other');
    // While heartbeats flow, no takeover.
    await vi.advanceTimersByTimeAsync(2000);
    expect(second.getState()).toBe('other');
    // Owner tab dies silently (no release message, no heartbeats).
    bus.mute(bus.created[0]!);
    await vi.advanceTimersByTimeAsync(2000);
    expect(second.getState()).toBe('owner');
    first.release();
    second.release();
  });

  it('two simultaneous claims resolve to exactly one owner', async () => {
    const bus = createBus();
    const a = createTabOwnership({ locks: null, channelFactory: bus.factory, tabId: 'a', claimWaitMs: 100, heartbeatMs: 200 });
    const b = createTabOwnership({ locks: null, channelFactory: bus.factory, tabId: 'b', claimWaitMs: 100, heartbeatMs: 200 });
    const pa = a.acquire();
    const pb = b.acquire();
    await vi.advanceTimersByTimeAsync(300);
    const results = [await pa, await pb].sort();
    expect(results).toEqual(['other', 'owner']);
    expect(a.getState()).toBe('owner');
    expect(b.getState()).toBe('other');
    a.release();
    b.release();
  });

  it('without any coordination primitive resolves owner', async () => {
    const solo = createTabOwnership({ locks: null, channelFactory: () => null });
    expect(await solo.acquire()).toBe('owner');
  });
});

describe('tab ownership – Web Locks', () => {
  it('holds the lock for the page lifetime; second tab resolves other and is promoted on release', async () => {
    const locks = createLocks();
    const first = createTabOwnership({ locks, channelFactory: () => null });
    expect(await first.acquire()).toBe('owner');
    const second = createTabOwnership({ locks, channelFactory: () => null });
    const states: string[] = [];
    second.onChange((state) => states.push(state));
    expect(await second.acquire()).toBe('other');
    expect(states).toEqual(['other']);
    first.release();
    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();
    expect(second.getState()).toBe('owner');
    expect(states).toEqual(['other', 'owner']);
    second.release();
  });

  it('acquire is idempotent', async () => {
    const locks = createLocks();
    const own = createTabOwnership({ locks, channelFactory: () => null });
    const a = own.acquire();
    const b = own.acquire();
    expect(a).toBe(b);
    expect(await a).toBe('owner');
    own.release();
  });
});
