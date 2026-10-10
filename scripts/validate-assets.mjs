#!/usr/bin/env node
/**
 * Asset check (npm run assets:check): re-reads every GLB referenced by public/assets/manifest.json,
 * compares bytes/triangles/clips/bounds with the manifest, runs gltf-validator, checks the rig
 * (joint names and counts, skin weights), clip durations against clipMeta, loop closure, dog
 * shoulder heights (±10 %) and human heights (±3 %). Prints a table and exits non-zero on any
 * failure. Entries with status "pending"/"placeholder" are reported as pending, never as failures.
 *
 * Textured contract (D-036): entries may declare `material: 'textured'` (texture slots, size caps,
 * decoded-size budget, PNG/JPEG only, draw calls ≤ 3 per character / ≤ 12 environment),
 * `rig: 'vendor'` (any skeleton: ≤ 4 influences, no unweighted vertex, root scale 1, no negative
 * scales, grounded origin, +Z forward, bounds vs. expected size) and `clipMap` (semantic clip names →
 * vendor clip names; every semantic must resolve, walk has no root translation, stress/fatigue
 * semantics never map to attack/death clips). Absent fields mean vertex / project / identity, so the
 * live vertex-colour assets are checked exactly as before. D-033 face bones are optional: a 32-bone
 * project dog rig is accepted and its six face bones are checked, a 26-bone rig is accepted as is.
 *
 *   node scripts/validate-assets.mjs                      # live manifest (public/assets/manifest.json)
 *   node scripts/validate-assets.mjs --staging <dir>      # <dir>/manifest.json written by ingest-vendor.mjs;
 *                                                         # pending entries are fully checked, 8 MB total only reported
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { validateGlb, measureDocument } from './lib/exportGltf.mjs';
import { DOG_BONE_NAMES, HUMAN_BONE_NAMES } from './lib/skeleton.mjs';
import { DOG_CLIP_META } from './lib/dogClips.mjs';
import { HUMAN_CLIP_META } from './lib/humanClips.mjs';
import { measureShoulderHeight, checkWinding, checkSkinWeights, inspectAnimations, listJointNames } from './lib/measure.mjs';
import { listTextureSlots, manifestTextures } from './lib/textures.mjs';
import {
  ALLOWED_MIME, BUDGET, DOG_BONE_NAMES_D033, FACE_BONES, FORBIDDEN_CLIP_PATTERN, SEMANTIC_CLIPS, STRESS_SEMANTICS,
  classifyExtensions, countDrawCalls, dogForwardCheck, kindOfKey, maxInfluences, readGlbJson, rootTranslationRange, scaleProblems,
} from './lib/assetContract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const publicDir = join(root, 'public');

const argv = process.argv.slice(2);
const stagingIdx = argv.indexOf('--staging');
if (stagingIdx >= 0 && !argv[stagingIdx + 1]) {
  console.error('usage: validate-assets.mjs [--staging <dir>]');
  process.exit(2);
}
const stagingDir = stagingIdx >= 0 ? resolve(root, argv[stagingIdx + 1]) : null;
const baseDir = stagingDir ?? publicDir;
const manifestPath = stagingDir ? join(stagingDir, 'manifest.json') : join(publicDir, 'assets', 'manifest.json');

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
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function near(a, b, tol) {
  return Math.abs(a - b) <= tol;
}

function sameList(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

async function checkEntry(key, entry) {
  const problems = [];
  const notes = [];
  const exp = EXPECT[key];
  const kind = exp?.kind ?? kindOfKey(key);
  if (!exp) notes.push('no expectations table for this key');
  const pending = entry.status === 'pending' || entry.status === 'placeholder';
  if (pending && !stagingDir) {
    return { key, status: entry.status, problems, notes: ['pending; not checked'], pending: true };
  }
  if (pending) notes.push('pending entry fully checked (staging mode)');
  if (!entry.url || entry.url.startsWith('/')) problems.push(`url must be relative, got ${entry.url}`);
  const filePath = join(baseDir, entry.url ?? '');
  if (!existsSync(filePath)) {
    problems.push(`file missing: ${entry.url}`);
    return { key, status: entry.status, problems, notes };
  }
  const bytes = readFileSync(filePath);
  const size = statSync(filePath).size;
  if (size !== entry.bytes) problems.push(`bytes ${size} ≠ manifest ${entry.bytes}`);

  const material = entry.material ?? 'vertex';
  const rigKind = typeof entry.rig === 'string' ? entry.rig : 'project';
  if (!['vertex', 'textured'].includes(material)) problems.push(`material must be 'vertex' or 'textured', got ${JSON.stringify(entry.material)}`);
  if (!['project', 'vendor'].includes(rigKind)) problems.push(`rig must be 'project' or 'vendor', got ${JSON.stringify(entry.rig)}`);

  // extension policy (before decoding; decoder extensions never pass)
  const ext = classifyExtensions(readGlbJson(bytes));
  for (const e of ext.unsupported) problems.push(`extension ${e} needs a decoder the app does not ship`);
  for (const e of ext.unknown) problems.push(`extension ${e} is not in the allow list`);
  if (material === 'vertex' && ext.allowed.length) problems.push(`vertex-colour asset must use no extensions (found ${ext.allowed.join(',')})`);
  if (ext.allowed.length) notes.push(`extensions ${ext.allowed.join(',')}`);

  const v = await validateGlb(bytes, entry.url);
  if (v.numErrors > 0) {
    problems.push(`gltf-validator: ${v.numErrors} errors`);
    for (const m of v.messages.filter((x) => x.severity === 0).slice(0, 5)) problems.push(`  ${m.code} ${m.pointer}`);
  }
  if (v.numWarnings > 0) notes.push(`${v.numWarnings} validator warnings`);

  const doc = await io.readBinary(new Uint8Array(bytes));
  const m = measureDocument(doc);
  if (m.triangles !== entry.triangles) problems.push(`triangles ${m.triangles} ≠ manifest ${entry.triangles}`);
  if (!entry.boundsMeters || entry.boundsMeters.some((b, i) => !near(b, m.bounds.size[i], 2e-3))) {
    problems.push(`bounds ${m.bounds.size.map((x) => x.toFixed(3))} ≠ manifest ${JSON.stringify(entry.boundsMeters)}`);
  }
  if (!m.bounds.min || m.bounds.min[1] < -0.09 - 1e-3) notes.push(`min y ${m.bounds.min[1].toFixed(3)}`);
  const winding = checkWinding(doc);
  if (winding.ratio < 0.98) problems.push(`winding/normal agreement ${(winding.ratio * 100).toFixed(1)} %`);
  for (const p of scaleProblems(doc)) problems.push(p);

  // ---------------------------------------------------------------- material / textures / draw calls
  const texRows = listTextureSlots(doc);
  const fileTextures = manifestTextures(doc);
  if (material === 'vertex') {
    if (entry.textureSizes?.length) problems.push('textureSizes should be empty (vertex colours only)');
    if (entry.textures?.length) problems.push('textures should be empty (vertex colours only)');
    if (texRows.length) problems.push(`file has ${texRows.length} texture slot(s) but material is 'vertex'`);
  } else {
    if (!texRows.length) problems.push("material 'textured' but the file has no textures");
    if (!sameList(entry.textures, fileTextures)) problems.push(`manifest textures differ from file: ${JSON.stringify(fileTextures)}`);
    const cap = BUDGET.textureCap[kind];
    const seen = new Set();
    let decoded = 0;
    for (const r of texRows) {
      const id = `${r.name}:${r.bytes}`;
      if (!seen.has(id)) {
        seen.add(id);
        decoded += r.decodedBytes;
      }
      if (!ALLOWED_MIME.includes(r.mime)) problems.push(`texture ${r.name} (${r.slot}) is ${r.mime}; only PNG/JPEG without decoders`);
      if (r.width > cap || r.height > cap) problems.push(`texture ${r.name} (${r.slot}) ${r.width}x${r.height} above ${cap}² cap`);
      if (r.width === 0) problems.push(`texture ${r.name} (${r.slot}) has an unreadable size`);
    }
    if (decoded > BUDGET.decodedTextureBytes[kind]) problems.push(`decoded texture estimate ${(decoded / 1048576).toFixed(2)} MB above ${(BUDGET.decodedTextureBytes[kind] / 1048576).toFixed(0)} MB`);
    else notes.push(`textures ${seen.size}, decoded ≈ ${(decoded / 1048576).toFixed(2)} MB`);
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const mat = prim.getMaterial();
        if (!mat) continue;
        const hasTex = texRows.some((r) => r.material === mat.getName());
        if (hasTex && !prim.getAttribute('TEXCOORD_0')) problems.push(`${mesh.getName()}: textured material ${mat.getName()} but no TEXCOORD_0`);
        if (mat.getNormalTexture() && !prim.getAttribute('TANGENT')) notes.push(`${mesh.getName()}: normal map without TANGENT (three derives tangents per fragment; MikkTSpace not guaranteed)`);
      }
    }
    notes.push("baseColor sRGB flagging is the loader's job (by slot)");
  }
  const drawCalls = countDrawCalls(doc);
  if (drawCalls > BUDGET.drawCalls[kind]) problems.push(`draw calls ${drawCalls} above ${BUDGET.drawCalls[kind]}`);
  if (entry.drawCalls !== undefined && entry.drawCalls !== drawCalls) problems.push(`manifest drawCalls ${entry.drawCalls} ≠ ${drawCalls}`);
  if (material === 'textured' || rigKind === 'vendor') notes.push(`${drawCalls} draw call(s)`);

  // ---------------------------------------------------------------- clips and rig (characters)
  const names = m.animations.map((a) => a.name);
  const semantics = exp?.clips ?? SEMANTIC_CLIPS[kind];
  if (kind !== 'static') {
    const anims = inspectAnimations(doc);
    const byName = new Map(anims.map((a) => [a.name, a]));
    let clipMap;
    if (rigKind === 'project' && !entry.clipMap) {
      if (names.join() !== semantics.join()) problems.push(`clips ${names.join(',')} ≠ expected ${semantics.join(',')}`);
      if (entry.clips.join() !== names.join()) problems.push(`manifest clips differ from file: ${entry.clips.join(',')}`);
      clipMap = Object.fromEntries(semantics.map((s) => [s, s]));
    } else {
      clipMap = entry.clipMap ?? Object.fromEntries(semantics.map((s) => [s, s]));
      if (!sameList(entry.clips, semantics)) problems.push(`manifest clips must be the semantic list ${semantics.join(',')}`);
      if (!sameList(entry.sourceClips, names)) problems.push(`manifest sourceClips differ from file: ${names.join(',')}`);
      for (const s of semantics) {
        const src = clipMap[s];
        if (src === undefined) problems.push(`semantic clip ${s} missing from clipMap`);
        else if (!byName.has(src)) problems.push(`semantic clip ${s} → ${JSON.stringify(src)} not in file`);
      }
      notes.push(`clipMap: ${semantics.filter((s) => clipMap[s] !== s).length} renamed`);
    }
    for (const s of semantics) {
      const a = byName.get(clipMap[s]);
      if (!a) continue;
      const meta = entry.clipMeta?.[s];
      if (!meta) {
        problems.push(`clipMeta missing for ${s}`);
        continue;
      }
      if (!near(a.duration, meta.durationS, 1e-3)) problems.push(`${s} duration ${a.duration.toFixed(3)} ≠ clipMeta ${meta.durationS}`);
      if (a.channels === 0) problems.push(`${s} has no channels`);
      if (meta.loop && a.maxEndpointDiff > 1e-3) problems.push(`${s} loop does not close (max endpoint diff ${a.maxEndpointDiff.toExponential(2)}); fix the clip or set loop:false deliberately`);
      if (s === 'eat' && meta.events?.treat_received === undefined) problems.push('eat must carry treat_received');
      if (meta.events !== undefined && (!meta.events || typeof meta.events !== 'object' || Array.isArray(meta.events))) problems.push(`${s} events must be an object`);
      for (const [ev, t] of Object.entries(meta.events ?? {})) {
        if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0 || t >= a.duration) problems.push(`${s} event ${ev}@${t} must be strictly inside clip`);
      }
    }
    for (const s of STRESS_SEMANTICS) {
      if (clipMap[s] !== undefined && FORBIDDEN_CLIP_PATTERN.test(clipMap[s])) problems.push(`${s} is mapped to ${JSON.stringify(clipMap[s])}, which reads as attack/death (not allowed for stress/fatigue semantics)`);
    }
    if (clipMap.walk !== undefined) {
      const walkAnim = doc.getRoot().listAnimations().find((a) => a.getName() === clipMap.walk);
      if (walkAnim) {
        const range = rootTranslationRange(doc, walkAnim);
        if (range > 1e-3) problems.push(`walk has root translation (range ${range.toFixed(3)} m); walk must animate in place`);
      }
    }

    const skins = listJointNames(doc);
    if (skins.length !== 1) problems.push(`expected 1 skin, found ${skins.length}`);
    else {
      const joints = skins[0].joints;
      if (rigKind === 'project') {
        if (skins[0].name !== exp?.skin) problems.push(`skin name ${skins[0].name} ≠ ${exp?.skin}`);
        const base = exp?.joints ?? (kind === 'dog' ? DOG_BONE_NAMES : HUMAN_BONE_NAMES);
        const isBase = joints.join() === base.join();
        const isD033 = kind === 'dog' && joints.join() === DOG_BONE_NAMES_D033.join();
        if (!isBase && !isD033) problems.push(`joint names/order differ from 08${kind === 'dog' ? '/D-033' : ''}: ${joints.join(',')}`);
        if (isD033) {
          const missingFace = FACE_BONES.filter((b) => !joints.includes(b));
          if (missingFace.length) problems.push(`D-033 face bones missing: ${missingFace.join(',')}`);
          else notes.push('D-033 face bones present (32 joints)');
        }
        if (typeof entry.rig === 'object' && entry.rig !== null && entry.rig.joints !== joints.length) problems.push(`manifest rig.joints ${entry.rig.joints} ≠ ${joints.length}`);
      } else {
        notes.push(`vendor rig ${skins[0].name || '(unnamed)'}: ${joints.length} joints`);
      }
      if (entry.rigInfo?.joints !== undefined && entry.rigInfo.joints !== joints.length) problems.push(`manifest rigInfo.joints ${entry.rigInfo.joints} ≠ ${joints.length}`);
    }
    const infl = maxInfluences(doc);
    if (infl > BUDGET.maxInfluences) problems.push(`more than ${BUDGET.maxInfluences} skin influences (JOINTS_1 present)`);
    if (rigKind === 'project') {
      if (!m.meshes.includes(exp?.mesh)) problems.push(`mesh ${exp?.mesh} missing (found ${m.meshes.join(',')})`);
    } else notes.push(`meshes ${m.meshes.join(',')}`);
    if (material === 'vertex') {
      if (exp?.material && !m.materials.includes(exp.material)) problems.push(`material ${exp.material} missing`);
      if (m.materials.length !== 1) problems.push(`expected one material, found ${m.materials.length}`);
    } else notes.push(`materials ${m.materials.join(',')}`);
    const sw = checkSkinWeights(doc);
    if (!sw) problems.push('no skinned primitive found');
    else if (sw.unweighted > 0) problems.push(`${sw.unweighted} vertices with bad weights (max deviation ${sw.maxDeviation.toExponential(2)})`);
    if (rigKind === 'vendor') {
      if (Math.abs(m.bounds.min[1]) > BUDGET.groundToleranceM) problems.push(`origin not on the ground: min y ${m.bounds.min[1].toFixed(3)} m (±${BUDGET.groundToleranceM} m)`);
    }
  }

  if (kind === 'dog') {
    const expected = exp?.shoulderHeightM;
    const sh = measureShoulderHeight(doc);
    if (expected !== undefined) {
      if (Number.isFinite(sh)) {
        const tol = expected * 0.1;
        if (!(sh >= expected - tol && sh <= expected + tol)) problems.push(`shoulder height ${sh.toFixed(3)} outside ${expected} ±10 %`);
        else notes.push(`shoulder ${sh.toFixed(3)} m`);
        if (entry.measuredShoulderHeightM !== undefined && !near(entry.measuredShoulderHeightM, sh, 1e-3)) problems.push('manifest measuredShoulderHeightM stale');
      } else if (rigKind === 'vendor') {
        const est = m.bounds.size[1] / BUDGET.dogHeightToShoulder;
        const tol = expected * 0.15;
        if (!(est >= expected - tol && est <= expected + tol)) problems.push(`bounds height ${m.bounds.size[1].toFixed(3)} m ⇒ shoulder ≈ ${est.toFixed(3)} outside ${expected} ±15 % (vendor rig, no project joint names)`);
        else notes.push(`shoulder ≈ ${est.toFixed(3)} m from bounds (vendor rig)`);
      } else problems.push('shoulder height not measurable (no spine_02/leg_f*_upper joints)');
    }
    if (rigKind === 'vendor') {
      const fwd = dogForwardCheck(doc);
      if (!fwd.ok) problems.push(`forward axis: head band mean z ${fwd.meanZ.toFixed(3)} ≤ 0 (nose must point to +Z)`);
    }
    if (m.triangles > 18000) problems.push(`triangles ${m.triangles} above 18k (08)`);
    if (size > BUDGET.fileBytes.dog) problems.push('dog file above 3 MB');
  }
  if (kind === 'human') {
    const hgt = m.bounds.max[1];
    if (exp?.heightM !== undefined) {
      const tol = exp.heightM * 0.03;
      if (!(hgt >= exp.heightM - tol && hgt <= exp.heightM + tol)) problems.push(`height ${hgt.toFixed(3)} outside ${exp.heightM} ±3 %`);
      else notes.push(`height ${hgt.toFixed(3)} m`);
    }
    if (size > BUDGET.fileBytes.human) problems.push('human file above 2 MB');
  }
  if (kind === 'static') {
    if (names.length) problems.push('static asset should have no animations');
    for (const name of exp?.meshes ?? []) if (!m.meshes.includes(name)) problems.push(`mesh ${name} missing`);
    for (const name of exp?.nodes ?? []) if (!m.nodeNames.includes(name)) problems.push(`node ${name} missing (renderer getObjectByName); found ${m.nodeNames.join(',')}`);
    if (exp?.nodes && entry.nodes && entry.nodes.join() !== exp.nodes.join()) problems.push('manifest nodes differ from expectations');
    if (entry.meshes && exp?.meshes && entry.meshes.join() !== exp.meshes.join()) problems.push('manifest meshes differ from expectations');
    if (exp?.maxTriangles && m.triangles > exp.maxTriangles) problems.push(`triangles ${m.triangles} > ${exp.maxTriangles}`);
    if (material === 'vertex' && m.materials.length !== 1) problems.push(`expected one material, found ${m.materials.length}`);
  }
  if (entry.status === 'final') notes.push('status final: art acceptance is not verified by this script');
  return { key, status: entry.status, material, rig: rigKind, bytes: size, triangles: m.triangles, clips: names.length, validator: v, problems, notes };
}

if (!existsSync(manifestPath)) {
  console.error(`manifest not found: ${manifestPath}`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (stagingDir) console.log(`staging mode: ${manifestPath}`);
else if (manifest.version !== 1) console.log(`note: manifest version ${manifest.version}`);
const rows = [];
let failed = 0;
let total = 0;
for (const [key, entry] of Object.entries(manifest.assets)) {
  const r = await checkEntry(key, entry);
  rows.push(r);
  if (r.problems.length) failed++;
  total += r.bytes ?? 0;
}
if (!stagingDir) {
  for (const key of Object.keys(EXPECT)) {
    if (!manifest.assets[key]) {
      rows.push({ key, status: 'missing', problems: ['not in manifest'], notes: [] });
      failed++;
    }
  }
}

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
console.log(pad('asset', 20) + pad('status', 14) + pad('mat/rig', 18) + padL('bytes', 10) + padL('tris', 8) + padL('clips', 6) + '  validator   result');
for (const r of rows) {
  const val = r.validator ? `${r.validator.numErrors}E/${r.validator.numWarnings}W/${r.validator.numInfos}I` : '-';
  const result = r.pending ? 'pending' : r.problems.length ? 'FAIL' : 'ok';
  const mr = r.material ? `${r.material}/${r.rig}` : '-';
  console.log(pad(r.key, 20) + pad(r.status, 14) + pad(mr, 18) + padL(r.bytes ?? '-', 10) + padL(r.triangles ?? '-', 8) + padL(r.clips ?? '-', 6) + '  ' + pad(val, 11) + ' ' + result + (r.notes.length ? `  (${r.notes.join('; ')})` : ''));
  for (const p of r.problems) console.log('    - ' + p);
}
console.log(`\ntotal model bytes: ${total.toLocaleString('en-US')} (budget ${TOTAL_BUDGET_BYTES.toLocaleString('en-US')}${stagingDir ? ', reported only in staging mode' : ''})`);
if (!stagingDir && total > TOTAL_BUDGET_BYTES) {
  console.log('FAIL: total above 8 MB budget');
  failed++;
}
if (failed > 0) {
  console.log(`\n${failed} asset check(s) failed`);
  process.exit(1);
}
console.log(stagingDir ? '\nall staging checks passed' : '\nall asset checks passed');
