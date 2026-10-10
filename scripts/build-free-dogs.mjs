/** Reproducible CC0 Quaternius adaptation. Native Blender exports and editable training rigs are retained in art/.
 * Ships three character variants without changing the simulation or its semantic clip API.
 * --ship copies validated staging files; normal invocation only stages candidates.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, resample } from '@gltf-transform/functions';
import { Matrix4, Vector3 } from 'three';
import { DOG_CLIP_META } from './lib/dogClips.mjs';
import { measureDocument, validateGlb } from './lib/exportGltf.mjs';
import { countDrawCalls } from './lib/assetContract.mjs';

const base = path.resolve('art/free-models-2026-10-10');
const out = path.join(base, 'candidates');
await fs.mkdir(out, { recursive: true });
const io = new NodeIO();
const manifest = { version: 2, staging: true, assets: {} };
const variants = [
  ['dog.nala.puppy', 'dog_nala_puppy', 'ShibaInu', .28, false],
  ['dog.nala.growing', 'dog_nala_growing', 'ShibaInu', .36, true],
  ['dog.bruno.puppy', 'dog_bruno_puppy', 'Husky', .31, false],
];
const reports = {};
for (const [key, name, source, shoulder, growing] of variants) {
  const d = await io.read(path.join(base, 'native', `${source}.glb`));
  const root = d.getRoot(), buffer = root.listBuffers()[0];
  const skin = root.listSkins()[0], nodes = root.listNodes();
  const byName = new Map(nodes.map(n => [n.getName(), n]));
  const scene = root.listScenes()[0];
  for (const n of nodes.filter(n => n.getMesh() && n.getSkin())) {
    n.getParentNode()?.removeChild(n); scene.addChild(n);
  }
  const skeletonRoot = skin.getSkeleton() ?? skin.listJoints()[0];

  // Existing contract estimates unknown vendor withers as full height / 1.4.
  const scale = shoulder * 1.4 / measureDocument(d).bounds.size[1];
  const touched = new Set();
  function scaleAccessor(a, matrix = false) {
    if (!a || touched.has(a)) return;
    touched.add(a); const v = a.getArray().slice();
    if (matrix) { for (let i = 0; i < v.length; i += 16) for (const j of [12, 13, 14]) v[i + j] *= scale; }
    else for (let i = 0; i < v.length; i++) v[i] *= scale;
    a.setArray(v);
  }
  for (const n of nodes) n.setTranslation(n.getTranslation().map(v => v * scale));
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) scaleAccessor(p.getAttribute('POSITION'));
  scaleAccessor(skin.getInverseBindMatrices(), true);
  for (const a of root.listAnimations()) for (const c of a.listChannels()) if (c.getTargetPath() === 'translation') scaleAccessor(c.getSampler().getOutput());

  const headCentre = new Vector3().setFromMatrixPosition(new Matrix4().fromArray(byName.get('Head').getWorldMatrix()));
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
    // Mature head becomes relatively smaller; the rest of the body gains stature.
    // Bind joint centre stays fixed, so the Head skin pivot remains valid.
    if (growing) {
      const positions = p.getAttribute('POSITION'), joints = p.getAttribute('JOINTS_0'), weights = p.getAttribute('WEIGHTS_0');
      const headIndices = new Set(skin.listJoints().map((n,i) => n.getName() === 'Head' || n.getName().startsWith('Ear') ? i : -1));
      for (let i=0;i<positions.getCount();i++) {
        const js=joints.getElement(i,[]), ws=weights.getElement(i,[]);
        const w=ws.reduce((sum,v,k)=>sum+(headIndices.has(js[k])?v:0),0);
        const v=new Vector3().fromArray(positions.getElement(i,[]));
        v.sub(headCentre).multiplyScalar(1-.15*w).add(headCentre);positions.setElement(i,v.toArray());
      }
    }
    // Preserve the artist's markings; adjust main coat colour toward character identity.
    const colors = p.getAttribute('COLOR_0');
    for (let i=0;i<colors.getCount();i++) {
      const c=colors.getElement(i,[]);
      if (source==='ShibaInu' && c[0]>.2 && c[0]>c[1]*1.5) {c[0]=.52;c[1]=.28;c[2]=.095;}
      if (source==='Husky' && c[0]>.04 && c[0]<.2 && Math.abs(c[0]-c[1])<.05) {c[0]=.24;c[1]=.105;c[2]=.045;}
      if (source==='Husky' && c[0]>.3 && c[0]<.5 && Math.abs(c[0]-c[1])<.05) {c[0]=.8;c[1]=.72;c[2]=.57;}
      colors.setElement(i,c);
    }
    p.getMaterial().setName(source==='ShibaInu'?'mat_nala_fur':'mat_bruno_fur').setRoughnessFactor(.82);
  }

  const originals = new Map(root.listAnimations().map(a => [a.getName(), a]));
  // Three artist-authored motions are used directly. Idle has quiet native breathing.
  for (const [native, semantic] of [['Idle','idle_relaxed'],['Walk','walk'],['Eating','eat']]) {
    const a=originals.get(native); a.setName(semantic);
    if (semantic === 'walk') for (const c of a.listChannels()) {
      if (c.getTargetPath() === 'translation' && (c.getTargetNode() === skeletonRoot || scene.listChildren().includes(c.getTargetNode()))) {
        const output = c.getSampler().getOutput(), values = output.getArray().slice(), first = values.slice(0, 3);
        for (let i = 0; i < values.length; i += 3) values.set(first, i);
        output.setArray(values);
      }
    }
    const last=Math.max(...a.listSamplers().map(s=>s.getInput().getMax([])[0]));
    const inputs=new Set();
    for(const sampler of a.listSamplers()) {
      const input=sampler.getInput();
      if(!inputs.has(input)){inputs.add(input);input.setArray(Float32Array.from(input.getArray(),v=>v/last*DOG_CLIP_META[semantic].durationS));}
      if(DOG_CLIP_META[semantic].loop){const output=sampler.getOutput(),size=output.getElementSize(),values=output.getArray().slice();values.set(values.slice(0,size),values.length-size);output.setArray(values);}
    }
  }
  // All remaining educational clips were baked by Blender from native IK controls.
  for (const a of root.listAnimations()) {
    const meta=DOG_CLIP_META[a.getName()];if(!meta)throw Error(`Unexpected clip ${a.getName()}`);
    const last=Math.max(...a.listSamplers().map(s=>s.getInput().getMax([])[0]));
    const inputs=new Set();
    for(const sampler of a.listSamplers()){
      const input=sampler.getInput();if(!inputs.has(input)){inputs.add(input);input.setArray(Float32Array.from(input.getArray(),v=>v/last*meta.durationS));}
      if(meta.loop){const output=sampler.getOutput(),size=output.getElementSize(),values=output.getArray().slice();values.set(values.slice(0,size),values.length-size);output.setArray(values);}
    }
  }
  await d.transform(resample(),dedup(),prune());
  const bytes=await io.writeBinary(d),validation=await validateGlb(bytes,name);
  if(validation.numErrors){console.log(validation.messages);throw Error(`${name}: ${validation.numErrors} glTF errors`);}
  const measured=measureDocument(d);
  const entry={url:`${name}.glb`,status:'code-authored',productionIntegrated:false,material:'vertex',textures:[],textureSizes:[],bytes:bytes.length,triangles:measured.triangles,boundsMeters:measured.bounds.size,drawCalls:countDrawCalls(d),rig:'vendor',rigInfo:{joints:skin.listJoints().length,maxInfluences:4,root:skin.getSkeleton()?.getName()??''},clips:Object.keys(DOG_CLIP_META),sourceClips:root.listAnimations().map(a=>a.getName()),clipMap:Object.fromEntries(Object.keys(DOG_CLIP_META).map(n=>[n,n])),clipMeta:DOG_CLIP_META,source:`Quaternius Ultimate Animated Animal Pack (${source}); adapted coat/scale; native idle/walk/eat and Blender IK-authored educational clips, scripts/build-free-dogs.mjs`,license:'CC0 1.0 Universal; Quaternius; https://quaternius.com/packs/ultimateanimatedanimals.html',version:2};
  manifest.assets[key]=entry;reports[name]={...entry,validator:validation};
  await fs.writeFile(path.join(out,`${name}.glb`),bytes);
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(base,'reports','adaptation.json'),JSON.stringify(reports,null,2)+'\n');
if(process.argv.includes('--ship')){
  const {spawnSync}=await import('node:child_process');
  const checked=spawnSync(process.execPath,['scripts/validate-assets.mjs','--staging',out],{stdio:'inherit'});
  if(checked.status!==0)throw Error('Staged assets did not pass; live files preserved.');
  const livePath='public/assets/manifest.json',live=JSON.parse(await fs.readFile(livePath,'utf8'));
  for(const [key,entry] of Object.entries(manifest.assets)){
    await fs.copyFile(path.join(out,entry.url),path.join('public/assets/models',entry.url));
    live.assets[key]={...entry,url:`assets/models/${entry.url}`,productionIntegrated:true};
  }
  live.version=2;live.generatedUTC=new Date().toISOString();
  await fs.writeFile(livePath,JSON.stringify(live,null,2)+'\n');
}
console.log('CC0 dog candidates prepared:',Object.keys(manifest.assets).join(', '));
