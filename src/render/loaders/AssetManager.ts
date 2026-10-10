/**
 * AssetManager (16 / 14 C): fetches the manifest, loads GLBs with GLTFLoader (no Draco/KTX2
 * decoders ship, so none are configured), validates them, clones rigged instances with
 * SkeletonUtils and releases GPU resources by reference count.
 *
 * GLB swapping rule: an asset is used only when manifest.assets[key].status is 'code-authored'
 * or 'final' AND it has a url AND the file loads and validates. Everything else (placeholder,
 * pending, missing file, invalid file) stays on the procedural tier and is logged once.
 */
import { Mesh, NoColorSpace, SRGBColorSpace, SkinnedMesh, type AnimationClip, type Material, type Object3D, type Texture } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AssetManifest, AssetManifestEntry } from '../types';

/** Clip metadata (08 / 16): loop flag and named events in seconds from the clip start. */
export interface ClipMeta {
  loop?: boolean;
  events?: Record<string, number>;
}

/**
 * Textured asset contract (D-036, field names per D-038) lives in AssetManifestEntry: absent
 * `material` = 'vertex', absent `rig` = 'project', absent `clipMap` = identity.
 */
export type ExtendedManifestEntry = AssetManifestEntry;

/** Draw-call acceptance per asset (D-036): characters ≤ 3 primitives, environment / prop sets ≤ 12. */
export const DRAW_CALL_LIMITS = { character: 3, environment: 12 } as const;

export interface LoadedAsset {
  key: string;
  scene: Object3D;
  /** Clips renamed to their semantic names (clipMap applied). */
  clips: AnimationClip[];
  triangles: number;
  textureBytes: number;
  /** Mesh primitives = draw calls per instance. */
  drawCalls: number;
  skinned: boolean;
  entry: ExtendedManifestEntry;
}

export interface ValidationRequirements {
  requireSkinned: boolean;
  /** Clip names that must exist in the file (e.g. the idle clip). */
  requiredClips: readonly string[];
}

export interface AssetManagerOptions {
  baseUrl: string;
  /**
   * Manifest location override (dev harness `?manifest=`); default `${baseUrl}assets/manifest.json`.
   * Relative asset urls in an override manifest resolve against the manifest's directory.
   */
  manifestUrl?: string;
  /** Dev only: also use entries with status 'pending' (staged candidates). */
  acceptPending?: boolean;
  /** Texture anisotropy cap for textured assets (≤ 4 on the low tier). */
  maxAnisotropy?: number;
  /** Test seam. */
  fetchManifest?: (url: string) => Promise<AssetManifest>;
  loadGltf?: (url: string) => Promise<GLTF>;
}

export interface AssetManager {
  loadManifest(): Promise<AssetManifest | null>;
  entry(key: string): ExtendedManifestEntry | undefined;
  /** Clip metadata for a semantic clip name, when the manifest declares it. */
  clipMeta(key: string, clip: string): ClipMeta | undefined;
  /** Loaded asset record (metrics, dev panels). */
  loaded(key: string): LoadedAsset | undefined;
  /** True when the manifest marks the asset as usable (code-authored / final with a url). */
  isUsable(key: string): boolean;
  load(key: string, requirements: ValidationRequirements): Promise<LoadedAsset | null>;
  /** New instance (SkeletonUtils clone for rigs); increments the reference count. */
  instantiate(key: string): Object3D | null;
  release(key: string): void;
  loadedKeys(): string[];
  textureBytes(): number;
  dispose(): void;
}

function normaliseBase(baseUrl: string): string {
  if (!baseUrl) return './';
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function countTriangles(object: Object3D): number {
  let triangles = 0;
  object.traverse((node) => {
    if (node instanceof Mesh) {
      const geometry = node.geometry;
      const index = geometry.getIndex();
      const position = geometry.getAttribute('position');
      if (index) triangles += index.count / 3;
      else if (position) triangles += position.count / 3;
    }
  });
  return triangles;
}

/** Mesh primitives = draw calls when instantiated (multi-material meshes count per group). */
function countDrawCalls(object: Object3D): number {
  let calls = 0;
  object.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    calls += Array.isArray(node.material) ? Math.max(1, node.material.length) : 1;
  });
  return calls;
}

const SRGB_SLOTS = new Set(['map', 'emissiveMap', 'sheenColorMap', 'specularColorMap']);

