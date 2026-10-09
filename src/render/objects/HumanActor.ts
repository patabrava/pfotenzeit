/**
 * Procedural stylized adult (Mira / Alex). Capsule torso, limbs, head; identity from 07 and the
 * content colours. Simplified humanoid bone names (08): root → hips → spine → chest → neck → head,
 * shoulder/forearm/hand, thigh/shin/foot per side. Height from content (1.70 / 1.76 m).
 */
import { BoxGeometry, CapsuleGeometry, CylinderGeometry, SphereGeometry } from 'three';
import type { HumanCharacterId } from '../../simulation/types';
import type { HumanCharacter } from '../../content/types';
import { PartBuilder, createBones, type BoneSpec, type Rig } from './rigBuilder';

export interface HumanProportions {
  height: number;
  /** Uniform factor relative to the 1.70 m reference figure. */
  k: number;
  hipHeight: number;
  thigh: number;
  shin: number;
  upperArm: number;
  forearm: number;
  shoulderWidth: number;
}

export function humanProportions(character: HumanCharacter): HumanProportions {
  const k = character.heightM / 1.7;
  return {
    height: character.heightM,
    k,
    hipHeight: 0.86 * k,
    thigh: 0.4 * k,
    shin: 0.4 * k,
    upperArm: 0.27 * k,
    forearm: 0.25 * k,
    shoulderWidth: 0.2 * k,
  };
}

export function humanAssetKey(id: HumanCharacterId): string {
  return id === 'human_mira' ? 'human.mira' : 'human.alex';
}

export const HUMAN_BONES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'shoulder_l',
  'forearm_l',
  'hand_l',
  'shoulder_r',
  'forearm_r',
  'hand_r',
  'thigh_l',
  'shin_l',
  'foot_l',
  'thigh_r',
  'shin_r',
  'foot_r',
] as const;

function boneSpecs(p: HumanProportions): BoneSpec[] {
  const k = p.k;
  return [
    { name: 'hips', parent: null, position: [0, p.hipHeight, 0] },
    { name: 'spine', parent: 'hips', position: [0, 0.1 * k, 0] },
    { name: 'chest', parent: 'spine', position: [0, 0.18 * k, 0] },
    { name: 'neck', parent: 'chest', position: [0, 0.2 * k, 0] },
    { name: 'head', parent: 'neck', position: [0, 0.08 * k, 0] },
    { name: 'shoulder_l', parent: 'chest', position: [p.shoulderWidth, 0.17 * k, 0] },
    { name: 'forearm_l', parent: 'shoulder_l', position: [0, -p.upperArm, 0] },
    { name: 'hand_l', parent: 'forearm_l', position: [0, -p.forearm, 0] },
    { name: 'shoulder_r', parent: 'chest', position: [-p.shoulderWidth, 0.17 * k, 0] },
    { name: 'forearm_r', parent: 'shoulder_r', position: [0, -p.upperArm, 0] },
    { name: 'hand_r', parent: 'forearm_r', position: [0, -p.forearm, 0] },
    { name: 'thigh_l', parent: 'hips', position: [0.1 * k, -0.03 * k, 0] },
    { name: 'shin_l', parent: 'thigh_l', position: [0, -p.thigh, 0] },
    { name: 'foot_l', parent: 'shin_l', position: [0, -p.shin, 0] },
    { name: 'thigh_r', parent: 'hips', position: [-0.1 * k, -0.03 * k, 0] },
    { name: 'shin_r', parent: 'thigh_r', position: [0, -p.thigh, 0] },
    { name: 'foot_r', parent: 'shin_r', position: [0, -p.shin, 0] },
  ];
}

export interface HumanRig extends Rig {
  proportions: HumanProportions;
}

