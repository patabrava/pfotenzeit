import { describe, expect, it } from 'vitest';
import { content, LESSON_ORDER } from '../../src/content';
import type { LessonDefinition, LessonOption } from '../../src/content/types';
import { POSE_IDS } from '../../src/simulation/types';
import type { EnvironmentId, GestureId, PropId } from '../../src/simulation/types';

const ENVIRONMENTS: EnvironmentId[] = ['courtyard', 'courtyard_loud', 'rest_place', 'sniff_corner'];
const PROPS: PropId[] = ['bowl', 'water', 'blanket', 'ball', 'toy_rolling', 'leaf', 'rest_place', 'sniff_corner'];
const GESTURES: GestureId[] = ['idle', 'greet', 'gesture_explain', 'offer_reward', 'kneel'];
const FORBIDDEN = /falsch|fehler/i;

const lessons: LessonDefinition[] = LESSON_ORDER.map((id) => content.lessons[id]);
const allOptions = (lesson: LessonDefinition): LessonOption[] => lesson.rounds.flatMap((r) => r.options);

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

describe('lesson structure', () => {
  it('has the three MVP lessons in order with matching ids', () => {
    expect(LESSON_ORDER).toEqual(['L01', 'L02', 'L03']);
    for (const lesson of lessons) expect(content.lessons[lesson.id].id).toBe(lesson.id);
  });

  it.each(lessons)('$id has 3 rounds with distinct round and scenario ids', (lesson) => {
    expect(lesson.rounds).toHaveLength(3);
    expect(new Set(lesson.rounds.map((r) => r.id)).size).toBe(3);
    expect(new Set(lesson.rounds.map((r) => r.scenarioId)).size).toBe(3);
  });

  it.each(lessons)('$id rounds have 2–3 options with unique ids and at least one helpful option', (lesson) => {
    const ids = new Set<string>();
    for (const round of lesson.rounds) {
      expect(round.options.length).toBeGreaterThanOrEqual(2);
      expect(round.options.length).toBeLessThanOrEqual(3);
      expect(round.options.some((o) => o.helpful)).toBe(true);
      for (const o of round.options) {
        expect(ids.has(o.id)).toBe(false);
        ids.add(o.id);
      }
    }
  });

  it.each(lessons)('$id has countsForLearning options in at least 2 distinct scenarios', (lesson) => {
    const scenarios = new Set(
      lesson.rounds.filter((r) => r.options.some((o) => o.helpful && o.countsForLearning)).map((r) => r.scenarioId),
    );
    expect(scenarios.size).toBeGreaterThanOrEqual(2);
  });

  it.each(lessons)('$id only counts helpful options for learning', (lesson) => {
    for (const o of allOptions(lesson)) if (o.countsForLearning) expect(o.helpful).toBe(true);
  });

  it.each(lessons)('$id poses, gestures, environments and props are valid ids', (lesson) => {
    for (const round of lesson.rounds) {
      expect(POSE_IDS).toContain(round.observationPose);
      expect(GESTURES).toContain(round.humanGesture);
      expect(ENVIRONMENTS).toContain(round.environment);
      for (const p of round.props) expect(PROPS).toContain(p);
      for (const o of round.options) {
        expect(POSE_IDS).toContain(o.poseAfter);
        if (o.humanGesture) expect(GESTURES).toContain(o.humanGesture);
      }
    }
  });

  it.each(lessons)('$id every option has feedback, labels ≤ 32 chars, and non-helpful options never advance', (lesson) => {
    for (const o of allOptions(lesson)) {
      expect(o.feedback.trim().length).toBeGreaterThan(0);
      expect(o.label.length).toBeLessThanOrEqual(32);
      if (!o.helpful) expect(o.next).toBe('supportedRetry');
    }
  });

  it.each(lessons)('$id has an everyday sentence on at least one option and all reflection texts', (lesson) => {
    expect(allOptions(lesson).some((o) => (o.everyday ?? '').length > 0)).toBe(true);
    expect(lesson.intro.length).toBeGreaterThan(0);
    expect(lesson.transferText.length).toBeGreaterThan(0);
    expect(lesson.everydayText.length).toBeGreaterThan(0);
    expect(lesson.practiceText.length).toBeGreaterThan(0);
    for (const round of lesson.rounds) {
      expect(round.observationText.length).toBeGreaterThan(0);
      expect(round.observationDescription.length).toBeGreaterThan(0);
      expect(round.supportHint.length).toBeGreaterThan(0);
      for (const v of round.variants ?? []) {
        expect(v.observationText.length).toBeGreaterThan(0);
        expect(v.observationDescription.length).toBeGreaterThan(0);
      }
    }
  });

  it('is provisional with sources per 03', () => {
    for (const lesson of lessons) {
      expect(lesson.sourceStatus).toBe('provisional');
      expect(lesson.sourceIds.length).toBeGreaterThan(0);
    }
  });

  it('never uses blame vocabulary in any content text', () => {
    const texts = collectStrings({
      lessons: content.lessons,
      memories: content.memories,
      learningPoints: content.learningPoints,
      upgrades: content.upgrades,
    });
    expect(texts.length).toBeGreaterThan(50);
    for (const t of texts) expect(t).not.toMatch(FORBIDDEN);
  });
});

