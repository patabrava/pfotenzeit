/** Reproducible CC BY textured puppy adaptation. Editable Blender IK rig is retained in art/.
 * Ships three character variants without changing the simulation or its semantic clip API.
 * --ship copies validated staging files; normal invocation only stages candidates.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, resample } from '@gltf-transform/functions';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { DOG_CLIP_META } from './lib/dogClips.mjs';
import { measureDocument, validateGlb } from './lib/exportGltf.mjs';
import { manifestTextures } from './lib/textures.mjs';
import { countDrawCalls } from './lib/assetContract.mjs';

const base = path.resolve('art/soft-puppies-2026-10-10');
const out = path.join(base, 'candidates');
await fs.mkdir(out, { recursive: true });
const io = new NodeIO();
const manifest = { version: 2, staging: true, assets: {} };
const variants = [
  ['dog.nala.puppy', 'dog_nala_puppy', 'Puppy', .28, false],
  ['dog.nala.growing', 'dog_nala_growing', 'Puppy', .36, true],
  ['dog.bruno.puppy', 'dog_bruno_puppy', 'Puppy', .31, false],
];
const reports = {};
for (const [key, name, source, shoulder, growing] of variants) {
  const d = await io.read(path.join(base, 'puppy_training.glb'));
  const root = d.getRoot();
  const skin = root.listSkins()[0], nodes = root.listNodes();
  const byName = new Map(nodes.map(n => [n.getName(), n]));
  const scene = root.listScenes()[0];
  for (const n of nodes.filter(n => n.getMesh() && n.getSkin())) {
    n.getParentNode()?.removeChild(n); scene.addChild(n);
  }

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
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) { scaleAccessor(p.getAttribute('POSITION')); for (const target of p.listTargets()) scaleAccessor(target.getAttribute('POSITION')); }
  scaleAccessor(skin.getInverseBindMatrices(), true);
  for (const a of root.listAnimations()) for (const c of a.listChannels()) if (c.getTargetPath() === 'translation') scaleAccessor(c.getSampler().getOutput());

  const headCentre = new Vector3().setFromMatrixPosition(new Matrix4().fromArray(byName.get('Dog_Neck_TopSHJnt').getWorldMatrix()));
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
    if (growing) {
      const positions=p.getAttribute('POSITION'),joints=p.getAttribute('JOINTS_0'),weights=p.getAttribute('WEIGHTS_0');
      const headIndices=new Set(skin.listJoints().map((n,i)=> /Neck_Top|Ear/.test(n.getName())?i:-1));
      for(let i=0;i<positions.getCount();i++){
        const js=joints.getElement(i,[]),ws=weights.getElement(i,[]);
        const w=ws.reduce((sum,v,k)=>sum+(headIndices.has(js[k])?v:0),0);
        const v=new Vector3().fromArray(positions.getElement(i,[]));v.sub(headCentre).multiplyScalar(1-.10*w).add(headCentre);positions.setElement(i,v.toArray());
        for (const target of p.listTargets()) {
          const delta = target.getAttribute('POSITION');
          if (delta) delta.setElement(i, delta.getElement(i, []).map(v => v * (1 - .10 * w)));
        }
      }
    }
    const bruno=key.includes('bruno');
    p.getMaterial().setName(bruno?'mat_bruno_fur':'mat_nala_fur').setBaseColorFactor(bruno?[.42,.26,.14,1]:[1,.88,.68,1]).setMetallicFactor(0).setRoughnessFactor(.84);
  }

  // Retain the source idle with gentler motion so breathing/head sway fits a mobile close-up.
  const idle=root.listAnimations().find(a=>a.getName()==='idle_relaxed');
  for(const channel of idle.listChannels()){
    if (/Tail/.test(channel.getTargetNode().getName())) continue;
    const output=channel.getSampler().getOutput(), values=output.getArray().slice(), size=output.getElementSize();
    if(channel.getTargetPath()==='rotation'){
      const first=new Quaternion().fromArray(values).normalize();
      for(let i=4;i<values.length;i+=4){const q=new Quaternion().fromArray(values,i).normalize();first.clone().slerp(q,.15).toArray(values,i);}
    } else if(channel.getTargetPath()==='translation'){
      for(let i=size;i<values.length;i++)values[i]=values[i%size]+(values[i]-values[i%size])*.15;
    }
    output.setArray(values);
  }
  // Educational clips were baked by Blender from controls on the source skeleton.
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
  const entry={url:`${name}.glb`,status:'code-authored',productionIntegrated:false,material:'textured',textures:manifestTextures(d),textureSizes:manifestTextures(d).map(t=>[t.width,t.height]),bytes:bytes.length,triangles:measured.triangles,boundsMeters:measured.bounds.size,drawCalls:countDrawCalls(d),rig:'vendor',rigInfo:{joints:skin.listJoints().length,maxInfluences:4,root:skin.getSkeleton()?.getName()??''},clips:Object.keys(DOG_CLIP_META),sourceClips:root.listAnimations().map(a=>a.getName()),clipMap:Object.fromEntries(Object.keys(DOG_CLIP_META).map(n=>[n,n])),clipMeta:DOG_CLIP_META,source:'Dog Puppy by kenchoo; original 3d dog cute by Tech developers; adapted coat, scale, growing head proportions and 16 Blender IK-authored educational clips; scripts/build-soft-puppies.mjs',sourceUrl:'https://sketchfab.com/3d-models/dog-puppy-72331763040e4314b154f84348fe0957',license:'CC BY 4.0; kenchoo / Tech developers; https://creativecommons.org/licenses/by/4.0/',sourceSha256:'45bbe4ae0561c49f0dd1bc821305b577dd75b9c8cd8cc011dae6adc409990811',version:2};
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
console.log('Textured CC BY puppy candidates prepared:',Object.keys(manifest.assets).join(', '));
