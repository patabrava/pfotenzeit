/**
 * Dog body builder: merged, vertex-coloured primitives placed along the 08 skeleton.
 * Identity from 07/06 and the reference sheets: honey Nala with cream chest/paws/forehead stripe and
 * floppy ears + sage harness; chestnut Bruno with white muzzle/chest/toes/forehead stripe/tail tip,
 * folded ears + apricot harness. Eyes dark brown with a lighter iris ring and dark pupil.
 */
import { BoxGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import {
  PartSet, superEllipsoid, sphere, ellipsoid, capsule, torus, segment, deform, smoothstep, mixColor, DEG,
} from './geometry.mjs';
import { dogSkeleton, add, sub, scale, norm, mid, dist } from './skeleton.mjs';

const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);

function placeAlong(geometry, a, b, fromAxis = UP) {
  const dir = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const q = new Quaternion().setFromUnitVectors(fromAxis, dir);
  const c = mid(a, b);
  const m = new Matrix4().compose(new Vector3(c[0], c[1], c[2]), q, new Vector3(1, 1, 1));
  geometry.applyMatrix4(m);
  return geometry;
}

/** Flat strap (box) from a to b, Y axis of the box aligned with the direction. */
function strap(a, b, width, thickness, segs = 6) {
  const len = dist(a, b);
  const g = new BoxGeometry(width, len, thickness, 1, segs, 1);
  return placeAlong(g, a, b);
}

