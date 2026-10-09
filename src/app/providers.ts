/**
 * Real providers: wall clock (UTC) for offline accounting, monotonic clock for active time, ids, seeds.
 */
import type { Providers } from '../simulation/types';

export function createBrowserProviders(): Providers {
  const hasUUID = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function';
  let fallbackCounter = 0;
  return {
    nowUTC: () => Date.now(),
    monotonic: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    id: (prefix = 'id') => {
      if (hasUUID) return `${prefix}_${crypto.randomUUID()}`;
      fallbackCounter += 1;
      return `${prefix}_${Date.now().toString(36)}_${fallbackCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    },
    seed: () => {
      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const buffer = new Uint32Array(1);
        crypto.getRandomValues(buffer);
        return buffer[0] ?? 0;
      }
      return Math.floor(Math.random() * 0xffffffff);
    },
  };
}
