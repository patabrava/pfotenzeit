/**
 * Procedural articulated dog (14 B temporary dogs). Identity from 07 and the character colours in
 * src/content; proportions per growth stage are explicit parameters, never a uniform scale.
 *
 * Bone names follow 08_3D_ASSET_HANDOFF: root → pelvis → spine_01 → spine_02 → neck → head → jaw,
 * ear_l/r_01-02, tail_01-03, four legs (upper_arm/forearm/paw_f*, thigh/shin/paw_b*).
 * Forward is +Z, up is +Y, origin on the ground between the paws.
 */
import { BoxGeometry, CapsuleGeometry, SphereGeometry, TorusGeometry } from 'three';
import type { DogCharacterId, GrowthStage } from '../../simulation/types';
import type { DogCharacter } from '../../content/types';
import { PartBuilder, createBones, type BoneSpec, type Rig } from './rigBuilder';

export interface DogProportions {
  shoulderHeight: number;
  bodyLength: number;
  chestRadius: number;
  bellyRadius: number;
  headRadius: number;
  muzzleLength: number;
  muzzleRadius: number;
  neckLength: number;
  legUpper: number;
  legLower: number;
  legRadius: number;
  pawHeight: number;
  earLength: number;
  earWidth: number;
  /** 'floppy' hangs from the side of the head; 'folded' sits higher and folds over. */
  earStyle: 'floppy' | 'folded';
  tailLength: number;
  tailRadius: number;
  /** Width multiplier for the body (Bruno is stockier). */
  stockiness: number;
  /** Bruno: white tail tip. */
  tailTipMarking: boolean;
  /** Derived: Y of the shoulder/hip joints. */
  jointHeight: number;
}

export type DogCharacterKey = 'nala' | 'bruno';

export function dogCharacterKey(id: DogCharacterId): DogCharacterKey {
  return id === 'dog_nala' ? 'nala' : 'bruno';
}

/** Manifest key for the GLB tier (16_ASSET_PRODUCTION). */
export function dogAssetKey(id: DogCharacterId, growth: GrowthStage): string {
  if (id === 'dog_bruno') return 'dog.bruno.puppy';
  return growth === 'arriving' ? 'dog.nala.puppy' : 'dog.nala.growing';
}

function derive(p: Omit<DogProportions, 'jointHeight'>): DogProportions {
  const jointHeight = p.legUpper + p.legLower + p.pawHeight;
  return { ...p, jointHeight };
}

/** Shoulder heights from 07: Nala 0.28 (arriving) / 0.36 (growing), Bruno 0.31. Adult is a roadmap stage; it reuses growing. */
export function dogProportions(id: DogCharacterId, growth: GrowthStage, character?: DogCharacter): DogProportions {
  if (id === 'dog_bruno') {
    const shoulderHeight = character?.shoulderHeightM.arriving ?? 0.31;
    const chestRadius = 0.1;
    const pawHeight = 0.022;
    const legs = shoulderHeight - pawHeight - 1.3 * chestRadius;
    return derive({
      shoulderHeight,
      bodyLength: 0.33,
      chestRadius,
      bellyRadius: chestRadius * 0.92,
      headRadius: 0.082,
      muzzleLength: 0.05,
      muzzleRadius: 0.034,
      neckLength: 0.09,
      legUpper: legs / 2,
      legLower: legs / 2,
      legRadius: 0.026,
      pawHeight,
      earLength: 0.085,
      earWidth: 0.062,
      earStyle: 'folded',
      tailLength: 0.2,
      tailRadius: 0.016,
      stockiness: 1.12,
      tailTipMarking: true,
    });
  }
  if (growth === 'arriving') {
    const shoulderHeight = character?.shoulderHeightM.arriving ?? 0.28;
    const chestRadius = 0.085;
    const pawHeight = 0.02;
    const legs = shoulderHeight - pawHeight - 1.3 * chestRadius;
    return derive({
      shoulderHeight,
      bodyLength: 0.3,
      chestRadius,
      bellyRadius: chestRadius * 0.9,
      headRadius: 0.078,
      muzzleLength: 0.062,
      muzzleRadius: 0.03,
      neckLength: 0.085,
      legUpper: legs / 2,
      legLower: legs / 2,
      legRadius: 0.022,
      pawHeight,
      earLength: 0.11,
      earWidth: 0.062,
      earStyle: 'floppy',
      tailLength: 0.21,
      tailRadius: 0.014,
      stockiness: 1,
      tailTipMarking: false,
    });
  }
  // growing: longer legs, relatively smaller head, steadier body
  const shoulderHeight = character?.shoulderHeightM.growing ?? 0.36;
  const chestRadius = 0.095;
  const pawHeight = 0.022;
  const legs = shoulderHeight - pawHeight - 1.3 * chestRadius;
  return derive({
    shoulderHeight,
    bodyLength: 0.39,
    chestRadius,
    bellyRadius: chestRadius * 0.9,
    headRadius: 0.08,
    muzzleLength: 0.075,
    muzzleRadius: 0.031,
    neckLength: 0.105,
    legUpper: legs / 2,
    legLower: legs / 2,
    legRadius: 0.024,
    pawHeight,
    earLength: 0.12,
    earWidth: 0.064,
    earStyle: 'floppy',
    tailLength: 0.26,
    tailRadius: 0.015,
    stockiness: 1,
    tailTipMarking: false,
  });
}

