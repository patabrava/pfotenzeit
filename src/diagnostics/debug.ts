/**
 * Dev-only debug panel (14 D: "Debugkontrollen dürfen Uhr, Zustand, Lektionen und Tierstatus
 * setzen, aber nur in Dev/Test"). Mounted by boot only when import.meta.env.DEV. Never player UI.
 *
 * Open/close: floating "DBG" button (bottom-left) or Ctrl+Shift+D. Visibility mirrors app.debugOpen.
 * Every mutation goes through store.dispatch / store.dispatchMeta / store.debugReplaceSave.
 */
import type { Store } from '../state/store';
import type { Lifecycle } from '../app/lifecycle';
import type { RendererHandle } from '../render/types';
import type { LessonId, Mode, NeedValues, Save, VitalityBand } from '../simulation/types';
import { getBootTimings, createFpsSampler, memorySnapshot, storageEstimate } from './metrics';
import type { IndexedDbRepository } from '../storage/database';
import { isRoute, navigate } from '../app/routes';

export interface DebugPanelDeps {
  root: HTMLElement;
  lifecycle?: Lifecycle;
  getRenderer?: () => Promise<RendererHandle | null>;
  /** Boot-provided export/import (also used by the settings UI). */
  exportData?: () => Promise<void>;
  importData?: () => Promise<{ ok: boolean; message: string }>;
  appVersion?: string;
  ownershipTabId?: string;
}

export interface DebugPanel {
  destroy(): void;
}

const NEED_KEYS: Array<keyof NeedValues> = ['satiety', 'energy', 'comfort', 'arousal', 'stress', 'vitality'];
const BAND_VITALITY: Record<VitalityBand, number> = { stable: 100, impaired: 45, critical: 15, lost: 0 };
const HOUR = 3_600_000;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, children: Array<Node | string> = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

function button(label: string, onClick: () => void | Promise<void>, title = ''): HTMLButtonElement {
  const node = el('button', { type: 'button', text: label, title });
  node.addEventListener('click', () => {
    void Promise.resolve(onClick()).catch((error: unknown) => console.error('[debug]', error));
  });
  return node;
}

function section(title: string, ...children: Array<Node | string>): HTMLElement {
  return el('section', { class: 'pz-debug__section' }, [el('h3', { text: title }), ...children]);
}

function row(...children: Array<Node | string>): HTMLElement {
  return el('div', { class: 'pz-debug__row' }, children);
}

const STYLE = `
.pz-debug-toggle{position:fixed;left:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:9998;font:600 11px/1 system-ui,sans-serif;padding:6px 8px;border-radius:6px;border:1px solid #555;background:#222;color:#eee;opacity:.6}
.pz-debug-toggle:hover,.pz-debug-toggle:focus-visible{opacity:1}
.pz-debug{position:fixed;inset:auto 0 0 0;max-height:70vh;overflow:auto;z-index:9999;background:#161616;color:#eee;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;padding:8px 12px calc(12px + env(safe-area-inset-bottom,0px));border-top:2px solid #e5a33a;box-shadow:0 -4px 16px rgba(0,0,0,.4)}
.pz-debug[hidden]{display:none}
.pz-debug h2{margin:0 0 6px;font-size:13px;display:flex;justify-content:space-between;align-items:center}
.pz-debug h3{margin:8px 0 4px;font-size:12px;color:#e5a33a}
.pz-debug__section{border-top:1px solid #333;padding-top:4px}
.pz-debug__row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0}
.pz-debug button{font:inherit;padding:4px 8px;border-radius:4px;border:1px solid #666;background:#2a2a2a;color:#eee;cursor:pointer;min-height:28px}
.pz-debug button:hover{background:#3a3a3a}
.pz-debug input[type=number],.pz-debug select{font:inherit;width:5em;background:#111;color:#eee;border:1px solid #555;border-radius:4px;padding:2px 4px}
.pz-debug input[type=range]{width:100px}
.pz-debug label{display:inline-flex;align-items:center;gap:4px}
.pz-debug pre{margin:0;white-space:pre-wrap;word-break:break-all;color:#bbb;max-height:160px;overflow:auto;background:#0d0d0d;padding:6px;border-radius:4px}
.pz-debug .warn{color:#f28b82}
`;

