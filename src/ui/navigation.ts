/**
 * Route helpers for the UI. `navigate` is WP-C's (src/app/routes.ts, history-mirrored). `goBack` is
 * the in-app back button: it restores the previous route including `lesson` (05 PROFILE: "Zurückbutton
 * stellt vorherigen Ort wieder her"), unlike the browser-back semantics in routes.ts.
 */
import type { Route } from '../app/appState';
import { navigate as routeNavigate } from '../app/routes';
import type { Store } from '../state/store';

export function navigate(store: Store, route: Route): void {
  routeNavigate(store, route);
}

export function goBack(store: Store): void {
  const { app } = store.get();
  const target: Route =
    app.previousRoute === app.route ||
    app.previousRoute === 'reflection' ||
    app.previousRoute === 'memorial' ||
    app.previousRoute === 'school' ||
    (app.previousRoute === 'lesson' && !store.get().save.currentVisit)
      ? 'home'
      : app.previousRoute;
  routeNavigate(store, target);
}
