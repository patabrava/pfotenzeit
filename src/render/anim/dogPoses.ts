/**
 * Procedural dog poses: one generator per PoseId (08 clip contract) writing joint channels.
 *
 * Conventions (bone local, see rigBuilder): rotation x positive pitches the head/spine nose-down,
 * swings a leg backwards and lifts the tail; ear rotation x positive lays the ear back, z positive
 * flares it outward (mirrored on the right). All idle variation is sine based so t = 0 is the neutral
 * keyframe; with `hold` the variation is frozen (15: the observation picture never changes unnoticed).
 */
import type { PoseId } from '../../simulation/types';
import type { DogProportions } from '../objects/DogActor';
import { lerpFrames, type FrameWriter } from '../objects/rigBuilder';
import type { PoseGeneratorContext } from './PoseController';

export interface DogPoseContext extends PoseGeneratorContext {
  p: DogProportions;
  earStyle: 'floppy' | 'folded';
}

export type DogPoseFn = (w: FrameWriter, t: number, ctx: DogPoseContext) => void;

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, x: number): number => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
const rad2deg = 180 / Math.PI;

/** Ear rest per style: floppy hangs down and slightly out, folded sits up and tips over. */
function earsRest(w: FrameWriter, ctx: DogPoseContext, back = 0, flare = 0): void {
  if (ctx.earStyle === 'floppy') {
    w.mirror('ear_l_01', 'ear_r_01', 6 + back, 0, 48 + flare);
    w.mirror('ear_l_02', 'ear_r_02', 4 + back * 0.5, 0, -30);
  } else {
    w.mirror('ear_l_01', 'ear_r_01', -20 + back, 0, 70 + flare);
    w.mirror('ear_l_02', 'ear_r_02', 20 + back * 0.5, 0, -110 + flare * 0.4);
  }
}

function tail(w: FrameWriter, a: number, b: number, c: number, sway = 0): void {
  w.rot('tail_01', a, sway);
  w.rot('tail_02', b, sway * 0.6);
  w.rot('tail_03', c, sway * 0.4);
}

function breathing(w: FrameWriter, t: number, ctx: DogPoseContext, amplitude: number, period: number): void {
  if (ctx.hold) return;
  const s = 1 + amplitude * Math.sin((TAU * t) / period);
  w.scale('spine_02', s);
  w.scale('neck', 1 / s);
}

/** Neutral standing keyframe shared by all poses. */
function stand(w: FrameWriter, ctx: DogPoseContext): void {
  w.frame.fill(0);
  for (let i = 6; i < w.frame.length; i += 7) w.frame[i] = 1;
  w.rot('neck', -18);
  w.rot('head', 10);
  w.rot('jaw', 0);
  tail(w, -52, -14, -6);
  earsRest(w, ctx);
}

/** Pelvis drop so the belly rests on the ground. */
function groundDrop(p: DogProportions): number {
  return p.jointHeight + p.bellyRadius * 0.25 - p.bellyRadius * 0.55;
}

export const idleRelaxed: DogPoseFn = (w, t, ctx) => {
  stand(w, ctx);
  tail(w, -35, 2, 2, ctx.hold ? 0 : 8 * Math.sin(TAU * t / 2));
  breathing(w, t, ctx, 0.016, 3.4);
};

export const lookAtHandler: DogPoseFn = (w, t, ctx) => {
  stand(w, ctx);
  const yaw = clamp(ctx.lookYaw, -70, 70);
  const pitch = clamp(ctx.lookPitch, -35, 20);
  w.rot('spine_02', 0, yaw * 0.15);
  w.rot('neck', -22 + pitch * 0.35, yaw * 0.35);
  w.rot('head', 2 + pitch * 0.55, yaw * 0.5);
  w.pos('pelvis', clamp(yaw / 70, -1, 1) * 0.008, 0, 0);
  earsRest(w, ctx, -10, -6);
  const sway = ctx.hold ? 0 : 6 * Math.sin((TAU * t) / 1.6);
  tail(w, -28, 2, 4, sway);
  breathing(w, t, ctx, 0.014, 3.2);
};