export const DOG_BONES = [
  'pelvis',
  'spine_01',
  'spine_02',
  'neck',
  'head',
  'jaw',
  'ear_l_01',
  'ear_l_02',
  'ear_r_01',
  'ear_r_02',
  'tail_01',
  'tail_02',
  'tail_03',
  'upper_arm_l',
  'forearm_l',
  'paw_fl',
  'upper_arm_r',
  'forearm_r',
  'paw_fr',
  'thigh_l',
  'shin_l',
  'paw_bl',
  'thigh_r',
  'shin_r',
  'paw_br',
] as const;

function boneSpecs(p: DogProportions): BoneSpec[] {
  const spread = p.chestRadius * 0.55 * p.stockiness;
  const spreadBack = p.bellyRadius * 0.5 * p.stockiness;
  const seg = p.bodyLength * 0.35;
  const tailSeg = p.tailLength / 3;
  const earX = p.headRadius * (p.earStyle === 'floppy' ? 0.78 : 0.68);
  const earY = p.headRadius * (p.earStyle === 'floppy' ? 0.82 : 0.9);
  return [
    { name: 'pelvis', parent: null, position: [0, p.jointHeight + p.bellyRadius * 0.25, -p.bodyLength * 0.5] },
    { name: 'spine_01', parent: 'pelvis', position: [0, 0, seg] },
    { name: 'spine_02', parent: 'spine_01', position: [0, p.chestRadius * 0.05, seg] },
    { name: 'neck', parent: 'spine_02', position: [0, p.chestRadius * 0.55, p.chestRadius * 0.55] },
    { name: 'head', parent: 'neck', position: [0, p.neckLength * 0.72, p.neckLength * 0.62] },
    { name: 'jaw', parent: 'head', position: [0, -p.headRadius * 0.38, p.headRadius * 0.55] },
    { name: 'ear_l_01', parent: 'head', position: [earX, earY, -p.headRadius * 0.1] },
    { name: 'ear_l_02', parent: 'ear_l_01', position: [0, -p.earLength * 0.5, 0] },
    { name: 'ear_r_01', parent: 'head', position: [-earX, earY, -p.headRadius * 0.1] },
    { name: 'ear_r_02', parent: 'ear_r_01', position: [0, -p.earLength * 0.5, 0] },
    { name: 'tail_01', parent: 'pelvis', position: [0, p.bellyRadius * 0.45, -p.bellyRadius * 0.75] },
    { name: 'tail_02', parent: 'tail_01', position: [0, 0, -tailSeg] },
    { name: 'tail_03', parent: 'tail_02', position: [0, 0, -tailSeg] },
    { name: 'upper_arm_l', parent: 'spine_02', position: [spread, -(p.bellyRadius * 0.25 + p.chestRadius * 0.05), p.chestRadius * 0.15] },
    { name: 'forearm_l', parent: 'upper_arm_l', position: [0, -p.legUpper, 0] },
    { name: 'paw_fl', parent: 'forearm_l', position: [0, -p.legLower, 0] },
    { name: 'upper_arm_r', parent: 'spine_02', position: [-spread, -(p.bellyRadius * 0.25 + p.chestRadius * 0.05), p.chestRadius * 0.15] },
    { name: 'forearm_r', parent: 'upper_arm_r', position: [0, -p.legUpper, 0] },
    { name: 'paw_fr', parent: 'forearm_r', position: [0, -p.legLower, 0] },
    { name: 'thigh_l', parent: 'pelvis', position: [spreadBack, -p.bellyRadius * 0.25, 0] },
    { name: 'shin_l', parent: 'thigh_l', position: [0, -p.legUpper, 0] },
    { name: 'paw_bl', parent: 'shin_l', position: [0, -p.legLower, 0] },
    { name: 'thigh_r', parent: 'pelvis', position: [-spreadBack, -p.bellyRadius * 0.25, 0] },
    { name: 'shin_r', parent: 'thigh_r', position: [0, -p.legUpper, 0] },
    { name: 'paw_br', parent: 'shin_r', position: [0, -p.legLower, 0] },
  ];
}

