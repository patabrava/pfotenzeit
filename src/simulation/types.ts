/**
 * Pfotenzeit – domain contract.
 *
 * This file is the single source of truth for every persisted or simulated shape.
 * Rules: no DOM, no Three.js, no imports from ui/render/storage. Pure data types only.
 * Design references: docs/pfotenzeit/02, 04, 09, 15. Deviations are listed in docs/DECISIONS.md.
 */

// ---------------------------------------------------------------------------
// Identifiers and enums
// ---------------------------------------------------------------------------

export type Mode = 'standard' | 'challenge';
export type GrowthStage = 'arriving' | 'growing' | 'adult';
export type DogStatus = 'alive' | 'lost';
export type LessonId = 'L01' | 'L02' | 'L03';
export type LearningPointId = 'criterion_context' | 'criterion_orientation' | 'criterion_support';
export type UpgradeId = 'rest_place' | 'sniff_corner';
/** meal: satiety +35. rest: energy +30, stress −20. play: comfort +20 (calm play). calm: "Abstand geben" when stressed, stress −20, comfort +10. */
export type CareKind = 'meal' | 'rest' | 'play' | 'calm';
/** 'exercise' = the dog's response to a playable exercise attempt is being presented (D-041); ACK leads to 'decide'. */
export type LessonPhase = 'prepare' | 'observe' | 'exercise' | 'decide' | 'react' | 'feedback' | 'reflect' | 'completed';

// ---------------------------------------------------------------------------
// Yard life (D-041): playable exercises, distance, dog initiative
// ---------------------------------------------------------------------------

/** recall: move away, call, observe. find_spot: move until the dog relaxes. look_at: stand still until the dog offers a glance. */
export type ExerciseKind = 'recall' | 'find_spot' | 'look_at';
/** What is competing for the dog's attention during an exercise; set by the lesson round or the practice choice. */
export type DistractionLevel = 'none' | 'toy' | 'other_dog';
/** Distance between the dog and the handler / the other dog, in bands (thresholds in defaults). */
export type DistanceBand = 'near' | 'mid' | 'far';
/** Deterministic outcome of an attempt (rules in simulation/exercise.ts). */
export type ExerciseResponse = 'comes' | 'hesitates' | 'distracted' | 'turns_away' | 'settled' | 'still_tense' | 'glance';
/** Derived attention state of the own dog in the yard; projected to poses by the renderer. */
export type DogAttention = 'relaxed' | 'focused' | 'distracted' | 'tense' | 'tired' | 'resting';
/** Moments the dog starts on its own between exercises (world model); the player may respond. */
export type MomentKind = 'sniff_spot' | 'look_at_other_dog' | 'settle_beside' | 'offer_glance';
export type MomentResponse = 'allow' | 'call_gently' | 'sit_with' | 'reward_glance' | 'ignore';

/** Yard context at the moment of an attempt. Produced by the world model, recorded with the attempt. */
export interface ExerciseContext {
  handlerBand: DistanceBand;
  otherDogBand: DistanceBand;
  distraction: DistractionLevel;
  /** Dog ↔ distraction spot (toy or the other dog); 'far' when distraction is 'none'. */
  distractionBand: DistanceBand;
  /** Zone the dog stands in (world ZoneId as string; null in the open yard). */
  dogZone: string | null;
  handlerMoving: boolean;
}

export interface ExerciseAttempt {
  roundId: string;
  attemptId: string;
  kind: ExerciseKind;
  response: ExerciseResponse;
  context: ExerciseContext;
}
export type VisitClosure = 'completed' | 'careClosure';
export type DogCharacterId = 'dog_nala' | 'dog_bruno';
export type HumanCharacterId = 'human_mira' | 'human_alex';
export type CharacterId = DogCharacterId | HumanCharacterId;

/** Dog clip contract from 08_3D_ASSET_HANDOFF. Also used as pose ids by the procedural placeholders. */
export type PoseId =
  | 'idle_relaxed'
  | 'look_at_handler'
  | 'sniff'
  | 'walk'
  | 'sit'
  | 'lie_down'
  | 'rest_loop'
  | 'eat'
  | 'play_bow'
  | 'turn_away'
  | 'tense_idle'
  | 'tired_idle'
  | 'recover'
  | 'alert_focus'
  | 'rest_side'
  | 'stand_up';

export const POSE_IDS: readonly PoseId[] = [
  'idle_relaxed',
  'look_at_handler',
  'sniff',
  'walk',
  'sit',
  'lie_down',
  'rest_loop',
  'eat',
  'play_bow',
  'turn_away',
  'tense_idle',
  'tired_idle',
  'recover',
  'alert_focus',
  'rest_side',
  'stand_up',
];

