/**
 * Pure selectors over Save (+ optional transient flags). No DOM, no Three.
 * WP-A owns and may refine; keep signatures stable because ui/ and render/ consume them.
 */
import type { ContentCatalog, LessonOption, LessonRound } from '../content/types';
import { EXERCISE_MAX_ATTEMPTS } from './defaults';
import { attemptsForRound, lastAttempt, offeredOptions } from './lessons';
import { GROWTH_REQUIREMENTS, LEARNED_SCENARIO_COUNT, READINESS, VITALITY_BANDS } from './defaults';
import type {
  CareKind,
  DogState,
  LearningPointId,
  Mode,
  PixelState,
  Readiness,
  RoundRef,
  Save,
  SceneDirective,
  VitalityBand,
  VisitDecision,
  VisitState,
  ExerciseAttempt,
} from './types';

export function getVitalityBand(dog: Pick<DogState, 'vitality' | 'status'>, mode: Mode): VitalityBand {
  if (mode !== 'challenge') return 'stable';
  if (dog.status === 'lost' || dog.vitality <= 0) return 'lost';
  if (dog.vitality >= VITALITY_BANDS.stableMin) return 'stable';
  if (dog.vitality >= VITALITY_BANDS.impairedMin) return 'impaired';
  return 'critical';
}

/** Training is locked in the critical band and after loss (04). Care and pause stay available. */
export function isTrainingLocked(save: Save): boolean {
  const band = getVitalityBand(save.dog, save.mode);
  return band === 'critical' || band === 'lost';
}

/** Care suggestion from real values. Order: meal, rest, calm (stress), play (arousal/comfort). */
export function getCareSuggestion(dog: DogState): CareKind | null {
  if (dog.satiety < READINESS.lowNeed) return 'meal';
  if (dog.energy < READINESS.lowNeed) return 'rest';
  if (dog.stress > READINESS.highStress) return 'calm';
  if (dog.arousal > READINESS.highArousal) return 'calm';
  if (dog.comfort < READINESS.lowNeed) return 'play';
  return null;
}

export function getReadiness(save: Save): { readiness: Readiness; suggestion: CareKind | null } {
  const suggestion = getCareSuggestion(save.dog);
  return { readiness: suggestion ? 'needs_care' : 'ready', suggestion };
}

/** Priority: lost → critical → tired → hungry → playful → awake (16). `resting` is presentation-only. */
export function getPixelState(save: Save): PixelState {
  const band = getVitalityBand(save.dog, save.mode);
  if (band === 'lost') return 'memorial';
  if (band === 'critical') return 'exhausted';
  const { dog } = save;
  if (dog.energy < READINESS.lowNeed) return 'tired';
  if (dog.satiety < READINESS.lowNeed) return 'hungry';
  if (dog.comfort < READINESS.lowNeed || (dog.energy >= 60 && dog.arousal >= 40)) return 'playful';
  return 'awake';
}

export function isLearned(save: Save, point: LearningPointId): boolean {
  return (save.helpfulScenariosByLearningPoint[point]?.length ?? 0) >= LEARNED_SCENARIO_COUNT;
}

export function isGrowthAvailable(save: Save): boolean {
  if (save.growthConfirmed || save.dog.growthStage !== 'arriving') return false;
  if (save.dog.status === 'lost') return false;
  const lessonsDone = GROWTH_REQUIREMENTS.lessons.every((id) => save.completedLessonIds.includes(id));
  return (
    lessonsDone &&
    save.helpfulVisitIds.length >= GROWTH_REQUIREMENTS.helpfulVisits &&
    save.careClosureVisitIds.length >= GROWTH_REQUIREMENTS.careClosures
  );
}

export function getCurrentRoundRef(visit: VisitState | null): RoundRef | null {
  if (!visit) return null;
  return visit.queue[visit.index] ?? null;
}

export function getCurrentRound(save: Save, content: ContentCatalog): LessonRound | null {
  const visit = save.currentVisit;
  const ref = getCurrentRoundRef(visit);
  if (!visit || !ref) return null;
  const lesson = content.lessons[visit.lessonId];
  return lesson.rounds.find((round) => round.id === ref.roundId) ?? null;
}

/** Options offered now (exercise rounds: filtered by the last attempt's response, D-041). */
export function getCurrentOptions(save: Save, content: ContentCatalog): LessonOption[] {
  const round = getCurrentRound(save, content);
  const visit = save.currentVisit;
  if (!round || !visit) return [];
  return offeredOptions(round, visit);
}

/** Last exercise attempt of the current round, or null (D-041). */
export function getLastAttempt(save: Save): ExerciseAttempt | null {
  return save.currentVisit ? lastAttempt(save.currentVisit) : null;
}

