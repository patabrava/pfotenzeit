/**
 * Renderer contract. The renderer projects domain state; it never owns progression or health.
 * Implemented in src/render/app/GameRenderer.ts (WP-D). Consumed by ui/ and app/.
 */
import type { DomainEffect, QualityTier, SceneDirective, WorldActorKey, WorldDirective, YardPoint } from '../simulation/types';

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
  /**
   * D-041 yard mode. Per-step update of actor positions/speeds while `apply()` carried view 'yard'.
   * Cheap: no structural changes; keeps rendering continuous while any actor moves, then returns to demand mode.
   */
  updateWorld?(world: WorldDirective): void;
  /** D-041: hit test in client pixels against the yard ground, actors and prompt zones. null when not in yard view. */
  pick?(clientX: number, clientY: number): PickResult | null;
  getStatus(): RendererStatus;
  onStatus(listener: (status: RendererStatus) => void): () => void;
  /** Diagnostics for PROGRESS.md and the debug panel. */
  getMetrics(): RendererMetrics;
  dispose(): void;
}

export type PickResult =
  | { kind: 'ground'; point: YardPoint }
  | { kind: 'actor'; actor: WorldActorKey; point: YardPoint }
  | { kind: 'zone'; zoneId: string; point: YardPoint };

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
  /** Legacy: max side per texture. Kept for existing consumers; `textures` is the D-036 form. */
  textureSizes: number[];
  boundsMeters: [number, number, number] | null;
  source: string;
  license: string;
  version?: number;
  /** D-036 textured contract (D-038 field names). Absent means 'vertex'. */
  material?: 'vertex' | 'textured';
  textures?: AssetTextureInfo[];
  /** Primitives × materials; absent means 1. */
  drawCalls?: number;
  /** Absent means 'project'. Vendor rigs need `clipMap`. */
  rig?: 'project' | 'vendor';
  rigInfo?: { joints: number; maxInfluences: number; root: string };
  /** Semantic clip name → animation name in the file. Absent means identity. */
  clipMap?: Record<string, string>;
  /** Animation names actually present in the file. */
  sourceClips?: string[];
  missingClips?: string[];
  productionIntegrated?: boolean;
  clipMeta?: Record<string, { durationS?: number; loop?: boolean; events?: unknown; source?: string }>;
  measuredShoulderHeightM?: number;
  measuredHeightM?: number;
}

export type AssetTextureSlot = 'baseColor' | 'normal' | 'metallicRoughness' | 'occlusion' | 'emissive';

export interface AssetTextureInfo {
  slot: AssetTextureSlot;
  width: number;
  height: number;
  bytes: number;
  mime: 'image/png' | 'image/jpeg';
}

export interface AssetManifest {
  version: number;
  generatedUTC?: string;
  assets: Record<string, AssetManifestEntry>;
}
