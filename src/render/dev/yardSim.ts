/**
 * Scripted yard (dev harness + Node checks, no app, no src/world): a handler that walks to a target
 * at YARD_SPEEDS.handler, a dog that follows loosely (1.2 m behind, settles within ≈ 1 s), Mira,
 * Alex and Bruno at their spawn spots, prompt zones from WORLD_PLAN §2, optional toy distraction.
 * Produces a WorldDirective per step for renderer.updateWorld(). Pure TypeScript.
 */
import type { DistractionLevel, DogAttention, PoseId, WorldDirective, YardPoint } from '../../simulation/types';

export interface YardZone {
  id: string;
  x: number;
  z: number;
  r: number;
}

/** Zones from docs/WORLD_PLAN.md §2 as adjusted by WP-P (src/world/layout.ts: sniff_corner at the stage sniff spot, rest_deck at the deck centre). */
export const YARD_ZONES: readonly YardZone[] = [
  { id: 'mira', x: -1.0, z: -1.4, r: 1.1 },
  { id: 'bowl', x: 0.6, z: -1.5, r: 0.9 },
  { id: 'rest_deck', x: -2.5, z: -1.5, r: 1.1 },
  { id: 'sniff_corner', x: 2.1, z: -1.2, r: 1.1 },
  { id: 'quiet_corner', x: -2.4, z: 2.2, r: 1.0 },
  { id: 'alex_bruno', x: 2.4, z: 1.6, r: 1.2 },
  { id: 'gate', x: 0, z: 2.9, r: 0.8 },
];
export const YARD_BOUNDS = { minX: -3.2, maxX: 3.2, minZ: -3.0, maxZ: 3.0 } as const;
export const TOY_SPOT: YardPoint = { x: 0.8, z: 0.4 };
const HANDLER_SPEED = 1.5;
const DOG_FOLLOW_SPEED = 2.0;
const FOLLOW_DISTANCE = 1.2;

export interface YardSimState {
  handler: { x: number; z: number; facing: number; speed: number; target: YardPoint | null };
  dog: { x: number; z: number; facing: number; speed: number; pose: PoseId };
  distraction: DistractionLevel;
  attention: DogAttention;
  momentSpot: YardPoint | null;
  /** Pose the dog holds when standing still (attention projection or a held pose). */
  restPose: PoseId;
  /** false: the dog stays where it is (far-apart framing cases). */
  dogFollows: boolean;
}

