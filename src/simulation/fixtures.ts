/**
 * Deterministic providers and demo saves for tests and UI development. Not shipped in gameplay paths.
 */
import { createNewSave } from './save';
import type { Providers, Save } from './types';

export function createTestProviders(startUTC = Date.UTC(2026, 9, 9, 9, 0, 0)): Providers & {
  advanceUTC(ms: number): void;
  advanceMonotonic(ms: number): void;
} {
  let now = startUTC;
  let mono = 0;
  let counter = 0;
  return {
    nowUTC: () => now,
    monotonic: () => mono,
    id: (prefix = 'id') => `${prefix}_${(++counter).toString(36).padStart(4, '0')}`,
    seed: () => (++counter * 7919) % 100_000,
    advanceUTC: (ms) => {
      now += ms;
    },
    advanceMonotonic: (ms) => {
      mono += ms;
    },
  };
}

export function createDemoSave(overrides: Partial<Save> = {}): Save {
  const providers = createTestProviders();
  const base = createNewSave('standard', providers, providers.nowUTC());
  return { ...base, ...overrides };
}
