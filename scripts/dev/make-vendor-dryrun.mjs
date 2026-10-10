#!/usr/bin/env node
/**
 * Vendor-rig dry run (WP-L, D-036): turns the staged Blender reference candidate
 * art/blender-reference-pass-2026-10-09/candidates/dog_nala_puppy.glb into a synthetic "vendor" file so
 * every `rig: 'vendor'` / `clipMap` path of scripts/ingest-vendor.mjs and scripts/validate-assets.mjs is
 * exercised on a real GLB before the purchased hero model arrives. gltf-transform only, no Blender.
 *
 *   node scripts/dev/make-vendor-dryrun.mjs              # writes art/staging/vendor-dryrun/input/*.glb + clipmaps
 *   node scripts/dev/make-vendor-dryrun.mjs --negatives  # after the ingest runs: derives the four expect-fail manifests
 *
 * Input file changes: every bone renamed to a vendor-ish name (hierarchy and weights untouched), skin/mesh/
 * node renamed, the 13 clips renamed to vendor names, two extra clips added: `Attack01` (copy of Alert_Idle)
 * and `Walk_RootMotion` (Walk_FWD plus 0.4 m root translation over the clip). Textures/material untouched.
 * A second variant `vendor_puppy_2prims.glb` splits the body into two primitives (draw-call negative case).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const SOURCE = join(root, 'art/blender-reference-pass-2026-10-09/candidates/dog_nala_puppy.glb');
const OUT = join(root, 'art/staging/vendor-dryrun');
const INPUT = join(OUT, 'input');
const STAGED = join(OUT, 'staged');
const EXPECT_FAIL = join(OUT, 'expect-fail');

/** project bone → vendor-ish name (Blender DEF- prefixes, auto-numbered bones, a mixamo-style head). */
const BONE_NAMES = {
  root: 'Armature_Root',
  pelvis: 'DEF-hips',
  spine_01: 'DEF-spine.001',
  spine_02: 'DEF-spine.002',
  neck: 'DEF-neck',
  head: 'mixamorig:Head',
  jaw: 'DEF-jaw',
  ear_l_01: 'DEF-ear.L', ear_l_02: 'DEF-ear.L.001',
  ear_r_01: 'DEF-ear.R', ear_r_02: 'DEF-ear.R.001',
  tail_01: 'Bone.014', tail_02: 'Bone.015', tail_03: 'Bone.016',
  leg_fl_upper: 'DEF-upper_arm.L', leg_fl_lower: 'DEF-forearm.L', paw_fl: 'DEF-hand.L',
  leg_fr_upper: 'DEF-upper_arm.R', leg_fr_lower: 'DEF-forearm.R', paw_fr: 'DEF-hand.R',
  leg_bl_upper: 'DEF-thigh.L', leg_bl_lower: 'DEF-shin.L', paw_bl: 'DEF-foot.L',
  leg_br_upper: 'DEF-thigh.R', leg_br_lower: 'DEF-shin.R', paw_br: 'DEF-foot.R',
};