/** Human clip contract from 08. */
export type GestureId = 'idle' | 'greet' | 'gesture_explain' | 'offer_reward' | 'kneel';

export type PropId =
  | 'bowl'
  | 'water'
  | 'blanket'
  | 'ball'
  | 'toy_rolling'
  | 'leaf'
  | 'rest_place'
  | 'sniff_corner';

export type EnvironmentId = 'courtyard' | 'courtyard_loud' | 'rest_place' | 'sniff_corner';

export type QualityTier = 'auto' | 'low' | 'high';
export type ReducedMotionOverride = 'system' | 'on' | 'off';

/** Vitality bands from 04_PFLEGE_CHALLENGE. Standard mode is always 'stable'. */
export type VitalityBand = 'stable' | 'impaired' | 'critical' | 'lost';

/** Readiness as a qualitative state (02_SPIELSCHLEIFE). */
export type Readiness = 'ready' | 'needs_care';

/** Pixel profile state, priority lost → critical → tired → hungry → playful → awake (16_ASSET_PRODUCTION). */
export type PixelState = 'awake' | 'hungry' | 'tired' | 'playful' | 'resting' | 'exhausted' | 'memorial';

// ---------------------------------------------------------------------------
// Dog and care
// ---------------------------------------------------------------------------

export interface NeedValues {
  satiety: number;
  energy: number;
  comfort: number;
  arousal: number;
  stress: number;
  vitality: number;
}

export interface DogState extends NeedValues {
  instanceId: string;
  characterId: 'dog_nala';
  name: string;
  growthStage: GrowthStage;
  status: DogStatus;
  /** Stable ids `memory_<visitId>`; metadata lives in Save.memories. */
  bondMemories: string[];
  learnedPoints: LearningPointId[];
}

export interface BondMemory {
  id: string;
  visitId: string;
  lessonId: LessonId;
  dateUTC: number;
  closure: VisitClosure;
  helpfulDecisions: number;
}

// ---------------------------------------------------------------------------
// Lessons and visits
// ---------------------------------------------------------------------------

/** Training-only staging values. Never written back to DogState (15_DATEN_REGELN, 03 Effekte). */
export interface LessonContext {
  arousal: number;
  stress: number;
  /** Staged energy shown for the scenario (L03 round A), or null to show the real value. */
  energyShown: number | null;
  difficulty: 'easy' | 'normal';
}

export interface RoundRef {
  roundId: string;
  /** Supported replay: hint visible, decision is practice only. */
  supported: boolean;
  /** Inserted unsupported re-run ("bei Bedarf einschieben"), max one per visit. */
  inserted: boolean;
}

export interface VisitDecision {
  roundId: string;
  scenarioId: string;
  optionId: string;
  helpful: boolean;
  supported: boolean;
  countsForLearning: boolean;
}

