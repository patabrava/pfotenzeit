/**
 * Route helpers. Routes live in transient app state; the router mirrors non-home routes into
 * browser history so the Android back button (popstate) closes sheets / returns home instead
 * of leaving the app (05 Mobile UX).
 */
import type { Store } from '../state/store';
import type { AppState, Route } from './appState';

export const ROUTES: readonly Route[] = ['home', 'profile', 'lesson', 'school', 'settings', 'reflection', 'memorial', 'mode', 'practice'];

export function isRoute(value: unknown): value is Route {
  return typeof value === 'string' && (ROUTES as readonly string[]).includes(value);
}

/** Sets the route (no domain effect, no transaction). Overlays are closed on every route change. */
export function navigate(store: Store, route: Route): void {
  const { app } = store.get();
  if (app.route === route) return;
  store.patchApp({
    route,
    previousRoute: app.route,
    observationTextOpen: false,
    hintOpen: false,
    everydayOpen: false,
  });
}

/** Overlay flags that "back" closes before it changes the route. */
const OVERLAY_FLAGS: Array<keyof Pick<AppState, 'observationTextOpen' | 'hintOpen' | 'everydayOpen' | 'debugOpen'>> = [
  'observationTextOpen',
  'hintOpen',
  'everydayOpen',
  'debugOpen',
];

/** Closes the top-most overlay, otherwise returns to the previous route or home. Returns false at home with nothing open. */
export function back(store: Store): boolean {
  const { app } = store.get();
  for (const flag of OVERLAY_FLAGS) {
    if (app[flag]) {
      store.patchApp({ [flag]: false } as Partial<AppState>);
      return true;
    }
  }
  if (app.route === 'home') return false;
  const target: Route = app.previousRoute !== app.route && app.previousRoute !== 'lesson' ? app.previousRoute : 'home';
  navigate(store, target);
  return true;
}

interface HistoryState {
  pz: true;
  route: Route;
  depth: number;
}

export interface HistoryLike {
  readonly state: unknown;
  pushState(data: unknown, unused: string, url?: string | null): void;
  replaceState(data: unknown, unused: string, url?: string | null): void;
  go(delta: number): void;
}

export interface RouterWindowLike {
  history: HistoryLike;
  addEventListener(type: 'popstate', listener: (event: { state: unknown }) => void): void;
  removeEventListener(type: 'popstate', listener: (event: { state: unknown }) => void): void;
}

export interface Router {
  start(): void;
  stop(): void;
  /** Browser back: closes overlays / returns home. */
  back(): boolean;
}

function isHistoryState(value: unknown): value is HistoryState {
  return typeof value === 'object' && value !== null && (value as { pz?: unknown }).pz === true;
}

/**
 * Mirrors app.route into history: home is the root entry (depth 0); every other route pushes one
 * entry. Navigating home pops back to the root so the stack never grows. popstate restores the
 * route stored in the entry. The URL is left untouched (no hash routing).
 */
export function createRouter(store: Store, win: RouterWindowLike | null = typeof window !== 'undefined' ? window : null): Router {
  let started = false;
  let depth = 0;
  let mirrored: Route = store.get().app.route;
  let expectPops = 0;
  let unsubscribe: (() => void) | null = null;

  function onPopState(event: { state: unknown }): void {
    const state = event.state;
    const route: Route = isHistoryState(state) && isRoute(state.route) ? state.route : 'home';
    depth = isHistoryState(state) ? state.depth : 0;
    mirrored = route;
    if (expectPops > 0) {
      expectPops -= 1;
      // Programmatic pop (navigate home); app state is already correct.
      if (store.get().app.route === route) return;
    }
    const { app } = store.get();
    if (app.route !== route) {
      store.patchApp({ route, previousRoute: app.route, observationTextOpen: false, hintOpen: false, everydayOpen: false });
    }
  }

  function onAppChange(): void {
    if (!win) return;
    const { route } = store.get().app;
    if (route === mirrored) return;
    mirrored = route;
    try {
      if (route === 'home') {
        if (depth > 0) {
          expectPops += 1;
          win.history.go(-depth);
          depth = 0;
        }
        return;
      }
      depth += 1;
      const state: HistoryState = { pz: true, route, depth };
      win.history.pushState(state, '');
    } catch (error) {
      console.warn('[routes] history update failed', error);
    }
  }

  return {
    start() {
      if (started || !win) return;
      started = true;
      const current = win.history.state;
      if (isHistoryState(current) && isRoute(current.route)) {
        // Reloaded on a pushed entry: adopt its route and depth.
        depth = current.depth;
        mirrored = current.route;
        if (store.get().app.route !== current.route) store.patchApp({ route: current.route });
      } else {
        try {
          win.history.replaceState({ pz: true, route: store.get().app.route, depth: 0 } satisfies HistoryState, '');
        } catch (error) {
          console.warn('[routes] replaceState failed', error);
        }
        depth = 0;
      }
      win.addEventListener('popstate', onPopState);
      unsubscribe = store.subscribe((_snapshot, change) => {
        if (change === 'app') onAppChange();
      });
    },
    stop() {
      if (!started || !win) return;
      started = false;
      win.removeEventListener('popstate', onPopState);
      unsubscribe?.();
      unsubscribe = null;
    },
    back: () => back(store),
  };
}
