/**
 * The thirteen dog clips of the 08 clip contract, generated per proportion set (no retargeting).
 * Rotations are local Euler degrees relative to the rest pose (identity):
 *   +X pitch (nose/foot down-backward, tail up), +Y yaw to the dog's left (+X side), +Z roll.
 * Leg bones hang along -Y: negative X swings a leg forward, positive X backward.
 * Non-loop clips start from a sensible pose for cross-fades and hold their final pose; loops end
 * exactly where they start.
 */
import { Pose, keyed, ease, osc } from './pose.mjs';

export const DOG_CLIP_META = {
  alert_focus: { durationS: 2, loop: true },
  rest_side: { durationS: 5, loop: true },
  stand_up: { durationS: 1.8, loop: false },
  idle_relaxed: { durationS: 4, loop: true },
  look_at_handler: { durationS: 1.5, loop: false },
  sniff: { durationS: 2.5, loop: true },
  walk: { durationS: 1, loop: true },
  sit: { durationS: 1.5, loop: false },
  lie_down: { durationS: 1.5, loop: false },
  rest_loop: { durationS: 5, loop: true },
  eat: { durationS: 4, loop: false, events: { treat_received: 2.0 } },
  play_bow: { durationS: 1.5, loop: false },
  turn_away: { durationS: 1.5, loop: false },
  tense_idle: { durationS: 2.5, loop: true },
  tired_idle: { durationS: 3.5, loop: true },
  recover: { durationS: 2, loop: false },
};

const FRONT = [['leg_fl_upper', 'leg_fr_upper'], ['leg_fl_lower', 'leg_fr_lower'], ['paw_fl', 'paw_fr']];
const BACK = [['leg_bl_upper', 'leg_br_upper'], ['leg_bl_lower', 'leg_br_lower'], ['paw_bl', 'paw_br']];

/** Bisection for f(x) = 0 on [lo, hi]. */
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

