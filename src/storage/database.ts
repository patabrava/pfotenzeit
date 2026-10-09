/**
 * IndexedDB SaveRepository (15_DATEN_REGELN "Transaktionen", 09 "Speichern und Zeit").
 *
 * - One readwrite transaction per commit over saves (+ meta, ledger); the stored revision is read
 *   inside the transaction and the commit is aborted with StorageError('conflict') if it is not newer.
 * - Success is reported on transaction `complete`, never earlier. No awaits of unrelated promises
 *   inside an open transaction (everything is event-driven).
 * - Unmigratable or structurally broken records are backed up to the `backups` store and reported
 *   as StorageError('corrupt'); nothing is reset silently.
 */
import type { Meta, Save } from '../simulation/types';
import { describeImportErrors, createExportBundle, parseImportBundle } from './importExport';
import {
  DB_NAME,
  DB_VERSION,
  LEDGER_INDEX_SAVE_ID,
  LEDGER_LIMIT,
  META_KEY,
  STORES,
  migrateMetaRecord,
  migrateSaveRecord,
  upgradeDatabase,
  type BackupRecord,
  type LedgerEntry,
} from './migrations';
import { StorageError, type ExportBundle, type SaveRepository } from './types';

export interface BackupListing {
  key: IDBValidKey;
  createdUTC: number;
  reason: string;
  payload: unknown;
}

export interface IndexedDbRepository extends SaveRepository {
  /** Stores an arbitrary payload in `backups`; returns the generated key as string. */
  backup(reason: string, payload: unknown, nowUTC?: number): Promise<string>;
  listBackups(): Promise<BackupListing[]>;
  /** Raw record as stored (no migration, no validation). For diagnostics and recovery export. */
  loadRawSave(saveId: string): Promise<unknown>;
  loadRawMeta(): Promise<unknown>;
  /** Diagnostics: ledger entries for one save, oldest first. */
  listLedger(saveId: string): Promise<LedgerEntry[]>;
  /** Fires when another tab/version requests a database upgrade and this connection was closed. */
  onUnavailable(listener: (error: StorageError) => void): () => void;
  readonly name: string;
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

export function mapIdbError(error: unknown, fallbackMessage = 'IndexedDB error'): StorageError {
  if (error instanceof StorageError) return error;
  const name = (error as { name?: unknown } | null)?.name;
  const message = (error as { message?: unknown } | null)?.message;
  const text = typeof message === 'string' && message.length > 0 ? message : fallbackMessage;
  switch (name) {
    case 'QuotaExceededError':
      return new StorageError(text, 'quota');
    case 'VersionError':
    case 'InvalidStateError':
    case 'SecurityError':
    case 'UnknownError':
    case 'NotFoundError':
      return new StorageError(text, 'unavailable');
    case 'ConstraintError':
    case 'DataError':
    case 'DataCloneError':
    case 'SyntaxError':
      return new StorageError(text, 'corrupt');
    case 'AbortError':
      return new StorageError(text, 'unknown');
    default:
      return new StorageError(text, 'unknown');
  }
}

// ---------------------------------------------------------------------------
// Small request/transaction helpers (callback style, no awaits inside transactions)
// ---------------------------------------------------------------------------

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(mapIdbError(request.error));
  });
}

/**
 * Runs `body` inside a transaction. `body` schedules IDB requests synchronously and via their
 * success callbacks; it may call `fail(error)` to abort. The returned promise resolves with the
 * value passed to `done()` once the transaction completed, or rejects with a mapped StorageError.
 */
function runTransaction<T>(
  db: IDBDatabase,
  storeNames: string[],
  mode: IDBTransactionMode,
  body: (ctx: { tx: IDBTransaction; done(value: T): void; fail(error: StorageError): void }) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(storeNames, mode);
    } catch (error) {
      reject(mapIdbError(error, 'could not open transaction'));
      return;
    }
    let result: T | undefined;
    let hasResult = false;
    let failure: StorageError | null = null;
    const fail = (error: StorageError) => {
      if (failure) return;
      failure = error;
      try {
        tx.abort();
      } catch {
        // already aborted or finished
      }
    };
    tx.oncomplete = () => {
      if (failure) reject(failure);
      else if (hasResult) resolve(result as T);
      else reject(new StorageError('transaction completed without result', 'unknown'));
    };
    tx.onerror = (event) => {
      // Individual request errors bubble here; remember the first mapped cause.
      const target = event.target as IDBRequest | IDBTransaction | null;
      const cause = (target && 'error' in target ? target.error : null) ?? tx.error;
      if (!failure) failure = mapIdbError(cause, 'transaction failed');
    };
    tx.onabort = () => {
      reject(failure ?? mapIdbError(tx.error, 'transaction aborted'));
    };
    const ctx = {
      tx,
      done: (value: T) => {
        result = value;
        hasResult = true;
      },
      fail,
    };
    try {
      body(ctx);
    } catch (error) {
      fail(mapIdbError(error, 'transaction body threw'));
    }
  });
}

