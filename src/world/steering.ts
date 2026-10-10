/**
 * Steering along a path: constant speed with a short ease-in/out, facing follows the motion.
 * Actors are mutated in place by the step (the caller cloned them). Pure functions of (actor, dt).
 */
import type { ActorState, YardPoint } from './types';

export const ARRIVE_EPS = 0.03;
/** How fast speed approaches its target (1/s). */
const ACCEL = 10;
/** Degrees per second the facing may turn. */
const TURN_RATE = 540;

export function facingToward(from: YardPoint, to: YardPoint, fallback: number): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx * dx + dz * dz < 1e-8) return fallback;
  // 0 = facing +Z, measured around +Y (counter-clockwise seen from above: +X is 90°)
  return (Math.atan2(dx, dz) * 180) / Math.PI;
}

export function normalizeDeg(a: number): number {
  let d = a % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

export function turnToward(actor: ActorState, target: number, dt: number): void {
  const diff = normalizeDeg(target - actor.facing);
  const max = TURN_RATE * dt;
  actor.facing = normalizeDeg(actor.facing + Math.max(-max, Math.min(max, diff)));
}

/**
 * Moves the actor along its path at up to `maxSpeed`. Returns true when the last way point was
 * reached during this call (path becomes empty).
 */
export function advanceAlongPath(actor: ActorState, maxSpeed: number, dt: number): boolean {
  if (actor.path.length === 0) {
    actor.speed = Math.max(0, actor.speed - ACCEL * maxSpeed * dt);
    return false;
  }
  actor.speed = Math.min(maxSpeed, actor.speed + ACCEL * maxSpeed * dt);
  let budget = actor.speed * dt;
  let arrived = false;
  while (budget > 0 && actor.path.length > 0) {
    const next = actor.path[0]!;
    const dx = next.x - actor.position.x;
    const dz = next.z - actor.position.z;
    const d = Math.hypot(dx, dz);
    if (d <= ARRIVE_EPS || d <= budget) {
      actor.position = { x: next.x, z: next.z };
      actor.path.shift();
      budget -= d;
      if (actor.path.length === 0) arrived = true;
      continue;
    }
    actor.position = { x: actor.position.x + (dx / d) * budget, z: actor.position.z + (dz / d) * budget };
    budget = 0;
  }
  const look = actor.path[0] ?? actor.position;
  turnToward(actor, facingToward(actor.position, look, actor.facing), dt);
  if (arrived) actor.speed = 0;
  return arrived;
}

/** Moves straight in a direction (unit vector) at `speed`; the caller clamps the result. */
export function moveInDirection(actor: ActorState, dx: number, dz: number, speed: number, dt: number): void {
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return;
  const ux = dx / len;
  const uz = dz / len;
  actor.speed = speed;
  actor.position = { x: actor.position.x + ux * speed * dt, z: actor.position.z + uz * speed * dt };
  turnToward(actor, facingToward({ x: 0, z: 0 }, { x: ux, z: uz }, actor.facing), dt);
}
