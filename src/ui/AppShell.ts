/**
 * App shell: 100dvh layout with safe-area insets, persistent scene container, world overlays
 * (home/lesson), full screens, modal layer (inert world behind), banner/toast layer, aria-live.
 * Route switching is driven only by the store's AppState.
 */
import type { Route } from '../app/appState';
import { hasActiveTrap } from '../input/actions';
import type { StoreSnapshot } from '../state/store';
import { button, createDialog, createLiveRegion, el, type ModalHandle } from './components';
import type { UiContext, View } from './context';
import { createHomeView } from './HomeView';
import { createInterruptionBanner } from './InterruptionBanner';
import { createLessonView } from './LessonView';
import { createMemorialView } from './MemorialView';
import { createModeView } from './ModeView';
import { createOtherTabView } from './OtherTabView';
import { createProfileView } from './ProfileView';
import { createReflectionView } from './ReflectionView';
import { openSchoolSheet } from './SchoolView';
import { createSettingsView } from './SettingsView';
import { t } from './strings';
import { createWebglFallbackView } from './WebglFallbackView';
import type { DomainEffect } from '../simulation/types';

export interface AppShell {
  root: HTMLElement;
  sceneContainer: HTMLElement;
  modalHost: HTMLElement;
  announce(message: string): void;
  update(snapshot: StoreSnapshot): void;
  showReward(effect: Extract<DomainEffect, { type: 'visitRewarded' }>, snapshot: StoreSnapshot): void;
  destroy(): void;
}

const TOAST_MS = 3600;

type WorldKind = 'home' | 'lesson' | null;
type ScreenKind = 'profile' | 'settings' | 'reflection' | 'memorial' | 'mode' | 'otherTab' | null;

