/**
 * MVP cast (07_CHARAKTERE, 13_BILDPROMPTS). Colours are sampled from the reference sheets in
 * docs/pfotenzeit/characters/ and used by the procedural placeholders and the pixel palette.
 * Heights are fictional art values, not real age or size tables.
 */
import type { DogCharacter, HumanCharacter } from './types';
import type { DogCharacterId, HumanCharacterId } from '../simulation/types';

export const dogs: Record<DogCharacterId, DogCharacter> = {
  dog_nala: {
    id: 'dog_nala',
    name: 'Nala',
    role: 'own',
    description:
      'Honigfarbener Mischling mit cremefarbener Brust und Pfoten, Schlappohren und einem kleinen cremefarbenen Stirnstrich. Neugierig, kontaktfreudig, bei neuen Dingen gelegentlich vorsichtig.',
    temperament: { curiosity: 0.7, movementReactivity: 0.4, caution: 0.45 },
    colors: {
      body: '#C9955A',
      chest: '#F3E6C9',
      muzzle: '#D9AE78',
      ear: '#B07A3E',
      harness: '#8FA98A',
      marking: '#F3E6C9',
      nose: '#3B2A22',
      eye: '#3A2518',
    },
    shoulderHeightM: { arriving: 0.28, growing: 0.36 },
  },
  dog_bruno: {
    id: 'dog_bruno',
    name: 'Bruno',
    role: 'guest',
    description:
      'Kastanienbrauner Mischling mit weißer Schnauze, weißer Brust, weißem Stirnstreifen und weißer Schwanzspitze. Mag erkunden und reagiert auf Bewegung schnell mit hoher Erregung. Braucht gut gewählten Abstand.',
    temperament: { curiosity: 0.8, movementReactivity: 0.9, caution: 0.3 },
    colors: {
      body: '#7B4B2E',
      chest: '#F4F0E8',
      muzzle: '#F4F0E8',
      ear: '#65391F',
      harness: '#E4A67B',
      marking: '#F4F0E8',
      nose: '#2B1C15',
      eye: '#2E1A12',
    },
    shoulderHeightM: { arriving: 0.31, growing: 0.31 },
  },
};

export const humans: Record<HumanCharacterId, HumanCharacter> = {
  human_mira: {
    id: 'human_mira',
    name: 'Mira',
    role: 'Trainerin',
    heightM: 1.7,
    colors: { skin: '#A5704F', hair: '#2A1C16', top: '#326B58', bottom: '#E8DFCB', shoes: '#4A3C33' },
  },
  human_alex: {
    id: 'human_alex',
    name: 'Alex',
    role: 'Brunos Bezugsperson',
    heightM: 1.76,
    colors: { skin: '#C9A17E', hair: '#2E241F', top: '#B9623F', bottom: '#3C3F45', shoes: '#F0EDE6' },
  },
};
