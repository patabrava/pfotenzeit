import { describe, expect, it } from 'vitest';
import { back, createRouter, navigate, type RouterWindowLike } from '../../src/app/routes';
import { INITIAL_APP_STATE, type AppState } from '../../src/app/appState';
import type { Store, StoreListener, StoreSnapshot } from '../../src/state/store';
import { createDemoSave, createTestProviders } from '../../src/simulation/fixtures';
import { createNewMeta } from '../../src/simulation/save';
import { createMemoryRepository } from '../../src/storage/memoryRepository';
import { content } from '../../src/content';

function createAppStore(app: Partial<AppState> = {}): Store {
  const save = createDemoSave();
  const listeners = new Set<StoreListener>();
  let state: StoreSnapshot = { save, app: { ...INITIAL_APP_STATE, ...app }, meta: createNewMeta(save.saveId) };
  const store: Store = {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async dispatch() {
      return { save, outcome: 'rejected', effects: [] };
    },
    async dispatchMeta() {},
    patchApp(patch) {
      const next = typeof patch === 'function' ? patch(state.app) : patch;
      state = { ...state, app: { ...state.app, ...next } };
      for (const listener of listeners) listener(state, 'app');
    },
    act() {
      return store.dispatch({} as never);
    },
    providers: createTestProviders(),
    content,
    repository: createMemoryRepository(),
    async debugReplaceSave() {},
  };
  return store;
}

/** History stand-in with a real entry stack and synchronous popstate. */
function createFakeWindow() {
  const entries: unknown[] = [null];
  let index = 0;
  const popListeners = new Set<(event: { state: unknown }) => void>();
  const win: RouterWindowLike & { readonly length: number; readonly index: number; triggerBack(): void } = {
    history: {
      get state() {
        return entries[index];
      },
      pushState(data) {
        entries.splice(index + 1);
        entries.push(data);
        index += 1;
      },
      replaceState(data) {
        entries[index] = data;
      },
      go(delta) {
        index = Math.max(0, Math.min(entries.length - 1, index + delta));
        for (const listener of popListeners) listener({ state: entries[index] });
      },
    },
    addEventListener(_type, listener) {
      popListeners.add(listener);
    },
    removeEventListener(_type, listener) {
      popListeners.delete(listener);
    },
    get length() {
      return entries.length;
    },
    get index() {
      return index;
    },
    triggerBack() {
      win.history.go(-1);
    },
  };
  return win;
}

describe('routes', () => {
  it('navigate sets route and previousRoute and closes overlays', () => {
    const store = createAppStore({ hintOpen: true });
    navigate(store, 'profile');
    expect(store.get().app).toMatchObject({ route: 'profile', previousRoute: 'home', hintOpen: false });
  });

  it('back closes overlays first, then returns to the previous route, then reports false at home', () => {
    const store = createAppStore();
    navigate(store, 'profile');
    store.patchApp({ everydayOpen: true });
    expect(back(store)).toBe(true);
    expect(store.get().app.everydayOpen).toBe(false);
    expect(store.get().app.route).toBe('profile');
    expect(back(store)).toBe(true);
    expect(store.get().app.route).toBe('home');
    expect(back(store)).toBe(false);
  });

  it('router mirrors routes into history and popstate restores them', () => {
    const store = createAppStore();
    const win = createFakeWindow();
    const router = createRouter(store, win);
    router.start();
    expect(win.history.state).toMatchObject({ pz: true, route: 'home', depth: 0 });

    navigate(store, 'profile');
    expect(win.length).toBe(2);
    navigate(store, 'school');
    expect(win.length).toBe(3);

    win.triggerBack();
    expect(store.get().app.route).toBe('profile');
    win.triggerBack();
    expect(store.get().app.route).toBe('home');
    expect(win.index).toBe(0);
    router.stop();
  });

  it('navigating home pops back to the root instead of growing the stack', () => {
    const store = createAppStore();
    const win = createFakeWindow();
    const router = createRouter(store, win);
    router.start();
    navigate(store, 'profile');
    navigate(store, 'settings');
    expect(win.index).toBe(2);
    navigate(store, 'home');
    expect(win.index).toBe(0);
    expect(store.get().app.route).toBe('home');
    navigate(store, 'profile');
    expect(win.index).toBe(1);
    expect(win.length).toBe(2);
    router.stop();
  });
});
