/**
 * Bond memory texts per lesson and closure (02 "Bindung", 05 Beispieltexte).
 * One memory per helpful visit, stable id memory_<visitId>; the text is chosen by lessonId + closure.
 * Past tense, one sentence, no scores.
 */
import type { MemoryText } from './types';
import type { LessonId } from '../simulation/types';

export const memories: Record<LessonId, { completed: MemoryText; careClosure: MemoryText }> = {
  L01: {
    completed: {
      title: 'Zusammen hingeschaut',
      text: 'Ihr habt heute gut aufeinander geachtet.',
    },
    careClosure: {
      title: 'Pause zur richtigen Zeit',
      text: 'Du hast Nala eine Pause angeboten, als sie müde wurde.',
    },
  },
  L02: {
    completed: {
      title: 'Ein kurzer Blick',
      text: 'Nala hat von selbst zu dir geschaut, und du hast es bemerkt.',
    },
    careClosure: {
      title: 'Ruhig aufgehört',
      text: 'Ihr habt die Übung beendet, bevor es zu viel wurde.',
    },
  },
  L03: {
    completed: {
      title: 'Ruhe gehört dazu',
      text: 'Du hast erkannt, was Nala brauchte, und ihr seid ruhig auseinandergegangen.',
    },
    careClosure: {
      title: 'Gemeinsam zur Ruhe gekommen',
      text: 'Nala hat sich ausgeruht, und du hast den Tag ruhig abgeschlossen.',
    },
  },
};
