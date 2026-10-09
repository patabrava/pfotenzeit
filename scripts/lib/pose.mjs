/**
 * Pose and clip authoring helpers. A Pose maps bone name → {rot [x,y,z] degrees (local, XYZ order),
 * pos [x,y,z] metres (offset added to the rest translation)}. Clips are functions of time that
 * return a Pose; they are sampled into LINEAR keyframes with quaternion outputs at export time.
 */
import { Euler, Quaternion } from 'three';

export class Pose {
  constructor() {
    this.map = new Map();
  }

  static from(obj) {
    const p = new Pose();
    for (const [name, v] of Object.entries(obj)) {
      if (v.rot) p.rot(name, ...v.rot);
      if (v.pos) p.pos(name, ...v.pos);
    }
    return p;
  }

  entry(name) {
    let e = this.map.get(name);
    if (!e) {
      e = { rot: [0, 0, 0], pos: [0, 0, 0] };
      this.map.set(name, e);
    }
    return e;
  }

  get(name) {
    return this.map.get(name);
  }

  rot(name, x = 0, y = 0, z = 0) {
    const e = this.entry(name);
    e.rot = [x, y, z];
    return this;
  }

  addRot(name, x = 0, y = 0, z = 0) {
    const e = this.entry(name);
    e.rot = [e.rot[0] + x, e.rot[1] + y, e.rot[2] + z];
    return this;
  }

  pos(name, x = 0, y = 0, z = 0) {
    const e = this.entry(name);
    e.pos = [x, y, z];
    return this;
  }

  addPos(name, x = 0, y = 0, z = 0) {
    const e = this.entry(name);
    e.pos = [e.pos[0] + x, e.pos[1] + y, e.pos[2] + z];
    return this;
  }

  /** Mirror-symmetric rotation for a left/right pair: y and z are negated on the right side. */
  mirror(left, right, x = 0, y = 0, z = 0) {
    this.rot(left, x, y, z);
    this.rot(right, x, -y, -z);
    return this;
  }

  addMirror(left, right, x = 0, y = 0, z = 0) {
    this.addRot(left, x, y, z);
    this.addRot(right, x, -y, -z);
    return this;
  }

  clone() {
    const p = new Pose();
    for (const [k, v] of this.map) p.map.set(k, { rot: [...v.rot], pos: [...v.pos] });
    return p;
  }

  /** this += other (rotations and offsets added). */
  add(other, weight = 1) {
    for (const [k, v] of other.map) {
      this.addRot(k, v.rot[0] * weight, v.rot[1] * weight, v.rot[2] * weight);
      this.addPos(k, v.pos[0] * weight, v.pos[1] * weight, v.pos[2] * weight);
    }
    return this;
  }

  static lerp(a, b, t) {
    const out = new Pose();
    const names = new Set([...a.map.keys(), ...b.map.keys()]);
    for (const n of names) {
      const ea = a.map.get(n) ?? { rot: [0, 0, 0], pos: [0, 0, 0] };
      const eb = b.map.get(n) ?? { rot: [0, 0, 0], pos: [0, 0, 0] };
      out.map.set(n, {
        rot: [0, 1, 2].map((i) => ea.rot[i] + (eb.rot[i] - ea.rot[i]) * t),
        pos: [0, 1, 2].map((i) => ea.pos[i] + (eb.pos[i] - ea.pos[i]) * t),
      });
    }
    return out;
  }
}

// ---------------------------------------------------------------- easing
export const ease = {
  linear: (t) => t,
  smooth: (t) => t * t * (3 - 2 * t),
  smoother: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  inOutSine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  outBack: (t) => {
    const c1 = 1.2;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  outCubic: (t) => 1 - (1 - t) ** 3,
  inCubic: (t) => t * t * t,
};

export function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Key-pose timeline: keys = [[time, Pose, easeFn?], ...] sorted by time. Returns a function t → Pose
 * blending between neighbouring keys with the ease function of the segment's end key.
 */
export function keyed(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1].clone();
    const last = keys[keys.length - 1];
    if (t >= last[0]) return last[1].clone();
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const [t0, p0] = keys[i - 1];
        const [t1, p1, fn = ease.smooth] = keys[i];
        const u = fn((t - t0) / (t1 - t0));
        return Pose.lerp(p0, p1, u);
      }
    }
    return last[1].clone();
  };
}

// ---------------------------------------------------------------- sampling
const _e = new Euler();
const _q = new Quaternion();

/**
 * Sample a clip into per-bone tracks.
 * clip: { name, duration, loop, pose: (t) => Pose, fps? }
 * skeleton: Skeleton (for rest translations)
 * Returns { name, duration, loop, tracks: [{ bone, path: 'rotation'|'translation', times: Float32Array, values: Float32Array }] }
 */
export function sampleClip(clip, skeleton, fps = 24) {
  const dt = 1 / fps;
  const times = [];
  for (let t = 0; t < clip.duration - 1e-6; t += dt) times.push(Number(t.toFixed(6)));
  times.push(clip.duration);
  const perBone = new Map();
  for (const t of times) {
    const pose = clip.loop ? clip.pose(t >= clip.duration ? 0 : t) : clip.pose(t);
    for (const bone of skeleton.bones) {
      const e = pose.get(bone.name);
      const rot = e ? e.rot : [0, 0, 0];
      const pos = e ? e.pos : [0, 0, 0];
      let rec = perBone.get(bone.name);
      if (!rec) {
        rec = { rot: [], pos: [], rotUsed: false, posUsed: false };
        perBone.set(bone.name, rec);
      }
      _e.set(rot[0] * (Math.PI / 180), rot[1] * (Math.PI / 180), rot[2] * (Math.PI / 180), 'XYZ');
      _q.setFromEuler(_e).normalize();
      // keep quaternion continuity (avoid sign flips between consecutive keys)
      const prev = rec.rot.length >= 4 ? rec.rot.slice(-4) : null;
      if (prev && prev[0] * _q.x + prev[1] * _q.y + prev[2] * _q.z + prev[3] * _q.w < 0) {
        _q.set(-_q.x, -_q.y, -_q.z, -_q.w);
      }
      rec.rot.push(_q.x, _q.y, _q.z, _q.w);
      if (Math.abs(rot[0]) + Math.abs(rot[1]) + Math.abs(rot[2]) > 1e-6) rec.rotUsed = true;
      const lt = skeleton.localTranslation(bone);
      rec.pos.push(lt[0] + pos[0], lt[1] + pos[1], lt[2] + pos[2]);
      if (Math.abs(pos[0]) + Math.abs(pos[1]) + Math.abs(pos[2]) > 1e-7) rec.posUsed = true;
    }
  }
  const tracks = [];
  const ftimes = new Float32Array(times);
  for (const [bone, rec] of perBone) {
    if (rec.rotUsed) tracks.push({ bone, path: 'rotation', times: ftimes, values: new Float32Array(rec.rot) });
    if (rec.posUsed) tracks.push({ bone, path: 'translation', times: ftimes, values: new Float32Array(rec.pos) });
  }
  return { name: clip.name, duration: clip.duration, loop: clip.loop, tracks };
}

/** Periodic helper: sine with phase in [0,1] and period in seconds. */
export function osc(t, period, phase = 0) {
  return Math.sin(2 * Math.PI * (t / period + phase));
}
