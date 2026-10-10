/**
 * Free practice exercises (D-041, docs/WORLD_PLAN.md §7). German, calm, no rewards: the player tries what a lesson
 * taught, at their own pace, with a chosen distraction. Provisional like the lessons (no book claim).
 */
import type { ExerciseKind } from '../simulation/types';
import type { PracticeExercise } from './types';

export const practice: Record<ExerciseKind, PracticeExercise> = {
  recall: {
    kind: 'recall',
    title: 'Rufen und Kommen',
    requiresLesson: 'L02',
    spec: {
      kind: 'recall',
      distraction: 'none',
      minDistanceM: 2.6,
      instruction: 'Geh ein paar Schritte von Nala weg. Wenn du bereit bist, ruf sie zu dir. Du bestimmst das Tempo.',
      readyLabel: 'Nala rufen',
      notReadyHint: 'Geh noch ein Stück weiter weg, damit der Ruf eine Aufgabe ist.',
      responseText: {
        comes: 'Nala kommt zu dir und schaut dich an. Der Körper ist locker, die Rute auf mittlerer Höhe.',
        distracted: 'Nala bleibt bei der Ablenkung. Ohren nach vorn, Gewicht auf den Vorderpfoten. Die Situation ist gerade zu schwer.',
        hesitates: 'Nala macht einen Schritt und bleibt stehen. Sie hat dich gehört; der Weg ist ihr gerade zu viel.',
        turns_away: 'Nala wendet sich ab und schnüffelt. Bruno ist sehr nah, ihr Körper ist angespannt.',
      },
      fallbackBands: { near: 'Direkt neben Nala', mid: 'Zwei Schritte weg', far: 'Weit weg' },
    },
    hint: 'Mach es leichter: mehr Abstand zur Ablenkung, weniger Abstand zu dir. Dann noch einmal.',
    successResponses: ['comes'],
  },
  find_spot: {
    kind: 'find_spot',
    title: 'Eine ruhige Stelle finden',
    requiresLesson: 'L01',
    spec: {
      kind: 'find_spot',
      distraction: 'other_dog',
      instruction: 'Geh mit Nala durch den Hof und beobachte sie. Wenn ihr Körper locker wird, tippe auf „Hier bleiben“.',
      readyLabel: 'Hier bleiben',
      notReadyHint: 'Bleib kurz stehen, dann kannst du die Stelle wählen.',
      responseText: {
        settled: 'Nalas Körper wird weicher, die Ohren kommen nach vorn, die Rute pendelt locker. Die Stelle passt.',
        still_tense: 'Nala steht noch steif, die Ohren zurück. Die Stelle ist noch zu nah an dem, was sie beschäftigt.',
      },
      fallbackBands: { near: 'Nah bei Alex und Bruno', mid: 'In die Mitte des Hofs', far: 'Zum Ruheplatz oder in die stille Ecke' },
    },
    hint: 'Schau, wohin Nala blickt und wo die Ohren sind. Mehr Abstand von dort, was sie beschäftigt.',
    successResponses: ['settled'],
  },
  look_at: {
    kind: 'look_at',
    title: 'Auf einen Blick warten',
    requiresLesson: 'L02',
    spec: {
      kind: 'look_at',
      distraction: 'none',
      instruction: 'Bleib in Nalas Nähe stehen und warte. Sag nichts. Wenn sie von sich aus zu dir schaut, tippe auf „Belohnen“.',
      readyLabel: 'Belohnen',
      notReadyHint: 'Einfach ruhig stehen bleiben. Der Blick kommt von Nala.',
      responseText: {
        glance: 'Nala hebt den Kopf und schaut dich an. Der Körper bleibt locker. Du hast den Blick bemerkt.',
      },
      fallbackBands: { near: 'Direkt neben Nala stehen', mid: 'Zwei Schritte entfernt stehen', far: 'Weiter weg stehen' },
    },
    hint: 'Stehen bleiben, nichts sagen, nicht hinsehen müssen. Der Blick kommt, wenn nichts anderes wichtiger ist.',
    successResponses: ['glance'],
  },
};
