/**
 * Skin weights: for every vertex, distance to the capsule of each candidate bone (segment head→tail,
 * radius per bone), Gaussian falloff, keep the top 4 influences, normalize. No vertex is left unweighted.
 */

function segmentDistance(p, a, b) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const apz = p[2] - a[2];
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 > 0 ? (apx * abx + apy * aby + apz * abz) / ab2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t;
  const dy = apy - aby * t;
  const dz = apz - abz * t;
  return Math.hypot(dx, dy, dz);
}

/**
 * @param positions Float32Array xyz
 * @param skinset   per-vertex index into skinSets
 * @param skinSets  array of (bone name | bone name[] )
 * @param skeleton  Skeleton
 * @param options   { sigmaScale }: Gaussian sigma = bone.radius * sigmaScale
 */
export function computeSkin(positions, skinset, skinSets, skeleton, { sigmaScale = 1.0 } = {}) {
  const n = positions.length / 3;
  const joints = new Uint8Array(n * 4);
  const weights = new Float32Array(n * 4);
  // skin set forms: 'bone' (rigid) | ['a','b'] (distance weighted) | { a: 0.7, b: 0.3 } (fixed weights)
  const resolved = skinSets.map((s) => {
    if (typeof s === 'string') return { mode: 'rigid', bones: [skeleton.get(s)] };
    if (Array.isArray(s)) return { mode: 'auto', bones: s.map((name) => skeleton.get(name)) };
    const entries = Object.entries(s).map(([name, w]) => ({ bone: skeleton.get(name), w }));
    return { mode: 'fixed', entries };
  });
  const scratch = [];
  for (let i = 0; i < n; i++) {
    const p = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    const set = resolved[skinset[i]];
    scratch.length = 0;
    if (set.mode === 'rigid') {
      scratch.push({ j: set.bones[0].index, w: 1 });
    } else if (set.mode === 'fixed') {
      for (const e of set.entries) scratch.push({ j: e.bone.index, w: e.w });
    } else {
      let best = null;
      for (const b of set.bones) {
        const d = segmentDistance(p, b.head, b.tail);
        const sigma = b.radius * sigmaScale;
        const w = Math.exp(-((d / sigma) ** 3));
        if (!best || d < best.d) best = { d, j: b.index };
        if (w > 1e-4) scratch.push({ j: b.index, w });
      }
      if (scratch.length === 0) scratch.push({ j: best.j, w: 1 });
    }
    scratch.sort((a, b) => b.w - a.w);
    const top = scratch.slice(0, 4);
    const sum = top.reduce((s, e) => s + e.w, 0);
    for (let k = 0; k < 4; k++) {
      if (k < top.length) {
        joints[i * 4 + k] = top[k].j;
        weights[i * 4 + k] = top[k].w / sum;
      } else {
        joints[i * 4 + k] = 0;
        weights[i * 4 + k] = 0;
      }
    }
    // make the sum exactly 1 in float32 terms (validator tolerance is tight)
    let s = 0;
    for (let k = 0; k < 4; k++) s += weights[i * 4 + k];
    weights[i * 4] += 1 - s;
  }
  return { joints, weights };
}
