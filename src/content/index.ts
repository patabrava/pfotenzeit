/**
 * Content catalog: typed German game data. No logic, no DOM, no Three.js, no timers.
 * Lesson texts are provisional until the book review (03_LERNPLAN_QUELLEN).
 */
import type { ContentCatalog } from './types';
import { lessons, LESSON_ORDER } from './lessons';
import { dogs, humans } from './characters';
import { upgrades } from './upgrades';
import { memories } from './memories';
import { learningPoints } from './learningPoints';
import { practice } from './practice';
import { moments } from './moments';
import { de } from './de';

export const content: ContentCatalog = {
  lessons,
  dogs,
  humans,
  upgrades,
  memories,
  learningPoints,
  practice,
  moments,
};

export { lessons, LESSON_ORDER, dogs, humans, upgrades, memories, learningPoints, practice, moments, de };
export type { De } from './de';
export type {
  ContentCatalog,
  DogCharacter,
  ExerciseSpec,
  MomentText,
  PracticeExercise,
  HumanCharacter,
  LessonDefinition,
  LessonOption,
  LessonRound,
  MemoryText,
  ObservationVariant,
  SourceId,
  SourceStatus,
  UpgradeDefinition,
} from './types';
