/**
 * App shell: 100dvh layout with safe-area insets, persistent scene container, world overlays
 * (home/lesson), full screens, modal layer (inert world behind), banner/toast layer, aria-live.
 * Route switching is driven only by the store's AppState.
 */
import type { Route } from '../app/appState';
import { hasActiveTrap } from '../input/actions';
import { bindYardInput, type YardInputHandle } from '../input/yard';
import { getCurrentRound } from '../simulation/selectors';
import type { StoreSnapshot } from '../state/store';
import { button, createDialog, createLiveRegion, el, type ModalHandle } from './components';
import type { UiContext, View } from './context';
import { createHomeView } from './HomeView';
import { createInterruptionBanner } from './InterruptionBanner';
import { createLessonView } from './LessonView';
import { createMemorialView } from './MemorialView';
import { createModeView } from './ModeView';
import { createOtherTabView } from './OtherTabView';
import { createPracticeView } from './PracticeView';
import { createProfileView } from './ProfileView';
import { createReflectionView } from './ReflectionView';
import { openSchoolSheet } from './SchoolView';
import { createSettingsView } from './SettingsView';
import { t, tWorld } from './strings';
import { createWebglFallbackView } from './WebglFallbackView';
import { isYardActive, runPrompt, zoneHasAction } from './yard';
import type { DomainEffect } from '../simulation/types';
import type { RendererHandle } from '../render/types';

/** Optional WP-H hook on the game renderer (not part of the shared RendererHandle contract). */
type RewardAnchorHandle = RendererHandle & { setRewardAnchor?(anchor: { x: number; y: number } | null): void };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

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

type WorldKind = 'home' | 'lesson' | 'practice' | null;
type ScreenKind = 'profile' | 'settings' | 'reflection' | 'memorial' | 'mode' | 'otherTab' | null;

