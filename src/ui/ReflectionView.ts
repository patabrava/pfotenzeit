/**
 * REFLECTION (05, F8/F9): one sentence success, one sentence learning point, collapsible "Im Alltag",
 * both closing buttons with equal weight. After COMPLETE_VISIT the view stays (holdsRoute) and shows
 * the committed reward as three small rows (Marke, Erinnerung, Lernpunkt) that light up in sequence
 * while the header mark counter does its +1 (D-035: glint at the counter, never over the dog).
 * The reward comes from the reducer's visitRewarded effect; nothing is derived in the view.
 */
import { getAvailableClosures, getHelpfulDecisionCount, getLastOption, isCareClosureOffered, isLearned } from '../simulation/selectors';
import type { DomainEffect, LessonId, VisitClosure } from '../simulation/types';
import { button, collapsible, el, icon, markCounter, quote, secondary, setMarkCounter, text } from './components';
import type { UiContext, View } from './context';
import { rejectionText } from './sheets';
import { t } from './strings';
import { createView } from './view';

type RewardEffect = Extract<DomainEffect, { type: 'visitRewarded' }>;

interface RewardState {
  effect: RewardEffect;
  lessonId: LessonId;
  then: 'home' | 'school';
}

export function createReflectionView(ctx: UiContext): View {
  const root = el('section', { class: 'screen', attrs: { 'aria-labelledby': 'reflection-title' }, dataset: { view: 'reflection' } });
  const marks = markCounter(ctx.presenter.getDisplayMarks(ctx.store.get().save), t.school.marksLabel);
  let reward: RewardState | null = null;
  let completing = false;

  function rewardRow(label: string, granted: boolean, detail: string, index: number): HTMLElement {
    const row = el('li', { class: `reward-row${granted ? ' is-granted' : ''}` }, [
      el('span', { class: 'reward-row-icon', attrs: { 'aria-hidden': 'true' } }, [icon(granted ? 'check' : 'more', 'reward-row-svg')]),
      el('span', { class: 'reward-row-text' }, [el('strong', { text: label }), el('span', { class: 'text-secondary', text: detail })]),
    ]);
    row.style.setProperty('--row-index', String(index));
    return row;
  }

  const view = createView({
    root,
    derive(snapshot) {
      const { save, app } = snapshot;
      const visit = save.currentVisit;
      return {
        visit: visit ? { id: visit.id, lessonId: visit.lessonId, phase: visit.phase, decisions: visit.decisions.length } : null,
        everydayOpen: app.everydayOpen,
        learned: visit ? isLearned(save, ctx.content.lessons[visit.lessonId].learningPointId) : null,
        rewarded: save.rewardedLearningIds,
        name: save.dog.name,
        marks: ctx.presenter.getDisplayMarks(save),
        reward: reward ? `${reward.effect.visitId}:${reward.then}` : null,
      };
    },
    render(snapshot) {
      const { save, app } = snapshot;
      const name = save.dog.name;

      if (reward) {
        const lesson = ctx.content.lessons[reward.lessonId];
        const effect = reward.effect;
        const point = lesson.learningPointId;
        const learnedNow = effect.newlyLearned.includes(point);
        const learnedBefore = !learnedNow && save.rewardedLearningIds.includes(point);
        const rows = el('ul', { class: 'reward-rows' }, [
          rewardRow(t.reflection.rowMark, effect.visitMark, effect.visitMark ? t.reflection.rowMarkGranted : t.reflection.rowMarkNone, 0),
          rewardRow(t.reflection.rowMemory, effect.bond, effect.bond ? t.reflection.rowMemoryGranted : t.reflection.rowMemoryNone, 1),
          rewardRow(
            t.reflection.rowLearned,
            learnedNow,
            learnedNow
              ? t.reflection.rowLearnedGranted(lesson.learningPointLabel)
              : learnedBefore
                ? t.reflection.rowLearnedBefore(lesson.learningPointLabel)
                : t.reflection.rowLearnedNone(lesson.learningPointLabel),
            2,
          ),
        ]);
        const target = reward.then;
        const header = el('header', { class: 'screen-header' }, [el('h1', { id: 'reflection-title', text: `${t.reflection.rewardTitle}` }), marks]);
        const body = el('div', { class: 'screen-body', dataset: { scrollKey: 'reflection-body' } }, [
          text(effect.closure === 'careClosure' ? t.reflection.successCareClosure(name) : t.reflection.successCompleted(name), 'text-lead'),
          rows,
          effect.learningMarks > 0 ? secondary(t.home.rewardLearningMark(effect.learningMarks)) : null,
          secondary(lesson.title),
        ]);
        const footer = el('footer', { class: 'screen-footer' }, [
          button({ label: target === 'school' ? t.reflection.toSchool : t.reflection.continue, variant: 'primary', large: true, block: true, key: 'reward-continue' }, () => {
            reward = null;
            ctx.navigate(target);
          }),
        ]);
        return [header, body, footer];
      }

      const visit = save.currentVisit;
      if (!visit) return [];
      const lesson = ctx.content.lessons[visit.lessonId];
      const closures = getAvailableClosures(save, ctx.content);
      const careOffered = isCareClosureOffered(save, ctx.content);
      const closingOption = careOffered ? getLastOption(save, ctx.content) : null;
      const closure: VisitClosure = closures.completed && !careOffered ? 'completed' : 'careClosure';
      const helpful = getHelpfulDecisionCount(visit);
      const learned = isLearned(save, lesson.learningPointId);
      const learnedBefore = save.rewardedLearningIds.includes(lesson.learningPointId);

      const success = closure === 'careClosure' ? t.reflection.successCareClosure(name) : t.reflection.successCompleted(name);
      const learningLine = learnedBefore
        ? t.reflection.learnedBefore(lesson.learningPointLabel)
        : learned
          ? t.home.rewardLearned(lesson.learningPointLabel)
          : t.reflection.stillPracticing(lesson.learningPointLabel);

      const complete = async (then: 'home' | 'school'): Promise<void> => {
        if (completing) return;
        // The store publishes the closed visit before its persistence promise resolves.
        // Hold this route throughout that gap so the shell cannot discard the reward view.
        completing = true;
        let result = await ctx.store.act('COMPLETE_VISIT', { closure });
        if (result.outcome === 'rejected' && result.reason === 'not_meaningful' && closure === 'careClosure' && closures.completed) {
          result = await ctx.store.act('COMPLETE_VISIT', { closure: 'completed' });
        }
        if (result.outcome === 'rejected') {
          completing = false;
          ctx.toast(rejectionText(result.reason, name));
          return;
        }
        const effect = result.effects.find((entry): entry is RewardEffect => entry.type === 'visitRewarded');
        if (!effect) {
          completing = false;
          ctx.navigate(then);
          return;
        }
        ctx.rewardShown.add(effect.visitId);
        reward = { effect, lessonId: lesson.id, then };
        completing = false;
        view.update(ctx.store.get());
      };

      const header = el('header', { class: 'screen-header' }, [el('h1', { id: 'reflection-title', text: `${t.reflection.title}: ${lesson.title}` }), marks]);
      const body = el('div', { class: 'screen-body', dataset: { scrollKey: 'reflection-body' } }, [
        el('div', { class: 'card card--plain stack stack--tight' }, [
          closingOption ? el('span', { class: 'badge', text: closingOption.label }) : null,
          closingOption ? text(closingOption.feedback) : null,
          closingOption?.miraLine ? quote(t.lesson.miraSays, closingOption.miraLine) : null,
          text(success, 'text-lead'),
          helpful > 0 ? secondary(`${helpful} ${helpful === 1 ? 'passende Entscheidung' : 'passende Entscheidungen'}`) : null,
        ]),
        el('div', { class: 'card card--plain stack stack--tight' }, [
          el('span', { class: 'speaker', text: `${t.lesson.learningPoint}: ${lesson.learningPointLabel}` }),
          text(lesson.transferText, 'text-lead'),
          secondary(learningLine),
          !learned && !learnedBefore ? text(lesson.practiceText) : null,
        ]),
        collapsible(t.reflection.everyday, el('div', {}, [text(lesson.everydayText)]), app.everydayOpen, (open) => ctx.store.patchApp({ everydayOpen: open }), 'reflection-everyday'),
        secondary(t.reflection.sourceNote),
      ]);
      const footer = el('footer', { class: 'screen-footer' }, [
        el('div', { class: 'dock-row dock-row--two' }, [
          button({ label: t.reflection.done, variant: 'primary', large: true, key: 'done' }, () => complete('home')),
          button({ label: t.reflection.toSchool, variant: 'primary', large: true, icon: 'school', key: 'to-school' }, () => complete('school')),
        ]),
      ]);
      return [header, body, footer];
    },
    afterRender(snapshot) {
      setMarkCounter(marks, ctx.presenter.getDisplayMarks(snapshot.save), t.school.marksLabel);
    },
    holdsRoute: () => completing || reward !== null,
  });
  return view;
}
