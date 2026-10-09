/**
 * Diagnostics helpers: boot timing marks, FPS sampling, memory snapshot. Safe without a DOM.
 */

const hasPerformance = typeof performance !== 'undefined' && typeof performance.mark === 'function';

export const BOOT_MARKS = {
  start: 'boot:start',
  storage: 'boot:storage',
  ownership: 'boot:ownership',
  save: 'boot:save',
  store: 'boot:store',
  ui: 'boot:ui',
  renderer: 'boot:renderer',
} as const;

export type BootMark = (typeof BOOT_MARKS)[keyof typeof BOOT_MARKS];

export function mark(name: BootMark | string): void {
  if (!hasPerformance) return;
  try {
    performance.mark(name);
  } catch {
    // ignore (duplicate names are allowed, but some engines throw on reserved names)
  }
}

export function markTime(name: string): number | null {
  if (!hasPerformance || typeof performance.getEntriesByName !== 'function') return null;
  const entries = performance.getEntriesByName(name, 'mark');
  const last = entries[entries.length - 1];
  return last ? last.startTime : null;
}

/** Milliseconds from boot:start to each later mark (null when the mark is missing). */
export function getBootTimings(): Record<string, number | null> {
  const start = markTime(BOOT_MARKS.start);
  const out: Record<string, number | null> = {};
  for (const name of Object.values(BOOT_MARKS)) {
    if (name === BOOT_MARKS.start) continue;
    const t = markTime(name);
    out[name] = start !== null && t !== null ? Math.round(t - start) : null;
  }
  const navStart = hasPerformance && typeof performance.timeOrigin === 'number' ? 0 : null;
  out['navigation→boot:start'] = start !== null && navStart !== null ? Math.round(start) : null;
  return out;
}

export interface FpsSampler {
  start(): void;
  stop(): void;
  /** Frames per second over the last window (0 until enough samples). */
  fps(): number;
  running(): boolean;
}

/** requestAnimationFrame-based sampler. Only for diagnostics; the renderer renders on demand. */
export function createFpsSampler(windowSize = 60): FpsSampler {
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
  const caf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null;
  const stamps: number[] = [];
  let handle: number | null = null;
  let active = false;

  function frame(now: number): void {
    if (!active) return;
    stamps.push(now);
    if (stamps.length > windowSize) stamps.shift();
    handle = raf ? raf(frame) : null;
  }

  return {
    start() {
      if (active || !raf) return;
      active = true;
      stamps.length = 0;
      handle = raf(frame);
    },
    stop() {
      active = false;
      if (handle !== null && caf) caf(handle);
      handle = null;
    },
    fps() {
      if (stamps.length < 2) return 0;
      const first = stamps[0] ?? 0;
      const last = stamps[stamps.length - 1] ?? 0;
      const seconds = (last - first) / 1000;
      return seconds > 0 ? Math.round(((stamps.length - 1) / seconds) * 10) / 10 : 0;
    },
    running: () => active,
  };
}

export interface MemorySnapshot {
  usedJSHeapMB: number;
  totalJSHeapMB: number;
  limitMB: number;
}

/** Chrome-only `performance.memory`; null elsewhere. */
export function memorySnapshot(): MemorySnapshot | null {
  if (!hasPerformance) return null;
  const memory = (performance as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  if (!memory) return null;
  const mb = (bytes: number) => Math.round((bytes / 1_048_576) * 10) / 10;
  return { usedJSHeapMB: mb(memory.usedJSHeapSize), totalJSHeapMB: mb(memory.totalJSHeapSize), limitMB: mb(memory.jsHeapSizeLimit) };
}

/** navigator.storage.estimate() when available (quota diagnostics). */
export async function storageEstimate(): Promise<{ usageMB: number; quotaMB: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.estimate !== 'function') return null;
  try {
    const estimate = await navigator.storage.estimate();
    const mb = (bytes: number | undefined) => Math.round(((bytes ?? 0) / 1_048_576) * 10) / 10;
    return { usageMB: mb(estimate.usage), quotaMB: mb(estimate.quota) };
  } catch {
    return null;
  }
}
