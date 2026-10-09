/**
 * Tiny CPU rasterizer for dev checks without a GPU: renders the scene through the ortho camera
 * (CPU skinning for SkinnedMesh, vertex colours, Lambert key + hemisphere fill) to a PNG.
 * Only for visual verification in Node; never shipped.
 */
import { deflateSync } from 'node:zlib';
import { Color, Mesh, Points, SkinnedMesh, Vector3, type BufferAttribute, type Camera, type Object3D } from 'three';

export interface SoftRenderOptions {
  width: number;
  height: number;
  background: string;
  keyDirection?: Vector3;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i] as number;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)], 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', new Uint8Array(deflateSync(raw))),
    pngChunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const srgb = (x: number): number => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

export function softRender(root: Object3D, camera: Camera, options: SoftRenderOptions): Uint8Array {
  const { width, height } = options;
  const rgb = new Uint8Array(width * height * 3);
  const depth = new Float32Array(width * height).fill(Infinity);
  const bg = new Color(options.background);
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = Math.round(srgb(bg.r) * 255);
    rgb[i * 3 + 1] = Math.round(srgb(bg.g) * 255);
    rgb[i * 3 + 2] = Math.round(srgb(bg.b) * 255);
  }
  const keyDir = (options.keyDirection ?? new Vector3(3.5, 6.5, 4.5)).clone().normalize();
  root.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  (camera as { updateProjectionMatrix?: () => void }).updateProjectionMatrix?.();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const n = new Vector3();
  const e1 = new Vector3();
  const e2 = new Vector3();
  const col = new Color();

  root.traverse((node) => {
    if (node instanceof Points) return;
    if (!(node instanceof Mesh)) return;
    if (node.name === 'contact_shadow') return; // textured blob: not representable without sampling
    let p: Object3D | null = node;
    while (p) {
      if (!p.visible) return;
      p = p.parent;
    }
    const geometry = node.geometry;
    const position = geometry.getAttribute('position') as BufferAttribute | undefined;
    if (!position) return;
    const colors = geometry.getAttribute('color') as BufferAttribute | undefined;
    const material = (Array.isArray(node.material) ? node.material[0] : node.material) as { color?: Color; opacity?: number; transparent?: boolean };
    const base = material.color ?? new Color('#ffffff');
    const alpha = material.transparent ? (material.opacity ?? 1) : 1;
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    const skinned = node instanceof SkinnedMesh;
    if (skinned) (node as SkinnedMesh).skeleton.update();
    const world = (i: number, out: Vector3): Vector3 => {
      out.fromBufferAttribute(position, i);
      if (skinned) (node as SkinnedMesh).applyBoneTransform(i, out);
      return out.applyMatrix4(node.matrixWorld);
    };
    const vertexIndex = (i: number): number => (index ? (index.getX(i) as number) : i);
    for (let t = 0; t < count; t += 3) {
      const ia = vertexIndex(t);
      const ib = vertexIndex(t + 1);
      const ic = vertexIndex(t + 2);
      world(ia, a);
      world(ib, b);
      world(ic, c);
      e1.subVectors(b, a);
      e2.subVectors(c, a);
      n.crossVectors(e1, e2);
      if (n.lengthSq() === 0) continue;
      n.normalize();
      // Lambert key + hemisphere fill, same budget as the real scene (key 2.2 + fill 1.1 over π).
      const key = Math.max(0, n.dot(keyDir)) * 2.2;
      const fill = (0.5 + 0.5 * n.y) * 1.1;
      const light = Math.min(1, (key + fill) / Math.PI);
      if (colors) col.setRGB((colors.getX(ia) + colors.getX(ib) + colors.getX(ic)) / 3, (colors.getY(ia) + colors.getY(ib) + colors.getY(ic)) / 3, (colors.getZ(ia) + colors.getZ(ib) + colors.getZ(ic)) / 3);
      else col.copy(base);
      const r = srgb(Math.min(1, col.r * light));
      const g = srgb(Math.min(1, col.g * light));
      const bl = srgb(Math.min(1, col.b * light));
      a.project(camera);
      b.project(camera);
      c.project(camera);
      const ax = ((a.x + 1) / 2) * width;
      const ay = ((1 - a.y) / 2) * height;
      const bx = ((b.x + 1) / 2) * width;
      const by = ((1 - b.y) / 2) * height;
      const cx = ((c.x + 1) / 2) * width;
      const cy = ((1 - c.y) / 2) * height;
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
      if (minX > maxX || minY > maxY) continue;
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(area) < 1e-9) continue;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
          const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * a.z + w1 * b.z + w2 * c.z;
          const i = y * width + x;
          if (z >= (depth[i] as number)) continue;
          if (alpha >= 1) depth[i] = z;
          const o = i * 3;
          rgb[o] = Math.round((rgb[o] as number) * (1 - alpha) + r * 255 * alpha);
          rgb[o + 1] = Math.round((rgb[o + 1] as number) * (1 - alpha) + g * 255 * alpha);
          rgb[o + 2] = Math.round((rgb[o + 2] as number) * (1 - alpha) + bl * 255 * alpha);
        }
      }
    }
  });
  return rgb;
}
