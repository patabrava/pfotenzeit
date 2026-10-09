/**
 * JSON export/import helpers. Strict validation goes through validateSave/validateMeta (WP-A).
 * Until WP-A lands, the validators throw "not implemented"; `safeValidateSave`/`safeValidateMeta`
 * fall back to a minimal structural check and log a warning so boot stays usable.
 */
import { SAVE_SCHEMA_VERSION, type Meta, type Save } from '../simulation/types';
import { validateMeta, validateSave, type ValidationResult } from '../simulation/save';
import type { ExportBundle } from './types';

export const EXPORT_FORMAT = 'pfotenzeit-export' as const;
export const EXPORT_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Validation (resilient wrappers)
// ---------------------------------------------------------------------------

let warnedValidatorMissing = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNotImplemented(error: unknown): boolean {
  return error instanceof Error && /not implemented/i.test(error.message);
}

function warnValidatorMissing(): void {
  if (warnedValidatorMissing) return;
  warnedValidatorMissing = true;
  console.warn('[storage] validateSave/validateMeta not implemented yet (WP-A); using structural fallback.');
}

/** Minimal structural check used only while WP-A's validators are not implemented. */
function structuralSave(input: unknown): ValidationResult<Save> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, value: null, errors: ['save is not an object'] };
  if (input['schemaVersion'] !== SAVE_SCHEMA_VERSION) errors.push('schemaVersion is not supported');
  if (typeof input['saveId'] !== 'string' || input['saveId'].length === 0) errors.push('saveId missing');
  if (input['mode'] !== 'standard' && input['mode'] !== 'challenge') errors.push('mode invalid');
  if (typeof input['revision'] !== 'number') errors.push('revision missing');
  if (typeof input['lastSeenUTC'] !== 'number') errors.push('lastSeenUTC missing');
  if (!isRecord(input['dog'])) errors.push('dog missing');
  if (!isRecord(input['school'])) errors.push('school missing');
  if (!isRecord(input['settings'])) errors.push('settings missing');
  return errors.length === 0 ? { ok: true, value: input as unknown as Save, errors } : { ok: false, value: null, errors };
}

function structuralMeta(input: unknown): ValidationResult<Meta> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, value: null, errors: ['meta is not an object'] };
  if (input['schemaVersion'] !== SAVE_SCHEMA_VERSION) errors.push('schemaVersion is not supported');
  if (input['activeMode'] !== 'standard' && input['activeMode'] !== 'challenge') errors.push('activeMode invalid');
  const saveIds = input['saveIds'];
  if (!isRecord(saveIds) || typeof saveIds['standard'] !== 'string') errors.push('saveIds.standard missing');
  else if (saveIds['challenge'] !== null && typeof saveIds['challenge'] !== 'string') errors.push('saveIds.challenge invalid');
  if (!Array.isArray(input['archives'])) errors.push('archives missing');
  return errors.length === 0 ? { ok: true, value: input as unknown as Meta, errors } : { ok: false, value: null, errors };
}

export function safeValidateSave(input: unknown): ValidationResult<Save> {
  try {
    return validateSave(input);
  } catch (error) {
    if (!isNotImplemented(error)) {
      return { ok: false, value: null, errors: [`validator failed: ${error instanceof Error ? error.message : String(error)}`] };
    }
    warnValidatorMissing();
    return structuralSave(input);
  }
}

export function safeValidateMeta(input: unknown): ValidationResult<Meta> {
  try {
    return validateMeta(input);
  } catch (error) {
    if (!isNotImplemented(error)) {
      return { ok: false, value: null, errors: [`validator failed: ${error instanceof Error ? error.message : String(error)}`] };
    }
    warnValidatorMissing();
    return structuralMeta(input);
  }
}

// ---------------------------------------------------------------------------
// Bundles
// ---------------------------------------------------------------------------

export function createExportBundle(meta: Meta, saves: Save[], appVersion: string, nowUTC: number): ExportBundle {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedUTC: nowUTC,
    appVersion,
    meta: structuredClone(meta),
    saves: saves.map((save) => structuredClone(save)),
  };
}

export type ParsedBundle = { ok: true; bundle: ExportBundle; errors: [] } | { ok: false; bundle: null; errors: string[] };

/**
 * Parses and strictly validates an untrusted bundle (object or JSON string).
 * Every save goes through validateSave, meta through validateMeta, and the meta must reference
 * saves that are present with the matching mode. Never throws.
 */
