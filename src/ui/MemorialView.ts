/**
 * MEMORIAL (04 Abschied): neutral text verbatim, name + positive milestones, memory list,
 * "Erinnerung ansehen", "Neuen Challenge-Lauf beginnen" (archive, then create), "Zum Standardmodus".
 * No graphic depiction, no blame, no paid revival.
 */
import { button, el, secondary, text } from './components';
import type { UiContext, View } from './context';
import { t } from './strings';
import { createView } from './view';

export function createMemorialView(ctx: UiContext): View {
  const root = el('section', { class: 'screen screen--centered', attrs: { 'aria-labelledby': 'memorial-title' }, dataset: { view: 'memorial' } });
  let memoriesOpen = false;

  const view = createView({
    root,
    derive(snapshot) {
      const { save } = snapshot;
      return {
        name: save.dog.name,
        memories: save.memories.map((memory) => memory.id),
        lessons: save.completedLessonIds,
        learned: save.dog.learnedPoints,
        upgrades: save.school.upgrades,
        growth: save.growthConfirmed,
        visits: save.visitCount,
        memoriesOpen,
      };
    },
    render(snapshot) {
      const { save } = snapshot;
      const name = save.dog.name;
      const now = (): number => ctx.store.providers.nowUTC();

      const milestones: string[] = [];
      milestones.push(t.memorial.visits(save.visitCount));
      if (save.completedLessonIds.length) milestones.push(`${save.completedLessonIds.length} ${save.completedLessonIds.length === 1 ? 'Lektion' : 'Lektionen'}`);
      if (save.dog.learnedPoints.length) milestones.push(`${save.dog.learnedPoints.length} ${save.dog.learnedPoints.length === 1 ? 'Lernpunkt' : 'Lernpunkte'}`);
      if (save.school.upgrades.length) milestones.push(`${save.school.upgrades.length} ${save.school.upgrades.length === 1 ? 'Ausbau' : 'Ausbauten'}`);
      if (save.growthConfirmed) milestones.push(t.profile.phase('growing'));
      if (save.memories.length) milestones.push(`${save.memories.length} ${save.memories.length === 1 ? 'Erinnerung' : 'Erinnerungen'}`);

      const memoryList = memoriesOpen
        ? save.memories.length === 0
          ? secondary(t.profile.noMemories)
          : el(
              'ul',
              { class: 'list', id: 'memorial-memories' },
              [...save.memories].reverse().map((memory) => {
                const memoryText = ctx.content.memories[memory.lessonId][memory.closure];
                return el('li', { class: 'list-item' }, [el('h3', { text: memoryText.title }), text(memoryText.text), secondary(t.profile.memoryDate(t.dates.short(memory.dateUTC)))]);
              }),
            )
        : null;

      const body = el('div', { class: 'screen-body', dataset: { scrollKey: 'memorial-body' } }, [
        el('div', { class: 'memorial-frame stack stack--tight' }, [
          el('h1', { id: 'memorial-title', class: 'card-title', text: t.memorial.title }),
          text(t.memorial.text, 'text-lead'),
          secondary(t.memorial.remember(name)),
        ]),
        el('div', { class: 'stack stack--tight' }, [
          el('h2', { class: 'card-title', text: t.memorial.milestones }),
          milestones.length ? el('ul', { class: 'reward-list' }, milestones.map((line) => el('li', {}, [el('span', { class: 'dot', attrs: { 'aria-hidden': 'true' } }), line]))) : secondary(t.memorial.noMilestones),
        ]),
        button(
          { label: memoriesOpen ? t.memorial.hideMemories : t.memorial.viewMemories, variant: 'secondary', block: true, key: 'memories', attrs: { 'aria-expanded': String(memoriesOpen), 'aria-controls': 'memorial-memories' } },
          () => {
            memoriesOpen = !memoriesOpen;
            view.update(ctx.store.get());
          },
        ),
        memoryList,
        secondary(t.memorial.noBlame),
      ]);

      const footer = el('footer', { class: 'screen-footer' }, [
        button({ label: t.memorial.newRun, variant: 'primary', large: true, block: true, key: 'new-run' }, async () => {
          await ctx.store.dispatchMeta({ type: 'ARCHIVE_CHALLENGE', nowUTC: now() });
          await ctx.store.dispatchMeta({ type: 'CREATE_SAVE', mode: 'challenge', nowUTC: now() });
          ctx.toast(t.toasts.modeSwitched('challenge'));
          ctx.navigate('home');
        }),
        button({ label: t.memorial.toStandard, variant: 'secondary', large: true, block: true, key: 'to-standard' }, async () => {
          await ctx.store.dispatchMeta({ type: 'SELECT_MODE', mode: 'standard', nowUTC: now() });
          ctx.toast(t.toasts.modeSwitched('standard'));
          ctx.navigate('home');
        }),
      ]);
      return [body, footer];
    },
  });
  return view;
}