/** Attempts used / allowed for the current round (null outside exercise rounds). */
export function getAttemptCount(save: Save, content: ContentCatalog): { used: number; max: number } | null {
  const round = getCurrentRound(save, content);
  const visit = save.currentVisit;
  if (!round?.exercise || !visit) return null;
  return { used: attemptsForRound(visit, round.id).length, max: EXERCISE_MAX_ATTEMPTS };
}

export function getLastOption(save: Save, content: ContentCatalog): LessonOption | null {
  const visit = save.currentVisit;
  if (!visit?.lastOptionId) return null;
  return getCurrentRound(save, content)?.options.find((option) => option.id === visit.lastOptionId) ?? null;
}

/** The same seeded variant supplies both the text and its visible staging. */
export function getObservationVariant(save: Save, content: ContentCatalog) {
  const round = getCurrentRound(save, content);
  const visit = save.currentVisit;
  if (!round || !visit || !round.variants?.length) return null;
  return round.variants[Math.abs(visit.seed + visit.index) % round.variants.length] ?? round.variants[0]!;
}

/** Observation text for the current round, choosing its seeded variant when present. */
export function getObservation(
  save: Save,
  content: ContentCatalog,
): { text: string; description: string } | null {
  const round = getCurrentRound(save, content);
  const visit = save.currentVisit;
  if (!round || !visit) return null;
  const pick = getObservationVariant(save, content);
  if (!pick) {
    return { text: round.observationText, description: round.observationDescription };
  }
  return { text: pick.observationText, description: pick.observationDescription };
}

/** Number of rounds remaining including the current one. */
export function getRoundsRemaining(visit: VisitState | null): number {
  if (!visit) return 0;
  return Math.max(0, visit.queue.length - visit.index);
}

export interface DirectiveOptions {
  /** Transient route from AppState; 'lesson' shows the round, anything else shows the school. */
  route: string;
  /** D-041: 'yard' (default) puts home/practice and exercise rounds into the free-movement view; 'static' keeps the staged school. */
  yardMode?: 'yard' | 'static';
}