export const sniff: DogPoseFn = (w, t, ctx) => {
  stand(w, ctx);
  const sweep = ctx.hold ? 0 : Math.sin((TAU * t) / 2.6);
  w.rot('spine_02', 6);
  w.rot('neck', 30 + 4 * sweep * sweep, sweep * 10);
  w.rot('head', 42, sweep * 18);
  w.rot('pelvis', 0, 0, 0);
  w.pos('pelvis', 0, 0, 0.006);
  w.mirror('upper_arm_l', 'upper_arm_r', 6, 0, 3);
  earsRest(w, ctx, -6, 4);
  const wag = ctx.hold ? 0 : 8 * Math.sin((TAU * t) / 1.1);
  tail(w, -24, 6, 4, wag);
  breathing(w, t, ctx, 0.01, 1.6);
};

export const walk: DogPoseFn = (w, t, ctx) => {
  stand(w, ctx);
  const phi = ctx.walkPhase * TAU;
  // Diagonal gait: FL+BR together, FR+BL half a cycle later.
  const leg = (upper: string, lower: string, paw: string, offset: number): void => {
    const a = phi + offset;
    const s = Math.sin(a);
    const lift = Math.max(0, Math.cos(a));
    w.rot(upper, -24 * s);
    w.rot(lower, 10 + 28 * lift);
    w.rot(paw, -14 * lift);
  };
  leg('upper_arm_l', 'forearm_l', 'paw_fl', 0);
  leg('upper_arm_r', 'forearm_r', 'paw_fr', Math.PI);
  leg('thigh_l', 'shin_l', 'paw_bl', Math.PI);
  leg('thigh_r', 'shin_r', 'paw_br', 0);
  w.pos('pelvis', 0, 0.006 * Math.sin(2 * phi), 0);
  w.rot('spine_01', 0, 2.5 * Math.sin(phi), 1.5 * Math.sin(phi));
  w.rot('neck', -14);
  w.rot('head', 8 + 2 * Math.sin(2 * phi));
  earsRest(w, ctx, 3 * Math.sin(2 * phi), 4);
  tail(w, -30, 4, 2, 9 * Math.sin(phi));
  void t;
};

export const sit: DogPoseFn = (w, t, ctx) => {
  stand(w, ctx);
  const p = ctx.p;
  const drop = groundDrop(p) + p.bellyRadius * 0.12;
  const L = p.bodyLength * 0.7;
  const tilt = Math.asin(clamp(drop / L, -1, 1)) * rad2deg;
  w.pos('pelvis', 0, -drop, 0);
  w.rot('pelvis', -tilt);
  w.rot('spine_01', -2);
  w.rot('spine_02', 0);
  w.mirror('upper_arm_l', 'upper_arm_r', tilt - 4, 0, 4);
  w.mirror('forearm_l', 'forearm_r', 4);
  w.mirror('paw_fl', 'paw_fr', -tilt);
  w.mirror('thigh_l', 'thigh_r', -(86 - tilt), 0, 14);
  w.mirror('shin_l', 'shin_r', 118, 0, -6);
  w.mirror('paw_bl', 'paw_br', -32);
  w.rot('neck', -24 - tilt * 0.4);
  w.rot('head', 6 + tilt * 0.3);
  tail(w, -62 - tilt * 0.4, 10, 8);
  breathing(w, t, ctx, 0.014, 3.6);
};

function lying(w: FrameWriter, ctx: DogPoseContext): void {
  stand(w, ctx);
  const p = ctx.p;
  w.pos('pelvis', 0, -groundDrop(p), 0);
  w.rot('pelvis', 0);
  w.mirror('upper_arm_l', 'upper_arm_r', -84, 0, 6);
  w.mirror('forearm_l', 'forearm_r', -4);
  w.mirror('paw_fl', 'paw_fr', -2);
  w.mirror('thigh_l', 'thigh_r', -70, 0, 34);
  w.mirror('shin_l', 'shin_r', 122, 0, -22);
  w.mirror('paw_bl', 'paw_br', -40);
  tail(w, -24, 8, 6);
  w.rot('tail_01', -24, 28);
}