export function buildDog(P) {
  const { skeleton, landmarks: L } = dogSkeleton(P);
  const C = P.palette;
  const W = P.width;
  const parts = new PartSet();
  const isBruno = P.markings === 'bruno';

  // ---------------------------------------------------------------- torso
  const chestRx = P.chestRx * W;
  const bellyRatioX = P.bellyRx / P.chestRx;
  const bellyRatioY = P.bellyRy / P.chestRy;
  const torsoDeform = (x, y, z) => {
    const u = Math.max(-1, Math.min(1, z / P.chestRz));
    const k = (u + 1) / 2;
    const sx = bellyRatioX + (1 - bellyRatioX) * k;
    const deep = y < 0 ? 1.1 : 1.0;
    const sy = bellyRatioY + (deep - bellyRatioY) * k;
    const cy = L.spineFrontY + (L.spineBackY - L.spineFrontY) * (1 - k);
    const tuck = y < 0 ? 0.4 * P.bellyRy * smoothstep(-0.1, -1, u) * (-y / P.chestRy) : 0;
    return [x * sx, cy + y * sy + tuck, z];
  };
  const torso = deform(superEllipsoid(chestRx, P.chestRy, P.chestRz, 1, 1, 18, 30), torsoDeform);
  const torsoColor = (x, y, z, nx, ny, nz) => {
    const u = z / P.chestRz;
    let c = C.body;
    // saddle hint on the back
    const saddle = smoothstep(0.45, 0.9, ny) * (1 - smoothstep(0.55, 0.95, Math.abs(x) / chestRx)) * 0.85;
    c = mixColor(c, C.dark, saddle);
    // cream/white chest and belly
    const belly = isBruno ? smoothstep(-0.35, -0.75, ny) : smoothstep(-0.05, -0.55, ny);
    const bib = smoothstep(0.45, 0.8, u) * (y < L.spineFrontY + 0.02 ? 1 : smoothstep(0.08, 0.0, y - L.spineFrontY));
    c = mixColor(c, C.light, Math.max(belly, bib * smoothstep(0.1, -0.2, ny)));
    return c;
  };
  parts.add(torso, { color: torsoColor, skin: ['pelvis', 'spine_01', 'spine_02'], name: 'torso' });

  // ---------------------------------------------------------------- neck
  const neckGeom = segment(L.neckBase, add(L.headJoint, scale(L.neckDir, 0.01)), P.neckR * W, P.neckR * 0.88 * W, 18);
  const neckColor = (x, y, z, nx, ny, nz) => {
    const throat = smoothstep(0.2, -0.3, ny) * (isBruno ? 1 : 0.9);
    return mixColor(C.body, C.light, throat);
  };
  parts.add(neckGeom, { color: neckColor, skin: ['spine_02', 'neck', 'head'], name: 'neck' });

  // ---------------------------------------------------------------- head
  const head = ellipsoid(P.headR * 1.02 * (isBruno ? 1.06 : 1), P.headR * 0.97, P.headR * 1.0, 24, 16);
  head.translate(L.headC[0], L.headC[1], L.headC[2]);
  const headColor = (x, y, z, nx, ny, nz) => {
    const top = smoothstep(0.75, 1, ny) * 0.5;
    const cheek = isBruno ? smoothstep(0.1, -0.5, ny) * smoothstep(0.3, 0.7, nz) : smoothstep(-0.2, -0.7, ny) * 0.8;
    return mixColor(mixColor(C.body, C.dark, top), C.light, cheek);
  };
  parts.add(head, { color: headColor, skin: 'head', name: 'head' });

  // upper muzzle (rounded box) and nose
  const muzLen = P.muzzleLen;
  const muz = superEllipsoid(P.muzzleRx * W, P.muzzleRy, muzLen * 0.5 + 0.012, 0.7, 0.7, 12, 20);
  muz.translate(L.muzzleBase[0], L.muzzleBase[1] + P.muzzleRy * 0.15, L.muzzleBase[2] + muzLen * 0.5 - 0.012);
  const muzColor = isBruno
    ? () => C.light
    : (x, y, z, nx, ny, nz) => mixColor(C.body, C.light, smoothstep(-0.1, -0.6, ny));
  parts.add(muz, { color: muzColor, skin: 'head', name: 'muzzle' });

  const nose = ellipsoid(0.017 * (P.headR / 0.072), 0.012 * (P.headR / 0.072), 0.013 * (P.headR / 0.072), 14, 10);
  nose.translate(L.noseTip[0], L.noseTip[1] + 0.004, L.noseTip[2] - 0.004);
  parts.add(nose, { color: C.nose, skin: 'head', name: 'nose' });

  // lower jaw (jaw bone) - a flatter rounded box under the muzzle
  const jaw = superEllipsoid(P.muzzleRx * 0.9 * W, P.muzzleRy * 0.5, muzLen * 0.5 + 0.006, 0.8, 0.8, 8, 16);
  jaw.translate(L.muzzleBase[0], L.muzzleBase[1] - P.muzzleRy * 0.78, L.muzzleBase[2] + muzLen * 0.5 - 0.016);
  parts.add(jaw, { color: C.light, skin: 'jaw', name: 'jaw' });

  // forehead stripe
  const stripe = superEllipsoid(0.0065, 0.03 * (P.headR / 0.072), 0.012, 0.6, 0.6, 6, 10);
  stripe.applyMatrix4(
    new Matrix4().compose(
      new Vector3(0, L.headC[1] + P.headR * 0.56, L.headC[2] + P.headR * 0.80),
      new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -42 * DEG),
      new Vector3(1, 1, 1),
    ),
  );
  parts.add(stripe, { color: C.light, skin: 'head', name: 'stripe' });

  // eyes, brow ridges
  for (const sx of [1, -1]) {
    const eyeC = [L.eyeL[0] * sx, L.eyeL[1], L.eyeL[2]];
    const gaze = norm([0.36 * sx, 0.08, 1]);
    const eyeR = P.headR * 0.19;
    const eye = sphere(eyeR, 16, 11);
    eye.translate(eyeC[0], eyeC[1], eyeC[2]);
    const eyeColor = (x, y, z, nx, ny, nz) => {
      const cosA = nx * gaze[0] + ny * gaze[1] + nz * gaze[2];
      if (cosA > Math.cos(26 * DEG)) return C.pupil;
      if (cosA > Math.cos(40 * DEG)) return C.iris;
      return C.eye;
    };
    parts.add(eye, { color: eyeColor, skin: 'head', name: 'eye' });

    const brow = capsule(P.headR * 0.08, P.headR * 0.34, 4, 10);
    brow.applyMatrix4(
      new Matrix4().compose(
        new Vector3(eyeC[0] + 0.002 * sx, eyeC[1] + P.headR * 0.27, eyeC[2] - P.headR * 0.06),
        new Quaternion().setFromEuler(new Euler(10 * DEG, -22 * DEG * sx, 90 * DEG, 'XYZ')),
        new Vector3(1, 1, 1),
      ),
    );
    parts.add(brow, { color: mixColor(C.body, C.dark, isBruno ? 0.5 : 0.45), skin: 'head', name: 'brow' });
  }

  // ---------------------------------------------------------------- ears
  for (const sx of [1, -1]) {
    const top = [L.earTop[0] * sx, L.earTop[1], L.earTop[2]];
    const tip = [L.earTip[0] * sx, L.earTip[1], L.earTip[2]];
    const len = dist(top, tip);
    const ear = superEllipsoid(0.0085, len * 0.5 + 0.012, P.earW * 0.5, 0.85, 0.75, 10, 16);
    // widen towards the tip (rounded drop shape) and keep the root narrower
    deform(ear, (x, y, z) => {
      const k = smoothstep(0.5, -0.6, y / (len * 0.5 + 0.012));
      const wz = 0.72 + 0.28 * k;
      return [x, y, z * wz];
    });
    const dir = norm(sub(tip, top));
    const q = new Quaternion().setFromUnitVectors(DOWN, new Vector3(dir[0], dir[1], dir[2]));
    const flare = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (P.earStyle === 'floppy' ? -16 : -8) * DEG * sx);
    q.multiply(flare);
    const c = mid(add(top, scale(dir, -0.012)), tip);
    ear.applyMatrix4(new Matrix4().compose(new Vector3(c[0], c[1], c[2]), q, new Vector3(1, 1, 1)));
    const earColor = (x, y, z, nx, ny, nz) => mixColor(C.dark, C.body, smoothstep(0.2, 0.6, nx * sx) * 0.25);
    parts.add(ear, { color: earColor, skin: [`ear_${sx > 0 ? 'l' : 'r'}_01`, `ear_${sx > 0 ? 'l' : 'r'}_02`], name: 'ear' });
  }

  // ---------------------------------------------------------------- tail
  const tr = P.tailR;
  parts.add(segment(L.tailBase, L.tail2, tr, tr * 0.85, 12), { color: C.body, skin: ['pelvis', 'tail_01', 'tail_02'], name: 'tail1' });
  parts.add(segment(L.tail2, L.tail3, tr * 0.85, tr * 0.65, 12), { color: C.body, skin: ['tail_01', 'tail_02', 'tail_03'], name: 'tail2' });
  const t3dir = norm(sub(L.tailTip, L.tail3));
  const tailTipColor = (x, y, z) => {
    const along = ((x - L.tail3[0]) * t3dir[0] + (y - L.tail3[1]) * t3dir[1] + (z - L.tail3[2]) * t3dir[2]) / dist(L.tail3, L.tailTip);
    return isBruno ? mixColor(C.body, C.light, smoothstep(0.3, 0.5, along)) : C.body;
  };
  const tail3 = segment(L.tail3, L.tailTip, tr * 0.65, tr * 0.32, 12);
  parts.add(tail3, { color: tailTipColor, skin: ['tail_02', 'tail_03'], name: 'tail3' });
  const tipBall = sphere(tr * 0.32, 10, 8);
  tipBall.translate(L.tailTip[0], L.tailTip[1], L.tailTip[2]);
  parts.add(tipBall, { color: isBruno ? C.light : C.body, skin: 'tail_03', name: 'tailTip' });

  // ---------------------------------------------------------------- legs
  for (const side of ['l', 'r']) {
    const sx = side === 'l' ? 1 : -1;
    // front
    const sh = skeleton.get(`leg_f${side}_upper`).head;
    const el = skeleton.get(`leg_f${side}_lower`).head;
    const pf = skeleton.get(`paw_f${side}`).head;
    const shoulder = ellipsoid(P.legUpperR * 1.55, P.legUpperR * 2.1, P.legUpperR * 1.9, 12, 9);
    shoulder.translate(sh[0], sh[1] + P.legUpperR * 0.6, sh[2] - 0.004);
    parts.add(shoulder, { color: C.body, skin: { spine_02: 0.45, [`leg_f${side}_upper`]: 0.55 }, name: 'shoulder' });
    parts.add(segment(sh, el, P.legUpperR, P.legUpperR * 0.82, 12), {
      color: C.body,
      skin: [`leg_f${side}_upper`, `leg_f${side}_lower`],
      name: 'legFU',
    });
    const sockY = L.pawJointY + (isBruno ? -1 : 0.04);
    const lowerColor = (x, y, z) => (isBruno ? C.body : mixColor(C.body, C.light, smoothstep(sockY + 0.012, sockY - 0.012, y)));
    parts.add(segment(el, pf, P.legLowerR * 1.05, P.legLowerR * 0.9, 12), {
      color: lowerColor,
      skin: [`leg_f${side}_upper`, `leg_f${side}_lower`, `paw_f${side}`],
      name: 'legFL',
    });
    parts.add(pawGeometry(P, pf, isBruno, C), { color: pawColor(P, pf, isBruno, C), skin: `paw_f${side}`, name: 'pawF' });

    // back
    const hip = skeleton.get(`leg_b${side}_upper`).head;
    const knee = skeleton.get(`leg_b${side}_lower`).head;
    const pb = skeleton.get(`paw_b${side}`).head;
    const thigh = ellipsoid(P.legUpperR * 1.7, L.upperLenB * 0.78, P.legUpperR * 2.6, 14, 10);
    thigh.translate(hip[0] + 0.004 * sx, hip[1] - L.upperLenB * 0.28, hip[2] + 0.012);
    parts.add(thigh, { color: C.body, skin: { pelvis: 0.3, [`leg_b${side}_upper`]: 0.7 }, name: 'thigh' });
    parts.add(segment(hip, knee, P.legUpperR * 1.05, P.legUpperR * 0.85, 12), {
      color: C.body,
      skin: [`leg_b${side}_upper`, `leg_b${side}_lower`],
      name: 'legBU',
    });
    parts.add(segment(knee, pb, P.legLowerR * 1.05, P.legLowerR * 0.9, 12), {
      color: lowerColor,
      skin: [`leg_b${side}_upper`, `leg_b${side}_lower`, `paw_b${side}`],
      name: 'legBL',
    });
    parts.add(pawGeometry(P, pb, isBruno, C), { color: pawColor(P, pb, isBruno, C), skin: `paw_b${side}`, name: 'pawB' });
  }

  // ---------------------------------------------------------------- harness (sits on the torso surface via the same deform)
  const zBand = L.zSh - 0.05;
  const band = torus(1, 0.0065, 8, 40);
  band.scale(chestRx + 0.004, P.chestRy + 0.004, 1);
  band.translate(0, 0, zBand);
  deform(band, torsoDeform);
  parts.add(band, { color: C.harness, skin: ['spine_01', 'spine_02'], name: 'harnessBand' });

  const backStrap = new BoxGeometry(P.harnessWidth, 0.007, L.zSh + 0.055 - zBand + 0.012, 1, 1, 8);
  backStrap.translate(0, P.chestRy + 0.0025, (zBand + L.zSh + 0.055) / 2);
  deform(backStrap, torsoDeform);
  parts.add(backStrap, { color: C.harness, skin: ['spine_01', 'spine_02'], name: 'harnessBack' });

  const buckle = new BoxGeometry(P.harnessWidth * 0.8, 0.009, 0.014);
  buckle.translate(0, P.chestRy + 0.006, zBand + 0.015);
  deform(buckle, torsoDeform);
  parts.add(buckle, { color: C.hardware, skin: ['spine_01', 'spine_02'], name: 'buckle' });

  // neck loop around the base of the neck
  const loopCenter = add(L.neckBase, scale(L.neckDir, 0.03));
  const loop = torus(1, 0.0065, 8, 32);
  loop.scale(P.neckR * W + 0.006, P.neckR * W + 0.006, 1);
  const loopQ = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(L.neckDir[0], L.neckDir[1], L.neckDir[2]));
  loop.applyMatrix4(new Matrix4().compose(new Vector3(loopCenter[0], loopCenter[1], loopCenter[2]), loopQ, new Vector3(1, 1, 1)));
  parts.add(loop, { color: C.harness, skin: ['spine_02', 'neck'], name: 'harnessLoop' });

  // sternum strap from the neck loop down to the band (front of chest)
  const front = torsoDeform(0, -P.chestRy, zBand);
  const loopBottom = add(loopCenter, [0, -(P.neckR * W + 0.004) * Math.cos(P.neckAngle), (P.neckR * W + 0.004) * Math.sin(P.neckAngle)]);
  const chestFront = torsoDeform(0, -P.chestRy * 0.55, P.chestRz * 0.93);
  parts.add(strap(loopBottom, add(chestFront, [0, 0, 0.004]), P.harnessWidth * 0.9, 0.007), {
    color: C.harness, skin: ['spine_02', 'neck'], name: 'harnessSternum1',
  });
  parts.add(strap(add(chestFront, [0, 0, 0.004]), add(front, [0, -0.004, 0]), P.harnessWidth * 0.9, 0.007), {
    color: C.harness, skin: ['spine_01', 'spine_02'], name: 'harnessSternum2',
  });

  const merged = parts.merge();
  return { skeleton, landmarks: L, geometry: merged };
}

function pawGeometry(P, joint, isBruno, C) {
  const paw = superEllipsoid(P.pawRx * P.width, P.pawRy, P.pawRz, 0.7, 0.55, 8, 14);
  paw.translate(joint[0], P.pawRy, joint[2] + 0.011);
  return paw;
}

function pawColor(P, joint, isBruno, C) {
  if (!isBruno) return () => C.light;
  const zc = joint[2] + 0.011;
  return (x, y, z) => mixColor(C.body, C.light, smoothstep(zc - 0.004, zc + 0.008, z));
}
