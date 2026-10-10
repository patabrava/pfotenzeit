/**
 * Node-side GLB loading for the render checks (no DOM): parses a .glb from disk with GLTFLoader and
 * stubs the image element so textured files decode their PNG/JPEG dimensions (what the texture
 * memory estimate and colour-space checks need) without a browser. Dev/test only.
 */
import { readFile } from 'node:fs/promises';
import { resolveObjectURL } from 'node:buffer';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface FakeImage {
  width: number;
  height: number;
  src: string;
  addEventListener(type: string, listener: (this: FakeImage) => void): void;
  removeEventListener(type: string, listener: (this: FakeImage) => void): void;
  crossOrigin?: string;
}

function dimensionsOf(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // PNG: IHDR width/height at offset 16/20.
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) };
  // JPEG: scan for a SOF marker.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = bytes[i + 1] as number;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
      }
      i += 2 + view.getUint16(i + 2);
    }
  }
  return { width: 0, height: 0 };
}

function createFakeImage(): FakeImage {
  const listeners = new Map<string, Set<(this: FakeImage) => void>>();
  let src = '';
  const image: FakeImage = {
    width: 0,
    height: 0,
    get src() {
      return src;
    },
    set src(url: string) {
      src = url;
      void (async () => {
        try {
          const blob = url.startsWith('blob:') ? resolveObjectURL(url) : null;
          if (blob) {
            const dims = dimensionsOf(new Uint8Array(await blob.arrayBuffer()));
            image.width = dims.width;
            image.height = dims.height;
          }
          // three's ImageLoader reads the element through `this` in its listeners.
          for (const l of listeners.get('load') ?? []) l.call(image);
        } catch {
          for (const l of listeners.get('error') ?? []) l.call(image);
        }
      })();
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      (listeners.get(type) as Set<(this: FakeImage) => void>).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
  };
  return image;
}

let installed = false;
/** Installs the minimal `document.createElementNS('img')` stub three's ImageLoader needs. */
export function installImageStub(): void {
  if (installed) return;
  installed = true;
  const g = globalThis as { document?: { createElementNS(ns: string, name: string): unknown }; self?: unknown };
  // GLTFLoader reads `self.URL` for blob urls of embedded images.
  if (typeof g.self === 'undefined') g.self = globalThis;
  if (!g.document) {
    g.document = {
      createElementNS(_ns: string, name: string) {
        if (name === 'img') return createFakeImage();
        throw new Error(`createElementNS(${name}) not supported in the Node check`);
      },
    };
  }
}

/** Parses a GLB file from disk (textures decoded for size only). */
export async function loadGltfFromFile(path: string): Promise<GLTF> {
  installImageStub();
  const data = await readFile(path);
  const loader = new GLTFLoader();
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return loader.parseAsync(buffer, '');
}