/** Wraps a request so synchronous throws and request errors inside a transaction become `fail`. */
function onSuccess<T>(
  request: IDBRequest<T>,
  fail: (error: StorageError) => void,
  handler: (value: T) => void,
): void {
  request.onsuccess = () => {
    try {
      handler(request.result);
    } catch (error) {
      fail(mapIdbError(error));
    }
  };
  request.onerror = () => fail(mapIdbError(request.error));
}

/** Calls `fn` and converts a synchronous DOMException (e.g. quota on put) into `fail`. */
function guarded<T>(fail: (error: StorageError) => void, fn: () => T): T | null {
  try {
    return fn();
  } catch (error) {
    fail(mapIdbError(error));
    return null;
  }
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export function createIndexedDbRepository(dbName: string = DB_NAME): IndexedDbRepository {
  let db: IDBDatabase | null = null;
  const unavailableListeners = new Set<(error: StorageError) => void>();

  function ensureDb(): IDBDatabase {
    if (!db) throw new StorageError('repository not open', 'unavailable');
    return db;
  }

  function emitUnavailable(error: StorageError): void {
    for (const listener of unavailableListeners) {
      try {
        listener(error);
      } catch (listenerError) {
        console.error('[storage] unavailable listener failed', listenerError);
      }
    }
  }

  function addBackup(
    tx: IDBTransaction,
    fail: (error: StorageError) => void,
    record: BackupRecord,
    onKey: (key: IDBValidKey) => void,
  ): void {
    const request = guarded(fail, () => tx.objectStore(STORES.backups).add(record));
    if (request) onSuccess(request, fail, onKey);
  }

  function pruneLedger(tx: IDBTransaction, fail: (error: StorageError) => void, saveId: string): void {
    const index = tx.objectStore(STORES.ledger).index(LEDGER_INDEX_SAVE_ID);
    const range = IDBKeyRange.only(saveId);
    onSuccess(index.count(range), fail, (count) => {
      let excess = count - LEDGER_LIMIT;
      if (excess <= 0) return;
      // Auto-increment keys ascend with insertion order, so the cursor visits oldest entries first.
      onSuccess(index.openCursor(range), fail, function visit(cursor) {
        if (!cursor || excess <= 0) return;
        cursor.delete();
        excess -= 1;
        // The same request fires `success` again after continue(); `visit` stays registered.
        if (excess > 0) cursor.continue();
      });
    });
  }

  const repository: IndexedDbRepository = {
    name: dbName,

    open(): Promise<void> {
      if (db) return Promise.resolve();
      if (!isIndexedDbAvailable()) {
        return Promise.reject(new StorageError('IndexedDB is not available in this browser context', 'unavailable'));
      }
      return new Promise((resolve, reject) => {
        let request: IDBOpenDBRequest;
        try {
          request = indexedDB.open(dbName, DB_VERSION);
        } catch (error) {
          reject(mapIdbError(error, 'indexedDB.open threw'));
          return;
        }
        request.onupgradeneeded = (event) => {
          const upgradeDb = request.result;
          const tx = request.transaction;
          try {
            if (!tx) throw new Error('upgrade transaction missing');
            upgradeDatabase(upgradeDb, event.oldVersion, tx);
          } catch (error) {
            try {
              tx?.abort();
            } catch {
              // ignore
            }
            reject(mapIdbError(error, 'database upgrade failed'));
          }
        };
        request.onblocked = () => {
          console.warn('[storage] database open blocked by another connection');
        };
        request.onsuccess = () => {
          db = request.result;
          db.onversionchange = () => {
            db?.close();
            db = null;
            emitUnavailable(
              new StorageError('Die Datenbank wurde von einem anderen Tab aktualisiert. Bitte Seite neu laden.', 'unavailable'),
            );
          };
          db.onclose = () => {
            db = null;
            emitUnavailable(new StorageError('Die Datenbankverbindung wurde geschlossen.', 'unavailable'));
          };
          resolve();
        };
        request.onerror = () => reject(mapIdbError(request.error, 'could not open database'));
      });
    },

    async loadRawMeta(): Promise<unknown> {
      const database = ensureDb();
      const tx = database.transaction([STORES.meta], 'readonly');
      return requestToPromise(tx.objectStore(STORES.meta).get(META_KEY)) as Promise<unknown>;
    },

    async loadRawSave(saveId: string): Promise<unknown> {
      const database = ensureDb();
      const tx = database.transaction([STORES.saves], 'readonly');
      return requestToPromise(tx.objectStore(STORES.saves).get(saveId)) as Promise<unknown>;
    },

    async loadMeta(): Promise<Meta | null> {
      const raw = await repository.loadRawMeta();
      if (raw === undefined || raw === null) return null;
      const migration = migrateMetaRecord(raw);
      if (migration.status === 'unmigratable') {
        const key = await repository.backup(`unmigratable-meta: ${migration.reason}`, raw);
        throw new StorageError(
          `Die gespeicherten Spieldaten (meta) haben ein unbekanntes Format (${migration.reason}). Eine Sicherung wurde angelegt (Schlüssel ${key}).`,
          'corrupt',
        );
      }
      return migration.value as Meta;
    },

    async loadSave(saveId: string): Promise<Save | null> {
      const raw = await repository.loadRawSave(saveId);
      if (raw === undefined || raw === null) return null;
      const migration = migrateSaveRecord(raw);
      if (migration.status === 'unmigratable') {
        const key = await repository.backup(`unmigratable-save: ${migration.reason}`, raw);
        throw new StorageError(
          `Der Spielstand ${saveId} hat ein unbekanntes Format (${migration.reason}). Eine Sicherung wurde angelegt (Schlüssel ${key}).`,
          'corrupt',
        );
      }
      return migration.value as Save;
    },

    commit(save: Save, meta?: Meta): Promise<void> {
      const database = ensureDb();
      const nowUTC = Date.now();
      return runTransaction<void>(database, [STORES.saves, STORES.meta, STORES.ledger], 'readwrite', ({ tx, done, fail }) => {
        const saves = tx.objectStore(STORES.saves);
        onSuccess(saves.get(save.saveId), fail, (stored: unknown) => {
          const storedRevision = (stored as { revision?: unknown } | undefined)?.revision;
          if (typeof storedRevision === 'number' && storedRevision >= save.revision) {
            fail(new StorageError(`stored revision ${storedRevision} >= ${save.revision}`, 'conflict'));
            return;
          }
          if (!guarded(fail, () => saves.put(save))) return;
          if (meta && !guarded(fail, () => tx.objectStore(STORES.meta).put(meta, META_KEY))) return;
          const entry: LedgerEntry = {
            saveId: save.saveId,
            revision: save.revision,
            transactionId: save.appliedTransactionIds[save.appliedTransactionIds.length - 1] ?? null,
            type: 'commit',
            nowUTC,
          };
          if (!guarded(fail, () => tx.objectStore(STORES.ledger).add(entry))) return;
          pruneLedger(tx, fail, save.saveId);
          done();
        });
      });
    },

    putMeta(meta: Meta): Promise<void> {
      const database = ensureDb();
      return runTransaction<void>(database, [STORES.meta], 'readwrite', ({ tx, done, fail }) => {
        if (!guarded(fail, () => tx.objectStore(STORES.meta).put(meta, META_KEY))) return;
        done();
      });
    },

    deleteSave(saveId: string): Promise<void> {
      const database = ensureDb();
      return runTransaction<void>(database, [STORES.saves, STORES.ledger], 'readwrite', ({ tx, done, fail }) => {
        if (!guarded(fail, () => tx.objectStore(STORES.saves).delete(saveId))) return;
        const index = tx.objectStore(STORES.ledger).index(LEDGER_INDEX_SAVE_ID);
        onSuccess(index.openCursor(IDBKeyRange.only(saveId)), fail, function visit(cursor) {
          if (!cursor) return;
          cursor.delete();
          cursor.continue();
        });
        done();
      });
    },

    async listSaveIds(): Promise<string[]> {
      const database = ensureDb();
      const tx = database.transaction([STORES.saves], 'readonly');
      const keys = await requestToPromise(tx.objectStore(STORES.saves).getAllKeys());
      return keys.map((key) => String(key));
    },

    exportAll(appVersion: string, nowUTC: number): Promise<ExportBundle> {
      const database = ensureDb();
      return runTransaction<ExportBundle>(database, [STORES.saves, STORES.meta], 'readonly', ({ tx, done, fail }) => {
        let meta: unknown;
        let saves: unknown[] | null = null;
        const finish = () => {
          if (meta === undefined || saves === null) return;
          if (!meta) {
            fail(new StorageError('no meta', 'corrupt'));
            return;
          }
          done(createExportBundle(meta as Meta, saves as Save[], appVersion, nowUTC));
        };
        onSuccess(tx.objectStore(STORES.meta).get(META_KEY), fail, (value: unknown) => {
          meta = value ?? null;
          finish();
        });
        onSuccess(tx.objectStore(STORES.saves).getAll(), fail, (value) => {
          saves = value as unknown[];
          finish();
        });
      });
    },

    importAll(bundle: unknown, nowUTC: number): Promise<{ backupKey: string }> {
      const database = ensureDb();
      const parsed = parseImportBundle(bundle);
      if (!parsed.ok) {
        return Promise.reject(new StorageError(describeImportErrors(parsed.errors), 'corrupt'));
      }
      const { meta, saves } = parsed.bundle;
      return runTransaction<{ backupKey: string }>(
        database,
        [STORES.saves, STORES.meta, STORES.backups, STORES.ledger],
        'readwrite',
        ({ tx, done, fail }) => {
          let currentMeta: unknown;
          let currentSaves: unknown[] | null = null;
          const proceed = () => {
            if (currentMeta === undefined || currentSaves === null) return;
            addBackup(
              tx,
              fail,
              { createdUTC: nowUTC, reason: 'import', payload: { meta: currentMeta, saves: currentSaves } },
              (key) => {
                const savesStore = tx.objectStore(STORES.saves);
                if (!guarded(fail, () => savesStore.clear())) return;
                if (!guarded(fail, () => tx.objectStore(STORES.ledger).clear())) return;
                for (const save of saves) {
                  if (!guarded(fail, () => savesStore.put(save))) return;
                }
                if (!guarded(fail, () => tx.objectStore(STORES.meta).put(meta, META_KEY))) return;
                done({ backupKey: String(key) });
              },
            );
          };
          onSuccess(tx.objectStore(STORES.meta).get(META_KEY), fail, (value: unknown) => {
            currentMeta = value ?? null;
            proceed();
          });
          onSuccess(tx.objectStore(STORES.saves).getAll(), fail, (value) => {
            currentSaves = value as unknown[];
            proceed();
          });
        },
      );
    },

    backup(reason: string, payload: unknown, nowUTC: number = Date.now()): Promise<string> {
      const database = ensureDb();
      return runTransaction<string>(database, [STORES.backups], 'readwrite', ({ tx, done, fail }) => {
        addBackup(tx, fail, { createdUTC: nowUTC, reason, payload }, (key) => done(String(key)));
      });
    },

    listBackups(): Promise<BackupListing[]> {
      const database = ensureDb();
      return runTransaction<BackupListing[]>(database, [STORES.backups], 'readonly', ({ tx, done, fail }) => {
        const out: BackupListing[] = [];
        onSuccess(tx.objectStore(STORES.backups).openCursor(), fail, function visit(cursor) {
          if (!cursor) {
            done(out);
            return;
          }
          const value = cursor.value as BackupRecord;
          out.push({ key: cursor.key, createdUTC: value.createdUTC, reason: value.reason, payload: value.payload });
          cursor.continue();
        });
      });
    },

    listLedger(saveId: string): Promise<LedgerEntry[]> {
      const database = ensureDb();
      return runTransaction<LedgerEntry[]>(database, [STORES.ledger], 'readonly', ({ tx, done, fail }) => {
        const index = tx.objectStore(STORES.ledger).index(LEDGER_INDEX_SAVE_ID);
        onSuccess(index.getAll(IDBKeyRange.only(saveId)), fail, (entries) => done(entries as LedgerEntry[]));
      });
    },

    onUnavailable(listener) {
      unavailableListeners.add(listener);
      return () => unavailableListeners.delete(listener);
    },

    close(): void {
      if (db) {
        db.onversionchange = null;
        db.onclose = null;
        db.close();
        db = null;
      }
    },
  };

  return repository;
}
