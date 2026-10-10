/**
 * Shared asset-contract constants for the textured/vendor pipeline (D-036, D-033, 08):
 * used by scripts/ingest-vendor.mjs and scripts/validate-assets.mjs so both agree on budgets,
 * semantic clip lists, the optional D-033 bone list and the extension policy.
 */
import { DOG_BONE_NAMES, HUMAN_BONE_NAMES } from './skeleton.mjs';
import { DOG_CLIP_META } from './dogClips.mjs';
import { HUMAN_CLIP_META } from './humanClips.mjs';

/** D-033: six face bones inserted after `jaw`; optional (checked when present). */
export const FACE_BONES = ['eye_l', 'eye_r', 'eyelid_upper_l', 'eyelid_upper_r', 'eyelid_lower_l', 'eyelid_lower_r'];
export const DOG_BONE_NAMES_D033 = (() => {
  const i = DOG_BONE_NAMES.indexOf('jaw');
  return [...DOG_BONE_NAMES.slice(0, i + 1), ...FACE_BONES, ...DOG_BONE_NAMES.slice(i + 1)];
})();

export const SEMANTIC_CLIPS = {
  dog: Object.keys(DOG_CLIP_META),
  human: Object.keys(HUMAN_CLIP_META),
  static: [],
};
export const SEMANTIC_CLIP_META = { dog: DOG_CLIP_META, human: HUMAN_CLIP_META, static: {} };

/** Semantics that express stress/fatigue; a vendor clip named like an attack/death must not fill them. */
export const STRESS_SEMANTICS = ['tense_idle', 'tired_idle', 'recover', 'turn_away'];
export const FORBIDDEN_CLIP_PATTERN = /attack|death|die\b|dying|dead|bite|kill|hit\b|hurt|damage|injur/i;

export const BUDGET = {
  textureCap: { dog: 1024, human: 1024, static: 2048 },
  decodedTextureBytes: { dog: 12 * 1024 * 1024, human: 12 * 1024 * 1024, static: Infinity },
  drawCalls: { dog: 3, human: 3, static: 12 },
  fileBytes: { dog: 3 * 1024 * 1024, human: 2 * 1024 * 1024 },
  maxInfluences: 4,
  groundToleranceM: 0.01,
  /** Vendor dogs without project joint names: bounds height ÷ this ratio estimates the shoulder height (live dogs measure 1.35–1.42). */
  dogHeightToShoulder: 1.4,
};

export const ALLOWED_MIME = ['image/png', 'image/jpeg'];

/** Extensions three's GLTFLoader handles without a decoder; everything else fails validation. */
export const ALLOWED_EXTENSIONS = new Set([
  'KHR_mesh_quantization',
  'KHR_texture_transform',
  'KHR_materials_emissive_strength',
  'KHR_materials_ior',
  'KHR_materials_specular',
  'KHR_materials_clearcoat',
  'KHR_materials_sheen',
  'KHR_materials_transmission',
  'KHR_materials_volume',
  'KHR_materials_iridescence',
  'KHR_materials_unlit',
]);
/** Need a decoder/loader plugin that the app does not ship (08: only with decoder + tested fallback). */
export const DECODER_EXTENSIONS = new Set([
  'KHR_draco_mesh_compression',
  'EXT_meshopt_compression',
  'KHR_texture_basisu',
  'EXT_texture_webp',
  'EXT_texture_avif',
]);

export function kindOfKey(key) {
  if (key.startsWith('dog.')) return 'dog';
  if (key.startsWith('human.')) return 'human';
  return 'static';
}

/** 'project' when the joint list is exactly one of the project rigs (26/32 dog, 20 human), else 'vendor'. */
export function rigKindOf(jointNames) {
  const j = jointNames.join();
  if (j === DOG_BONE_NAMES.join() || j === DOG_BONE_NAMES_D033.join() || j === HUMAN_BONE_NAMES.join()) return 'project';
  return 'vendor';
}

/** Parse the JSON chunk of a GLB without gltf-transform (extension policy before decoding). */
export function readGlbJson(bytes) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB (magic)');
  const chunkLen = buf.readUInt32LE(12);
  const chunkType = buf.readUInt32LE(16);
  if (chunkType !== 0x4e4f534a) throw new Error('first GLB chunk is not JSON');
  return JSON.parse(buf.toString('utf8', 20, 20 + chunkLen));
}

/** { allowed: [], unsupported: [], unknown: [] } from a glTF JSON. */
export function classifyExtensions(json) {
  const used = new Set([...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])]);
  const out = { allowed: [], unsupported: [], unknown: [], required: json.extensionsRequired ?? [] };
  for (const e of used) {
    if (ALLOWED_EXTENSIONS.has(e)) out.allowed.push(e);
    else if (DECODER_EXTENSIONS.has(e)) out.unsupported.push(e);
    else out.unknown.push(e);
  }
  return out;
}

