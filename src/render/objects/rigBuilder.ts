/**
 * Procedural rig builder.
 *
 * A procedural actor is ONE SkinnedMesh (vertex colours, one shared material → one draw call)
 * driven by a real Bone hierarchy. Every primitive part is generated in its bone's local space,
 * rigidly weighted to that bone, and merged. Poses are therefore joint rotations, never swapped
 * meshes, and the same bone names as the 08 skeleton are used so GLB clips could drive them later.
 */
import {
  Bone,
  BufferAttribute,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Object3D,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toLinearRgb, vertexColorMaterial } from '../materials/palette';

export interface BoneSpec {
  name: string;
  parent: string | null;
  /** Local position relative to the parent bone (metres). */
  position: [number, number, number];
}

/** Channels per bone in a pose frame: rotation xyz (radians), position offset xyz, uniform scale. */
export const CHANNELS = 7;

export interface Rig {
  /** Ground-origin actor root. Facing and stage position are applied here. */
  root: Object3D;
  bones: Bone[];
  index: Map<string, number>;
  mesh: SkinnedMesh;
  /** Bind-pose local positions, 3 per bone. */
  bindPositions: Float32Array;
  triangles: number;
}

export interface PartTransform {
  position?: [number, number, number];
  /** Euler XYZ in radians. */
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
}

interface PendingPart {
  bone: string;
  geometry: BufferGeometry;
  color: [number, number, number];
  transform: PartTransform | undefined;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const _s = new Vector3();

export function createBones(specs: readonly BoneSpec[]): { root: Object3D; bones: Bone[]; index: Map<string, number> } {
  const root = new Object3D();
  root.name = 'actor_root';
  const bones: Bone[] = [];
  const index = new Map<string, number>();
  const byName = new Map<string, Bone>();
  for (const spec of specs) {
    const bone = new Bone();
    bone.name = spec.name;
    bone.position.set(spec.position[0], spec.position[1], spec.position[2]);
    const parent = spec.parent ? byName.get(spec.parent) : undefined;
    if (spec.parent && !parent) throw new Error(`rigBuilder: parent bone ${spec.parent} must be declared before ${spec.name}`);
    (parent ?? root).add(bone);
    index.set(spec.name, bones.length);
    bones.push(bone);
    byName.set(spec.name, bone);
  }
  return { root, bones, index };
}

/** Collects parts for a rig and merges them into one skinned mesh. */
export class PartBuilder {
  private readonly parts: PendingPart[] = [];

  constructor(
    private readonly root: Object3D,
    private readonly bones: Bone[],
    private readonly index: Map<string, number>,
  ) {}

  add(bone: string, geometry: BufferGeometry, hex: string, transform?: PartTransform): this {
    if (!this.index.has(bone)) throw new Error(`rigBuilder: unknown bone ${bone}`);
    this.parts.push({ bone, geometry, color: toLinearRgb(hex), transform });
    return this;
  }

  build(name: string): Rig {
    this.root.updateMatrixWorld(true);
    const merged: BufferGeometry[] = [];
    let triangles = 0;
    for (const part of this.parts) {
      const geometry = part.geometry.toNonIndexed();
      part.geometry.dispose();
      geometry.deleteAttribute('uv');
      const t = part.transform;
      const scale = t?.scale === undefined ? 1 : t.scale;
      if (Array.isArray(scale)) _s.set(scale[0], scale[1], scale[2]);
      else _s.setScalar(scale);
      const rot = t?.rotation ?? [0, 0, 0];
      _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
      const pos = t?.position ?? [0, 0, 0];
      _v.set(pos[0], pos[1], pos[2]);
      _m.compose(_v, _q, _s);
      const boneIndex = this.index.get(part.bone) as number;
      const bone = this.bones[boneIndex] as Bone;
      _m.premultiply(bone.matrixWorld);
      geometry.applyMatrix4(_m);
      const count = geometry.getAttribute('position').count;
      const colors = new Float32Array(count * 3);
      const skinIndex = new Uint16Array(count * 4);
      const skinWeight = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = part.color[0];
        colors[i * 3 + 1] = part.color[1];
        colors[i * 3 + 2] = part.color[2];
        skinIndex[i * 4] = boneIndex;
        skinWeight[i * 4] = 1;
      }
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
      geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndex, 4));
      geometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeight, 4));
      triangles += count / 3;
      merged.push(geometry);
    }
    const geometry = mergeGeometries(merged, false);
    for (const g of merged) g.dispose();
    if (!geometry) throw new Error('rigBuilder: nothing to merge');
    geometry.computeBoundingSphere();
    const mesh = new SkinnedMesh(geometry, vertexColorMaterial());
    mesh.name = name;
    mesh.frustumCulled = false;
    this.root.add(mesh);
    this.root.updateMatrixWorld(true);
    const skeleton = new Skeleton(this.bones);
    mesh.bind(skeleton, new Matrix4());
    const bindPositions = new Float32Array(this.bones.length * 3);
    this.bones.forEach((bone, i) => {
      bindPositions[i * 3] = bone.position.x;
      bindPositions[i * 3 + 1] = bone.position.y;
      bindPositions[i * 3 + 2] = bone.position.z;
    });
    return { root: this.root, bones: this.bones, index: this.index, mesh, bindPositions, triangles };
  }
}