export function createAppShell(getContext: () => UiContext): AppShell {
  const sceneContainer = el('div', { class: 'scene' });
  const movementControls = el('div', { class: 'yard-controls', attrs: { role: 'group', 'aria-label': tWorld.controls.label, hidden: true } },
    (['arrowup', 'arrowleft', 'arrowdown', 'arrowright'] as const).map((direction, index) =>
      el('button', { class: 'yard-direction', attrs: { type: 'button', 'aria-label': tWorld.controls[direction] },
        dataset: { direction }, text: ['↑', '←', '↓', '→'][index] }),
    ),
  );
  sceneContainer.append(movementControls);
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
  let lastAnchorKey = '';
  let yardInput: YardInputHandle | null = null;

  // Frame the dog inside the space left by the lesson HUD. A full-screen
  // camera would put its subject behind the dialog and the action dock.
  // The card's entrance animation (WP-J, .card--enter) is a translateY; read its resting position.
  function untransformedTop(node: Element): number {
    const rect = node.getBoundingClientRect();
    const transform = getComputedStyle(node).transform;
    if (!transform || transform === 'none' || typeof DOMMatrixReadOnly !== 'function') return rect.top;
    try {
      return rect.top - new DOMMatrixReadOnly(transform).f;
    } catch {
      return rect.top;
    }
  }

  function fitScene(): void {
    const header = layerWorld.querySelector('.lesson-header');
    const card = layerWorld.querySelector('.card--dialog');
    if ((worldKind === 'lesson' || worldKind === 'practice') && header && card) {
      const bounds = root.getBoundingClientRect();
      const top = Math.max(0, header.getBoundingClientRect().bottom - bounds.top + 8);
      const bottom = Math.max(top + 1, untransformedTop(card) - bounds.top - 8);
      sceneContainer.style.top = `${top}px`;
      sceneContainer.style.bottom = `${Math.max(0, bounds.height - bottom)}px`;
    } else {
      sceneContainer.style.top = '';
      sceneContainer.style.bottom = '';
    }
  }
  function syncMovementControls(): void {
    const enabled = canWalk(ensureCtx().store.get());
    movementControls.hidden = !enabled;
    if (!enabled) yardInput?.reset();
    const dock = layerWorld.querySelector('.dock');
    const scene = sceneContainer.getBoundingClientRect();
    const bottom = worldKind === 'home' && dock ? Math.max(12, scene.bottom - dock.getBoundingClientRect().top + 12) : 12;
    movementControls.style.bottom = `${bottom}px`;
  }
  // D-035: tell the renderer where the header mark counter sits so the glint lands on it, not on the dog.
  // Coordinates are normalized to the renderer's canvas (the .scene strip). In the lesson the counter is
  // above the strip, so y is clamped to the strip's top edge directly beneath the counter.
  function syncRewardAnchor(): void {
    const handle = ctx?.getRenderer() as RewardAnchorHandle | null | undefined;
    if (!handle || typeof handle.setRewardAnchor !== 'function') return;
    const counter = root.querySelector<HTMLElement>('.layer-world .mark-counter, .layer-screen .mark-counter');
    let next: { x: number; y: number } | null = null;
    if (counter && counter.offsetParent !== null) {
      const strip = sceneContainer.getBoundingClientRect();
      const box = counter.getBoundingClientRect();
      if (strip.width > 0 && strip.height > 0) {
        next = {
          x: clamp01((box.left + box.width / 2 - strip.left) / strip.width),
          y: clamp01((box.top + box.height / 2 - strip.top) / strip.height),
        };
      }
    }
    const key = next ? `${next.x.toFixed(3)}:${next.y.toFixed(3)}` : 'null';
    if (key === lastAnchorKey) return;
    lastAnchorKey = key;
    root.dataset.rewardAnchor = key; // read by smoke.mjs
    handle.setRewardAnchor(next);
  }

  const sceneLayoutObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          fitScene();
          syncMovementControls();
          syncRewardAnchor();
        })
      : null;
  const refit = (): void => {
    fitScene();
    syncRewardAnchor();
    syncMovementControls();
  };
  window.addEventListener('resize', refit);
  layerWorld.addEventListener('animationend', refit);

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
    syncMovementControls();
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

  // D-041: walking is possible on home/practice and in an exercise round's observe phase, while no
  // screen or modal covers the world. Keyboard input is also gated by the focus trap in input/yard.ts.
  function canWalk(snapshot: StoreSnapshot): boolean {
    const c = ensureCtx();
    if (!isYardActive(snapshot, c) || layerScreen.childElementCount > 0 || layerModal.childElementCount > 0) return false;
    const { app, save } = snapshot;
    if (app.route === 'home' || app.route === 'practice') return true;
    if (app.route === 'lesson') {
      const round = getCurrentRound(save, c.content);
      return Boolean(round?.exercise) && save.currentVisit?.phase === 'observe' && !app.presenting;
    }
    return false;
  }

  function ensureYardInput(): void {
    if (yardInput) return;
    const c = ensureCtx();
    yardInput = bindYardInput(sceneContainer, {
      isEnabled: () => canWalk(c.store.get()),
      pick: (x, y) => c.getRenderer()?.pick?.(x, y) ?? null,
      onPick(result) {
        const world = c.world;
        if (!world) return;
        if (result.kind === 'actor' && result.actor === 'dog') {
          c.openDogSheet();
          return;
        }
        if (result.kind === 'zone') {
          // Plan §4: tapping a zone walks to its centre; the prompt appears on arrival.
          const zone = world.getState()?.layout.zones.find((entry) => entry.id === result.zoneId) ?? null;
          world.send({ type: 'moveTo', target: zone ? zone.center : result.point });
          return;
        }
        // Ground or another actor: walk to the point (the world stops short of actors and obstacles).
        world.send({ type: 'moveTo', target: result.point });
      },
      onMoveDir: (dx, dz) => c.world?.send({ type: 'moveDir', dx, dz }),
      onStop: () => c.world?.send({ type: 'stop' }),
      onActivate() {
        const snapshot = c.store.get();
        const prompt = c.world?.getContext()?.prompt ?? null;
        if (snapshot.app.route === 'home' && prompt && zoneHasAction(prompt, snapshot)) {
          void runPrompt(c, prompt);
          return;
        }
        // Lesson / practice: Enter presses the primary attempt or next button when it is enabled.
        const primary = layerWorld.querySelector<HTMLButtonElement>('[data-key="attempt"]:not([aria-disabled="true"]), [data-key="next"]:not([aria-disabled="true"])');
        primary?.click();
      },
    }, movementControls);
  }

  function setWorld(kind: WorldKind): void {
    if (kind === worldKind) return;
    worldView?.destroy();
    worldView = null;
    worldKind = kind;
    if (kind === 'home') worldView = createHomeView(ensureCtx());
    if (kind === 'lesson') worldView = createLessonView(ensureCtx());
    if (kind === 'practice') worldView = createPracticeView(ensureCtx());
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

      ensureYardInput();
      if (!fallbackView) {
        fallbackView = createWebglFallbackView(c);
        // Inside the strip so the text fallback follows the same measured gap as the renderer (D-032).
        sceneContainer.append(fallbackView.el);
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
      // The reflection view keeps its route while it shows the committed reward (visit already closed).
      const holding = screenKind === 'reflection' && screenView?.holdsRoute?.() === true;
      if (save.dog.status === 'lost' && app.route !== 'memorial' && app.route !== 'mode' && app.route !== 'settings') {
        scheduleRedirect('memorial');
      } else if (app.route === 'memorial' && save.dog.status !== 'lost') {
        scheduleRedirect('home');
      } else if (app.route === 'lesson' && !visit) {
        scheduleRedirect('home');
      } else if (app.route === 'lesson' && visit && visit.phase === 'reflect' && !app.presenting && !save.pendingPresentation) {
        // A care-closure option moves the phase to reflect at once; let its reaction finish first.
        scheduleRedirect('reflection');
      } else if (app.route === 'reflection' && !holding && (!visit || visit.phase !== 'reflect')) {
        scheduleRedirect(visit ? 'lesson' : 'home');
      } else if (app.route === 'practice' && (!c.world || visit)) {
        // D-041: free practice needs the world and no running visit.
        scheduleRedirect(visit ? 'lesson' : 'home');
      }

      // --- world + screen by route
      const world: WorldKind = app.route === 'lesson' ? 'lesson' : app.route === 'practice' ? 'practice' : 'home';
      setWorld(world);
      const screen: ScreenKind =
        app.route === 'profile' || app.route === 'settings' || app.route === 'reflection' || app.route === 'memorial' || app.route === 'mode' ? app.route : null;
      setScreen(screen);
      syncSchoolSheet(snapshot);

      worldView?.update(snapshot);
      screenView?.update(snapshot);
      fallbackView.update(snapshot);
      bannerView.update(snapshot);
      sceneLayoutObserver?.disconnect();
      for (const node of layerWorld.querySelectorAll('.lesson-header, .card--dialog, .dock')) {
        sceneLayoutObserver?.observe(node);
      }
      fitScene();
      syncMovementControls();
      syncRewardAnchor();
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
      yardInput?.destroy();
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', refit);
      layerWorld.removeEventListener('animationend', refit);
      sceneLayoutObserver?.disconnect();
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
