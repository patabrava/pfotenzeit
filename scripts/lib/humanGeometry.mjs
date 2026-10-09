/**
 * Simplified humanoid builder (Mira 1.70 m, Alex 1.76 m) on the 20-bone rig from 08:
 * capsule limbs, rounded-box torso, sphere head with a simple hair volume, clothes as vertex colours.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import { PartSet, superEllipsoid, ellipsoid, sphere, segment, deform, smoothstep, mixColor, hexToLinear } from './geometry.mjs';
import { humanSkeleton, add, mid, norm, sub, dist } from './skeleton.mjs';

export const MIRA = {
  id: 'mira',
  height: 1.70,
  shoulderWidth: 0.40,
  hipWidth: 0.22,
  hair: 'bun',
  sleeves: 'rolled',
  pouch: true,
  palette: {
    skin: hexToLinear('#A5704F'),
    hair: hexToLinear('#2A1C16'),
    top: hexToLinear('#326B58'),
    topInner: hexToLinear('#E8DFCB'),
    trousers: hexToLinear('#E8DFCB'),
    shoes: hexToLinear('#6B6A4E'),
    pouch: hexToLinear('#4C4A36'),
    belt: hexToLinear('#3A3129'),
  },
};

export const ALEX = {
  id: 'alex',
  height: 1.76,
  shoulderWidth: 0.42,
  hipWidth: 0.22,
  hair: 'short',
  sleeves: 'long',
  pouch: false,
  palette: {
    skin: hexToLinear('#C9A17E'),
    hair: hexToLinear('#241A16'),
    top: hexToLinear('#B9623F'),
    topInner: hexToLinear('#B9623F'),
    trousers: hexToLinear('#3C3F45'),
    shoes: hexToLinear('#D8D4CC'),
    pouch: hexToLinear('#4C4A36'),
    belt: hexToLinear('#3A3129'),
  },
};

export function buildHuman(H) {
  const { skeleton, landmarks: L } = humanSkeleton(H);
  const C = H.palette;
  const parts = new PartSet();
  const h = H.height;
  const b = (name) => skeleton.get(name).head;

  // ---------------------------------------------------------------- head, hair, neck
  const headR = 0.105;
  const headC = [0, h - headR * 1.05, 0.012];
  const head = ellipsoid(headR * 0.9, headR * 1.05, headR * 0.98, 24, 18);
  head.translate(headC[0], headC[1], headC[2]);
  parts.add(head, { color: C.skin, skin: 'head', name: 'head' });

  // hair: a slightly larger cap; the face region is pushed inside the skull so it stays hidden
  const hair = ellipsoid(headR * 0.9 + 0.012, headR * 1.05 + 0.01, headR * 0.98 + 0.012, 24, 18);
  deform(hair, (x, y, z) => {
    const ny = y / (headR * 1.05 + 0.01);
    const nz = z / (headR * 0.98 + 0.012);
    const nx = x / (headR * 0.9 + 0.012);
    const hairline = H.hair === 'bun' ? 0.35 : 0.42;
    const face = nz > -0.15 && ny < hairline + 0.25 * Math.abs(nx) && !(ny < -0.2 && nz < 0.1);
    const lowBack = ny < (H.hair === 'bun' ? -0.25 : -0.05);
    const inside = face || lowBack;
    const s = inside ? 0.86 : 1;
    return [x * s, y * s, z * s];
  });
  hair.translate(headC[0], headC[1] + 0.006, headC[2] - 0.006);
  parts.add(hair, { color: C.hair, skin: 'head', name: 'hair' });
  if (H.hair === 'bun') {
    const bun = ellipsoid(0.05, 0.045, 0.045, 14, 10);
    bun.translate(0, headC[1] + headR * 0.75, headC[2] - headR * 0.85);
    parts.add(bun, { color: C.hair, skin: 'head', name: 'bun' });
  }
  // ears
  for (const sx of [1, -1]) {
    const ear = ellipsoid(0.012, 0.022, 0.016, 8, 6);
    ear.translate(sx * headR * 0.9, headC[1] - 0.005, headC[2] - 0.01);
    parts.add(ear, { color: C.skin, skin: 'head', name: 'ear' });
  }
  // eyes (simple dark ovals) and brows for readability at a distance
  for (const sx of [1, -1]) {
    const eye = ellipsoid(0.011, 0.008, 0.006, 8, 6);
    eye.translate(sx * 0.033, headC[1] + 0.012, headC[2] + headR * 0.95);
    parts.add(eye, { color: hexToLinear('#1E1410'), skin: 'head', name: 'eye' });
  }
  const neck = segment(b('neck'), add(b('head'), [0, 0.03, 0]), 0.05, 0.048, 12);
  parts.add(neck, { color: C.skin, skin: ['chest', 'neck', 'head'], name: 'neck' });

  // ---------------------------------------------------------------- torso
  const hipsY = L.hips[1];
  const shoulderY = h * 0.815;
  const torsoC = [0, (hipsY + shoulderY) / 2 + 0.02, 0];
  const torsoRy = (shoulderY - hipsY) / 2 + 0.06;
  const torso = superEllipsoid(L.shoulderW * 0.92, torsoRy, 0.115, 0.55, 0.65, 18, 28);
  deform(torso, (x, y, z) => {
    // taper to the waist: narrower at the bottom, chest fuller
    const k = (y / torsoRy + 1) / 2; // 0 bottom .. 1 top
    const w = 0.72 + 0.28 * smoothstep(0.1, 0.9, k);
    return [x * w, y, z * (0.85 + 0.15 * k)];
  });
  torso.translate(torsoC[0], torsoC[1], torsoC[2]);
  const topColor = (x, y, z, nx, ny, nz) => {
    if (H.sleeves === 'rolled') {
      // open overshirt showing the cream inner shirt down the front
      const front = nz > 0.55 && Math.abs(x) < 0.045 + 0.02 * smoothstep(0.1, -0.5, (y - torsoC[1]) / torsoRy);
      if (front) return C.topInner;
    }
    return C.top;
  };
  parts.add(torso, { color: topColor, skin: ['hips', 'spine', 'chest'], name: 'torso' });

  const pelvis = superEllipsoid(L.hipW + 0.075, 0.12, 0.115, 0.55, 0.65, 10, 20);
  pelvis.translate(0, hipsY - 0.03, 0);
  parts.add(pelvis, { color: C.trousers, skin: { hips: 0.9, spine: 0.1 }, name: 'pelvis' });
  // belt line
  const belt = superEllipsoid(L.hipW + 0.082, 0.018, 0.122, 0.55, 0.65, 4, 20);
  belt.translate(0, hipsY + 0.045, 0);
  parts.add(belt, { color: H.sleeves === 'rolled' ? C.belt : C.trousers, skin: { hips: 0.7, spine: 0.3 }, name: 'belt' });

  if (H.pouch) {
    const pouch = superEllipsoid(0.045, 0.04, 0.03, 0.5, 0.5, 6, 10);
    pouch.translate(-(L.hipW + 0.085), hipsY - 0.005, 0.045);
    parts.add(pouch, { color: C.pouch, skin: 'hips', name: 'pouch' });
  }

  // ---------------------------------------------------------------- arms
  for (const side of ['l', 'r']) {
    const sh = b(`upper_arm_${side}`);
    const el = b(`lower_arm_${side}`);
    const wr = b(`hand_${side}`);
    const shoulder = sphere(0.066, 14, 10);
    shoulder.translate(sh[0], sh[1] + 0.01, sh[2]);
    parts.add(shoulder, { color: C.top, skin: { chest: 0.45, [`upper_arm_${side}`]: 0.55 }, name: 'shoulder' });
    parts.add(segment(sh, el, 0.052, 0.045, 12), {
      color: C.top,
      skin: [`upper_arm_${side}`, `lower_arm_${side}`],
      name: 'upperArm',
    });
    const forearmColor = H.sleeves === 'rolled'
      ? (x, y, z) => mixColor(C.top, C.skin, smoothstep(el[1] - 0.05, el[1] - 0.08, y))
      : () => C.top;
    parts.add(segment(el, wr, 0.045, 0.036, 12), {
      color: forearmColor,
      skin: [`upper_arm_${side}`, `lower_arm_${side}`, `hand_${side}`],
      name: 'forearm',
    });
    const hand = superEllipsoid(0.028, 0.055, 0.045, 0.7, 0.6, 8, 12);
    hand.translate(wr[0], wr[1] - 0.05, wr[2] + 0.005);
    parts.add(hand, { color: C.skin, skin: `hand_${side}`, name: 'hand' });
  }

  // ---------------------------------------------------------------- legs
  for (const side of ['l', 'r']) {
    const hip = b(`upper_leg_${side}`);
    const knee = b(`lower_leg_${side}`);
    const ankle = b(`foot_${side}`);
    parts.add(segment(hip, knee, 0.082, 0.065, 14), {
      color: C.trousers,
      skin: [`upper_leg_${side}`, `lower_leg_${side}`],
      name: 'thigh',
    });
    parts.add(segment(knee, ankle, 0.065, 0.055, 14), {
      color: C.trousers,
      skin: [`upper_leg_${side}`, `lower_leg_${side}`, `foot_${side}`],
      name: 'shin',
    });
    const foot = superEllipsoid(0.052, 0.038, 0.135, 0.55, 0.5, 8, 14);
    foot.translate(ankle[0], 0.038, ankle[2] + 0.055);
    parts.add(foot, { color: C.shoes, skin: `foot_${side}`, name: 'foot' });
  }

  return { skeleton, landmarks: L, geometry: parts.merge() };
}