/**
 * Textured materials (D-036): base colour / emissive are sRGB, every data map stays linear;
 * `side` is taken from the file (never forced), anisotropy capped per tier.
 */
function conformTextures(object: Object3D, maxAnisotropy: number): void {
  object.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const materials: Material[] = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      const record = material as unknown as Record<string, unknown>;
      for (const [slot, value] of Object.entries(record)) {
        if (!value || typeof value !== 'object' || !(value as Texture).isTexture) continue;
        const texture = value as Texture;
        texture.colorSpace = SRGB_SLOTS.has(slot) ? SRGBColorSpace : NoColorSpace;
        if (texture.anisotropy > maxAnisotropy) texture.anisotropy = maxAnisotropy;
      }
    }
  });
}

/** Rename file clips to semantic names via clipMap (identity when absent). */
function applyClipMap(clips: AnimationClip[], clipMap: Record<string, string> | undefined): AnimationClip[] {
  if (!clipMap) return clips;
  const byFileName = new Map(clips.map((c) => [c.name, c]));
  const out: AnimationClip[] = [];
  const used = new Set<AnimationClip>();
  for (const [semantic, fileName] of Object.entries(clipMap)) {
    const clip = byFileName.get(fileName);
    if (!clip) continue;
    const renamed = used.has(clip) ? clip.clone() : clip;
    used.add(clip);
    renamed.name = semantic;
    out.push(renamed);
  }
  for (const clip of clips) if (!used.has(clip)) out.push(clip);
  return out;
}

function collectTextures(object: Object3D): Set<Texture> {
  const textures = new Set<Texture>();
  object.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const materials: Material[] = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      for (const value of Object.values(material as unknown as Record<string, unknown>)) {
        if (value && typeof value === 'object' && (value as Texture).isTexture) textures.add(value as Texture);
      }
    }
  });
  return textures;
}

/** Decoded GPU memory estimate: w·h·4 bytes plus the mip chain (×1.33) per loaded texture. */
function textureBytesOf(textures: Set<Texture>): number {
  let bytes = 0;
  for (const texture of textures) {
    const image = texture.image as { width?: number; height?: number } | undefined;
    const w = image?.width ?? 0;
    const h = image?.height ?? 0;
    bytes += w * h * 4 * 1.33;
  }
  return Math.round(bytes);
}

function disposeObject(object: Object3D): void {
  const textures = collectTextures(object);
  object.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
    const materials: Material[] = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) material.dispose();
    if (node instanceof SkinnedMesh) node.skeleton.dispose();
  });
  for (const texture of textures) texture.dispose();
}

