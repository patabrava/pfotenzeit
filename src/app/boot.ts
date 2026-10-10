/**
 * App boot (14 A): open storage → acquire tab ownership → load/validate save → one offline
 * reconciliation → mount UI → lazy-load the Three scene. New standard save only if none exists.
 *
 * Resilience while other packages land:
 * - `../ui` and `../render/app/GameRenderer` are resolved with import.meta.glob, so a missing
 *   module is a null entry at build time instead of a hard import error. Without `mountUi` a
 *   minimal placeholder is rendered.
 * - A corrupt/invalid save never resets silently: the raw record is backed up, a recovery screen
 *   explains it and offers export of the backup, import of a file, or a fresh start on confirm.
 */
import pkg from '../../package.json';
import { content as defaultContent } from '../content';
import type { ContentCatalog } from '../content/types';
import type { RendererHandle, RendererOptions, RendererStatus } from '../render/types';
import { createNewMeta, createNewSave } from '../simulation/save';
import type { Meta, Providers, Save } from '../simulation/types';
import { createStore, type Store } from '../state/store';
import { createIndexedDbRepository, type IndexedDbRepository } from '../storage/database';
import {
  describeImportErrors,
  downloadBundle,
  downloadJson,
  pickJsonFile,
  readJsonFile,
  safeValidateMeta,
  safeValidateSave,
} from '../storage/importExport';
import { createMemoryRepository } from '../storage/memoryRepository';
import { createTabOwnership } from '../storage/tabOwnership';
import { StorageError, type SaveRepository, type TabOwnership } from '../storage/types';
import { BOOT_MARKS, mark } from '../diagnostics/metrics';
import type { AppState, PauseReason } from './appState';
import { createLifecycle, type Lifecycle } from './lifecycle';
import { createBrowserProviders } from './providers';
import { createRouter, type Router } from './routes';
import { registerServiceWorker, type ServiceWorkerHandle } from './serviceWorker';
import { createWorldController, type WorldController } from './world';

export const APP_VERSION: string = pkg.version;

// ---------------------------------------------------------------------------
// Interfaces other packages code against
// ---------------------------------------------------------------------------

export interface ImportOutcome {
  ok: boolean;
  message: string;
}

/** Dependencies handed to WP-E's mountUi(store, deps). */
export interface UiDeps {
  /** Lazy-loads the renderer module and creates the handle once. Null when the module is unavailable. */
  getRenderer(): Promise<RendererHandle | null>;
  appVersion: string;
  /** Exports all saves as a downloaded JSON file (flushes pending active time first). */
  exportData(): Promise<void>;
  /** Picks a file, validates, backs up, replaces and reloads on success. Never throws. */
  importData(): Promise<ImportOutcome>;
  /** Browser-back semantics: closes overlays / returns home. */
  back(): boolean;
  /** Apply a waiting service-worker update (UI shows "Update verfügbar" when `updateReady`). */
  applyUpdate(): void;
  /** D-041 world controller (yard walking, dog behaviour); absent only in the recovery flow. */
  world?: WorldController;
}

export interface UiHandle {
  destroy?(): void;
}

export interface UiModule {
  mountUi?(store: Store, deps: UiDeps): UiHandle | void | Promise<UiHandle | void>;
  mountRecovery?(root: HTMLElement, flow: RecoveryFlow): UiHandle | void;
}

export interface RendererModule {
  createGameRenderer?(options: RendererOptions): RendererHandle;
  GameRenderer?: new (options: RendererOptions) => RendererHandle;
}

export interface RecoveryProblem {
  kind: 'corrupt' | 'invalid' | 'missing';
  /** German explanation for the player. */
  message: string;
  /** Technical details (validation errors). */
  errors: string[];
  backupKey: string | null;
}

/** Exposed for WP-E's dialog; boot renders a minimal fallback when `mountRecovery` is absent. */
export interface RecoveryFlow {
  problem: RecoveryProblem;
  /** Downloads the backed-up raw data as JSON. */
  downloadBackup(): Promise<void>;
  /** Imports a bundle file and reloads on success. */
  importFile(): Promise<ImportOutcome>;
  /** Creates a new standard save (after explicit confirmation in the UI) and reloads. */
  startFresh(): Promise<void>;
}

