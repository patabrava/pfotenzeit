/** Distance-driven walk layer over the existing human idle pose, for both rigs. */
import { Quaternion, Vector3, type Object3D } from 'three';

export function createHumanWalk(root: Object3D) {
  const bases = new Map<Object3D, Quaternion>();
  let phase = 0;
  let amount = 0;
  let moving = false;
  const axis = new Vector3();
  const parentRotation = new Quaternion();
  const rootRotation = new Quaternion();
  const offset = new Quaternion();

  function restore(): void {
    for (const [bone, base] of bases) bone.quaternion.copy(base);
    bases.clear();
  }

  return {
    restore,
    move(distance: number, walking: boolean): void {
      moving = walking;
      // A teleport or initial placement must not advance the stride.
      if (walking && distance < 0.5) phase += distance / 1.35 * Math.PI * 2;
    },
    update(dt: number, held: boolean): boolean {
      if (held) return false;
      amount += ((moving ? 1 : 0) - amount) * Math.min(1, dt * 12);
      if (amount < 0.001 && !moving) { amount = 0; return false; }
      root.updateWorldMatrix(true, true);
      root.getWorldQuaternion(rootRotation);
      const swing = Math.sin(phase);
      const joints: Array<[string, string, number]> = [
        ['LeftUpLeg', 'thigh_l', -0.32 * swing], ['RightUpLeg', 'thigh_r', 0.32 * swing],
        ['LeftLeg', 'shin_l', 0.4 * Math.max(0, swing)], ['RightLeg', 'shin_r', 0.4 * Math.max(0, -swing)],
        ['LeftFoot', 'foot_l', -0.12 * Math.max(0, swing)], ['RightFoot', 'foot_r', -0.12 * Math.max(0, -swing)],
        ['LeftArm', 'shoulder_l', 0.2 * swing], ['RightArm', 'shoulder_r', -0.2 * swing],
      ];
      for (const [native, procedural, angle] of joints) {
        const bone = root.getObjectByName(native) ?? root.getObjectByName(procedural);
        if (!bone?.parent) continue;
        bases.set(bone, bone.quaternion.clone());
        // Rotate about the character's lateral axis, expressed in this joint's parent space.
        bone.parent.getWorldQuaternion(parentRotation);
        axis.set(1, 0, 0).applyQuaternion(rootRotation).applyQuaternion(parentRotation.invert()).normalize();
        bone.quaternion.premultiply(offset.setFromAxisAngle(axis, angle * amount));
        bone.updateWorldMatrix(false, true);
      }
      return true;
    },
  };
}
