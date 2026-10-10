/**
 * Derived values (docs/WORLD_PLAN.md §3): distance bands, zones, the contextual prompt, the dog's
 * attention and exercise readiness. Pure functions of the world state and the dog's needs.
 *
 * Attention rules, in priority order (mirrored by tests/world/attention.test.ts):
 *   resting     while held in rest_loop / lie_down
 *   tense       other dog within `near` (1.2 m), or stress ≥ 50 and other dog within `mid`
 *   distracted  a distraction is set and the dog is within `mid` of its spot (toy) or of the other dog
 *   tired       energy < EXERCISE_RULES.energyTired
 *   focused     handler standing still within `mid`, nothing distracting, for ≥ FOCUS_AFTER_S
 *   relaxed     otherwise
 */
import { DISTANCE_BANDS, EXERCISE_RULES } from '../simulation/defaults';
import type { DistanceBand, DogAttention, ExerciseContext } from '../simulation/types';
import { PROMPT_ZONES, distance, zoneAt } from './layout';
import { internalOf } from './internal';
import type { WorldContext, WorldNeeds, WorldState, YardPoint } from './types';

/** Seconds of calm standing before the dog counts as focused. */
export const FOCUS_AFTER_S = 2;
/** Handler speed below which a prompt may appear. */
export const PROMPT_MAX_SPEED = 0.3;
/** Handler must stand this long before find_spot is ready (avoids flicker while stopping). */
export const FIND_SPOT_STILL_S = 0.3;

export function bandOf(d: number): DistanceBand {
  if (d <= DISTANCE_BANDS.nearMax) return 'near';
  if (d <= DISTANCE_BANDS.midMax) return 'mid';
  return 'far';
}

export function isMoving(speed: number, path: YardPoint[]): boolean {
  return speed > 0.05 || path.length > 0;
}

export function distractionSpot(world: WorldState): YardPoint | null {
  if (world.distraction === 'toy') return world.layout.distractionSpots.toy;
  if (world.distraction === 'other_dog') return world.actors.other_dog.position;
  return null;
}

/** Band between the dog and the active distraction's spot ('far' when none). */
export function distractionBand(world: WorldState): DistanceBand {
  const spot = distractionSpot(world);
  return spot ? bandOf(distance(world.actors.dog.position, spot)) : 'far';
}

export function deriveAttention(world: WorldState, needs: WorldNeeds, focusS: number): DogAttention {
  const dog = world.actors.dog;
  const handler = world.actors.handler;
  const otherBand = world.othersPresent ? bandOf(distance(dog.position, world.actors.other_dog.position)) : 'far';
  if (world.dogMode.kind === 'held' && (world.dogMode.pose === 'rest_loop' || world.dogMode.pose === 'lie_down')) return 'resting';
  if (otherBand === 'near' || (needs.stress >= EXERCISE_RULES.stressHesitate && otherBand === 'mid')) return 'tense';
  if (world.distraction !== 'none' && distractionBand(world) !== 'far') return 'distracted';
  if (needs.energy < EXERCISE_RULES.energyTired) return 'tired';
  const handlerBand = bandOf(distance(dog.position, handler.position));
  if (handlerBand !== 'far' && !isMoving(handler.speed, handler.path) && focusS >= FOCUS_AFTER_S) return 'focused';
  return 'relaxed';
}

/** True while the preconditions for 'focused' hold (the caller accumulates the time). */
export function focusConditions(world: WorldState, needs: WorldNeeds): boolean {
  const dog = world.actors.dog;
  const handler = world.actors.handler;
  if (isMoving(handler.speed, handler.path)) return false;
  if (bandOf(distance(dog.position, handler.position)) === 'far') return false;
  if (world.distraction !== 'none' && distractionBand(world) !== 'far') return false;
  const otherBand = world.othersPresent ? bandOf(distance(dog.position, world.actors.other_dog.position)) : 'far';
  if (otherBand === 'near' || (needs.stress >= EXERCISE_RULES.stressHesitate && otherBand === 'mid')) return false;
  return needs.energy >= EXERCISE_RULES.energyTired;
}

export function exerciseReady(world: WorldState): boolean {
  const ex = world.exercise;
  if (!ex || ex.responding) return false;
  const internal = internalOf(world);
  const handler = world.actors.handler;
  const d = distance(world.actors.dog.position, handler.position);
  switch (ex.spec.kind) {
    case 'recall':
      return ex.spec.minDistanceM !== undefined ? d >= ex.spec.minDistanceM : bandOf(d) === 'far';
    case 'find_spot':
      return !isMoving(handler.speed, handler.path) && internal.handlerStillS >= FIND_SPOT_STILL_S;
    case 'look_at':
      return internal.glanceOffered;
    default:
      return false;
  }
}

export function deriveContext(world: WorldState, needs: WorldNeeds): WorldContext {
  const internal = internalOf(world);
  const { layout } = world;
  const dog = world.actors.dog;
  const handler = world.actors.handler;
  const dogHandlerDistance = distance(dog.position, handler.position);
  const dogOtherDogDistance = world.othersPresent ? distance(dog.position, world.actors.other_dog.position) : Infinity;
  const handlerMoving = isMoving(handler.speed, handler.path);
  const dogMoving = isMoving(dog.speed, dog.path);
  const handlerZone = zoneAt(layout, handler.position);
  const prompt = handlerZone && PROMPT_ZONES.has(handlerZone) && handler.speed < PROMPT_MAX_SPEED && handler.path.length === 0 ? handlerZone : null;
  return {
    dogHandlerDistance,
    dogOtherDogDistance,
    handlerBand: bandOf(dogHandlerDistance),
    otherDogBand: Number.isFinite(dogOtherDogDistance) ? bandOf(dogOtherDogDistance) : 'far',
    dogZone: zoneAt(layout, dog.position),
    handlerZone,
    prompt,
    attention: deriveAttention(world, needs, internal.focusS),
    distraction: world.distraction,
    exerciseReady: exerciseReady(world),
    handlerMoving,
    dogMoving,
  };
}

export function toExerciseContext(world: WorldState, needs: WorldNeeds): ExerciseContext {
  const ctx = deriveContext(world, needs);
  return {
    handlerBand: ctx.handlerBand,
    otherDogBand: ctx.otherDogBand,
    distraction: ctx.distraction,
    distractionBand: distractionBand(world),
    dogZone: ctx.dogZone,
    handlerMoving: ctx.handlerMoving,
  };
}
