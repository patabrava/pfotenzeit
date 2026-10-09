import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIndexedDbRepository, mapIdbError, type IndexedDbRepository } from '../../src/storage/database';
import { LEDGER_LIMIT, STORES } from '../../src/storage/migrations';
import { StorageError } from '../../src/storage/types';
import { createNewMeta } from '../../src/simulation/save';
import { createDemoSave, createTestProviders } from '../../src/simulation/fixtures';
import type { Save } from '../../src/simulation/types';

let counter = 0;
let repo: IndexedDbRepository;
let dbName: string;

function uniqueName(): string {
  counter += 1;
  return `pfotenzeit-test-${Date.now().toString(36)}-${counter}`;
}

/** Writes a raw record directly into the saves store (bypassing the repository). */
function putRaw(name: string, store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction([store], 'readwrite');
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

beforeEach(async () => {
  dbName = uniqueName();
  repo = createIndexedDbRepository(dbName);
  await repo.open();
});

afterEach(() => {
  repo.close();
});

describe('IndexedDB repository', () => {
  it('commits save + meta atomically and loads them back', async () => {
    const save = createDemoSave();
    const meta = createNewMeta(save.saveId);
    await repo.commit(save, meta);
    expect(await repo.loadSave(save.saveId)).toEqual(save);
    expect(await repo.loadMeta()).toEqual(meta);
    expect(await repo.listSaveIds()).toEqual([save.saveId]);
    const ledger = await repo.listLedger(save.saveId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ saveId: save.saveId, revision: 0, type: 'commit' });
  });

  it('returns null for unknown save and missing meta', async () => {
    expect(await repo.loadMeta()).toBeNull();
    expect(await repo.loadSave('nope')).toBeNull();
  });

  it('rejects a commit whose revision is not newer than the stored one', async () => {
    const save = createDemoSave();
    await repo.commit({ ...save, revision: 3 }, createNewMeta(save.saveId));
    await expect(repo.commit({ ...save, revision: 3 })).rejects.toMatchObject({ kind: 'conflict' });
    await expect(repo.commit({ ...save, revision: 2 })).rejects.toMatchObject({ kind: 'conflict' });
    // Nothing from the rejected attempts leaked into the ledger.
    expect(await repo.listLedger(save.saveId)).toHaveLength(1);
    await repo.commit({ ...save, revision: 4 });
    expect((await repo.loadSave(save.saveId))?.revision).toBe(4);
  });

  it('a conflicting commit does not update meta either (atomic)', async () => {
    const save = createDemoSave();
    const meta = createNewMeta(save.saveId);
    await repo.commit({ ...save, revision: 1 }, meta);
    const changedMeta = { ...meta, activeMode: 'challenge' as const };
    await expect(repo.commit({ ...save, revision: 1 }, changedMeta)).rejects.toMatchObject({ kind: 'conflict' });
    expect(await repo.loadMeta()).toEqual(meta);
  });

  it('maps QuotaExceededError to StorageError("quota") and leaves the stored save untouched', async () => {
    const save = createDemoSave();
    await repo.commit({ ...save, revision: 1 });
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function patchedPut() {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
    try {
      await expect(repo.commit({ ...save, revision: 2 })).rejects.toMatchObject({ kind: 'quota' });
    } finally {
      IDBObjectStore.prototype.put = original;
    }
    expect((await repo.loadSave(save.saveId))?.revision).toBe(1);
    expect(mapIdbError(new DOMException('x', 'QuotaExceededError')).kind).toBe('quota');
    expect(mapIdbError(new DOMException('x', 'InvalidStateError')).kind).toBe('unavailable');
    expect(mapIdbError(new DOMException('x', 'ConstraintError')).kind).toBe('corrupt');
    expect(mapIdbError(new StorageError('keep', 'conflict')).kind).toBe('conflict');
  });

  it('prunes the ledger to the last entries per save inside the commit transaction', async () => {
    const save = createDemoSave();
    const other = createDemoSave({ saveId: 'save_other', mode: 'challenge' });
    await repo.commit({ ...other, revision: 1 });
    for (let revision = 1; revision <= LEDGER_LIMIT + 7; revision += 1) {
      await repo.commit({ ...save, revision });
    }
    const ledger = await repo.listLedger(save.saveId);
    expect(ledger).toHaveLength(LEDGER_LIMIT);
    expect(ledger[0]?.revision).toBe(8);
    expect(ledger[ledger.length - 1]?.revision).toBe(LEDGER_LIMIT + 7);
    expect(await repo.listLedger('save_other')).toHaveLength(1);
  }, 20_000);

  it('backs up a record with unknown schemaVersion and reports corrupt instead of resetting', async () => {
    await putRaw(dbName, STORES.saves, { saveId: 'future', schemaVersion: 99, revision: 1 });
    await expect(repo.loadSave('future')).rejects.toMatchObject({ kind: 'corrupt' });
    const backups = await repo.listBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0]?.reason).toContain('unmigratable');
    expect(backups[0]?.payload).toMatchObject({ saveId: 'future', schemaVersion: 99 });
    // The raw record is still there (never silently deleted).
    expect(await repo.loadRawSave('future')).toMatchObject({ schemaVersion: 99 });
  });

  it('exports and imports a bundle round-trip', async () => {
    const providers = createTestProviders();
    const standard = createDemoSave();
    const challenge = createDemoSave({ saveId: 'save_challenge_1', mode: 'challenge' });
    const meta = { ...createNewMeta(standard.saveId), saveIds: { standard: standard.saveId, challenge: challenge.saveId } };
    await repo.commit({ ...standard, revision: 2 }, meta);
    await repo.commit({ ...challenge, revision: 5 });

    const bundle = await repo.exportAll('0.1.0-test', providers.nowUTC());
    expect(bundle.format).toBe('pfotenzeit-export');
    expect(bundle.version).toBe(1);
    expect(bundle.saves).toHaveLength(2);
    expect(bundle.meta).toEqual(meta);

    const target = createIndexedDbRepository(uniqueName());
    await target.open();
    const json = JSON.parse(JSON.stringify(bundle)) as unknown;
    const { backupKey } = await target.importAll(json, providers.nowUTC());
    expect(backupKey).toBeTruthy();
    expect(await target.loadMeta()).toEqual(meta);
    expect(await target.loadSave(standard.saveId)).toEqual({ ...standard, revision: 2 });
    expect(await target.loadSave(challenge.saveId)).toEqual({ ...challenge, revision: 5 });
    target.close();
  });

  it('rejects an invalid import and replaces nothing', async () => {
    const save = createDemoSave();
    const meta = createNewMeta(save.saveId);
    await repo.commit({ ...save, revision: 1 }, meta);

    const invalidBundles: unknown[] = [
      null,
      'not json at all {',
      { format: 'something-else', version: 1 },
      { format: 'pfotenzeit-export', version: 2, meta, saves: [save] },
      { format: 'pfotenzeit-export', version: 1, exportedUTC: 1, appVersion: 'x', meta, saves: 'nope' },
      { format: 'pfotenzeit-export', version: 1, exportedUTC: 1, appVersion: 'x', meta: null, saves: [save] },
      // meta references a save that is not in the bundle
      { format: 'pfotenzeit-export', version: 1, exportedUTC: 1, appVersion: 'x', meta: createNewMeta('missing'), saves: [save] },
      // save with impossible values
      { format: 'pfotenzeit-export', version: 1, exportedUTC: 1, appVersion: 'x', meta, saves: [{ ...save, dog: { ...save.dog, satiety: 500 }, mode: 'nope' }] },
    ];
    for (const bundle of invalidBundles) {
      await expect(repo.importAll(bundle, 123), JSON.stringify(bundle)?.slice(0, 80)).rejects.toBeInstanceOf(StorageError);
    }
    expect(await repo.loadSave(save.saveId)).toEqual({ ...save, revision: 1 });
    expect(await repo.loadMeta()).toEqual(meta);
    expect(await repo.listBackups()).toHaveLength(0);
  });

  it('creates a backup of the current data before a valid import replaces it', async () => {
    const providers = createTestProviders();
    const old = createDemoSave({ saveId: 'save_old' });
    const oldMeta = createNewMeta(old.saveId);
    await repo.commit({ ...old, revision: 9 }, oldMeta);

    const fresh = createDemoSave({ saveId: 'save_fresh' });
    const bundle = {
      format: 'pfotenzeit-export',
      version: 1,
      exportedUTC: providers.nowUTC(),
      appVersion: 'x',
      meta: createNewMeta(fresh.saveId),
      saves: [fresh],
    };
    const { backupKey } = await repo.importAll(bundle, providers.nowUTC());
    const backups = await repo.listBackups();
    expect(backups).toHaveLength(1);
    expect(String(backups[0]?.key)).toBe(backupKey);
    expect(backups[0]?.reason).toBe('import');
    expect(backups[0]?.payload).toEqual({ meta: oldMeta, saves: [{ ...old, revision: 9 }] });
    expect(await repo.listSaveIds()).toEqual(['save_fresh']);
    expect(await repo.loadSave('save_old')).toBeNull();
    expect(await repo.listLedger('save_old')).toHaveLength(0);
  });

  it('deleteSave removes the save and its ledger entries', async () => {
    const save = createDemoSave();
    await repo.commit({ ...save, revision: 1 });
    await repo.commit({ ...save, revision: 2 });
    await repo.deleteSave(save.saveId);
    expect(await repo.loadSave(save.saveId)).toBeNull();
    expect(await repo.listLedger(save.saveId)).toHaveLength(0);
  });

  it('putMeta writes meta alone', async () => {
    const meta = createNewMeta('save_x');
    await repo.putMeta(meta);
    expect(await repo.loadMeta()).toEqual(meta);
  });

  it('exportAll without meta reports corrupt', async () => {
    await expect(repo.exportAll('x', 1)).rejects.toMatchObject({ kind: 'corrupt' });
  });

  it('reports unavailable when IndexedDB is missing', async () => {
    const original = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    try {
      const closed = createIndexedDbRepository(uniqueName());
      await expect(closed.open()).rejects.toMatchObject({ kind: 'unavailable' });
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { value: original, configurable: true, writable: true });
    }
  });

  it('migration helper keeps a current save untouched', async () => {
    const save: Save = createDemoSave();
    await repo.commit({ ...save, revision: 1 });
    const loaded = await repo.loadSave(save.saveId);
    expect(loaded?.schemaVersion).toBe(1);
  });
});
