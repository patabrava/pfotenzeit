import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { BUDGET } from '../lib/assetContract.mjs';

const dir = mkdtempSync(join(tmpdir(), 'pfz-d040-'));
const run = (...args) => spawnSync(process.execPath, args, { encoding: 'utf8' });
try {
  assert.ok(2 * 1024 * 1024 * 4 * 1.33 < BUDGET.decodedTextureBytes.dog);
  assert.equal(BUDGET.decodedTextureBytes.human, 12 * 1024 * 1024);
  const map = JSON.parse(readFileSync('art/staging/vendor-dryrun/clipmap.json', 'utf8'));
  Object.assign(map, { alert_focus: 'Alert_Idle', rest_side: 'Sleep_Loop', stand_up: 'GetUp' });
  map.eat = { clip: map.eat, events: { treat_received: 2.4 } };
  const mapping = join(dir, 'clipmap.json');
  writeFileSync(mapping, JSON.stringify(map));
  const staged = join(dir, 'staged');
  const ingested = run('scripts/ingest-vendor.mjs', 'art/staging/vendor-dryrun/input/vendor_puppy.glb', '--key', 'dog.nala.puppy', '--out', staged, '--clipmap', mapping);
  assert.equal(ingested.status, 0, ingested.stderr);
  const manifestPath = join(staged, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const entry = manifest.assets['dog.nala.puppy'];
  assert.equal(entry.clipMeta.eat.events.treat_received, 2.4);
  const positive = run('scripts/validate-assets.mjs', '--staging', staged);
  assert.equal(positive.status, 0, positive.stdout + positive.stderr);
  for (const time of [0, 4, -1, '2.4', null]) {
    entry.clipMeta.eat.events = { treat_received: time };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const negative = run('scripts/validate-assets.mjs', '--staging', staged);
    assert.equal(negative.status, 1, `accepted invalid event ${JSON.stringify(time)}`);
  }
  entry.clipMeta.eat.events = {};
  writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.equal(run('scripts/validate-assets.mjs', '--staging', staged).status, 1);
  assert.notEqual(run('scripts/ingest-vendor.mjs', 'art/staging/vendor-dryrun/input/vendor_puppy.glb', '--key', 'dog.nala.puppy', '--out', 'public/rejected-d040').status, 0);
  console.log('PASS D-040: 12 MiB caps, temporary output outside public, object clipmap event override, five invalid event times, missing treat_received, public output rejection');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
