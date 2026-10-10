/**
 * Save factory and strict validation. WP-A completes validateSave/validateMeta; createNewSave is final.
 */
import { DEFAULT_SETTINGS, LEARNING_POINT_IDS, START_NEEDS } from './defaults';
import {
  POSE_IDS,
  SAVE_SCHEMA_VERSION,
  type BondMemory,
  type CareKind,
  type ChallengeArchive,
  type DogCharacterId,
  type DogState,
  type DogStatus,
  type DomainEffect,
  type GrowthStage,
  type LearningPointId,
  type LessonContext,
  type LessonId,
  type LessonPhase,
  type Meta,
  type Mode,
  type NeedValues,
  type PendingPresentation,
  type Providers,
  type QualityTier,
  type ReducedMotionOverride,
  type RoundRef,
  type Save,
  type Settings,
  type UpgradeId,
  type VisitClosure,
  type VisitDecision,
  type VisitState,
  type VitalityBand,
  type DistanceBand,
  type DistractionLevel,
  type ExerciseAttempt,
  type ExerciseKind,
  type ExerciseResponse,
} from './types';

export function createNewSave(mode: Mode, providers: Providers, nowUTC: number): Save {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    saveId: providers.id(`save_${mode}`),
    mode,
    revision: 0,
    createdUTC: nowUTC,
    lastSeenUTC: nowUTC,
    dog: {
      instanceId: providers.id('dog'),
      characterId: 'dog_nala',
      name: 'Nala',
      growthStage: 'arriving',
      status: 'alive',
      bondMemories: [],
      learnedPoints: [],
      ...START_NEEDS,
    },
    school: { marks: 0, upgrades: [] },
    currentVisit: null,
    rewardedVisitIds: [],
    rewardedLearningIds: [],
    appliedTransactionIds: [],
    completedLessonIds: [],
    helpfulVisitIds: [],
    careClosureVisitIds: [],
    helpfulScenariosByLearningPoint: {
      criterion_context: [],
      criterion_orientation: [],
      criterion_support: [],
    },
    firstHelpfulByLearningPoint: {
      criterion_context: null,
      criterion_orientation: null,
      criterion_support: null,
    },
    memories: [],
    growthConfirmed: false,
    challengePaused: false,
    careActiveMsRemainder: 0,
    pendingPresentation: null,
    settings: { ...DEFAULT_SETTINGS },
    visitCount: 0,
    lostAtUTC: null,
  };
}

export function createNewMeta(standardSaveId: string): Meta {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    activeMode: 'standard',
    saveIds: { standard: standardSaveId, challenge: null },
    archives: [],
  };
}

export interface ValidationResult<T> {
  ok: boolean;
  value: T | null;
  errors: string[];
}

/**
 * Strict structural validation of untrusted data (import, IndexedDB read).
 * Checks every number range (0–100 for needs), enum values, array element types and id formats.
 * WP-A: implement fully; must never throw, must reject unknown schemaVersion.
 */
export function validateSave(input: unknown): ValidationResult<Save> {
  const errors: string[] = [];
  try {
    const value = readSave(input, errors);
    return errors.length === 0 && value ? { ok: true, value, errors: [] } : { ok: false, value: null, errors };
  } catch (error) {
    errors.push(`unexpected: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, value: null, errors };
  }
}

export function validateMeta(input: unknown): ValidationResult<Meta> {
  const errors: string[] = [];
  try {
    const value = readMeta(input, errors);
    return errors.length === 0 && value ? { ok: true, value, errors: [] } : { ok: false, value: null, errors };
  } catch (error) {
    errors.push(`unexpected: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, value: null, errors };
  }
}

// ---------------------------------------------------------------------------
// Validation helpers (no throwing on bad input; every problem lands in `errors`)
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

