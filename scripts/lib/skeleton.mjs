/**
 * Skeleton definitions (08_3D_ASSET_HANDOFF) and forward kinematics used for skinning,
 * inverse bind matrices and numerical checks of poses.
 *
 * Every bone has a world-space head (joint position) and tail (end of the bone used by the
 * skin-weight capsule) in the rest pose. Rest rotations are identity: a bone's local axes are the
 * model axes, so +X rotation = pitch (nose/foot down-backward), +Y = yaw to the left, +Z = roll.
 */
import { Matrix4, Quaternion, Vector3, Euler } from 'three';

export const DOG_BONE_NAMES = [
  'root', 'pelvis', 'spine_01', 'spine_02', 'neck', 'head', 'jaw',
  'ear_l_01', 'ear_l_02', 'ear_r_01', 'ear_r_02',
  'tail_01', 'tail_02', 'tail_03',
  'leg_fl_upper', 'leg_fl_lower', 'paw_fl',
  'leg_fr_upper', 'leg_fr_lower', 'paw_fr',
  'leg_bl_upper', 'leg_bl_lower', 'paw_bl',
  'leg_br_upper', 'leg_br_lower', 'paw_br',
];

export const HUMAN_BONE_NAMES = [
  'root', 'hips', 'spine', 'chest', 'neck', 'head',
  'shoulder_l', 'upper_arm_l', 'lower_arm_l', 'hand_l',
  'shoulder_r', 'upper_arm_r', 'lower_arm_r', 'hand_r',
  'upper_leg_l', 'lower_leg_l', 'foot_l',
  'upper_leg_r', 'lower_leg_r', 'foot_r',
];

export class Skeleton {
  constructor() {
    this.bones = [];
    this.index = new Map();
  }

  /** @param radius skin capsule radius used by the distance-based weighting */
  add(name, parent, head, tail, radius) {
    if (this.index.has(name)) throw new Error(`duplicate bone ${name}`);
    if (parent !== null && !this.index.has(parent)) throw new Error(`parent ${parent} of ${name} missing`);
    const bone = { name, parent, head: [...head], tail: [...tail], radius, index: this.bones.length };
    this.index.set(name, bone.index);
    this.bones.push(bone);
    return bone;
  }

  get(name) {
    const i = this.index.get(name);
    if (i === undefined) throw new Error(`unknown bone ${name}`);
    return this.bones[i];
  }

  /** Local rest translation (parent head → bone head). */
  localTranslation(bone) {
    if (bone.parent === null) return [...bone.head];
    const p = this.get(bone.parent);
    return [bone.head[0] - p.head[0], bone.head[1] - p.head[1], bone.head[2] - p.head[2]];
  }

  /** World matrix of every bone for a pose (map name → {rot: [x,y,z] deg, pos: [x,y,z] offset}). */
  fk(pose) {
    const world = new Array(this.bones.length);
    const local = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const s = new Vector3(1, 1, 1);
    const t = new Vector3();
    for (const bone of this.bones) {
      const lt = this.localTranslation(bone);
      const ch = pose?.get(bone.name);
      const rot = ch ? ch.rot : [0, 0, 0];
      const off = ch ? ch.pos : [0, 0, 0];
      e.set(rot[0] * (Math.PI / 180), rot[1] * (Math.PI / 180), rot[2] * (Math.PI / 180), 'XYZ');
      q.setFromEuler(e);
      t.set(lt[0] + off[0], lt[1] + off[1], lt[2] + off[2]);
      local.compose(t, q, s);
      const m = new Matrix4();
      if (bone.parent === null) m.copy(local);
      else m.multiplyMatrices(world[this.index.get(bone.parent)], local);
      world[bone.index] = m;
    }
    return world;
  }

  /** World joint position of a bone in a pose. */
  jointPosition(pose, name) {
    const world = this.fk(pose);
    const m = world[this.index.get(name)];
    return [m.elements[12], m.elements[13], m.elements[14]];
  }

  /** Transform a rest-space point attached to `name` into the posed space. */
  posedPoint(pose, name, point) {
    const world = this.fk(pose);
    const bone = this.get(name);
    const m = world[bone.index];
    const local = new Vector3(point[0] - bone.head[0], point[1] - bone.head[1], point[2] - bone.head[2]);
    // rest world matrix is pure translation to bone.head, so local = point - head
    return local.applyMatrix4(m).toArray();
  }

  inverseBindMatrices() {
    const out = new Float32Array(this.bones.length * 16);
    for (const b of this.bones) {
      const m = new Matrix4().makeTranslation(-b.head[0], -b.head[1], -b.head[2]);
      out.set(m.elements, b.index * 16);
    }
    return out;
  }
}

// ---------------------------------------------------------------- dog
/**
 * Dog skeleton from a proportion set (see dogProportions.mjs). Returns the skeleton plus the
 * derived landmark positions used by the geometry builder.
 */
