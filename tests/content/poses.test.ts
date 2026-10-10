import { describe, expect, it } from 'vitest';
import { de } from '../../src/content';
import { POSE_IDS } from '../../src/simulation/types';
import type { GestureId } from '../../src/simulation/types';

const GESTURES: GestureId[] = ['idle', 'greet', 'gesture_explain', 'offer_reward', 'kneel'];
const FORBIDDEN = /falsch|fehler/i;
/** Verdict words that would turn an observation into a diagnosis (03 D1). */
const VERDICT = /glücklich|traurig|ängstlich|hat angst|freut sich|dominant|stur|ungehorsam|böse/i;

describe('pose descriptions (de.poses)', () => {
  it('covers every PoseId with one or two calm sentences ≤ 180 characters', () => {
    expect(Object.keys(de.poses).sort()).toEqual([...POSE_IDS].sort());
    for (const id of POSE_IDS) {
      const text = de.poses[id];
      expect(text.length, id).toBeGreaterThan(40);
      expect(text.length, id).toBeLessThanOrEqual(180);
      expect(text.endsWith('.'), id).toBe(true);
      expect(text, id).not.toMatch(FORBIDDEN);
      expect(text, id).not.toMatch(VERDICT);
    }
  });

  it('names several body signals together: at least two of ears, tail, body, gaze, head per pose', () => {
    const signals = [/ohren/i, /rute/i, /körper|rücken|gewicht|bauch|beine|pfoten/i, /blick|augen|lider/i, /kopf|nase|mund/i];
    for (const id of POSE_IDS) {
      const hits = signals.filter((re) => re.test(de.poses[id])).length;
      expect(hits, id).toBeGreaterThanOrEqual(2);
    }
  });

  it('contrasting poses have distinct texts', () => {
    expect(new Set(Object.values(de.poses)).size).toBe(POSE_IDS.length);
    expect(de.poses.tense_idle).not.toBe(de.poses.idle_relaxed);
    expect(de.poses.turn_away).toMatch(/weg/);
    expect(de.poses.tense_idle).toMatch(/steif/);
    expect(de.poses.tired_idle).toMatch(/Kopf hängt tiefer/);
    expect(de.poses.tired_idle).toMatch(/Bewegungen sind langsam/);
    expect(de.poses.rest_loop).toMatch(/Körper liegt auf dem Boden/);
    expect(de.poses.rest_loop).toMatch(/Atmung.*langsam/);
  });

  it('poseLine prefixes the dog name', () => {
    expect(de.scene.poseLine('Nala', 'sniff')).toBe(`Nala: ${de.poses.sniff}`);
    expect(de.scene.poseLine('Bruno', 'turn_away').startsWith('Bruno: ')).toBe(true);
  });
});

describe('gesture descriptions (de.gestures)', () => {
  it('covers every GestureId, short, named, ≤ 180 characters', () => {
    expect(Object.keys(de.gestures).sort()).toEqual([...GESTURES].sort());
    for (const id of GESTURES) {
      const mira = de.gestures[id]('Mira');
      const alex = de.gestures[id]('Alex');
      expect(mira.startsWith('Mira ')).toBe(true);
      expect(alex.startsWith('Alex ')).toBe(true);
      expect(mira.length).toBeLessThanOrEqual(180);
      expect(mira.endsWith('.')).toBe(true);
      expect(mira).not.toMatch(FORBIDDEN);
    }
    expect(de.gestures.kneel('Mira')).toBe('Mira geht in die Hocke und hält die Hand tief.');
    expect(de.scene.gestureLine('Alex', 'greet')).toBe(de.gestures.greet('Alex'));
  });
});

