/**
 * Balance constants. Source: 02_SPIELSCHLEIFE, 04_PFLEGE_CHALLENGE, 15_DATEN_REGELN.
 * These are initial defaults; change only after a documented playtest (15 "Offene Balancepunkte").
 */
import type { CareKind, LearningPointId, LessonContext, MomentKind, MomentResponse, NeedValues, Settings, UpgradeId } from './types';

export const START_NEEDS: NeedValues = {
  satiety: 80,
  energy: 80,
  comfort: 80,
  arousal: 20,
  stress: 20,
  vitality: 100,
};

/** Arousal/stress baseline the scenario context returns to at session end. */
export const CONTEXT_BASELINE: LessonContext = {
  arousal: 20,
  stress: 20,
  energyShown: null,
  difficulty: 'normal',
};

/** Active decline per full active minute. */
export const ACTIVE_DECLINE_PER_MINUTE = {
  satiety: 2,
  energy: 1,
  comfort: 1,
} as const;

/** Energy cost once per completed training round (never per retry). */
export const ROUND_ENERGY_COST = 4;

/** Standard mode floor for satiety/energy/comfort. */
export const STANDARD_FLOOR = 25;

/** Offline decline (challenge only) per credited hour. */
export const OFFLINE_DECLINE_PER_HOUR = {
  satiety: 2,
  comfort: 1,
} as const;

export const OFFLINE_MAX_CREDITED_HOURS = 8;
/** Offline values above this are never reduced below it; lower values stay unchanged. */
export const OFFLINE_FLOOR = 25;
/** Elapsed time below this is not treated as absence (prevents double application on quick return). */
export const OFFLINE_MIN_ELAPSED_MS = 60_000;

/** Challenge vitality dynamics per active minute. */
export const VITALITY_LOSS_PER_MINUTE = 5;
export const VITALITY_REGEN_PER_MINUTE = 2;
export const VITALITY_REGEN_THRESHOLD = 35;

/** Vitality bands (04). */
export const VITALITY_BANDS = {
  stableMin: 61,
  impairedMin: 31,
  criticalMin: 1,
} as const;

/** Readiness thresholds (02). */
export const READINESS = {
  lowNeed: 35,
  highArousal: 70,
  highStress: 60,
} as const;

export const CARE_EFFECTS: Record<CareKind, Partial<NeedValues>> = {
  meal: { satiety: 35 },
  rest: { energy: 30, stress: -20 },
  play: { comfort: 20 },
  calm: { stress: -20, comfort: 10 },
};

/** Care presentation durations in ms (04: 3–5 s, skippable with reduced motion). */
export const CARE_PRESENTATION_MS: Record<CareKind, number> = {
  meal: 4000,
  rest: 4000,
  play: 3500,
  calm: 3000,
};

export const UPGRADE_COSTS: Record<UpgradeId, number> = {
  rest_place: 2,
  sniff_corner: 3,
};

export const LEARNING_POINT_IDS: readonly LearningPointId[] = [
  'criterion_context',
  'criterion_orientation',
  'criterion_support',
];

/** Distinct scenario ids with unsupported helpful decisions needed per learning point. */
export const LEARNED_SCENARIO_COUNT = 2;

/** Growth requirements (02, 15). */
export const GROWTH_REQUIREMENTS = {
  lessons: ['L01', 'L02', 'L03'] as const,
  helpfulVisits: 3,
  careClosures: 1,
};

export const MARK_PER_VISIT = 1;
export const MARK_PER_LEARNING_POINT = 1;
export const BOND_PER_HELPFUL_VISIT = 1;

/** Max transaction ids kept in the save (bounded history, 09). */
export const TRANSACTION_HISTORY_LIMIT = 256;

export const DOG_NAME_MAX_LENGTH = 16;

export const DEFAULT_SETTINGS: Settings = {
  audioEnabled: false,
  reducedMotionOverride: 'system',
  observationTextEnabled: true,
  qualityTier: 'auto',
};

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;

// ---------------------------------------------------------------------------
// Yard life (D-041)
// ---------------------------------------------------------------------------

/** Distance bands (metres): below nearMax = near, below midMax = mid, else far. */
export const DISTANCE_BANDS = { nearMax: 1.2, midMax: 2.6 } as const;
/** Attempts per exercise round before 'retry' behaves as 'advance'. */
export const EXERCISE_MAX_ATTEMPTS = 3;
/** Exercise rules thresholds (simulation/exercise.ts). */
export const EXERCISE_RULES = {
  /** Stress at or above this: the dog hesitates on recall / cannot settle. */
  stressHesitate: 50,
  /** Energy below this: the dog hesitates (tired). */
  energyTired: 35,
} as const;
/** Small bounded effects of responding to a dog-initiated moment. Not care; no economy (D-041). */
export const MOMENT_EFFECTS: Record<MomentKind, Partial<Record<MomentResponse, Partial<NeedValues>>>> = {
  sniff_spot: { allow: { stress: -5, comfort: 5 }, call_gently: { arousal: 5 }, ignore: {} },
  look_at_other_dog: { allow: { arousal: 5 }, call_gently: { stress: -5 }, ignore: {} },
  settle_beside: { sit_with: { stress: -10, comfort: 10 }, ignore: {} },
  offer_glance: { reward_glance: { comfort: 5, stress: -5 }, ignore: {} },
};
/** World time between moments (seconds) and how long a moment waits for a response before fading. */
export const MOMENT_TIMING = { cooldownS: 45, firstAfterS: 20, holdS: 25 } as const;
/** Movement speeds, m/s (yard ≈ 7 m: crossing takes ≈ 5 s). */
export const YARD_SPEEDS = { handler: 1.5, dogFollow: 2.0, dogComing: 2.4, dogWander: 0.7 } as const;
/** look_at: standing still this long with low distraction makes the dog offer a glance. */
export const LOOK_AT_STILL_S = 4;