export const lieDown: DogPoseFn = (w, t, ctx) => {
  lying(w, ctx);
  w.rot('neck', -26);
  w.rot('head', 12);
  earsRest(w, ctx, -4, 0);
  breathing(w, t, ctx, 0.014, 3.6);
};

export const restLoop: DogPoseFn = (w, t, ctx) => {
  lying(w, ctx);
  const p = ctx.p;
  w.rot('neck', 22);
  w.rot('head', 30);
  w.pos('neck', 0, -p.chestRadius * 0.12, 0);
  earsRest(w, ctx, 6, 10);
  breathing(w, t, ctx, 0.022, 4.6);
};

export const eat: DogPoseFn = (w, t, ctx) => {
  stand(w, ctx);
  w.rot('spine_02', 8);
  w.rot('neck', 42);
  w.rot('head', 38);
  w.mirror('upper_arm_l', 'upper_arm_r', -8, 0, 7);
  w.mirror('forearm_l', 'forearm_r', 6);
  const chew = ctx.hold ? 0 : Math.max(0, Math.sin(TAU * t * 2.4));
  w.rot('jaw', 14 * chew);
  earsRest(w, ctx, -8, 2);
  const wag = ctx.hold ? 0 : 9 * Math.sin((TAU * t) / 0.9);
  tail(w, -26, 4, 2, wag);
};

export const playBow: DogPoseFn = (w, t, ctx) => {
  stand(w, ctx);
  const tilt = 30;
  w.rot('pelvis', tilt);
  w.pos('pelvis', 0, 0.008, 0);
  w.mirror('upper_arm_l', 'upper_arm_r', -104, 0, 10);
  w.mirror('forearm_l', 'forearm_r', 8);
  w.mirror('paw_fl', 'paw_fr', -10);
  w.mirror('thigh_l', 'thigh_r', -tilt + 4, 0, 4);
  w.mirror('shin_l', 'shin_r', -4);
  w.mirror('paw_bl', 'paw_br', 0);
  w.rot('spine_02', -6);
  w.rot('neck', -tilt - 22);
  w.rot('head', -4);
  earsRest(w, ctx, -14, -4);
  const wag = ctx.hold ? 0 : 16 * Math.sin((TAU * t) / 0.55);
  tail(w, 48, 16, 6, wag);
};

export const turnAway: DogPoseFn = (w, t, ctx) => {
  stand(w, ctx);
  w.rot('pelvis', 0, 34);
  w.pos('pelvis', 0, -0.004, -0.012);
  w.rot('spine_01', 0, 10);
  w.rot('spine_02', 4, 8);
  w.rot('neck', 18, 28);
  w.rot('head', 16, 22);
  earsRest(w, ctx, 26, -8);
  tail(w, -74, -14, -6);
  w.mirror('upper_arm_l', 'upper_arm_r', 8, 0, 2);
  breathing(w, t, ctx, 0.01, 2.4);
};

export const tenseIdle: DogPoseFn = (w, t, ctx) => {
  stand(w, ctx);
  const shift = ctx.hold ? 0 : 0.004 * Math.sin((TAU * t) / 1.9);
  w.pos('pelvis', 0, -0.01, -0.016 + shift);
  w.rot('spine_01', 2);
  w.rot('spine_02', 4);
  w.rot('neck', 2);
  w.rot('head', 2);
  w.mirror('upper_arm_l', 'upper_arm_r', -14, 0, 2);
  w.mirror('forearm_l', 'forearm_r', 10);
  w.mirror('thigh_l', 'thigh_r', 10, 0, 2);
  w.mirror('shin_l', 'shin_r', -6);
  earsRest(w, ctx, 34, -10);
  tail(w, -80, -12, -4);
  breathing(w, t, ctx, 0.007, 1.1);
};

