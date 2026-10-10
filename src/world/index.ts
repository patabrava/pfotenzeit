/**
 * World model entry point (D-041, WP-P): `createWorldApi()` implements the WorldApi contract.
 * Pure: no DOM, no timers, no Date.now. Time advances only through step(dt).
 */
import { LOOK_AT_STILL_S, MOMENT_TIMING, YARD_SPEEDS } from '../simulation/defaults';
import type { DistanceBand, ExerciseContext, WorldDirective } from '../simulation/types';
import { FIND_SPOT_STILL_S, bandOf, deriveContext, focusConditions, isMoving, toExerciseContext } from './attention';
import { startResponse, stepFollow, stepFree, stepOthers, stepResponse, stepStill } from './dog';
import { buildDirective } from './directive';
import { cloneWorld, createInternal, internalOf, type WorldStateWithInternal } from './internal';
import { createDefaultLayout, distance } from './layout';
import { endMoment, maybeStartMoment, stepMoment } from './moments';
import { clampToWalkable, findPath, isFree } from './nav';
import { seedRng } from './rng';
import { advanceAlongPath, moveInDirection } from './steering';
import type { ActorState, StepResult, WorldApi, WorldEvent, WorldInput, WorldNeeds, WorldState, YardLayout, YardPoint } from './types';

export { createDefaultLayout } from './layout';

/** Largest sub-step the integrator uses (plan: dt ≤ 0.1 s per call; larger gaps are split). */
export const MAX_SUB_STEP_S = 0.1;
/** pointForBand distances per band (plan §2 / brief). */
export const BAND_POINT_M: Record<DistanceBand, number> = { near: 0.7, mid: 1.9, far: 3.0 };

function actor(key: ActorState['key'], position: YardPoint, facing: number): ActorState {
  return { key, position: { ...position }, facing, speed: 0, path: [] };
}

export function createWorld(seed: number, layout: YardLayout = createDefaultLayout()): WorldStateWithInternal {
  const s = layout.spawn;
  return {
    seed,
    time: 0,
    layout,
    actors: {
      handler: actor('handler', s.handler, 180),
      dog: actor('dog', s.dog, 180),
      other_dog: actor('other_dog', s.other_dog, -90),
      mira: actor('mira', s.mira, 0),
      alex: actor('alex', s.alex, -60),
    },
    dogMode: { kind: 'follow' },
    hold: false,
    moment: null,
    momentCooldownUntil: MOMENT_TIMING.firstAfterS,
    exercise: null,
    distraction: 'none',
    othersPresent: true,
    rng: seedRng(seed),
    internal: createInternal(),
  };
}

// ---------------------------------------------------------------- inputs

function releaseDog(world: WorldStateWithInternal): void {
  world.internal.response = null;
  world.internal.glanceOffered = false;
  world.internal.followAnchor = null;
  if (world.exercise) world.exercise = { ...world.exercise, responding: null, stillSince: null };
  world.dogMode = world.exercise && world.exercise.spec.kind === 'recall' ? { kind: 'free' } : { kind: 'follow' };
  if (world.dogMode.kind === 'free') world.internal.freeAnchor = { ...world.actors.dog.position };
}