describe('UI-only strings absorbed from src/ui/strings.ts', () => {
  it('exposes the former literals under de with unchanged wording', () => {
    expect(de.home.continueLesson).toBe('Übung fortsetzen');
    expect(de.home.visitInProgress('Hinschauen')).toBe('Besuch läuft: Hinschauen');
    expect(de.home.grow).toBe('Wachsen');
    expect(de.lesson.completedBefore).toBe('Schon besucht');
    expect(de.lesson.repeat).toBe('Wiederholen');
    expect(de.lesson.endCareTitle).toBe('Heute beenden?');
    expect(de.lesson.endCareConfirm).toBe('Als Fürsorge beenden');
    expect(de.reflection.rewardTitle).toBe('Besuch abgeschlossen');
    expect(de.reflection.rewardRowsTitle).toBe('Heute dazugekommen');
    expect(de.reflection.rowMark).toBe('Schulmarke');
    expect(de.reflection.rowMemory).toBe('Erinnerung');
    expect(de.reflection.rowLearning).toBe('Lernpunkt');
    expect(de.reflection.rowMarkNone).toBe('Heute keine Schulmarke.');
    expect(de.care.recommended).toBe('Empfohlen');
    expect(de.care.lockedDuringReaction).toBe('Gleich. Schau zuerst, wie der Hund reagiert.');
    expect(de.needs.valueOf(42.4)).toBe('42 von 100');
    expect(de.challenge.vitalityLine('impaired')).toBe('Verfassung: angeschlagen');
    expect(de.school.costLine(1)).toBe('Kosten: 1 Marke');
    expect(de.school.costLine(3)).toBe('Kosten: 3 Marken');
    expect(de.school.missingLine(2)).toBe(`${de.school.notEnough(2)} ${de.school.howToEarn}`);
    expect(de.school.preview).toBe('Vorschau');
    expect(de.settings.renameSave).toBe('Speichern');
    expect(de.settings.renamed('Kira')).toBe('Dein Hund heißt jetzt Kira.');
    expect(de.settings.data).toBe('Daten');
    expect(de.settings.version('0.1.0')).toBe('Version 0.1.0');
    expect(de.settings.on).toBe('An');
    expect(de.settings.off).toBe('Aus');
    expect(de.settings.modeCurrent('standard')).toBe('Aktiv: Entspannter Lauf.');
    expect(de.settings.archiveTitle).toBe(`${de.settings.archiveChallenge}?`);
    expect(de.settings.archives).toBe('Frühere Challenge-Läufe');
    expect(de.settings.archiveEntry('Nala', 2)).toBe(`Nala · ${de.memorial.visits(2)}`);
    expect(de.memorial.hideMemory).toBe('Erinnerung ausblenden');
    expect(de.errors.updateApply).toBe('Jetzt aktualisieren');
    expect(de.toasts.visitInProgress).toBe('Ein Besuch läuft bereits.');
    expect(de.toasts.settingsSaved).toBe('Gespeichert.');
    expect(de.toasts.challengeResumed).toBe('Challenge fortgesetzt.');
    expect(de.toasts.modeSwitched('challenge')).toBe('Challenge-Lauf aktiv.');
    expect(de.readiness.byCare('Nala', 'meal')).toBe(de.readiness.needsFood('Nala'));
    expect(de.readiness.byCare('Nala', 'play')).toBe(de.readiness.needsSettle('Nala'));
  });
});

describe('lesson provenance (de.sources)', () => {
  it('has a plain-language provenance line per lesson and the provisional status sentence', () => {
    expect(de.sources.status).toBe('Vorläufig; Buchabgleich und fachliche Prüfung offen.');
    expect(Object.keys(de.sources.byLesson).sort()).toEqual(['L01', 'L02', 'L03']);
    for (const line of Object.values(de.sources.byLesson)) {
      expect(line.length).toBeGreaterThan(20);
      expect(line).not.toMatch(/Seite \d|S\. \d/);
    }
    expect(de.sources.statusLabel('provisional')).toBe('Vorläufig');
    expect(de.sources.statusLabel('reviewed')).toBe('Geprüft');
  });
});