const MODES: readonly Mode[] = ['standard', 'challenge'];
const GROWTH_STAGES: readonly GrowthStage[] = ['arriving', 'growing', 'adult'];
const DOG_STATUSES: readonly DogStatus[] = ['alive', 'lost'];
const LESSON_IDS: readonly LessonId[] = ['L01', 'L02', 'L03'];
const UPGRADE_IDS: readonly UpgradeId[] = ['rest_place', 'sniff_corner'];
const CARE_KINDS: readonly CareKind[] = ['meal', 'rest', 'play', 'calm'];
const PHASES: readonly LessonPhase[] = ['prepare', 'observe', 'exercise', 'decide', 'react', 'feedback', 'reflect', 'completed'];
const EXERCISE_KINDS: readonly ExerciseKind[] = ['recall', 'find_spot', 'look_at'];
const EXERCISE_RESPONSES: readonly ExerciseResponse[] = ['comes', 'hesitates', 'distracted', 'turns_away', 'settled', 'still_tense', 'glance'];
const BANDS: readonly DistanceBand[] = ['near', 'mid', 'far'];
const DISTRACTIONS: readonly DistractionLevel[] = ['none', 'toy', 'other_dog'];
const CLOSURES: readonly VisitClosure[] = ['completed', 'careClosure'];
const DIFFICULTIES: readonly LessonContext['difficulty'][] = ['easy', 'normal'];
const REDUCED_MOTION: readonly ReducedMotionOverride[] = ['system', 'on', 'off'];
const QUALITY_TIERS: readonly QualityTier[] = ['auto', 'low', 'high'];
const VITALITY_BANDS_LIST: readonly VitalityBand[] = ['stable', 'impaired', 'critical', 'lost'];
const DOG_CHARACTER_IDS: readonly DogCharacterId[] = ['dog_nala', 'dog_bruno'];
const ARCHIVE_REASONS: readonly ChallengeArchive['reason'][] = ['lost', 'archived'];
const EFFECT_TYPES: readonly DomainEffect['type'][] = [
  'care',
  'decision',
  'visitRewarded',
  'upgradeBought',
  'growth',
  'offlineApplied',
  'band',
  'lost',
];

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readObject(value: unknown, path: string, errors: string[]): Rec | null {
  if (isRecord(value)) return value;
  errors.push(`${path}: expected object`);
  return null;
}

function readString(value: unknown, path: string, errors: string[], nonEmpty = true): string {
  if (typeof value === 'string' && (!nonEmpty || value.length > 0)) return value;
  errors.push(`${path}: expected ${nonEmpty ? 'non-empty ' : ''}string`);
  return '';
}

function readNullableString(value: unknown, path: string, errors: string[]): string | null {
  if (value === null) return null;
  return readString(value, path, errors);
}

function readBoolean(value: unknown, path: string, errors: string[]): boolean {
  if (typeof value === 'boolean') return value;
  errors.push(`${path}: expected boolean`);
  return false;
}

function readNumber(value: unknown, path: string, errors: string[], min = -Infinity, max = Infinity): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) return value;
  errors.push(`${path}: expected number in [${min}, ${max}]`);
  return 0;
}

function readInteger(value: unknown, path: string, errors: string[], min = 0): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= min) return value;
  errors.push(`${path}: expected integer ≥ ${min}`);
  return min;
}

function readNullableNumber(value: unknown, path: string, errors: string[], min = -Infinity, max = Infinity): number | null {
  if (value === null) return null;
  return readNumber(value, path, errors, min, max);
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], path: string, errors: string[]): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  errors.push(`${path}: expected one of ${allowed.join('|')}`);
  return allowed[0] as T;
}