export function dogSkeleton(P) {
  const sk = new Skeleton();
  const S = P.shoulderHeight;
  const W = P.width;
  const spineFrontY = S - P.chestRy - 0.004;
  const spineBackY = spineFrontY - P.spineSlope;
  const zSh = P.bodyLen / 2;
  const zHip = -P.bodyLen / 2;
  const ySh = spineFrontY - 0.42 * P.chestRy;
  const yHip = spineBackY - 0.38 * P.bellyRy;
  const pawJointY = P.pawRy * 0.9;
  const neckBase = [0, spineFrontY + P.chestRy * 0.35, zSh + 0.03];
  const neckDir = norm([0, Math.sin(P.neckAngle), Math.cos(P.neckAngle)]);
  const headJoint = add(neckBase, scale(neckDir, P.neckLen));
  const headC = add(headJoint, [0, P.headR * 0.38, P.headR * 0.28]);
  const jawJoint = add(headC, [0, -P.headR * 0.28, P.headR * 0.38]);
  const muzzleBase = add(headC, [0, -P.headR * 0.12, P.headR * 0.72]);
  const noseTip = add(muzzleBase, [0, P.muzzleRy * 0.25, P.muzzleLen]);
  const eyeL = add(headC, [P.headR * 0.42, P.headR * 0.2, P.headR * 0.84]);
  const earTop = P.earStyle === 'floppy'
    ? add(headC, [P.headR * 0.86, P.headR * 0.42, -P.headR * 0.08])
    : add(headC, [P.headR * 0.72, P.headR * 0.8, -P.headR * 0.18]);
  const earMid = P.earStyle === 'floppy'
    ? add(earTop, [0.012, -P.earLen * 0.5, -0.004])
    : add(earTop, [P.earLen * 0.42, -P.earLen * 0.36, 0.002]);
  const earTip = P.earStyle === 'floppy'
    ? add(earTop, [0.02, -P.earLen, -0.008])
    : add(earTop, [P.earLen * 0.62, -P.earLen * 0.9, 0.01]);
  const tailBase = [0, spineBackY + 0.012, zHip - P.bellyRz * 0.55];
  const t3 = P.tailLen / 3;
  const tail2 = add(tailBase, scale(norm([0, 0.3, -1]), t3));
  const tail3 = add(tail2, scale(norm([0, 0.45, -1]), t3));
  const tailTip = add(tail3, scale(norm([0, 0.6, -1]), t3));

  sk.add('root', null, [0, 0, 0], [0, 0.05, 0], 0.05);
  sk.add('pelvis', 'root', [0, yHip + 0.02, zHip + 0.01], [0, spineBackY, zHip + 0.07], P.bellyRy * 1.1);
  sk.add('spine_01', 'pelvis', [0, spineBackY, zHip + 0.07], [0, (spineBackY + spineFrontY) / 2, 0.0], P.bellyRy * 1.1);
  sk.add('spine_02', 'spine_01', [0, (spineBackY + spineFrontY) / 2, 0.0], neckBase, P.chestRy * 1.1);
  sk.add('neck', 'spine_02', neckBase, headJoint, P.neckR * 1.2);
  sk.add('head', 'neck', headJoint, noseTip, P.headR);
  sk.add('jaw', 'head', jawJoint, add(jawJoint, [0, -0.01, P.muzzleLen + P.headR * 0.4]), P.muzzleRx);
  for (const side of ['l', 'r']) {
    const sx = side === 'l' ? 1 : -1;
    const m = (p) => [p[0] * sx, p[1], p[2]];
    sk.add(`ear_${side}_01`, 'head', m(earTop), m(earMid), P.earW * 0.6);
    sk.add(`ear_${side}_02`, `ear_${side}_01`, m(earMid), m(earTip), P.earW * 0.6);
  }
  sk.add('tail_01', 'pelvis', tailBase, tail2, P.tailR * 2);
  sk.add('tail_02', 'tail_01', tail2, tail3, P.tailR * 2);
  sk.add('tail_03', 'tail_02', tail3, tailTip, P.tailR * 2);
  const upperLen = (ySh - pawJointY) * 0.5;
  const upperLenB = (yHip - pawJointY) * 0.5;
  const legX = (side, v) => (side === 'l' ? 1 : -1) * v * W;
  for (const side of ['l', 'r']) {
    const fx = legX(side, P.frontX);
    const sh = [fx, ySh, zSh];
    const el = [fx, ySh - upperLen, zSh - 0.006];
    const pf = [fx, pawJointY, zSh + 0.008];
    sk.add(`leg_f${side}_upper`, 'spine_02', sh, el, P.legUpperR * 1.3);
    sk.add(`leg_f${side}_lower`, `leg_f${side}_upper`, el, pf, P.legLowerR * 1.3);
    sk.add(`paw_f${side}`, `leg_f${side}_lower`, pf, add(pf, [0, 0, P.pawRz]), P.pawRz);
  }
  for (const side of ['l', 'r']) {
    const bx = legX(side, P.backX);
    const hip = [bx, yHip, zHip];
    const knee = [bx, yHip - upperLenB, zHip + 0.02];
    const pb = [bx, pawJointY, zHip - 0.008];
    sk.add(`leg_b${side}_upper`, 'pelvis', hip, knee, P.legUpperR * 1.4);
    sk.add(`leg_b${side}_lower`, `leg_b${side}_upper`, knee, pb, P.legLowerR * 1.3);
    sk.add(`paw_b${side}`, `leg_b${side}_lower`, pb, add(pb, [0, 0, P.pawRz]), P.pawRz);
  }
  const order = sk.bones.map((b) => b.name).join();
  if (order !== DOG_BONE_NAMES.join()) throw new Error(`dog bone order mismatch: ${order}`);

  return {
    skeleton: sk,
    landmarks: {
      spineFrontY, spineBackY, zSh, zHip, ySh, yHip, pawJointY, upperLen, upperLenB,
      neckBase, neckDir, headJoint, headC, jawJoint, muzzleBase, noseTip, eyeL, earTop, earMid, earTip,
      tailBase, tail2, tail3, tailTip,
    },
  };
}