/** Normalize a clip name for loose matching: lower case, letters and digits only. */
export function normalizeClipName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolve semantic clip names against the names in a file: explicit map first, then exact name,
 * then normalized match. Returns { clipMap, auto: [semantics matched loosely], missing: [] }.
 */
export function resolveClipMap(semantics, fileNames, explicit = {}) {
  const clipMap = {};
  const auto = [];
  const missing = [];
  const normalized = new Map(fileNames.map((n) => [normalizeClipName(n), n]));
  for (const s of semantics) {
    if (explicit[s] !== undefined) {
      clipMap[s] = explicit[s];
      if (!fileNames.includes(explicit[s])) missing.push(s);
      continue;
    }
    if (fileNames.includes(s)) {
      clipMap[s] = s;
      continue;
    }
    const loose = normalized.get(normalizeClipName(s));
    if (loose) {
      clipMap[s] = loose;
      auto.push(s);
      continue;
    }
    missing.push(s);
  }
  return { clipMap, auto, missing };
}

/** Draw calls = mesh primitives reachable from the default scene (one per primitive per instance). */
export function countDrawCalls(doc) {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  let calls = 0;
  const visit = (node) => {
    const mesh = node.getMesh();
    if (mesh) calls += mesh.listPrimitives().length;
    for (const c of node.listChildren()) visit(c);
  };
  if (scene) for (const n of scene.listChildren()) visit(n);
  return calls;
}

/** Nodes with non-unit scale on scene roots or any negative scale component. */
export function scaleProblems(doc, eps = 1e-6) {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const out = [];
  const visit = (node, isRoot) => {
    const s = node.getScale();
    if (isRoot && (Math.abs(s[0] - 1) > eps || Math.abs(s[1] - 1) > eps || Math.abs(s[2] - 1) > eps)) out.push(`root node ${node.getName()} scale ${s.map((v) => +v.toFixed(4))}`);
    if (s[0] < 0 || s[1] < 0 || s[2] < 0) out.push(`node ${node.getName()} has a negative scale ${s.map((v) => +v.toFixed(4))}`);
    for (const c of node.listChildren()) visit(c, false);
  };
  if (scene) for (const n of scene.listChildren()) visit(n, true);
  return out;
}

/** Skeleton root node of the first skin (explicit skeleton or first joint). */
export function skeletonRoot(doc) {
  const skin = doc.getRoot().listSkins()[0];
  if (!skin) return null;
  return skin.getSkeleton() ?? skin.listJoints()[0] ?? null;
}

/** Largest per-axis range of translation channels on the skeleton root / scene roots in one animation (0 when none). */
export function rootTranslationRange(doc, anim) {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const roots = new Set(scene ? scene.listChildren() : []);
  const sr = skeletonRoot(doc);
  if (sr) roots.add(sr);
  let range = 0;
  const v = [0, 0, 0];
  for (const ch of anim.listChannels()) {
    if (ch.getTargetPath() !== 'translation' || !roots.has(ch.getTargetNode())) continue;
    const out = ch.getSampler().getOutput();
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < out.getCount(); i++) {
      out.getElement(i, v);
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], v[k]);
        max[k] = Math.max(max[k], v[k]);
      }
    }
    for (let k = 0; k < 3; k++) range = Math.max(range, max[k] - min[k]);
  }
  return range;
}

/** Max skin influences by attribute sets present (JOINTS_1 ⇒ 8). */
export function maxInfluences(doc) {
  let max = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getAttribute('JOINTS_1')) max = Math.max(max, 8);
      else if (prim.getAttribute('JOINTS_0')) max = Math.max(max, 4);
    }
  }
  return max;
}

/**
 * Forward-axis heuristic for dogs (brief: nose/muzzle must extend toward +Z): mean z of the vertices
 * in the top 20 % of the height range (head and ears) must be positive. Returns { meanZ, ok }.
 */
export function dogForwardCheck(doc) {
  let minY = Infinity;
  let maxY = -Infinity;
  const prims = [];
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) prims.push(prim);
  const p = [0, 0, 0];
  for (const prim of prims) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    minY = Math.min(minY, pos.getMin([0, 0, 0])[1]);
    maxY = Math.max(maxY, pos.getMax([0, 0, 0])[1]);
  }
  const cut = minY + 0.8 * (maxY - minY);
  let sum = 0;
  let n = 0;
  for (const prim of prims) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, p);
      if (p[1] < cut) continue;
      sum += p[2];
      n++;
    }
  }
  const meanZ = n ? sum / n : 0;
  return { meanZ, ok: meanZ > 0 };
}
