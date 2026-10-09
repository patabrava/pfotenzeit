/**
 * Resize and DPR policy (14 C): ResizeObserver on the scene container; CSS size, frustum and
 * drawing buffer stay in sync. DPR 1–1.5 on the low tier, ≤2 on high; never the raw
 * devicePixelRatio unchecked.
 */
import type { QualityTier } from '../../simulation/types';

export type ResolvedTier = 'low' | 'high';

export function resolveTier(tier: QualityTier): ResolvedTier {
  if (tier !== 'auto') return tier;
  if (typeof navigator === 'undefined') return 'low';
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (cores <= 4 || memory <= 4 || coarse) return 'low';
  return 'high';
}

export function pixelRatioFor(tier: ResolvedTier, devicePixelRatio: number): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const cap = tier === 'low' ? 1.5 : 2;
  return Math.min(cap, Math.max(1, dpr));
}

export interface ResizeTarget {
  (width: number, height: number): void;
}

export interface Resizer {
  /** Measure now and notify. */
  measure(): void;
  dispose(): void;
}

export function observeSize(container: HTMLElement, onSize: ResizeTarget): Resizer {
  let lastW = -1;
  let lastH = -1;
  const measure = (): void => {
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || container.clientWidth || 1));
    const h = Math.max(1, Math.round(rect.height || container.clientHeight || 1));
    if (w === lastW && h === lastH) return;
    lastW = w;
    lastH = h;
    onSize(w, h);
  };
  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => measure());
    observer.observe(container);
  } else if (typeof window !== 'undefined') {
    window.addEventListener('resize', measure);
  }
  measure();
  return {
    measure,
    dispose() {
      observer?.disconnect();
      if (typeof window !== 'undefined') window.removeEventListener('resize', measure);
    },
  };
}
