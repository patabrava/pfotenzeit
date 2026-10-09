/**
 * Test catalog: three lessons × three rounds, built from src/content/types.ts.
 * Covers advance, supportedRetry, careClosure and careEffect. Texts are placeholders; real content is WP-B.
 */
import type { ContentCatalog, LessonDefinition, LessonOption, LessonRound } from '../../../src/content/types';
import { content as stub } from '../../../src/content/index';
import type { LearningPointId, LessonId } from '../../../src/simulation/types';

function option(id: string, patch: Partial<LessonOption> & Pick<LessonOption, 'helpful' | 'next'>): LessonOption {
  return {
    id,
    label: id,
    countsForLearning: false,
    poseAfter: patch.helpful ? 'look_at_handler' : 'turn_away',
    feedback: `Feedback ${id}`,
    ...patch,
  };
}

function round(id: string, patch: Partial<LessonRound> & Pick<LessonRound, 'options'>): LessonRound {
  return {
    id,
    scenarioId: `${id}_scene`,
    dogId: 'dog_nala',
    humanId: 'human_mira',
    title: id,
    observationText: `Beobachtung ${id}`,
    observationDescription: `Beschreibung ${id}`,
    observationPose: 'idle_relaxed',
    humanGesture: 'idle',
    environment: 'courtyard',
    props: [],
    contextBefore: {},
    supportHint: `Hinweis ${id}`,
    ...patch,
  };
}

function lesson(id: LessonId, learningPointId: LearningPointId, rounds: LessonRound[]): LessonDefinition {
  return {
    id,
    title: `Lektion ${id}`,
    subtitle: 'Test',
    learningPointId,
    learningPointLabel: learningPointId,
    sourceIds: ['D1'],
    sourceStatus: 'provisional',
    intro: 'Intro',
    transferText: 'Transfer',
    everydayText: 'Alltag',
    practiceText: 'Übung',
    rounds,
  };
}

/** L01 Hinschauen: distance (B) and pause (C) count for criterion_context. */
const L01 = lesson('L01', 'criterion_context', [
  round('L01_A', {
    options: [
      option('L01_A_1', { helpful: true, next: 'advance' }),
      option('L01_A_2', { helpful: false, next: 'supportedRetry' }),
    ],
  }),
  round('L01_B', {
    dogId: 'dog_bruno',
    humanId: 'human_alex',
    environment: 'courtyard_loud',
    contextBefore: { stress: 65 },
    options: [
      option('L01_B_1', { helpful: true, countsForLearning: true, next: 'advance', contextAfter: { stress: 30, difficulty: 'easy' } }),
      option('L01_B_2', { helpful: false, next: 'supportedRetry' }),
    ],
  }),
  round('L01_C', {
    options: [
      option('L01_C_1', { helpful: true, countsForLearning: true, next: 'advance', poseAfter: 'lie_down' }),
      option('L01_C_2', { helpful: false, next: 'advance' }),
    ],
  }),
]);

/** L02 Orientierung: reward the look (B) and reduce distraction (C) count. */
const L02 = lesson('L02', 'criterion_orientation', [
  round('L02_A', {
    options: [
      option('L02_A_1', { helpful: true, next: 'advance' }),
      option('L02_A_2', { helpful: false, next: 'supportedRetry' }),
    ],
  }),
  round('L02_B', {
    options: [
      option('L02_B_1', { helpful: true, countsForLearning: true, next: 'advance', humanGesture: 'offer_reward' }),
      option('L02_B_2', { helpful: false, next: 'advance' }),
    ],
  }),
  round('L02_C', {
    contextBefore: { arousal: 75 },
    props: ['toy_rolling'],
    options: [
      option('L02_C_1', { helpful: true, countsForLearning: true, next: 'advance', contextAfter: { arousal: 35, difficulty: 'easy' } }),
      option('L02_C_2', { helpful: false, next: 'supportedRetry' }),
    ],
  }),
]);

/** L03 Runterfahren: rest (A, real care effect) and relief (B) count; C closes with care. */
const L03 = lesson('L03', 'criterion_support', [
  round('L03_A', {
    contextBefore: { energyShown: 34 },
    options: [
      option('L03_A_1', { helpful: true, countsForLearning: true, next: 'advance', careEffect: 'rest', poseAfter: 'rest_loop' }),
      option('L03_A_2', { helpful: false, next: 'supportedRetry' }),
    ],
  }),
  round('L03_B', {
    dogId: 'dog_bruno',
    humanId: 'human_alex',
    contextBefore: { stress: 65 },
    props: ['toy_rolling'],
    options: [
      option('L03_B_1', { helpful: true, countsForLearning: true, next: 'advance', contextAfter: { stress: 30 } }),
      option('L03_B_2', { helpful: false, next: 'supportedRetry' }),
    ],
  }),
  round('L03_C', {
    options: [
      option('L03_C_1', { helpful: true, next: 'careClosure', poseAfter: 'lie_down' }),
      option('L03_C_2', { helpful: false, next: 'advance' }),
    ],
  }),
]);

export const testContent: ContentCatalog = {
  ...stub,
  lessons: { L01, L02, L03 },
};