describe('lesson scripts from 03', () => {
  const L01 = content.lessons.L01;
  const L02 = content.lessons.L02;
  const L03 = content.lessons.L03;
  const option = (lesson: LessonDefinition, roundIndex: number, label: string): LessonOption => {
    const round = lesson.rounds[roundIndex];
    const found = round?.options.find((o) => o.label === label);
    if (!found) throw new Error(`${lesson.id} round ${roundIndex}: option "${label}" missing`);
    return found;
  };

  it('L01: observing is helpful but does not count; distance and pause count; C closes with care', () => {
    const observe = option(L01, 0, 'Ruhig beobachten');
    expect(observe.helpful).toBe(true);
    expect(observe.countsForLearning).toBe(false);
    expect(observe.feedback).toContain('Du gibst Nala Zeit, die Situation selbst zu erkunden.');
    expect(option(L01, 0, 'Sofort näher herangehen').next).toBe('supportedRetry');

    const distance = option(L01, 1, 'Mehr Abstand');
    expect(distance.countsForLearning).toBe(true);
    expect(distance.feedback).toContain('Mehrere Hinweise sprechen dafür, die Situation leichter zu machen.');
    expect(L01.rounds[1]?.dogId).toBe('dog_bruno');
    expect(L01.rounds[1]?.environment).toBe('courtyard_loud');

    const pause = option(L01, 2, 'Pause anbieten');
    expect(pause.countsForLearning).toBe(true);
    expect(pause.next).toBe('careClosure');
    expect(pause.feedback).toContain('Aufhören kann heute die beste Trainingsentscheidung sein.');
    expect(option(L01, 2, 'Noch eine Runde').next).toBe('supportedRetry');
    expect(L01.transferText).toBe('Betrachte den ganzen Hund und die Umgebung. Ein einzelnes Zeichen erklärt nicht alles.');
  });

  it('L02: wait triggers the look, reward counts, distance simplifies the toy round', () => {
    const wait = option(L02, 0, 'Warten und beobachten');
    expect(wait.countsForLearning).toBe(true);
    expect(wait.poseAfter).toBe('look_at_handler');
    const call = option(L02, 0, 'Mehrmals rufen');
    expect(call.next).toBe('supportedRetry');
    expect(call.feedback).toContain('Das Signal ist hier noch nicht aufgebaut. Mach die Situation verständlicher.');

    const reward = option(L02, 1, 'Diesen Blick belohnen');
    expect(reward.humanGesture).toBe('offer_reward');
    expect(reward.feedback).toContain('Du machst die freiwillige Orientierung lohnend.');
    const keepWaiting = option(L02, 1, 'Weiter warten');
    expect(keepWaiting.helpful).toBe(false);
    expect(keepWaiting.feedback).toContain('Du kannst den kurzen Blick bereits belohnen.');

    expect(L02.rounds[2]?.contextBefore.arousal).toBe(75);
    expect(L02.rounds[2]?.props).toContain('ball');
    const distance = option(L02, 2, 'Abstand zum Spielzeug vergrößern');
    expect(distance.contextAfter).toEqual({ arousal: 35, difficulty: 'easy' });
    expect(option(L02, 2, 'Signal wiederholen').next).toBe('supportedRetry');
    expect(L02.transferText).toBe('Übe zuerst in einer Situation, in der dein Hund sich gut orientieren kann.');
  });

  it('L03: rest is a real care effect, Bruno stress relief, closing counts as care closure', () => {
    expect(L03.rounds[0]?.contextBefore.energyShown).toBe(34);
    expect(L03.rounds[0]?.props).toEqual(expect.arrayContaining(['rest_place', 'blanket']));
    const rest = option(L03, 0, 'Ruheplatz anbieten');
    expect(rest.careEffect).toBe('rest');
    expect(rest.poseAfter).toBe('rest_loop');
    expect(rest.feedback).toContain('Du berücksichtigst, was Nala jetzt braucht.');
    expect(option(L03, 0, 'Neue Aufgabe beginnen').careEffect).toBeUndefined();

    expect(L03.rounds[1]?.contextBefore.stress).toBe(65);
    expect(L03.rounds[1]?.environment).toBe('courtyard_loud');
    const relieve = option(L03, 1, 'Reiz entfernen und Abstand geben');
    expect(relieve.contextAfter).toEqual({ stress: 30 });
    expect(relieve.poseAfter).toBe('recover');
    expect(option(L03, 1, 'Zum Reiz locken').feedback).toContain('Heute ist der Schritt zu groß. Mehr Abstand hilft.');

    const close = option(L03, 2, 'Heute abschließen');
    expect(close.next).toBe('careClosure');
    expect(close.countsForLearning).toBe(true);
    const wake = option(L03, 2, 'Für noch eine Übung aufwecken');
    expect(wake.helpful).toBe(false);
    expect(wake.next).toBe('supportedRetry');
    expect(wake.poseAfter).toBe('rest_loop');
    expect(L03.transferText).toBe('Ruhe und eine passende Schwierigkeit gehören zum Lernen.');
  });

  it('has seeded variants for L01 A, L02 A and L03 C', () => {
    for (const round of [L01.rounds[0], L02.rounds[0], L03.rounds[2]]) {
      expect(round?.variants?.length).toBeGreaterThanOrEqual(2);
      expect(new Set(round?.variants?.map((v) => v.id)).size).toBe(round?.variants?.length);
    }
  });
});
