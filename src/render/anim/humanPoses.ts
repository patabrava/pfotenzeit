/**
 * Procedural human gestures (08: idle, greet, gesture_explain, offer_reward, kneel).
 * Conventions as in dogPoses: arm/leg rotation x negative swings the limb forward; z positive moves
 * the left limb outward (mirrored for the right).
 */
import type { GestureId } from '../../simulation/types';
import type { HumanProportions } from '../objects/HumanActor';
import type { FrameWriter } from '../objects/rigBuilder';
import type { PoseGeneratorContext } from './PoseController';

export interface HumanPoseContext extends PoseGeneratorContext {
  p: HumanProportions;
}

export type HumanPoseFn = (w: FrameWriter, t: number, ctx: HumanPoseContext) => void;

const TAU = Math.PI * 2;
const rad2deg = 180 / Math.PI;

function neutral(w: FrameWriter): void {
  w.frame.fill(0);
  for (let i = 6; i < w.frame.length; i += 7) w.frame[i] = 1;
  w.mirror('shoulder_l', 'shoulder_r', 4, 0, 9);
  w.mirror('forearm_l', 'forearm_r', -10, 0, 0);
  w.mirror('thigh_l', 'thigh_r', 0, 0, 2);
  w.rot('neck', 4);
  w.rot('head', -2);
}

function breathing(w: FrameWriter, t: number, ctx: HumanPoseContext, amplitude = 0.012, period = 3.8): void {
  if (ctx.hold) return;
  const s = 1 + amplitude * Math.sin((TAU * t) / period);
  w.scale('chest', s);
  w.scale('neck', 1 / s);
  w.scale('shoulder_l', 1 / s);
  w.scale('shoulder_r', 1 / s);
}

/**
 * Two-link leg solve: hips at height h above the foot, foot forward by z. Returns thigh/shin
 * rotation (degrees) with the sign convention of the rig (negative thigh = forward).
 */
function solveLeg(h: number, z: number, l1: number, l2: number): { thigh: number; shin: number } {
  const d = Math.min(Math.hypot(h, z), l1 + l2 - 1e-4);
  const a = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const knee = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2))));
  const base = Math.atan2(z, h); // angle of the hip→foot line from straight down, forward positive
  const thigh = -(base + a) * rad2deg;
  const shin = (Math.PI - knee) * rad2deg;
  return { thigh, shin };
}

export const idle: HumanPoseFn = (w, t, ctx) => {
  neutral(w);
  const sway = ctx.hold ? 0 : Math.sin((TAU * t) / 5.2);
  w.rot('hips', 0, 0, 1.2 * sway);
  w.rot('spine', 0, 0, -1.2 * sway);
  breathing(w, t, ctx);
};

export const greet: HumanPoseFn = (w, t, ctx) => {
  neutral(w);
  const wave = ctx.hold ? 0.3 : Math.sin(TAU * t * 1.4);
  w.rot('shoulder_r', -150, 0, -24);
  w.rot('forearm_r', -20, 0, -14 - 16 * wave);
  w.rot('hand_r', 0, 0, -10 * wave);
  w.rot('chest', -3, 0, 2);
  w.rot('head', -4, -8, 0);
  breathing(w, t, ctx);
};

export const gestureExplain: HumanPoseFn = (w, t, ctx) => {
  neutral(w);
  // Side-on, open posture: body turned, one hand open to the side (palm up), the other relaxed.
  w.rot('hips', 0, 34, 0);
  w.rot('spine', 0, -8, 0);
  w.rot('chest', -2, -10, 0);
  w.rot('head', 2, -14, 0);
  w.rot('shoulder_r', -28, 10, -62);
  w.rot('forearm_r', -58, 0, -8);
  w.rot('hand_r', -20, 0, 0);
  w.rot('shoulder_l', 6, 0, 10);
  w.rot('forearm_l', -16, 0, 0);
  const emph = ctx.hold ? 0 : 5 * Math.sin((TAU * t) / 2.4);
  w.addRot('forearm_r', emph, 0, 0);
  breathing(w, t, ctx);
};

export const offerReward: HumanPoseFn = (w, t, ctx) => {
  neutral(w);
  const p = ctx.p;
  // Crouch: hips lowered, feet staggered; torso only slightly forward, hand low and forward.
  const hips = 0.52 * p.k;
  const drop = p.hipHeight - 0.03 * p.k - hips;
  w.pos('hips', 0, -drop, 0);
  const left = solveLeg(hips, 0.14 * p.k, p.thigh, p.shin);
  const right = solveLeg(hips, -0.12 * p.k, p.thigh, p.shin);
  w.rot('thigh_l', left.thigh, 0, 6);
  w.rot('shin_l', left.shin, 0, 0);
  w.rot('foot_l', -(left.thigh + left.shin), 0, 0);
  w.rot('thigh_r', right.thigh, 0, -8);
  w.rot('shin_r', right.shin, 0, 0);
  w.rot('foot_r', -(right.thigh + right.shin), 0, 0);
  w.rot('spine', 14, 0, 0);
  w.rot('chest', 6, 0, 0);
  w.rot('neck', 10, 0, 0);
  w.rot('head', 8, 0, 0);
  // Offering hand forward and low (not above the dog); other hand rests on the knee.
  const reach = ctx.hold ? 1 : 0.9 + 0.1 * Math.sin((TAU * t) / 2.8);
  w.rot('shoulder_r', -78 * reach, 0, -10);
  w.rot('forearm_r', -10, 0, -4);
  w.rot('hand_r', 30, 0, 0);
  w.rot('shoulder_l', -40, 0, 14);
  w.rot('forearm_l', -40, 0, 8);
  breathing(w, t, ctx, 0.01, 3.2);
};

export const kneel: HumanPoseFn = (w, t, ctx) => {
  neutral(w);
  const p = ctx.p;
  // Right knee on the ground, left foot planted in front, torso upright.
  const hips = p.thigh + 0.06 * p.k;
  const drop = p.hipHeight - 0.03 * p.k - hips;
  w.pos('hips', 0, -drop, 0);
  w.rot('thigh_r', 4, 0, -6);
  w.rot('shin_r', 92, 0, 0);
  w.rot('foot_r', -30, 0, 0);
  w.rot('thigh_l', -92, 0, 8);
  w.rot('shin_l', 94, 0, 0);
  w.rot('foot_l', -2, 0, 0);
  w.rot('spine', 4, 0, 0);
  w.rot('neck', 8, 0, 0);
  w.rot('head', 6, 0, 0);
  w.rot('shoulder_l', -62, 0, 12);
  w.rot('forearm_l', -40, 0, 6);
  w.rot('shoulder_r', -34, 0, -8);
  w.rot('forearm_r', -24, 0, -4);
  breathing(w, t, ctx, 0.01, 3.6);
};

export const HUMAN_POSES: Record<GestureId, HumanPoseFn> = {
  idle,
  greet,
  gesture_explain: gestureExplain,
  offer_reward: offerReward,
  kneel,
};

export const HUMAN_ONE_SHOT_SECONDS: Partial<Record<GestureId, number>> = {
  greet: 1.8,
  offer_reward: 2.4,
};
