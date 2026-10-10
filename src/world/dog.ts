/**
 * Own-dog behaviour per step: loose-leash following, free wandering (practice before the attempt),
 * the response scripts after an exercise attempt, and the other dog's wander. Mutates the cloned state.
 */
import { YARD_SPEEDS } from '../simulation/defaults';
import type { ExerciseResponse } from '../simulation/types';
import { distance } from './layout';
import { clampToWalkable, findPath } from './nav';
import { nextRandom } from './rng';
import { advanceAlongPath, facingToward, normalizeDeg, turnToward } from './steering';
import type { ResponseScript, WorldStateWithInternal } from './internal';
import type { ActorState, WorldEvent, YardPoint } from './types';

/** Target leash distance behind/beside the handler and the handler move that re-targets the dog. */
export const LEASH_M = 1.2;
export const RETARGET_M = 0.8;
/** The dog never comes closer to the handler than this while following. */
const PERSONAL_SPACE_M = 0.45;
/** Beyond this the dog walks to its leash spot even when the handler stands. */
const CATCH_UP_M = 1.6;
/** Response scripts are capped here (plan §6: motion settles ≤ 3 s). */
export const RESPONSE_CAP_S = 3;

function forward(facingDeg: number): YardPoint {
  const r = (facingDeg * Math.PI) / 180;
  return { x: Math.sin(r), z: Math.cos(r) };
}

/** Point `dist` metres from `from` in the direction of `to`. */
export function pointToward(from: YardPoint, to: YardPoint, dist: number): YardPoint {
  const d = distance(from, to);
  if (d < 1e-6) return { ...from };
  return { x: from.x + ((to.x - from.x) / d) * dist, z: from.z + ((to.z - from.z) / d) * dist };
}

function leashSpot(world: WorldStateWithInternal): YardPoint {
  const h = world.actors.handler;
  const dog = world.actors.dog;
  const f = forward(h.facing);
  // behind the handler, offset to the side the dog is already on
  const side = { x: f.z, z: -f.x };
  const cross = (dog.position.x - h.position.x) * side.x + (dog.position.z - h.position.z) * side.z;
  const s = cross >= 0 ? 1 : -1;
  const raw = { x: h.position.x - f.x * LEASH_M * 0.8 + side.x * s * LEASH_M * 0.5, z: h.position.z - f.z * LEASH_M * 0.8 + side.z * s * LEASH_M * 0.5 };
  return clampToWalkable(world.layout, raw);
}

/** Stops the dog before it would step into the handler. */
function keepPersonalSpace(world: WorldStateWithInternal, before: YardPoint): void {
  const dog = world.actors.dog;
  const h = world.actors.handler;
  if (distance(dog.position, h.position) < PERSONAL_SPACE_M && distance(before, h.position) >= distance(dog.position, h.position)) {
    dog.position = before;
    dog.speed = 0;
    dog.path = [];
  }
}

export function stepFollow(world: WorldStateWithInternal, dt: number, handlerMoving: boolean, handlerJustStopped: boolean, events: WorldEvent[]): void {
  const dog = world.actors.dog;
  const h = world.actors.handler;
  const internal = world.internal;
  const d = distance(dog.position, h.position);
  if (handlerMoving) {
    const anchorMoved = !internal.followAnchor || distance(h.position, internal.followAnchor) > RETARGET_M;
    if (anchorMoved || (dog.path.length === 0 && d > CATCH_UP_M)) {
      internal.followAnchor = { ...h.position };
      dog.path = findPath(world.layout, dog.position, leashSpot(world));
    }
  } else if (handlerJustStopped) {
    // settle: keep the current way point only when the dog is still far away
    if (d <= CATCH_UP_M) dog.path = [];
    else {
      internal.followAnchor = { ...h.position };
      dog.path = findPath(world.layout, dog.position, leashSpot(world));
    }
  } else if (dog.path.length === 0 && d > CATCH_UP_M) {
    internal.followAnchor = { ...h.position };
    dog.path = findPath(world.layout, dog.position, leashSpot(world));
  }
  const before = { ...dog.position };
  const arrived = advanceAlongPath(dog, YARD_SPEEDS.dogFollow, dt);
  keepPersonalSpace(world, before);
  if (arrived) events.push({ type: 'arrived', actor: 'dog', position: { ...dog.position } });
  if (dog.path.length === 0 && dog.speed < 0.05) {
    // standing: face the handler loosely
    turnToward(dog, facingToward(dog.position, h.position, dog.facing), dt * 0.5);
  }
}