export interface YardSim {
  state: YardSimState;
  /** Tap: walk the handler to a point. */
  moveTo(point: YardPoint): void;
  /** WASD: velocity in yard metres per second (x right, z toward the camera). */
  setVelocity(vx: number, vz: number): void;
  step(dt: number): WorldDirective;
  directive(): WorldDirective;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const yawDeg = (dx: number, dz: number): number => (Math.atan2(dx, dz) * 180) / Math.PI;

export function createYardSim(initial?: Partial<YardSimState>): YardSim {
  const state: YardSimState = {
    handler: { x: 0, z: 1.2, facing: 180, speed: 0, target: null },
    dog: { x: 0.5, z: 1.4, facing: 180, speed: 0, pose: 'idle_relaxed' },
    distraction: 'none',
    attention: 'relaxed',
    momentSpot: null,
    restPose: 'idle_relaxed',
    dogFollows: true,
    ...initial,
  };
  let velocity = { vx: 0, vz: 0 };
  let dogSettle = 0;

  const promptFor = (): WorldDirective['prompt'] => {
    for (const zone of YARD_ZONES) {
      if (Math.hypot(state.handler.x - zone.x, state.handler.z - zone.z) <= zone.r) return { zoneId: zone.id, position: { x: zone.x, z: zone.z }, radius: zone.r };
    }
    return null;
  };

  const directive = (): WorldDirective => ({
    actors: [
      { key: 'handler', characterId: 'handler', position: { x: state.handler.x, z: state.handler.z }, facing: state.handler.facing, speed: state.handler.speed, pose: 'idle' },
      { key: 'dog', characterId: 'dog_nala', position: { x: state.dog.x, z: state.dog.z }, facing: state.dog.facing, speed: state.dog.speed, pose: state.dog.pose },
      { key: 'mira', characterId: 'human_mira', position: { x: -1.0, z: -1.3 }, facing: 20, speed: 0, pose: 'idle' },
      { key: 'alex', characterId: 'human_alex', position: { x: 2.4, z: 1.4 }, facing: -60, speed: 0, pose: 'idle' },
      { key: 'other_dog', characterId: 'dog_bruno', position: { x: 2.0, z: 1.9 }, facing: -120, speed: 0, pose: 'idle_relaxed' },
    ],
    focus: { x: state.handler.x, z: state.handler.z },
    prompt: promptFor(),
    momentSpot: state.momentSpot,
    distraction: state.distraction,
    attention: state.attention,
  });

  return {
    state,
    moveTo(point) {
      state.handler.target = { x: clamp(point.x, YARD_BOUNDS.minX, YARD_BOUNDS.maxX), z: clamp(point.z, YARD_BOUNDS.minZ, YARD_BOUNDS.maxZ) };
      velocity = { vx: 0, vz: 0 };
    },
    setVelocity(vx, vz) {
      velocity = { vx, vz };
      if (vx !== 0 || vz !== 0) state.handler.target = null;
    },
    step(dt) {
      const h = state.handler;
      let dx = 0;
      let dz = 0;
      if (velocity.vx !== 0 || velocity.vz !== 0) {
        const len = Math.hypot(velocity.vx, velocity.vz);
        dx = (velocity.vx / len) * HANDLER_SPEED * dt;
        dz = (velocity.vz / len) * HANDLER_SPEED * dt;
      } else if (h.target) {
        const tx = h.target.x - h.x;
        const tz = h.target.z - h.z;
        const dist = Math.hypot(tx, tz);
        const stepLen = Math.min(dist, HANDLER_SPEED * dt);
        if (dist > 1e-3) {
          dx = (tx / dist) * stepLen;
          dz = (tz / dist) * stepLen;
        }
        if (dist - stepLen < 0.02) h.target = null;
      }
      const moved = Math.hypot(dx, dz);
      h.x = clamp(h.x + dx, YARD_BOUNDS.minX, YARD_BOUNDS.maxX);
      h.z = clamp(h.z + dz, YARD_BOUNDS.minZ, YARD_BOUNDS.maxZ);
      h.speed = dt > 0 ? moved / dt : 0;
      if (moved > 1e-4) h.facing = yawDeg(dx, dz);

      // Dog: loose follow, settles within ~1 s once the handler stands.
      const d = state.dog;
      const gx = h.x - Math.sin((h.facing * Math.PI) / 180) * FOLLOW_DISTANCE;
      const gz = h.z - Math.cos((h.facing * Math.PI) / 180) * FOLLOW_DISTANCE;
      const tx = gx - d.x;
      const tz = gz - d.z;
      const gap = Math.hypot(tx, tz);
      const shouldMove = state.dogFollows && (h.speed > 0 ? gap > 0.3 : gap > 0.9 && dogSettle < 1.0);
      if (shouldMove && gap > 1e-3) {
        const stepLen = Math.min(gap, DOG_FOLLOW_SPEED * dt);
        d.x += (tx / gap) * stepLen;
        d.z += (tz / gap) * stepLen;
        d.speed = dt > 0 ? stepLen / dt : 0;
        d.facing = yawDeg(tx, tz);
        d.pose = 'walk';
        dogSettle = 0;
      } else {
        d.speed = 0;
        dogSettle += dt;
        if (h.speed === 0) d.facing = yawDeg(h.x - d.x, h.z - d.z);
        d.pose = state.restPose;
      }
      return directive();
    },
    directive,
  };
}
