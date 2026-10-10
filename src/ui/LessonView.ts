/**
 * LESSON / TRAINING (05, F8): slim header (learning point · round counter · tags · mark counter),
 * scene strip measured by the shell between header and card (D-032), one calm observation card,
 * options in wood tones with the menu as an icon button at the dock's right edge, locked react state,
 * feedback with symbol + text and Mira as a quoted line. Under reduced motion or without a ready
 * renderer a one-line pose description sits at the top of the card so body language stays readable.
 *
 * D-041 exercise rounds (round.exercise): observe shows Mira's instruction, a ready/not-ready line and
 * the attempt button (enabled only while the world reports exerciseReady — never a timer); without the
 * walkable yard three distance-band buttons put the handler at a spot. The attempt dispatches
 * EXERCISE_ATTEMPT with the world's context; phase 'exercise' is locked while the dog responds; decide
 * shows the options the selector filtered by forResponses; 'retry' returns to observe ("Versuch 2 von 3").
 * No domain logic: phase, options, attempts and poses come from selectors.
 */
import {
  getAttemptCount,
  getAvailableClosures,
  getCurrentOptions,
  getCurrentRound,
  getCurrentRoundRef,
  getLastAttempt,
  getLastOption,
  getObservation,
  getReadiness,
  getSceneDirective,
} from '../simulation/selectors';
import type { DistanceBand, PoseId } from '../simulation/types';
import type { StoreSnapshot } from '../state/store';
import {
  button,
  collapsible,
  confirmDialog,
  createSheet,
  decisionMark,
  el,
  icon,
  markCounter,
  quote,
  secondary,
  setMarkCounter,
  text,
} from './components';
import type { UiContext, View } from './context';
import { rejectionText } from './sheets';
import { poseLine, t, tExercise, tWorld } from './strings';
import { createView } from './view';
import { isYardActive, openYardSheet } from './yard';

const BANDS: DistanceBand[] = ['near', 'mid', 'far'];

/** Pose of the dog the camera frames, from the same directive the renderer receives. */
export function getFocusPose(snapshot: StoreSnapshot, ctx: UiContext): { name: string; pose: PoseId } | null {
  const directive = getSceneDirective(snapshot.save, ctx.content, { route: snapshot.app.route, yardMode: snapshot.app.yardMode });
  const focus = directive.dogs.find((dog) => dog.id === directive.focusDogId) ?? directive.dogs[0];
  return focus ? { name: focus.name, pose: focus.pose } : null;
}

/** True when the picture alone cannot carry the body language (handoff §4B). */
export function needsPoseLine(snapshot: StoreSnapshot): boolean {
  return snapshot.app.reducedMotion || snapshot.app.rendererStatus !== 'ready';
}

/** Fallback distance chooser (no walkable yard): three band buttons that move the handler. */
export function bandButtons(
  ctx: UiContext,
  labels: { near: string; mid: string; far: string },
  selected: DistanceBand | null,
  onSelect: (band: DistanceBand) => void,
): HTMLElement {
  return el('div', { class: 'band-row', attrs: { role: 'group', 'aria-label': tExercise.bandTitle } }, [
    el('span', { class: 'text-secondary band-title', text: tExercise.bandTitle }),
    el(
      'div',
      { class: 'dock-row dock-row--three' },
      BANDS.map((band) =>
        button(
          { label: labels[band], variant: 'option', key: `band-${band}`, attrs: { 'aria-pressed': String(selected === band) }, class: selected === band ? 'is-suggested' : undefined },
          () => {
            ctx.world?.send({ type: 'setBand', band });
            onSelect(band);
          },
        ),
      ),
    ),
  ]);
}

