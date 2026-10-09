import { describe, expect, it } from 'vitest';
import { content, de } from '../../src/content';

const HEX = /^#[0-9A-F]{6}$/i;
const FORBIDDEN = /falsch|fehler/i;

/** Walk the string table; functions are called with sample arguments so their output is checked too. */
function collectDeStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown;
    for (const args of [['Nala'], ['Nala', 'arriving'], ['Nala', 'awake'], [3], [1], [2, 3], ['Nala', 'ready'], ['Nala', 'needs_care'], [0], ['growing'], ['awake'], ['standard'], ['challenge'], ['L01', 'Hinschauen'], ['Hinschauen']]) {
      try {
        const r = fn(...args);
        if (typeof r === 'string') out.push(r);
      } catch {
        /* sample arguments do not fit this function */
      }
    }
  } else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectDeStrings(v, out));
  return out;
}

describe('characters', () => {
  it('has Nala (own) and Bruno (guest) with valid colours and heights from 07', () => {
    expect(content.dogs.dog_nala.role).toBe('own');
    expect(content.dogs.dog_bruno.role).toBe('guest');
    expect(content.dogs.dog_nala.shoulderHeightM).toEqual({ arriving: 0.28, growing: 0.36 });
    expect(content.dogs.dog_bruno.shoulderHeightM.arriving).toBe(0.31);
    for (const dog of Object.values(content.dogs)) {
      for (const hex of Object.values(dog.colors)) expect(hex).toMatch(HEX);
      for (const t of Object.values(dog.temperament)) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1);
      }
    }
  });

  it('has Mira and Alex with valid colours and heights', () => {
    expect(content.humans.human_mira.heightM).toBe(1.7);
    expect(content.humans.human_alex.heightM).toBe(1.76);
    for (const h of Object.values(content.humans)) for (const hex of Object.values(h.colors)) expect(hex).toMatch(HEX);
  });

  it('Bruno temperament is more movement-reactive than Nala (07)', () => {
    expect(content.dogs.dog_bruno.temperament.movementReactivity).toBeGreaterThan(content.dogs.dog_nala.temperament.movementReactivity);
  });
});

describe('upgrades, memories, learning points', () => {
  it('upgrades cost 2 and 3 marks (02) and map to their environments', () => {
    expect(content.upgrades.rest_place.cost).toBe(2);
    expect(content.upgrades.sniff_corner.cost).toBe(3);
    expect(content.upgrades.rest_place.environment).toBe('rest_place');
    expect(content.upgrades.sniff_corner.environment).toBe('sniff_corner');
  });

  it('every lesson has completed and careClosure memories with one-sentence texts', () => {
    for (const id of ['L01', 'L02', 'L03'] as const) {
      for (const closure of ['completed', 'careClosure'] as const) {
        const m = content.memories[id][closure];
        expect(m.title.length).toBeGreaterThan(0);
        expect(m.text.endsWith('.')).toBe(true);
        expect(m.text.split('. ').length).toBe(1);
      }
    }
    expect(content.memories.L01.completed.text).toBe('Ihr habt heute gut aufeinander geachtet.');
  });

  it('learning points match the lesson learningPointIds and have label/summary/everyday', () => {
    for (const lesson of Object.values(content.lessons)) {
      const lp = content.learningPoints[lesson.learningPointId];
      expect(lp.label).toBe(lesson.learningPointLabel);
      expect(lp.summary.length).toBeGreaterThan(0);
      expect(lp.everyday.length).toBeGreaterThan(0);
    }
  });
});

describe('UI strings (de)', () => {
  it('contains the verbatim texts from 03, 04 and 05', () => {
    expect(de.challenge.onboarding).toBe(
      'Optional: Pflege mit Konsequenzen. Während des Spielens können Bedürfnisse sinken. Längere Vernachlässigung kann diesen Lauf beenden. Allein durch deine Abwesenheit stirbt dein Welpe nicht.',
    );
    expect(de.challenge.disclaimer).toBe('Diese Pflegewerte sind Spielregeln. Sie bilden keine reale Hundegesundheit ab.');
    expect(de.memorial.text).toBe('Dein Challenge-Welpe ist gestorben. Dieser Spielstand endet hier.');
    expect(de.errors.otherTab).toBe('Spiel ist in einem anderen Tab geöffnet');
    expect(de.readiness.needsCare('Nala')).toBe('Nala braucht gerade Ruhe.');
    expect(de.home.greeting('Nala')).toBe('Nala begrüßt dich.');
  });

  it('has the required labels', () => {
    expect(de.home.toLesson).toBe('Zur Übung');
    expect(de.home.profile).toBe('Profil');
    expect(de.profile.tabs).toEqual({ care: 'Pflege', memories: 'Erinnerungen', learned: 'Gelernt' });
    expect(de.care.actions).toEqual({ meal: 'Futter geben', rest: 'Ruhe anbieten', play: 'Ruhiges Spiel', calm: 'Abstand geben' });
    expect(de.needs.satiety).toBe('Hunger');
    expect(de.needs.energy).toBe('Energie');
    expect(de.needs.comfort).toBe('Wohlgefühl');
    expect(de.lesson.lookCloser).toBe('Genauer ansehen');
    expect(de.lesson.describe).toBe('Beobachtung beschreiben');
    expect(de.lesson.next).toBe('Weiter');
    expect(de.lesson.offerPause).toBe('Pause anbieten');
    expect(de.lesson.endToday).toBe('Heute beenden');
    expect(de.reflection.doneToday).toBe('Fertig für heute');
    expect(de.reflection.toSchool).toBe('Zur Schule');
    expect(de.reflection.everyday).toBe('Im Alltag');
    expect(de.school.marks).toBe('Schulmarken');
    expect(de.school.buy).toBe('Ausbauen');
    expect(de.settings.reducedMotion).toBe('Bewegung reduzieren');
    expect(de.settings.observationText).toBe('Beobachtungstext');
    expect(de.settings.quality).toBe('Qualität');
    expect(de.settings.mode).toBe('Spielmodus');
    expect(de.settings.renameDog).toBe('Hund umbenennen');
    expect(de.challenge.start).toBe('Challenge starten');
    expect(de.challenge.relaxed).toBe('Entspannt spielen');
    expect(Object.keys(de.challenge.bands)).toEqual(['stable', 'impaired', 'critical', 'lost']);
    expect(Object.keys(de.pixel.state('awake')).length).toBeGreaterThan(0);
  });

  it('never uses blame vocabulary and every string is non-empty', () => {
    const texts = collectDeStrings(de);
    expect(texts.length).toBeGreaterThan(150);
    for (const t of texts) {
      expect(t.trim().length).toBeGreaterThan(0);
      expect(t).not.toMatch(FORBIDDEN);
    }
  });
});
