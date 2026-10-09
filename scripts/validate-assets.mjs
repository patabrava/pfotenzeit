#!/usr/bin/env node
/**
 * Asset check (npm run assets:check): re-reads every GLB referenced by public/assets/manifest.json,
 * compares bytes/triangles/clips/bounds with the manifest, runs gltf-validator, checks the rig
 * (joint names and counts, skin weights), clip durations against clipMeta, loop closure, dog
 * shoulder heights (±10 %) and human heights (±3 %). Prints a table and exits non-zero on any
 * failure. Entries with status "pending"/"placeholder" are reported as pending, never as failures.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, validateGlb, measureDocument } from './lib/exportGltf.mjs';
import { DOG_BONE_NAMES, HUMAN_BONE_NAMES } from './lib/skeleton.mjs';
import { DOG_CLIP_META } from './lib/dogClips.mjs';
import { HUMAN_CLIP_META } from './lib/humanClips.mjs';
import { measureShoulderHeight, checkWinding, checkSkinWeights, inspectAnimations, listJointNames } from './lib/measure.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const publicDir = join(root, 'public');
const manifestPath = join(publicDir, 'assets', 'manifest.json');

/** Expectations per manifest key (07/08). */
const EXPECT = {
  'dog.nala.puppy': { kind: 'dog', shoulderHeightM: 0.28, clips: Object.keys(DOG_CLIP_META), joints: DOG_BONE_NAMES, skin: 'rig_nala', mesh: 'dog_nala_body', material: 'mat_nala_fur' },
  'dog.nala.growing': { kind: 'dog', shoulderHeightM: 0.36, clips: Object.keys(DOG_CLIP_META), joints: DOG_BONE_NAMES, skin: 'rig_nala', mesh: 'dog_nala_body', material: 'mat_nala_fur' },
  'dog.bruno.puppy': { kind: 'dog', shoulderHeightM: 0.31, clips: Object.keys(DOG_CLIP_META), joints: DOG_BONE_NAMES, skin: 'rig_bruno', mesh: 'dog_bruno_body', material: 'mat_bruno_fur' },
  'human.mira': { kind: 'human', heightM: 1.70, clips: Object.keys(HUMAN_CLIP_META), joints: HUMAN_BONE_NAMES, skin: 'rig_mira', mesh: 'human_mira_body' },
  'human.alex': { kind: 'human', heightM: 1.76, clips: Object.keys(HUMAN_CLIP_META), joints: HUMAN_BONE_NAMES, skin: 'rig_alex', mesh: 'human_alex_body' },
  'environment.school': { kind: 'static', meshes: ['school_courtyard'], nodes: ['school_courtyard'], maxTriangles: 20000 },
  // node names are what the renderer resolves with getObjectByName (src/render/app/GameRenderer.ts); mesh names stay prefixed.
  'props.care': { kind: 'static', meshes: ['prop_bowl', 'prop_water', 'prop_blanket', 'prop_ball', 'prop_toy_rolling', 'prop_leaf'], nodes: ['bowl', 'water', 'blanket', 'ball', 'toy_rolling', 'leaf'], maxTriangles: 8000 },
  'props.upgrades': { kind: 'static', meshes: ['upgrade_rest_place', 'upgrade_sniff_corner'], nodes: ['rest_place', 'sniff_corner'], maxTriangles: 10000 },
};

const TOTAL_BUDGET_BYTES = 8 * 1024 * 1024;

function near(a, b, tol) {
  return Math.abs(a - b) <= tol;
}

