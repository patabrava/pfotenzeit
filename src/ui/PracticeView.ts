/**
 * FREE PRACTICE (D-041 §7, route 'practice'): the exercise runs in the world only. HUD like the lesson
 * (same header/card/dock classes so the D-032 strip measurement applies): title + distraction tag,
 * Mira's instruction, ready/not-ready line, the attempt button (never timed), the response line,
 * Mira's hint after two attempts without a success response, "Noch einmal", "Fertig" → home.
 * Nothing is dispatched to the store except CARE / RESPOND_MOMENT from the sheets.
 * `openPracticeSheet` picks exercise + distraction and starts it on the controller.
 */
import type { DistanceBand, DistractionLevel, ExerciseKind } from '../simulation/types';
import type { PracticeExercise } from '../content/types';
import type { StoreSnapshot } from '../state/store';
import { button, createSheet, el, icon, markCounter, quote, secondary, segmented, setMarkCounter, text } from './components';
import type { UiContext, View } from './context';
import { bandButtons, getFocusPose, needsPoseLine } from './LessonView';
import { poseLine, t, tExercise, tPractice, tWorld } from './strings';
import { createView } from './view';
import { isYardActive, openYardSheet, practiceUnlocked } from './yard';

const KINDS: ExerciseKind[] = ['recall', 'find_spot', 'look_at'];
const LEVELS: DistractionLevel[] = ['none', 'toy', 'other_dog'];
const HINT_AFTER_ATTEMPTS = 2;

export function openPracticeSheet(ctx: UiContext): void {
  const world = ctx.world;
  if (!world) {
    ctx.toast(t.toasts.actionRejected);
    return;
  }
  const snapshot = ctx.store.get();
  if (!practiceUnlocked(snapshot)) {
    ctx.toast(tPractice.locked(ctx.content.lessons.L01.title));
    return;
  }
  let selected: PracticeExercise | null = null;
  let level: DistractionLevel = 'none';
  const list = el('div', { class: 'stack stack--tight' });
  const startBtn = button({ label: tPractice.start, variant: 'primary', large: true, block: true, key: 'practice-start', ariaDisabled: true, options: { onBlocked: () => ctx.toast(tPractice.choose) } }, () => {
    if (!selected) return;
    world.startPractice(selected, level);
    sheet.close();
    ctx.navigate('practice');
  });
  const renderList = (): void => {
    list.replaceChildren(
      ...KINDS.map((kind) => {
        const exercise = ctx.content.practice[kind];
        const unlocked = snapshot.save.completedLessonIds.includes(exercise.requiresLesson);
        return button(
          {
            label: exercise.title,
            sub: unlocked ? exercise.spec.instruction : tPractice.locked(ctx.content.lessons[exercise.requiresLesson].title),
            variant: 'option',
            key: `practice-${kind}`,
            ariaDisabled: !unlocked,
            class: selected?.kind === kind ? 'is-suggested' : undefined,
            attrs: { 'aria-pressed': String(selected?.kind === kind) },
            options: { onBlocked: () => ctx.toast(tPractice.locked(ctx.content.lessons[exercise.requiresLesson].title)) },
          },
          () => {
            selected = exercise;
            startBtn.setAttribute('aria-disabled', 'false');
            renderList();
          },
        );
      }),
    );
  };
  renderList();
  const levelOptions = LEVELS.map((value) => ({ value, label: tPractice.distractionLabel(value) }));
  const sheet = createSheet(ctx.modalHost, { title: tPractice.title }, [
    secondary(tPractice.intro),
    secondary(tPractice.choose),
    list,
    el('div', { class: 'setting setting--stack' }, [
      el('span', { class: 'setting-label', text: tPractice.distraction }),
      segmented(tPractice.distraction, levelOptions, level, (value) => {
        level = value;
      }, 'distraction'),
    ]),
    startBtn,
  ]);
}