export function buildDogClips(P, skeleton, L) {
  const pawY = L.pawJointY;
  const jointY = (pose, bone) => skeleton.jointPosition(pose, bone)[1];
  const tailLen = P.tailLen;

  // ------------------------------------------------------------ additive layers
  const breathing = (t, period, amp = 1) => {
    const s = osc(t, period);
    const p = new Pose();
    p.rot('spine_01', 1.2 * amp * s);
    p.rot('spine_02', -1.0 * amp * s);
    p.rot('neck', -1.4 * amp * s);
    p.rot('head', 0.8 * amp * s);
    return p;
  };
  const tailWag = (t, period, amp, lift = 0) => {
    const p = new Pose();
    p.rot('tail_01', lift, amp * osc(t, period));
    p.rot('tail_02', lift * 0.3, amp * 1.1 * osc(t, period, -0.08));
    p.rot('tail_03', lift * 0.2, amp * 1.2 * osc(t, period, -0.16));
    return p;
  };
  const earSway = (t, period, amp) => {
    const p = new Pose();
    p.mirror('ear_l_01', 'ear_r_01', amp * osc(t, period), 0, amp * 0.6 * osc(t, period, 0.25));
    p.mirror('ear_l_02', 'ear_r_02', amp * 0.8 * osc(t, period, -0.1), 0, amp * 0.5 * osc(t, period, 0.15));
    return p;
  };

  /** Floppy ears hang by gravity: counter-rotate them when neck + head pitch down. */
  const earsHang = (pose, factor = 0.8) => {
    const n = pose.get('neck')?.rot[0] ?? 0;
    const h = pose.get('head')?.rot[0] ?? 0;
    const pitch = n + h;
    pose.addMirror('ear_l_01', 'ear_r_01', -pitch * factor * 0.7, 0, -Math.max(0, pitch) * 0.08);
    pose.addMirror('ear_l_02', 'ear_r_02', -pitch * factor * 0.3, 0, 0);
    return pose;
  };

  // ------------------------------------------------------------ key poses
  const STAND = new Pose();

  const EARS_BACK = new Pose().mirror('ear_l_01', 'ear_r_01', 20, 0, 8).mirror('ear_l_02', 'ear_r_02', 10, 0, 4);
  const EARS_FORWARD = new Pose().mirror('ear_l_01', 'ear_r_01', -14, 0, -6).mirror('ear_l_02', 'ear_r_02', -6, 0, -4);

  // sit: pelvis down and pitched up, hind legs folded, front legs straight and vertical
  const SIT = (() => {
    const tilt = 24;
    const base = new Pose();
    base.rot('pelvis', -tilt);
    base.mirror(...FRONT[0], tilt);
    base.mirror(...BACK[0], -52, 0, 16);
    base.rot('spine_01', -4);
    base.rot('neck', -8);
    base.rot('head', 6);
    base.rot('tail_01', 14, 18, 0);
    base.rot('tail_02', -6, 16);
    base.rot('tail_03', -4, 14);
    // pelvis drop so the front paws keep ground contact
    const drop = solve((d) => jointY(base.clone().pos('pelvis', 0, -d, 0), 'paw_fl') - pawY, 0, 0.25);
    base.pos('pelvis', 0, -drop, 0.012);
    // hind shin so the hind paws touch the ground
    const shin = solve((a) => {
      const p = base.clone();
      p.mirror(...BACK[1], a);
      return jointY(p, 'paw_bl') - pawY;
    }, 20, 150);
    base.mirror(...BACK[1], shin);
    const pawRot = -(-tilt - 52 + shin);
    base.mirror(...BACK[2], pawRot);
    return base;
  })();

  // sternal lie: chest on the ground, forearms flat forward, hind legs tucked
  const LIE = (() => {
    const base = new Pose();
    const chestBottom = L.spineFrontY - P.chestRy * 1.1;
    const drop = chestBottom - 0.012;
    base.pos('pelvis', 0, -drop, 0);
    base.rot('pelvis', 2);
    const elbowY = P.legLowerR * 1.05 + 0.004;
    const a1 = solve((a) => {
      const p = base.clone();
      p.mirror(...FRONT[0], a, 0, 4);
      return jointY(p, 'leg_fl_lower') - elbowY;
    }, -120, 0);
    base.mirror(...FRONT[0], a1, 0, 4);
    const a2 = solve((a) => {
      const p = base.clone();
      p.mirror(...FRONT[1], a);
      return jointY(p, 'paw_fl') - (pawY + 0.006);
    }, -120, 30);
    base.mirror(...FRONT[1], a2);
    base.mirror(...FRONT[2], -(2 + a1 + a2));
    base.mirror(...BACK[0], -70, 0, 24);
    const shin = solve((a) => {
      const p = base.clone();
      p.mirror(...BACK[1], a);
      return jointY(p, 'paw_bl') - (pawY + 0.004);
    }, 40, 170);
    base.mirror(...BACK[1], shin);
    base.mirror(...BACK[2], -(2 - 70 + shin));
    base.rot('neck', 18);
    base.rot('head', -6);
    base.rot('tail_01', -34, 22);
    base.rot('tail_02', -8, 24);
    base.rot('tail_03', 0, 26);
    return base;
  })();

  const REST = LIE.clone();
  REST.rot('neck', 50);
  REST.rot('head', 14);
  earsHang(REST);
  earsHang(LIE);

  // play bow: elbows down, rear up, tail high, head up to the handler
  const BOW = (() => {
    const tilt = 26;
    const base = new Pose();
    base.rot('pelvis', tilt);
    base.pos('pelvis', 0, 0.004, 0);
    base.mirror(...BACK[0], -tilt + 2);
    base.mirror(...BACK[1], 0);
    base.mirror(...BACK[2], -2);
    base.rot('spine_01', -4);
    base.rot('spine_02', -6);
    const elbowY = P.legLowerR * 1.05 + 0.006;
    const upper = solve((a) => {
      const p = base.clone();
      p.mirror(...FRONT[0], a, 0, 6);
      return jointY(p, 'leg_fl_lower') - elbowY;
    }, -130, -45);
    base.mirror(...FRONT[0], upper, 0, 6);
    const lower = solve((a) => {
      const p = base.clone();
      p.mirror(...FRONT[1], a);
      return jointY(p, 'paw_fl') - (pawY + 0.006);
    }, -120, 40);
    base.mirror(...FRONT[1], lower);
    base.mirror(...FRONT[2], -(tilt - 10 + upper + lower));
    base.rot('neck', -34);
    base.rot('head', -16);
    base.rot('tail_01', 42, 0);
    base.rot('tail_02', 12);
    base.rot('tail_03', 8);
    base.add(EARS_FORWARD);
    return base;
  })();

  const TENSE = new Pose();
  TENSE.pos('pelvis', 0, -0.008, -0.018);
  TENSE.rot('pelvis', -3);
  TENSE.rot('spine_01', 2);
  TENSE.rot('spine_02', 3);
  TENSE.mirror(...FRONT[0], 8);
  TENSE.mirror(...BACK[0], -8);
  TENSE.mirror(...BACK[1], 10);
  TENSE.mirror(...BACK[2], -5);
  TENSE.rot('neck', 14);
  TENSE.rot('head', -4);
  TENSE.rot('tail_01', -48);
  TENSE.rot('tail_02', -16);
  TENSE.rot('tail_03', -10);
  TENSE.add(EARS_BACK);
  earsHang(TENSE, 0.5);

  const TIRED = new Pose();
  TIRED.rot('neck', 34);
  TIRED.rot('head', 10);
  TIRED.rot('spine_01', 2);
  TIRED.pos('pelvis', 0, -0.006, 0);
  TIRED.rot('tail_01', -26);
  TIRED.rot('tail_02', -8);
  TIRED.rot('tail_03', -4);
  TIRED.mirror('ear_l_01', 'ear_r_01', 8, 0, 4);
  earsHang(TIRED);

  const LOOK = new Pose();
  LOOK.rot('spine_02', 0, 7, 0);
  LOOK.rot('neck', -10, 14, -3);
  LOOK.rot('head', -6, 20, -4);
  LOOK.rot('tail_01', 14);
  LOOK.rot('tail_02', 6);
  LOOK.add(EARS_FORWARD, 0.7);

  const SNIFF = new Pose();
  SNIFF.rot('neck', 58);
  SNIFF.rot('head', 22);
  SNIFF.rot('spine_02', 6);
  SNIFF.rot('tail_01', -12);
  SNIFF.pos('pelvis', 0, 0, 0.006);
  SNIFF.mirror(...FRONT[0], -4);
  earsHang(SNIFF);

  const EAT = (() => {
    const base = new Pose();
    base.rot('spine_02', 8);
    base.rot('spine_01', 3);
    base.mirror(...FRONT[0], -6, 0, 5);
    base.pos('pelvis', 0, -0.004, 0.004);
    // neck/head so the nose reaches ~0.08 m (bowl height)
    const neck = solve((a) => {
      const p = base.clone();
      p.rot('neck', a);
      p.rot('head', a * 0.45);
      return skeleton.posedPoint(p, 'head', L.noseTip)[1] - 0.085;
    }, 10, 95);
    base.rot('neck', neck);
    base.rot('head', neck * 0.45);
    base.rot('tail_01', -4);
    earsHang(base);
    return base;
  })();

  const AWAY = new Pose();
  AWAY.rot('root', 0, -70, 0);
  AWAY.rot('spine_01', 0, -6, 0);
  AWAY.rot('spine_02', 0, -8, 0);
  AWAY.rot('neck', 24, -8, 0);
  AWAY.rot('head', 8, -10, 0);
  AWAY.rot('tail_01', -40);
  AWAY.rot('tail_02', -12);
  AWAY.rot('tail_03', -8);
  AWAY.add(EARS_BACK, 0.8);
  earsHang(AWAY, 0.6);
  AWAY.mirror(...FRONT[0], 2);

  // ------------------------------------------------------------ clips
  const clips = [];
  const def = (name, pose) => {
    const meta = DOG_CLIP_META[name];
    clips.push({ name, duration: meta.durationS, loop: meta.loop, pose });
  };

  def('idle_relaxed', (t) => {
    const p = STAND.clone();
    p.add(breathing(t, 2, 1));
    p.add(tailWag(t, 2, 7, 2));
    p.add(earSway(t, 4, 1.5));
    // tiny weight shift over the full loop
    p.addRot('spine_01', 0, 0, 0.8 * osc(t, 4));
    p.addRot('head', 0, 2.5 * osc(t, 4, 0.1), 0);
    return p;
  });

  def('look_at_handler', (() => {
    const k = keyed([
      [0, STAND],
      [0.55, LOOK, ease.smoother],
      [1.5, LOOK, ease.linear],
    ]);
    return (t) => {
      const p = k(t);
      p.add(tailWag(t, 0.75, 8 * Math.min(1, t / 0.5), 0));
      p.add(breathing(t, 2, 0.6));
      return p;
    };
  })());

  def('sniff', (t) => {
    const p = SNIFF.clone();
    // lateral sweep of the nose, small forward/back bob, ears forward
    p.addRot('head', 4 * osc(t, 1.25, 0.25), 24 * osc(t, 2.5), 0);
    p.addRot('neck', 3 * osc(t, 0.625), 8 * osc(t, 2.5, -0.05), 0);
    p.addPos('pelvis', 0, 0, 0.006 * osc(t, 2.5, 0.25));
    p.add(tailWag(t, 1.25, 5, 0));
    p.add(EARS_FORWARD, 0.5);
    p.addMirror('ear_l_02', 'ear_r_02', 3 * osc(t, 0.625), 0, 0);
    return p;
  });

  def('walk', (t) => {
    const p = new Pose();
    const A = 24;
    const legs = [
      ['leg_fl_upper', 'leg_fl_lower', 'paw_fl', 0.0],
      ['leg_br_upper', 'leg_br_lower', 'paw_br', 0.0],
      ['leg_fr_upper', 'leg_fr_lower', 'paw_fr', 0.5],
      ['leg_bl_upper', 'leg_bl_lower', 'paw_bl', 0.5],
    ];
    for (const [u, l, paw, phase] of legs) {
      const ph = 2 * Math.PI * (t + phase);
      const upper = -A * Math.sin(ph);
      const swing = Math.max(0, -Math.cos(ph));
      const lower = 42 * swing * swing + 4;
      p.rot(u, upper);
      p.rot(l, lower);
      p.rot(paw, -(upper + lower) * 0.55);
    }
    p.pos('pelvis', 0, 0.006 * osc(t, 0.5, 0.25), 0);
    p.rot('pelvis', 0, 2 * osc(t, 1), 1.5 * osc(t, 1, 0.25));
    p.rot('spine_01', 0, 3 * osc(t, 1, 0.05), 0);
    p.rot('spine_02', -1, -3 * osc(t, 1), 0);
    p.rot('neck', -8 + 2.5 * osc(t, 0.5, 0.1), 0, 0);
    p.rot('head', 4 - 2 * osc(t, 0.5, 0.1), 0, 0);
    p.add(tailWag(t, 1, 10, 6));
    p.add(earSway(t, 0.5, 4));
    return p;
  });

  def('sit', (() => {
    const mid = Pose.lerp(STAND, SIT, 0.6);
    mid.addRot('neck', -4);
    const k = keyed([
      [0, STAND],
      [0.75, mid, ease.inOutSine],
      [1.15, SIT, ease.outCubic],
      [1.5, SIT, ease.linear],
    ]);
    return (t) => {
      const p = k(t);
      p.add(breathing(t, 2, 0.5));
      p.add(tailWag(t, 1.5, 4 * Math.max(0, 1 - t / 1.3), 0));
      return p;
    };
  })());

  def('lie_down', (() => {
    const k = keyed([
      [0, STAND],
      [0.6, Pose.lerp(STAND, SIT, 0.7), ease.inOutSine],
      [1.25, LIE, ease.smoother],
      [1.5, LIE, ease.linear],
    ]);
    return (t) => k(t).add(breathing(t, 2, 0.4));
  })());

  def('rest_loop', (t) => {
    const p = REST.clone();
    const s = osc(t, 5 / 2);
    p.addRot('spine_01', 1.0 * s);
    p.addRot('spine_02', -0.8 * s);
    p.addRot('neck', -1.2 * s, 0, 0);
    p.addRot('head', 0.8 * s, 1.5 * osc(t, 5), 0);
    p.addMirror('ear_l_02', 'ear_r_02', 1.5 * osc(t, 5, 0.2), 0, 0);
    p.addRot('tail_03', 0, 4 * osc(t, 5), 0);
    return p;
  });

  def('eat', (() => {
    const k = keyed([
      [0, STAND],
      [0.8, EAT, ease.smoother],
      [3.3, EAT, ease.linear],
      [4.0, Pose.lerp(STAND, EAT, 0.08), ease.smoother],
    ]);
    return (t) => {
      const p = k(t);
      const chewing = t > 0.75 && t < 3.4 ? 1 : 0;
      const jaw = chewing ? 9 + 9 * Math.sin(2 * Math.PI * (t - 0.75) * 2.5) : 0;
      p.rot('jaw', Math.max(0, jaw));
      p.addRot('head', chewing ? 2 * osc(t - 0.75, 0.4, 0.25) : 0, chewing ? 4 * osc(t, 1.6) : 0, 0);
      p.add(tailWag(t, 1.0, 6, 0));
      p.add(breathing(t, 2, 0.4));
      return p;
    };
  })());

  def('play_bow', (() => {
    const k = keyed([
      [0, STAND],
      [0.45, BOW, ease.outBack],
      [1.5, BOW, ease.linear],
    ]);
    return (t) => {
      const p = k(t);
      p.add(tailWag(t, 0.5, 14 * Math.min(1, t / 0.4), 0));
      p.addRot('head', 0, 6 * osc(t, 1.5, 0.3), 0);
      return p;
    };
  })());

  def('turn_away', (() => {
    const k = keyed([
      [0, STAND],
      [1.1, AWAY, ease.smoother],
      [1.5, AWAY, ease.linear],
    ]);
    return (t) => {
      const p = k(t);
      // legs step through the turn: small alternating lifts
      const step = Math.min(1, t / 0.9) * (1 - Math.max(0, (t - 0.9) / 0.4));
      p.addMirror('leg_fl_upper', 'leg_fr_upper', 0, 0, 0);
      p.addRot('leg_fl_upper', -10 * step * Math.max(0, osc(t, 0.6)));
      p.addRot('leg_fl_lower', 20 * step * Math.max(0, osc(t, 0.6)));
      p.addRot('leg_fr_upper', -10 * step * Math.max(0, osc(t, 0.6, 0.5)));
      p.addRot('leg_fr_lower', 20 * step * Math.max(0, osc(t, 0.6, 0.5)));
      p.addRot('leg_bl_upper', -8 * step * Math.max(0, osc(t, 0.6, 0.25)));
      p.addRot('leg_bl_lower', 16 * step * Math.max(0, osc(t, 0.6, 0.25)));
      p.addRot('leg_br_upper', -8 * step * Math.max(0, osc(t, 0.6, 0.75)));
      p.addRot('leg_br_lower', 16 * step * Math.max(0, osc(t, 0.6, 0.75)));
      p.add(breathing(t, 2, 0.4));
      return p;
    };
  })());

  def('tense_idle', (t) => {
    const p = TENSE.clone();
    // shallow fast breathing, minimal motion, a small tremor in the ears
    p.add(breathing(t, 1.25, 0.5));
    p.addRot('head', 0, 1.5 * osc(t, 2.5), 0);
    p.addMirror('ear_l_02', 'ear_r_02', 2 * osc(t, 0.625), 0, 0);
    p.addRot('tail_03', 0, 2 * osc(t, 1.25), 0);
    return p;
  });

  def('tired_idle', (t) => {
    const p = TIRED.clone();
    // slow sway and a head dip (blink implied)
    const dip = Math.max(0, osc(t, 3.5, 0.0)) ** 3;
    p.addRot('neck', 6 * dip, 0, 2.5 * osc(t, 3.5, 0.2));
    p.addRot('head', 10 * dip, 3 * osc(t, 3.5, 0.3), 0);
    p.addRot('spine_01', 1.5 * osc(t, 1.75), 0, 1.5 * osc(t, 3.5));
    p.addRot('spine_02', 0, 0, -1 * osc(t, 3.5));
    p.addPos('pelvis', 0, 0.003 * osc(t, 1.75), 0);
    p.add(earSway(t, 3.5, 2));
    p.addRot('tail_02', 0, 3 * osc(t, 3.5), 0);
    return p;
  });

  def('recover', (() => {
    const shake = STAND.clone();
    shake.rot('neck', -6);
    shake.rot('head', -4);
    shake.rot('tail_01', 12);
    const k = keyed([
      [0, TENSE],
      [0.9, Pose.lerp(TENSE, STAND, 0.6), ease.inOutSine],
      [1.5, shake, ease.smoother],
      [2.0, STAND, ease.smooth],
    ]);
    return (t) => {
      const p = k(t);
      const w = t > 1.0 ? Math.min(1, (t - 1.0) / 0.3) * Math.max(0, 1 - (t - 1.6) / 0.4) : 0;
      p.add(tailWag(t, 0.6, 12 * w, 0));
      p.addRot('head', 0, 0, 10 * w * osc(t, 0.3));
      p.add(breathing(t, 2, 0.5));
      return p;
    };
  })());

  return clips;
}