/** Scene description for the renderer. Pure; the renderer diffs it. */
export function getSceneDirective(save: Save, content: ContentCatalog, options: DirectiveOptions): SceneDirective {
  const upgrades = [...save.school.upgrades];
  const dog = save.dog;
  const visit = save.currentVisit;
  const round = options.route === 'lesson' ? getCurrentRound(save, content) : null;

  if (round && visit) {
    const lastOption = getLastOption(save, content);
    const inReaction = visit.phase === 'react' || visit.phase === 'feedback';
    const variant = getObservationVariant(save, content);
    const observationPose = variant?.observationPose ?? round.observationPose;
    // A response that continues resting retains the selected side/front resting pose.
    const pose = inReaction && lastOption
      ? (lastOption.poseAfter === 'rest_loop' && observationPose === 'rest_side' ? 'rest_side' : lastOption.poseAfter)
      : observationPose;
    let position = inReaction && lastOption?.dogPositionAfter
      ? lastOption.dogPositionAfter : variant?.dogPosition ?? round.dogPosition ?? 'center';
    if (position === 'behind' && variant?.dogPosition === 'sniff') position = 'sniff_retreat';
    const gesture = inReaction && lastOption?.humanGesture ? lastOption.humanGesture : round.humanGesture;
    const focus = round.dogId;
    const dogs: SceneDirective['dogs'] = [];
    if (focus === 'dog_nala') {
      dogs.push({ id: 'dog_nala', name: dog.name, growthStage: dog.growthStage, pose, position, facing: pose === 'look_at_handler' ? -70 : 20 });
    } else {
      dogs.push({ id: 'dog_bruno', name: content.dogs.dog_bruno.name, growthStage: 'arriving', pose, position, facing: pose === 'look_at_handler' ? -70 : 20 });
      dogs.push({ id: 'dog_nala', name: dog.name, growthStage: dog.growthStage, pose: 'rest_loop', position: 'edge', facing: -30 });
    }
    const humans: SceneDirective['humans'] = [];
    if (round.humanId) {
      humans.push({ id: round.humanId, gesture, position: inReaction ? lastOption?.humanPositionAfter ?? (round.dogPosition === 'rest' ? 'rest_handler' : 'handler') : (round.dogPosition === 'rest' ? 'rest_handler' : 'handler'), facing: 35 });
    }
    const yard = (options.yardMode ?? 'yard') === 'yard';
    if (round.exercise && yard) {
      // D-041: the whole exercise round plays in the yard; the controller attaches `world`.
      return {
        view: 'yard',
        environment: round.environment,
        upgrades,
        dogs: [
          { id: 'dog_nala', name: dog.name, growthStage: dog.growthStage, pose, position: 'center', facing: 0 },
          // The other dog stands at the fence with Alex; in rounds about Bruno he carries the round's pose.
          { id: 'dog_bruno', name: content.dogs.dog_bruno.name, growthStage: 'arriving', pose: focus === 'dog_bruno' ? pose : 'idle_relaxed', position: 'edge', facing: -30 },
        ],
        humans: [{ id: 'human_mira', gesture, position: 'handler', facing: 35 }, { id: 'human_alex', gesture: 'idle', position: 'edge', facing: -30 }],
        props: round.exercise.distraction === 'toy' ? ['ball'] : [],
        focusDogId: 'dog_nala',
        hold: false,
      };
    }
    return {
      view: visit.phase === 'observe' || visit.phase === 'decide' ? 'closeup' : 'lesson',
      environment: variant?.environment ?? round.environment,
      upgrades,
      dogs,
      humans,
      props: [...(variant?.props ?? round.props)].filter((prop) => !inReaction || !lastOption?.hidePropsAfter?.includes(prop)),
      focusDogId: focus,
      hold: visit.phase === 'observe' || visit.phase === 'decide',
    };
  }

  const pixel = getPixelState(save);
  const homePose: SceneDirective['dogs'][number]['pose'] =
    pixel === 'memorial'
      ? 'lie_down'
      : pixel === 'exhausted'
        ? 'tired_idle'
        : pixel === 'tired'
          ? 'tired_idle'
          : pixel === 'hungry'
            ? 'look_at_handler'
            : pixel === 'playful'
              ? 'play_bow'
              : 'idle_relaxed';
  const yardHome = (options.yardMode ?? 'yard') === 'yard' && (options.route === 'home' || options.route === 'practice') && pixel !== 'memorial';
  return {
    view: yardHome ? 'yard' : 'school',
    environment: 'courtyard',
    upgrades,
    dogs: [{ id: 'dog_nala', name: dog.name, growthStage: dog.growthStage, pose: homePose, position: 'center', facing: 15 }],
    humans: yardHome
      ? [{ id: 'human_mira', gesture: 'idle', position: 'left', facing: 30 }, { id: 'human_alex', gesture: 'idle', position: 'edge', facing: -30 }]
      : [{ id: 'human_mira', gesture: 'idle', position: 'left', facing: 30 }],
    props: ['water', 'bowl', ...(upgrades.includes('rest_place') ? (['blanket'] as const) : [])],
    focusDogId: 'dog_nala',
    hold: false,
  };
}

// ---------------------------------------------------------------------------
// Visit helpers added by WP-A (pure; consumed by ui/ for reflection and closure buttons)
// ---------------------------------------------------------------------------

/** The most recent decision of the current visit, if any. */
export function getLastDecision(visit: VisitState | null): VisitDecision | null {
  if (!visit) return null;
  return visit.decisions[visit.decisions.length - 1] ?? null;
}

/** Number of helpful decisions (supported replays included) in the current visit. */
export function getHelpfulDecisionCount(visit: VisitState | null): number {
  return visit ? visit.decisions.filter((decision) => decision.helpful).length : 0;
}

/** True when the last decision chose an option with `next: 'careClosure'` (D-006 a). */
export function isCareClosureOffered(save: Save, content: ContentCatalog): boolean {
  const visit = save.currentVisit;
  const last = getLastDecision(visit);
  if (!visit || !last) return false;
  const round = content.lessons[visit.lessonId].rounds.find((entry) => entry.id === last.roundId);
  const option = round?.options.find((entry) => entry.id === last.optionId);
  return option?.next === 'careClosure';
}

/** Which closures COMPLETE_VISIT would accept right now (D-006); both false means only ABANDON_VISIT ends the visit. */
export function getAvailableClosures(save: Save, content: ContentCatalog): { completed: boolean; careClosure: boolean } {
  const visit = save.currentVisit;
  if (!visit || save.dog.status === 'lost') return { completed: false, careClosure: false };
  const exhausted = visit.index >= visit.queue.length;
  if (visit.phase === 'reflect') return { completed: exhausted, careClosure: true };
  if (visit.phase === 'observe' || visit.phase === 'decide' || visit.phase === 'feedback') {
    const needsCare = getReadiness(save).readiness === 'needs_care';
    const meaningful = needsCare || visit.decisions.length >= 1 || isCareClosureOffered(save, content);
    return { completed: false, careClosure: meaningful };
  }
  return { completed: false, careClosure: false };
}
