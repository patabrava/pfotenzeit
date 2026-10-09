/**
 * glTF authoring with @gltf-transform/core (three's GLTFExporter needs browser APIs).
 * Vertex colours as normalized uint8 COLOR_0, one material per model, skins with inverse bind
 * matrices, LINEAR animation samplers with quaternion rotation outputs.
 */
import { Document, NodeIO, getBounds } from '@gltf-transform/core';
import { dedup, prune, resample, weld } from '@gltf-transform/functions';
import { createRequire } from 'node:module';
import { colorsToUint8 } from './geometry.mjs';

const require = createRequire(import.meta.url);
const validator = require('gltf-validator');

function createMaterial(doc, name) {
  return doc
    .createMaterial(name)
    .setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(0.9)
    .setDoubleSided(false);
}

function createPrimitive(doc, buffer, material, geometry, skin) {
  const pos = doc.createAccessor('POSITION').setType('VEC3').setArray(geometry.positions).setBuffer(buffer);
  const nor = doc.createAccessor('NORMAL').setType('VEC3').setArray(geometry.normals).setBuffer(buffer);
  const col = doc
    .createAccessor('COLOR_0')
    .setType('VEC3')
    .setArray(colorsToUint8(geometry.colors))
    .setNormalized(true)
    .setBuffer(buffer);
  const vertexCount = geometry.positions.length / 3;
  const idxArray = vertexCount > 65535 ? new Uint32Array(geometry.indices) : new Uint16Array(geometry.indices);
  const idx = doc.createAccessor('INDICES').setType('SCALAR').setArray(idxArray).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setMode(4)
    .setMaterial(material)
    .setAttribute('POSITION', pos)
    .setAttribute('NORMAL', nor)
    .setAttribute('COLOR_0', col)
    .setIndices(idx);
  if (skin) {
    const j = doc.createAccessor('JOINTS_0').setType('VEC4').setArray(skin.joints).setBuffer(buffer);
    const w = doc.createAccessor('WEIGHTS_0').setType('VEC4').setArray(skin.weights).setBuffer(buffer);
    prim.setAttribute('JOINTS_0', j).setAttribute('WEIGHTS_0', w);
  }
  return prim;
}

/**
 * Skinned character: one mesh node at scene root (no parent transforms, per validator guidance),
 * joint hierarchy as a sibling root node, animations targeting the joints.
 */
export function buildSkinnedDocument({ meshName, skinName, materialName, geometry, skin, skeleton, clips }) {
  const doc = new Document();
  const buffer = doc.createBuffer('buffer');
  const scene = doc.createScene('scene');
  const material = createMaterial(doc, materialName);
  const prim = createPrimitive(doc, buffer, material, geometry, skin);
  const mesh = doc.createMesh(meshName).addPrimitive(prim);

  const nodes = new Map();
  for (const bone of skeleton.bones) {
    const node = doc.createNode(bone.name).setTranslation(skeleton.localTranslation(bone));
    nodes.set(bone.name, node);
    if (bone.parent === null) scene.addChild(node);
    else nodes.get(bone.parent).addChild(node);
  }
  const ibm = doc.createAccessor('inverseBindMatrices').setType('MAT4').setArray(skeleton.inverseBindMatrices()).setBuffer(buffer);
  const gltfSkin = doc.createSkin(skinName).setInverseBindMatrices(ibm).setSkeleton(nodes.get(skeleton.bones[0].name));
  for (const bone of skeleton.bones) gltfSkin.addJoint(nodes.get(bone.name));

  const meshNode = doc.createNode(meshName).setMesh(mesh).setSkin(gltfSkin);
  scene.addChild(meshNode);

  for (const clip of clips) {
    const anim = doc.createAnimation(clip.name);
    const inputs = new Map();
    for (const track of clip.tracks) {
      const key = track.times.length;
      let input = inputs.get(key);
      if (!input) {
        input = doc.createAccessor(`${clip.name}_t`).setType('SCALAR').setArray(track.times).setBuffer(buffer);
        inputs.set(key, input);
      }
      const output = doc
        .createAccessor(`${clip.name}_${track.bone}_${track.path}`)
        .setType(track.path === 'rotation' ? 'VEC4' : 'VEC3')
        .setArray(track.values)
        .setBuffer(buffer);
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      const channel = doc.createAnimationChannel().setTargetNode(nodes.get(track.bone)).setTargetPath(track.path).setSampler(sampler);
      anim.addSampler(sampler).addChannel(channel);
    }
  }
  return doc;
}

/**
 * Static props: one node per named mesh, all sharing one material. `nodeName` (optional) is the
 * Object3D name the renderer looks up with getObjectByName (e.g. 'bowl'); the mesh keeps `name`.
 */
export function buildStaticDocument({ materialName, meshes }) {
  const doc = new Document();
  const buffer = doc.createBuffer('buffer');
  const scene = doc.createScene('scene');
  const material = createMaterial(doc, materialName);
  for (const m of meshes) {
    const prim = createPrimitive(doc, buffer, material, m.geometry, null);
    const mesh = doc.createMesh(m.name).addPrimitive(prim);
    const node = doc.createNode(m.nodeName ?? m.name).setMesh(mesh);
    if (m.translation) node.setTranslation(m.translation);
    scene.addChild(node);
  }
  return doc;
}

export async function optimizeDocument(doc) {
  await doc.transform(
    weld(),
    resample({ tolerance: 1e-4, cleanup: false }),
    dedup(),
    prune({ keepAttributes: true, keepLeaves: true }),
  );
  return doc;
}

export async function writeGlb(doc) {
  const io = new NodeIO();
  return io.writeBinary(doc);
}

export async function readGlb(bytes) {
  const io = new NodeIO();
  return io.readBinary(bytes);
}

export async function validateGlb(bytes, uri) {
  const report = await validator.validateBytes(new Uint8Array(bytes), { uri, maxIssues: 50 });
  const { numErrors, numWarnings, numInfos, numHints } = report.issues;
  return { numErrors, numWarnings, numInfos, numHints, messages: report.issues.messages, report };
}

/** Measurements for the manifest from a loaded Document. */
export function measureDocument(doc) {
  const root = doc.getRoot();
  let triangles = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      triangles += idx ? idx.getCount() / 3 : prim.getAttribute('POSITION').getCount() / 3;
    }
  }
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const bb = getBounds(scene);
  const size = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
  const animations = root.listAnimations().map((a) => {
    let max = 0;
    for (const s of a.listSamplers()) {
      const input = s.getInput();
      max = Math.max(max, input.getMax([0])[0]);
    }
    return { name: a.getName(), duration: max, channels: a.listChannels().length };
  });
  const skins = root.listSkins().map((s) => ({ name: s.getName(), joints: s.listJoints().length }));
  return {
    triangles,
    bounds: { min: bb.min, max: bb.max, size },
    animations,
    skins,
    meshes: root.listMeshes().map((m) => m.getName()),
    nodeNames: root.listNodes().map((n) => n.getName()),
    materials: root.listMaterials().map((m) => m.getName()),
    nodes: root.listNodes().length,
  };
}
