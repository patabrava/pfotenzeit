/**
 * Content contract: typed German game data. No logic, no DOM, no Three.
 * Lesson texts come from docs/pfotenzeit/03_LERNPLAN_QUELLEN.md and are provisional until the book review.
 */
import type {
  CareKind,
  DistractionLevel,
  DogCharacterId,
  EnvironmentId,
  ExerciseKind,
  ExerciseResponse,
  MomentKind,
  MomentResponse,
  GestureId,
  HumanCharacterId,
  LearningPointId,
  LessonContext,
  LessonId,
  PoseId,
  PropId,
  UpgradeId,
  StagePosition,
} from '../simulation/types';

export type SourceId = 'B1' | 'B2' | 'D1' | 'D2' | 'D3';
export type SourceStatus = 'provisional' | 'book_review_open' | 'reviewed';

export interface LessonOption {
  id: string;
  /** Button label, short, German. */
  label: string;
  helpful: boolean;
  /** Whether a helpful, unsupported pick counts toward the lesson's learning criterion. */
  countsForLearning: boolean;
  poseAfter: PoseId;
  dogPositionAfter?: StagePosition;
  humanPositionAfter?: StagePosition;
  hidePropsAfter?: PropId[];
  /** Human gesture shown with the reaction, if any. */
  humanGesture?: GestureId;
  /** Feedback sentence naming the behaviour and the connection (never a bare "falsch"). */
  feedback: string;
  /** Mira's short line, optional. */
  miraLine?: string;
  /** Optional "Im Alltag" sentence for this option. */
  everyday?: string;
  /** 'retry' (exercise rounds only): back to observe for another attempt; behaves as 'advance' at the attempt limit. */
  next: 'advance' | 'supportedRetry' | 'careClosure' | 'retry';
  /** Exercise rounds (D-041): the option is offered only after one of these responses. Absent = always offered. */
  forResponses?: ExerciseResponse[];
  /** Scenario context after the reaction (training staging only). */
  contextAfter?: Partial<LessonContext>;
  /** Real care effect applied through the shared care contract (e.g. L03 A "Ruheplatz anbieten"). */
  careEffect?: CareKind;
}

export interface ObservationVariant {
  observationPose?: PoseId;
  dogPosition?: StagePosition;
  environment?: EnvironmentId;
  props?: PropId[];
  id: string;
  observationText: string;
  /** Textual body-language description for "Beobachtung beschreiben". */
  observationDescription: string;
}

export interface LessonRound {
  id: string;
  /** Distinct per round within a lesson; the learning criterion needs two distinct ids. */
  scenarioId: string;
  dogId: DogCharacterId;
  humanId: HumanCharacterId | null;
  title: string;
  /** Default observation, used when no seeded variant is chosen. */
  observationText: string;
  observationDescription: string;
  /** Seed-selected cosmetic variants (same meaning, different wording/details). */
  variants?: ObservationVariant[];
  observationPose: PoseId;
  dogPosition?: StagePosition;
  humanGesture: GestureId;
  environment: EnvironmentId;
  props: PropId[];
  /** Scenario context when the round starts (arousal/stress staging, energy display). */
  contextBefore: Partial<LessonContext>;
  /** Hint shown during a supported replay. */
  supportHint: string;
  options: LessonOption[];
  /** D-041: when present the round is playable; observe shows `exercise.instruction` and waits for EXERCISE_ATTEMPT. */
  exercise?: ExerciseSpec;
}

/** Playable exercise inside a lesson round or in free practice (D-041). All text German. */
export interface ExerciseSpec {
  kind: ExerciseKind;
  distraction: DistractionLevel;
  /** recall: handler must be at least this far from the dog (metres) before "Rufen" is enabled. */
  minDistanceM?: number;
  /** Mira's instruction shown in observe. */
  instruction: string;
  /** Label of the attempt button ("Rufen", "Hier bleiben", "Warten"). */
  readyLabel: string;
  /** Shown while the requirement is not met ("Geh noch ein Stück weiter weg."). */
  notReadyHint: string;
  /** One calm sentence per response, shown with the dog's reaction. */
  responseText: Partial<Record<ExerciseResponse, string>>;
  /** Fallback without the 3D yard (WebGL failed / reduced motion opt-in): distance choice labels. */
  fallbackBands: { near: string; mid: string; far: string };
}

export interface PracticeExercise {
  kind: ExerciseKind;
  title: string;
  /** Which lesson must be completed before this exercise is offered. */
  requiresLesson: LessonId;
  spec: ExerciseSpec;
  /** Mira's hint after two attempts without the target response. */
  hint: string;
  /** Response(s) that count as "geklappt" in practice. */
  successResponses: ExerciseResponse[];
}

export interface MomentText {
  /** What the dog does, calm German present tense (several signals, no verdict). */
  observation: string;
  /** Labels for the offered responses. */
  responses: Partial<Record<MomentResponse, string>>;
  /** One sentence shown after each response. */
  outcome: Partial<Record<MomentResponse, string>>;
}

export interface LessonDefinition {
  id: LessonId;
  title: string;
  subtitle: string;
  learningPointId: LearningPointId;
  learningPointLabel: string;
  sourceIds: SourceId[];
  sourceStatus: SourceStatus;
  /** Mira's one-sentence intro at prepare. */
  intro: string;
  /** Reflection: transfer sentence. */
  transferText: string;
  /** Reflection: "Im Alltag" collapsible text. */
  everydayText: string;
  /** Shown when the learning point is not yet learned after the visit. */
  practiceText: string;
  rounds: LessonRound[];
}

export interface DogCharacter {
  id: DogCharacterId;
  name: string;
  role: 'own' | 'guest';
  description: string;
  temperament: {
    curiosity: number;
    movementReactivity: number;
    caution: number;
  };
  /** Hex colours for placeholders and pixel palette. */
  colors: {
    body: string;
    chest: string;
    muzzle: string;
    ear: string;
    harness: string;
    marking: string;
    nose: string;
    eye: string;
  };
  shoulderHeightM: { arriving: number; growing: number };
}

export interface HumanCharacter {
  id: HumanCharacterId;
  name: string;
  role: string;
  heightM: number;
  colors: { skin: string; hair: string; top: string; bottom: string; shoes: string };
}

export interface UpgradeDefinition {
  id: UpgradeId;
  label: string;
  cost: number;
  description: string;
  preview: string;
  /** Environment unlocked for scenario variants. */
  environment: EnvironmentId;
}

export interface MemoryText {
  title: string;
  text: string;
}

export interface ContentCatalog {
  lessons: Record<LessonId, LessonDefinition>;
  dogs: Record<DogCharacterId, DogCharacter>;
  humans: Record<HumanCharacterId, HumanCharacter>;
  upgrades: Record<UpgradeId, UpgradeDefinition>;
  /** Memory text per lesson and closure. */
  memories: Record<LessonId, { completed: MemoryText; careClosure: MemoryText }>;
  learningPoints: Record<LearningPointId, { label: string; summary: string; everyday: string }>;
  /** D-041 free practice: one entry per exercise kind. */
  practice: Record<ExerciseKind, PracticeExercise>;
  /** D-041 dog-initiated moments. */
  moments: Record<MomentKind, MomentText>;
}
