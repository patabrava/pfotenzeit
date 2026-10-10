/**
 * World model contract (D-041 "Hofleben"): the yard the player walks in with the dog.
 *
 * Pure data. No DOM, no Three.js, no timers, no Date.now. The world is TRANSIENT (never persisted):
 * on boot everyone stands at the layout spawn points. Time advances only through stepWorld(dt).
 * Discrete, committable outcomes (exercise attempts, moment responses) leave the world as WorldEvents and
 * are dispatched to the store by src/app/world.ts; the world never mutates a Save.
 *
 * Owner of the implementation: src/world/** (WP-P). This file is a shared contract (ines-c3).
 */
import type {
  DistanceBand,
  DistractionLevel,
  DogAttention,
  ExerciseContext,
  ExerciseKind,
  ExerciseResponse,
  MomentKind,
  MomentResponse,
  NeedValues,
  UpgradeId,
  WorldActorKey,
  WorldDirective,
  YardPoint,
} from '../simulation/types';
import type { ExerciseSpec } from '../content/types';

export type { YardPoint, WorldActorKey };

/** Zones the handler can act in. Positions follow the stage layout of the courtyard GLB (environment.mjs STAGE). */
export type ZoneId =
  | 'gate'
  | 'circle'
  | 'shelter'
  | 'bowl'
  | 'rest_deck'
  | 'sniff_corner'
  | 'quiet_corner'
  | 'mira'
  | 'alex_bruno';

export interface Zone {
  id: ZoneId;
  center: YardPoint;
  /** Metres; the handler is "in" the zone inside this radius. */
  radius: number;
  /** Only offered once the upgrade is owned (decoration still exists as a place). */
  requiresUpgrade?: UpgradeId;
}

/** Circular obstacle for navigation (shelter posts, tree, planters, rest deck edge). */
export interface Obstacle {
  center: YardPoint;
  radius: number;
}

export interface YardLayout {
  /** Walkable rectangle (inside the fence). */
  bounds: { min: YardPoint; max: YardPoint };
  zones: Zone[];
  obstacles: Obstacle[];
  spawn: Record<WorldActorKey, YardPoint>;
  /** Where the distraction objects sit: toy in the circle, other dog at the fence with Alex. */
  distractionSpots: { toy: YardPoint; otherDog: YardPoint };
  /** Grid resolution for path finding, metres. */
  gridStep: number;
}

export interface ActorState {
  key: WorldActorKey;
  position: YardPoint;
  /** Degrees around +Y, 0 = facing +Z. */
  facing: number;
  /** Current speed, m/s. */
  speed: number;
  /** Remaining way points (metres). Empty = standing. */
  path: YardPoint[];
}

/** How the dog decides where to go. */
export type DogMode =
  | { kind: 'follow' } // keeps a loose leash distance behind/beside the handler
  | { kind: 'held'; pose: 'sit' | 'lie_down' | 'rest_loop' | 'eat' } // stays put (care, resting, observation hold)
  | { kind: 'moment'; momentId: string } // acting on its own initiative at the moment spot
  | { kind: 'coming' } // recall response: walking to the handler
  | { kind: 'free' }; // free practice before the attempt: wanders within the circle

export interface Moment {
  id: string;
  kind: MomentKind;
  /** World time when it started (s). */
  startedAt: number;
  spot: YardPoint;
  /** Set once the player responded; the world finishes the moment and clears it. */
  response: MomentResponse | null;
}

/** Live part of an exercise (lesson round or free practice). */
export interface ExerciseLive {
  spec: ExerciseSpec;
  roundId: string | null;
  /** Attempts so far in this exercise (lesson: per round; practice: since start). */
  attempts: number;
  /** True while the dog performs its response to the last attempt; the UI waits for the renderer's present(). */
  responding: ExerciseResponse | null;
  /** look_at: the dog offers a glance after standing still this long (s) with low distraction. */
  stillSince: number | null;
}

/** Values derived every step for the UI, the renderer and the exercise rules. */
export interface WorldContext {
  dogHandlerDistance: number;
  dogOtherDogDistance: number;
  handlerBand: DistanceBand;
  otherDogBand: DistanceBand;
  dogZone: ZoneId | null;
  handlerZone: ZoneId | null;
  /** Zone the handler can act in right now (inside radius, not moving fast), or null. */
  prompt: ZoneId | null;
  attention: DogAttention;
  distraction: DistractionLevel;
  /** Exercise requirement met (e.g. far enough for recall). */
  exerciseReady: boolean;
  handlerMoving: boolean;
  dogMoving: boolean;
}

