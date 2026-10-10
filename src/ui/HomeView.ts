/**
 * HOME (05): scene full-bleed behind; top-left visit hint, top-right profile button with the pixel face,
 * bottom contextual primary action + Schule / Einstellungen. Challenge band banner with icon + text.
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
import { banner, button, confirmDialog, el, markCounter, secondary, setMarkCounter } from './components';
import type { UiContext, View } from './context';
import type { PixelDogHandle } from './pixelBridge';
import { t, tWorld } from './strings';
import { createView } from './view';
import { isYardActive, isYardFallback, openYardSheet, runPrompt, zoneHasAction } from './yard';

export function createHomeView(ctx: UiContext): View {
  const root = el('div', { class: 'hud', dataset: { view: 'home' } });
  const faceCanvas = el('canvas', { class: 'pixel-canvas', attrs: { width: 64, height: 64, 'aria-hidden': 'true' } });
  let face: PixelDogHandle | null = null;
  const marks = markCounter(ctx.presenter.getDisplayMarks(ctx.store.get().save), t.school.marksLabel);

  function ensureFace(): PixelDogHandle {
    if (!face) face = ctx.getPixelFactory()(faceCanvas);
    return face;
  }

  const view = createView({
    root,
    derive(snapshot) {
      const { save, app } = snapshot;
      const readiness = getReadiness(save);
      const effect = ctx.presenter.getActiveEffect();
      return {
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
      const yardFallback = isYardFallback(snapshot, ctx);
      const worldState = ctx.world?.getState() ?? null;
      const moment = worldState?.moment && worldState.moment.response === null ? worldState.moment : null;
      const promptZone = ctx.world?.getContext()?.prompt ?? null;
      const prompt = promptZone && zoneHasAction(promptZone, snapshot) ? promptZone : null;

      // --- top row
      let hintText = t.home.waiting(name);
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
      } else if (yardActive && !prompt) {
        hintText = tWorld.walkHint;
        if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches) hintSecondary = tWorld.keysHint;
      }
      const hint = el('div', { class: 'hint', attrs: { role: 'status' } }, [
        el('span', { text: hintText }),
        hintSecondary ? el('span', { class: 'hint-secondary', text: hintSecondary }) : null,
      ]);

      const profileBtn = el('button', {
        class: 'profile-btn',
        attrs: { type: 'button', 'aria-label': t.home.profile(name) },
        dataset: { key: 'profile' },
      });
      profileBtn.append(faceCanvas);
      bindAction(profileBtn, () => ctx.navigate('profile'));
      const topRight = el('div', { class: 'hud-top-right' }, [marks, profileBtn]);

      // --- middle: band banner
      const middle: HTMLElement[] = [];
      if (band === 'impaired') {
        middle.push(banner('warn', `${t.band.symbol(band)} ${t.band.label(band)}`, t.band.text(band)));
      } else if (band === 'critical') {
        middle.push(banner('crit', `${t.band.symbol(band)} ${t.band.label(band)}`, `${t.band.text(band)} ${t.band.criticalFree}`));
      }

      // --- dock
      const dock = el('div', { class: 'dock', dataset: { scrollKey: 'home-dock' } });
      const primaryActions: HTMLElement[] = [];

      // D-041: one contextual prompt from the world (≥ 56 px); hidden when there is nothing to do here.
      if (prompt && band !== 'critical' && !visit) {
        primaryActions.push(
          button({ label: tWorld.prompt(prompt), variant: 'primary', large: true, block: true, icon: prompt === 'mira' ? 'paw' : prompt === 'bowl' ? 'bowl' : prompt === 'rest_deck' ? 'rest' : 'leaf', key: 'prompt', class: 'btn--prompt' }, () =>
            runPrompt(ctx, prompt),
          ),
        );
      }

      if (band === 'critical') {
        primaryActions.push(
          button({ label: t.home.care, variant: 'primary', large: true, block: true, icon: 'bowl', key: 'care' }, () => ctx.openCareSheet()),
          button(
            { label: save.challengePaused ? t.home.resume : t.home.pause, variant: 'secondary', large: true, block: true, icon: save.challengePaused ? 'play' : 'pause', key: 'pause' },
            async () => {
              const result = await ctx.store.act(save.challengePaused ? 'RESUME_CHALLENGE' : 'PAUSE_CHALLENGE', {});
              if (result.outcome === 'applied') ctx.toast(save.challengePaused ? t.toasts.resumed : t.toasts.paused);
            },
          ),
        );
      } else if (visit) {
        primaryActions.push(
          button({ label: t.home.continueLesson, variant: 'primary', large: true, block: true, key: 'primary' }, () =>
            ctx.navigate(visit.phase === 'reflect' ? 'reflection' : 'lesson'),
          ),
        );
      } else if (readiness === 'needs_care') {
        primaryActions.push(
          button({ label: t.home.care, variant: 'primary', large: true, block: true, icon: 'bowl', key: 'primary' }, () => ctx.openCareSheet()),
        );
      } else if (growth) {
        primaryActions.push(
          button({ label: t.home.grow, variant: 'primary', large: true, block: true, icon: 'leaf', key: 'primary' }, async () => {
            const confirmed = await confirmDialog(ctx.modalHost, {
              title: t.home.growthTitle,
              text: t.home.growthText(name),
              confirmLabel: t.home.growthConfirm,
              cancelLabel: t.home.growthLater,
            });
            if (!confirmed) return;
            const result = await ctx.store.act('CONFIRM_GROWTH', {});
            if (result.outcome === 'rejected') ctx.toast(t.toasts.actionRejected);
          }),
        );
        primaryActions.push(
          button({ label: t.home.toLesson, variant: 'secondary', block: true, key: 'lesson' }, () => ctx.openLessonPicker()),
        );
      } else if (!(yardActive && prompt)) {
        primaryActions.push(
          button(
            {
              label: t.home.toLesson,
              variant: 'primary',
              large: true,
              block: true,
              icon: 'paw',
              key: 'primary',
              ariaDisabled: save.challengePaused,
              options: { onBlocked: () => ctx.toast(t.toasts.challengePaused) },
            },
            () => ctx.openLessonPicker(),
          ),
        );
      }

      const secondaryRow = el('div', { class: 'dock-row' }, [
        button({ label: t.home.school, variant: 'secondary', icon: 'school', key: 'school' }, () => ctx.navigate('school')),
        button({ label: t.home.settings, variant: 'secondary', icon: 'gear', key: 'settings' }, () => ctx.navigate('settings')),
      ]);
      if (ctx.world) {
        // D-041: the dog sheet (attention line, moment responses) and, without the walkable yard, the zone list.
        secondaryRow.prepend(
          button({ label: name, variant: 'secondary', icon: 'paw', key: 'dog', class: moment ? 'is-suggested' : undefined }, () => ctx.openDogSheet()),
        );
        if (yardFallback) secondaryRow.append(button({ label: tWorld.sheetTitle, variant: 'secondary', icon: 'leaf', key: 'yard' }, () => openYardSheet(ctx)));
      }
      if (band !== 'critical' && readiness === 'needs_care' && !visit) {
        // keep care reachable even when the primary is something else; here primary already is care.
      } else if (band !== 'critical' && !visit) {
        secondaryRow.prepend(button({ label: t.home.care, variant: 'secondary', icon: 'bowl', key: 'care' }, () => ctx.openCareSheet()));
      }
      dock.append(...primaryActions, secondaryRow);
      if (save.mode === 'challenge' && band !== 'critical') {
        dock.append(secondary(`${t.band.symbol(band)} ${t.band.vitalityLine(band)}`));
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
      face?.dispose();
      face = null;
    },
  });
  const unsubscribeWorld = ctx.world?.onChange(() => view.update(ctx.store.get()));
  return view;
}
