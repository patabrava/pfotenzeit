#!/usr/bin/env node
/**
 * Vendor GLB ingest (D-036). Normalizes an authored GLB into art/staging/<dir>/ and writes an
 * inventory report plus a draft manifest entry (status "pending", productionIntegrated false).
 * Never writes into public/: shipping is a separate, reviewed step (docs/VENDOR_INGEST.md).
 *
 *   node scripts/ingest-vendor.mjs <input.glb> --key dog.nala.puppy --out art/staging/<dir>/
 *        [--name <basename>] [--clipmap map.json] [--max-texture 1024] [--quantize]
 *        [--source "..."] [--license "..."]
 *
 * Steps: inventory → prune → dedup → PNG textures box-filtered to the cap (nearest power of two)
 * → optional quantize (KHR_mesh_quantization, core in three) → write <name>.glb,
 * <name>.report.json, <name>.manifest-entry.json and merge the entry into <out>/manifest.json
 * (checked by `node scripts/validate-assets.mjs --staging <out>`).
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize } from '@gltf-transform/functions';
import { measureDocument, validateGlb } from './lib/exportGltf.mjs';
import { checkSkinWeights, inspectAnimations, listJointNames, measureShoulderHeight } from './lib/measure.mjs';
import { listTextureSlots, manifestTextures, resizeTextureToCap } from './lib/textures.mjs';
import {
  BUDGET, SEMANTIC_CLIPS, SEMANTIC_CLIP_META, classifyExtensions, countDrawCalls, kindOfKey, maxInfluences,
  readGlbJson, resolveClipMap, rigKindOf, rootTranslationRange, scaleProblems, skeletonRoot,
} from './lib/assetContract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// ---------------------------------------------------------------- arguments
function parseArgs(argv) {
  const args = { quantize: false, maxTexture: 1024 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`missing value for ${a}`);
      return argv[++i];
    };
    if (a === '--key') args.key = next();
    else if (a === '--out') args.out = next();
    else if (a === '--name') args.name = next();
    else if (a === '--clipmap') args.clipmap = next();
    else if (a === '--max-texture') args.maxTexture = Number(next());
    else if (a === '--quantize') args.quantize = true;
    else if (a === '--source') args.source = next();
    else if (a === '--license') args.license = next();
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else positional.push(a);
  }
  if (positional.length !== 1) throw new Error('usage: ingest-vendor.mjs <input.glb> --key <manifest key> --out <dir> [options]');
  if (!args.key) throw new Error('--key is required (e.g. dog.nala.puppy)');
  if (!args.out) throw new Error('--out is required (a directory outside public/)');
  if (!Number.isFinite(args.maxTexture) || args.maxTexture < 16) throw new Error('--max-texture must be a number ≥ 16');
  args.input = resolve(positional[0]);
  args.outDir = resolve(args.out);
  args.name = args.name ?? basename(args.input).replace(/\.glb$/i, '');
  return args;
}

function assertNotPublic(outDir) {
  const pub = join(root, 'public');
  const real = (p) => (existsSync(p) ? realpathSync(p) : p);
  const rel = relative(real(pub), real(outDir));
  if (rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[A-Za-z]:/.test(rel))) {
    throw new Error(`refusing to write into public/ (${outDir}); stage outside public/ and ship through the owning work package`);
  }
}

// ---------------------------------------------------------------- inventory
function inventory(doc, bytesLength) {
  const rootG = doc.getRoot();
  const m = measureDocument(doc);
  const meshes = rootG.listMeshes().map((mesh) => ({
    name: mesh.getName(),
    primitives: mesh.listPrimitives().map((p) => {
      const idx = p.getIndices();
      const pos = p.getAttribute('POSITION');
      return {
        semantics: p.listSemantics(),
        mode: p.getMode(),
        vertices: pos ? pos.getCount() : 0,
        triangles: p.getMode() === 4 ? Math.floor((idx ? idx.getCount() : pos ? pos.getCount() : 0) / 3) : 0,
        material: p.getMaterial()?.getName() ?? null,
        indexed: !!idx,
        indexType: idx ? idx.getComponentType() : null,
      };
    }),
  }));
  const materials = rootG.listMaterials().map((mat) => ({
    name: mat.getName(),
    doubleSided: mat.getDoubleSided(),
    alphaMode: mat.getAlphaMode(),
    metallicFactor: mat.getMetallicFactor(),
    roughnessFactor: mat.getRoughnessFactor(),
    textures: Object.fromEntries(
      listTextureSlots(doc).filter((r) => r.material === mat.getName()).map((r) => [r.slot, r.name || '(unnamed)']),
    ),
  }));
  const textures = listTextureSlots(doc).map(({ texture, ...rest }) => rest);
  const uniqueTextures = new Map();
  for (const t of rootG.listTextures()) uniqueTextures.set(t, t.getImage()?.byteLength ?? 0);
  const decodedBytes = [...uniqueTextures.keys()].reduce((s, t) => {
    const row = textures.find((r) => r.name === t.getName() && r.bytes === (t.getImage()?.byteLength ?? 0));
    return s + (row ? row.decodedBytes : 0);
  }, 0);
  const skins = listJointNames(doc).map((s, i) => ({ ...s, jointCount: s.joints.length, skeletonRoot: rootG.listSkins()[i].getSkeleton()?.getName() ?? null }));
  const anims = inspectAnimations(doc);
  const animations = rootG.listAnimations().map((a, i) => ({
    name: a.getName(),
    durationS: +anims[i].duration.toFixed(4),
    channels: anims[i].channels,
    closes: anims[i].maxEndpointDiff <= 1e-3,
    maxEndpointDiff: anims[i].maxEndpointDiff,
    rootTranslationRangeM: +rootTranslationRange(doc, a).toFixed(5),
    interpolations: [...new Set(a.listSamplers().map((s) => s.getInterpolation()))],
    targets: [...new Set(a.listChannels().map((c) => c.getTargetNode()?.getName()))].length,
  }));
  const sw = checkSkinWeights(doc);
  return {
    bytes: bytesLength,
    triangles: m.triangles,
    vertices: meshes.reduce((s, mesh) => s + mesh.primitives.reduce((t, p) => t + p.vertices, 0), 0),
    drawCalls: countDrawCalls(doc),
    bounds: { min: m.bounds.min, max: m.bounds.max, size: m.bounds.size },
    meshes,
    materials,
    textures,
    decodedTextureBytes: decodedBytes,
    skins,
    maxInfluences: maxInfluences(doc),
    skinWeights: sw,
    skeletonRoot: skeletonRoot(doc)?.getName() ?? null,
    animations,
    nodes: m.nodes,
    scaleProblems: scaleProblems(doc),
  };
}

// ---------------------------------------------------------------- main
async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertNotPublic(args.outDir);
  if (!existsSync(args.input)) throw new Error(`input not found: ${args.input}`);
  const kind = kindOfKey(args.key);
  const semantics = SEMANTIC_CLIPS[kind];
  const semanticMeta = SEMANTIC_CLIP_META[kind];
  const mapping = args.clipmap ? JSON.parse(readFileSync(resolve(args.clipmap), 'utf8')) : {};
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw new Error('clipmap must be an object');
  const explicitMap = {};
  const eventOverrides = {};
  for (const [semantic, value] of Object.entries(mapping)) {
    const clip = typeof value === 'string' ? value : value?.clip;
    if (typeof clip !== 'string' || !clip) throw new Error(`clipmap ${semantic}: clip must be a nonempty string`);
    explicitMap[semantic] = clip;
    if (typeof value === 'object' && value !== null && value.events !== undefined) {
      if (!value.events || typeof value.events !== 'object' || Array.isArray(value.events)) throw new Error(`clipmap ${semantic}: events must be an object`);
      for (const [event, time] of Object.entries(value.events)) {
        if (typeof time !== 'number' || !Number.isFinite(time)) throw new Error(`clipmap ${semantic}: event ${event} must have a finite numeric time`);
      }
      eventOverrides[semantic] = value.events;
    }
  }

  const inputBytes = readFileSync(args.input);
  const json = readGlbJson(inputBytes);
  const ext = classifyExtensions(json);
  console.log(`ingest ${relative(root, args.input)} → ${relative(root, args.outDir)}/${args.name}.glb  (key ${args.key}, kind ${kind})`);
  console.log(`  generator: ${json.asset?.generator ?? '-'}; extensions used: ${[...ext.allowed, ...ext.unknown, ...ext.unsupported].join(', ') || 'none'}`);
  if (ext.unsupported.length) {
    console.log(`  FAIL: needs a decoder the app does not ship: ${ext.unsupported.join(', ')} (decode/re-export outside the sandbox first)`);
    process.exit(2);
  }

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.readBinary(new Uint8Array(inputBytes));
  const before = inventory(doc, inputBytes.length);
  printInventory('input', before);

  // normalize
  await doc.transform(prune({ keepAttributes: true, keepLeaves: true }), dedup());
  const textureChanges = doc.getRoot().listTextures().map((t) => resizeTextureToCap(t, args.maxTexture));
  if (args.quantize) await doc.transform(quantize());
  const outBytes = await io.writeBinary(doc);
  const after = inventory(doc, outBytes.byteLength);
  const validator = await validateGlb(outBytes, `${args.name}.glb`);

  // clip mapping
  const fileNames = after.animations.map((a) => a.name);
  const { clipMap, auto, missing } = resolveClipMap(semantics, fileNames, explicitMap);
  const clipMeta = {};
  for (const s of semantics) {
    const src = clipMap[s];
    const a = after.animations.find((x) => x.name === src);
    const base = semanticMeta[s] ?? {};
    clipMeta[s] = {
      durationS: a ? a.durationS : null,
      loop: !!base.loop,
      ...((eventOverrides[s] ?? base.events) ? { events: eventOverrides[s] ?? base.events } : {}),
      ...(src && src !== s ? { source: src } : {}),
    };
  }
  const loopProblems = semantics.filter((s) => semanticMeta[s]?.loop && clipMap[s] && after.animations.find((a) => a.name === clipMap[s])?.closes === false);

  // rig
  const joints = after.skins[0]?.joints ?? [];
  const rig = joints.length ? rigKindOf(joints) : 'vendor';
  const shoulder = kind === 'dog' ? measureShoulderHeight(doc) : NaN;

  const textures = manifestTextures(doc);
  const entry = {
    url: `${args.name}.glb`,
    status: 'pending',
    productionIntegrated: false,
    material: textures.length ? 'textured' : 'vertex',
    textures,
    textureSizes: textures.map((t) => Math.max(t.width, t.height)),
    drawCalls: after.drawCalls,
    rig,
    rigInfo: { joints: joints.length, maxInfluences: after.maxInfluences, root: after.skeletonRoot },
    clipMap,
    clips: semantics,
    sourceClips: fileNames,
    ...(missing.length ? { missingClips: missing } : {}),
    bytes: outBytes.byteLength,
    triangles: after.triangles,
    boundsMeters: after.bounds.size.map((v) => +v.toFixed(4)),
    ...(kind === 'dog' && Number.isFinite(shoulder) ? { measuredShoulderHeightM: +shoulder.toFixed(4) } : {}),
    ...(kind === 'human' ? { measuredHeightM: +after.bounds.max[1].toFixed(4) } : {}),
    source: args.source ?? `vendor ingest of ${relative(root, args.input)} (${json.asset?.generator ?? 'unknown generator'})`,
    license: args.license ?? 'UNVERIFIED — record the purchased license and written browser-delivery permission before shipping',
    version: 2,
    clipMeta,
  };

  const report = {
    tool: 'scripts/ingest-vendor.mjs',
    generatedUTC: new Date().toISOString(),
    input: { path: relative(root, args.input), bytes: inputBytes.length, generator: json.asset?.generator ?? null, extensions: ext },
    options: { key: args.key, kind, name: args.name, maxTexture: args.maxTexture, quantize: args.quantize, clipmap: args.clipmap ?? null },
    before,
    after,
    textureChanges,
    validator: { errors: validator.numErrors, warnings: validator.numWarnings, infos: validator.numInfos, messages: validator.messages.slice(0, 20) },
    clipMapping: { clipMap, autoMatched: auto, missing, loopDoesNotClose: loopProblems },
    rig: { kind: rig, joints, maxInfluences: after.maxInfluences, skeletonRoot: after.skeletonRoot, unweightedVertices: after.skinWeights?.unweighted ?? null },
    measured: { shoulderHeightM: Number.isFinite(shoulder) ? +shoulder.toFixed(4) : null, heightM: +after.bounds.max[1].toFixed(4), minY: +after.bounds.min[1].toFixed(4) },
    manifestEntry: entry,
    nextSteps: [
      ...(missing.length ? [`author/retarget missing clips outside the sandbox (Blender, D-037): ${missing.join(', ')}`] : []),
      ...(loopProblems.length ? [`loop clips that do not close (fix the source or set clipMeta.loop=false deliberately): ${loopProblems.join(', ')}`] : []),
      ...(textureChanges.filter((t) => t.note).map((t) => `${t.name}: ${t.note}`)),
      'run: node scripts/validate-assets.mjs --staging ' + relative(root, args.outDir),
      'shipping into public/ is a reviewed step of the owning work package (never automatic)',
    ],
  };

  mkdirSync(args.outDir, { recursive: true });
  writeFileSync(join(args.outDir, `${args.name}.glb`), outBytes);
  writeFileSync(join(args.outDir, `${args.name}.report.json`), JSON.stringify(report, null, 2));
  writeFileSync(join(args.outDir, `${args.name}.manifest-entry.json`), JSON.stringify({ [args.key]: entry }, null, 2));
  const manifestPath = join(args.outDir, 'manifest.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { version: 2, staging: true, assets: {} };
  manifest.version = 2;
  manifest.staging = true;
  manifest.generatedUTC = report.generatedUTC;
  manifest.assets = { ...(manifest.assets ?? {}), [args.key]: entry };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  printInventory('staged', after);
  console.log(`  textures: ${textureChanges.map((t) => `${t.name || '(unnamed)'} ${t.from ? t.from.join('x') : '?'}→${t.to ? t.to.join('x') : '?'} ${t.changed ? `${t.bytesBefore}→${t.bytesAfter} B` : 'unchanged'}${t.note ? ` [${t.note}]` : ''}`).join('; ') || 'none'}`);
  console.log(`  gltf-validator: ${validator.numErrors}E/${validator.numWarnings}W/${validator.numInfos}I`);
  console.log(`  rig: ${rig} (${joints.length} joints, max ${after.maxInfluences} influences, root ${after.skeletonRoot}); shoulder ${Number.isFinite(shoulder) ? shoulder.toFixed(3) + ' m' : 'n/a'}; min y ${after.bounds.min[1].toFixed(4)}`);
  console.log(`  clips: ${semantics.length - missing.length}/${semantics.length} semantics resolved${auto.length ? ` (loose match: ${auto.join(', ')})` : ''}${missing.length ? `; MISSING: ${missing.join(', ')}` : ''}${loopProblems.length ? `; loop does not close: ${loopProblems.join(', ')}` : ''}`);
  console.log(`  wrote ${relative(root, join(args.outDir, `${args.name}.glb`))} (${outBytes.byteLength} B, was ${inputBytes.length} B), ${args.name}.report.json, ${args.name}.manifest-entry.json, manifest.json`);
}

function printInventory(label, inv) {
  const tex = inv.textures.map((t) => `${t.slot}:${t.width}x${t.height} ${t.mime} ${t.bytes} B`).join(', ') || 'none';
  console.log(`  [${label}] ${inv.bytes} B, ${inv.triangles} tris, ${inv.vertices} verts, ${inv.drawCalls} draw calls, ${inv.meshes.length} meshes, ${inv.materials.length} materials, bounds ${inv.bounds.size.map((v) => v.toFixed(3)).join('x')} m`);
  console.log(`  [${label}] textures: ${tex}; decoded estimate ${(inv.decodedTextureBytes / 1048576).toFixed(2)} MB`);
  console.log(`  [${label}] skins: ${inv.skins.map((s) => `${s.name} (${s.jointCount} joints)`).join(', ') || 'none'}; animations: ${inv.animations.map((a) => `${a.name} ${a.durationS}s${a.closes ? '' : ' (open)'}${a.rootTranslationRangeM > 1e-3 ? ' (root translation)' : ''}`).join(', ') || 'none'}`);
  if (inv.scaleProblems.length) console.log(`  [${label}] scale problems: ${inv.scaleProblems.join('; ')}`);
}

main().catch((err) => {
  console.error(`ingest failed: ${err.message}`);
  process.exit(1);
});