export function buildHumanRig(id: HumanCharacterId, character: HumanCharacter): HumanRig {
  const p = humanProportions(character);
  const k = p.k;
  const c = character.colors;
  const mira = id === 'human_mira';
  const { root, bones, index } = createBones(boneSpecs(p));
  root.name = `${id}_root`;
  const b = new PartBuilder(root, bones, index);
  const halfPi = Math.PI / 2;

  // Hips and torso.
  b.add('hips', new CapsuleGeometry(0.12 * k, 0.1 * k, 4, 14), c.bottom, { rotation: [0, 0, halfPi], scale: [1, 1, 0.8] });
  b.add('spine', new CapsuleGeometry(0.13 * k, 0.16 * k, 4, 16), c.top, { position: [0, 0.1 * k, 0], scale: [1.1, 1, 0.8] });
  b.add('chest', new CapsuleGeometry(0.15 * k, 0.14 * k, 4, 16), c.top, { position: [0, 0.08 * k, 0], scale: [1.25, 1, 0.78] });
  if (mira) {
    // Open forest shirt over a cream top, belt and reward pouch at the hip.
    b.add('spine', new BoxGeometry(0.09 * k, 0.36 * k, 0.03 * k), '#EFE6D2', { position: [0, 0.16 * k, 0.1 * k] });
    b.add('hips', new BoxGeometry(0.27 * k, 0.03 * k, 0.2 * k), '#4A3C33', { position: [0, 0.05 * k, 0] });
    b.add('hips', new BoxGeometry(0.1 * k, 0.08 * k, 0.07 * k), '#5B5A3C', { position: [0.15 * k, -0.01 * k, 0.05 * k], rotation: [0, 0.3, 0] });
  }

  // Neck and head.
  b.add('neck', new CylinderGeometry(0.045 * k, 0.05 * k, 0.09 * k, 12), c.skin, { position: [0, 0.03 * k, 0] });
  b.add('head', new SphereGeometry(0.105 * k, 20, 14), c.skin, { position: [0, 0.09 * k, 0], scale: [0.92, 1.05, 0.95] });
  // Hair: Mira dark curly bun, Alex short dark hair.
  if (mira) {
    b.add('head', new SphereGeometry(0.112 * k, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), c.hair, {
      position: [0, 0.095 * k, -0.005 * k],
      rotation: [-0.25, 0, 0],
      scale: [0.95, 1, 1],
    });
    b.add('head', new SphereGeometry(0.05 * k, 12, 10), c.hair, { position: [0, 0.16 * k, -0.085 * k] });
  } else {
    b.add('head', new SphereGeometry(0.11 * k, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), c.hair, {
      position: [0, 0.1 * k, -0.01 * k],
      rotation: [-0.35, 0, 0],
      scale: [0.94, 1, 1],
    });
  }
  // Eyes and brows: small, readable at the lesson framing.
  for (const side of [1, -1]) {
    b.add('head', new SphereGeometry(0.012 * k, 8, 6), '#2A1C16', { position: [side * 0.036 * k, 0.095 * k, 0.093 * k] });
    b.add('head', new BoxGeometry(0.03 * k, 0.006 * k, 0.006 * k), c.hair, {
      position: [side * 0.036 * k, 0.118 * k, 0.092 * k],
      rotation: [0, 0, side * 0.1],
    });
  }

  // Arms: sleeves in the top colour, Mira's sleeves rolled (skin forearm), hands skin.
  for (const side of ['l', 'r'] as const) {
    b.add(`shoulder_${side}`, new CapsuleGeometry(0.048 * k, p.upperArm * 0.8, 3, 10), c.top, { position: [0, -p.upperArm * 0.5, 0] });
    b.add(`forearm_${side}`, new CapsuleGeometry(0.04 * k, p.forearm * 0.8, 3, 10), mira ? c.skin : c.top, {
      position: [0, -p.forearm * 0.5, 0],
    });
    b.add(`hand_${side}`, new SphereGeometry(0.042 * k, 10, 8), c.skin, { position: [0, -0.03 * k, 0], scale: [0.8, 1.1, 0.6] });
  }

  // Legs: trousers, flat shoes.
  for (const side of ['l', 'r'] as const) {
    b.add(`thigh_${side}`, new CapsuleGeometry(0.072 * k, p.thigh * 0.85, 3, 12), c.bottom, { position: [0, -p.thigh * 0.5, 0] });
    b.add(`shin_${side}`, new CapsuleGeometry(0.06 * k, p.shin * 0.85, 3, 12), c.bottom, { position: [0, -p.shin * 0.5, 0] });
    b.add(`foot_${side}`, new BoxGeometry(0.09 * k, 0.06 * k, 0.24 * k), c.shoes, { position: [0, 0, 0.05 * k] });
  }

  const rig = b.build(`${id}_body`) as HumanRig;
  rig.proportions = p;
  return rig;
}
