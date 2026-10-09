import { describe, expect, it } from 'vitest';
import { createExportBundle, exportFileName, parseImportBundle, describeImportErrors, serializeBundle } from '../../src/storage/importExport';
import { createNewMeta } from '../../src/simulation/save';
import { createDemoSave } from '../../src/simulation/fixtures';

describe('import/export helpers', () => {
  it('round-trips a bundle through JSON', () => {
    const save = createDemoSave();
    const meta = createNewMeta(save.saveId);
    const bundle = createExportBundle(meta, [save], '0.1.0', Date.UTC(2026, 9, 9, 12, 0, 0));
    const parsed = parseImportBundle(serializeBundle(bundle));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.bundle.meta).toEqual(meta);
      expect(parsed.bundle.saves).toEqual([save]);
      expect(parsed.bundle.appVersion).toBe('0.1.0');
    }
  });

  it('names export files by UTC date', () => {
    expect(exportFileName(Date.UTC(2026, 9, 9, 23, 59, 0))).toBe('pfotenzeit-export-2026-10-09.json');
  });

  it('rejects wrong format, wrong version, mode mismatch and duplicate ids with readable errors', () => {
    const save = createDemoSave();
    const meta = createNewMeta(save.saveId);
    expect(parseImportBundle({ format: 'x' }).ok).toBe(false);
    expect(parseImportBundle({ format: 'pfotenzeit-export', version: 3 }).ok).toBe(false);
    const wrongMode = parseImportBundle({
      format: 'pfotenzeit-export',
      version: 1,
      exportedUTC: 1,
      appVersion: 'x',
      meta,
      saves: [{ ...save, mode: 'challenge' }],
    });
    expect(wrongMode.ok).toBe(false);
    if (!wrongMode.ok) expect(wrongMode.errors.join(' ')).toMatch(/Modus/);
    const duplicate = parseImportBundle({
      format: 'pfotenzeit-export',
      version: 1,
      exportedUTC: 1,
      appVersion: 'x',
      meta,
      saves: [save, save],
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.errors.join(' ')).toMatch(/doppelt/);
    const text = describeImportErrors(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(text).toContain('bleibt unverändert');
    expect(text).toContain('+2 weitere');
  });

  it('does not throw on garbage input', () => {
    for (const input of [undefined, null, 42, [], '{', 'null', { format: 'pfotenzeit-export', version: 1, saves: [null, 1, 'x'] }]) {
      expect(() => parseImportBundle(input)).not.toThrow();
      expect(parseImportBundle(input).ok).toBe(false);
    }
  });
});