export function createLessonView(ctx: UiContext): View {
  const root = el('div', { class: 'hud hud--lesson', dataset: { view: 'lesson' } });
  const marks = markCounter(ctx.presenter.getDisplayMarks(ctx.store.get().save), t.school.marksLabel);
  let lastPhaseKey = '';
  let fallbackBand: DistanceBand | null = null;

  async function endToday(snapshot: StoreSnapshot): Promise<void> {
    const { save } = snapshot;
    const closures = getAvailableClosures(save, ctx.content);
    if (closures.careClosure) {
      const confirmed = await confirmDialog(ctx.modalHost, {
        title: t.lesson.endCareTitle,
        text: t.lesson.endCareText,
        confirmLabel: t.lesson.endCareConfirm,
      });
      if (!confirmed) return;
      const result = await ctx.store.act('COMPLETE_VISIT', { closure: 'careClosure' });
      if (result.outcome === 'applied') {
        ctx.navigate('home');
        return;
      }
      if (result.outcome === 'rejected' && result.reason !== 'not_meaningful') {
        ctx.toast(rejectionText(result.reason, save.dog.name));
        return;
      }
    }
    const abandon = await confirmDialog(ctx.modalHost, {
      title: t.lesson.endAbandonTitle,
      text: t.lesson.endAbandonText,
      confirmLabel: t.lesson.endAbandonConfirm,
      confirmVariant: 'secondary',
    });
    if (!abandon) return;
    const result = await ctx.store.act('ABANDON_VISIT', {});
    if (result.outcome === 'applied') ctx.navigate('home');
    else if (result.outcome === 'rejected') ctx.toast(rejectionText(result.reason, save.dog.name));
  }

  function openOverflow(snapshot: StoreSnapshot): void {
    const { save, app } = snapshot;
    const phase = save.currentVisit?.phase;
    const round = getCurrentRound(save, ctx.content);
    const yardFallback = ctx.world !== null && Boolean(round?.exercise) && !isYardActive(snapshot, ctx);
    const sheet = createSheet(ctx.modalHost, { title: t.lesson.menu }, [
      el('div', { class: 'stack stack--tight' }, [
        button(
          {
            label: t.lesson.care,
            variant: 'option',
            icon: 'bowl',
            key: 'overflow-care',
            ariaDisabled: phase === 'react' || phase === 'exercise' || app.presenting,
            options: { onBlocked: () => ctx.toast(t.care.lockedDuringReaction) },
          },
          () => {
            sheet.close();
            ctx.openCareSheet();
          },
        ),
        yardFallback
          ? button({ label: tWorld.zonesTitle, variant: 'option', icon: 'leaf', key: 'overflow-yard' }, () => {
              sheet.close();
              openYardSheet(ctx);
            })
          : null,
        button({ label: app.hintOpen ? t.lesson.hideDescription : t.lesson.describe, variant: 'option', icon: 'eye', key: 'overflow-describe' }, () => {
          ctx.store.patchApp({ hintOpen: !ctx.store.get().app.hintOpen });
          sheet.close();
        }),
        button({ label: round?.exercise ? tExercise.endExercise : t.lesson.endToday, variant: 'option', icon: 'close', key: 'overflow-end' }, () => {
          sheet.close();
          void endToday(ctx.store.get());
        }),
      ]),
      secondary(t.lesson.noTimer),
    ]);
  }

  const view = createView({
    root,
    derive(snapshot) {
      const { save, app } = snapshot;
      const visit = save.currentVisit;
      return {
        visit: visit
          ? {
              id: visit.id,
              lessonId: visit.lessonId,
              phase: visit.phase,
              index: visit.index,
              queue: visit.queue,
              lastOptionId: visit.lastOptionId,
              decisions: visit.decisions.length,
              attempts: visit.attempts.length,
            }
          : null,
        hintOpen: app.hintOpen,
        everydayOpen: app.everydayOpen,
        observationText: save.settings.observationTextEnabled,
        renderer: app.rendererStatus,
        reduced: app.reducedMotion,
        yardMode: app.yardMode,
        presenting: app.presenting,
        readiness: getReadiness(save).readiness,
        name: save.dog.name,
        marks: ctx.presenter.getDisplayMarks(save),
        exerciseReady: ctx.world?.getContext()?.exerciseReady ?? null,
        attention: ctx.world?.getContext()?.attention ?? null,
        fallbackBand,
      };
    },
    render(snapshot) {
      const { save, app } = snapshot;
      const visit = save.currentVisit;
      if (!visit) return [];
      const lesson = ctx.content.lessons[visit.lessonId];
      const ref = getCurrentRoundRef(visit);
      const round = getCurrentRound(save, ctx.content);
      const observation = getObservation(save, ctx.content);
      const lastOption = getLastOption(save, ctx.content);
      const name = save.dog.name;
      const rendererUnavailable = app.rendererStatus === 'failed' || app.rendererStatus === 'contextLost';
      const total = visit.queue.length;
      const current = Math.min(visit.index + 1, total);
      const exercise = round?.exercise ?? null;
      const attempts = getAttemptCount(save, ctx.content);
      const yardActive = isYardActive(snapshot, ctx);

      // --- header: one slim line
      const header = el('div', { class: 'lesson-header' }, [
        el('div', { class: 'lesson-head-main' }, [
          el('strong', { class: 'lesson-point', text: lesson.learningPointLabel, attrs: { title: `${t.lesson.learningPoint}: ${lesson.learningPointLabel}` } }),
          el('span', { class: 'lesson-round', text: t.lesson.round(current, total) }),
          ref?.supported ? el('span', { class: 'tag', text: t.lesson.supportedReplay }) : null,
          ref?.inserted ? el('span', { class: 'tag', text: t.lesson.insertedReplay }) : null,
          exercise && attempts && attempts.used > 0 && (visit.phase === 'observe' || visit.phase === 'exercise' || visit.phase === 'decide')
            ? el('span', { class: 'tag tag--attempt', text: tExercise.attemptOf(Math.min(attempts.used + (visit.phase === 'observe' ? 1 : 0), attempts.max), attempts.max) })
            : null,
        ]),
        marks,
      ]);

      // --- pose line (reduced motion / renderer not ready)
      const focus = needsPoseLine(snapshot) ? getFocusPose(snapshot, ctx) : null;
      const poseEl = focus
        ? el('p', { class: 'pose-line' }, [icon('eye', 'pose-line-icon'), el('span', { text: poseLine(focus.name, focus.pose) })])
        : null;

      // --- card + dock by phase
      const cardChildren: Array<HTMLElement | null> = [poseEl];
      const dockMain: HTMLElement[] = [];
      let menu: HTMLElement | null = button(
        { label: t.lesson.menu, variant: 'secondary', icon: 'more', iconOnly: true, key: 'more', ariaLabel: t.lesson.menu },
        () => openOverflow(ctx.store.get()),
      );

      const nextRound = async (): Promise<void> => {
        const result = await ctx.store.act('NEXT_ROUND', {});
        if (result.outcome === 'rejected') ctx.toast(rejectionText(result.reason, name));
      };
      const toggleDescription = (): void => ctx.store.patchApp({ hintOpen: !ctx.store.get().app.hintOpen });

      switch (visit.phase) {
        case 'prepare': {
          cardChildren.push(quote(t.lesson.miraSays, lesson.intro), secondary(lesson.subtitle));
          dockMain.push(button({ label: t.lesson.start, variant: 'primary', large: true, block: true, key: 'next' }, nextRound));
          break;
        }
        case 'observe':
        case 'decide': {
          const forced = visit.phase === 'observe' && (save.settings.observationTextEnabled || rendererUnavailable);
          const showDescription = forced || app.hintOpen;
          if (round) cardChildren.push(el('h2', { class: 'card-title', text: round.title }));

          if (exercise && visit.phase === 'observe') {
            // --- D-041 playable round: instruction + readiness in the card, the attempt in the dock
            const world = ctx.world;
            const ready = Boolean(world && world.getContext()?.exerciseReady);
            cardChildren.push(quote(t.lesson.miraSays, exercise.instruction));
            cardChildren.push(
              el('p', { class: `status-line${ready ? ' status-line--ready' : ''}`, attrs: { role: 'status' } }, [
                icon(ready ? 'check' : 'eye', 'status-line-icon'),
                el('span', { text: ready ? tExercise.ready : exercise.notReadyHint }),
              ]),
            );
            if (world && !yardActive) {
              cardChildren.push(
                bandButtons(ctx, exercise.fallbackBands, fallbackBand, (band) => {
                  fallbackBand = band;
                  view.update(ctx.store.get());
                }),
              );
            }
            if (ref?.supported && round) {
              cardChildren.push(el('div', { class: 'describe-body describe-body--support' }, [el('strong', { text: `${t.lesson.supportedReplay}: ` }), round.supportHint]));
            }
            dockMain.push(
              button(
                {
                  label: exercise.readyLabel,
                  variant: 'primary',
                  large: true,
                  block: true,
                  key: 'attempt',
                  ariaDisabled: !ready || app.presenting,
                  options: { onBlocked: () => ctx.toast(app.presenting ? t.care.lockedDuringReaction : exercise.notReadyHint) },
                },
                async () => {
                  const liveContext = ctx.world?.exerciseContext() ?? null;
                  if (!liveContext) {
                    ctx.toast(exercise.notReadyHint);
                    return;
                  }
                  const result = await ctx.store.act('EXERCISE_ATTEMPT', { attemptId: ctx.store.providers.id('attempt'), context: liveContext });
                  if (result.outcome === 'rejected') {
                    ctx.toast(result.reason === 'exercise_not_ready' ? exercise.notReadyHint : result.reason === 'attempt_limit' ? tExercise.noMoreAttempts : rejectionText(result.reason, name));
                  }
                },
              ),
            );
            break;
          }

          if (observation) cardChildren.push(text(observation.text, 'observation-text'));
          if (ref?.supported && round) {
            cardChildren.push(el('div', { class: 'describe-body describe-body--support' }, [el('strong', { text: `${t.lesson.supportedReplay}: ` }), round.supportHint]));
          }
          if (ref?.inserted) cardChildren.push(secondary(t.lesson.insertedHint));
          if (observation && !forced && visit.phase === 'observe') {
            cardChildren.push(
              button(
                {
                  label: showDescription ? t.lesson.hideDescription : t.lesson.lookCloser,
                  variant: 'text',
                  icon: 'eye',
                  key: 'look-closer',
                  attrs: { 'aria-expanded': String(showDescription), 'aria-controls': 'observation-description' },
                },
                toggleDescription,
              ),
            );
          }
          if (observation && showDescription) {
            // Forced (setting / no renderer): no toggle button, so a small caption names the block.
            cardChildren.push(
              el('div', { class: 'describe-body', id: 'observation-description' }, [
                forced ? el('span', { class: 'describe-label text-secondary', text: t.lesson.describe }) : null,
                text(observation.description),
              ]),
            );
          }
          if (rendererUnavailable && visit.phase === 'observe') cardChildren.push(secondary(t.lesson.textViewNote));

          if (visit.phase === 'observe') {
            dockMain.push(button({ label: t.lesson.next, variant: 'primary', large: true, block: true, key: 'next' }, nextRound));
          } else {
            // decide: the selector already filters exercise options by the last response (forResponses).
            const lastAttempt = exercise ? getLastAttempt(save) : null;
            const responseLine = exercise && lastAttempt ? exercise.responseText[lastAttempt.response] : null;
            if (responseLine) cardChildren.push(text(responseLine, 'observation-text'));
            for (const option of getCurrentOptions(save, ctx.content)) {
              dockMain.push(
                button(
                  {
                    label: option.label,
                    variant: 'option',
                    key: `option-${option.id}`,
                    ariaDisabled: app.presenting,
                    options: { onBlocked: () => ctx.toast(t.care.lockedDuringReaction) },
                  },
                  async () => {
                    const result = await ctx.store.act('SELECT_OPTION', { optionId: option.id });
                    if (result.outcome === 'rejected') ctx.toast(rejectionText(result.reason, name));
                  },
                ),
              );
            }
          }
          break;
        }
        case 'exercise': {
          // D-041: the dog responds to the attempt; everything stays locked until the presenter ACKs.
          const lastAttempt = getLastAttempt(save);
          const responseLine = exercise && lastAttempt ? exercise.responseText[lastAttempt.response] : null;
          cardChildren.push(text(tExercise.watching, 'observation-text'));
          if (responseLine) cardChildren.push(secondary(responseLine));
          dockMain.push(
            button(
              { label: t.lesson.next, variant: 'primary', large: true, block: true, key: 'next', ariaDisabled: true, options: { onBlocked: () => ctx.toast(t.care.lockedDuringReaction) } },
              () => undefined,
            ),
          );
          menu = null;
          break;
        }
        case 'react':
        case 'reflect': {
          cardChildren.push(text(t.lesson.reacting, 'observation-text'));
          if (lastOption) cardChildren.push(secondary(lastOption.label));
          dockMain.push(
            button(
              { label: t.lesson.next, variant: 'primary', large: true, block: true, key: 'next', ariaDisabled: true, options: { onBlocked: () => ctx.toast(t.care.lockedDuringReaction) } },
              () => undefined,
            ),
          );
          menu = null;
          break;
        }
        case 'feedback': {
          if (lastOption) {
            cardChildren.push(decisionMark(lastOption.helpful, lastOption.helpful ? t.lesson.helpfulMark : t.lesson.otherDirectionMark));
            cardChildren.push(text(lastOption.feedback, 'observation-text'));
            if (lastOption.miraLine) cardChildren.push(quote(t.lesson.miraSays, lastOption.miraLine));
            if (lastOption.careEffect) cardChildren.push(secondary(t.lesson.careEffectNote));
            if (lastOption.everyday) {
              cardChildren.push(
                collapsible(t.lesson.everyday, el('div', {}, [text(lastOption.everyday)]), app.everydayOpen, (open) => ctx.store.patchApp({ everydayOpen: open }), 'lesson-everyday'),
              );
            }
          }
          dockMain.push(button({ label: t.lesson.next, variant: 'primary', large: true, block: true, key: 'next' }, nextRound));
          break;
        }
        default:
          break;
      }

      // Slide the card up when the phase changes (≤ 200 ms; instant under reduced motion via CSS vars).
      const phaseKey = `${visit.id}:${visit.index}:${visit.phase}:${visit.attempts.length}`;
      const enter = phaseKey !== lastPhaseKey;
      lastPhaseKey = phaseKey;
      const card = el(
        'div',
        {
          class: `card card--dialog${visit.phase === 'decide' ? ' card--decide' : ''}${enter ? ' card--enter' : ''}`,
          dataset: { scrollKey: 'lesson-card' },
          attrs: { 'aria-live': 'polite' },
        },
        cardChildren,
      );
      const dock = el('div', { class: `dock dock--lesson${menu ? ' dock--with-menu' : ''}`, dataset: { scrollKey: 'lesson-dock' } }, [
        el('div', { class: 'dock-main' }, dockMain),
        menu,
      ]);
      return [header, el('div', { class: 'hud-middle' }, [card]), dock];
    },
    afterRender(snapshot) {
      setMarkCounter(marks, ctx.presenter.getDisplayMarks(snapshot.save), t.school.marksLabel);
    },
    destroy() {
      unsubscribeWorld?.();
    },
  });
  // Readiness and attention come from the world, not the store: re-derive on its structural changes.
  const unsubscribeWorld = ctx.world?.onChange(() => view.update(ctx.store.get()));
  return view;
}
