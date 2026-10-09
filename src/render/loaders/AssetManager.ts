/**
 * AssetManager (16 / 14 C): fetches the manifest, loads GLBs with GLTFLoader (no Draco/KTX2
 * decoders ship, so none are configured), validates them, clones rigged instances with
 * SkeletonUtils and releases GPU resources by reference count.
 *
 * GLB swapping rule: an asset is used only when manifest.assets[key].status is 'code-authored'
 * or 'final' AND it has a url AND the file loads and validates. Everything else (placeholder,
 * pending, missing file, invalid file) stays on the procedural tier and is logged once.
 */
import { Mesh, SkinnedMesh, type AnimationClip, type Material, type Object3D, type Texture } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AssetManifest, AssetManifestEntry } from '../types';

export interface LoadedAsset {
  key: string;
  scene: Object3D;
  clips: AnimationClip[];
  triangles: number;
  textureBytes: number;
  skinned: boolean;
  entry: AssetManifestEntry;
}

export interface ValidationRequirements {
  requireSkinned: boolean;
  /** Clip names that must exist in the file (e.g. the idle clip). */
  requiredClips: readonly string[];
}

export interface AssetManagerOptions {
  baseUrl: string;
  /** Test seam. */
  fetchManifest?: (url: string) => Promise<AssetManifest>;
  loadGltf?: (url: string) => Promise<GLTF>;
}

export interface AssetManager {
  loadManifest(): Promise<AssetManifest | null>;
  entry(key: string): AssetManifestEntry | undefined;
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

function textureBytesOf(textures: Set<Texture>): number {
  let bytes = 0;
  for (const texture of textures) {
    const image = texture.image as { width?: number; height?: number } | undefined;
    const w = image?.width ?? 0;
    const h = image?.height ?? 0;
    bytes += w * h * 4 * (texture.generateMipmaps ? 4 / 3 : 1);
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

  const manager: AssetManager = {
    loadManifest() {
      manifestPromise ??= fetchManifest(`${base}assets/manifest.json`)
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
    isUsable(key) {
      const e = manifest?.assets[key];
      return Boolean(e && e.url && (e.status === 'code-authored' || e.status === 'final'));
    },
    load(key, requirements) {
      const existing = loads.get(key);
      if (existing) return existing;
      const promise = (async (): Promise<LoadedAsset | null> => {
        await manager.loadManifest();
        const entry = manifest?.assets[key];
        if (!entry || !entry.url) return null;
        if (entry.status !== 'code-authored' && entry.status !== 'final') return null;
        try {
          const url = entry.url.startsWith('http') || entry.url.startsWith('/') ? entry.url : `${base}${entry.url}`;
          const gltf = await loadGltf(url);
          let skinned = false;
          gltf.scene.traverse((node) => {
            if (node instanceof SkinnedMesh) skinned = true;
          });
          if (requirements.requireSkinned && !skinned) throw new Error('no SkinnedMesh');
          const clipNames = new Set(gltf.animations.map((c) => c.name));
          for (const name of requirements.requiredClips) {
            if (!clipNames.has(name)) throw new Error(`clip "${name}" missing`);
          }
          const missingDeclared = entry.clips.filter((name) => !clipNames.has(name));
          if (missingDeclared.length > 0) throw new Error(`manifest clips missing in file: ${missingDeclared.join(', ')}`);
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
            clips: gltf.animations,
            triangles: countTriangles(gltf.scene),
            textureBytes: textureBytesOf(collectTextures(gltf.scene)),
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
