/**
 * Service-worker registration and update flow (14 E, 09 Offline).
 *
 * - Registers only in production builds and only over https or localhost.
 * - A new worker waits. The update is surfaced only outside a lesson and after the next successful
 *   commit (store 'save' change without storage error) by adding the 'update' pause reason; the UI
 *   shows "Update verfügbar" and either calls `applyUpdate()` (skipWaiting → controllerchange →
 *   one reload) or removes the reason to postpone.
 * - Registration failure (e.g. sw.js not built yet) is logged, never fatal.
 */
import type { Store } from '../state/store';

export interface ServiceWorkerHandle {
  /** True once a new version is installed and waiting. */
  updateReady(): boolean;
  /** Activates the waiting worker; the page reloads on controllerchange. */
  applyUpdate(): void;
  destroy(): void;
}


export function canRegisterServiceWorker(): boolean {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  if (typeof location === 'undefined') return false;
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  return import.meta.env.PROD && secure;
}

export function registerServiceWorker(store: Store, swUrl: string = `${import.meta.env.BASE_URL}sw.js`): ServiceWorkerHandle | null {
  if (!canRegisterServiceWorker()) return null;

  let registration: ServiceWorkerRegistration | null = null;
  let waiting: ServiceWorker | null = null;
  let announced = false;
  let reloading = false;
  let hadController = navigator.serviceWorker.controller !== null;
  let unsubscribe: (() => void) | null = null;

  function maybeAnnounce(): void {
    if (!waiting || announced) return;
    const { app } = store.get();
    if (app.route === 'lesson' || app.storageError) return;
    announced = true;
    store.patchApp((current) => ({
      pauseReasons: current.pauseReasons.includes('update') ? current.pauseReasons : [...current.pauseReasons, 'update'],
    }));
  }

  function trackInstalling(worker: ServerWorkerLike | null): void {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        waiting = worker as ServiceWorker;
        // Announce after the next successful commit, never mid-lesson.
        unsubscribe?.();
        unsubscribe = store.subscribe((snapshot, change) => {
          if (change === 'save' && !snapshot.app.storageError) maybeAnnounce();
        });
      }
    });
  }

  type ServerWorkerLike = Pick<ServiceWorker, 'state' | 'addEventListener'>;

  const onControllerChange = () => {
    // The first install claims an already loaded page. Its code is current;
    // reloading here would interrupt onboarding or a first care action.
    if (!hadController) {
      hadController = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

  navigator.serviceWorker
    .register(swUrl)
    .then((reg) => {
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) {
        waiting = reg.waiting;
        unsubscribe = store.subscribe((snapshot, change) => {
          if (change === 'save' && !snapshot.app.storageError) maybeAnnounce();
        });
      }
      trackInstalling(reg.installing);
      reg.addEventListener('updatefound', () => trackInstalling(reg.installing));
    })
    .catch((error: unknown) => {
      console.warn('[sw] registration failed', error);
    });

  return {
    updateReady: () => waiting !== null,
    applyUpdate() {
      if (!waiting) return;
      waiting.postMessage({ type: 'SKIP_WAITING' });
    },
    destroy() {
      unsubscribe?.();
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      void registration;
    },
  };
}
