/**
 * Typed store: serialized domain dispatch → reducer → atomic persistence → subscribers.
 * Meta actions (mode switch, new challenge run, archive) are handled here because they span saves.
 * No DOM, no Three. Owned by the integration lead (ines-c3); other packages consume it.
 */
import type { ContentCatalog } from '../content/types';
import { reduce } from '../simulation/reducer';
import { createNewSave } from '../simulation/save';
import type {
  ChallengeArchive,
  DomainAction,
  Meta,
  MetaAction,
  Mode,
  Providers,
  ReduceResult,
  Save,
} from '../simulation/types';
import type { SaveRepository } from '../storage/types';
import { StorageError } from '../storage/types';
import { INITIAL_APP_STATE, type AppState } from '../app/appState';

export interface StoreSnapshot {
  save: Save;
  app: AppState;
  meta: Meta;
}

export type StoreListener = (snapshot: StoreSnapshot, change: 'save' | 'app' | 'meta') => void;

export interface Store {
  get(): StoreSnapshot;
  subscribe(listener: StoreListener): () => void;
  /** Serialized; resolves after persistence attempt. Never throws for rejected/duplicate actions. */
  dispatch(action: DomainAction): Promise<ReduceResult>;
  dispatchMeta(action: MetaAction): Promise<void>;
  patchApp(patch: Partial<AppState> | ((app: AppState) => Partial<AppState>)): void;
  /** Convenience: dispatch with a fresh transactionId and nowUTC from providers. */
  act<T extends DomainAction['type']>(
    type: T,
    payload: Omit<Extract<DomainAction, { type: T }>, 'type' | 'transactionId' | 'nowUTC'>,
  ): Promise<ReduceResult>;
  readonly providers: Providers;
  readonly content: ContentCatalog;
  readonly repository: SaveRepository;
  /** Dev/test only: replace the active save wholesale (debug panel). Guarded by caller. */
  debugReplaceSave(save: Save): Promise<void>;
}

export interface CreateStoreOptions {
  repository: SaveRepository;
  providers: Providers;
  content: ContentCatalog;
  save: Save;
  meta: Meta;
  app?: Partial<AppState>;
}