export interface DogRig extends Rig {
  proportions: DogProportions;
  character: DogCharacterKey;
}

/** Builds the merged skinned dog. ~2.5k triangles, one draw call. */
export function buildDogRig(id: DogCharacterId, growth: GrowthStage, character: DogCharacter): DogRig {
  const p = dogProportions(id, growth, character);
  const c = character.colors;
  const key = dogCharacterKey(id);
  const { root, bones, index } = createBones(boneSpecs(p));
  root.name = `${id}_root`;
  const b = new PartBuilder(root, bones, index);
  const w = p.stockiness;
  const halfPi = Math.PI / 2;
  const seg = p.bodyLength * 0.35;

  // Body: pelvis → belly → chest, capsules along +Z.
  b.add('pelvis', new CapsuleGeometry(p.bellyRadius, seg * 0.7, 4, 14), c.body, {
    position: [0, 0, seg * 0.45],
    rotation: [halfPi, 0, 0],
    scale: [w, 0.95, 1],
  });
  b.add('spine_01', new CapsuleGeometry(p.bellyRadius * 0.98, seg * 0.8, 4, 14), c.body, {
    position: [0, 0, seg * 0.5],
    rotation: [halfPi, 0, 0],
    scale: [w, 1, 1],
  });
  b.add('spine_02', new CapsuleGeometry(p.chestRadius, p.bodyLength * 0.22, 4, 16), c.body, {
    position: [0, 0, p.chestRadius * 0.1],
    rotation: [halfPi, 0, 0],
    scale: [w, 1, 1],
  });
  // Chest / throat bib (cream for Nala, white for Bruno).
  b.add('spine_02', new CapsuleGeometry(p.chestRadius * 0.7, p.bodyLength * 0.18, 4, 12), c.chest, {
    position: [0, -p.chestRadius * 0.33, p.chestRadius * 0.45],
    rotation: [halfPi + 0.35, 0, 0],
    scale: [w, 1, 1],
  });
  // Harness: chest band, neck band, back strap and a small ring.
  b.add('spine_02', new TorusGeometry(p.chestRadius * 1.0 + 0.004, 0.011, 8, 28), c.harness, {
    position: [0, 0, p.chestRadius * 0.05],
    scale: [w, 1, 1],
  });
  b.add('neck', new TorusGeometry(p.chestRadius * 0.62, 0.009, 8, 22), c.harness, {
    position: [0, p.neckLength * 0.25, p.neckLength * 0.2],
    rotation: [Math.atan2(p.neckLength * 0.62, p.neckLength * 0.72), 0, 0],
  });
  b.add('spine_02', new BoxGeometry(0.026, 0.012, p.chestRadius * 0.9), c.harness, {
    position: [0, p.chestRadius * 1.0, p.chestRadius * 0.45],
    rotation: [-0.25, 0, 0],
  });
  b.add('spine_02', new TorusGeometry(0.012, 0.004, 6, 12), '#8A8F86', {
    position: [0, p.chestRadius * 1.02 + 0.006, p.chestRadius * 0.15],
    rotation: [halfPi, 0, 0],
  });

  // Neck: capsule tilted to point at the head bone.
  const neckTilt = Math.atan2(p.neckLength * 0.62, p.neckLength * 0.72);
  b.add('neck', new CapsuleGeometry(p.chestRadius * 0.5, p.neckLength * 0.8, 4, 12), c.body, {
    position: [0, p.neckLength * 0.36, p.neckLength * 0.31],
    rotation: [neckTilt, 0, 0],
    scale: [w, 1, 1],
  });

  // Head and face.
  const hr = p.headRadius;
  b.add('head', new SphereGeometry(hr, 20, 14), c.body, { position: [0, hr * 0.12, 0], scale: [1.02 * w, 0.98, 1] });
  // Forehead stripe (cream / white).
  b.add('head', new BoxGeometry(hr * 0.22, hr * 0.62, 0.014), c.marking, {
    position: [0, hr * 0.5, hr * 0.78],
    rotation: [-0.55, 0, 0],
  });
  // Muzzle, nose, lower jaw.
  const mz = hr * 0.78;
  b.add('head', new CapsuleGeometry(p.muzzleRadius, p.muzzleLength, 4, 12), c.muzzle, {
    position: [0, -hr * 0.14, mz + p.muzzleLength * 0.35],
    rotation: [halfPi, 0, 0],
    scale: [1.25, 0.9, 1],
  });
  b.add('head', new SphereGeometry(p.muzzleRadius * 0.5, 10, 8), c.nose, {
    position: [0, -hr * 0.14 + p.muzzleRadius * 0.35, mz + p.muzzleLength * 0.85 + p.muzzleRadius * 0.5],
    scale: [1.2, 0.8, 0.9],
  });
  b.add('jaw', new CapsuleGeometry(p.muzzleRadius * 0.78, p.muzzleLength * 0.8, 3, 10), c.muzzle, {
    position: [0, -p.muzzleRadius * 0.15, p.muzzleLength * 0.45],
    rotation: [halfPi, 0, 0],
    scale: [1.15, 0.6, 1],
  });

  // Eyes: white, dark-brown iris, pupil, upper lid in body colour (normal lids, no grin).
  for (const side of [1, -1]) {
    const ex = side * hr * 0.4;
    const ey = hr * 0.22;
    const ez = hr * 0.76;
    const dir = [side * 0.45, 0.05, 0.89] as const;
    b.add('head', new SphereGeometry(hr * 0.17, 12, 10), '#F6F3EC', { position: [ex, ey, ez] });
    b.add('head', new SphereGeometry(hr * 0.115, 12, 10), c.eye, {
      position: [ex + dir[0] * hr * 0.085, ey + dir[1] * hr * 0.085, ez + dir[2] * hr * 0.085],
    });
    b.add('head', new SphereGeometry(hr * 0.06, 8, 6), '#120C0A', {
      position: [ex + dir[0] * hr * 0.15, ey + dir[1] * hr * 0.15, ez + dir[2] * hr * 0.15],
    });
    b.add('head', new SphereGeometry(hr * 0.185, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), c.body, {
      position: [ex, ey + hr * 0.01, ez],
      rotation: [-0.35, side * 0.3, 0],
    });
  }

  // Ears: two segments each. Floppy hangs down beside the head, folded sits on top and tips over.
  const earThick = 0.016;
  const earSeg = p.earLength * 0.5;
  for (const side of ['l', 'r'] as const) {
    const s = side === 'l' ? 1 : -1;
    // Upper segment: rounded flap; lower segment: capsule tip. Both hang along -Y of their bone.
    b.add(`ear_${side}_01`, new CapsuleGeometry(p.earWidth * 0.5, earSeg * 0.7, 3, 10), c.ear, {
      position: [s * 0.004, -earSeg * 0.5, 0],
      rotation: [0, s * 0.25, 0],
      scale: [1, 1, earThick / (p.earWidth * 0.5)],
    });
    b.add(`ear_${side}_02`, new CapsuleGeometry(p.earWidth * 0.46, earSeg * 0.6, 3, 10), c.ear, {
      position: [s * 0.004, -earSeg * 0.45, 0],
      rotation: [0, s * 0.25, 0],
      scale: [1, 1, earThick / (p.earWidth * 0.46)],
    });
  }

  // Tail: three capsules along -Z, the tip white for Bruno.
  const tailSeg = p.tailLength / 3;
  const tailColours = [c.body, c.body, p.tailTipMarking ? c.marking : c.body];
  ['tail_01', 'tail_02', 'tail_03'].forEach((bone, i) => {
    const r = p.tailRadius * (1 - i * 0.22);
    b.add(bone, new CapsuleGeometry(r, tailSeg * 0.95, 3, 10), tailColours[i] as string, {
      position: [0, 0, -tailSeg * 0.5],
      rotation: [halfPi, 0, 0],
    });
  });

  // Legs: upper, lower, paw. Paws in the chest colour (Nala cream, Bruno white toes).
  const legs: Array<[string, string, string]> = [
    ['upper_arm_l', 'forearm_l', 'paw_fl'],
    ['upper_arm_r', 'forearm_r', 'paw_fr'],
    ['thigh_l', 'shin_l', 'paw_bl'],
    ['thigh_r', 'shin_r', 'paw_br'],
  ];
  for (const [upper, lower, paw] of legs) {
    const hind = upper.startsWith('thigh');
    const ur = p.legRadius * (hind ? 1.3 : 1.05) * w;
    b.add(upper, new CapsuleGeometry(ur, p.legUpper * 0.9, 3, 10), c.body, {
      position: [0, -p.legUpper * 0.5, 0],
      scale: [1, 1, hind ? 1.5 : 1.1],
    });
    b.add(lower, new CapsuleGeometry(p.legRadius * 0.92 * w, p.legLower * 0.9, 3, 10), c.body, {
      position: [0, -p.legLower * 0.5, 0],
    });
    b.add(paw, new SphereGeometry(p.legRadius * 1.25 * w, 12, 8), c.chest, {
      position: [0, -p.pawHeight * 0.45, p.legRadius * 0.45],
      scale: [1.05, 0.62, 1.35],
    });
  }

  const rig = b.build(`${id}_body`) as DogRig;
  rig.proportions = p;
  rig.character = key;
  return rig;
}