export function createPracticeView(ctx: UiContext): View {
  const root = el('div', { class: 'hud hud--lesson hud--practice', dataset: { view: 'practice' } });
  const marks = markCounter(ctx.presenter.getDisplayMarks(ctx.store.get().save), t.school.marksLabel);
  let fallbackBand: DistanceBand | null = null;
  let responding = false;

  function finish(): void {
    ctx.world?.stopPractice();
    ctx.navigate('home');
  }

  function openOverflow(): void {
    const snapshot = ctx.store.get();
    const yardFallback = ctx.world !== null && !isYardActive(snapshot, ctx);
    const sheet = createSheet(ctx.modalHost, { title: t.lesson.menu }, [
      el('div', { class: 'stack stack--tight' }, [
        button({ label: t.lesson.care, variant: 'option', icon: 'bowl', key: 'overflow-care', ariaDisabled: snapshot.app.presenting, options: { onBlocked: () => ctx.toast(t.care.lockedDuringReaction) } }, () => {
          sheet.close();
          ctx.openCareSheet();
        }),
        button({ label: snapshot.save.dog.name, variant: 'option', icon: 'paw', key: 'overflow-dog' }, () => {
          sheet.close();
          ctx.openDogSheet();
        }),
        yardFallback
          ? button({ label: tWorld.zonesTitle, variant: 'option', icon: 'leaf', key: 'overflow-yard' }, () => {
              sheet.close();
              openYardSheet(ctx);
            })
          : null,
        button({ label: tPractice.leave, variant: 'option', icon: 'close', key: 'overflow-end' }, () => {
          sheet.close();
          finish();
        }),
      ]),
      secondary(t.lesson.noTimer),
    ]);
  }

  const view = createView({
    root,
    derive(snapshot) {
      const { save, app } = snapshot;
      const world = ctx.world;
      const practice = world?.getPractice() ?? null;
      const context = world?.getContext() ?? null;
      return {
        practice: practice ? { kind: practice.exercise.kind, attempts: practice.attempts, last: practice.lastResponse } : null,
        distraction: world?.getState()?.distraction ?? null,
        ready: context?.exerciseReady ?? null,
        attention: context?.attention ?? null,
        renderer: app.rendererStatus,
        reduced: app.reducedMotion,
        yardMode: app.yardMode,
        presenting: app.presenting,
        name: save.dog.name,
        marks: ctx.presenter.getDisplayMarks(save),
        fallbackBand,
        responding,
      };
    },
    render(snapshot) {
      const { save, app } = snapshot;
      const world = ctx.world;
      const practice = world?.getPractice() ?? null;
      const context = world?.getContext() ?? null;
      const yardActive = isYardActive(snapshot, ctx);
      const distraction = practice?.distraction ?? world?.getState()?.distraction ?? 'none';

      const header = el('div', { class: 'lesson-header' }, [
        el('div', { class: 'lesson-head-main' }, [
          el('strong', { class: 'lesson-point', text: practice ? practice.exercise.title : tPractice.title }),
          practice ? el('span', { class: 'tag', text: tPractice.distractionLabel(distraction) }) : null,
        ]),
        marks,
      ]);

      const focus = needsPoseLine(snapshot) ? getFocusPose(snapshot, ctx) : null;
      const cardChildren: Array<HTMLElement | null> = [
        focus ? el('p', { class: 'pose-line' }, [icon('eye', 'pose-line-icon'), el('span', { text: poseLine(focus.name, focus.pose) })]) : null,
      ];
      const dockMain: HTMLElement[] = [];

      if (!practice) {
        cardChildren.push(el('h2', { class: 'card-title', text: tPractice.title }), text(tPractice.choose));
        dockMain.push(button({ label: tPractice.choose, variant: 'primary', large: true, block: true, key: 'practice-choose' }, () => ctx.openPracticeSheet()));
        dockMain.push(button({ label: tPractice.done, variant: 'secondary', block: true, key: 'practice-done' }, finish));
      } else {
        const spec = practice.exercise.spec;
        const ready = Boolean(context?.exerciseReady) && !responding;
        const last = practice.lastResponse;
        const success = last !== null && practice.exercise.successResponses.includes(last);
        cardChildren.push(quote(t.lesson.miraSays, spec.instruction));
        if (responding) {
          cardChildren.push(el('p', { class: 'status-line', attrs: { role: 'status' } }, [icon('eye', 'status-line-icon'), el('span', { text: tExercise.watching })]));
        } else if (last !== null) {
          cardChildren.push(text(spec.responseText[last] ?? '', 'observation-text'));
          cardChildren.push(secondary(success ? tPractice.success : tPractice.notYet));
        } else {
          cardChildren.push(
            el('p', { class: `status-line${ready ? ' status-line--ready' : ''}`, attrs: { role: 'status' } }, [
              icon(ready ? 'check' : 'eye', 'status-line-icon'),
              el('span', { text: ready ? tExercise.ready : spec.notReadyHint }),
            ]),
          );
        }
        if (practice.attempts >= HINT_AFTER_ATTEMPTS && !success) cardChildren.push(quote(tPractice.hintTitle, practice.exercise.hint));
        if (world && !yardActive && !responding) {
          cardChildren.push(
            bandButtons(ctx, spec.fallbackBands, fallbackBand, (band) => {
              fallbackBand = band;
              view.update(ctx.store.get());
            }),
          );
        }

        if (last === null || responding) {
          dockMain.push(
            button(
              {
                label: spec.readyLabel,
                variant: 'primary',
                large: true,
                block: true,
                key: 'attempt',
                ariaDisabled: !ready || app.presenting,
                options: { onBlocked: () => ctx.toast(responding ? t.care.lockedDuringReaction : spec.notReadyHint) },
              },
              () => {
                const response = world?.practiceAttempt() ?? null;
                if (response === null) {
                  ctx.toast(spec.notReadyHint);
                  return;
                }
                responding = true;
                view.update(ctx.store.get());
              },
            ),
          );
        } else {
          dockMain.push(
            el('div', { class: 'dock-row dock-row--two' }, [
              button({ label: tPractice.again, variant: 'primary', large: true, key: 'practice-again' }, () => {
                world?.practiceAgain();
                fallbackBand = null;
                view.update(ctx.store.get());
              }),
              button({ label: tPractice.done, variant: 'primary', large: true, icon: 'check', key: 'practice-done' }, finish),
            ]),
          );
        }
      }

      const menu = button({ label: t.lesson.menu, variant: 'secondary', icon: 'more', iconOnly: true, key: 'more', ariaLabel: t.lesson.menu }, openOverflow);
      const card = el('div', { class: 'card card--dialog', dataset: { scrollKey: 'practice-card' }, attrs: { 'aria-live': 'polite' } }, cardChildren);
      const dock = el('div', { class: 'dock dock--lesson dock--with-menu', dataset: { scrollKey: 'practice-dock' } }, [el('div', { class: 'dock-main' }, dockMain), menu]);
      return [header, el('div', { class: 'hud-middle' }, [card]), dock];
    },
    afterRender(snapshot) {
      setMarkCounter(marks, ctx.presenter.getDisplayMarks(snapshot.save), t.school.marksLabel);
    },
    destroy() {
      unsubscribeWorld?.();
      unsubscribeEvents?.();
    },
  });
  const unsubscribeWorld = ctx.world?.onChange(() => view.update(ctx.store.get()));
  const unsubscribeEvents = ctx.world?.onEvent((event) => {
    if (event.type === 'responseShown') {
      responding = false;
      view.update(ctx.store.get());
    }
  });
  return view;
}
