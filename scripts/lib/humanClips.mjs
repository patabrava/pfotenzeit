/**
 * Human clips: idle (loop), greet, gesture_explain, offer_reward, kneel.
 * Local rotations relative to the rest pose. Arms hang along -Y: -X swings forward, +X backward;
 * for the left arm +Z moves the hand outward, for the right arm -Z does (Pose.mirror handles it).
 */
import { Pose, keyed, ease, osc } from './pose.mjs';

export const HUMAN_CLIP_META = {
  idle: { durationS: 4, loop: true },
  greet: { durationS: 1.5, loop: false },
  gesture_explain: { durationS: 2, loop: false },
  offer_reward: { durationS: 2, loop: false },
  kneel: { durationS: 1.5, loop: false },
};

function solve(f, lo, hi, iterations = 40) {
  let flo = f(lo);
  for (let i = 0; i < iterations; i++) {
    const m = (lo + hi) / 2;
    const fm = f(m);
    if ((fm < 0) === (flo < 0)) {
      lo = m;
      flo = fm;
    } else hi = m;
  }
  return (lo + hi) / 2;
}

export function buildHumanClips(H, skeleton, L) {
  const jointY = (pose, bone) => skeleton.jointPosition(pose, bone)[1];
  const ankleY = skeleton.get('foot_l').head[1];

  const breathing = (t, period, amp = 1) => {
    const s = osc(t, period);
    const p = new Pose();
    p.rot('chest', -1.2 * amp * s);
    p.rot('spine', 0.6 * amp * s);
    p.rot('neck', 0.8 * amp * s);
    p.mirror('upper_arm_l', 'upper_arm_r', 0, 0, 1.2 * amp * s);
    return p;
  };

  // relaxed stance: arms slightly away from the body, elbows a touch bent
  const STAND = new Pose();
  STAND.mirror('upper_arm_l', 'upper_arm_r', 2, 0, 7);
  STAND.mirror('lower_arm_l', 'lower_arm_r', -8, 0, 0);
  STAND.mirror('hand_l', 'hand_r', -4, 0, 2);

  // greeting: right hand raised beside the head, open palm
  const GREET = STAND.clone();
  GREET.rot('upper_arm_r', -28, 0, 118);
  GREET.rot('lower_arm_r', -24, 0, 36);
  GREET.rot('hand_r', 0, 0, 10);
  GREET.rot('chest', 0, -6, 3);
  GREET.rot('head', -4, -8, -6);

  // explaining: open side-on posture, the left forearm gestures with the palm up
  const EXPLAIN = STAND.clone();
  EXPLAIN.rot('hips', 0, 22, 0);
  EXPLAIN.rot('spine', 0, 6, 0);
  EXPLAIN.rot('chest', 0, 8, 0);
  EXPLAIN.rot('head', 2, -18, 0);
  EXPLAIN.rot('upper_arm_l', -26, 0, 22);
  EXPLAIN.rot('lower_arm_l', -72, 24, 0);
  EXPLAIN.rot('hand_l', -10, 0, -30);
  EXPLAIN.rot('upper_arm_r', 4, 0, 8);
  EXPLAIN.rot('lower_arm_r', -14, 0, 0);

  // reward: knees bend, torso lowers ~0.3 m, right hand forward and low; never leaning over the dog
  const OFFER = (() => {
    const p = STAND.clone();
    const thigh = -58;
    const shin = 98;
    p.mirror('upper_leg_l', 'upper_leg_r', thigh, 0, 6);
    p.mirror('lower_leg_l', 'lower_leg_r', shin);
    p.mirror('foot_l', 'foot_r', -(thigh + shin) + 2);
    const drop = solve((d) => jointY(p.clone().pos('hips', 0, -d, 0), 'foot_l') - ankleY, 0, 0.8);
    p.pos('hips', 0, -drop, 0.02);
    p.rot('hips', 6);
    p.rot('spine', 4);
    p.rot('chest', 2);
    p.rot('neck', 10);
    p.rot('head', 8);
    p.rot('upper_arm_r', -52, 0, 10);
    p.rot('lower_arm_r', -36, 0, 4);
    p.rot('hand_r', 60, 0, 0);
    p.rot('upper_arm_l', -10, 0, 10);
    p.rot('lower_arm_l', -40, 0, 0);
    return p;
  })();

  // kneel: left knee on the ground, right foot forward, upright torso, hands resting low
  const KNEEL = (() => {
    const p = STAND.clone();
    p.rot('upper_leg_l', 6, 0, 4);
    p.rot('lower_leg_l', 88);
    p.rot('foot_l', 72);
    p.rot('upper_leg_r', -88, 0, -8);
    p.rot('lower_leg_r', 86);
    p.rot('foot_r', 2);
    const drop = solve((d) => jointY(p.clone().pos('hips', 0, -d, 0), 'foot_r') - ankleY, 0, 1.0);
    p.pos('hips', 0, -drop, 0.0);
    p.rot('hips', 4);
    p.rot('spine', 2);
    p.rot('neck', 8);
    p.rot('head', 6);
    p.rot('upper_arm_r', -40, 0, 8);
    p.rot('lower_arm_r', -40, 0, 0);
    p.rot('hand_r', 30, 0, 0);
    p.rot('upper_arm_l', -22, 0, 8);
    p.rot('lower_arm_l', -62, 0, 0);
    return p;
  })();

  const clips = [];
  const def = (name, pose) => {
    const meta = HUMAN_CLIP_META[name];
    clips.push({ name, duration: meta.durationS, loop: meta.loop, pose });
  };

  def('idle', (t) => {
    const p = STAND.clone();
    p.add(breathing(t, 4, 1));
    p.addRot('hips', 0, 0, 1.2 * osc(t, 4));
    p.addRot('spine', 0, 0, -1.0 * osc(t, 4));
    p.addRot('head', 1.5 * osc(t, 4, 0.3), 3 * osc(t, 4, 0.15), 0);
    p.addMirror('upper_arm_l', 'upper_arm_r', 1.5 * osc(t, 4, 0.1), 0, 0);
    return p;
  });

  def('greet', (() => {
    const k = keyed([
      [0, STAND],
      [0.45, GREET, ease.outBack],
      [1.5, GREET, ease.linear],
    ]);
    return (t) => {
      const p = k(t);
      const w = t > 0.4 ? Math.min(1, (t - 0.4) / 0.2) * Math.max(0, 1 - (t - 1.2) / 0.3) : 0;
      p.addRot('lower_arm_r', 0, 0, 16 * w * osc(t, 0.5));
      p.addRot('hand_r', 0, 0, 8 * w * osc(t, 0.5, 0.1));
      p.add(breathing(t, 4, 0.5));
      return p;
    };
  })());

  def('gesture_explain', (() => {
    const k = keyed([
      [0, STAND],
      [0.6, EXPLAIN, ease.smoother],
      [2.0, EXPLAIN, ease.linear],
    ]);
    return (t) => {
      const p = k(t);
      const w = t > 0.6 ? Math.min(1, (t - 0.6) / 0.2) : 0;
      p.addRot('lower_arm_l', -14 * w * Math.max(0, osc(t - 0.6, 1.4)), 0, 0);
      p.addRot('hand_l', 0, 0, -12 * w * Math.max(0, osc(t - 0.6, 1.4)));
      p.addRot('head', 0, 0, 3 * w * osc(t, 2));
      p.add(breathing(t, 4, 0.5));
      return p;
    };
  })());

  def('offer_reward', (() => {
    const k = keyed([
      [0, STAND],
      [0.9, OFFER, ease.smoother],
      [2.0, OFFER, ease.linear],
    ]);
    return (t) => {
      const p = k(t);
      const w = t > 0.9 ? Math.min(1, (t - 0.9) / 0.3) : 0;
      p.addRot('lower_arm_r', -6 * w * Math.max(0, osc(t - 0.9, 1.1)), 0, 0);
      p.add(breathing(t, 4, 0.5));
      return p;
    };
  })());

  def('kneel', (() => {
    const k = keyed([
      [0, STAND],
      [0.5, Pose.lerp(STAND, OFFER, 0.6), ease.inOutSine],
      [1.2, KNEEL, ease.smoother],
      [1.5, KNEEL, ease.linear],
    ]);
    return (t) => k(t).add(breathing(t, 4, 0.5));
  })());

  return clips;
}