/** Free mode: wanders slowly within 0.6 m of its anchor (toy spot or where it stood), pausing between legs. */
export function stepFree(world: WorldStateWithInternal, dt: number, events: WorldEvent[]): void {
  const dog = world.actors.dog;
  const internal = world.internal;
  if (!internal.freeAnchor) internal.freeAnchor = { ...dog.position };
  if (dog.path.length === 0) {
    internal.freeWait -= dt;
    if (internal.freeWait <= 0) {
      const [a, s1] = nextRandom(world.rng);
      const [r, s2] = nextRandom(s1);
      world.rng = s2;
      const ang = a * Math.PI * 2;
      const rad = 0.25 + r * 0.35;
      const target = clampToWalkable(world.layout, { x: internal.freeAnchor.x + Math.sin(ang) * rad, z: internal.freeAnchor.z + Math.cos(ang) * rad });
      dog.path = findPath(world.layout, dog.position, target);
      const [w, s3] = nextRandom(world.rng);
      world.rng = s3;
      internal.freeWait = 1.5 + w * 2.5;
    }
  }
  const arrived = advanceAlongPath(dog, YARD_SPEEDS.dogWander, dt);
  if (arrived) events.push({ type: 'arrived', actor: 'dog', position: { ...dog.position } });
}

/** Holds the dog where it is (held poses, observation hold, frozen after a response). */
export function stepStill(dog: ActorState, dt: number): void {
  dog.path = [];
  dog.speed = Math.max(0, dog.speed - 8 * dt);
}

// ---------------------------------------------------------------- response scripts

export function startResponse(world: WorldStateWithInternal, response: ExerciseResponse): void {
  const dog = world.actors.dog;
  const h = world.actors.handler;
  const layout = world.layout;
  const script: ResponseScript = { kind: response, phase: 0, timer: 0, elapsed: 0, pose: 'idle_relaxed', targetFacing: null };
  dog.path = [];
  switch (response) {
    case 'comes': {
      world.dogMode = { kind: 'coming' };
      const front = clampToWalkable(layout, { x: h.position.x + forward(h.facing).x * 0.8, z: h.position.z + forward(h.facing).z * 0.8 });
      dog.path = findPath(layout, dog.position, front);
      script.pose = 'sit';
      break;
    }
    case 'hesitates': {
      const step = pointToward(dog.position, h.position, Math.min(0.4, Math.max(0, distance(dog.position, h.position) - PERSONAL_SPACE_M)));
      dog.path = findPath(layout, dog.position, clampToWalkable(layout, step));
      script.pose = 'look_at_handler';
      break;
    }
    case 'distracted': {
      const spot = world.distraction === 'other_dog' ? world.actors.other_dog.position : layout.distractionSpots.toy;
      const d = distance(dog.position, spot);
      const target = d > 1.0 ? pointToward(dog.position, spot, d - 1.0) : dog.position;
      dog.path = findPath(layout, dog.position, clampToWalkable(layout, target));
      script.pose = 'alert_focus';
      break;
    }
    case 'turns_away': {
      script.targetFacing = normalizeDeg(facingToward(dog.position, h.position, dog.facing) + 120);
      script.pose = 'sniff';
      break;
    }
    case 'settled':
      script.pose = 'lie_down';
      script.phase = 1;
      break;
    case 'still_tense': {
      script.pose = 'tense_idle';
      script.phase = 1;
      if (world.othersPresent) script.targetFacing = normalizeDeg(facingToward(dog.position, world.actors.other_dog.position, dog.facing) + 150);
      break;
    }
    case 'glance':
      script.pose = 'look_at_handler';
      script.targetFacing = facingToward(dog.position, h.position, dog.facing);
      script.phase = 1;
      break;
    default:
      script.phase = 1;
  }
  world.internal.response = script;
  world.internal.glanceOffered = false;
}

