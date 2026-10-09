/**
 * In-memory SaveRepository: tests, Storybook-like UI development and the "storage unavailable" fallback.
 */
import type { Meta, Save } from '../simulation/types';
import { StorageError, type ExportBundle, type SaveRepository } from './types';

export function createMemoryRepository(initial?: { meta?: Meta; saves?: Save[] }): SaveRepository & {
  snapshot(): { meta: Meta | null; saves: Save[] };
} {
  let meta: Meta | null = initial?.meta ? structuredClone(initial.meta) : null;
  const saves = new Map<string, Save>();
  for (const save of initial?.saves ?? []) saves.set(save.saveId, structuredClone(save));
  let failNext: StorageError | null = null;

  const repo = {
    async open() {},
    async loadMeta() {
      return meta ? structuredClone(meta) : null;
    },
    async loadSave(saveId: string) {
      const save = saves.get(saveId);
      return save ? structuredClone(save) : null;
    },
    async commit(save: Save, nextMeta?: Meta) {
      if (failNext) {
        const error = failNext;
        failNext = null;
        throw error;
      }
      const stored = saves.get(save.saveId);
      if (stored && stored.revision >= save.revision && stored.revision !== 0) {
        throw new StorageError(`stored revision ${stored.revision} >= ${save.revision}`, 'conflict');
      }
      saves.set(save.saveId, structuredClone(save));
      if (nextMeta) meta = structuredClone(nextMeta);
    },
    async putMeta(nextMeta: Meta) {
      meta = structuredClone(nextMeta);
    },
    async deleteSave(saveId: string) {
      saves.delete(saveId);
    },
    async listSaveIds() {
      return [...saves.keys()];
    },
    async exportAll(appVersion: string, nowUTC: number): Promise<ExportBundle> {
      if (!meta) throw new StorageError('no meta', 'corrupt');
      return {
        format: 'pfotenzeit-export',
        version: 1,
        exportedUTC: nowUTC,
        appVersion,
        meta: structuredClone(meta),
        saves: [...saves.values()].map((save) => structuredClone(save)),
      };
    },
    async importAll(bundle: unknown) {
      const candidate = bundle as ExportBundle;
      if (!candidate || candidate.format !== 'pfotenzeit-export') {
        throw new StorageError('invalid export bundle', 'corrupt');
      }
      meta = structuredClone(candidate.meta);
      saves.clear();
      for (const save of candidate.saves) saves.set(save.saveId, structuredClone(save));
      return { backupKey: 'memory' };
    },
    close() {},
    snapshot() {
      return { meta: meta ? structuredClone(meta) : null, saves: [...saves.values()].map((s) => structuredClone(s)) };
    },
    /** Test hook: make the next commit fail. */
    failNextCommit(error: StorageError) {
      failNext = error;
    },
  };
  return repo;
}
