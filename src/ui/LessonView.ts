/**
 * LESSON / TRAINING (05): compact learning point + round counter on top, scene in the middle,
 * dialog card between actions, action dock ≤ 28 % height. Phases: prepare → observe → decide → react →
 * feedback → (reflect handled by the shell → REFLECTION). No domain logic: phase and options from selectors.
 */
import {
  getAvailableClosures,
  getCurrentRound,
  getCurrentRoundRef,
  getLastOption,
  getObservation,
  getReadiness,
} from '../simulation/selectors';
import type { StoreSnapshot } from '../state/store';
import { button, collapsible, confirmDialog, createSheet, el, secondary, text } from './components';
import type { UiContext, View } from './context';
import { rejectionText } from './sheets';
import { t } from './strings';
import { createView } from './view';

export function createLessonView(ctx: UiContext): View {
  const root = el('div', { class: 'hud', dataset: { view: 'lesson' } });

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
    const sheet = createSheet(ctx.modalHost, { title: t.app.more }, [
      el('div', { class: 'stack stack--tight' }, [
        button(
          {
            label: t.lesson.care,
            variant: 'option',
            icon: 'bowl',
            key: 'overflow-care',
            ariaDisabled: phase === 'react' || app.presenting,
            options: { onBlocked: () => ctx.toast(t.care.lockedDuringReaction) },
          },
          () => {
            sheet.close();
            ctx.openCareSheet();
          },
        ),
        button({ label: app.hintOpen ? t.lesson.hideDescription : t.lesson.describe, variant: 'option', icon: 'eye', key: 'overflow-describe' }, () => {
          ctx.store.patchApp({ hintOpen: !ctx.store.get().app.hintOpen });
          sheet.close();
        }),
        button({ label: t.lesson.endToday, variant: 'option', icon: 'close', key: 'overflow-end' }, () => {
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
            }
          : null,
        hintOpen: app.hintOpen,
        everydayOpen: app.everydayOpen,
        observationText: save.settings.observationTextEnabled,
        renderer: app.rendererStatus,
        presenting: app.presenting,
        readiness: getReadiness(save).readiness,
        name: save.dog.name,
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

      // --- header
      const roundInfo = el('div', { class: 'lesson-round' }, [
        el('strong', { text: t.lesson.round(current, total) }),
        ref?.supported ? el('span', { class: 'lesson-replay', text: t.lesson.supportedReplay }) : null,
        ref?.inserted ? el('span', { class: 'lesson-replay', text: t.lesson.insertedReplay }) : null,
      ]);
      const header = el('div', { class: 'lesson-header' }, [
        el('div', { class: 'lesson-point' }, [
          el('span', { class: 'text-secondary', text: `${t.lesson.learningPoint}: ` }),
          el('span', { text: lesson.learningPointLabel }),
        ]),
        roundInfo,
      ]);

      // --- card + dock by phase
      const cardChildren: Array<HTMLElement | null> = [];
      const dockChildren: HTMLElement[] = [];
      const more = button({ label: t.app.more, variant: 'secondary', icon: 'more', key: 'more', ariaLabel: t.app.more }, () => openOverflow(ctx.store.get()));

      const nextRound = async (): Promise<void> => {
        const result = await ctx.store.act('NEXT_ROUND', {});
        if (result.outcome === 'rejected') ctx.toast(rejectionText(result.reason, name));
      };

      switch (visit.phase) {
        case 'prepare': {
          cardChildren.push(el('span', { class: 'speaker', text: t.lesson.miraSays }), text(lesson.intro, 'text-lead'));
          cardChildren.push(secondary(lesson.subtitle));
          dockChildren.push(button({ label: t.lesson.start, variant: 'primary', large: true, block: true, key: 'next' }, nextRound));
          dockChildren.push(el('div', { class: 'dock-row' }, [more]));
          break;
        }
        case 'observe':
        case 'decide': {
          const forcedDescription = save.settings.observationTextEnabled || rendererUnavailable;
          const showDescription = forcedDescription || app.hintOpen;
          if (round) cardChildren.push(el('h2', { class: 'card-title', text: round.title }));
          if (observation) cardChildren.push(text(observation.text, 'text-lead'));
          if (observation && showDescription) {
            cardChildren.push(el('div', { class: 'hint-box', id: 'observation-description' }, [el('strong', { text: `${t.lesson.describe}: ` }), observation.description]));
          }
          if (rendererUnavailable) cardChildren.push(secondary(t.lesson.textViewNote));
          if (ref?.supported && round) {
            cardChildren.push(el('div', { class: 'hint-box' }, [el('strong', { text: `${t.lesson.supportedReplay}: ` }), round.supportHint]));
            cardChildren.push(secondary(t.lesson.supportedHint));
          }
          if (ref?.inserted) cardChildren.push(secondary(t.lesson.insertedHint));

          if (visit.phase === 'observe') {
            const row = el('div', { class: 'dock-row' }, [more]);
            if (!forcedDescription) {
              row.prepend(
                button(
                  {
                    label: app.hintOpen ? t.lesson.hideDescription : t.lesson.lookCloser,
                    variant: 'secondary',
                    icon: 'eye',
                    key: 'look-closer',
                    attrs: { 'aria-expanded': String(app.hintOpen), 'aria-controls': 'observation-description' },
                  },
                  () => ctx.store.patchApp({ hintOpen: !ctx.store.get().app.hintOpen }),
                ),
              );
            }
            dockChildren.push(button({ label: t.lesson.next, variant: 'primary', large: true, block: true, key: 'next' }, nextRound));
            dockChildren.push(row);
          } else {
            cardChildren.push(secondary(t.lesson.decide));
            const options = round?.options ?? [];
            for (const option of options) {
              dockChildren.push(
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
            dockChildren.push(el('div', { class: 'dock-row' }, [more]));
          }
          break;
        }
        case 'react':
        case 'reflect': {
          cardChildren.push(text(t.lesson.reacting, 'text-lead'));
          if (lastOption) cardChildren.push(secondary(lastOption.label));
          dockChildren.push(
            button(
              { label: t.lesson.next, variant: 'primary', large: true, block: true, key: 'next', ariaDisabled: true, options: { onBlocked: () => ctx.toast(t.care.lockedDuringReaction) } },
              () => undefined,
            ),
          );
          break;
        }
        case 'feedback': {
          if (lastOption) {
            cardChildren.push(el('span', { class: 'badge', text: lastOption.label }));
            cardChildren.push(text(lastOption.feedback, 'text-lead'));
            if (lastOption.miraLine) cardChildren.push(el('p', {}, [el('span', { class: 'speaker', text: t.lesson.miraSays }), lastOption.miraLine]));
            if (lastOption.careEffect) cardChildren.push(secondary(t.lesson.careEffectNote));
            if (lastOption.everyday) {
              cardChildren.push(
                collapsible(t.lesson.everyday, el('div', {}, [text(lastOption.everyday)]), app.everydayOpen, (open) => ctx.store.patchApp({ everydayOpen: open }), 'lesson-everyday'),
              );
            }
          }
          dockChildren.push(button({ label: t.lesson.next, variant: 'primary', large: true, block: true, key: 'next' }, nextRound));
          dockChildren.push(el('div', { class: 'dock-row' }, [more]));
          break;
        }
        default:
          break;
      }

      const card = el('div', { class: 'card card--dialog', dataset: { scrollKey: 'lesson-card' }, attrs: { 'aria-live': 'polite' } }, cardChildren);
      const dock = el('div', { class: 'dock dock--lesson', dataset: { scrollKey: 'lesson-dock' } }, dockChildren);
      return [header, el('div', { class: 'hud-middle' }, [card]), dock];
    },
  });
  return view;
}
