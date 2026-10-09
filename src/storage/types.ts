/**
 * Storage contract. Implemented by src/storage/database.ts (IndexedDB, WP-C) and
 * src/storage/memoryRepository.ts (tests / fallback).
 */
import type { Meta, Save } from '../simulation/types';

export interface ExportBundle {
  format: 'pfotenzeit-export';
  version: 1;
  exportedUTC: number;
  appVersion: string;
  meta: Meta;
  saves: Save[];
}

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly kind: 'quota' | 'unavailable' | 'conflict' | 'corrupt' | 'unknown',
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export interface SaveRepository {
  open(): Promise<void>;
  loadMeta(): Promise<Meta | null>;
  loadSave(saveId: string): Promise<Save | null>;
  /**
   * Atomic commit of one save and optionally meta in a single transaction.
   * Rejects with StorageError('conflict') if the stored revision is >= save.revision
   * (an older in-memory state must never overwrite a newer one).
   * Resolves only after the transaction completed.
   */
  commit(save: Save, meta?: Meta): Promise<void>;
  putMeta(meta: Meta): Promise<void>;
  deleteSave(saveId: string): Promise<void>;
  listSaveIds(): Promise<string[]>;
  exportAll(appVersion: string, nowUTC: number): Promise<ExportBundle>;
  /** Validates strictly, backs up the current data first, then replaces everything. */
  importAll(bundle: unknown, nowUTC: number): Promise<{ backupKey: string }>;
  close(): void;
}

export type OwnershipState = 'pending' | 'owner' | 'other';

export interface TabOwnership {
  /** Resolves once ownership is known. Uses Web Locks, falls back to BroadcastChannel lease. */
  acquire(): Promise<OwnershipState>;
  onChange(listener: (state: OwnershipState) => void): () => void;
  release(): void;
}
