/** Adapt Grab3D CC0 characters. Run saved Blender export first; --ship requires staged validation. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Vector3} from 'three';
import {NodeIO} from '@gltf-transform/core';
import {dedup,prune,resample,weld} from '@gltf-transform/functions';
import {HUMAN_CLIP_META} from './lib/humanClips.mjs';
import {measureDocument,validateGlb} from './lib/exportGltf.mjs';
import {manifestTextures} from './lib/textures.mjs';
import {countDrawCalls} from './lib/assetContract.mjs';
const base=path.resolve('art/soft-humans-2026-10-10'),out=path.join(base,'candidates'),io=new NodeIO();
await fs.mkdir(out,{recursive:true});
const manifest={version:2,staging:true,assets:{}},reports={};
for(const [name,source] of [['mira','woman'],['alex','man']]){
 const d=await io.read(path.join(base,`${name}_training.glb`)),r=d.getRoot(),skin=r.listSkins()[0];
 for(const n of r.listNodes().filter(n=>n.getMesh()&&n.getSkin())){n.getParentNode()?.removeChild(n);r.listScenes()[0].addChild(n);}
 for(const mesh of r.listMeshes())for(const p of mesh.listPrimitives()){
  const tangents=p.getAttribute('TANGENT'),normals=p.getAttribute('NORMAL');
  if(tangents)for(let i=0;i<tangents.getCount();i++){const t=tangents.getElement(i,[]);if(Math.hypot(...t.slice(0,3))<.01){const normal=new Vector3().fromArray(normals.getElement(i,[]));const tangent=new Vector3(0,1,0).cross(normal);if(tangent.length()<.01)tangent.set(1,0,0).cross(normal);tangent.normalize();tangents.setElement(i,[...tangent.toArray(),t[3]<0?-1:1]);}}
 }
 // Mesh skinning uses world bind matrices; keep unit-scale roots and the native skeleton.
 for(const a of r.listAnimations()){
  const meta=HUMAN_CLIP_META[a.getName()];if(!meta)throw Error(`Unexpected clip ${a.getName()}`);
  const last=Math.max(...a.listSamplers().map(s=>s.getInput().getMax([])[0])),seen=new Set();
  for(const s of a.listSamplers()){
   const input=s.getInput();if(!seen.has(input)){seen.add(input);input.setArray(Float32Array.from(input.getArray(),v=>v/last*meta.durationS));}
   if(meta.loop){const o=s.getOutput(),n=o.getElementSize(),v=o.getArray().slice();v.set(v.slice(0,n),v.length-n);o.setArray(v);}
  }
 }
 await d.transform(weld(),resample(),dedup(),prune());
 // glTF core permits normalized byte weights and byte joint indices, without a decoder.
 // Largest-remainder rounding keeps each vertex sum exactly 255 (never unweighted).
 for(const mesh of r.listMeshes())for(const p of mesh.listPrimitives()){
  const a=p.getAttribute('WEIGHTS_0'),j=p.getAttribute('JOINTS_0');
  if(a){const packed=new Uint8Array(a.getCount()*4);for(let i=0;i<a.getCount();i++){
   const weights=a.getElement(i,[]),sum=weights.reduce((n,v)=>n+v,0),scaled=weights.map(v=>v/sum*255),values=scaled.map(Math.floor);
   const order=[0,1,2,3].sort((x,y)=>(scaled[y]-values[y])-(scaled[x]-values[x]));
   let missing=255-values.reduce((n,v)=>n+v,0);for(let k=0;k<missing;k++)values[order[k%4]]++;
   packed.set(values,i*4);
  }a.setArray(packed).setNormalized(true);}
  if(j&&skin.listJoints().length<=256){const jointBytes=Uint8Array.from(j.getArray()),weights=a?.getArray();if(weights)for(let i=0;i<weights.length;i++)if(weights[i]===0)jointBytes[i]=0;j.setArray(jointBytes);}
 }

 const bytes=await io.writeBinary(d),v=await validateGlb(bytes,name);if(v.numErrors)throw Error(JSON.stringify(v));
 const m=measureDocument(d),textures=manifestTextures(d),file=`human_${name}.glb`;
 const original=await fs.readFile(path.join(base,'original',`${source}.glb`));
 const entry={url:file,status:'code-authored',productionIntegrated:false,material:'textured',textures,textureSizes:textures.map(t=>[t.width,t.height]),bytes:bytes.length,triangles:m.triangles,boundsMeters:m.bounds.size,measuredHeightM:m.bounds.size[1],drawCalls:countDrawCalls(d),rig:'vendor',rigInfo:{joints:skin.listJoints().length,maxInfluences:4,root:skin.getSkeleton()?.getName()??'Hips'},clips:Object.keys(HUMAN_CLIP_META),sourceClips:r.listAnimations().map(a=>a.getName()),clipMap:Object.fromEntries(Object.keys(HUMAN_CLIP_META).map(n=>[n,n])),clipMeta:HUMAN_CLIP_META,source:`Grab3D Casual ${source}; AI-assisted Meshy source cleaned in Blender; mobile LOD, smooth normals, textures, unit scale and five native-rig IK gestures adapted by scripts/build-soft-humans.mjs`,sourceUrl:`https://grab3d.com/models/characters/${source}/`,license:'CC0 1.0; Grab3D; https://creativecommons.org/publicdomain/zero/1.0/',sourceSha256:crypto.createHash('sha256').update(original).digest('hex'),version:2};
 manifest.assets[`human.${name}`]=entry;reports[name]={...entry,validator:v};await fs.writeFile(path.join(out,file),bytes);
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(base,'reports/adaptation.json'),JSON.stringify(reports,null,2)+'\n');
if(process.argv.includes('--ship')){
 const check=spawnSync(process.execPath,['scripts/validate-assets.mjs','--staging',out],{stdio:'inherit'});if(check.status!==0)throw Error('Staged human validation failed; live assets preserved.');
 const file='public/assets/manifest.json',live=JSON.parse(await fs.readFile(file,'utf8'));
 const total=Object.entries(live.assets).reduce((n,[k,e])=>n+(manifest.assets[k]?.bytes??e.bytes??0),0);
 if(total>8*1024*1024)throw Error(`Total assets exceed 8MiB: ${total}`);
 for(const [k,e] of Object.entries(manifest.assets)){await fs.copyFile(path.join(out,e.url),path.join('public/assets/models',e.url));live.assets[k]={...e,url:`assets/models/${e.url}`,productionIntegrated:true};}
 live.version=2;live.generatedUTC=new Date().toISOString();await fs.writeFile(file,JSON.stringify(live,null,2)+'\n');
}
console.log(JSON.stringify(Object.fromEntries(Object.entries(manifest.assets).map(([k,e])=>[k,{bytes:e.bytes,triangles:e.triangles,bounds:e.boundsMeters}]))));