async function checkEntry(key, entry) {
  const problems = [];
  const notes = [];
  const exp = EXPECT[key];
  if (!exp) notes.push('no expectations table for this key');
  if (entry.status === 'pending' || entry.status === 'placeholder') {
    return { key, status: entry.status, problems, notes: ['pending; not checked'], pending: true };
  }
  if (!entry.url || entry.url.startsWith('/')) problems.push(`url must be relative, got ${entry.url}`);
  const filePath = join(publicDir, entry.url ?? '');
  if (!existsSync(filePath)) {
    problems.push(`file missing: ${entry.url}`);
    return { key, status: entry.status, problems, notes };
  }
  const bytes = readFileSync(filePath);
  const size = statSync(filePath).size;
  if (size !== entry.bytes) problems.push(`bytes ${size} ≠ manifest ${entry.bytes}`);

  const v = await validateGlb(bytes, entry.url);
  if (v.numErrors > 0) {
    problems.push(`gltf-validator: ${v.numErrors} errors`);
    for (const m of v.messages.filter((x) => x.severity === 0).slice(0, 5)) problems.push(`  ${m.code} ${m.pointer}`);
  }
  if (v.numWarnings > 0) notes.push(`${v.numWarnings} validator warnings`);

  const doc = await readGlb(bytes);
  const m = measureDocument(doc);
  if (m.triangles !== entry.triangles) problems.push(`triangles ${m.triangles} ≠ manifest ${entry.triangles}`);
  if (!entry.boundsMeters || entry.boundsMeters.some((b, i) => !near(b, m.bounds.size[i], 2e-3))) {
    problems.push(`bounds ${m.bounds.size.map((x) => x.toFixed(3))} ≠ manifest ${JSON.stringify(entry.boundsMeters)}`);
  }
  if (entry.textureSizes?.length) problems.push('textureSizes should be empty (vertex colours only)');
  if (!m.bounds.min || m.bounds.min[1] < -0.09 - 1e-3) notes.push(`min y ${m.bounds.min[1].toFixed(3)}`);
  const winding = checkWinding(doc);
  if (winding.ratio < 0.98) problems.push(`winding/normal agreement ${(winding.ratio * 100).toFixed(1)} %`);

  const names = m.animations.map((a) => a.name);
  const expClips = exp?.clips ?? [];
  if (exp && exp.kind !== 'static') {
    if (names.join() !== expClips.join()) problems.push(`clips ${names.join(',')} ≠ expected ${expClips.join(',')}`);
    if (entry.clips.join() !== names.join()) problems.push(`manifest clips differ from file: ${entry.clips.join(',')}`);
    const anims = inspectAnimations(doc);
    for (const a of anims) {
      const meta = entry.clipMeta?.[a.name];
      if (!meta) {
        problems.push(`clipMeta missing for ${a.name}`);
        continue;
      }
      if (!near(a.duration, meta.durationS, 1e-3)) problems.push(`${a.name} duration ${a.duration.toFixed(3)} ≠ clipMeta ${meta.durationS}`);
      if (a.channels === 0) problems.push(`${a.name} has no channels`);
      if (meta.loop && a.maxEndpointDiff > 1e-3) problems.push(`${a.name} loop does not close (max endpoint diff ${a.maxEndpointDiff.toExponential(2)})`);
      for (const [ev, t] of Object.entries(meta.events ?? {})) {
        if (t < 0 || t > meta.durationS) problems.push(`${a.name} event ${ev}@${t} outside clip`);
      }
    }
    const skins = listJointNames(doc);
    if (skins.length !== 1) problems.push(`expected 1 skin, found ${skins.length}`);
    else {
      if (skins[0].name !== exp.skin) problems.push(`skin name ${skins[0].name} ≠ ${exp.skin}`);
      if (skins[0].joints.join() !== exp.joints.join()) problems.push(`joint names/order differ from 08: ${skins[0].joints.join(',')}`);
      if (entry.rig?.joints !== skins[0].joints.length) problems.push(`manifest rig.joints ${entry.rig?.joints} ≠ ${skins[0].joints.length}`);
    }
    if (!m.meshes.includes(exp.mesh)) problems.push(`mesh ${exp.mesh} missing (found ${m.meshes.join(',')})`);
    if (exp.material && !m.materials.includes(exp.material)) problems.push(`material ${exp.material} missing`);
    if (m.materials.length !== 1) problems.push(`expected one material, found ${m.materials.length}`);
    const sw = checkSkinWeights(doc);
    if (!sw) problems.push('no skinned primitive found');
    else if (sw.unweighted > 0) problems.push(`${sw.unweighted} vertices with bad weights (max deviation ${sw.maxDeviation.toExponential(2)})`);
  }
  if (exp?.kind === 'dog') {
    const sh = measureShoulderHeight(doc);
    const tol = exp.shoulderHeightM * 0.1;
    if (!(sh >= exp.shoulderHeightM - tol && sh <= exp.shoulderHeightM + tol)) problems.push(`shoulder height ${sh.toFixed(3)} outside ${exp.shoulderHeightM} ±10 %`);
    else notes.push(`shoulder ${sh.toFixed(3)} m`);
    if (entry.measuredShoulderHeightM !== undefined && !near(entry.measuredShoulderHeightM, sh, 1e-3)) problems.push('manifest measuredShoulderHeightM stale');
    if (m.triangles > 18000) problems.push(`triangles ${m.triangles} above 18k (08)`);
    if (size > 3 * 1024 * 1024) problems.push('dog file above 3 MB');
  }
  if (exp?.kind === 'human') {
    const hgt = m.bounds.max[1];
    const tol = exp.heightM * 0.03;
    if (!(hgt >= exp.heightM - tol && hgt <= exp.heightM + tol)) problems.push(`height ${hgt.toFixed(3)} outside ${exp.heightM} ±3 %`);
    else notes.push(`height ${hgt.toFixed(3)} m`);
    if (size > 2 * 1024 * 1024) problems.push('human file above 2 MB');
  }
  if (exp?.kind === 'static') {
    if (names.length) problems.push('static asset should have no animations');
    for (const name of exp.meshes) if (!m.meshes.includes(name)) problems.push(`mesh ${name} missing`);
    for (const name of exp.nodes ?? []) if (!m.nodeNames.includes(name)) problems.push(`node ${name} missing (renderer getObjectByName); found ${m.nodeNames.join(',')}`);
    if (exp.nodes && entry.nodes && entry.nodes.join() !== exp.nodes.join()) problems.push('manifest nodes differ from expectations');
    if (entry.meshes && entry.meshes.join() !== exp.meshes.join()) problems.push('manifest meshes differ from expectations');
    if (m.triangles > exp.maxTriangles) problems.push(`triangles ${m.triangles} > ${exp.maxTriangles}`);
    if (m.materials.length !== 1) problems.push(`expected one material, found ${m.materials.length}`);
  }
  if (entry.status === 'final') notes.push('status final: art acceptance is not verified by this script');
  return { key, status: entry.status, bytes: size, triangles: m.triangles, clips: names.length, validator: v, problems, notes };
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.version !== 1) console.log(`note: manifest version ${manifest.version}`);
const rows = [];
let failed = 0;
let total = 0;
for (const [key, entry] of Object.entries(manifest.assets)) {
  const r = await checkEntry(key, entry);
  rows.push(r);
  if (r.problems.length) failed++;
  total += r.bytes ?? 0;
}
for (const key of Object.keys(EXPECT)) {
  if (!manifest.assets[key]) {
    rows.push({ key, status: 'missing', problems: ['not in manifest'], notes: [] });
    failed++;
  }
}

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
console.log(pad('asset', 20) + pad('status', 14) + padL('bytes', 10) + padL('tris', 8) + padL('clips', 6) + '  validator   result');
for (const r of rows) {
  const val = r.validator ? `${r.validator.numErrors}E/${r.validator.numWarnings}W/${r.validator.numInfos}I` : '-';
  const result = r.pending ? 'pending' : r.problems.length ? 'FAIL' : 'ok';
  console.log(pad(r.key, 20) + pad(r.status, 14) + padL(r.bytes ?? '-', 10) + padL(r.triangles ?? '-', 8) + padL(r.clips ?? '-', 6) + '  ' + pad(val, 11) + ' ' + result + (r.notes.length ? `  (${r.notes.join('; ')})` : ''));
  for (const p of r.problems) console.log('    - ' + p);
}
console.log(`\ntotal model bytes: ${total.toLocaleString('en-US')} (budget ${TOTAL_BUDGET_BYTES.toLocaleString('en-US')})`);
if (total > TOTAL_BUDGET_BYTES) {
  console.log('FAIL: total above 8 MB budget');
  failed++;
}
if (failed > 0) {
  console.log(`\n${failed} asset check(s) failed`);
  process.exit(1);
}
console.log('\nall asset checks passed');