function readArray<T>(value: unknown, path: string, errors: string[], item: (entry: unknown, itemPath: string) => T): T[] {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected array`);
    return [];
  }
  return value.map((entry, index) => item(entry, `${path}[${index}]`));
}

function readStringArray(value: unknown, path: string, errors: string[]): string[] {
  return readArray(value, path, errors, (entry, itemPath) => readString(entry, itemPath, errors));
}

function readEnumArray<T extends string>(value: unknown, allowed: readonly T[], path: string, errors: string[]): T[] {
  return readArray(value, path, errors, (entry, itemPath) => readEnum(entry, allowed, itemPath, errors));
}

function readNeeds(source: Rec, path: string, errors: string[]): NeedValues {
  return {
    satiety: readNumber(source.satiety, `${path}.satiety`, errors, 0, 100),
    energy: readNumber(source.energy, `${path}.energy`, errors, 0, 100),
    comfort: readNumber(source.comfort, `${path}.comfort`, errors, 0, 100),
    arousal: readNumber(source.arousal, `${path}.arousal`, errors, 0, 100),
    stress: readNumber(source.stress, `${path}.stress`, errors, 0, 100),
    vitality: readNumber(source.vitality, `${path}.vitality`, errors, 0, 100),
  };
}

function readPartialNeeds(value: unknown, path: string, errors: string[]): Partial<NeedValues> {
  const source = readObject(value, path, errors);
  const result: Partial<NeedValues> = {};
  if (!source) return result;
  for (const key of ['satiety', 'energy', 'comfort', 'arousal', 'stress', 'vitality'] as const) {
    if (source[key] !== undefined) result[key] = readNumber(source[key], `${path}.${key}`, errors);
  }
  return result;
}

function readDog(value: unknown, path: string, errors: string[]): DogState | null {
  const source = readObject(value, path, errors);
  if (!source) return null;
  return {
    ...readNeeds(source, path, errors),
    instanceId: readString(source.instanceId, `${path}.instanceId`, errors),
    characterId: readEnum(source.characterId, ['dog_nala'] as const, `${path}.characterId`, errors),
    name: readString(source.name, `${path}.name`, errors),
    growthStage: readEnum(source.growthStage, GROWTH_STAGES, `${path}.growthStage`, errors),
    status: readEnum(source.status, DOG_STATUSES, `${path}.status`, errors),
    bondMemories: readStringArray(source.bondMemories, `${path}.bondMemories`, errors),
    learnedPoints: readEnumArray(source.learnedPoints, LEARNING_POINT_IDS, `${path}.learnedPoints`, errors),
  };
}

function readContext(value: unknown, path: string, errors: string[]): LessonContext {
  const source = readObject(value, path, errors) ?? {};
  return {
    arousal: readNumber(source.arousal, `${path}.arousal`, errors, 0, 100),
    stress: readNumber(source.stress, `${path}.stress`, errors, 0, 100),
    energyShown: readNullableNumber(source.energyShown, `${path}.energyShown`, errors, 0, 100),
    difficulty: readEnum(source.difficulty, DIFFICULTIES, `${path}.difficulty`, errors),
  };
}

function readRoundRef(value: unknown, path: string, errors: string[]): RoundRef {
  const source = readObject(value, path, errors) ?? {};
  return {
    roundId: readString(source.roundId, `${path}.roundId`, errors),
    supported: readBoolean(source.supported, `${path}.supported`, errors),
    inserted: readBoolean(source.inserted, `${path}.inserted`, errors),
  };
}

function readDecision(value: unknown, path: string, errors: string[]): VisitDecision {
  const source = readObject(value, path, errors) ?? {};
  return {
    roundId: readString(source.roundId, `${path}.roundId`, errors),
    scenarioId: readString(source.scenarioId, `${path}.scenarioId`, errors),
    optionId: readString(source.optionId, `${path}.optionId`, errors),
    helpful: readBoolean(source.helpful, `${path}.helpful`, errors),
    supported: readBoolean(source.supported, `${path}.supported`, errors),
    countsForLearning: readBoolean(source.countsForLearning, `${path}.countsForLearning`, errors),
  };
}

function readVisit(value: unknown, path: string, errors: string[]): VisitState | null {
  if (value === null) return null;
  const source = readObject(value, path, errors);
  if (!source) return null;
  const queue = readArray(source.queue, `${path}.queue`, errors, (entry, itemPath) => readRoundRef(entry, itemPath, errors));
  const index = readInteger(source.index, `${path}.index`, errors, 0);
  if (index > queue.length) errors.push(`${path}.index: beyond queue length`);
  return {
    id: readString(source.id, `${path}.id`, errors),
    lessonId: readEnum(source.lessonId, LESSON_IDS, `${path}.lessonId`, errors),
    seed: readNumber(source.seed, `${path}.seed`, errors),
    startedUTC: readNumber(source.startedUTC, `${path}.startedUTC`, errors),
    queue,
    index,
    phase: readEnum(source.phase, PHASES, `${path}.phase`, errors),
    decisions: readArray(source.decisions, `${path}.decisions`, errors, (entry, itemPath) => readDecision(entry, itemPath, errors)),
    completedRoundIds: readStringArray(source.completedRoundIds, `${path}.completedRoundIds`, errors),
    context: readContext(source.context, `${path}.context`, errors),
    lastOptionId: readNullableString(source.lastOptionId, `${path}.lastOptionId`, errors),
    insertedRetryUsed: readBoolean(source.insertedRetryUsed, `${path}.insertedRetryUsed`, errors),
    // D-041: saves written before yard life have no attempts; default to none (schema version unchanged).
    attempts: source.attempts === undefined
      ? []
      : readArray(source.attempts, `${path}.attempts`, errors, (entry, itemPath) => readAttempt(entry, itemPath, errors)),
  };
}

function readAttempt(value: unknown, path: string, errors: string[]): ExerciseAttempt {
  const source = readObject(value, path, errors) ?? {};
  const context = readObject(source.context, `${path}.context`, errors) ?? {};
  return {
    roundId: readString(source.roundId, `${path}.roundId`, errors),
    attemptId: readString(source.attemptId, `${path}.attemptId`, errors),
    kind: readEnum(source.kind, EXERCISE_KINDS, `${path}.kind`, errors),
    response: readEnum(source.response, EXERCISE_RESPONSES, `${path}.response`, errors),
    context: {
      handlerBand: readEnum(context.handlerBand, BANDS, `${path}.context.handlerBand`, errors),
      otherDogBand: readEnum(context.otherDogBand, BANDS, `${path}.context.otherDogBand`, errors),
      distractionBand: readEnum(context.distractionBand, BANDS, `${path}.context.distractionBand`, errors),
      distraction: readEnum(context.distraction, DISTRACTIONS, `${path}.context.distraction`, errors),
      dogZone: readNullableString(context.dogZone, `${path}.context.dogZone`, errors),
      handlerMoving: readBoolean(context.handlerMoving, `${path}.context.handlerMoving`, errors),
    },
  };
}

function readMemory(value: unknown, path: string, errors: string[]): BondMemory {
  const source = readObject(value, path, errors) ?? {};
  return {
    id: readString(source.id, `${path}.id`, errors),
    visitId: readString(source.visitId, `${path}.visitId`, errors),
    lessonId: readEnum(source.lessonId, LESSON_IDS, `${path}.lessonId`, errors),
    dateUTC: readNumber(source.dateUTC, `${path}.dateUTC`, errors),
    closure: readEnum(source.closure, CLOSURES, `${path}.closure`, errors),
    helpfulDecisions: readInteger(source.helpfulDecisions, `${path}.helpfulDecisions`, errors, 0),
  };
}

function readByLearningPoint<T>(value: unknown, path: string, errors: string[], item: (entry: unknown, itemPath: string) => T): Record<LearningPointId, T> {
  const source = readObject(value, path, errors) ?? {};
  const result = {} as Record<LearningPointId, T>;
  for (const point of LEARNING_POINT_IDS) {
    result[point] = item(source[point], `${path}.${point}`);
  }
  return result;
}

function readSettings(value: unknown, path: string, errors: string[]): Settings {
  const source = readObject(value, path, errors) ?? {};
  return {
    audioEnabled: readBoolean(source.audioEnabled, `${path}.audioEnabled`, errors),
    reducedMotionOverride: readEnum(source.reducedMotionOverride, REDUCED_MOTION, `${path}.reducedMotionOverride`, errors),
    observationTextEnabled: readBoolean(source.observationTextEnabled, `${path}.observationTextEnabled`, errors),
    qualityTier: readEnum(source.qualityTier, QUALITY_TIERS, `${path}.qualityTier`, errors),
  };
}

function readEffect(value: unknown, path: string, errors: string[]): DomainEffect {
  const source = readObject(value, path, errors) ?? {};
  const type = readEnum(source.type, EFFECT_TYPES, `${path}.type`, errors);
  switch (type) {
    case 'care': {
      const before = readObject(source.before, `${path}.before`, errors) ?? {};
      const after = readObject(source.after, `${path}.after`, errors) ?? {};
      return {
        type,
        kind: readEnum(source.kind, CARE_KINDS, `${path}.kind`, errors),
        before: readNeeds(before, `${path}.before`, errors),
        after: readNeeds(after, `${path}.after`, errors),
        pose: readEnum(source.pose, POSE_IDS, `${path}.pose`, errors),
      };
    }
    case 'decision':
      return {
        type,
        roundId: readString(source.roundId, `${path}.roundId`, errors),
        optionId: readString(source.optionId, `${path}.optionId`, errors),
        helpful: readBoolean(source.helpful, `${path}.helpful`, errors),
        supported: readBoolean(source.supported, `${path}.supported`, errors),
        poseAfter: readEnum(source.poseAfter, POSE_IDS, `${path}.poseAfter`, errors),
        dogId: readEnum(source.dogId, DOG_CHARACTER_IDS, `${path}.dogId`, errors),
      };
    case 'visitRewarded':
      return {
        type,
        visitId: readString(source.visitId, `${path}.visitId`, errors),
        lessonId: readEnum(source.lessonId, LESSON_IDS, `${path}.lessonId`, errors),
        closure: readEnum(source.closure, CLOSURES, `${path}.closure`, errors),
        visitMark: readBoolean(source.visitMark, `${path}.visitMark`, errors),
        bond: readBoolean(source.bond, `${path}.bond`, errors),
        newlyLearned: readEnumArray(source.newlyLearned, LEARNING_POINT_IDS, `${path}.newlyLearned`, errors),
        learningMarks: readInteger(source.learningMarks, `${path}.learningMarks`, errors, 0),
      };
    case 'upgradeBought':
      return {
        type,
        upgradeId: readEnum(source.upgradeId, UPGRADE_IDS, `${path}.upgradeId`, errors),
        cost: readInteger(source.cost, `${path}.cost`, errors, 0),
      };
    case 'growth':
      return {
        type,
        from: readEnum(source.from, GROWTH_STAGES, `${path}.from`, errors),
        to: readEnum(source.to, GROWTH_STAGES, `${path}.to`, errors),
      };
    case 'offlineApplied':
      return {
        type,
        creditedHours: readNumber(source.creditedHours, `${path}.creditedHours`, errors, 0),
        losses: readPartialNeeds(source.losses, `${path}.losses`, errors),
      };
    case 'band':
      return { type, band: readEnum(source.band, VITALITY_BANDS_LIST, `${path}.band`, errors) };
    case 'lost':
      return { type };
    default:
      return { type: 'lost' };
  }
}

function readPendingPresentation(value: unknown, path: string, errors: string[]): PendingPresentation | null {
  if (value === null) return null;
  const source = readObject(value, path, errors);
  if (!source) return null;
  return {
    transactionId: readString(source.transactionId, `${path}.transactionId`, errors),
    effects: readArray(source.effects, `${path}.effects`, errors, (entry, itemPath) => readEffect(entry, itemPath, errors)),
  };
}

function readSave(input: unknown, errors: string[]): Save | null {
  const source = readObject(input, 'save', errors);
  if (!source) return null;
  if (source.schemaVersion !== SAVE_SCHEMA_VERSION) {
    errors.push(`save.schemaVersion: expected ${SAVE_SCHEMA_VERSION}`);
    return null;
  }
  const dog = readDog(source.dog, 'save.dog', errors);
  const school = readObject(source.school, 'save.school', errors) ?? {};
  const save: Save = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    saveId: readString(source.saveId, 'save.saveId', errors),
    mode: readEnum(source.mode, MODES, 'save.mode', errors),
    revision: readInteger(source.revision, 'save.revision', errors, 0),
    createdUTC: readNumber(source.createdUTC, 'save.createdUTC', errors),
    lastSeenUTC: readNumber(source.lastSeenUTC, 'save.lastSeenUTC', errors),
    dog: dog ?? createNewSave('standard', FALLBACK_PROVIDERS, 0).dog,
    school: {
      marks: readInteger(school.marks, 'save.school.marks', errors, 0),
      upgrades: readEnumArray(school.upgrades, UPGRADE_IDS, 'save.school.upgrades', errors),
    },
    currentVisit: readVisit(source.currentVisit, 'save.currentVisit', errors),
    rewardedVisitIds: readStringArray(source.rewardedVisitIds, 'save.rewardedVisitIds', errors),
    rewardedLearningIds: readEnumArray(source.rewardedLearningIds, LEARNING_POINT_IDS, 'save.rewardedLearningIds', errors),
    appliedTransactionIds: readStringArray(source.appliedTransactionIds, 'save.appliedTransactionIds', errors),
    completedLessonIds: readEnumArray(source.completedLessonIds, LESSON_IDS, 'save.completedLessonIds', errors),
    helpfulVisitIds: readStringArray(source.helpfulVisitIds, 'save.helpfulVisitIds', errors),
    careClosureVisitIds: readStringArray(source.careClosureVisitIds, 'save.careClosureVisitIds', errors),
    helpfulScenariosByLearningPoint: readByLearningPoint(
      source.helpfulScenariosByLearningPoint,
      'save.helpfulScenariosByLearningPoint',
      errors,
      (entry, itemPath) => readStringArray(entry, itemPath, errors),
    ),
    firstHelpfulByLearningPoint: readByLearningPoint(
      source.firstHelpfulByLearningPoint,
      'save.firstHelpfulByLearningPoint',
      errors,
      (entry, itemPath) => readNullableString(entry, itemPath, errors),
    ),
    memories: readArray(source.memories, 'save.memories', errors, (entry, itemPath) => readMemory(entry, itemPath, errors)),
    growthConfirmed: readBoolean(source.growthConfirmed, 'save.growthConfirmed', errors),
    challengePaused: readBoolean(source.challengePaused, 'save.challengePaused', errors),
    careActiveMsRemainder: readNumber(source.careActiveMsRemainder, 'save.careActiveMsRemainder', errors, 0),
    pendingPresentation: readPendingPresentation(source.pendingPresentation, 'save.pendingPresentation', errors),
    settings: readSettings(source.settings, 'save.settings', errors),
    visitCount: readInteger(source.visitCount, 'save.visitCount', errors, 0),
    lostAtUTC: readNullableNumber(source.lostAtUTC, 'save.lostAtUTC', errors),
  };
  if (save.mode === 'standard' && save.challengePaused) errors.push('save.challengePaused: standard is never paused');
  if (save.mode === 'standard' && save.dog.status === 'lost') errors.push('save.dog.status: standard dog cannot be lost');
  return save;
}

function readArchive(value: unknown, path: string, errors: string[]): ChallengeArchive {
  const source = readObject(value, path, errors) ?? {};
  return {
    saveId: readString(source.saveId, `${path}.saveId`, errors),
    dogInstanceId: readString(source.dogInstanceId, `${path}.dogInstanceId`, errors),
    dogName: readString(source.dogName, `${path}.dogName`, errors),
    createdUTC: readNumber(source.createdUTC, `${path}.createdUTC`, errors),
    endedUTC: readNumber(source.endedUTC, `${path}.endedUTC`, errors),
    reason: readEnum(source.reason, ARCHIVE_REASONS, `${path}.reason`, errors),
    milestones: readStringArray(source.milestones, `${path}.milestones`, errors),
    visitCount: readInteger(source.visitCount, `${path}.visitCount`, errors, 0),
    completedLessonIds: readEnumArray(source.completedLessonIds, LESSON_IDS, `${path}.completedLessonIds`, errors),
  };
}

function readMeta(input: unknown, errors: string[]): Meta | null {
  const source = readObject(input, 'meta', errors);
  if (!source) return null;
  if (source.schemaVersion !== SAVE_SCHEMA_VERSION) {
    errors.push(`meta.schemaVersion: expected ${SAVE_SCHEMA_VERSION}`);
    return null;
  }
  const saveIds = readObject(source.saveIds, 'meta.saveIds', errors) ?? {};
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    activeMode: readEnum(source.activeMode, MODES, 'meta.activeMode', errors),
    saveIds: {
      standard: readString(saveIds.standard, 'meta.saveIds.standard', errors),
      challenge: readNullableString(saveIds.challenge, 'meta.saveIds.challenge', errors),
    },
    archives: readArray(source.archives, 'meta.archives', errors, (entry, itemPath) => readArchive(entry, itemPath, errors)),
  };
}

/** Only used to shape a placeholder dog while errors are being collected; never returned as a valid save. */
const FALLBACK_PROVIDERS: Providers = {
  nowUTC: () => 0,
  monotonic: () => 0,
  id: (prefix = 'invalid') => `${prefix}_invalid`,
  seed: () => 0,
};
