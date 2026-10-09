/**
 * PROFILE (05): full screen, pixel dog top third, name + life phase, three plain need displays
 * (values behind "Details"), tabs Pflege / Erinnerungen / Gelernt. Back restores the previous route.
 * Care is presented inline: bars show the pre-effect values during the animation and move to the
 * committed values afterwards (presenter snapshot); pixel state `resting` while rest plays.
 */
import type { ProfileTab } from '../app/appState';
import { LEARNED_SCENARIO_COUNT, LEARNING_POINT_IDS, READINESS } from '../simulation/defaults';
import { getPixelState, getVitalityBand, isLearned } from '../simulation/selectors';
import type { LearningPointId } from '../simulation/types';
import type { StoreSnapshot } from '../state/store';
import { button, el, needBar, secondary, setNeedBarValue, tabs, text } from './components';
import type { UiContext, View } from './context';
import type { PixelDogHandle } from './pixelBridge';
import { careButtons } from './sheets';
import { t } from './strings';
import { createView } from './view';

export function createProfileView(ctx: UiContext): View {
  const root = el('section', { class: 'screen screen--panel', attrs: { 'aria-labelledby': 'profile-title' }, dataset: { view: 'profile' } });
  const canvas = el('canvas', { class: 'pixel-canvas', attrs: { width: 128, height: 128, role: 'img' } });
  let pixel: PixelDogHandle | null = null;
  let showValues = false;
  const bars = new Map<string, HTMLElement>();
  let resizeObserver: ResizeObserver | null = null;

  function ensurePixel(): PixelDogHandle {
    if (!pixel) pixel = ctx.getPixelFactory()(canvas);
    return pixel;
  }

  function barFor(id: string, label: string, value: number, words: string, low: boolean): HTMLElement {
    let bar = bars.get(id);
    if (!bar) {
      bar = needBar({ id, label, value, words, showValue: showValues, low });
      bars.set(id, bar);
    }
    return bar;
  }

  function drawPixel(snapshot: StoreSnapshot): void {
    const state = ctx.presenter.getPixelOverride() ?? getPixelState(snapshot.save);
    try {
      ensurePixel().render(state, snapshot.save.dog.growthStage);
    } catch (error) {
      console.warn('[ui] pixel render failed', error);
    }
  }

  const view = createView({
    root,
    derive(snapshot) {
      const { save, app } = snapshot;
      const needs = ctx.presenter.getDisplayNeeds(save);
      const effect = ctx.presenter.getActiveEffect();
      return {
        name: save.dog.name,
        stage: save.dog.growthStage,
        needs,
        tab: app.profileTab,
        mode: save.mode,
        band: getVitalityBand(save.dog, save.mode),
        pixel: ctx.presenter.getPixelOverride() ?? getPixelState(save),
        memories: save.memories.map((memory) => memory.id),
        learned: LEARNING_POINT_IDS.map((id) => `${id}:${save.helpfulScenariosByLearningPoint[id]?.length ?? 0}`),
        presenting: app.presenting,
        effect: effect && effect.type === 'care' ? effect.kind : null,
        phase: save.currentVisit?.phase ?? null,
        showValues,
      };
    },
    render(snapshot) {
      const { save, app } = snapshot;
      const dog = save.dog;
      const needs = ctx.presenter.getDisplayNeeds(save);
      const effect = ctx.presenter.getActiveEffect();
      const band = getVitalityBand(dog, save.mode);
      const pixelState = ctx.presenter.getPixelOverride() ?? getPixelState(save);
      canvas.setAttribute('aria-label', t.profile.pixelAlt(dog.name, pixelState));

      const header = el('header', { class: 'screen-header' }, [
        button({ label: t.app.back, icon: 'back', iconOnly: true, variant: 'ghost', key: 'back' }, () => ctx.goBack()),
        el('h1', { id: 'profile-title', text: t.profile.title }),
      ]);

      const stage = el('div', { class: `pixel-stage${pixelState === 'memorial' ? ' pixel-stage--memorial' : ''}` }, [canvas]);
      const nameBlock = el('div', { class: 'profile-name' }, [
        el('h2', { text: dog.name }),
        el('span', { class: 'text-secondary', text: `${t.profile.phase(dog.growthStage)} · ${t.profile.pixelState(pixelState)}` }),
      ]);
      const presentingLine = effect && effect.type === 'care' ? text(t.care.presenting(dog.name, effect.kind), 'text-lead') : null;

      const low = READINESS.lowNeed;
      const needsBlock = el('div', { class: 'needs' }, [
        barFor('need-satiety', t.needs.hunger, needs.satiety, t.needs.hungerLine(needs.satiety), needs.satiety < low),
        barFor('need-energy', t.needs.energy, needs.energy, t.needs.energyLine(needs.energy), needs.energy < low),
        barFor('need-comfort', t.needs.comfort, needs.comfort, t.needs.comfortLine(needs.comfort), needs.comfort < low),
      ]);
      const hints: HTMLElement[] = [];
      if (dog.stress > READINESS.highStress) hints.push(secondary(t.needs.stressHint));
      else if (dog.arousal > READINESS.highArousal) hints.push(secondary(t.needs.arousalHint));
      if (save.mode === 'challenge') {
        hints.push(
          el('p', {}, [
            el('span', { class: `badge ${band === 'stable' ? 'badge--ok' : band === 'impaired' ? 'badge--warn' : 'badge--crit'}`, text: `${t.band.symbol(band)} ${t.band.vitalityLine(band)}` }),
          ]),
        );
        if (band !== 'stable') hints.push(secondary(t.band.text(band)));
      }
      const detailsToggle = button(
        { label: showValues ? t.app.hideDetails : t.app.details, variant: 'ghost', key: 'details', attrs: { 'aria-pressed': String(showValues) } },
        () => {
          showValues = !showValues;
          view.update(ctx.store.get());
        },
      );

      const tabItems: { id: ProfileTab; label: string }[] = [
        { id: 'care', label: t.profile.tabs.care },
        { id: 'memories', label: t.profile.tabs.memories },
        { id: 'learned', label: t.profile.tabs.learned },
      ];
      const tabBar = tabs(tabItems, app.profileTab, (id) => ctx.store.patchApp({ profileTab: id }), 'profile');

      let panelContent: HTMLElement[] = [];
      if (app.profileTab === 'care') {
        panelContent = [careButtons(ctx, snapshot), secondary(t.care.waterNote)];
        if (save.mode === 'challenge') panelContent.push(secondary(t.profile.challengeNote));
      } else if (app.profileTab === 'memories') {
        const memories = [...save.memories].reverse();
        panelContent =
          memories.length === 0
            ? [secondary(t.profile.noMemories)]
            : [
                el(
                  'ul',
                  { class: 'list' },
                  memories.map((memory) => {
                    const memoryText = ctx.content.memories[memory.lessonId][memory.closure];
                    return el('li', { class: 'list-item' }, [
                      el('h3', { text: memoryText.title }),
                      text(memoryText.text),
                      secondary(`${t.profile.memoryDate(t.dates.short(memory.dateUTC))} · ${ctx.content.lessons[memory.lessonId].title}`),
                    ]);
                  }),
                ),
              ];
      } else {
        panelContent = [
          el(
            'ul',
            { class: 'list' },
            LEARNING_POINT_IDS.map((id: LearningPointId) => {
              const point = ctx.content.learningPoints[id];
              const learned = isLearned(save, id);
              const have = Math.min(LEARNED_SCENARIO_COUNT, save.helpfulScenariosByLearningPoint[id]?.length ?? 0);
              return el('li', { class: 'list-item stack stack--tight' }, [
                el('div', { class: 'row row--between' }, [
                  el('h3', { text: point.label }),
                  el('span', { class: `badge${learned ? ' badge--ok' : ''}`, text: t.profile.learnedState(learned) }),
                ]),
                secondary(t.profile.progressLine(have, LEARNED_SCENARIO_COUNT)),
                text(point.summary),
                el('p', {}, [el('strong', { text: `${t.profile.everyday}: ` }), point.everyday]),
              ]);
            }),
          ),
        ];
      }
      const panel = el('div', { class: 'tabpanel', id: tabBar.panelId(app.profileTab), attrs: { role: 'tabpanel', 'aria-labelledby': `profile-tab-${app.profileTab}`, tabindex: 0 } }, panelContent);

      const body = el('div', { class: 'screen-body', dataset: { scrollKey: 'profile-body' } }, [
        stage,
        nameBlock,
        presentingLine,
        needsBlock,
        ...hints,
        el('div', { class: 'row row--between' }, [detailsToggle]),
        tabBar.list,
        panel,
        secondary(t.profile.pixelNote),
      ]);
      return [header, body];
    },
    afterRender(snapshot) {
      const needs = ctx.presenter.getDisplayNeeds(snapshot.save);
      const low = READINESS.lowNeed;
      const satiety = bars.get('need-satiety');
      const energy = bars.get('need-energy');
      const comfort = bars.get('need-comfort');
      if (satiety) setNeedBarValue(satiety, needs.satiety, t.needs.hungerLine(needs.satiety), showValues, needs.satiety < low);
      if (energy) setNeedBarValue(energy, needs.energy, t.needs.energyLine(needs.energy), showValues, needs.energy < low);
      if (comfort) setNeedBarValue(comfort, needs.comfort, t.needs.comfortLine(needs.comfort), showValues, needs.comfort < low);
      drawPixel(snapshot);
      if (!resizeObserver && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => drawPixel(ctx.store.get()));
        resizeObserver.observe(canvas);
      }
    },
    destroy() {
      resizeObserver?.disconnect();
      resizeObserver = null;
      pixel?.dispose();
      pixel = null;
      bars.clear();
    },
  });
  return view;
}
