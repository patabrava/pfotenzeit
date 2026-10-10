/**
 * Skinned bounds sampling: world-space sample points of an actor's deformed surface (ears, tail,
 * paws included) so the camera can frame the dog from what it actually looks like (D-034), on both
 * tiers and for future models without constants.
 */
import { Mesh, SkinnedMesh, Vector3, type Object3D } from 'three';

const _v = new Vector3();

/** Samples every `stride`-th vertex of each SkinnedMesh under root after CPU skinning. */
export function sampleSkinnedPoints(root: Object3D, stride = 5, out: Vector3[] = []): Vector3[] {
  out.length = 0;
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (!(node instanceof SkinnedMesh)) return;
    const position = node.geometry.getAttribute('position');
    if (!position) return;
    node.skeleton.update();
    const count = position.count;
    for (let i = 0; i < count; i += stride) {
      _v.fromBufferAttribute(position, i);
      node.applyBoneTransform(i, _v);
      _v.applyMatrix4(node.matrixWorld);
      out.push(_v.clone());
    }
  });
  if (out.length === 0) {
    // No skinned mesh (e.g. a static GLB): fall back to bone/world positions of meshes.
    root.traverse((node) => {
      if (node instanceof Mesh) {
        const geometry = node.geometry;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        const b = geometry.boundingBox;
        if (!b) return;
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push(_v.set(x, y, z).applyMatrix4(node.matrixWorld).clone());
      }
    });
  }
  return out;
}

export interface SurfaceFootprint {
  /** Centre on the ground, world xz. */
  centreX: number;
  centreZ: number;
  /** Half extents along world x/z. */
  halfX: number;
  halfZ: number;
  minY: number;
  maxY: number;
  meanY: number;
}

/**
 * Footprint of the deformed surface samples (contact shadow, reach, eye height). Works for any
 * skinned model: no bone names, no skeleton structure, IK/control bones cannot distort it.
 */
export function surfaceFootprint(points: readonly Vector3[]): SurfaceFootprint | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let sumY = 0;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    sumY += p.y;
  }
  return { centreX: (minX + maxX) / 2, centreZ: (minZ + maxZ) / 2, halfX: (maxX - minX) / 2, halfZ: (maxZ - minZ) / 2, minY, maxY, meanY: sumY / points.length };
}

/** Extent of the samples along a horizontal yaw direction (0 = +z), in metres. */
export function extentAlong(points: readonly Vector3[], yaw: number): number {
  const sx = Math.sin(yaw);
  const cz = Math.cos(yaw);
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    const d = p.x * sx + p.z * cz;
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return Number.isFinite(min) ? max - min : 0;
}