export const tiredIdle: DogPoseFn = (w, t, ctx) => {
  stand(w, ctx);
  const sway = ctx.hold ? 0 : Math.sin((TAU * t) / 4.2);
  w.rot('pelvis', 0, 0, 2.5 * sway);
  w.pos('pelvis', 0, -0.012, 0);
  w.rot('spine_02', 4);
  w.rot('neck', 24, 3 * sway);
  w.rot('head', 16);
  earsRest(w, ctx, 10, 12);
  tail(w, -66, -10, -4);
  w.mirror('forearm_l', 'forearm_r', 6);
  w.mirror('shin_l', 'shin_r', 6);
  breathing(w, t, ctx, 0.018, 4.4);

};

export const recover: DogPoseFn = (w, t, ctx) => {
  tenseIdle(w, t, ctx);
  const k = smooth(0, 2, t);
  if (k > 0) {
    const main = w.frame;
    w.frame = ctx.scratch;
    idleRelaxed(w, t, ctx);
    w.frame = main;
    lerpFrames(main, main, ctx.scratch, k);
  }
  // A short shake-off of the head half way through.
  const shake = t > 0.6 && t < 1.3 ? Math.sin(TAU * (t - 0.6) * 3.5) * 12 * (1 - (t - 0.6) / 0.7) : 0;
  w.addRot('head', 0, 0, shake);
};

/** Alert orientation differs from backward-weighted stress: forward ears and a raised fast tail. */
export const alertFocus: DogPoseFn = (w, t, ctx) => {
  stand(w, ctx);
  w.pos('pelvis', 0, -.004, .014);
  w.rot('neck', -18 + ctx.lookPitch * .4, clamp(ctx.lookYaw, -70, 70) * .4);
  w.rot('head', 4 + ctx.lookPitch * .6, clamp(ctx.lookYaw, -70, 70) * .6);
  earsRest(w, ctx, -16, -6);
  tail(w, 48, 12, 6, ctx.hold ? 0 : 22 * Math.sin(TAU * t * 2));
  breathing(w, t, ctx, .01, 1.8);
};

export const restSide: DogPoseFn = (w, t, ctx) => {
  lying(w, ctx);
  w.rot('pelvis', 0, 0, 72);
  w.rot('neck', 20);
  w.rot('head', 20);
  earsRest(w, ctx, 4, 8);
  breathing(w, t, ctx, .02, 4.6);
};

export const standUp: DogPoseFn = (w, t, ctx) => {
  restLoop(w, t, ctx);
  const main = w.frame;
  w.frame = ctx.scratch;
  tiredIdle(w, t, ctx);
  w.frame = main;
  lerpFrames(main, main, ctx.scratch, smooth(0, 1.8, t));
};

export const DOG_POSES: Record<PoseId, DogPoseFn> = {
  idle_relaxed: idleRelaxed,
  look_at_handler: lookAtHandler,
  sniff,
  walk,
  sit,
  lie_down: lieDown,
  rest_loop: restLoop,
  eat,
  play_bow: playBow,
  turn_away: turnAway,
  tense_idle: tenseIdle,
  tired_idle: tiredIdle,
  recover,
  alert_focus: alertFocus,
  rest_side: restSide,
  stand_up: standUp,
};

/** 08 clip contract: loops keep animating; one-shots settle and hold their last keyframe. */
export const DOG_ONE_SHOT_SECONDS: Partial<Record<PoseId, number>> = {
  look_at_handler: 1.6,
  sit: 1.4,
  lie_down: 1.6,
  eat: 3.6,
  play_bow: 1.6,
  turn_away: 1.6,
  recover: 2.2,
  stand_up: 1.8,
};

/** Clip events (08: external clip metadata), seconds from clip start. */
export const DOG_CLIP_EVENTS: Partial<Record<PoseId, Record<string, number>>> = {
  eat: { treat_received: 2.0 },
};

/** Walk cycle length in metres (two steps), tied to leg length so paws do not slide. */
export function walkCycleLength(p: DogProportions): number {
  return 1.7 * (p.legUpper + p.legLower);
}

/** Walking speed, metres per second. */
export function walkSpeed(p: DogProportions): number {
  return 1.1 * walkCycleLength(p);
}