export function createAppShell(getContext: () => UiContext): AppShell {
  const sceneContainer = el('div', { class: 'scene', attrs: { 'aria-hidden': 'true' } });
  const layerScene = el('div', { class: 'layer layer-scene' }, [sceneContainer]);
  const layerWorld = el('div', { class: 'layer layer-world' });
  const layerScreen = el('div', { class: 'layer layer-screen' });
  const layerModal = el('div', { class: 'layer layer-modal' });
  const toastAnchor = el('div', { class: 'toast-anchor' });
  const layerBanner = el('div', { class: 'layer layer-banner' });
  const live = createLiveRegion();
  const root = el('div', { class: 'shell' }, [layerScene, layerWorld, layerScreen, layerModal, toastAnchor, layerBanner, live.node]);

  let ctx: UiContext | null = null;
  let worldKind: WorldKind = null;
  let worldView: View | null = null;
  let screenKind: ScreenKind = null;
  let screenView: View | null = null;
  let fallbackView: View | null = null;
  let bannerView: View | null = null;
  let schoolSheet: ModalHandle | null = null;
  let toastTimer: number | null = null;
  let lastToastId = -1;
  let redirectScheduled = false;

  // Inert everything behind modals whenever the modal layer has children.
  const modalObserver = new MutationObserver(() => syncInert());
  modalObserver.observe(layerModal, { childList: true });

  function syncInert(): void {
    const modalOpen = layerModal.childElementCount > 0;
    const screenOpen = layerScreen.childElementCount > 0;
    layerScene.inert = modalOpen || screenOpen;
    layerWorld.inert = modalOpen || screenOpen;
    layerScreen.inert = modalOpen;
    layerBanner.inert = modalOpen;
    layerWorld.hidden = screenOpen;
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || hasActiveTrap() || !ctx) return;
    const route = ctx.store.get().app.route;
    if (route === 'profile' || route === 'settings' || route === 'mode') {
      event.preventDefault();
      ctx.goBack();
    }
  }
  document.addEventListener('keydown', onKeyDown);

  function ensureCtx(): UiContext {
    if (!ctx) ctx = getContext();
    return ctx;
  }

  function setWorld(kind: WorldKind): void {
    if (kind === worldKind) return;
    worldView?.destroy();
    worldView = null;
    worldKind = kind;
    if (kind === 'home') worldView = createHomeView(ensureCtx());
    if (kind === 'lesson') worldView = createLessonView(ensureCtx());
    if (worldView) layerWorld.append(worldView.el);
  }

  function setScreen(kind: ScreenKind): void {
    if (kind === screenKind) return;
    screenView?.destroy();
    screenView = null;
    screenKind = kind;
    const c = ensureCtx();
    switch (kind) {
      case 'profile':
        screenView = createProfileView(c);
        break;
      case 'settings':
        screenView = createSettingsView(c);
        break;
      case 'reflection':
        screenView = createReflectionView(c);
        break;
      case 'memorial':
        screenView = createMemorialView(c);
        break;
      case 'mode':
        screenView = createModeView(c);
        break;
      case 'otherTab':
        screenView = createOtherTabView(c);
        break;
      default:
        break;
    }
    if (screenView) layerScreen.append(screenView.el);
    syncInert();
  }

  function scheduleRedirect(route: Route): void {
    if (redirectScheduled) return;
    redirectScheduled = true;
    queueMicrotask(() => {
      redirectScheduled = false;
      ensureCtx().navigate(route);
    });
  }

  function syncToast(snapshot: StoreSnapshot): void {
    const toast = snapshot.app.toast;
    if (!toast) {
      toastAnchor.replaceChildren();
      return;
    }
    if (toast.id === lastToastId) return;
    lastToastId = toast.id;
    toastAnchor.replaceChildren(el('div', { class: 'toast', attrs: { role: 'status' }, text: toast.text }));
    live.announce(toast.text);
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastTimer = null;
      if (ensureCtx().store.get().app.toast?.id === toast.id) ensureCtx().store.patchApp({ toast: null });
    }, TOAST_MS);
  }

  function syncSchoolSheet(snapshot: StoreSnapshot): void {
    const wantOpen = snapshot.app.route === 'school' && snapshot.app.ownership !== 'other';
    if (wantOpen && !schoolSheet) {
      schoolSheet = openSchoolSheet(ensureCtx(), () => {
        schoolSheet = null;
        const current = ensureCtx().store.get().app;
        if (current.route === 'school') ensureCtx().goBack();
      });
    } else if (!wantOpen && schoolSheet) {
      const handle = schoolSheet;
      schoolSheet = null;
      handle.close();
    }
  }

  return {
    root,
    sceneContainer,
    modalHost: layerModal,
    announce: (message) => live.announce(message),
    update(snapshot) {
      const c = ensureCtx();
      const { app, save } = snapshot;
      root.dataset.route = app.route;
      root.dataset.reducedMotion = String(app.reducedMotion);

      if (!fallbackView) {
        fallbackView = createWebglFallbackView(c);
        layerScene.append(fallbackView.el);
      }
      if (!bannerView) {
        bannerView = createInterruptionBanner(c);
        layerBanner.append(bannerView.el);
      }

      // --- redirects derived from domain state (no domain logic, only consistency of the route)
      if (app.ownership === 'other') {
        setScreen('otherTab');
        setWorld(null);
        syncSchoolSheet(snapshot);
        screenView?.update(snapshot);
        bannerView.update(snapshot);
        fallbackView.update(snapshot);
        syncToast(snapshot);
        return;
      }
      const visit = save.currentVisit;
      if (save.dog.status === 'lost' && app.route !== 'memorial' && app.route !== 'mode' && app.route !== 'settings') {
        scheduleRedirect('memorial');
      } else if (app.route === 'memorial' && save.dog.status !== 'lost') {
        scheduleRedirect('home');
      } else if (app.route === 'lesson' && !visit) {
        scheduleRedirect('home');
      } else if (app.route === 'lesson' && visit && visit.phase === 'reflect' && !app.presenting && !save.pendingPresentation) {
        // A care-closure option moves the phase to reflect at once; let its reaction finish first.
        scheduleRedirect('reflection');
      } else if (app.route === 'reflection' && (!visit || visit.phase !== 'reflect')) {
        scheduleRedirect(visit ? 'lesson' : 'home');
      }

      // --- world + screen by route
      const world: WorldKind = app.route === 'lesson' ? 'lesson' : 'home';
      setWorld(world);
      const screen: ScreenKind =
        app.route === 'profile' || app.route === 'settings' || app.route === 'reflection' || app.route === 'memorial' || app.route === 'mode' ? app.route : null;
      setScreen(screen);
      syncSchoolSheet(snapshot);

      worldView?.update(snapshot);
      screenView?.update(snapshot);
      fallbackView.update(snapshot);
      bannerView.update(snapshot);
      syncToast(snapshot);
    },
    showReward(effect, snapshot) {
      const c = ensureCtx();
      const lesson = c.content.lessons[effect.lessonId];
      const name = snapshot.save.dog.name;
      const lines: string[] = [];
      if (effect.visitMark) lines.push(t.home.rewardMark);
      if (effect.bond) lines.push(t.home.rewardMemory);
      for (const point of effect.newlyLearned) lines.push(t.home.rewardLearned(c.content.learningPoints[point].label));
      if (effect.learningMarks > 0) lines.push(t.home.rewardLearningMark(effect.learningMarks));
      if (effect.closure === 'careClosure') lines.push(t.home.rewardCareClosure(name));
      const list = el('ul', { class: 'reward-list' }, lines.map((line) => el('li', {}, [el('span', { class: 'dot', attrs: { 'aria-hidden': 'true' } }), line])));
      const handle = createDialog(
        layerModal,
        { title: `${t.home.rewardTitle}: ${lesson.title}` },
        [button({ label: t.app.ok, variant: 'primary', block: true, key: 'reward-ok' }, () => handle.close())],
        [list],
      );
      live.announce(`${t.home.rewardTitle}. ${lines.join(' ')}`);
    },
    destroy() {
      document.removeEventListener('keydown', onKeyDown);
      modalObserver.disconnect();
      if (toastTimer !== null) window.clearTimeout(toastTimer);
      schoolSheet?.close();
      worldView?.destroy();
      screenView?.destroy();
      fallbackView?.destroy();
      bannerView?.destroy();
      root.remove();
    },
  };
}