/** Hold durations per response before `responseShown` (after any motion). */
const HOLD_S: Record<ExerciseResponse, number> = {
  comes: 0.3,
  hesitates: 1.5,
  distracted: 0.6,
  turns_away: 1.0,
  settled: 1.0,
  still_tense: 0.8,
  glance: 0.5,
};

export function stepResponse(world: WorldStateWithInternal, dt: number, events: WorldEvent[]): void {
  const script = world.internal.response;
  if (!script) return;
  const dog = world.actors.dog;
  const h = world.actors.handler;
  script.elapsed += dt;
  script.timer += dt;
  if (script.phase === 0) {
    if (script.kind === 'turns_away') {
      stepStill(dog, dt);
      if (script.targetFacing !== null) turnToward(dog, script.targetFacing, dt);
      if (script.targetFacing === null || Math.abs(normalizeDeg(dog.facing - script.targetFacing)) < 2 || script.timer > 0.8) {
        script.phase = 1;
        script.timer = 0;
      }
    } else {
      const speed = script.kind === 'comes' ? YARD_SPEEDS.dogComing : YARD_SPEEDS.dogFollow;
      const before = { ...dog.position };
      const arrived = advanceAlongPath(dog, speed, dt);
      if (script.kind === 'comes' || script.kind === 'hesitates') keepPersonalSpace(world, before);
      if (arrived || dog.path.length === 0 || script.elapsed >= RESPONSE_CAP_S - 0.3) {
        dog.path = [];
        dog.speed = 0;
        script.phase = 1;
        script.timer = 0;
        if (script.kind === 'comes') {
          world.dogMode = { kind: 'held', pose: 'sit' };
          script.targetFacing = facingToward(dog.position, h.position, dog.facing);
        } else if (script.kind === 'hesitates') {
          script.targetFacing = facingToward(dog.position, h.position, dog.facing);
        } else if (script.kind === 'distracted') {
          const spot = world.distraction === 'other_dog' ? world.actors.other_dog.position : world.layout.distractionSpots.toy;
          script.targetFacing = facingToward(dog.position, spot, dog.facing);
        }
      }
    }
    return;
  }
  stepStill(dog, dt);
  if (script.targetFacing !== null) turnToward(dog, script.targetFacing, dt);
  if (script.phase === 1 && (script.timer >= HOLD_S[script.kind] || script.elapsed >= RESPONSE_CAP_S)) {
    script.phase = 2;
    if (script.kind === 'hesitates') script.pose = 'idle_relaxed';
    events.push({ type: 'responseShown', response: script.kind });
  }
}

// ---------------------------------------------------------------- the other dog, Alex and Mira

export function stepOthers(world: WorldStateWithInternal, dt: number): void {
  if (!world.othersPresent) return;
  const bruno = world.actors.other_dog;
  const alex = world.actors.alex;
  const mira = world.actors.mira;
  const dog = world.actors.dog;
  const h = world.actors.handler;
  const internal = world.internal;
  const home = world.layout.spawn.other_dog;
  const ownNear = distance(dog.position, bruno.position) <= 2.6;
  if (bruno.path.length === 0) {
    internal.wanderWait -= dt;
    if (internal.wanderWait <= 0) {
      const [a, s1] = nextRandom(world.rng);
      const [r, s2] = nextRandom(s1);
      const [w, s3] = nextRandom(s2);
      world.rng = s3;
      const ang = a * Math.PI * 2;
      const rad = r * 0.6;
      bruno.path = findPath(world.layout, bruno.position, clampToWalkable(world.layout, { x: home.x + Math.sin(ang) * rad, z: home.z + Math.cos(ang) * rad }));
      internal.wanderWait = 2 + w * 4;
    }
  }
  advanceAlongPath(bruno, YARD_SPEEDS.dogWander * (ownNear ? 0.5 : 1), dt);
  if (bruno.path.length === 0 && ownNear) turnToward(bruno, facingToward(bruno.position, dog.position, bruno.facing), dt * 0.5);
  alex.speed = 0;
  alex.path = [];
  turnToward(alex, facingToward(alex.position, bruno.position, alex.facing), dt * 0.5);
  mira.speed = 0;
  mira.path = [];
  const target = distance(mira.position, h.position) <= 3 ? facingToward(mira.position, h.position, mira.facing) : 0;
  turnToward(mira, target, dt * 0.5);
}
