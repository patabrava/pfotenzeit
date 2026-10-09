#!/usr/bin/env node
/**
 * Pfotenzeit asset build (WP-F, D-010): code-authored rigged/skinned/animated GLBs for Nala (puppy,
 * growing), Bruno, Mira, Alex plus static GLBs for the courtyard, care props and upgrades.
 *
 * Pure Node: three for geometry math, @gltf-transform/core for authoring, @gltf-transform/functions
 * for weld/resample/dedup/prune, gltf-validator for validation. Writes public/assets/models/*.glb and
 * public/assets/manifest.json with measured numbers (bytes, triangles, bounds, clips, clipMeta).
 *
 *   npm run assets:build            build everything
 *   node scripts/build-models.mjs --preview [dir]   additionally render PNG contact sheets (dev aid)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDog } from './lib/dogGeometry.mjs';
import { NALA_PUPPY, NALA_GROWING, BRUNO_PUPPY } from './lib/dogProportions.mjs';
import { buildDogClips, DOG_CLIP_META } from './lib/dogClips.mjs';
import { buildHuman, MIRA, ALEX } from './lib/humanGeometry.mjs';
import { buildHumanClips, HUMAN_CLIP_META } from './lib/humanClips.mjs';
import { buildCourtyard, buildCareProps, buildUpgrades } from './lib/environment.mjs';
import { computeSkin } from './lib/skinning.mjs';
import { sampleClip } from './lib/pose.mjs';
import {
  buildSkinnedDocument, buildStaticDocument, optimizeDocument, writeGlb, readGlb, validateGlb, measureDocument,
} from './lib/exportGltf.mjs';
import { measureShoulderHeight, checkWinding } from './lib/measure.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const modelsDir = join(root, 'public', 'assets', 'models');
const manifestPath = join(root, 'public', 'assets', 'manifest.json');
const args = process.argv.slice(2);
const previewIndex = args.indexOf('--preview');
const previewDir = previewIndex >= 0 ? resolve(args[previewIndex + 1] ?? join(process.env.TMPDIR ?? '/tmp', 'pfotenzeit-previews')) : null;

const SOURCE = 'scripts/build-models.mjs (procedural, from 07/08 brief and reference sheets)';
const LICENSE = 'project-internal, generated code; no third-party assets';

mkdirSync(modelsDir, { recursive: true });
if (previewDir) mkdirSync(previewDir, { recursive: true });

const manifest = { version: 1, generatedUTC: new Date().toISOString(), assets: {} };
const report = [];

function fmt(n) {
  return n.toLocaleString('en-US');
}

async function finish(doc, fileName, extra) {
  await optimizeDocument(doc);
  const bytes = await writeGlb(doc);
  const path = join(modelsDir, fileName);
  writeFileSync(path, bytes);
  const back = await readGlb(bytes);
  const m = measureDocument(back);
  const v = await validateGlb(bytes, fileName);
  const winding = checkWinding(back);
  const entry = {
    url: `assets/models/${fileName}`,
    status: 'code-authored',
    bytes: bytes.byteLength,
    triangles: m.triangles,
    clips: m.animations.map((a) => a.name),
    textureSizes: [],
    boundsMeters: m.bounds.size.map((x) => Number(x.toFixed(4))),
    source: SOURCE,
    license: LICENSE,
    version: 1,
    ...extra,
  };
  report.push({ fileName, bytes: bytes.byteLength, triangles: m.triangles, validator: v, measure: m, winding });
  const warn = v.numWarnings ? `, ${v.numWarnings} warnings` : '';
  console.log(
    `${fileName.padEnd(24)} ${fmt(bytes.byteLength).padStart(9)} B  ${fmt(m.triangles).padStart(6)} tris  ` +
      `${m.animations.length} clips  validator: ${v.numErrors} errors${warn}  winding ok ${(winding.ratio * 100).toFixed(1)}%`,
  );
  if (v.numErrors > 0) {
    for (const msg of v.messages.filter((x) => x.severity === 0)) console.log('   ERROR', msg.code, msg.pointer, msg.message);
  }
  return { entry, bytes, back };
}

async function buildDogAsset(key, P, fileName, names) {
  const { skeleton, geometry, landmarks } = buildDog(P);
  const skin = computeSkin(geometry.positions, geometry.skinset, geometry.skinSets, skeleton);
  const clips = buildDogClips(P, skeleton, landmarks).map((c) => sampleClip(c, skeleton, 24));
  const doc = buildSkinnedDocument({
    meshName: names.mesh, skinName: names.skin, materialName: names.material, geometry, skin, skeleton, clips,
  });
  const clipMeta = {};
  for (const [name, meta] of Object.entries(DOG_CLIP_META)) clipMeta[name] = { ...meta };
  const { entry, back } = await finish(doc, fileName, { clipMeta });
  entry.measuredShoulderHeightM = Number(measureShoulderHeight(back).toFixed(4));
  entry.rig = { joints: skeleton.bones.length, maxInfluences: 4 };
  manifest.assets[key] = entry;
  if (previewDir) await preview(`${P.id}`, geometry, skeleton, skin, buildDogClips(P, skeleton, landmarks), P.shoulderHeight * 2.6, P.shoulderHeight * 0.75);
}

async function buildHumanAsset(key, H, fileName, names) {
  const { skeleton, geometry, landmarks } = buildHuman(H);
  const skin = computeSkin(geometry.positions, geometry.skinset, geometry.skinSets, skeleton);
  const clips = buildHumanClips(H, skeleton, landmarks).map((c) => sampleClip(c, skeleton, 24));
  const doc = buildSkinnedDocument({
    meshName: names.mesh, skinName: names.skin, materialName: names.material, geometry, skin, skeleton, clips,
  });
  const clipMeta = {};
  for (const [name, meta] of Object.entries(HUMAN_CLIP_META)) clipMeta[name] = { ...meta };
  const { entry, back } = await finish(doc, fileName, { clipMeta });
  entry.measuredHeightM = Number(measureDocument(back).bounds.max[1].toFixed(4));
  entry.rig = { joints: skeleton.bones.length, maxInfluences: 4 };
  manifest.assets[key] = entry;
  if (previewDir) await preview(`${H.id}`, geometry, skeleton, skin, buildHumanClips(H, skeleton, landmarks), H.height * 1.15, H.height / 2);
}

async function buildStaticAsset(key, fileName, materialName, meshes) {
  const doc = buildStaticDocument({ materialName, meshes });
  const { entry } = await finish(doc, fileName, {
    meshes: meshes.map((m) => m.name),
    nodes: meshes.map((m) => m.nodeName ?? m.name),
  });
  manifest.assets[key] = entry;
}

/** Dev aid: contact sheets of the rest pose and of every clip (side + three-quarter views). */
async function preview(id, geometry, skeleton, skin, clips, size, cy) {
  const { renderView, writePng, skinPositions } = await import('./lib/preview.mjs');
  const ibm = skeleton.inverseBindMatrices();
  const cell = 240;
  for (const clip of clips) {
    const times = [0, 0.25, 0.5, 0.75, 1].map((f) => f * clip.duration);
    const sheet = Buffer.alloc(cell * times.length * cell * 2 * 4);
    times.forEach((t, c) => {
      const pose = clip.pose(clip.loop && t >= clip.duration ? 0 : t);
      const posed = skinPositions(geometry.positions, geometry.normals, skin.joints, skin.weights, skeleton.fk(pose), ibm);
      const g = { positions: posed.positions, normals: posed.normals, colors: geometry.colors, indices: geometry.indices };
      const a = renderView(g, { yaw: 90, pitch: 0, size, center: [0, cy, 0], width: cell, height: cell });
      const b = renderView(g, { yaw: 35, pitch: 32, size, center: [0, cy, 0], width: cell, height: cell });
      for (let y = 0; y < cell; y++) {
        a.copy(sheet, (y * cell * times.length + c * cell) * 4, y * cell * 4, (y + 1) * cell * 4);
        b.copy(sheet, ((y + cell) * cell * times.length + c * cell) * 4, y * cell * 4, (y + 1) * cell * 4);
      }
    });
    writePng(join(previewDir, `${id}_${clip.name}.png`), cell * times.length, cell * 2, sheet);
  }
}

