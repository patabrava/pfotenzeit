/**
 * IndexedDB schema versioning and record migrations.
 *
 * Two independent version axes:
 * - DB_VERSION: the IndexedDB object-store layout (onupgradeneeded).
 * - SAVE_SCHEMA_VERSION: the shape of a persisted Save/Meta record (types.ts).
 *
 * Records whose schemaVersion has no migration path are reported as 'unmigratable'. The
 * repository backs them up to the `backups` store and explains; nothing is reset silently.
 */
import { SAVE_SCHEMA_VERSION } from '../simulation/types';

export const DB_NAME = 'pfotenzeit';
export const DB_VERSION = 1;

export const STORES = {
  meta: 'meta',
  saves: 'saves',
  backups: 'backups',
  ledger: 'ledger',
} as const;

export const META_KEY = 'meta';
export const LEDGER_INDEX_SAVE_ID = 'bySaveId';
/** Ledger entries kept per save; older ones are pruned inside the committing transaction. */
export const LEDGER_LIMIT = 500;

export interface BackupRecord {
  createdUTC: number;
  reason: string;
  payload: unknown;
}

export interface LedgerEntry {
  saveId: string;
  revision: number;
  transactionId: string | null;
  type: string;
  nowUTC: number;
}

/**
 * Object-store layout upgrades, applied sequentially from oldVersion up to DB_VERSION.
 * Adding a layout change: bump DB_VERSION and append a step keyed by the new version.
 */
const DB_UPGRADES: Record<number, (db: IDBDatabase, tx: IDBTransaction) => void> = {
  1: (db) => {
    db.createObjectStore(STORES.meta);
    db.createObjectStore(STORES.saves, { keyPath: 'saveId' });
    db.createObjectStore(STORES.backups, { autoIncrement: true });
    const ledger = db.createObjectStore(STORES.ledger, { autoIncrement: true });
    ledger.createIndex(LEDGER_INDEX_SAVE_ID, 'saveId', { unique: false });
  },
};

export function upgradeDatabase(db: IDBDatabase, oldVersion: number, tx: IDBTransaction): void {
  for (let version = oldVersion + 1; version <= DB_VERSION; version += 1) {
    const step = DB_UPGRADES[version];
    if (!step) throw new Error(`missing database upgrade step for version ${version}`);
    step(db, tx);
  }
}

export type MigrationResult =
  | { status: 'current'; value: unknown }
  | { status: 'migrated'; value: unknown; from: number }
  | { status: 'unmigratable'; schemaVersion: unknown; reason: string };

/**
 * Record migrations keyed by the schemaVersion they *produce*. Each step receives a record of the
 * previous version and returns the next. v1 is the first version, so the table is empty for now.
 */
const SAVE_MIGRATIONS: Record<number, (record: Record<string, unknown>) => Record<string, unknown>> = {};
const META_MIGRATIONS: Record<number, (record: Record<string, unknown>) => Record<string, unknown>> = {};

function migrateRecord(
  record: unknown,
  steps: Record<number, (record: Record<string, unknown>) => Record<string, unknown>>,
  label: string,
): MigrationResult {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return { status: 'unmigratable', schemaVersion: undefined, reason: `${label} is not an object` };
  }
  const original = record as Record<string, unknown>;
  const version = original['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return { status: 'unmigratable', schemaVersion: version, reason: `${label} has no integer schemaVersion` };
  }
  if (version === SAVE_SCHEMA_VERSION) return { status: 'current', value: original };
  if (version > SAVE_SCHEMA_VERSION) {
    return {
      status: 'unmigratable',
      schemaVersion: version,
      reason: `${label} schemaVersion ${version} is newer than this app supports (${SAVE_SCHEMA_VERSION})`,
    };
  }
  let current = original;
  for (let next = version + 1; next <= SAVE_SCHEMA_VERSION; next += 1) {
    const step = steps[next];
    if (!step) {
      return {
        status: 'unmigratable',
        schemaVersion: version,
        reason: `${label} schemaVersion ${version} has no migration to ${next}`,
      };
    }
    current = { ...step(current), schemaVersion: next };
  }
  return { status: 'migrated', value: current, from: version };
}

export function migrateSaveRecord(record: unknown): MigrationResult {
  return migrateRecord(record, SAVE_MIGRATIONS, 'save');
}

export function migrateMetaRecord(record: unknown): MigrationResult {
  return migrateRecord(record, META_MIGRATIONS, 'meta');
}