export function parseImportBundle(input: unknown): ParsedBundle {
  let candidate: unknown = input;
  if (typeof input === 'string') {
    try {
      candidate = JSON.parse(input);
    } catch {
      return { ok: false, bundle: null, errors: ['Die Datei enthält kein gültiges JSON.'] };
    }
  }
  if (!isRecord(candidate)) return { ok: false, bundle: null, errors: ['Die Datei ist kein Pfotenzeit-Export.'] };
  if (candidate['format'] !== EXPORT_FORMAT) {
    return { ok: false, bundle: null, errors: ['Die Datei ist kein Pfotenzeit-Export (format fehlt oder falsch).'] };
  }
  if (candidate['version'] !== EXPORT_VERSION) {
    return { ok: false, bundle: null, errors: [`Export-Version ${String(candidate['version'])} wird nicht unterstützt.`] };
  }
  const errors: string[] = [];
  if (typeof candidate['exportedUTC'] !== 'number') errors.push('exportedUTC fehlt.');
  if (typeof candidate['appVersion'] !== 'string') errors.push('appVersion fehlt.');

  const metaResult = safeValidateMeta(candidate['meta']);
  if (!metaResult.ok || !metaResult.value) errors.push(...metaResult.errors.map((e) => `meta: ${e}`));

  const rawSaves = candidate['saves'];
  const saves: Save[] = [];
  if (!Array.isArray(rawSaves)) {
    errors.push('saves fehlt oder ist keine Liste.');
  } else {
    rawSaves.forEach((raw, index) => {
      const result = safeValidateSave(raw);
      if (result.ok && result.value) saves.push(result.value);
      else errors.push(...result.errors.map((e) => `saves[${index}]: ${e}`));
    });
    const ids = new Set<string>();
    for (const save of saves) {
      if (ids.has(save.saveId)) errors.push(`saves: saveId ${save.saveId} ist doppelt.`);
      ids.add(save.saveId);
    }
  }

  if (errors.length === 0 && metaResult.ok && metaResult.value) {
    const meta = metaResult.value;
    const byId = new Map(saves.map((save) => [save.saveId, save] as const));
    const standard = byId.get(meta.saveIds.standard);
    if (!standard) errors.push('meta: der Standard-Spielstand fehlt in saves.');
    else if (standard.mode !== 'standard') errors.push('meta: der Standard-Spielstand hat den falschen Modus.');
    if (meta.saveIds.challenge !== null) {
      const challenge = byId.get(meta.saveIds.challenge);
      if (!challenge) errors.push('meta: der Challenge-Spielstand fehlt in saves.');
      else if (challenge.mode !== 'challenge') errors.push('meta: der Challenge-Spielstand hat den falschen Modus.');
    }
    if (errors.length === 0) {
      return {
        ok: true,
        bundle: {
          format: EXPORT_FORMAT,
          version: EXPORT_VERSION,
          exportedUTC: candidate['exportedUTC'] as number,
          appVersion: candidate['appVersion'] as string,
          meta,
          saves,
        },
        errors: [],
      };
    }
  }
  return { ok: false, bundle: null, errors };
}

export function describeImportErrors(errors: string[]): string {
  const shown = errors.slice(0, 5);
  const more = errors.length > shown.length ? ` (+${errors.length - shown.length} weitere)` : '';
  return `Die Datei konnte nicht übernommen werden. Dein Spielstand bleibt unverändert.\n${shown.join('\n')}${more}`;
}

// ---------------------------------------------------------------------------
// Files (browser only)
// ---------------------------------------------------------------------------

export function exportFileName(nowUTC: number): string {
  const date = new Date(nowUTC);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `pfotenzeit-export-${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}.json`;
}

export function serializeBundle(bundle: ExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/** Triggers a browser download of the bundle. No-op outside a DOM. */
export function downloadJson(fileName: string, json: string, doc: Document = document): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  doc.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

export function downloadBundle(bundle: ExportBundle, doc: Document = document): void {
  downloadJson(exportFileName(bundle.exportedUTC), serializeBundle(bundle), doc);
}

/** Opens a file picker for a JSON file. Resolves null when the user cancels. */
export function pickJsonFile(doc: Document = document): Promise<File | null> {
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    doc.body.appendChild(input);
    input.click();
    // Browsers without the 'cancel' event: resolve null when focus returns and nothing was chosen.
    const onFocus = () => {
      setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) finish(null);
        doc.defaultView?.removeEventListener('focus', onFocus);
      }, 1500);
    };
    doc.defaultView?.addEventListener('focus', onFocus);
  });
}

export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  return JSON.parse(text) as unknown;
}
