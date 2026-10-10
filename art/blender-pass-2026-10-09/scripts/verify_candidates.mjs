import fs from 'node:fs/promises';import http from 'node:http';import path from 'node:path';import {fileURLToPath} from 'node:url';import {chromium} from '@playwright/test';import {NodeIO} from '@gltf-transform/core';
const project=process.cwd(),base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const io=new NodeIO();const assets=['dog_nala_puppy','dog_nala_growing','dog_bruno_puppy','human_mira','human_alex'];
const expected=JSON.parse(await fs.readFile(base+'/reports/candidate_metrics.json','utf8'));const contracts={};
for(const asset of assets){
 const old=await io.read(base+'/baseline/'+asset+'.glb'),next=await io.read(base+'/candidates/'+asset+'.glb');
 const a=old.getRoot().listSkins()[0],b=next.getRoot().listSkins()[0];
 const same=(x,y)=>x.length===y.length&&x.every((v,i)=>v===y[i]);
 if(!same(a.listJoints().map(n=>n.getName()),b.listJoints().map(n=>n.getName())))throw Error('Joint identity/order changed');
 if(!same([...a.getInverseBindMatrices().getArray()],[...b.getInverseBindMatrices().getArray()]))throw Error('Inverse bind changed');
 let tracks=0;
 for(const animation of old.getRoot().listAnimations()){
  const replacement=next.getRoot().listAnimations().find(x=>x.getName()===animation.getName());if(!replacement||replacement.listChannels().length!==animation.listChannels().length)throw Error('Missing clip/channels');
  for(const channel of animation.listChannels()){
   const c=replacement.listChannels().find(x=>x.getTargetNode().getName()===channel.getTargetNode().getName()&&x.getTargetPath()===channel.getTargetPath());
   if(!c||!same([...c.getSampler().getInput().getArray()],[...channel.getSampler().getInput().getArray()])||!same([...c.getSampler().getOutput().getArray()],[...channel.getSampler().getOutput().getArray()]))throw Error('Animation track changed');tracks++;
  }
 }
 for(const node of old.getRoot().listNodes().filter(n=>!n.getMesh())){
  const target=next.getRoot().listNodes().find(n=>n.getName()===node.getName());if(!target||!same(node.getTranslation(),target.getTranslation())||!same(node.getRotation(),target.getRotation())||!same(node.getScale(),target.getScale()))throw Error('Joint rest transform changed');
 }
 const prim=next.getRoot().listMeshes()[0].listPrimitives()[0],weights=prim.getAttribute('WEIGHTS_0'),normals=prim.getAttribute('NORMAL');
 for(let i=0;i<weights.getCount();i++){const w=weights.getElement(i,[]);if(Math.abs(w.reduce((s,v)=>s+v,0)-1)>1e-5||w.some(v=>v<0||!Number.isFinite(v)))throw Error('Invalid skin weights');const n=normals.getElement(i,[]);if(Math.abs(Math.hypot(...n)-1)>.001)throw Error('Invalid normal');}
 contracts[asset]={animationTracksComparedExactly:tracks,inverseBindMatricesIdentical:true,jointNamesOrderAndRestTransformsIdentical:true,normalizedSkinWeights:true,unitNormals:true};
}
const routes={'/':path.join(base,'scripts/browser_review.html'),'/vendor/three.module.js':path.join(project,'node_modules/three/build/three.module.js'),'/vendor/three.core.js':path.join(project,'node_modules/three/build/three.core.js'),'/vendor/GLTFLoader.js':path.join(project,'node_modules/three/examples/jsm/loaders/GLTFLoader.js'),'/utils/BufferGeometryUtils.js':path.join(project,'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'),'/utils/SkeletonUtils.js':path.join(project,'node_modules/three/examples/jsm/utils/SkeletonUtils.js'),'/favicon.ico':null};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost').pathname;const target=url.startsWith('/candidates/')&&assets.some(a=>url==='/candidates/'+a+'.glb')?path.join(base,url):routes[url];if(!target){res.writeHead(404);res.end();return;}const data=await fs.readFile(target);res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript':target.endsWith('.html')?'text/html':'model/gltf-binary');res.end(data);}catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:900,height:760}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});page.on('requestfailed',r=>console.error('Request failed',r.url()));const results={};
try{await page.goto('http://127.0.0.1:'+port);await page.waitForFunction(()=>window.ready,{timeout:20000});
 for(const asset of assets){const r=await page.evaluate(a=>window.verify(a),asset);if(r.drawCalls!==1||r.triangles!==expected[asset].triangles)throw Error('Renderer budget mismatch');results[asset]=r;await page.screenshot({path:base+'/renders/'+asset+'_webgl.png'});console.log(asset+': '+r.samples.length+' pose/time samples, '+r.drawCalls+' draw call, '+r.triangles+' triangles');}
 if(errors.length)throw Error(errors.join('\n'));
 await fs.writeFile(base+'/reports/verification.json',JSON.stringify({contracts,browser:results,pageErrors:errors,softwareWebGL:true,phonePerformanceMeasured:false},null,2)+'\n');
}finally{await browser.close();await new Promise(r=>server.close(r));}
