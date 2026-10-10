/**
 * Dog initiative (docs/WORLD_PLAN.md §5): between exercises the dog starts one moment chosen
 * deterministically from the RNG and the state; the player may respond or ignore; the moment fades
 * after MOMENT_TIMING.holdS. Nothing here touches the Save: the response's need change is dispatched
 * by the UI (RESPOND_MOMENT) and only mirrored here as the dog's pose.
 */
import { MOMENT_TIMING, YARD_SPEEDS } from '../simulation/defaults';
import type { MomentKind } from '../simulation/types';
import { deriveAttention, bandOf } from './attention';
import { stepStill } from './dog';
import { distance } from './layout';
import { clampToWalkable, findPath } from './nav';
import { nextRandom } from './rng';
import { advanceAlongPath, facingToward, turnToward } from './steering';
import type { WorldStateWithInternal } from './internal';
import type { Moment, WorldEvent, WorldNeeds, YardPoint } from './types';

/** Seconds the dog keeps the response pose before the moment closes. */
const CLOSE_S = 1.5;
/** Energy below which the dog may settle beside the handler. */
const SETTLE_ENERGY = 60;

export function momentsAllowed(world: WorldStateWithInternal): boolean {
  if (world.hold) return false;
  if (world.dogMode.kind !== 'follow') return false;
  if (world.internal.response) return false;
  const ex = world.exercise;
  if (ex && (ex.roundId !== null || ex.responding)) return false;
  return world.time >= world.momentCooldownUntil;
}

function candidates(world: WorldStateWithInternal, needs: WorldNeeds): MomentKind[] {
  const out: MomentKind[] = ['sniff_spot'];
  const dog = world.actors.dog;
  const handler = world.actors.handler;
  if (world.othersPresent && bandOf(distance(dog.position, world.actors.other_dog.position)) === 'mid') out.push('look_at_other_dog');
  if (needs.energy < SETTLE_ENERGY && handler.speed < 0.05 && handler.path.length === 0) out.push('settle_beside');
  if (deriveAttention(world, needs, world.internal.focusS) === 'focused') out.push('offer_glance');
  return out;
}

function sniffSpot(world: WorldStateWithInternal): YardPoint {
  const dog = world.actors.dog;
  const [a, s1] = nextRandom(world.rng);
  const [r, s2] = nextRandom(s1);
  world.rng = s2;
  const ang = a * Math.PI * 2;
  const rad = 0.8 + r * 1.2;
  return clampToWalkable(world.layout, { x: dog.position.x + Math.sin(ang) * rad, z: dog.position.z + Math.cos(ang) * rad });
}

function besideHandler(world: WorldStateWithInternal): YardPoint {
  const h = world.actors.handler;
  const dog = world.actors.dog;
  const r = (h.facing * Math.PI) / 180;
  const side = { x: Math.cos(r), z: -Math.sin(r) };
  const cross = (dog.position.x - h.position.x) * side.x + (dog.position.z - h.position.z) * side.z;
  const s = cross >= 0 ? 1 : -1;
  return clampToWalkable(world.layout, { x: h.position.x + side.x * s * 0.7, z: h.position.z + side.z * s * 0.7 });
}

export function maybeStartMoment(world: WorldStateWithInternal, needs: WorldNeeds, events: WorldEvent[]): void {
  if (world.moment || !momentsAllowed(world)) return;
  const kinds = candidates(world, needs);
  const [pick, s1] = nextRandom(world.rng);
  world.rng = s1;
  const kind = kinds[Math.min(kinds.length - 1, Math.floor(pick * kinds.length))]!;
  const dog = world.actors.dog;
  let spot: YardPoint;
  switch (kind) {
    case 'sniff_spot':
      spot = sniffSpot(world);
      break;
    case 'settle_beside':
      spot = besideHandler(world);
      break;
    default:
      spot = { ...dog.position };
  }
  const moment: Moment = { id: `moment_${Math.round(world.time * 1000)}_${kind}`, kind, startedAt: world.time, spot, response: null };
  world.moment = moment;
  world.dogMode = { kind: 'moment', momentId: moment.id };
  world.internal.momentTimer = 0;
  world.internal.momentPhase = kind === 'sniff_spot' || kind === 'settle_beside' ? 'going' : 'acting';
  world.internal.momentPose = kind === 'sniff_spot' ? 'sniff' : kind === 'settle_beside' ? 'lie_down' : kind === 'look_at_other_dog' ? 'alert_focus' : 'look_at_handler';
  dog.path = kind === 'sniff_spot' || kind === 'settle_beside' ? findPath(world.layout, dog.position, spot) : [];
  events.push({ type: 'momentStarted', moment: { ...moment, spot: { ...moment.spot } } });
}

export function endMoment(world: WorldStateWithInternal, events: WorldEvent[]): void {
  const moment = world.moment;
  if (!moment) return;
  world.moment = null;
  if (world.dogMode.kind === 'moment') world.dogMode = { kind: 'follow' };
  world.momentCooldownUntil = world.time + MOMENT_TIMING.cooldownS;
  world.internal.momentPhase = 'going';
  world.internal.momentTimer = 0;
  events.push({ type: 'momentEnded', moment: { ...moment, spot: { ...moment.spot } } });
}

export function stepMoment(world: WorldStateWithInternal, dt: number, events: WorldEvent[]): void {
  const moment = world.moment;
  if (!moment) return;
  const dog = world.actors.dog;
  const h = world.actors.handler;
  const internal = world.internal;
  internal.momentTimer += dt;
  if (moment.response !== null) {
    if (internal.momentPhase !== 'closing') {
      internal.momentPhase = 'closing';
      internal.momentTimer = 0;
      if (moment.response === 'call_gently' || moment.response === 'reward_glance') internal.momentPose = 'look_at_handler';
      else if (moment.response === 'sit_with') internal.momentPose = 'rest_loop';
      dog.path = [];
    }
    stepStill(dog, dt);
    if (internal.momentPose === 'look_at_handler' || internal.momentPose === 'rest_loop') turnToward(dog, facingToward(dog.position, h.position, dog.facing), dt);
    if (internal.momentTimer >= CLOSE_S) endMoment(world, events);
    return;
  }
  if (world.time - moment.startedAt >= MOMENT_TIMING.holdS) {
    endMoment(world, events);
    return;
  }
  if (internal.momentPhase === 'going') {
    const arrived = advanceAlongPath(dog, YARD_SPEEDS.dogFollow * 0.6, dt);
    if (arrived || dog.path.length === 0) {
      internal.momentPhase = 'acting';
      internal.momentTimer = 0;
      dog.speed = 0;
    }
    return;
  }
  stepStill(dog, dt);
  switch (moment.kind) {
    case 'look_at_other_dog':
      turnToward(dog, facingToward(dog.position, world.actors.other_dog.position, dog.facing), dt);
      break;
    case 'offer_glance':
    case 'settle_beside':
      turnToward(dog, facingToward(dog.position, h.position, dog.facing), dt);
      break;
    default:
      break;
  }
}
