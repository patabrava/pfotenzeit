/**
 * Measurements on a loaded glTF Document that both build-models and validate-assets use.
 */
import { Matrix4, Vector3 } from 'three';

function firstSkinnedPrimitive(doc) {
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    const skin = node.getSkin();
    if (mesh && skin) return { prim: mesh.listPrimitives()[0], skin, node };
  }
  return null;
}

/**
 * Dog shoulder height: highest vertex dominated by spine_02 or a front upper-leg joint
 * (withers incl. harness back strap). Returns NaN for non-dog files.
 */
export function measureShoulderHeight(doc) {
  const found = firstSkinnedPrimitive(doc);
  if (!found) return NaN;
  const { prim, skin } = found;
  const joints = skin.listJoints().map((j) => j.getName());
  const wanted = new Set(['spine_02', 'leg_fl_upper', 'leg_fr_upper'].map((n) => joints.indexOf(n)).filter((i) => i >= 0));
  if (wanted.size === 0) return NaN;
  const pos = prim.getAttribute('POSITION');
  const jnt = prim.getAttribute('JOINTS_0');
  const wgt = prim.getAttribute('WEIGHTS_0');
  const p = [0, 0, 0];
  const j = [0, 0, 0, 0];
  const w = [0, 0, 0, 0];
  let max = 0;
  for (let i = 0; i < pos.getCount(); i++) {
    jnt.getElement(i, j);
    wgt.getElement(i, w);
    let best = 0;
    for (let k = 1; k < 4; k++) if (w[k] > w[best]) best = k;
    if (!wanted.has(j[best])) continue;
    pos.getElement(i, p);
    if (p[1] > max) max = p[1];
  }
  return max;
}

/** Fraction of triangles whose winding normal agrees with the stored vertex normals. */
export function checkWinding(doc) {
  let agree = 0;
  let total = 0;
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), vn = new Vector3();
  const pa = [0, 0, 0], pb = [0, 0, 0], pc = [0, 0, 0], na = [0, 0, 0];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const nor = prim.getAttribute('NORMAL');
      const idx = prim.getIndices();
      if (!pos || !nor || !idx) continue;
      const count = idx.getCount();
      for (let t = 0; t < count; t += 3) {
        const ia = idx.getScalar(t), ib = idx.getScalar(t + 1), ic = idx.getScalar(t + 2);
        pos.getElement(ia, pa); pos.getElement(ib, pb); pos.getElement(ic, pc);
        a.fromArray(pa); b.fromArray(pb); c.fromArray(pc);
        n.subVectors(b, a).cross(c.sub(a));
        if (n.lengthSq() < 1e-16) continue;
        nor.getElement(ia, na);
        vn.fromArray(na);
        total++;
        if (n.dot(vn) >= 0) agree++;
      }
    }
  }
  return { agree, total, ratio: total ? agree / total : 1 };
}

/** Skin sanity: weights sum ≈ 1, no vertex without influence, ≤ 4 influences by construction. */
export function checkSkinWeights(doc) {
  const found = firstSkinnedPrimitive(doc);
  if (!found) return null;
  const wgt = found.prim.getAttribute('WEIGHTS_0');
  const w = [0, 0, 0, 0];
  let bad = 0;
  let maxDev = 0;
  for (let i = 0; i < wgt.getCount(); i++) {
    wgt.getElement(i, w);
    const s = w[0] + w[1] + w[2] + w[3];
    maxDev = Math.max(maxDev, Math.abs(1 - s));
    if (Math.abs(1 - s) > 1e-3 || Math.max(...w) <= 0) bad++;
  }
  return { vertices: wgt.getCount(), unweighted: bad, maxDeviation: maxDev };
}

/** For every animation: duration, channel count and whether loop endpoints match. */
export function inspectAnimations(doc) {
  const out = [];
  for (const anim of doc.getRoot().listAnimations()) {
    let duration = 0;
    let channels = 0;
    let maxEndpointDiff = 0;
    for (const ch of anim.listChannels()) {
      const s = ch.getSampler();
      const input = s.getInput();
      const output = s.getOutput();
      channels++;
      duration = Math.max(duration, input.getMax([0])[0]);
      const n = output.getCount();
      const size = output.getElementSize();
      const first = new Array(size).fill(0);
      const last = new Array(size).fill(0);
      output.getElement(0, first);
      output.getElement(n - 1, last);
      // quaternions: q and -q are the same rotation
      let diff = 0;
      let diffNeg = 0;
      for (let k = 0; k < size; k++) {
        diff = Math.max(diff, Math.abs(first[k] - last[k]));
        diffNeg = Math.max(diffNeg, Math.abs(first[k] + last[k]));
      }
      maxEndpointDiff = Math.max(maxEndpointDiff, size === 4 ? Math.min(diff, diffNeg) : diff);
    }
    out.push({ name: anim.getName(), duration, channels, maxEndpointDiff });
  }
  return out;
}

export function listJointNames(doc) {
  const skins = doc.getRoot().listSkins();
  return skins.map((s) => ({ name: s.getName(), joints: s.listJoints().map((j) => j.getName()) }));
}

/** Rest-pose world positions of joints (translation only hierarchy). */
export function jointWorldPositions(doc) {
  const out = new Map();
  const visit = (node, parent) => {
    const m = new Matrix4().fromArray(node.getMatrix()).premultiply(parent);
    out.set(node.getName(), [m.elements[12], m.elements[13], m.elements[14]]);
    for (const c of node.listChildren()) visit(c, m);
  };
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  for (const n of scene.listChildren()) visit(n, new Matrix4());
  return out;
}