// ---------------------------------------------------------------------------
// Pose frames
// ---------------------------------------------------------------------------

export type Frame = Float32Array;

export function createFrame(rig: Rig): Frame {
  const frame = new Float32Array(rig.bones.length * CHANNELS);
  resetFrame(frame);
  return frame;
}

export function resetFrame(frame: Frame): void {
  frame.fill(0);
  for (let i = 6; i < frame.length; i += CHANNELS) frame[i] = 1;
}

export function copyFrame(dst: Frame, src: Frame): void {
  dst.set(src);
}

export function lerpFrames(out: Frame, a: Frame, b: Frame, t: number): void {
  const k = 1 - t;
  for (let i = 0; i < out.length; i++) out[i] = (a[i] as number) * k + (b[i] as number) * t;
}

export function applyFrame(rig: Rig, frame: Frame): void {
  const bones = rig.bones;
  const bind = rig.bindPositions;
  for (let i = 0; i < bones.length; i++) {
    const bone = bones[i] as Bone;
    const o = i * CHANNELS;
    bone.rotation.set(frame[o] as number, frame[o + 1] as number, frame[o + 2] as number);
    bone.position.set(
      (bind[i * 3] as number) + (frame[o + 3] as number),
      (bind[i * 3 + 1] as number) + (frame[o + 4] as number),
      (bind[i * 3 + 2] as number) + (frame[o + 5] as number),
    );
    const s = frame[o + 6] as number;
    bone.scale.setScalar(s);
  }
}

/** Authoring helper bound to one rig: degrees in, channels out. */
export class FrameWriter {
  constructor(
    private readonly rig: Rig,
    public frame: Frame,
  ) {}

  private offset(bone: string): number {
    const i = this.rig.index.get(bone);
    if (i === undefined) throw new Error(`FrameWriter: unknown bone ${bone}`);
    return i * CHANNELS;
  }

  /** Set rotation in degrees. */
  rot(bone: string, x: number, y = 0, z = 0): this {
    const o = this.offset(bone);
    this.frame[o] = x * DEG;
    this.frame[o + 1] = y * DEG;
    this.frame[o + 2] = z * DEG;
    return this;
  }

  /** Add rotation in degrees. */
  addRot(bone: string, x: number, y = 0, z = 0): this {
    const o = this.offset(bone);
    this.frame[o] = (this.frame[o] as number) + x * DEG;
    this.frame[o + 1] = (this.frame[o + 1] as number) + y * DEG;
    this.frame[o + 2] = (this.frame[o + 2] as number) + z * DEG;
    return this;
  }

  /** Position offset from bind pose, metres. */
  pos(bone: string, x: number, y: number, z: number): this {
    const o = this.offset(bone);
    this.frame[o + 3] = x;
    this.frame[o + 4] = y;
    this.frame[o + 5] = z;
    return this;
  }

  addPos(bone: string, x: number, y: number, z: number): this {
    const o = this.offset(bone);
    this.frame[o + 3] = (this.frame[o + 3] as number) + x;
    this.frame[o + 4] = (this.frame[o + 4] as number) + y;
    this.frame[o + 5] = (this.frame[o + 5] as number) + z;
    return this;
  }

  scale(bone: string, s: number): this {
    this.frame[this.offset(bone) + 6] = s;
    return this;
  }

  mirror(left: string, right: string, x: number, y = 0, z = 0): this {
    this.rot(left, x, y, z);
    this.rot(right, x, -y, -z);
    return this;
  }
}

export const DEG = Math.PI / 180;

/** Disposes rig GPU resources (geometry only; the material is shared). */
export function disposeRig(rig: Rig): void {
  rig.mesh.geometry.dispose();
  rig.mesh.skeleton.dispose();
  rig.root.removeFromParent();
}

/** Attribute helper used by the merged-static builders. */
export function colorAttribute(count: number, hex: string): BufferAttribute {
  const [r, g, b] = toLinearRgb(hex);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return new Float32BufferAttribute(colors, 3);
}