export interface VisitState {
  id: string;
  lessonId: LessonId;
  seed: number;
  startedUTC: number;
  queue: RoundRef[];
  /** Index into queue. */
  index: number;
  phase: LessonPhase;
  decisions: VisitDecision[];
  /** Energy −4 applied exactly once per round id listed here (never per retry). */
  completedRoundIds: string[];
  context: LessonContext;
  /** Option chosen in the current round, kept through react/feedback for display. */
  lastOptionId: string | null;
  insertedRetryUsed: boolean;
  /** Playable exercise attempts (D-041); at most EXERCISE_MAX_ATTEMPTS per round id. Missing in old saves ⇒ []. */
  attempts: ExerciseAttempt[];
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export interface Settings {
  audioEnabled: boolean;
  reducedMotionOverride: ReducedMotionOverride;
  observationTextEnabled: boolean;
  qualityTier: QualityTier;
}

export interface SchoolState {
  marks: number;
  upgrades: UpgradeId[];
}

/** Effects already committed but not yet shown; cleared by ACKNOWLEDGE_EFFECT. */
export interface PendingPresentation {
  transactionId: string;
  effects: DomainEffect[];
}

export const SAVE_SCHEMA_VERSION = 1 as const;

export interface Save {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  saveId: string;
  mode: Mode;
  /** Incremented on every committed domain action; storage refuses older revisions. */
  revision: number;
  createdUTC: number;
  /** UTC anchor for offline accounting. Updated on every commit while active, on CLOSE_APP and APPLY_OFFLINE. */
  lastSeenUTC: number;
  dog: DogState;
  school: SchoolState;
  currentVisit: VisitState | null;
  rewardedVisitIds: string[];
  rewardedLearningIds: LearningPointId[];
  /** Bounded ring (newest last). */
  appliedTransactionIds: string[];
  completedLessonIds: LessonId[];
  helpfulVisitIds: string[];
  careClosureVisitIds: string[];
  /** Distinct scenario ids with unsupported helpful decisions per learning point. ≥2 ⇒ learned. */
  helpfulScenariosByLearningPoint: Record<LearningPointId, string[]>;
  /** visitId in which each learning point first became learned. */
  firstHelpfulByLearningPoint: Record<LearningPointId, string | null>;
  memories: BondMemory[];
  growthConfirmed: boolean;
  challengePaused: boolean;
  /** Active-time remainder below one full minute, in ms. */
  careActiveMsRemainder: number;
  pendingPresentation: PendingPresentation | null;
  settings: Settings;
  visitCount: number;
  lostAtUTC: number | null;
}

/** Archive of a lost or ended challenge run (04 Abschied). Immutable. */
export interface ChallengeArchive {
  saveId: string;
  dogInstanceId: string;
  dogName: string;
  createdUTC: number;
  endedUTC: number;
  reason: 'lost' | 'archived';
  milestones: string[];
  visitCount: number;
  completedLessonIds: LessonId[];
}

/** Storage-level record: which save is active per mode. */
export interface Meta {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  activeMode: Mode;
  saveIds: { standard: string; challenge: string | null };
  archives: ChallengeArchive[];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface Transactional {
  /** Unique per attempt. Replays return the stored result unchanged. */
  transactionId: string;
}

export type DomainAction =
  | ({ type: 'START_VISIT'; lessonId: LessonId; visitId: string; seed: number; nowUTC: number } & Transactional)
  | ({ type: 'SELECT_OPTION'; optionId: string; nowUTC: number } & Transactional)
  | ({ type: 'NEXT_ROUND'; nowUTC: number } & Transactional)
  | ({ type: 'COMPLETE_VISIT'; closure: VisitClosure; nowUTC: number } & Transactional)
  | ({ type: 'ABANDON_VISIT'; nowUTC: number } & Transactional)
  | ({ type: 'CARE'; kind: CareKind; nowUTC: number } & Transactional)
  | ({ type: 'BUY_UPGRADE'; upgradeId: UpgradeId; nowUTC: number } & Transactional)
  | ({ type: 'CONFIRM_GROWTH'; nowUTC: number } & Transactional)
  | ({ type: 'RENAME_DOG'; name: string; nowUTC: number } & Transactional)
  | ({ type: 'PAUSE_CHALLENGE'; nowUTC: number } & Transactional)
  | ({ type: 'RESUME_CHALLENGE'; nowUTC: number } & Transactional)
  | ({ type: 'CLOSE_APP'; nowUTC: number } & Transactional)
  | ({ type: 'APPLY_OFFLINE'; nowUTC: number } & Transactional)
  | ({ type: 'TICK_ACTIVE'; activeMs: number; nowUTC: number } & Transactional)
  | ({ type: 'ACKNOWLEDGE_EFFECT'; presentedTransactionId: string; nowUTC: number } & Transactional)
  | ({ type: 'UPDATE_SETTINGS'; patch: Partial<Settings>; nowUTC: number } & Transactional)
  /** D-041: the player triggered an exercise attempt (call / stay here); response is computed by simulation/exercise.ts from the context. */
  | ({ type: 'EXERCISE_ATTEMPT'; attemptId: string; context: ExerciseContext; nowUTC: number } & Transactional)
  /** D-041: the player responded to a dog-initiated moment; small bounded care-like effect (MOMENT_EFFECTS). */
  | ({ type: 'RESPOND_MOMENT'; kind: MomentKind; response: MomentResponse; nowUTC: number } & Transactional);

/** Handled by the store/storage layer, not by the reducer (they span saves). */
export type MetaAction =
  | { type: 'CREATE_SAVE'; mode: Mode; nowUTC: number }
  | { type: 'SELECT_MODE'; mode: Mode; nowUTC: number }
  | { type: 'ARCHIVE_CHALLENGE'; nowUTC: number };

export type Action = DomainAction | MetaAction;

// ---------------------------------------------------------------------------
// Reducer result and effects
// ---------------------------------------------------------------------------

export type RejectReason =
  | 'wrong_phase'
  | 'no_visit'
  | 'visit_in_progress'
  | 'unknown_lesson'
  | 'unknown_option'
  | 'unknown_upgrade'
  | 'insufficient_marks'
  | 'already_owned'
  | 'dog_lost'
  | 'training_locked'
  | 'needs_care'
  | 'growth_not_available'
  | 'challenge_only'
  | 'challenge_paused'
  | 'not_meaningful'
  | 'invalid_name'
  | 'exercise_not_ready'
  | 'attempt_limit'
  | 'invalid';

export type DomainEffect =
  | { type: 'care'; kind: CareKind; before: NeedValues; after: NeedValues; pose: PoseId }
  | {
      type: 'decision';
      roundId: string;
      optionId: string;
      helpful: boolean;
      supported: boolean;
      poseAfter: PoseId;
      dogId: DogCharacterId;
    }
  | {
      type: 'visitRewarded';
      visitId: string;
      lessonId: LessonId;
      closure: VisitClosure;
      visitMark: boolean;
      bond: boolean;
      newlyLearned: LearningPointId[];
      learningMarks: number;
    }
  | { type: 'upgradeBought'; upgradeId: UpgradeId; cost: number }
  | { type: 'growth'; from: GrowthStage; to: GrowthStage }
  | { type: 'offlineApplied'; creditedHours: number; losses: Partial<NeedValues> }
  | { type: 'band'; band: VitalityBand }
  | { type: 'lost' }
  /** D-041: dog response to an exercise attempt; presented by the world animation, then ACK → decide. */
  | { type: 'exercise'; roundId: string; attemptId: string; kind: ExerciseKind; response: ExerciseResponse; pose: PoseId; dogId: DogCharacterId }
  /** D-041: response to a dog-initiated moment; small care-like change. */
  | { type: 'moment'; kind: MomentKind; response: MomentResponse; before: NeedValues; after: NeedValues; pose: PoseId };

export interface ReduceResult {
  save: Save;
  outcome: 'applied' | 'duplicate' | 'rejected';
  reason?: RejectReason;
  effects: DomainEffect[];
}

// ---------------------------------------------------------------------------
// Scene directive (pure description consumed by the renderer)
// ---------------------------------------------------------------------------

/** 'yard' = free movement camera following handler and dog (D-041). */
export type CameraView = 'school' | 'lesson' | 'closeup' | 'yard';
export type StagePosition = 'center' | 'left' | 'right' | 'rest' | 'sniff' | 'edge' | 'behind' | 'retreat' | 'handler_retreat' | 'handler' | 'rest_exit' | 'rest_handler' | 'sniff_retreat';

export interface DogDirective {
  id: DogCharacterId;
  name: string;
  growthStage: GrowthStage;
  pose: PoseId;
  position: StagePosition;
  /** Facing in degrees around +Y; 0 faces the camera. */
  facing: number;
}

export interface HumanDirective {
  id: HumanCharacterId;
  gesture: GestureId;
  position: StagePosition;
  facing: number;
}

export interface SceneDirective {
  view: CameraView;
  environment: EnvironmentId;
  upgrades: UpgradeId[];
  dogs: DogDirective[];
  humans: HumanDirective[];
  props: PropId[];
  /** Dog the camera frames in 'lesson' / 'closeup'. */
  focusDogId: DogCharacterId | null;
  /** True while a round is held at an observation image (idle must not change the picture). */
  hold: boolean;
  /** D-041: present when view === 'yard'. Absolute placement overrides StagePosition for the listed actors. */
  world?: WorldDirective;
}

/** Yard plane position in metres (x right, z toward the default camera), origin at the yard centre. */
export interface YardPoint {
  x: number;
  z: number;
}

export type WorldActorKey = 'handler' | 'dog' | 'other_dog' | 'mira' | 'alex';

export interface WorldActorDirective {
  key: WorldActorKey;
  /** Character to draw; the handler is the player and is drawn as a subtle marker, not a human model. */
  characterId: CharacterId | 'handler';
  position: YardPoint;
  /** Degrees around +Y, 0 = facing +Z. */
  facing: number;
  /** Metres per second right now; > 0 drives the walk clip phase. */
  speed: number;
  pose: PoseId | GestureId;
}

export interface WorldPromptDirective {
  /** Zone id (world ZoneId as string) the handler can act in right now; the renderer shows a subtle ring. */
  zoneId: string;
  position: YardPoint;
  radius: number;
}

export interface WorldDirective {
  actors: WorldActorDirective[];
  /** Point the camera keeps in frame with the dog (usually the handler). */
  focus: YardPoint;
  /** Active prompt zone, or null. */
  prompt: WorldPromptDirective | null;
  /** Spot of the current dog-initiated moment, or null. */
  momentSpot: YardPoint | null;
  /** Distraction object to show (toy in the circle, Bruno at the fence). */
  distraction: DistractionLevel;
  attention: DogAttention;
}

// ---------------------------------------------------------------------------
// Injected providers (tests run without real time)
// ---------------------------------------------------------------------------

export interface Providers {
  /** Wall clock, ms since epoch (UTC). Only for offline accounting and timestamps. */
  nowUTC(): number;
  /** Monotonic ms (performance.now). Only for active-time accumulation. */
  monotonic(): number;
  /** Unique id generator. */
  id(prefix?: string): string;
  /** Seed generator for visits. */
  seed(): number;
}