// ---------------------------------------------------------------- human
export function humanSkeleton(H) {
  const sk = new Skeleton();
  const h = H.height;
  const hips = [0, h * 0.53, 0];
  const spine = [0, h * 0.60, 0];
  const chest = [0, h * 0.70, 0];
  const neck = [0, h * 0.835, 0];
  const head = [0, h * 0.87, 0];
  const headTop = [0, h, 0];
  const shoulderW = H.shoulderWidth / 2;
  const upperArm = h * 0.165;
  const lowerArm = h * 0.15;
  const hand = h * 0.085;
  const hipW = H.hipWidth / 2;
  const upperLeg = h * 0.26;
  const lowerLeg = h * 0.23;
  sk.add('root', null, [0, 0, 0], [0, 0.1, 0], 0.1);
  sk.add('hips', 'root', hips, spine, H.hipWidth * 0.6);
  sk.add('spine', 'hips', spine, chest, H.hipWidth * 0.6);
  sk.add('chest', 'spine', chest, neck, H.shoulderWidth * 0.45);
  sk.add('neck', 'chest', neck, head, 0.07);
  sk.add('head', 'neck', head, headTop, 0.14);
  for (const side of ['l', 'r']) {
    const sx = side === 'l' ? 1 : -1;
    const sh0 = [sx * 0.04, h * 0.815, 0];
    const sh1 = [sx * shoulderW, h * 0.815, 0];
    const elbow = [sx * (shoulderW + 0.01), h * 0.815 - upperArm, 0];
    const wrist = [sx * (shoulderW + 0.015), h * 0.815 - upperArm - lowerArm, 0.01];
    const handEnd = [sx * (shoulderW + 0.015), h * 0.815 - upperArm - lowerArm - hand, 0.015];
    sk.add(`shoulder_${side}`, 'chest', sh0, sh1, 0.06);
    sk.add(`upper_arm_${side}`, `shoulder_${side}`, sh1, elbow, 0.055);
    sk.add(`lower_arm_${side}`, `upper_arm_${side}`, elbow, wrist, 0.05);
    sk.add(`hand_${side}`, `lower_arm_${side}`, wrist, handEnd, 0.05);
  }
  for (const side of ['l', 'r']) {
    const sx = side === 'l' ? 1 : -1;
    const hip = [sx * hipW, h * 0.52, 0];
    const knee = [sx * hipW, h * 0.52 - upperLeg, 0.005];
    const ankle = [sx * hipW, h * 0.52 - upperLeg - lowerLeg, -0.01];
    const toe = [sx * hipW, 0.0, 0.12];
    sk.add(`upper_leg_${side}`, 'hips', hip, knee, 0.09);
    sk.add(`lower_leg_${side}`, `upper_leg_${side}`, knee, ankle, 0.075);
    sk.add(`foot_${side}`, `lower_leg_${side}`, ankle, toe, 0.08);
  }
  const order = sk.bones.map((b) => b.name).join();
  if (order !== HUMAN_BONE_NAMES.join()) throw new Error(`human bone order mismatch: ${order}`);
  return { skeleton: sk, landmarks: { hips, spine, chest, neck, head, headTop, shoulderW, upperArm, lowerArm, hand, hipW, upperLeg, lowerLeg } };
}

// ---------------------------------------------------------------- small vector helpers
export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}
export function norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
export function mid(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}
export function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
