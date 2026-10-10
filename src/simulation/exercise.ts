/**
 * Playable exercise rules (D-041, docs/WORLD_PLAN.md §6). Pure and deterministic: the response follows from the
 * recorded context and the real dog needs, never from timing or chance. Educational reading (03 D1): the
 * situation decides, not the dog's "will" — distance, distraction and the dog's state.
 */
import { EXERCISE_RULES } from './defaults';
import type {
  DogState,
  ExerciseContext,
  ExerciseKind,
  ExerciseResponse,
  MomentKind,
  MomentResponse,
  PoseId,
} from './types';

export type ExerciseNeeds = Pick<DogState, 'stress' | 'energy'>;

export function evaluateExercise(kind: ExerciseKind, context: ExerciseContext, dog: ExerciseNeeds): ExerciseResponse {
  switch (kind) {
    case 'recall': {
      if (context.otherDogBand === 'near') return 'turns_away';
      if (dog.stress >= EXERCISE_RULES.stressHesitate || dog.energy < EXERCISE_RULES.energyTired) return 'hesitates';
      if (context.distraction !== 'none' && context.distractionBand !== 'far') return 'distracted';
      return context.handlerBand === 'far' ? 'comes' : 'hesitates';
    }
    case 'find_spot': {
      const awayFromOther = context.otherDogBand === 'far';
      const awayFromDistraction = context.distraction === 'none' || context.distractionBand === 'far';
      return awayFromOther && awayFromDistraction && dog.stress < EXERCISE_RULES.stressHesitate ? 'settled' : 'still_tense';
    }
    case 'look_at':
      // The attempt exists only after the dog offered the glance (world event); the rules confirm it.
      return 'glance';
    default:
      return 'hesitates';
  }
}

/** Pose the dog ends in for a response; used for the effect and by the renderer as the settle pose. */
export function responsePose(response: ExerciseResponse): PoseId {
  switch (response) {
    case 'comes':
      return 'sit';
    case 'hesitates':
      return 'look_at_handler';
    case 'distracted':
      return 'alert_focus';
    case 'turns_away':
      return 'turn_away';
    case 'settled':
      return 'idle_relaxed';
    case 'still_tense':
      return 'tense_idle';
    case 'glance':
      return 'look_at_handler';
    default:
      return 'idle_relaxed';
  }
}

/** Pose after responding to a moment. */
export function momentPose(kind: MomentKind, response: MomentResponse): PoseId {
  if (response === 'ignore') return kind === 'settle_beside' ? 'lie_down' : 'sniff';
  switch (kind) {
    case 'sniff_spot':
      return response === 'allow' ? 'sniff' : 'look_at_handler';
    case 'look_at_other_dog':
      return response === 'allow' ? 'alert_focus' : 'look_at_handler';
    case 'settle_beside':
      return 'rest_loop';
    case 'offer_glance':
      return 'look_at_handler';
    default:
      return 'idle_relaxed';
  }
}

export const EXERCISE_RESPONSES: readonly ExerciseResponse[] = [
  'comes',
  'hesitates',
  'distracted',
  'turns_away',
  'settled',
  'still_tense',
  'glance',
];
export const DISTANCE_BAND_VALUES = ['near', 'mid', 'far'] as const;
export const DISTRACTION_VALUES = ['none', 'toy', 'other_dog'] as const;
export const MOMENT_KINDS: readonly MomentKind[] = ['sniff_spot', 'look_at_other_dog', 'settle_beside', 'offer_glance'];
export const MOMENT_RESPONSES: readonly MomentResponse[] = ['allow', 'call_gently', 'sit_with', 'reward_glance', 'ignore'];

export function isExerciseContext(value: unknown): value is ExerciseContext {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const band = (x: unknown): boolean => (DISTANCE_BAND_VALUES as readonly unknown[]).includes(x);
  return (
    band(v.handlerBand) &&
    band(v.otherDogBand) &&
    band(v.distractionBand) &&
    (DISTRACTION_VALUES as readonly unknown[]).includes(v.distraction) &&
    (v.dogZone === null || typeof v.dogZone === 'string') &&
    typeof v.handlerMoving === 'boolean'
  );
}