/** semantic → vendor clip name (what a shop file typically ships). */
export const VENDOR_CLIPS = {
  idle_relaxed: 'Idle_Loop',
  look_at_handler: 'LookLeft',
  sniff: 'Sniff01',
  walk: 'Walk_FWD',
  sit: 'Sit_Down',
  lie_down: 'LieDown',
  rest_loop: 'Sleep_Loop',
  eat: 'Eat01',
  play_bow: 'PlayBow',
  turn_away: 'TurnAway',
  tense_idle: 'Alert_Idle',
  tired_idle: 'Tired_Idle',
  recover: 'GetUp',
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function cloneAnimation(doc, anim, name) {
  const out = doc.createAnimation(name);
  for (const ch of anim.listChannels()) {
    const s = ch.getSampler();
    const s2 = doc.createAnimationSampler().setInput(s.getInput()).setOutput(s.getOutput()).setInterpolation(s.getInterpolation());
    const c2 = doc.createAnimationChannel().setTargetNode(ch.getTargetNode()).setTargetPath(ch.getTargetPath()).setSampler(s2);
    out.addSampler(s2).addChannel(c2);
  }
  return out;
}

function duration(anim) {
  let d = 0;
  for (const ch of anim.listChannels()) d = Math.max(d, ch.getSampler().getInput().getMax([0])[0]);
  return d;
}

/** Add (or extend) a translation channel on `node` so the clip moves it `distance` m along +Z. */
function addRootMotion(doc, anim, node, distance) {
  const buffer = doc.getRoot().listBuffers()[0];
  const existing = anim.listChannels().find((c) => c.getTargetNode() === node && c.getTargetPath() === 'translation');
  const total = duration(anim);
  if (existing) {
    const s = existing.getSampler();
    const input = s.getInput();
    const out = s.getOutput();
    const arr = new Float32Array(out.getArray());
    const v = [0, 0, 0];
    for (let i = 0; i < input.getCount(); i++) {
      out.getElement(i, v);
      arr[i * 3 + 2] = v[2] + (distance * input.getScalar(i)) / total;
    }
    s.setOutput(doc.createAccessor().setType('VEC3').setArray(arr).setBuffer(buffer));
    return;
  }
  const base = node.getTranslation();
  const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, total])).setBuffer(buffer);
  const output = doc.createAccessor().setType('VEC3').setArray(new Float32Array([...base, base[0], base[1], base[2] + distance])).setBuffer(buffer);
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
  const channel = doc.createAnimationChannel().setTargetNode(node).setTargetPath('translation').setSampler(sampler);
  anim.addSampler(sampler).addChannel(channel);
}

async function buildInput() {
  const doc = await io.read(SOURCE);
  const rootG = doc.getRoot();
  const skin = rootG.listSkins()[0];
  if (!skin) throw new Error('source has no skin');
  const renamed = [];
  for (const joint of skin.listJoints()) {
    const vendor = BONE_NAMES[joint.getName()] ?? `Bone.${String(renamed.length).padStart(3, '0')}`;
    renamed.push(`${joint.getName()}→${vendor}`);
    joint.setName(vendor);
  }
  skin.setName('Armature');
  for (const mesh of rootG.listMeshes()) mesh.setName('GoldenRetrieverPuppy_LOD0');
  for (const node of rootG.listNodes()) if (node.getMesh()) node.setName('GoldenRetrieverPuppy');
  for (const mat of rootG.listMaterials()) mat.setName('M_Puppy_Fur');

  const byName = new Map(rootG.listAnimations().map((a) => [a.getName(), a]));
  for (const [semantic, vendor] of Object.entries(VENDOR_CLIPS)) {
    const a = byName.get(semantic);
    if (!a) throw new Error(`source lacks clip ${semantic}`);
    a.setName(vendor);
  }
  // extra vendor clips the game must never pick up
  cloneAnimation(doc, byName.get('tense_idle'), 'Attack01');
  const walkRM = cloneAnimation(doc, byName.get('walk'), 'Walk_RootMotion');
  const skeletonRoot = skin.getSkeleton() ?? skin.listJoints()[0];
  addRootMotion(doc, walkRM, skeletonRoot, 0.4);

  mkdirSync(INPUT, { recursive: true });
  const bytes = await io.writeBinary(doc);
  writeFileSync(join(INPUT, 'vendor_puppy.glb'), bytes);
  console.log(`wrote ${relative(root, join(INPUT, 'vendor_puppy.glb'))} (${bytes.byteLength} B)`);
  console.log(`  bones: ${renamed.join(', ')}`);
  console.log(`  clips: ${rootG.listAnimations().map((a) => `${a.getName()} ${duration(a).toFixed(2)}s`).join(', ')}`);

  // two-primitive variant: same geometry, index range split in half (draw-call negative case)
  const mesh = rootG.listMeshes()[0];
  const prim = mesh.listPrimitives()[0];
  const idx = prim.getIndices();
  const all = idx.getArray();
  const half = Math.floor(all.length / 6) * 3;
  const buffer = rootG.listBuffers()[0];
  const mk = (arr) => doc.createAccessor().setType('SCALAR').setArray(arr).setBuffer(buffer);
  const prim2 = prim.clone();
  prim.setIndices(mk(all.slice(0, half)));
  prim2.setIndices(mk(all.slice(half)));
  mesh.addPrimitive(prim2);
  const bytes2 = await io.writeBinary(doc);
  writeFileSync(join(INPUT, 'vendor_puppy_2prims.glb'), bytes2);
  console.log(`wrote ${relative(root, join(INPUT, 'vendor_puppy_2prims.glb'))} (${bytes2.byteLength} B, ${mesh.listPrimitives().length} primitives)`);

  writeFileSync(join(OUT, 'clipmap.json'), JSON.stringify(VENDOR_CLIPS, null, 2) + '\n');
  mkdirSync(EXPECT_FAIL, { recursive: true });
  writeFileSync(join(EXPECT_FAIL, 'clipmap.a-tense-idle-attack.expect-fail.json'), JSON.stringify({ ...VENDOR_CLIPS, tense_idle: 'Attack01' }, null, 2) + '\n');
  writeFileSync(join(EXPECT_FAIL, 'clipmap.b-walk-rootmotion.expect-fail.json'), JSON.stringify({ ...VENDOR_CLIPS, walk: 'Walk_RootMotion' }, null, 2) + '\n');
  console.log(`wrote ${relative(root, join(OUT, 'clipmap.json'))} and two expect-fail clipmaps`);
}