export function createAssetManager(options: AssetManagerOptions): AssetManager {
  const base = normaliseBase(options.baseUrl);
  let manifestPromise: Promise<AssetManifest | null> | null = null;
  let manifest: AssetManifest | null = null;
  const loads = new Map<string, Promise<LoadedAsset | null>>();
  const loaded = new Map<string, LoadedAsset>();
  const refs = new Map<string, number>();
  const warned = new Set<string>();
  let loader: GLTFLoader | null = null;

  const warnOnce = (key: string, message: string): void => {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[render] asset ${key}: ${message} → procedural tier`);
  };

  const fetchManifest =
    options.fetchManifest ??
    (async (url: string): Promise<AssetManifest> => {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as AssetManifest;
    });

  const loadGltf =
    options.loadGltf ??
    ((url: string): Promise<GLTF> => {
      loader ??= new GLTFLoader();
      return loader.loadAsync(url);
    });

  const manifestUrl = options.manifestUrl ?? `${base}assets/manifest.json`;
  const assetBase = options.manifestUrl ? manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1) : base;
  const maxAnisotropy = options.maxAnisotropy ?? 4;
  const usableStatus = (status: string): boolean => status === 'code-authored' || status === 'final' || (Boolean(options.acceptPending) && status === 'pending');

  const manager: AssetManager = {
    loadManifest() {
      manifestPromise ??= fetchManifest(manifestUrl)
        .then((m) => {
          if (!m || typeof m !== 'object' || typeof m.assets !== 'object') throw new Error('invalid manifest shape');
          manifest = m;
          return m;
        })
        .catch((error: unknown) => {
          warnOnce('manifest', `not loaded (${error instanceof Error ? error.message : String(error)})`);
          manifest = null;
          return null;
        });
      return manifestPromise;
    },
    entry(key) {
      return manifest?.assets[key];
    },
    clipMeta(key, clip) {
      const meta = manifest?.assets[key]?.clipMeta?.[clip];
      if (!meta) return undefined;
      const events = meta.events && typeof meta.events === 'object' ? (meta.events as Record<string, unknown>) : undefined;
      const numeric: Record<string, number> = {};
      for (const [name, at] of Object.entries(events ?? {})) if (typeof at === 'number') numeric[name] = at;
      return { loop: meta.loop, events: numeric };
    },
    loaded(key) {
      return loaded.get(key);
    },
    isUsable(key) {
      const e = manifest?.assets[key];
      return Boolean(e && e.url && usableStatus(e.status));
    },
    load(key, requirements) {
      const existing = loads.get(key);
      if (existing) return existing;
      const promise = (async (): Promise<LoadedAsset | null> => {
        await manager.loadManifest();
        const entry = manifest?.assets[key];
        if (!entry || !entry.url) return null;
        if (!usableStatus(entry.status)) return null;
        try {
          const url = entry.url.startsWith('http') || entry.url.startsWith('/') ? entry.url : `${assetBase}${entry.url}`;
          const gltf = await loadGltf(url);
          let skinned = false;
          gltf.scene.traverse((node) => {
            if (node instanceof SkinnedMesh) skinned = true;
          });
          if (requirements.requireSkinned && !skinned) throw new Error('no SkinnedMesh');
          // Vendor rigs (D-036): semantic clip names resolve through clipMap before the file check.
          const clips = applyClipMap(gltf.animations, entry.clipMap);
          const clipNames = new Set(clips.map((c) => c.name));
          for (const name of requirements.requiredClips) {
            if (!clipNames.has(name)) throw new Error(`clip "${name}" missing`);
          }
          const missingDeclared = (entry.clips ?? []).filter((name) => !clipNames.has(name));
          if (missingDeclared.length > 0) throw new Error(`manifest clips missing in file: ${missingDeclared.join(', ')}`);
          const drawCalls = countDrawCalls(gltf.scene);
          const limit = requirements.requireSkinned || key.startsWith('dog.') || key.startsWith('human.') ? DRAW_CALL_LIMITS.character : DRAW_CALL_LIMITS.environment;
          if (drawCalls > limit) throw new Error(`${drawCalls} draw calls > ${limit}`);
          const textures = collectTextures(gltf.scene);
          if ((entry.material ?? 'vertex') === 'textured' || textures.size > 0) conformTextures(gltf.scene, maxAnisotropy);
          gltf.scene.traverse((node) => {
            if (node instanceof Mesh) {
              node.castShadow = true;
              node.receiveShadow = false;
              if (node instanceof SkinnedMesh) node.frustumCulled = false;
            }
          });
          const asset: LoadedAsset = {
            key,
            scene: gltf.scene,
            clips,
            triangles: countTriangles(gltf.scene),
            textureBytes: textureBytesOf(textures),
            drawCalls,
            skinned,
            entry,
          };
          loaded.set(key, asset);
          return asset;
        } catch (error) {
          warnOnce(key, `load/validation failed (${error instanceof Error ? error.message : String(error)})`);
          return null;
        }
      })();
      loads.set(key, promise);
      return promise;
    },
    instantiate(key) {
      const asset = loaded.get(key);
      if (!asset) return null;
      refs.set(key, (refs.get(key) ?? 0) + 1);
      return asset.skinned ? cloneSkeleton(asset.scene) : asset.scene.clone(true);
    },
    release(key) {
      const count = (refs.get(key) ?? 0) - 1;
      if (count > 0) {
        refs.set(key, count);
        return;
      }
      refs.delete(key);
      const asset = loaded.get(key);
      if (asset) {
        disposeObject(asset.scene);
        loaded.delete(key);
        loads.delete(key);
      }
    },
    loadedKeys() {
      return [...loaded.keys()];
    },
    textureBytes() {
      let bytes = 0;
      for (const asset of loaded.values()) bytes += asset.textureBytes;
      return bytes;
    },
    dispose() {
      for (const asset of loaded.values()) disposeObject(asset.scene);
      loaded.clear();
      loads.clear();
      refs.clear();
    },
  };
  return manager;
}
