/**
 * School upgrades (02 "Ausbau und Wachstum"). Rest and basic care are free before any upgrade;
 * an upgrade adds a scenario variant and visible decoration, never access to needed care.
 */
import type { UpgradeDefinition } from './types';
import type { UpgradeId } from '../simulation/types';

export const upgrades: Record<UpgradeId, UpgradeDefinition> = {
  rest_place: {
    id: 'rest_place',
    label: 'Ruheplatz',
    cost: 2,
    description:
      'Ein ruhiger Platz unter dem Holzunterstand mit einer weichen Decke. Ruhe gibt es auch ohne Ausbau. Der Ruheplatz macht sie sichtbar und bringt eine neue Übungssituation.',
    preview: 'Decke und niedrige Holzkante unter dem Unterstand, Nala liegt dort gern.',
    environment: 'rest_place',
  },
  sniff_corner: {
    id: 'sniff_corner',
    label: 'Schnüffelecke',
    cost: 3,
    description:
      'Eine Ecke mit Gras, Holzstücken und wechselnden Gerüchen. Schnüffeln beschäftigt Nala ruhig und bringt eine weitere Übungssituation.',
    preview: 'Kleine Ecke mit hohem Gras und ein paar Holzscheiben am Zaun.',
    environment: 'sniff_corner',
  },
};