/**
 * Negative manifests. (a) and (b) are what the ingest writes with the expect-fail clipmaps (clipMap entry
 * and clipMeta duration of the mapped clip); they point at the staged GLB via a relative url so the 2 MB file
 * is not duplicated. (c) drops `recover` from `clips`. (d) takes the ingest output of the two-primitive variant
 * and claims `drawCalls: 1`.
 */
function buildNegatives() {
  const stagedManifest = JSON.parse(readFileSync(join(STAGED, 'manifest.json'), 'utf8'));
  const key = 'dog.nala.puppy';
  const base = stagedManifest.assets[key];
  if (!base) throw new Error('run the ingest into art/staging/vendor-dryrun/staged first');
  const write = (dir, entry, note) => {
    mkdirSync(join(EXPECT_FAIL, dir), { recursive: true });
    const m = { version: 2, staging: true, expectFail: note, assets: { [key]: entry } };
    writeFileSync(join(EXPECT_FAIL, dir, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
    console.log(`wrote ${relative(root, join(EXPECT_FAIL, dir, 'manifest.json'))}: ${note}`);
  };
  const shared = { ...base, url: '../../staged/' + base.url };
  const dur = (name) => {
    const report = JSON.parse(readFileSync(join(STAGED, base.url.replace(/\.glb$/, '.report.json')), 'utf8'));
    return report.after.animations.find((a) => a.name === name)?.durationS ?? null;
  };
  write('a-tense-idle-attack', {
    ...shared,
    clipMap: { ...base.clipMap, tense_idle: 'Attack01' },
    clipMeta: { ...base.clipMeta, tense_idle: { ...base.clipMeta.tense_idle, durationS: dur('Attack01'), source: 'Attack01' } },
  }, 'tense_idle mapped to Attack01 must fail (stress semantics never map to attack/death clips)');
  write('b-walk-rootmotion', {
    ...shared,
    clipMap: { ...base.clipMap, walk: 'Walk_RootMotion' },
    clipMeta: { ...base.clipMeta, walk: { ...base.clipMeta.walk, durationS: dur('Walk_RootMotion'), source: 'Walk_RootMotion' } },
  }, 'walk mapped to Walk_RootMotion must fail (walk animates in place)');
  write('c-missing-recover', {
    ...shared,
    clips: base.clips.filter((c) => c !== 'recover'),
  }, "manifest clips without 'recover' must fail (clips must be the semantic list)");

  const dDir = join(EXPECT_FAIL, 'd-drawcalls-1-vs-2');
  const dManifestPath = join(dDir, 'manifest.json');
  if (!existsSync(dManifestPath)) throw new Error('ingest input/vendor_puppy_2prims.glb into expect-fail/d-drawcalls-1-vs-2 first');
  const dManifest = JSON.parse(readFileSync(dManifestPath, 'utf8'));
  const dEntry = dManifest.assets[key];
  dManifest.expectFail = `manifest drawCalls 1 while the file has ${dEntry.drawCalls} primitives must fail`;
  dEntry.drawCalls = 1;
  writeFileSync(dManifestPath, JSON.stringify(dManifest, null, 2) + '\n');
  console.log(`patched ${relative(root, dManifestPath)}: ${dManifest.expectFail}`);
}

const negatives = process.argv.includes('--negatives');
if (negatives) buildNegatives();
else await buildInput();
