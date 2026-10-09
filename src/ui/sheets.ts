/**
 * Bottom sheets shared by home and lesson: care ("Versorgen") and the lesson picker.
 * Both re-render their body while open so they follow the store.
 */
import { READINESS } from '../simulation/defaults';
import { getCareSuggestion, getReadiness, isLearned, isTrainingLocked } from '../simulation/selectors';
import type { CareKind, DogState, LessonId, RejectReason } from '../simulation/types';
import type { StoreSnapshot } from '../state/store';
import { button, createSheet, el, replaceChildren, secondary, text, type IconName } from './components';
import type { UiContext } from './context';
import { t } from './strings';

const CARE_ICONS: Record<CareKind, IconName> = { meal: 'bowl', rest: 'rest', play: 'toy', calm: 'calm' };

/** D-003: "Abstand geben" replaces calm play when the dog is stressed or highly aroused. */
export function preferredPlayKind(dog: DogState): CareKind {
  return dog.stress > READINESS.highStress || dog.arousal > READINESS.highArousal ? 'calm' : 'play';
}

export function careKindsFor(dog: DogState): CareKind[] {
  return ['meal', 'rest', preferredPlayKind(dog)];
}

export function rejectionText(reason: RejectReason | undefined, name: string): string {
  switch (reason) {
    case 'needs_care':
      return t.toasts.lessonNeedsCare;
    case 'training_locked':
      return t.toasts.lessonLocked;
    case 'challenge_paused':
      return t.toasts.challengePaused;
    case 'visit_in_progress':
      return t.toasts.visitInProgress;
    case 'wrong_phase':
      return t.care.lockedDuringReaction;
    case 'invalid_name':
      return t.settings.renameInvalid;
    case 'dog_lost':
      return t.memorial.text;
    default:
      void name;
      return t.toasts.actionRejected;
  }
}

/** Care action buttons (used by the care sheet and the profile care tab). */
export function careButtons(
  ctx: UiContext,
  snapshot: StoreSnapshot,
  onApplied?: (kind: CareKind) => void,
  layoutClass = 'care-grid',
): HTMLElement {
  const { save, app } = snapshot;
  const dog = save.dog;
  const suggestion = getCareSuggestion(dog);
  const locked = app.presenting || save.currentVisit?.phase === 'react';
  const grid = el('div', { class: layoutClass });
  for (const kind of careKindsFor(dog)) {
    const suggested = suggestion === kind;
    const btn = button(
      {
        label: t.care.label(kind),
        sub: suggested ? t.care.recommended : t.care.hint(kind),
        variant: 'option',
        icon: CARE_ICONS[kind],
        class: suggested ? 'is-suggested' : undefined,
        key: `care-${kind}`,
        ariaDisabled: locked,
        options: { onBlocked: () => ctx.toast(t.care.lockedDuringReaction) },
      },
      async () => {
        const result = await ctx.store.act('CARE', { kind });
        if (result.outcome === 'applied') {
          ctx.announce(t.care.presenting(dog.name, kind));
          onApplied?.(kind);
        } else if (result.outcome === 'rejected') {
          ctx.toast(rejectionText(result.reason, dog.name));
        }
      },
    );
    grid.append(btn);
  }
  return grid;
}

export function openCareSheet(ctx: UiContext): void {
  const body = el('div', { class: 'stack' });
  const sheet = createSheet(ctx.modalHost, { title: t.care.title }, [body]);
  const render = (snapshot: StoreSnapshot): void => {
    const { save } = snapshot;
    const { readiness, suggestion } = getReadiness(save);
    const lines: HTMLElement[] = [];
    if (readiness === 'needs_care' && suggestion) lines.push(text(t.home.needsCare(save.dog.name, suggestion), 'text-lead'));
    if (isTrainingLocked(save)) lines.push(secondary(t.band.criticalFree));
    replaceChildren(body, [...lines, careButtons(ctx, snapshot, () => sheet.close(), 'stack stack--tight'), secondary(t.care.waterNote)]);
  };
  render(ctx.store.get());
  const unsubscribe = ctx.store.subscribe((snapshot, change) => {
    if (!sheet.isOpen()) return;
    if (change === 'save') render(snapshot);
  });
  const originalClose = sheet.close;
  sheet.close = () => {
    unsubscribe();
    originalClose();
  };
}

export function openLessonPicker(ctx: UiContext): void {
  const body = el('div', { class: 'stack' });
  const sheet = createSheet(ctx.modalHost, { title: t.home.lessonPickerTitle }, [secondary(t.home.lessonPickerHint), body]);
  const render = (snapshot: StoreSnapshot): void => {
    const { save } = snapshot;
    const lessons = (Object.keys(ctx.content.lessons) as LessonId[]).sort().map((id) => ctx.content.lessons[id]);
    const cards = lessons.map((lesson) => {
      const learned = isLearned(save, lesson.learningPointId);
      const completed = save.completedLessonIds.includes(lesson.id);
      const meta = el('div', { class: 'lesson-card-meta' }, [
        el('span', { class: 'badge', text: `${t.lesson.learningPoint}: ${lesson.learningPointLabel}` }),
        el('span', { class: `badge ${learned ? 'badge--ok' : ''}`, text: learned ? t.home.learned : t.home.practising }),
        completed ? el('span', { class: 'badge badge--gold', text: t.home.completedBefore }) : null,
      ]);
      const start = button(
        { label: completed ? t.home.repeat : t.home.start, variant: 'primary', block: true, key: `lesson-${lesson.id}` },
        async () => {
          const result = await ctx.store.act('START_VISIT', {
            lessonId: lesson.id,
            visitId: ctx.store.providers.id('visit'),
            seed: ctx.store.providers.seed(),
          });
          if (result.outcome === 'applied') {
            sheet.close();
            ctx.navigate('lesson');
          } else if (result.outcome === 'rejected') {
            ctx.toast(rejectionText(result.reason, save.dog.name));
            if (result.reason === 'needs_care') {
              sheet.close();
              ctx.openCareSheet();
            }
          }
        },
      );
      return el('article', { class: 'lesson-card', attrs: { 'aria-labelledby': `lesson-title-${lesson.id}` } }, [
        el('h3', { id: `lesson-title-${lesson.id}`, text: lesson.title }),
        secondary(lesson.subtitle),
        meta,
        start,
      ]);
    });
    replaceChildren(body, cards);
  };
  render(ctx.store.get());
  const unsubscribe = ctx.store.subscribe((snapshot, change) => {
    if (!sheet.isOpen()) return;
    if (change === 'save') render(snapshot);
  });
  const originalClose = sheet.close;
  sheet.close = () => {
    unsubscribe();
    originalClose();
  };
}
