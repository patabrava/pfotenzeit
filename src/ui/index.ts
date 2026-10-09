/**
 * mountUi(store, deps): builds the shell, subscribes to the store, wires presenter, audio and renderer.
 * WP-C calls this from boot after the store exists and ownership is known.
 */
import './fonts.css';
import './styles.css';
import type { Route } from '../app/appState';
import { createAudioManager } from '../audio/AudioManager';
import { installFonts } from './fonts';
import type { RendererHandle, RendererStatus } from '../render/types';
import { getSceneDirective } from '../simulation/selectors';
import type { Store, StoreSnapshot } from '../state/store';
import { createAppShell } from './AppShell';
import type { UiContext, UiDeps } from './context';
import { goBack, navigate } from './navigation';
import { createPlaceholderPixelDog, loadPixelDogFactory, type PixelDogFactory } from './pixelBridge';
import { createPresenter } from './presenter';
import { openCareSheet, openLessonPicker } from './sheets';
import { t } from './strings';

export type { UiDeps, ImportOutcome } from './context';
export { mountRecovery } from './RecoveryView';

export interface UiHandle {
  root: HTMLElement;
  sceneContainer: HTMLElement;
  destroy(): void;
}

export function mountUi(store: Store, deps: UiDeps, host: HTMLElement | null = document.getElementById('app')): UiHandle {
  if (!host) throw new Error('mountUi: host element missing');
  installFonts();
  const appVersion = deps.appVersion ?? (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.1.0';
  const audio = createAudioManager(store.get().save.settings.audioEnabled);
  audio.installUnlock(document);

  let renderer: RendererHandle | null = null;
  let pixelFactory: PixelDogFactory = createPlaceholderPixelDog;
  let toastCounter = 0;
  let destroyed = false;

  const presenter = createPresenter({ store, audio, getRenderer: () => renderer });

  const shell = createAppShell(() => ctx);

  const ctx: UiContext = {
    store,
    content: store.content,
    audio,
    deps,
    appVersion,
    presenter,
    modalHost: shell.modalHost,
    getRenderer: () => renderer,
    getPixelFactory: () => pixelFactory,
    navigate: (route: Route) => navigate(store, route),
    goBack: () => goBack(store),
    toast(text) {
      toastCounter += 1;
      store.patchApp({ toast: { id: toastCounter, text } });
    },
    announce: (text) => shell.announce(text),
    openCareSheet: () => openCareSheet(ctx),
    openLessonPicker: () => openLessonPicker(ctx),
    openSchoolSheet: () => navigate(store, 'school'),
    async exportSave() {
      try {
        if (deps.exportData) await deps.exportData();
        else if (deps.onExport) await deps.onExport();
        else await fallbackExport(store, appVersion);
        ctx.toast(t.settings.exportDone);
      } catch (error) {
        console.error('[ui] export failed', error);
        ctx.toast(t.settings.exportFailed);
      }
    },
    hasImportPicker: () => typeof deps.importData === 'function',
    async importSave(file) {
      try {
        if (deps.importData) {
          const outcome = await deps.importData();
          if (outcome.message) ctx.toast(outcome.message);
          return;
        }
        if (!file) return;
        if (deps.onImport) await deps.onImport(file);
        else await fallbackImport(store, file);
        ctx.toast(t.settings.importDone);
      } catch (error) {
        console.error('[ui] import failed', error);
        ctx.toast(t.settings.importFailed);
      }
    },
  };

  host.replaceChildren(shell.root);
  host.setAttribute('aria-busy', 'false');

  // --- reduced motion: system preference combined with the save setting → app.reducedMotion
  const motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function computeReducedMotion(snapshot: StoreSnapshot): boolean {
    const override = snapshot.save.settings.reducedMotionOverride;
    if (override === 'on') return true;
    if (override === 'off') return false;
    return motionQuery?.matches ?? false;
  }
  function syncReducedMotion(snapshot: StoreSnapshot): void {
    const reduced = computeReducedMotion(snapshot);
    if (reduced !== snapshot.app.reducedMotion) store.patchApp({ reducedMotion: reduced });
    document.documentElement.dataset.reducedMotion = String(reduced);
  }
  const onMotionChange = (): void => syncReducedMotion(store.get());
  motionQuery?.addEventListener('change', onMotionChange);

  // --- renderer wiring
  let lastDirectiveKey = '';
  let lastActive: boolean | null = null;
  let lastReduced: boolean | null = null;
  let lastQuality: string | null = null;
  let statusUnsubscribe: (() => void) | null = null;

  function syncRenderer(snapshot: StoreSnapshot): void {
    if (!renderer) return;
    const { app, save } = snapshot;
    const directive = getSceneDirective(save, store.content, { route: app.route });
    const key = JSON.stringify(directive);
    if (key !== lastDirectiveKey) {
      lastDirectiveKey = key;
      try {
        renderer.apply(directive);
      } catch (error) {
        console.warn('[ui] renderer.apply failed', error);
      }
    }
    const active = (app.route === 'home' || app.route === 'lesson') && app.pauseReasons.length === 0 && app.ownership !== 'other';
    if (active !== lastActive) {
      lastActive = active;
      renderer.setActive(active);
    }
    if (app.reducedMotion !== lastReduced) {
      lastReduced = app.reducedMotion;
      renderer.setReducedMotion(app.reducedMotion);
    }
    if (save.settings.qualityTier !== lastQuality) {
      lastQuality = save.settings.qualityTier;
      renderer.setQuality(save.settings.qualityTier);
    }
  }

  async function attachRenderer(): Promise<void> {
    store.patchApp({ rendererStatus: 'loading' });
    try {
      const handle = await deps.getRenderer();
      if (destroyed) return;
      if (!handle) {
        store.patchApp({ rendererStatus: 'failed' });
        return;
      }
      renderer = handle;
      statusUnsubscribe = handle.onStatus((status: RendererStatus) => store.patchApp({ rendererStatus: status }));
      const status = await handle.mount(shell.sceneContainer);
      if (destroyed) return;
      store.patchApp({ rendererStatus: status });
      syncRenderer(store.get());
    } catch (error) {
      console.error('[ui] renderer unavailable', error);
      store.patchApp({ rendererStatus: 'failed' });
    }
  }

  // --- presenter → shell reactions (toasts, reward card, memorial redirect)
  const unsubscribeEffects = presenter.onEffectShown((effect, snapshot) => {
    const name = snapshot.save.dog.name;
    switch (effect.type) {
      case 'visitRewarded':
        shell.showReward(effect, snapshot);
        break;
      case 'upgradeBought':
        ctx.toast(t.school.bought(store.content.upgrades[effect.upgradeId].label));
        break;
      case 'growth':
        ctx.toast(t.toasts.growthDone(name));
        break;
      case 'care':
        if (snapshot.app.route !== 'profile') ctx.toast(t.care.done);
        break;
      case 'lost':
        navigate(store, 'memorial');
        break;
      default:
        break;
    }
  });
  const unsubscribePresenterChange = presenter.onChange(() => {
    if (!destroyed) shell.update(store.get());
  });

  // --- store subscription
  let lastHidden = false;
  const unsubscribeStore = store.subscribe((snapshot, change) => {
    if (destroyed) return;
    if (change === 'save') {
      audio.setEnabled(snapshot.save.settings.audioEnabled);
      syncReducedMotion(snapshot);
    }
    const hidden = snapshot.app.pauseReasons.includes('hidden') || snapshot.app.pauseReasons.includes('blur');
    if (hidden && !lastHidden) audio.stop();
    lastHidden = hidden;
    presenter.update(snapshot);
    shell.update(snapshot);
    syncRenderer(snapshot);
  });

  // Initial paint.
  const initial = store.get();
  syncReducedMotion(initial);
  shell.update(store.get());
  presenter.update(store.get());

  // Pixel factory (WP-B) then renderer (WP-D), both lazy and never blocking the DOM.
  void loadPixelDogFactory().then(({ factory }) => {
    if (destroyed) return;
    pixelFactory = factory;
    shell.update(store.get());
  });
  void attachRenderer();

  return {
    root: shell.root,
    sceneContainer: shell.sceneContainer,
    destroy() {
      destroyed = true;
      unsubscribeStore();
      unsubscribeEffects();
      unsubscribePresenterChange();
      statusUnsubscribe?.();
      motionQuery?.removeEventListener('change', onMotionChange);
      presenter.destroy();
      audio.dispose();
      renderer?.dispose();
      shell.destroy();
    },
  };
}

async function fallbackExport(store: Store, appVersion: string): Promise<void> {
  const bundle = await store.repository.exportAll(appVersion, store.providers.nowUTC());
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date(bundle.exportedUTC).toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pfotenzeit-export-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function fallbackImport(store: Store, file: File): Promise<void> {
  const textContent = await file.text();
  const parsed: unknown = JSON.parse(textContent);
  await store.repository.importAll(parsed, store.providers.nowUTC());
  window.location.reload();
}
