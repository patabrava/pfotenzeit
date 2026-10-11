/**
 * HOME: scene behind compact corner controls, a combined profile/mark button,
 * first-use movement help, one contextual action, and a menu for secondary actions.
 */
import {
  getPixelState,
  getReadiness,
  getVitalityBand,
  isGrowthAvailable,
  isTrainingLocked,
} from '../simulation/selectors';
import type { StoreSnapshot } from '../state/store';
import { bindAction } from '../input/actions';
import { banner, button, confirmDialog, createSheet, el, markCounter, secondary, setMarkCounter, text, type ModalHandle } from './components';
import type { UiContext, View } from './context';
import type { PixelDogHandle } from './pixelBridge';
import { t, tWorld } from './strings';
import { createView } from './view';
import { dismissMovementHelp, movementHelpDismissed, MOVEMENT_HELP_CHANGED } from './movementHelp';
import { isYardActive, isYardFallback, openYardSheet, runPrompt, zoneHasAction } from './yard';

export function createHomeView(ctx: UiContext): View {
  const root = el('div', { class: 'hud hud--home', dataset: { view: 'home' } });
  const faceCanvas = el('canvas', { class: 'pixel-canvas', attrs: { width: 64, height: 64, 'aria-hidden': 'true' } });
  let face: PixelDogHandle | null = null;
  let menu: ModalHandle | null = null;
  const marks = markCounter(ctx.presenter.getDisplayMarks(ctx.store.get().save), t.school.marksLabel);

  function ensureFace(): PixelDogHandle {
    if (!face) face = ctx.getPixelFactory()(faceCanvas);
    return face;
  }

  function openHelp(): void {
    menu = createSheet(ctx.modalHost, { title: tWorld.helpTitle }, [
      text(tWorld.walkHint, 'text-lead'),
      secondary(tWorld.keysHint),
      button({ label: t.app.ok, variant: 'primary', block: true, key: 'help-ok' }, () => menu?.close()),
    ]);
  }

  function openMenu(): void {
    const snapshot = ctx.store.get();
    const { save } = snapshot;
    const openedAt = performance.now();
    const select = (action: () => void): ((event: Event) => void) => event => {
      // A held movement pointer may land on the sheet when its capture is released.
      if (event instanceof MouseEvent && event.detail > 0 && performance.now() - openedAt < 300) return;
      menu?.close();
      action();
    };
    const actions = [
      button({ label: t.home.care, variant: 'option', icon: 'bowl', key: 'care' }, select(() => ctx.openCareSheet())),
      ctx.world ? button({ label: save.dog.name, variant: 'option', icon: 'paw', key: 'dog' }, select(() => ctx.openDogSheet())) : null,
      button({ label: t.home.school, variant: 'option', icon: 'school', key: 'school' }, select(() => ctx.navigate('school'))),
      button({ label: t.home.toLesson, variant: 'option', icon: 'paw', key: 'lesson' }, select(() => ctx.openLessonPicker())),
      isYardFallback(snapshot, ctx) ? button({ label: tWorld.sheetTitle, variant: 'option', icon: 'leaf', key: 'yard' }, select(() => openYardSheet(ctx))) : null,
      button({ label: t.home.settings, variant: 'option', icon: 'gear', key: 'settings' }, select(() => ctx.navigate('settings'))),
      button({ label: tWorld.helpTitle, variant: 'option', icon: 'info', key: 'help' }, select(openHelp)),
    ];
    if (save.mode === 'challenge') {
      actions.push(button({ label: save.challengePaused ? t.home.resume : t.home.pause, variant: 'option', icon: save.challengePaused ? 'play' : 'pause', key: 'pause' }, select(() => {
        void ctx.store.act(save.challengePaused ? 'RESUME_CHALLENGE' : 'PAUSE_CHALLENGE', {}).then(result => {
          if (result.outcome === 'applied') ctx.toast(save.challengePaused ? t.toasts.resumed : t.toasts.paused);
        });
      })));
    }
    menu = createSheet(ctx.modalHost, { title: tWorld.menu }, [el('div', { class: 'stack stack--tight home-menu' }, actions)]);
  }

  const view = createView({
    root,
    derive(snapshot) {
      const { save, app } = snapshot;
      const readiness = getReadiness(save);
      const effect = ctx.presenter.getActiveEffect();
      return {
        helpDismissed: movementHelpDismissed(),
        name: save.dog.name,
        readiness,
        band: getVitalityBand(save.dog, save.mode),
        locked: isTrainingLocked(save),
        growth: isGrowthAvailable(save),
        visit: save.currentVisit ? { lessonId: save.currentVisit.lessonId, phase: save.currentVisit.phase } : null,
        pixel: ctx.presenter.getPixelOverride() ?? getPixelState(save),
        stage: save.dog.growthStage,
        paused: save.challengePaused,
        mode: save.mode,
        presenting: effect ? effect.type + ('kind' in effect ? effect.kind : '') : null,
        pauseReasons: app.pauseReasons,
        marks: ctx.presenter.getDisplayMarks(save),
        // D-041 yard
        yardActive: isYardActive(snapshot, ctx),
        yardFallback: isYardFallback(snapshot, ctx),
        prompt: ctx.world?.getContext()?.prompt ?? null,
        moment: ctx.world?.getState()?.moment?.response === null ? ctx.world?.getState()?.moment?.id : null,
        stress: save.dog.stress >= 35,
        upgrades: save.school.upgrades,
        completed: save.completedLessonIds.length,
      };
    },
    render(snapshot) {
      const { save } = snapshot;
      const name = save.dog.name;
      const { readiness, suggestion } = getReadiness(save);
      const band = getVitalityBand(save.dog, save.mode);
      const locked = isTrainingLocked(save);
      const growth = isGrowthAvailable(save);
      const visit = save.currentVisit;
      const effect = ctx.presenter.getActiveEffect();
      const yardActive = isYardActive(snapshot, ctx);
      const worldState = ctx.world?.getState() ?? null;
      const moment = worldState?.moment && worldState.moment.response === null ? worldState.moment : null;
      const promptZone = ctx.world?.getContext()?.prompt ?? null;
      const prompt = promptZone && zoneHasAction(promptZone, snapshot) ? promptZone : null;

      // --- top row
      let hintText: string | null = yardActive ? null : t.home.waiting(name);
      let hintSecondary: string | null = null;
      if (effect && effect.type === 'care') {
        hintText = t.care.presenting(name, effect.kind);
      } else if (save.challengePaused) {
        hintText = t.home.challengePaused;
      } else if (locked) {
        hintText = t.home.trainingLocked;
      } else if (visit) {
        hintText = t.home.visitInProgress(ctx.content.lessons[visit.lessonId].title);
      } else if (readiness === 'needs_care' && suggestion) {
        hintText = t.home.needsCare(name, suggestion);
      } else if (growth) {
        hintText = t.home.growthTitle;
        hintSecondary = t.home.growthFiction;
      } else if (moment) {
        // D-041 §5: the dog's initiative as text; the dog button opens the responses.
        hintText = ctx.content.moments[moment.kind].observation;
      } else if (yardActive && !movementHelpDismissed()) {
        hintText = tWorld.firstWalkHint;
      }
      const hint = hintText ? el('div', { class: 'hint home-hint', attrs: { role: 'status' } }, [
        el('span', { text: hintText }),
        hintSecondary ? el('span', { class: 'hint-secondary', text: hintSecondary }) : null,
        hintText === tWorld.firstWalkHint ? button({ label: tWorld.dismissHelp, icon: 'close', iconOnly: true, variant: 'ghost', key: 'dismiss-help', class: 'home-hint-close' }, dismissMovementHelp) : null,
      ]) : null;

      const profileBtn = el('button', {
        class: 'profile-btn profile-btn--compact',
        attrs: { type: 'button', 'aria-label': `${t.home.profile(name)}, ${t.school.marksLabel}: ${ctx.presenter.getDisplayMarks(save)}` },
        dataset: { key: 'profile' },
      });
      profileBtn.append(faceCanvas, marks);
      bindAction(profileBtn, () => ctx.navigate('profile'));
      const topRight = el('div', { class: 'hud-top-right' }, [profileBtn]);

      // --- middle: band banner
      const middle: HTMLElement[] = [];
      if (band === 'impaired') {
        middle.push(banner('warn', `${t.band.symbol(band)} ${t.band.label(band)}`, t.band.text(band)));
      } else if (band === 'critical') {
        middle.push(banner('crit', `${t.band.symbol(band)} ${t.band.label(band)}`, `${t.band.text(band)} ${t.band.criticalFree}`));
      }

      // Keep one action in the world; everything else is available through the menu.
      const dock = el('div', { class: 'dock home-dock' });
      let primary: HTMLElement;
      if (band === 'critical' || (!visit && readiness === 'needs_care')) {
        primary = button({ label: t.home.care, variant: 'primary', icon: 'bowl', key: 'primary' }, () => ctx.openCareSheet());
      } else if (visit) {
        primary = button({ label: t.home.continueLesson, variant: 'primary', key: 'primary' }, () => ctx.navigate(visit.phase === 'reflect' ? 'reflection' : 'lesson'));
      } else if (growth) {
        primary = button({ label: t.home.grow, variant: 'primary', icon: 'leaf', key: 'primary' }, async () => {
          const confirmed = await confirmDialog(ctx.modalHost, {
            title: t.home.growthTitle, text: t.home.growthText(name), confirmLabel: t.home.growthConfirm, cancelLabel: t.home.growthLater,
          });
          if (!confirmed) return;
          const result = await ctx.store.act('CONFIRM_GROWTH', {});
          if (result.outcome === 'rejected') ctx.toast(t.toasts.actionRejected);
        });
      } else if (prompt) {
        primary = button({ label: tWorld.prompt(prompt), variant: 'primary', icon: prompt === 'mira' ? 'paw' : prompt === 'bowl' ? 'bowl' : 'leaf', key: 'prompt' }, () => runPrompt(ctx, prompt));
      } else {
        primary = button({ label: t.home.toLesson, variant: 'primary', icon: 'paw', key: 'primary', ariaDisabled: save.challengePaused,
          options: { onBlocked: () => ctx.toast(t.toasts.challengePaused) } }, () => ctx.openLessonPicker());
      }
      dock.append(primary, button({ label: tWorld.menu, variant: 'secondary', icon: 'more', key: 'menu', attrs: { 'aria-haspopup': 'dialog' } }, openMenu));
      if (save.mode === 'challenge' && band !== 'critical') {
        middle.push(secondary(`${t.band.symbol(band)} ${t.band.vitalityLine(band)}`));
      }
      return [el('div', { class: 'hud-top' }, [hint, topRight]), el('div', { class: 'hud-middle' }, middle), dock];
    },
    afterRender(snapshot) {
      setMarkCounter(marks, ctx.presenter.getDisplayMarks(snapshot.save), t.school.marksLabel);
      const state = ctx.presenter.getPixelOverride() ?? getPixelState(snapshot.save);
      try {
        ensureFace().render(state, snapshot.save.dog.growthStage);
      } catch (error) {
        console.warn('[ui] pixel face failed', error);
      }
    },
    destroy() {
      unsubscribeWorld?.();
      window.removeEventListener(MOVEMENT_HELP_CHANGED, onHelpChanged);
      menu?.close();
      face?.dispose();
      face = null;
    },
  });
  const onHelpChanged = (): void => view.update(ctx.store.get());
  window.addEventListener(MOVEMENT_HELP_CHANGED, onHelpChanged);
  const unsubscribeWorld = ctx.world?.onChange(() => view.update(ctx.store.get()));
  return view;
}
