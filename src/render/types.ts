/**
 * Renderer contract. The renderer projects domain state; it never owns progression or health.
 * Implemented in src/render/app/GameRenderer.ts (WP-D). Consumed by ui/ and app/.
 */
import type { DomainEffect, QualityTier, SceneDirective } from '../simulation/types';

export type RendererStatus = 'idle' | 'loading' | 'ready' | 'failed' | 'contextLost';

export interface RendererOptions {
  /** Resolved base for public assets, e.g. import.meta.env.BASE_URL. */
  baseUrl: string;
  /** Initial quality preference. */
  qualityTier: QualityTier;
  reducedMotion: boolean;
}

export interface PresentOptions {
  /** Upper bound in ms; the promise always resolves by then (fallback pose). */
  maxDurationMs: number;
  reducedMotion: boolean;
}

export interface RendererHandle {
  /** Creates the WebGL context inside container. Resolves even on failure (status 'failed'). */
  mount(container: HTMLElement): Promise<RendererStatus>;
  /** Idempotent: diff against the last directive, update poses/props/camera. Must not run timers when nothing changes. */
  apply(directive: SceneDirective): void;
  /**
   * Show an already-committed effect (care animation, reaction, reward, growth).
   * Resolves at the defined animation event or after maxDurationMs; never rejects.
   * Must not trigger any domain change.
   */
  present(effect: DomainEffect, options: PresentOptions): Promise<void>;
  /** true: render on demand with animations; false: stop the loop (profile, hidden, paused). */
  setActive(active: boolean): void;
  setReducedMotion(reduced: boolean): void;
  setQuality(tier: QualityTier): void;
  /** Request one frame (after resize, directive change, etc.). At most one rAF is pending. */
  invalidate(): void;
  getStatus(): RendererStatus;
  onStatus(listener: (status: RendererStatus) => void): () => void;
  /** Diagnostics for PROGRESS.md and the debug panel. */
  getMetrics(): RendererMetrics;
  dispose(): void;
}

export interface RendererMetrics {
  drawCalls: number;
  triangles: number;
  fpsEstimate: number;
  dpr: number;
  textureBytesEstimate: number;
  /** 'procedural' | 'glb' per character id. */
  assetTiers: Record<string, 'procedural' | 'glb'>;
}

/** Asset manifest format (16_ASSET_PRODUCTION). public/assets/manifest.json */
export type AssetStatus = 'placeholder' | 'code-authored' | 'pending' | 'final';

export interface AssetManifestEntry {
  url: string | null;
  status: AssetStatus;
  bytes: number | null;
  triangles: number | null;
  clips: string[];
  textureSizes: number[];
  boundsMeters: [number, number, number] | null;
  source: string;
  license: string;
  version?: number;
}

export interface AssetManifest {
  version: number;
  generatedUTC?: string;
  assets: Record<string, AssetManifestEntry>;
}