export function createStore(options: CreateStoreOptions): Store {
  const { repository, providers, content } = options;
  let save = options.save;
  let meta = options.meta;
  let app: AppState = { ...INITIAL_APP_STATE, ...options.app };
  const listeners = new Set<StoreListener>();
  let queue: Promise<unknown> = Promise.resolve();

  function snapshot(): StoreSnapshot {
    return { save, app, meta };
  }

  function notify(change: 'save' | 'app' | 'meta'): void {
    const snap = snapshot();
    for (const listener of listeners) {
      try {
        listener(snap, change);
      } catch (error) {
        console.error('[store] listener failed', error);
      }
    }
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  async function persist(nextSave: Save, nextMeta?: Meta): Promise<void> {
    try {
      await repository.commit(nextSave, nextMeta);
      if (app.storageError) {
        patchApp((current) => ({
          storageError: null,
          pauseReasons: current.pauseReasons.filter((reason) => reason !== 'storageError'),
        }));
      }
    } catch (error) {
      const message =
        error instanceof StorageError
          ? `${error.kind}: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error);
      console.error('[store] persistence failed', error);
      patchApp((current) => ({
        storageError: message,
        pauseReasons: current.pauseReasons.includes('storageError')
          ? current.pauseReasons
          : [...current.pauseReasons, 'storageError'],
      }));
    }
  }

  function patchApp(patch: Partial<AppState> | ((app: AppState) => Partial<AppState>)): void {
    const next = typeof patch === 'function' ? patch(app) : patch;
    app = { ...app, ...next };
    notify('app');
  }

  async function dispatchInner(action: DomainAction): Promise<ReduceResult> {
    const result = reduce(save, action, content);
    if (result.outcome !== 'applied') {
      return result;
    }
    const committed: Save = { ...result.save, revision: save.revision + 1 };
    save = committed;
    notify('save');
    await persist(committed);
    return { ...result, save: committed };
  }

  async function switchActiveSave(nextSave: Save, nextMeta: Meta, nowUTC: number): Promise<void> {
    // Close the current save's time anchor, then open the target's.
    const closed = reduce(save, { type: 'CLOSE_APP', nowUTC, transactionId: providers.id('tx') }, content);
    if (closed.outcome === 'applied') {
      save = { ...closed.save, revision: save.revision + 1 };
      await persist(save);
    }
    meta = nextMeta;
    // The store owns revisions (D-013): bump so the repository accepts the re-commit of an existing save.
    save = { ...nextSave, revision: nextSave.revision + 1 };
    notify('meta');
    notify('save');
    await persist(save, meta);
    const offline = reduce(save, { type: 'APPLY_OFFLINE', nowUTC, transactionId: providers.id('tx') }, content);
    if (offline.outcome === 'applied') {
      save = { ...offline.save, revision: save.revision + 1 };
      notify('save');
      await persist(save);
    }
  }

  async function dispatchMetaInner(action: MetaAction): Promise<void> {
    switch (action.type) {
      case 'CREATE_SAVE': {
        const created = createNewSave(action.mode, providers, action.nowUTC);
        const nextMeta: Meta = {
          ...meta,
          activeMode: action.mode,
          saveIds: { ...meta.saveIds, [action.mode]: created.saveId },
        };
        await switchActiveSave(created, nextMeta, action.nowUTC);
        return;
      }
      case 'SELECT_MODE': {
        if (action.mode === meta.activeMode) return;
        const targetId = meta.saveIds[action.mode];
        if (!targetId) {
          await dispatchMetaInner({ type: 'CREATE_SAVE', mode: action.mode, nowUTC: action.nowUTC });
          return;
        }
        const target = await repository.loadSave(targetId);
        if (!target) {
          await dispatchMetaInner({ type: 'CREATE_SAVE', mode: action.mode, nowUTC: action.nowUTC });
          return;
        }
        await switchActiveSave(target, { ...meta, activeMode: action.mode }, action.nowUTC);
        return;
      }
      case 'ARCHIVE_CHALLENGE': {
        const challengeId = meta.saveIds.challenge;
        if (!challengeId) return;
        const challenge = save.saveId === challengeId ? save : await repository.loadSave(challengeId);
        const archives: ChallengeArchive[] = challenge
          ? [...meta.archives, toArchive(challenge, action.nowUTC)]
          : meta.archives;
        const nextMeta: Meta = {
          ...meta,
          activeMode: 'standard',
          saveIds: { ...meta.saveIds, challenge: null },
          archives,
        };
        if (save.saveId === challengeId) {
          const standard = await repository.loadSave(meta.saveIds.standard);
          const target = standard ?? createNewSave('standard', providers, action.nowUTC);
          await switchActiveSave(target, nextMeta, action.nowUTC);
        } else {
          meta = nextMeta;
          notify('meta');
          await persist(save, meta);
        }
        await repository.deleteSave(challengeId).catch((error) => console.warn('[store] archive delete', error));
        return;
      }
      default:
        return;
    }
  }

  const store: Store = {
    get: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(action) {
      return enqueue(() => dispatchInner(action));
    },
    dispatchMeta(action) {
      return enqueue(() => dispatchMetaInner(action));
    },
    patchApp,
    act(type, payload) {
      const action = {
        ...(payload as object),
        type,
        transactionId: providers.id('tx'),
        nowUTC: providers.nowUTC(),
      } as DomainAction;
      return store.dispatch(action);
    },
    providers,
    content,
    repository,
    debugReplaceSave(next) {
      return enqueue(async () => {
        save = { ...next, revision: save.revision + 1 };
        notify('save');
        await persist(save);
      });
    },
  };
  return store;
}

export function toArchive(save: Save, endedUTC: number): ChallengeArchive {
  const milestones: string[] = [];
  for (const lessonId of save.completedLessonIds) milestones.push(`lesson:${lessonId}`);
  for (const point of save.dog.learnedPoints) milestones.push(`learned:${point}`);
  for (const upgrade of save.school.upgrades) milestones.push(`upgrade:${upgrade}`);
  if (save.growthConfirmed) milestones.push('growth:growing');
  if (save.memories.length > 0) milestones.push(`memories:${save.memories.length}`);
  return {
    saveId: save.saveId,
    dogInstanceId: save.dog.instanceId,
    dogName: save.dog.name,
    createdUTC: save.createdUTC,
    endedUTC,
    reason: save.dog.status === 'lost' ? 'lost' : 'archived',
    milestones,
    visitCount: save.visitCount,
    completedLessonIds: [...save.completedLessonIds],
  };
}

export function isMode(value: unknown): value is Mode {
  return value === 'standard' || value === 'challenge';
}