function applyInput(world: WorldStateWithInternal, input: WorldInput, events: WorldEvent[]): void {
  const { layout } = world;
  const handler = world.actors.handler;
  switch (input.type) {
    case 'moveTo': {
      world.internal.moveDir = null;
      handler.path = findPath(layout, handler.position, clampToWalkable(layout, input.target));
      break;
    }
    case 'moveDir': {
      const len = Math.hypot(input.dx, input.dz);
      world.internal.moveDir = len > 1e-6 ? { dx: input.dx / len, dz: input.dz / len } : null;
      handler.path = [];
      break;
    }
    case 'stop':
      world.internal.moveDir = null;
      handler.path = [];
      break;
    case 'setBand': {
      let p = pointForBand(world, input.band);
      if (world.exercise?.spec.kind === 'find_spot') {
        // Text fallback: distance describes the dog's distance from the distraction,
        // rather than separating the handler from a dog that stays beside Bruno.
        const spot = world.distraction === 'toy' ? layout.distractionSpots.toy : world.actors.other_dog.position;
        let score = Infinity;
        for (let x = layout.bounds.min.x; x <= layout.bounds.max.x; x += layout.gridStep) {
          for (let z = layout.bounds.min.z; z <= layout.bounds.max.z; z += layout.gridStep) {
            const candidate = { x, z };
            if (!isFree(layout, candidate)) continue;
            const d = distance(candidate, spot);
            const penalty = (bandOf(d) === input.band ? 0 : 100) + Math.abs(d - BAND_POINT_M[input.band]) +
              (input.band === 'far' && bandOf(distance(candidate, world.actors.other_dog.position)) !== 'far' ? 100 : 0);
            if (penalty < score) { score = penalty; p = candidate; }
          }
        }
        world.actors.dog.position = { ...p };
        world.actors.dog.path = [];
        world.actors.dog.speed = 0;
      }
      handler.position = { ...p };
      handler.path = [];
      handler.speed = 0;
      world.internal.moveDir = null;
      world.internal.followAnchor = null;
      world.internal.handlerStillS = FIND_SPOT_STILL_S;
      break;
    }
    case 'setDistraction':
      world.distraction = input.level;
      break;
    case 'beginExercise': {
      if (world.moment) endMoment(world, events);
      world.exercise = { spec: input.spec, roundId: input.roundId, attempts: 0, responding: null, stillSince: null };
      world.distraction = input.spec.distraction;
      world.internal.response = null;
      world.internal.glanceOffered = false;
      world.internal.focusS = 0;
      if (input.spec.kind === 'recall') {
        world.dogMode = { kind: 'free' };
        world.internal.freeAnchor = input.spec.distraction === 'toy' ? { ...layout.distractionSpots.toy } : { ...world.actors.dog.position };
        world.internal.freeWait = 0;
        if (input.spec.distraction === 'toy') world.actors.dog.path = findPath(layout, world.actors.dog.position, clampToWalkable(layout, layout.distractionSpots.toy));
      } else {
        world.dogMode = { kind: 'follow' };
      }
      break;
    }
    case 'endExercise':
      world.exercise = null;
      world.distraction = 'none';
      world.internal.response = null;
      world.internal.glanceOffered = false;
      world.internal.freeAnchor = null;
      world.dogMode = { kind: 'follow' };
      break;
    case 'showResponse': {
      if (!world.exercise) break;
      if (world.moment) endMoment(world, events);
      world.exercise = { ...world.exercise, attempts: world.exercise.attempts + 1, responding: input.response };
      startResponse(world, input.response);
      break;
    }
    case 'respondMoment': {
      if (world.moment && world.moment.id === input.momentId && world.moment.response === null) {
        world.moment = { ...world.moment, response: input.response };
      }
      break;
    }
    case 'holdDog': {
      if (world.moment) endMoment(world, events);
      if (input.pose === null) releaseDog(world);
      else {
        world.internal.response = null;
        world.dogMode = { kind: 'held', pose: input.pose };
        world.actors.dog.path = [];
      }
      break;
    }
    case 'setHold':
      world.hold = input.hold;
      if (input.hold && world.moment) endMoment(world, events);
      break;
    case 'teleport': {
      const a = world.actors[input.actor];
      a.position = clampToWalkable(layout, input.position);
      a.path = [];
      a.speed = 0;
      if (input.actor === 'handler') world.internal.followAnchor = null;
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------- stepping

function stepHandler(world: WorldStateWithInternal, dt: number, events: WorldEvent[]): void {
  const handler = world.actors.handler;
  const dir = world.internal.moveDir;
  if (dir) {
    const before = { ...handler.position };
    moveInDirection(handler, dir.dx, dir.dz, YARD_SPEEDS.handler, dt);
    if (!isFree(world.layout, handler.position)) {
      // slide: try each axis alone, else stay
      const tryX = { x: handler.position.x, z: before.z };
      const tryZ = { x: before.x, z: handler.position.z };
      if (isFree(world.layout, tryX)) handler.position = tryX;
      else if (isFree(world.layout, tryZ)) handler.position = tryZ;
      else {
        handler.position = before;
        handler.speed = 0;
      }
    }
    return;
  }
  const arrived = advanceAlongPath(handler, YARD_SPEEDS.handler, dt);
  if (arrived) events.push({ type: 'arrived', actor: 'handler', position: { ...handler.position } });
}

function stepDog(world: WorldStateWithInternal, dt: number, handlerMoving: boolean, handlerJustStopped: boolean, events: WorldEvent[]): void {
  const dog = world.actors.dog;
  if (world.internal.response) {
    stepResponse(world, dt, events);
    return;
  }
  if (world.hold) {
    stepStill(dog, dt);
    return;
  }
  switch (world.dogMode.kind) {
    case 'held':
      stepStill(dog, dt);
      break;
    case 'moment':
      stepMoment(world, dt, events);
      break;
    case 'free':
      stepFree(world, dt, events);
      break;
    case 'coming':
      // only meaningful inside a response script; otherwise fall back to following
      world.dogMode = { kind: 'follow' };
      stepFollow(world, dt, handlerMoving, handlerJustStopped, events);
      break;
    default:
      if (world.exercise?.spec.kind === 'look_at' && world.internal.glanceOffered) stepStill(dog, dt);
      else stepFollow(world, dt, handlerMoving, handlerJustStopped, events);
      break;
  }
}

function stepLookAt(world: WorldStateWithInternal, needs: WorldNeeds, handlerMoving: boolean, events: WorldEvent[]): void {
  const ex = world.exercise;
  if (!ex || ex.spec.kind !== 'look_at' || ex.responding || world.internal.response) return;
  const calm = !handlerMoving && focusConditions(world, needs) && bandOf(distance(world.actors.dog.position, world.actors.handler.position)) !== 'far';
  if (!calm) {
    if (ex.stillSince !== null || world.internal.glanceOffered) world.exercise = { ...ex, stillSince: null };
    world.internal.glanceOffered = false;
    return;
  }
  if (ex.stillSince === null) {
    world.exercise = { ...ex, stillSince: world.time };
    return;
  }
  if (!world.internal.glanceOffered && world.time - ex.stillSince >= LOOK_AT_STILL_S) {
    world.internal.glanceOffered = true;
    world.actors.dog.path = [];
    events.push({ type: 'glanceOffered' });
  }
}

function subStep(world: WorldStateWithInternal, dt: number, needs: WorldNeeds, events: WorldEvent[]): void {
  const handler = world.actors.handler;
  const internal = world.internal;
  stepHandler(world, dt, events);
  const handlerMoving = isMoving(handler.speed, handler.path) || internal.moveDir !== null;
  const handlerJustStopped = internal.handlerWasMoving && !handlerMoving;
  internal.handlerWasMoving = handlerMoving;
  internal.handlerStillS = handlerMoving ? 0 : internal.handlerStillS + dt;
  stepDog(world, dt, handlerMoving, handlerJustStopped, events);
  stepOthers(world, dt);
  internal.focusS = focusConditions(world, needs) ? internal.focusS + dt : 0;
  stepLookAt(world, needs, handlerMoving, events);
  world.time += dt;
  maybeStartMoment(world, needs, events);
}

export function stepWorld(input: WorldState, dt: number, inputs: WorldInput[], needs: WorldNeeds): StepResult {
  const world = cloneWorld(input);
  const events: WorldEvent[] = [];
  const beforeCtx = deriveContext(world, needs);
  for (const i of inputs) applyInput(world, i, events);
  let remaining = Math.max(0, dt);
  while (remaining > 1e-9) {
    const step = Math.min(MAX_SUB_STEP_S, remaining);
    subStep(world, step, needs, events);
    remaining -= step;
  }
  const context = deriveContext(world, needs);
  const prev = world.internal.prev ?? {
    prompt: beforeCtx.prompt,
    attention: beforeCtx.attention,
    dogZone: beforeCtx.dogZone,
    handlerZone: beforeCtx.handlerZone,
    ready: beforeCtx.exerciseReady,
  };
  if (prev.handlerZone !== context.handlerZone) events.push({ type: 'zoneChanged', actor: 'handler', zone: context.handlerZone });
  if (prev.dogZone !== context.dogZone) events.push({ type: 'zoneChanged', actor: 'dog', zone: context.dogZone });
  if (prev.prompt !== context.prompt) events.push({ type: 'promptChanged', prompt: context.prompt });
  if (prev.attention !== context.attention) events.push({ type: 'attentionChanged', from: prev.attention, to: context.attention });
  if (prev.ready !== context.exerciseReady) events.push({ type: 'exerciseReadyChanged', ready: context.exerciseReady });
  world.internal.prev = { prompt: context.prompt, attention: context.attention, dogZone: context.dogZone, handlerZone: context.handlerZone, ready: context.exerciseReady };
  return { world, context, events };
}

// ---------------------------------------------------------------- helpers exposed through the API

/** Free point on the handler's side of the dog at the band's distance; falls back to other directions when blocked. */
export function pointForBand(world: WorldState, band: DistanceBand): YardPoint {
  const dog = world.actors.dog.position;
  const handler = world.actors.handler.position;
  const want = BAND_POINT_M[band];
  const base = distance(dog, handler) > 1e-3 ? Math.atan2(handler.x - dog.x, handler.z - dog.z) : (world.actors.dog.facing * Math.PI) / 180 + Math.PI;
  let best: YardPoint | null = null;
  let bestScore = Infinity;
  for (const offset of [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180]) {
    const a = base + (offset * Math.PI) / 180;
    const raw = { x: dog.x + Math.sin(a) * want, z: dog.z + Math.cos(a) * want };
    const p = isFree(world.layout, raw) ? raw : clampToWalkable(world.layout, raw);
    const d = distance(dog, p);
    const score = (bandOf(d) === band ? 0 : 10) + Math.abs(d - want) + Math.abs(offset) / 1000;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best ?? { ...handler };
}

export function createWorldApi(): WorldApi {
  return {
    create: (seed, layout) => createWorld(seed, layout),
    step: (world, dt, inputs, needs) => stepWorld(world, dt, inputs, needs),
    context: (world, needs) => deriveContext(world, needs),
    exerciseContext: (world, needs): ExerciseContext => toExerciseContext(world, needs),
    directive: (world, needs): WorldDirective => buildDirective(world, needs),
    pointForBand: (world, band) => pointForBand(world, band),
  };
}

export { internalOf };
