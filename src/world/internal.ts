/**
 * Transient per-step bookkeeping the world needs between steps (follow anchor, timers, held input,
 * response scripts). It lives inside the WorldState object under `internal` so stepping stays a pure
 * function of (state, dt, inputs) and two runs with the same seed and inputs are identical. The
 * shared contract (src/world/types.ts) does not list it; consumers treat WorldState as opaque data.
 */
import type { DogAttention, ExerciseResponse, PoseId } from '../simulation/types';
import type { WorldState, YardPoint, ZoneId } from './types';

export interface ResponseScript {
  kind: ExerciseResponse;
  /** 0 = moving/turning, 1 = holding a pose, 2 = finished (responseShown emitted). */
  phase: 0 | 1 | 2;
  /** Seconds spent in the current phase. */
  timer: number;
  /** Seconds since the script started (hard cap 3 s). */
  elapsed: number;
  /** Pose the dog shows while not walking. */
  pose: PoseId;
  /** Facing target while turning, degrees. */
  targetFacing: number | null;
}

export interface WorldInternal {
  /** Handler position when the dog last chose its leash spot. */
  followAnchor: YardPoint | null;
  /** True while the handler was moving in the previous step (stop detection). */
  handlerWasMoving: boolean;
  /** Seconds the handler has been standing still. */
  handlerStillS: number;
  /** Seconds the preconditions for 'focused' have held. */
  focusS: number;
  /** Held direction input (WASD); null when released. */
  moveDir: { dx: number; dz: number } | null;
  /** Running response script, or null. */
  response: ResponseScript | null;
  /** look_at: the glance was offered for the current still period. */
  glanceOffered: boolean;
  /** Other dog: seconds until it picks the next wander target. */
  wanderWait: number;
  /** Free mode: wander anchor and wait. */
  freeAnchor: YardPoint | null;
  freeWait: number;
  /** Moment script phase. */
  momentPhase: 'going' | 'acting' | 'closing';
  momentTimer: number;
  momentPose: PoseId;
  /** Snapshot of the previous derived values for change events. */
  prev: {
    prompt: ZoneId | null;
    attention: DogAttention;
    dogZone: ZoneId | null;
    handlerZone: ZoneId | null;
    ready: boolean;
  } | null;
}

export type WorldStateWithInternal = WorldState & { internal: WorldInternal };

export function createInternal(): WorldInternal {
  return {
    followAnchor: null,
    handlerWasMoving: false,
    handlerStillS: 0,
    focusS: 0,
    moveDir: null,
    response: null,
    glanceOffered: false,
    wanderWait: 1.5,
    freeAnchor: null,
    freeWait: 0,
    momentPhase: 'going',
    momentTimer: 0,
    momentPose: 'sniff',
    prev: null,
  };
}

export function internalOf(world: WorldState): WorldInternal {
  const w = world as Partial<WorldStateWithInternal>;
  return w.internal ?? createInternal();
}

/** Shallow-clones the state deeply enough that the step may mutate the clone freely. */
export function cloneWorld(world: WorldState): WorldStateWithInternal {
  const src = internalOf(world);
  const actors = {} as WorldState['actors'];
  for (const key of Object.keys(world.actors) as Array<keyof WorldState['actors']>) {
    const a = world.actors[key];
    actors[key] = { ...a, position: { ...a.position }, path: a.path.map((p) => ({ ...p })) };
  }
  return {
    ...world,
    actors,
    dogMode: { ...world.dogMode },
    moment: world.moment ? { ...world.moment, spot: { ...world.moment.spot } } : null,
    exercise: world.exercise ? { ...world.exercise } : null,
    internal: {
      ...src,
      followAnchor: src.followAnchor ? { ...src.followAnchor } : null,
      moveDir: src.moveDir ? { ...src.moveDir } : null,
      response: src.response ? { ...src.response } : null,
      freeAnchor: src.freeAnchor ? { ...src.freeAnchor } : null,
      prev: src.prev ? { ...src.prev } : null,
    },
  };
}