export interface BootOptions {
  root?: HTMLElement;
  dbName?: string;
  providers?: Providers;
  content?: ContentCatalog;
  ownership?: TabOwnership & { tabId?: string };
  repository?: SaveRepository;
  /** Skip service-worker registration (tests). */
  serviceWorker?: boolean;
}

export interface BootHandle {
  store: Store | null;
  lifecycle: Lifecycle | null;
  router: Router | null;
  ownership: TabOwnership;
  repository: SaveRepository;
  recovery: RecoveryFlow | null;
  getRenderer: () => Promise<RendererHandle | null>;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Lazy modules (resolved at build time; missing files are simply absent)
// ---------------------------------------------------------------------------

const uiModules = import.meta.glob('../ui/index.ts');
const rendererModules = import.meta.glob('../render/app/GameRenderer.ts');

async function loadUiModule(): Promise<UiModule | null> {
  const loader = uiModules['../ui/index.ts'];
  if (!loader) return null;
  try {
    return (await loader()) as UiModule;
  } catch (error) {
    console.error('[boot] ui module failed to load', error);
    return null;
  }
}

async function loadRendererModule(): Promise<RendererModule | null> {
  const loader = rendererModules['../render/app/GameRenderer.ts'];
  if (!loader) return null;
  try {
    return (await loader()) as RendererModule;
  } catch (error) {
    console.error('[boot] renderer module failed to load', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorMessage(error: unknown): string {
  if (error instanceof StorageError) return `${error.kind}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function effectiveReducedMotion(save: Save): boolean {
  const override = save.settings.reducedMotionOverride;
  if (override === 'on') return true;
  if (override === 'off') return false;
  return prefersReducedMotion();
}

function hasBackup(repository: SaveRepository): repository is IndexedDbRepository {
  return typeof (repository as Partial<IndexedDbRepository>).backup === 'function';
}

function setBusy(root: HTMLElement, busy: boolean): void {
  root.setAttribute('aria-busy', busy ? 'true' : 'false');
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

export async function boot(options: BootOptions = {}): Promise<BootHandle> {
  mark(BOOT_MARKS.start);
  const root = options.root ?? document.getElementById('app') ?? document.body;
  const providers = options.providers ?? createBrowserProviders();
  const content = options.content ?? defaultContent;
  const nowUTC = providers.nowUTC();
  const appPatch: Partial<AppState> = {};
  const pauseReasons: PauseReason[] = [];
  const cleanups: Array<() => void> = [];

  // 2. Storage (fallback to memory on failure).
  let repository: SaveRepository;
  if (options.repository) {
    repository = options.repository;
    await repository.open();
  } else {
    const idb = createIndexedDbRepository(options.dbName);
    try {
      await idb.open();
      repository = idb;
    } catch (error) {
      console.error('[boot] IndexedDB unavailable, using in-memory storage', error);
      repository = createMemoryRepository();
      appPatch.storageError = `Speichern ist in diesem Browser gerade nicht möglich (${errorMessage(error)}). Du kannst spielen, aber der Fortschritt geht beim Schließen verloren. Exportiere deinen Spielstand in den Einstellungen.`;
      pauseReasons.push('storageError');
    }
  }
  mark(BOOT_MARKS.storage);

  // 3. Tab ownership.
  const ownership = options.ownership ?? createTabOwnership();
  const ownershipState = await ownership.acquire();
  mark(BOOT_MARKS.ownership);
  const isOwner = ownershipState === 'owner';
  if (!isOwner) pauseReasons.push('otherTab');

  // Renderer factory (created once, status mirrored into app state once the store exists).
  let rendererPromise: Promise<RendererHandle | null> | null = null;
  let rendererHandle: RendererHandle | null = null;
  let storeRef: Store | null = null;
  const getRenderer = (): Promise<RendererHandle | null> => {
    if (rendererPromise) return rendererPromise;
    rendererPromise = (async () => {
      storeRef?.patchApp({ rendererStatus: 'loading' });
      const module = await loadRendererModule();
      const save = storeRef?.get().save;
      const rendererOptions: RendererOptions = {
        baseUrl: import.meta.env.BASE_URL,
        qualityTier: save?.settings.qualityTier ?? 'auto',
        reducedMotion: storeRef?.get().app.reducedMotion ?? prefersReducedMotion(),
      };
      let handle: RendererHandle | null = null;
      try {
        if (module?.createGameRenderer) handle = module.createGameRenderer(rendererOptions);
        else if (module?.GameRenderer) handle = new module.GameRenderer(rendererOptions);
      } catch (error) {
        console.error('[boot] renderer creation failed', error);
      }
      if (!handle) {
        storeRef?.patchApp({ rendererStatus: 'failed' });
        return null;
      }
      const sync = (status: RendererStatus) => {
        storeRef?.patchApp((app) => ({
          rendererStatus: status,
          pauseReasons:
            status === 'contextLost'
              ? app.pauseReasons.includes('contextLost')
                ? app.pauseReasons
                : [...app.pauseReasons, 'contextLost']
              : app.pauseReasons.filter((reason) => reason !== 'contextLost'),
        }));
      };
      cleanups.push(handle.onStatus(sync));
      sync(handle.getStatus());
      mark(BOOT_MARKS.renderer);
      rendererHandle = handle;
      return handle;
    })();
    return rendererPromise;
  };

  // 4. Load meta + save (owner creates what is missing; a non-owner never writes).
  const loaded = await loadOrCreate(repository, providers, nowUTC, isOwner);
  mark(BOOT_MARKS.save);

  const handleBase = {
    ownership,
    repository,
    getRenderer,
    destroy() {
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };

  if (loaded.kind === 'problem') {
    const recovery = createRecoveryFlow(repository, providers, loaded.problem, root);
    const ui = await loadUiModule();
    if (ui?.mountRecovery) {
      const handle = ui.mountRecovery(root, recovery);
      if (handle?.destroy) cleanups.push(() => handle.destroy?.());
    } else {
      renderRecovery(root, recovery);
    }
    setBusy(root, false);
    mark(BOOT_MARKS.ui);
    return { ...handleBase, store: null, lifecycle: null, router: null, recovery };
  }

  // 5. Store, then exactly one APPLY_OFFLINE (owner only).
  const { save, meta } = loaded;
  const store = createStore({
    repository,
    providers,
    content,
    save,
    meta,
    app: {
      ...appPatch,
      ownership: ownershipState,
      pauseReasons,
      reducedMotion: effectiveReducedMotion(save),
      online: typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true,
    },
  });
  storeRef = store;
  mark(BOOT_MARKS.store);
  if (isOwner) {
    try {
      await store.act('APPLY_OFFLINE', {});
    } catch (error) {
      // Reducer not available yet (WP-A) or unexpected failure: the game still boots.
      console.warn('[boot] APPLY_OFFLINE failed', error);
    }
  }

  if (hasBackup(repository)) {
    cleanups.push(
      repository.onUnavailable((error) => {
        store.patchApp((app) => ({
          storageError: error.message,
          pauseReasons: app.pauseReasons.includes('storageError') ? app.pauseReasons : [...app.pauseReasons, 'storageError'],
        }));
      }),
    );
  }

  // Ownership transitions after boot: becoming owner means the other tab closed → run the full
  // sequence again on fresh data. Losing ownership is mirrored by the lifecycle.
  cleanups.push(
    ownership.onChange((state) => {
      if (state === 'owner' && store.get().app.ownership !== 'owner') {
        window.location.reload();
      }
    }),
  );

  // 6. UI.
  const lifecycle = createLifecycle(store, { ownership });
  const router = createRouter(store);
  let serviceWorker: ServiceWorkerHandle | null = null;
  // D-041: the world controller steps the yard while it is visible; it dispatches nothing itself.
  const world = createWorldController({ store, content, renderer: () => rendererHandle, seed: save.visitCount + 1 });

  const deps: UiDeps = {
    getRenderer,
    appVersion: APP_VERSION,
    exportData: async () => {
      await lifecycle.flush();
      const bundle = await repository.exportAll(APP_VERSION, providers.nowUTC());
      downloadBundle(bundle);
    },
    importData: () => importFromFile(repository, providers, lifecycle),
    back: () => router.back(),
    applyUpdate: () => serviceWorker?.applyUpdate(),
    world,
  };

  const uiModule = await loadUiModule();
  if (uiModule?.mountUi) {
    try {
      const handle = await uiModule.mountUi(store, deps);
      if (handle && typeof handle === 'object' && handle.destroy) cleanups.push(() => handle.destroy?.());
    } catch (error) {
      console.error('[boot] mountUi failed', error);
      renderPlaceholder(root, store, deps, 'Die Oberfläche konnte nicht geladen werden.');
    }
  } else {
    renderPlaceholder(root, store, deps, null);
  }

  // 7. Lifecycle, world loop, marks, busy state.
  router.start();
  lifecycle.start();
  world.start();
  cleanups.push(() => lifecycle.stop(), () => router.stop(), () => world.stop());
  // Steering handle for the e2e smoke and manual checks (all builds, like the store handle): it reads
  // and steers the world only and dispatches nothing to the store.
  if (typeof window !== 'undefined') {
    const win = window as Window & { __pzWorld?: WorldController };
    win.__pzWorld = world;
    cleanups.push(() => {
      if (win.__pzWorld === world) delete win.__pzWorld;
    });
  }
  mark(BOOT_MARKS.ui);
  setBusy(root, false);

  if (import.meta.env.DEV) {
    const { mountDebugPanel } = await import('../diagnostics/debug');
    const panel = mountDebugPanel(store, {
      root,
      lifecycle,
      getRenderer,
      exportData: deps.exportData,
      importData: deps.importData,
      appVersion: APP_VERSION,
      ownershipTabId: options.ownership?.tabId ?? (ownership as { tabId?: string }).tabId,
    });
    cleanups.push(() => panel.destroy());
  }

  if (options.serviceWorker !== false) {
    serviceWorker = registerServiceWorker(store);
    if (serviceWorker) cleanups.push(() => serviceWorker?.destroy());
  }

  return { ...handleBase, store, lifecycle, router, recovery: null };
}

// ---------------------------------------------------------------------------
// Load / create
// ---------------------------------------------------------------------------

type Loaded = { kind: 'ready'; save: Save; meta: Meta } | { kind: 'problem'; problem: RecoveryProblem };

async function loadOrCreate(repository: SaveRepository, providers: Providers, nowUTC: number, isOwner: boolean): Promise<Loaded> {
  let meta: Meta | null = null;
  try {
    meta = await repository.loadMeta();
  } catch (error) {
    if (error instanceof StorageError && error.kind === 'corrupt') {
      return {
        kind: 'problem',
        problem: {
          kind: 'corrupt',
          message: `Deine gespeicherten Spieldaten konnten nicht gelesen werden. Sie wurden gesichert und nicht verändert.\n${error.message}`,
          errors: [error.message],
          backupKey: extractBackupKey(error.message),
        },
      };
    }
    throw error;
  }

  if (!meta) {
    // No meta: either a first start, or saves exist without meta → rebuild meta from them.
    const existingIds = await repository.listSaveIds();
    for (const saveId of existingIds) {
      const candidate = await repository.loadSave(saveId).catch(() => null);
      if (candidate && safeValidateSave(candidate).ok && candidate.mode === 'standard') {
        const rebuilt = createNewMeta(candidate.saveId);
        if (isOwner) await repository.putMeta(rebuilt);
        return { kind: 'ready', save: candidate, meta: rebuilt };
      }
    }
    const save = createNewSave('standard', providers, nowUTC);
    const created = createNewMeta(save.saveId);
    if (isOwner) await repository.commit(save, created);
    return { kind: 'ready', save, meta: created };
  }

  const metaCheck = safeValidateMeta(meta);
  if (!metaCheck.ok || !metaCheck.value) {
    const backupKey = isOwner && hasBackup(repository) ? await repository.backup('invalid-meta', meta) : null;
    return {
      kind: 'problem',
      problem: {
        kind: 'invalid',
        message: 'Die gespeicherte Spielübersicht ist beschädigt. Sie wurde gesichert und nicht verändert.',
        errors: metaCheck.errors,
        backupKey,
      },
    };
  }
  meta = metaCheck.value;

  const activeId = meta.activeMode === 'challenge' && meta.saveIds.challenge ? meta.saveIds.challenge : meta.saveIds.standard;
  let raw: Save | null;
  try {
    raw = await repository.loadSave(activeId);
  } catch (error) {
    if (error instanceof StorageError && error.kind === 'corrupt') {
      return {
        kind: 'problem',
        problem: {
          kind: 'corrupt',
          message: `Dein Spielstand konnte nicht gelesen werden. Er wurde gesichert und nicht verändert.\n${error.message}`,
          errors: [error.message],
          backupKey: extractBackupKey(error.message),
        },
      };
    }
    throw error;
  }

  if (!raw) {
    const others = (await repository.listSaveIds()).filter((id) => id !== activeId);
    if (others.length === 0 && isOwner) {
      // Meta points nowhere and nothing else exists: a fresh standard save is the only sensible state.
      const save = createNewSave('standard', providers, nowUTC);
      const fixed: Meta = { ...meta, activeMode: 'standard', saveIds: { ...meta.saveIds, standard: save.saveId } };
      await repository.commit(save, fixed);
      return { kind: 'ready', save, meta: fixed };
    }
    return {
      kind: 'problem',
      problem: {
        kind: 'missing',
        message: 'Der aktive Spielstand wurde nicht gefunden. Andere Spieldaten sind vorhanden und bleiben unverändert.',
        errors: [`save ${activeId} missing; present: ${others.join(', ') || 'none'}`],
        backupKey: null,
      },
    };
  }

  const check = safeValidateSave(raw);
  if (!check.ok || !check.value) {
    const backupKey = isOwner && hasBackup(repository) ? await repository.backup('invalid-save', raw) : null;
    return {
      kind: 'problem',
      problem: {
        kind: 'invalid',
        message: 'Dein Spielstand ist beschädigt und wurde nicht geladen. Er wurde gesichert und nicht verändert.',
        errors: check.errors,
        backupKey,
      },
    };
  }
  return { kind: 'ready', save: check.value, meta };
}

function extractBackupKey(message: string): string | null {
  const match = /Schlüssel (\S+)\)/.exec(message);
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Import / recovery
// ---------------------------------------------------------------------------

async function importFromFile(repository: SaveRepository, providers: Providers, lifecycle: Lifecycle | null): Promise<ImportOutcome> {
  try {
    const file = await pickJsonFile();
    if (!file) return { ok: false, message: 'Kein Import: keine Datei gewählt.' };
    let parsed: unknown;
    try {
      parsed = await readJsonFile(file);
    } catch {
      return { ok: false, message: describeImportErrors(['Die Datei enthält kein gültiges JSON.']) };
    }
    await lifecycle?.flush();
    const { backupKey } = await repository.importAll(parsed, providers.nowUTC());
    setTimeout(() => window.location.reload(), 300);
    return { ok: true, message: `Spielstand übernommen (Sicherung ${backupKey}). Die Seite wird neu geladen.` };
  } catch (error) {
    return { ok: false, message: error instanceof StorageError ? error.message : describeImportErrors([errorMessage(error)]) };
  }
}

function createRecoveryFlow(repository: SaveRepository, providers: Providers, problem: RecoveryProblem, root: HTMLElement): RecoveryFlow {
  return {
    problem,
    async downloadBackup() {
      const payload: unknown = hasBackup(repository)
        ? await repository.listBackups()
        : { note: 'memory repository has no backups', problem };
      downloadJson(`pfotenzeit-backup-${new Date(providers.nowUTC()).toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
    },
    importFile: () => importFromFile(repository, providers, null),
    async startFresh() {
      setBusy(root, true);
      const nowUTC = providers.nowUTC();
      const save = createNewSave('standard', providers, nowUTC);
      const meta = createNewMeta(save.saveId);
      // Existing saves stay on disk (backed up and listed); only meta is pointed at the new save.
      await repository.commit(save, meta);
      window.location.reload();
    },
  };
}

function renderRecovery(root: HTMLElement, flow: RecoveryFlow): void {
  root.replaceChildren();
  const main = document.createElement('main');
  main.className = 'recovery';
  main.setAttribute('role', 'alertdialog');
  main.setAttribute('aria-labelledby', 'recovery-title');
  main.style.cssText = 'max-width:32rem;margin:0 auto;padding:1.5rem 1rem;font:16px/1.5 system-ui,sans-serif;display:grid;gap:.75rem';
  const title = document.createElement('h1');
  title.id = 'recovery-title';
  title.textContent = 'Pfotenzeit – Spielstand prüfen';
  const text = document.createElement('p');
  text.textContent = flow.problem.message;
  text.style.whiteSpace = 'pre-line';
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Technische Details';
  const pre = document.createElement('pre');
  pre.style.whiteSpace = 'pre-wrap';
  pre.textContent = flow.problem.errors.join('\n') || '–';
  details.append(summary, pre);
  const status = document.createElement('p');
  status.setAttribute('aria-live', 'polite');

  const actions = document.createElement('div');
  actions.style.cssText = 'display:grid;gap:.5rem';
  const mk = (label: string, onClick: () => Promise<void> | void, primary = false) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText = `min-height:52px;font:inherit;border-radius:12px;border:1px solid #8a7a66;padding:0 1rem;background:${primary ? '#326B58' : '#fff'};color:${primary ? '#fff' : '#222'}`;
    btn.addEventListener('click', () => {
      void Promise.resolve(onClick()).catch((error: unknown) => {
        status.textContent = errorMessage(error);
      });
    });
    return btn;
  };
  actions.append(
    mk('Sicherung herunterladen', () => flow.downloadBackup(), true),
    mk('Spielstand aus Datei laden', async () => {
      const result = await flow.importFile();
      status.textContent = result.message;
    }),
    mk('Neu beginnen (alte Daten bleiben gesichert)', async () => {
      if (window.confirm('Neuen Standard-Spielstand anlegen? Die bisherigen Daten bleiben als Sicherung erhalten.')) {
        await flow.startFresh();
      }
    }),
  );
  main.append(title, text, details, actions, status);
  root.append(main);
}

// ---------------------------------------------------------------------------
// Placeholder (only while ../ui has no mountUi)
// ---------------------------------------------------------------------------

function renderPlaceholder(root: HTMLElement, store: Store, deps: UiDeps, warning: string | null): void {
  root.replaceChildren();
  const main = document.createElement('main');
  main.style.cssText = 'max-width:32rem;margin:0 auto;padding:1.5rem 1rem;font:16px/1.5 system-ui,sans-serif;display:grid;gap:.75rem';
  const title = document.createElement('h1');
  title.textContent = 'Pfotenzeit';
  const note = document.createElement('p');
  note.textContent = warning ?? 'Die Spieloberfläche wird noch gebaut. Speicher, Zeit und Tab-Verwaltung laufen bereits.';
  const summary = document.createElement('pre');
  summary.style.cssText = 'white-space:pre-wrap;background:#f1ece2;padding:.75rem;border-radius:8px;font-size:13px';
  const render = () => {
    const { save, app } = store.get();
    summary.textContent = JSON.stringify(
      {
        mode: save.mode,
        dog: save.dog.name,
        revision: save.revision,
        satiety: save.dog.satiety,
        energy: save.dog.energy,
        comfort: save.dog.comfort,
        route: app.route,
        pauseReasons: app.pauseReasons,
        ownership: app.ownership,
        storageError: app.storageError,
        returnSummary: app.returnSummary,
      },
      null,
      1,
    );
  };
  render();
  store.subscribe(render);
  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.textContent = 'Spielstand exportieren';
  exportBtn.style.cssText = 'min-height:52px;font:inherit;border-radius:12px;border:1px solid #8a7a66;background:#fff';
  exportBtn.addEventListener('click', () => void deps.exportData().catch((error: unknown) => console.error(error)));
  main.append(title, note, summary, exportBtn);
  root.append(main);
}
