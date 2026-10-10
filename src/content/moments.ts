/**
 * Dog-initiated moments (D-041, docs/WORLD_PLAN.md §5). Observation lines follow 03 D1: several body signals and the
 * context, never a verdict about feelings. Responses are small and never blame.
 */
import type { MomentKind } from '../simulation/types';
import type { MomentText } from './types';

export const moments: Record<MomentKind, MomentText> = {
  sniff_spot: {
    observation: 'Nala senkt die Nase zum Boden und bleibt an einer Stelle hängen. Der Körper ist locker, die Rute pendelt auf mittlerer Höhe.',
    responses: { allow: 'Schnüffeln lassen', call_gently: 'Leise ansprechen', ignore: 'Einfach weitergehen' },
    outcome: {
      allow: 'Nala schnüffelt in Ruhe weiter. Ihr Körper bleibt locker.',
      call_gently: 'Nala hebt kurz den Kopf, schaut zu dir und schnüffelt dann weiter.',
      ignore: 'Nala schnüffelt noch einen Moment und kommt dann nach.',
    },
  },
  look_at_other_dog: {
    observation: 'Nala dreht den Kopf zu Bruno, die Ohren gehen nach vorn, der Körper wird etwas länger. Sie beobachtet ihn, bleibt aber stehen.',
    responses: { allow: 'Schauen lassen', call_gently: 'Leise ansprechen und Abstand geben', ignore: 'Nichts tun' },
    outcome: {
      allow: 'Nala schaut noch einen Moment zu Bruno und wendet sich dann wieder dir zu.',
      call_gently: 'Nala schaut zu dir und bleibt bei dir. Mit etwas Abstand wird ihr Körper weicher.',
      ignore: 'Nala beobachtet Bruno weiter. Die Ohren bleiben nach vorn gerichtet.',
    },
  },
  settle_beside: {
    observation: 'Nala legt sich neben dich, das Kinn kommt auf die Pfoten. Die Augen werden schmal, das Atmen wird ruhig.',
    responses: { sit_with: 'Dazusetzen', ignore: 'Liegen lassen' },
    outcome: {
      sit_with: 'Du setzt dich dazu. Nala seufzt einmal und bleibt liegen.',
      ignore: 'Nala bleibt ruhig liegen und döst.',
    },
  },
  offer_glance: {
    observation: 'Nala hebt den Kopf und schaut dich an. Der Körper ist locker, die Rute auf mittlerer Höhe. Niemand hat etwas gesagt.',
    responses: { reward_glance: 'Den Blick belohnen', ignore: 'Nur lächeln' },
    outcome: {
      reward_glance: 'Nala nimmt das Leckerli und schaut gleich noch einmal zu dir.',
      ignore: 'Nala schaut noch kurz und wendet sich dann wieder dem Hof zu.',
    },
  },
};