export interface WorldState {
  seed: number;
  /** Seconds of simulated world time. */
  time: number;
  layout: YardLayout;
  actors: Record<WorldActorKey, ActorState>;
  dogMode: DogMode;
  /** True while a lesson observation holds the picture (no moments, no following). */
  hold: boolean;
  moment: Moment | null;
  /** World time before which no new moment starts. */
  momentCooldownUntil: number;
  exercise: ExerciseLive | null;
  distraction: DistractionLevel;
  /** Other dog + Alex are in the yard (always in v1; may leave later). */
  othersPresent: boolean;
  /** Deterministic RNG state (mulberry32). */
  rng: number;
  /**
   * Implementation-private bookkeeping (follow anchor, response scripts, moment phase, previous snapshot for events).
   * Cloned on every step so the API stays pure and deterministic; consumers must not read it. See src/world/internal.ts.
   */
  internal?: unknown;
}

/** Inputs from the UI / input layer, applied before a step. */
export type WorldInput =
  | { type: 'moveTo'; target: YardPoint }
  | { type: 'moveDir'; dx: number; dz: number } // WASD / arrows, unit vector per step while held
  | { type: 'stop' }
  /** Fallback without the 3D yard: put the handler at a spot that yields the chosen band to the dog. */
  | { type: 'setBand'; band: DistanceBand }
  | { type: 'setDistraction'; level: DistractionLevel }
  | { type: 'beginExercise'; spec: ExerciseSpec; roundId: string | null }
  | { type: 'endExercise' }
  /** The store committed an attempt: the dog performs this response (world shows it, then emits 'responseShown'). */
  | { type: 'showResponse'; response: ExerciseResponse }
  | { type: 'respondMoment'; momentId: string; response: MomentResponse }
  | { type: 'holdDog'; pose: 'sit' | 'lie_down' | 'rest_loop' | 'eat' | null }
  | { type: 'setHold'; hold: boolean }
  | { type: 'teleport'; actor: WorldActorKey; position: YardPoint };

export type WorldEvent =
  | { type: 'arrived'; actor: WorldActorKey; position: YardPoint }
  | { type: 'zoneChanged'; actor: WorldActorKey; zone: ZoneId | null }
  | { type: 'promptChanged'; prompt: ZoneId | null }
  | { type: 'attentionChanged'; from: DogAttention; to: DogAttention }
  | { type: 'momentStarted'; moment: Moment }
  | { type: 'momentEnded'; moment: Moment }
  | { type: 'exerciseReadyChanged'; ready: boolean }
  /** look_at: the dog offered a glance; the UI enables the attempt button ("Belohnen"). No time pressure: the pose holds. */
  | { type: 'glanceOffered' }
  | { type: 'responseShown'; response: ExerciseResponse };

export interface StepResult {
  world: WorldState;
  context: WorldContext;
  events: WorldEvent[];
}

/** Needs the world reads from the Save to derive attention (never written). */
export type WorldNeeds = Pick<NeedValues, 'energy' | 'stress' | 'arousal' | 'comfort'>;

export interface WorldApi {
  /** Deterministic from seed; everyone at spawn. */
  create(seed: number, layout?: YardLayout): WorldState;
  /** Applies inputs, advances dt seconds (≤ 0.1 s per call; callers split larger gaps), returns the new state. */
  step(world: WorldState, dt: number, inputs: WorldInput[], needs: WorldNeeds): StepResult;
  /** Derived values without advancing time. */
  context(world: WorldState, needs: WorldNeeds): WorldContext;
  /** Context in the shape the reducer records (ExerciseContext). */
  exerciseContext(world: WorldState, needs: WorldNeeds): ExerciseContext;
  /** Projection for the renderer; `dogName`/`growthStage` and the like come from the Save via the caller. */
  directive(world: WorldState, needs: WorldNeeds): WorldDirective;
  /** Yard point that puts the handler at the given band from the dog (fallback UI). */
  pointForBand(world: WorldState, band: DistanceBand): YardPoint;
}

/** Exercise kinds whose attempt is enabled by a world condition rather than a button alone. */
export const EXERCISE_KINDS: readonly ExerciseKind[] = ['recall', 'find_spot', 'look_at'];