export function mountDebugPanel(store: Store, deps: DebugPanelDeps): DebugPanel {
  const style = el('style', { text: STYLE });
  document.head.append(style);

  const toggle = button('DBG', () => store.patchApp((app) => ({ debugOpen: !app.debugOpen })), 'Debug panel (Ctrl+Shift+D)');
  toggle.className = 'pz-debug-toggle';
  const panel = el('aside', { class: 'pz-debug', 'aria-label': 'Debug panel', hidden: '' });
  const status = el('div', { class: 'pz-debug__row' });
  const metricsOut = el('pre', { text: '' });
  const stateOut = el('pre', { text: '' });
  const fps = createFpsSampler();
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let lastMessage = '';

  function say(message: string, isWarning = false): void {
    lastMessage = message;
    status.textContent = message;
    status.className = `pz-debug__row${isWarning ? ' warn' : ''}`;
  }

  async function replace(mutate: (save: Save) => Save, label: string): Promise<void> {
    const current = store.get().save;
    await store.debugReplaceSave(mutate(structuredClone(current)));
    say(`${label} → revision ${store.get().save.revision}`);
  }

  async function advanceActive(minutes: number): Promise<void> {
    await deps.lifecycle?.flush();
    const result = await store.act('TICK_ACTIVE', { activeMs: minutes * 60_000 });
    say(`TICK_ACTIVE ${minutes} min → ${result.outcome}${result.reason ? ` (${result.reason})` : ''}`);
  }

  async function advanceOffline(hours: number): Promise<void> {
    await deps.lifecycle?.flush();
    await replace((save) => ({ ...save, lastSeenUTC: save.lastSeenUTC - hours * HOUR }), `lastSeenUTC −${hours} h`);
    const result = await store.act('APPLY_OFFLINE', {});
    const offline = result.effects.find((effect) => effect.type === 'offlineApplied');
    say(
      `APPLY_OFFLINE → ${result.outcome}${result.reason ? ` (${result.reason})` : ''}${
        offline && offline.type === 'offlineApplied' ? ` credited ${offline.creditedHours} h, losses ${JSON.stringify(offline.losses)}` : ''
      }`,
    );
  }

  // --- Clock -------------------------------------------------------------
  const minutesInput = el('input', { type: 'number', value: '5', min: '1', step: '1' });
  const hoursInput = el('input', { type: 'number', value: '2', min: '0.1', step: '0.5' });
  const clock = section(
    'Clock',
    row(
      'Active:',
      button('+1 min', () => advanceActive(1)),
      button('+10 min', () => advanceActive(10)),
      button('+1 h', () => advanceActive(60)),
      minutesInput,
      button('+N min', () => advanceActive(Math.max(1, Number(minutesInput.value) || 1))),
    ),
    row(
      'Offline:',
      button('+1 h', () => advanceOffline(1)),
      button('+8 h', () => advanceOffline(8)),
      button('+24 h', () => advanceOffline(24)),
      hoursInput,
      button('+N h', () => advanceOffline(Math.max(0.1, Number(hoursInput.value) || 1))),
      button('CLOSE_APP', async () => say(`CLOSE_APP → ${(await store.act('CLOSE_APP', {})).outcome}`)),
      button('flush lifecycle', async () => {
        await deps.lifecycle?.flush();
        say('lifecycle flushed');
      }),
    ),
  );

  // --- Needs -------------------------------------------------------------
  const sliders = new Map<keyof NeedValues, HTMLInputElement>();
  const needRows = NEED_KEYS.map((key) => {
    const input = el('input', { type: 'range', min: '0', max: '100', step: '1', value: '80' });
    const value = el('span', { text: '80' });
    input.addEventListener('input', () => (value.textContent = input.value));
    sliders.set(key, input);
    return el('label', {}, [`${key}`, input, value]);
  });
  const needs = section(
    'Needs',
    row(...needRows),
    row(
      button('Apply needs', () =>
        replace((save) => {
          const dog = { ...save.dog };
          for (const [key, input] of sliders) dog[key] = Number(input.value);
          return { ...save, dog };
        }, 'needs set'),
      ),
      button('Read current', () => {
        const dog = store.get().save.dog;
        for (const [key, input] of sliders) {
          input.value = String(Math.round(dog[key]));
          input.dispatchEvent(new Event('input'));
        }
        say('sliders loaded from save');
      }),
      button('All to 0 (satiety/energy)', () =>
        replace((save) => ({ ...save, dog: { ...save.dog, satiety: 0, energy: 0 } }), 'satiety/energy = 0'),
      ),
    ),
  );

  // --- Mode + band ---------------------------------------------------------
  const modeSelect = el('select', {}, [el('option', { value: 'standard', text: 'standard' }), el('option', { value: 'challenge', text: 'challenge' })]);
  const modeAndBand = section(
    'Mode / band',
    row(
      'Mode:',
      modeSelect,
      button('SELECT_MODE', async () => {
        const mode = modeSelect.value as Mode;
        await store.dispatchMeta({ type: 'SELECT_MODE', mode, nowUTC: store.providers.nowUTC() });
        say(`SELECT_MODE ${mode} → active ${store.get().meta.activeMode}, save ${store.get().save.saveId}`);
      }),
      button('CREATE_SAVE (new run)', async () => {
        const mode = modeSelect.value as Mode;
        await store.dispatchMeta({ type: 'CREATE_SAVE', mode, nowUTC: store.providers.nowUTC() });
        say(`CREATE_SAVE ${mode} → ${store.get().save.saveId}`);
      }),
      button('ARCHIVE_CHALLENGE', async () => {
        await store.dispatchMeta({ type: 'ARCHIVE_CHALLENGE', nowUTC: store.providers.nowUTC() });
        say(`archived; archives ${store.get().meta.archives.length}`);
      }),
    ),
    row(
      'Force band:',
      ...(Object.keys(BAND_VITALITY) as VitalityBand[]).map((band) =>
        button(band, () => {
          if (store.get().save.mode !== 'challenge') {
            say('bands only exist in challenge mode (standard is always stable)', true);
            return;
          }
          const vitality = BAND_VITALITY[band];
          return replace(
            (save) => ({
              ...save,
              dog: { ...save.dog, vitality, status: band === 'lost' ? 'lost' : 'alive' },
              lostAtUTC: band === 'lost' ? store.providers.nowUTC() : null,
            }),
            `vitality = ${vitality} (${band})`,
          );
        }),
      ),
      button('PAUSE_CHALLENGE', async () => say(`→ ${(await store.act('PAUSE_CHALLENGE', {})).outcome}`)),
      button('RESUME_CHALLENGE', async () => say(`→ ${(await store.act('RESUME_CHALLENGE', {})).outcome}`)),
    ),
  );

  // --- Lessons / progression ---------------------------------------------
  function completeLesson(lessonId: LessonId, helpful: boolean, careClosure: boolean): Promise<void> {
    return replace((save) => {
      const visitId = store.providers.id(`debugvisit_${lessonId}`);
      return {
        ...save,
        completedLessonIds: save.completedLessonIds.includes(lessonId) ? save.completedLessonIds : [...save.completedLessonIds, lessonId],
        helpfulVisitIds: helpful ? [...save.helpfulVisitIds, visitId] : save.helpfulVisitIds,
        careClosureVisitIds: careClosure ? [...save.careClosureVisitIds, visitId] : save.careClosureVisitIds,
        rewardedVisitIds: [...save.rewardedVisitIds, visitId],
        visitCount: save.visitCount + 1,
        school: { ...save.school, marks: save.school.marks + 1 },
        currentVisit: null,
      };
    }, `${lessonId} completed (${helpful ? 'helpful' : 'neutral'}${careClosure ? ', careClosure' : ''})`);
  }
  const lessons = section(
    'Lessons / progression',
    row(
      ...(['L01', 'L02', 'L03'] as LessonId[]).map((id) => button(`complete ${id}`, () => completeLesson(id, true, false))),
      button('complete L01 as careClosure', () => completeLesson('L01', true, true)),
      button('growth prerequisites', async () => {
        await completeLesson('L01', true, true);
        await completeLesson('L02', true, false);
        await completeLesson('L03', true, false);
      }),
    ),
    row(
      button('+5 marks', () => replace((save) => ({ ...save, school: { ...save.school, marks: save.school.marks + 5 } }), '+5 marks')),
      button('learn all points', () =>
        replace(
          (save) => ({
            ...save,
            dog: { ...save.dog, learnedPoints: ['criterion_context', 'criterion_orientation', 'criterion_support'] },
            rewardedLearningIds: ['criterion_context', 'criterion_orientation', 'criterion_support'],
          }),
          'all learning points learned',
        ),
      ),
      button('abandon visit', async () => say(`ABANDON_VISIT → ${(await store.act('ABANDON_VISIT', {})).outcome}`)),
      button('CONFIRM_GROWTH', async () => say(`→ ${(await store.act('CONFIRM_GROWTH', {})).outcome}`)),
    ),
  );

  // --- Routes / app ---------------------------------------------------------
  const routeSelect = el('select', {}, ['home', 'profile', 'lesson', 'school', 'settings', 'reflection', 'memorial', 'mode'].map((r) => el('option', { value: r, text: r })));
  const appSection = section(
    'App state',
    row(
      'Route:',
      routeSelect,
      button('go', () => {
        if (isRoute(routeSelect.value)) navigate(store, routeSelect.value);
      }),
      button('toggle user pause', () =>
        store.patchApp((app) => ({
          pauseReasons: app.pauseReasons.includes('user') ? app.pauseReasons.filter((r) => r !== 'user') : [...app.pauseReasons, 'user'],
        })),
      ),
      button('clear returnSummary', () => store.patchApp({ returnSummary: null })),
      button('toast', () => store.patchApp({ toast: { id: Date.now(), text: 'Debug-Hinweis' } })),
    ),
  );

  // --- Renderer -------------------------------------------------------------
  function findGl(): WebGLRenderingContext | WebGL2RenderingContext | null {
    const canvas = deps.root.querySelector('canvas');
    if (!canvas) return null;
    return (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ?? (canvas.getContext('webgl') as WebGLRenderingContext | null);
  }
  let loseExt: { loseContext(): void; restoreContext(): void } | null = null;
  const renderer = section(
    'Renderer',
    row(
      button('load renderer', async () => {
        const handle = await deps.getRenderer?.();
        say(handle ? `renderer status ${handle.getStatus()}` : 'renderer module not available', !handle);
      }),
      button('lose WebGL context', () => {
        const gl = findGl();
        if (!gl) {
          say('no canvas / WebGL context in #app', true);
          return;
        }
        loseExt = gl.getExtension('WEBGL_lose_context');
        if (!loseExt) {
          say('WEBGL_lose_context not supported', true);
          return;
        }
        loseExt.loseContext();
        say('context lost (WEBGL_lose_context)');
      }),
      button('restore WebGL context', () => {
        if (!loseExt) {
          say('lose it first', true);
          return;
        }
        loseExt.restoreContext();
        say('context restore requested');
      }),
    ),
  );

  // --- Storage ----------------------------------------------------------------
  const storage = section(
    'Storage',
    row(
      button('export JSON', async () => {
        if (!deps.exportData) return say('export not wired', true);
        await deps.exportData();
        say('export triggered');
      }),
      button('import JSON', async () => {
        if (!deps.importData) return say('import not wired', true);
        const result = await deps.importData();
        say(result.message, !result.ok);
      }),
      button('list backups', async () => {
        const repo = store.repository as Partial<IndexedDbRepository>;
        if (!repo.listBackups) return say('repository has no backups store (memory fallback)', true);
        const backups = await repo.listBackups();
        stateOut.textContent = JSON.stringify(
          backups.map((b) => ({ key: String(b.key), createdUTC: new Date(b.createdUTC).toISOString(), reason: b.reason })),
          null,
          1,
        );
        say(`${backups.length} backup(s)`);
      }),
      button('ledger', async () => {
        const repo = store.repository as Partial<IndexedDbRepository>;
        if (!repo.listLedger) return say('no ledger (memory fallback)', true);
        const entries = await repo.listLedger(store.get().save.saveId);
        stateOut.textContent = JSON.stringify(entries.slice(-20), null, 1);
        say(`${entries.length} ledger entries (last 20 shown)`);
      }),
      button('DELETE DATABASE + reload', async () => {
        if (!window.confirm('Delete the local Pfotenzeit database? This removes all saves on this device.')) return;
        store.repository.close();
        const name = (store.repository as Partial<IndexedDbRepository>).name ?? 'pfotenzeit';
        await new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = request.onerror = request.onblocked = () => resolve();
        });
        window.location.reload();
      }),
    ),
  );

  // --- Metrics -------------------------------------------------------------------
  async function refresh(): Promise<void> {
    const { save, app, meta } = store.get();
    const rendererHandle = deps.getRenderer ? await Promise.race([deps.getRenderer(), Promise.resolve(null)]) : null;
    const estimate = await storageEstimate();
    const metrics = {
      appVersion: deps.appVersion ?? null,
      boot: getBootTimings(),
      fps: fps.running() ? fps.fps() : 'sampler off',
      memory: memorySnapshot(),
      storage: estimate,
      renderer: rendererHandle ? rendererHandle.getMetrics() : app.rendererStatus,
      lifecycle: deps.lifecycle ? { active: deps.lifecycle.isActive(), pendingActiveMs: deps.lifecycle.pendingActiveMs() } : null,
      ownershipTabId: deps.ownershipTabId ?? null,
    };
    metricsOut.textContent = JSON.stringify(metrics, null, 1);
    const compact = {
      saveId: save.saveId,
      mode: save.mode,
      revision: save.revision,
      lastSeenUTC: new Date(save.lastSeenUTC).toISOString(),
      careActiveMsRemainder: save.careActiveMsRemainder,
      dog: {
        name: save.dog.name,
        stage: save.dog.growthStage,
        status: save.dog.status,
        ...Object.fromEntries(NEED_KEYS.map((key) => [key, Math.round(save.dog[key] * 10) / 10])),
      },
      school: save.school,
      completedLessonIds: save.completedLessonIds,
      visit: save.currentVisit ? { id: save.currentVisit.id, lesson: save.currentVisit.lessonId, phase: save.currentVisit.phase, index: save.currentVisit.index } : null,
      pendingPresentation: save.pendingPresentation ? save.pendingPresentation.transactionId : null,
      meta: { activeMode: meta.activeMode, saveIds: meta.saveIds, archives: meta.archives.length },
      app: {
        route: app.route,
        pauseReasons: app.pauseReasons,
        ownership: app.ownership,
        storageError: app.storageError,
        rendererStatus: app.rendererStatus,
        presenting: app.presenting,
        online: app.online,
        returnSummary: app.returnSummary,
      },
    };
    if (!stateOut.dataset['pinned']) stateOut.textContent = JSON.stringify(compact, null, 1);
    if (lastMessage) status.textContent = lastMessage;
  }
  const metrics = section(
    'Metrics',
    row(
      button('refresh', refresh),
      button('FPS sampler on/off', () => {
        if (fps.running()) fps.stop();
        else fps.start();
        void refresh();
      }),
      button('log state to console', () => console.log('[debug] snapshot', store.get())),
    ),
    metricsOut,
    el('h3', { text: 'Save / app (compact)' }),
    stateOut,
  );

  const header = el('h2', {}, ['Pfotenzeit debug (dev only)', button('close', () => store.patchApp({ debugOpen: false }))]);
  panel.append(header, status, clock, needs, modeAndBand, lessons, appSection, renderer, storage, metrics);
  document.body.append(toggle, panel);

  function applyVisibility(open: boolean): void {
    panel.hidden = !open;
    if (open) {
      void refresh();
      if (refreshTimer === null) refreshTimer = setInterval(() => void refresh(), 1000);
    } else if (refreshTimer !== null) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  const unsubscribe = store.subscribe((snapshot, change) => {
    if (change === 'app') applyVisibility(snapshot.app.debugOpen);
  });
  applyVisibility(store.get().app.debugOpen);

  function onKey(event: KeyboardEvent): void {
    if (event.ctrlKey && event.shiftKey && (event.key === 'D' || event.key === 'd')) {
      event.preventDefault();
      store.patchApp((app) => ({ debugOpen: !app.debugOpen }));
    }
  }
  window.addEventListener('keydown', onKey);

  return {
    destroy() {
      unsubscribe();
      window.removeEventListener('keydown', onKey);
      fps.stop();
      if (refreshTimer !== null) clearInterval(refreshTimer);
      toggle.remove();
      panel.remove();
      style.remove();
    },
  };
}
