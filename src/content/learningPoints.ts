/**
 * Learning points (03 Lernplan). Summary: one sentence a player could repeat in their own words.
 * Provisional until the book review.
 */
import type { LearningPointId } from '../simulation/types';

export const learningPoints: Record<LearningPointId, { label: string; summary: string; everyday: string }> = {
  criterion_context: {
    label: 'Hinschauen',
    summary: 'Ich schaue auf den ganzen Hund und die Umgebung, nicht auf ein einzelnes Zeichen.',
    everyday:
      'Wedeln allein heißt nicht Freude. Haltung, Ohren, Blick und Umgebung zusammen sagen mehr. Bei Spannung hilft Abstand, bei Müdigkeit eine Pause.',
  },
  criterion_orientation: {
    label: 'Orientierung',
    summary: 'Ich bemerke, wenn mein Hund von selbst zu mir schaut, und mache das lohnend.',
    everyday:
      'Lieber einen kurzen Blick belohnen als öfter rufen. Wenn die Umgebung zu spannend ist, erst Abstand schaffen, dann wieder üben.',
  },
  criterion_support: {
    label: 'Runterfahren',
    summary: 'Ich erkenne, wann mein Hund Ruhe braucht, und mache eine zu schwere Situation einfacher.',
    everyday:
      'Ruheplatz anbieten, Reiz wegnehmen oder aufhören sind echte Trainingsentscheidungen. Mehr Wiederholungen lösen nicht jede Schwierigkeit.',
  },
};
