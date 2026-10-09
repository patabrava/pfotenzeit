/**
 * REFLECTION (05): one sentence success, one sentence learning point, collapsible "Im Alltag",
 * "Fertig für heute" and "Zur Schule" equally reachable. The reward summary is shown by the shell once
 * the visitRewarded effect is presented (presenter → reward card).
 */
import { getAvailableClosures, getHelpfulDecisionCount, getLastOption, isCareClosureOffered, isLearned } from '../simulation/selectors';
import type { VisitClosure } from '../simulation/types';
import { button, collapsible, el, secondary, text } from './components';
import type { UiContext, View } from './context';
import { rejectionText } from './sheets';
import { t } from './strings';
import { createView } from './view';

export function createReflectionView(ctx: UiContext): View {
  const root = el('section', { class: 'screen', attrs: { 'aria-labelledby': 'reflection-title' }, dataset: { view: 'reflection' } });

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
      };
    },
    render(snapshot) {
      const { save, app } = snapshot;
      const visit = save.currentVisit;
      if (!visit) return [];
      const lesson = ctx.content.lessons[visit.lessonId];
      const name = save.dog.name;
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
        const result = await ctx.store.act('COMPLETE_VISIT', { closure });
        if (result.outcome === 'applied' || result.outcome === 'duplicate') {
          ctx.navigate(then);
          return;
        }
        if (result.reason === 'not_meaningful' && closure === 'careClosure' && closures.completed) {
          const retry = await ctx.store.act('COMPLETE_VISIT', { closure: 'completed' });
          if (retry.outcome === 'applied' || retry.outcome === 'duplicate') {
            ctx.navigate(then);
            return;
          }
        }
        ctx.toast(rejectionText(result.reason, name));
      };

      const header = el('header', { class: 'screen-header' }, [el('h1', { id: 'reflection-title', text: `${t.reflection.title}: ${lesson.title}` })]);
      const body = el('div', { class: 'screen-body', dataset: { scrollKey: 'reflection-body' } }, [
        el('div', { class: 'card card--plain stack stack--tight' }, [
          closingOption ? el('span', { class: 'badge', text: closingOption.label }) : null,
          closingOption ? text(closingOption.feedback) : null,
          closingOption?.miraLine ? el('p', {}, [el('span', { class: 'speaker', text: t.lesson.miraSays }), closingOption.miraLine]) : null,
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
          button({ label: t.reflection.toSchool, variant: 'secondary', large: true, icon: 'school', key: 'to-school' }, () => complete('school')),
        ]),
      ]);
      return [header, body, footer];
    },
  });
  return view;
}
