/**
 * Static geometry builder: collects coloured primitives and merges them into ONE vertex-coloured
 * mesh (one draw call) sharing the common procedural material.
 */
import { Euler, Matrix4, Mesh, Quaternion, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { vertexColorMaterial } from '../materials/palette';
import { colorAttribute, type PartTransform } from './rigBuilder';

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const _s = new Vector3();

export class StaticBuilder {
  private readonly parts: BufferGeometry[] = [];
  triangles = 0;

  add(geometry: BufferGeometry, hex: string, transform?: PartTransform): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.deleteAttribute('uv');
    const t = transform;
    const scale = t?.scale === undefined ? 1 : t.scale;
    if (Array.isArray(scale)) _s.set(scale[0], scale[1], scale[2]);
    else _s.setScalar(scale);
    const rot = t?.rotation ?? [0, 0, 0];
    const pos = t?.position ?? [0, 0, 0];
    _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
    _v.set(pos[0], pos[1], pos[2]);
    _m.compose(_v, _q, _s);
    g.applyMatrix4(_m);
    const count = g.getAttribute('position').count;
    g.setAttribute('color', colorAttribute(count, hex));
    this.triangles += count / 3;
    this.parts.push(g);
    return this;
  }

  isEmpty(): boolean {
    return this.parts.length === 0;
  }

  build(name: string): Mesh {
    const merged = mergeGeometries(this.parts, false);
    for (const g of this.parts) g.dispose();
    this.parts.length = 0;
    if (!merged) throw new Error(`StaticBuilder: nothing to merge for ${name}`);
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const mesh = new Mesh(merged, vertexColorMaterial());
    mesh.name = name;
    return mesh;
  }
}

export function disposeMesh(mesh: Mesh): void {
  mesh.geometry.dispose();
  mesh.removeFromParent();
}
