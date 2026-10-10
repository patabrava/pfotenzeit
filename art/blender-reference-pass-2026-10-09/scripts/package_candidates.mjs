import {NodeIO, getBounds} from '@gltf-transform/core';
import {dedup, prune, weld} from '@gltf-transform/functions';
import {Matrix4,Matrix3,Vector3} from 'three';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const validator=require('gltf-validator');
const base=new URL('../',import.meta.url).pathname;
const io=new NodeIO();const assets=['dog_nala_puppy','dog_nala_growing','dog_bruno_puppy','human_mira','human_alex'];
const manifest=JSON.parse(await fs.readFile(base+'baseline/manifest.json','utf8'));
const report={};
for(const asset of assets){
 const doc=await io.read(base+'baseline/'+asset+'.glb');
 const raw=await io.read(base+'candidates/raw/'+asset+'.glb');
 const src=raw.getRoot().listNodes().find(n=>n.getMesh()&&n.getSkin());
 const dst=doc.getRoot().listNodes().find(n=>n.getMesh()&&n.getSkin());
 if(!src||!dst)throw Error(asset+': missing skinned node');
 const prim=src.getMesh().listPrimitives()[0], target=dst.getMesh().listPrimitives()[0];
 const matrix=new Matrix4().fromArray(src.getWorldMatrix()), normalmatrix=new Matrix3().getNormalMatrix(matrix);
 const map=src.getSkin().listJoints().map(j=>dst.getSkin().listJoints().findIndex(x=>x.getName()===j.getName()));
 if(map.some(i=>i<0))throw Error('Unexpected skeleton name');
 const pos=prim.getAttribute('POSITION'),nor=prim.getAttribute('NORMAL'),weights=prim.getAttribute('WEIGHTS_0'),joints=prim.getAttribute('JOINTS_0'),colors=prim.getAttribute('COLOR_0');
 const n=pos.getCount();const pa=new Float32Array(n*3),na=new Float32Array(n*3),wa=new Float32Array(n*4),ja=new Uint8Array(n*4),ca=new Uint8Array(n*3);
 let maxInfluences=0;
 for(let i=0;i<n;i++){
  const p=new Vector3().fromArray(pos.getElement(i,[])).applyMatrix4(matrix);pa.set(p.toArray(),i*3);
  const normal=new Vector3().fromArray(nor.getElement(i,[])).applyNormalMatrix(normalmatrix);na.set(normal.toArray(),i*3);
  const w=weights.getElement(i,[]),j=joints.getElement(i,[]),c=colors.getElement(i,[]);let total=w.reduce((a,b)=>a+b,0);
  if(total<1e-8)throw Error('Unweighted vertex');
  maxInfluences=Math.max(maxInfluences,w.filter(x=>x>1e-6).length);
  for(let k=0;k<4;k++){wa[i*4+k]=w[k]/total;ja[i*4+k]=map[j[k]];}
  for(let k=0;k<3;k++)ca[i*3+k]=Math.round(Math.max(0,Math.min(1,c[k]))*255);
 }
 const buffer=doc.getRoot().listBuffers()[0];
 const acc=(name,type,array,normalized=false)=>doc.createAccessor(name).setType(type).setArray(array).setNormalized(normalized).setBuffer(buffer);
 target.setAttribute('POSITION',acc('POSITION','VEC3',pa)).setAttribute('NORMAL',acc('NORMAL','VEC3',na)).setAttribute('COLOR_0',acc('COLOR_0','VEC3',ca,true)).setAttribute('JOINTS_0',acc('JOINTS_0','VEC4',ja)).setAttribute('WEIGHTS_0',acc('WEIGHTS_0','VEC4',wa));
 const tangent=prim.getAttribute('TANGENT');if(!tangent)throw Error(asset+': tangent missing');
 let tangentFallbacks=0;const ta=new Float32Array(n*4);for(let i=0;i<n;i++){
  const t=tangent.getElement(i,[]);const normal=new Vector3().fromArray(na,i*3);let v=new Vector3(t[0],t[1],t[2]).transformDirection(matrix);
  v.addScaledVector(normal,-v.dot(normal));
  if(v.lengthSq()<1e-12){const axis=Math.abs(normal.x)<.8?new Vector3(1,0,0):new Vector3(0,1,0);v.crossVectors(axis,normal);tangentFallbacks++;}
  v.normalize();ta.set([...v.toArray(),(t[3]<0?-1:1)*Math.sign(matrix.determinant())],i*4);
 }
 target.setAttribute('TANGENT',acc('TANGENT','VEC4',ta));
 const uv=prim.getAttribute('TEXCOORD_0');
 if(!uv)throw Error(asset+': authored UV missing');
 const uva=new Float32Array(n*2);for(let i=0;i<n;i++)uva.set(uv.getElement(i,[]),i*2);
 target.setAttribute('TEXCOORD_0',acc('UV','VEC2',uva));
 const sourceTexture=prim.getMaterial().getNormalTexture();
 if(!sourceTexture)throw Error(asset+': baked normal texture missing');
 const texture=doc.createTexture(asset+'_surface_normal').setImage(sourceTexture.getImage().slice()).setMimeType(sourceTexture.getMimeType());
 target.getMaterial().setNormalTexture(texture).setNormalScale(prim.getMaterial().getNormalScale());
 target.setIndices(acc('INDICES','SCALAR',new Uint16Array(prim.getIndices().getArray())));
 target.getMaterial().setRoughnessFactor(.70).setDoubleSided(true);
 // Preserve the original glTF hierarchy, inverse bind matrices and all animation data exactly.
 // Only the Blender-authored surface and its remapped weights replace the baseline primitive.
 await doc.transform(weld(),dedup(),prune({keepAttributes:true,keepLeaves:true}));
 const bytes=await io.writeBinary(doc);await fs.writeFile(base+'candidates/'+asset+'.glb',bytes);
 const vr=await validator.validateBytes(new Uint8Array(bytes),{uri:asset+'.glb',maxIssues:100});
 const bounds=getBounds(doc.getRoot().listScenes()[0]);const triangles=target.getIndices().getCount()/3;
 const entry=Object.entries(manifest.assets).find(([k,v])=>v.url.endsWith(asset+'.glb'));
 report[asset]={tangentFallbacks,key:entry[0],bytes:bytes.length,baselineBytes:entry[1].bytes,triangles,baselineTriangles:entry[1].triangles,vertices:target.getAttribute('POSITION').getCount(),materials:doc.getRoot().listMaterials().length,primitives:dst.getMesh().listPrimitives().length,bones:dst.getSkin().listJoints().length,maxInfluences,boundsMeters:bounds.max.map((v,i)=>v-bounds.min[i]),boundsMin:bounds.min,boundsMax:bounds.max,clips:doc.getRoot().listAnimations().map(a=>a.getName()),source:'source/characters_refined.blend; scripts/author_reference.py; scripts/bake_surface.py; baseline rig and animation data preserved',status:'blender-reference-refined-candidate',textures:doc.getRoot().listTextures().map(t=>({name:t.getName(),bytes:t.getImage().length,mime:t.getMimeType()})),validator:{errors:vr.issues.numErrors,warnings:vr.issues.numWarnings,infos:vr.issues.numInfos,messages:vr.issues.messages}};
 if(vr.issues.numErrors||vr.issues.numWarnings)console.error(JSON.stringify(vr.issues));
 if(vr.issues.numErrors||vr.issues.numWarnings||triangles>(asset.startsWith('dog')?18000:16000)||bytes.length>(asset.startsWith('dog')?3000000:2000000))throw Error(asset+': budget/validator failure');
 console.log(asset+': '+triangles+' tris; '+bytes.length+' bytes; validator '+vr.issues.numErrors+' errors, '+vr.issues.numWarnings+' warnings');
}
await fs.writeFile(base+'reports/candidate_metrics.json',JSON.stringify(report,null,2)+'\n');
await fs.writeFile(base+'candidates/manifest.json',JSON.stringify({version:1,generatedUTC:new Date().toISOString(),productionIntegrated:false,assets:report},null,2)+'\n');
