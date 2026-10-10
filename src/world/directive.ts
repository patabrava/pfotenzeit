/**
 * Projection of the world for the renderer (WorldDirective). Poses follow docs/WORLD_PLAN.md §3:
 * attention → pose while standing, `walk` while moving; held / moment / response poses override.
 */
import type { DogAttention, GestureId, PoseId, WorldActorDirective, WorldDirective } from '../simulation/types';
import { deriveContext, distractionSpot, isMoving } from './attention';
import { distance, zoneById } from './layout';
import { internalOf } from './internal';
import { facingToward, normalizeDeg } from './steering';
import type { ActorState, WorldNeeds, WorldState } from './types';

export const ATTENTION_POSE: Record<DogAttention, PoseId> = {
  relaxed: 'idle_relaxed',
  focused: 'look_at_handler',
  distracted: 'alert_focus',
  tense: 'tense_idle',
  tired: 'tired_idle',
  resting: 'rest_loop',
};

/** Humans have no walk gesture in the clip contract; the renderer drives the stride from `speed`. */
function humanPose(_actor: ActorState): GestureId {
  return 'idle';
}

/** Pose and facing of the own dog. */
export function dogPresentation(world: WorldState, needs: WorldNeeds): { pose: PoseId; facing: number } {
  const dog = world.actors.dog;
  const internal = internalOf(world);
  const ctx = deriveContext(world, needs);
  if (isMoving(dog.speed, dog.path) && dog.speed > 0.05) return { pose: 'walk', facing: dog.facing };
  if (internal.response) return { pose: internal.response.pose, facing: dog.facing };
  if (world.moment && world.dogMode.kind === 'moment') return { pose: internal.momentPose, facing: dog.facing };
  if (world.dogMode.kind === 'held') return { pose: world.dogMode.pose, facing: dog.facing };
  if (world.exercise?.spec.kind === 'look_at' && internal.glanceOffered) {
    return { pose: 'look_at_handler', facing: facingToward(dog.position, world.actors.handler.position, dog.facing) };
  }
  const pose = ATTENTION_POSE[ctx.attention];
  let facing = dog.facing;
  if (ctx.attention === 'distracted') {
    const spot = distractionSpot(world);
    if (spot) facing = facingToward(dog.position, spot, dog.facing);
  } else if (ctx.attention === 'focused') {
    facing = facingToward(dog.position, world.actors.handler.position, dog.facing);
  } else if (ctx.attention === 'tense' && world.othersPresent) {
    facing = normalizeDeg(facingToward(dog.position, world.actors.other_dog.position, dog.facing) + 150);
  }
  return { pose, facing };
}

export function buildDirective(world: WorldState, needs: WorldNeeds): WorldDirective {
  const ctx = deriveContext(world, needs);
  const { handler, dog, other_dog: bruno, mira, alex } = world.actors;
  const dogShown = dogPresentation(world, needs);
  const actors: WorldActorDirective[] = [
    { key: 'handler', characterId: 'handler', position: { ...handler.position }, facing: handler.facing, speed: handler.speed, pose: humanPose(handler) },
    { key: 'dog', characterId: 'dog_nala', position: { ...dog.position }, facing: dogShown.facing, speed: dog.speed, pose: dogShown.pose },
  ];
  if (world.othersPresent) {
    const brunoMoving = isMoving(bruno.speed, bruno.path) && bruno.speed > 0.05;
    const ownNear = distance(dog.position, bruno.position) <= 1.2;
    actors.push({ key: 'other_dog', characterId: 'dog_bruno', position: { ...bruno.position }, facing: bruno.facing, speed: bruno.speed, pose: brunoMoving ? 'walk' : ownNear ? 'alert_focus' : 'idle_relaxed' });
    actors.push({ key: 'alex', characterId: 'human_alex', position: { ...alex.position }, facing: alex.facing, speed: 0, pose: 'idle' });
  }
  actors.push({ key: 'mira', characterId: 'human_mira', position: { ...mira.position }, facing: mira.facing, speed: 0, pose: 'idle' });
  const promptZone = ctx.prompt ? zoneById(world.layout, ctx.prompt) : null;
  return {
    actors,
    focus: { ...handler.position },
    prompt: promptZone ? { zoneId: promptZone.id, position: { ...promptZone.center }, radius: promptZone.radius } : null,
    momentSpot: world.moment && world.moment.response === null ? { ...world.moment.spot } : null,
    distraction: world.distraction,
    attention: ctx.attention,
  };
}