const t0 = Date.now();
console.log('Pfotenzeit asset build → public/assets/models');
await buildDogAsset('dog.nala.puppy', NALA_PUPPY, 'dog_nala_puppy.glb', { mesh: 'dog_nala_body', skin: 'rig_nala', material: 'mat_nala_fur' });
await buildDogAsset('dog.nala.growing', NALA_GROWING, 'dog_nala_growing.glb', { mesh: 'dog_nala_body', skin: 'rig_nala', material: 'mat_nala_fur' });
await buildDogAsset('dog.bruno.puppy', BRUNO_PUPPY, 'dog_bruno_puppy.glb', { mesh: 'dog_bruno_body', skin: 'rig_bruno', material: 'mat_bruno_fur' });
await buildHumanAsset('human.mira', MIRA, 'human_mira.glb', { mesh: 'human_mira_body', skin: 'rig_mira', material: 'mat_mira_body' });
await buildHumanAsset('human.alex', ALEX, 'human_alex.glb', { mesh: 'human_alex_body', skin: 'rig_alex', material: 'mat_alex_body' });
await buildStaticAsset('environment.school', 'school_courtyard.glb', 'mat_school', [{ name: 'school_courtyard', geometry: buildCourtyard() }]);
await buildStaticAsset('props.care', 'care_props.glb', 'mat_props', buildCareProps());
await buildStaticAsset('props.upgrades', 'school_upgrades.glb', 'mat_upgrades', buildUpgrades());

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const total = report.reduce((s, r) => s + r.bytes, 0);
const errors = report.reduce((s, r) => s + r.validator.numErrors, 0);
console.log(`\n${report.length} files, ${fmt(total)} bytes total, validator errors: ${errors}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`manifest → ${manifestPath}`);
if (previewDir) console.log(`previews → ${previewDir}`);
if (errors > 0) process.exit(1);
