import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out = 'verification/acceptance';
await fs.mkdir(out, {recursive:true});
const browser = await chromium.launch({channel:'chrome', args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
const base=process.env.PZ_BASE??'http://127.0.0.1:5231';
async function state(page){return page.evaluate(()=>new Promise((resolve,reject)=>{
 const r=indexedDB.open('pfotenzeit');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const t=db.transaction(['meta','saves']);let meta,saves;t.objectStore('meta').get('meta').onsuccess=e=>meta=e.target.result;t.objectStore('saves').getAll().onsuccess=e=>saves=e.target.result;t.oncomplete=()=>{db.close();resolve({meta,saves,save:saves.find(s=>s.saveId===meta.saveIds[meta.activeMode])});};};}));}
async function tap(page,key){const b=page.locator(`[data-key="${key}"]`).first();await expect(b).toBeVisible();await expect(b).not.toHaveAttribute('aria-disabled','true',{timeout:20000});await page.waitForTimeout(350);await b.click();}
async function ready(page){await expect(page.locator('#app')).toHaveAttribute('aria-busy','false',{timeout:20000});}
async function dbg(page,visible=true){const p=page.locator('.pz-debug');if(await p.isVisible()!==visible)await page.keyboard.press('Control+Shift+D');}
function section(page,title){return page.locator('.pz-debug__section').filter({has:page.getByRole('heading',{name:title,exact:true})});}
async function debugButton(page,title,label){await dbg(page);await section(page,title).getByRole('button',{name:label,exact:true}).click();await page.waitForTimeout(200);}
async function needs(page,values){await debugButton(page,'Needs','Read current');for(const [key,value]of Object.entries(values))await section(page,'Needs').locator('label').filter({hasText:key}).locator('input').evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);await debugButton(page,'Needs','Apply needs');await dbg(page,false);}
async function clock(page,kind,amount){await dbg(page);const row=section(page,'Clock').locator('.pz-debug__row').filter({hasText:kind+':'});await row.locator('input').fill(String(amount));await row.getByRole('button',{name:kind==='Active'?'+N min':'+N h',exact:true}).click();await page.waitForTimeout(300);await dbg(page,false);}
async function check(name,fn){const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));try{await page.goto(base);await ready(page);const details=await fn(page,context);assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/${name}.png`});results.push({name,pass:true,details,errors});console.log('PASS',name,JSON.stringify(details));}catch(e){await page.screenshot({path:`${out}/${name}-failed.png`}).catch(()=>{});results.push({name,pass:false,error:String(e),errors});console.error('FAIL',name,String(e));}finally{await context.close();}}
await check('lessons-retry-care-growth-reloads',async page=>{
 const catalog=await page.evaluate(async()=> (await import('/src/content/index.ts')).content);
 await tap(page,'profile');for(const tab of ['Erinnerungen','Gelernt','Pflege'])await page.getByRole('tab',{name:tab,exact:true}).click();await tap(page,'back');
 let supported=0,inserted=0,restDelta=null;
 for(const id of ['L01','L02','L03']){
  await needs(page,{energy:65,satiety:65,comfort:80,stress:10,arousal:25});
  if(await page.locator('[data-key="primary"]').isVisible())await tap(page,'primary');
  else {
   await page.evaluate(()=>{window.__pzWorld.send({type:'teleport',actor:'handler',position:{x:-1,z:-1.4}});window.__pzWorld.send({type:'stop'});});
   await tap(page,'prompt');await tap(page,'mira-lesson');
  }
  await tap(page,`lesson-${id}`);await tap(page,'next');
  let wrongUsed=false,steps=0;
  while((await state(page)).save.currentVisit?.phase!=='reflect'){
   assert.ok(++steps<35,'lesson must terminate');let v=(await state(page)).save.currentVisit;
   if(v.phase==='observe'){if(v.queue[v.index].supported){supported++;await expect(page.locator('#app')).toContainText('Gestützte Wiederholung');}if(v.queue[v.index].inserted){inserted++;await expect(page.locator('#app')).toContainText('Noch einmal ohne Hilfe');}
    const obsRound=catalog.lessons[id].rounds.find(r=>r.id===v.queue[v.index].roundId);
    if(obsRound?.exercise){
     // D-041 exercise round: succeed deterministically (far from Bruno / far from the ball), then attempt.
     const bandFar=page.locator('[data-key="band-far"]');
     if(await bandFar.count())await bandFar.click();
     else await page.evaluate(()=>{const w=window.__pzWorld;if(!w)throw new Error('__pzWorld missing');w.send({type:'teleport',actor:'handler',position:{x:-2.4,z:2.2}});w.send({type:'teleport',actor:'dog',position:{x:-2.0,z:2.0}});w.send({type:'stop'});});
     await tap(page,'attempt');
     await expect.poll(async()=>(await state(page)).save.currentVisit?.phase,{timeout:20000}).toBe('decide');
    } else await tap(page,'next');}
   else if(v.phase==='decide'){
    const ref=v.queue[v.index];const round=catalog.lessons[id].rounds.find(r=>r.id===ref.roundId);assert.ok(round);
    const wrong=id==='L02'&&!ref.supported&&!ref.inserted&&(v.index===0||ref.roundId==='L02_B');
    const last=v.attempts?.filter(a=>a.roundId===ref.roundId).slice(-1)[0];
    const offered=round.options.filter(o=>!o.forResponses||(last&&o.forResponses.includes(last.response)));
    const option=offered.find(o=>wrong?!o.helpful:(o.helpful&&o.next!=='retry'))??offered.find(o=>wrong?!o.helpful:o.helpful);assert.ok(option,'offered option');if(wrong)wrongUsed=true;
    const energy=(await state(page)).save.dog.energy;await tap(page,`option-${option.id}`);
    await expect.poll(async()=>['feedback','reflect'].includes((await state(page)).save.currentVisit?.phase),{timeout:20000}).toBe(true);
    if(id==='L03'&&v.index===0){restDelta=(await state(page)).save.dog.energy-energy;assert.equal(restDelta,30);}
    if(id==='L01'&&v.index===0){const decisions=(await state(page)).save.currentVisit.decisions.length;await page.reload();await ready(page);assert.equal((await state(page)).save.currentVisit.decisions.length,decisions);}
   }else if(v.phase==='feedback')await tap(page,'next');else await page.waitForTimeout(100);
  }
  const before=(await state(page)).save.school.marks;await page.reload();await ready(page);assert.equal((await state(page)).save.school.marks,before);await tap(page,'done');await expect.poll(async()=>(await state(page)).save.currentVisit).toBe(null);await expect.poll(async()=>(await state(page)).save.pendingPresentation,{timeout:20000}).toBe(null);if(await page.locator('[data-key="reward-ok"]').isVisible())await tap(page,'reward-ok');if(await page.locator('[data-key="reward-continue"]').isVisible())await tap(page,'reward-continue');
 }
 assert.ok(supported>=1);assert.ok(inserted>=1);let s=(await state(page)).save;assert.deepEqual([...s.completedLessonIds].sort(),['L01','L02','L03']);assert.ok(s.careClosureVisitIds.length>=1);assert.ok(s.helpfulVisitIds.length>=3);
 await tap(page,'school');await tap(page,'upgrade-rest_place');const marks=(await state(page)).save.school.marks;await page.reload();await ready(page);assert.equal((await state(page)).save.school.marks,marks);await tap(page,'upgrade-sniff_corner');await page.keyboard.press('Escape');await page.waitForTimeout(350);
 const learned=[...(await state(page)).save.dog.learnedPoints];await expect(page.locator('[data-key="primary"]')).toContainText('Wachsen');await tap(page,'primary');await page.getByRole('button',{name:/Wachstum bestätigen|Wachsen lassen|Jetzt wachsen/}).click();await expect.poll(async()=>(await state(page)).save.growthConfirmed).toBe(true);s=(await state(page)).save;assert.equal(s.dog.growthStage,'growing');assert.deepEqual(s.dog.learnedPoints,learned);assert.deepEqual([...s.school.upgrades].sort(),['rest_place','sniff_corner']);
 return {supported,inserted,restDelta,marks:s.school.marks,stage:s.dog.growthStage,completed:s.completedLessonIds};
});
await check('care-once-and-export-import',async page=>{
 await needs(page,{satiety:40});await tap(page,'profile');await tap(page,'care-meal');await expect.poll(async()=>(await state(page)).save.dog.satiety).toBe(75);await page.reload();await ready(page);await expect.poll(async()=>(await state(page)).save.pendingPresentation,{timeout:20000}).toBe(null);assert.equal((await state(page)).save.dog.satiety,75);
 await tap(page,'back');await tap(page,'settings');const downloadPromise=page.waitForEvent('download');await tap(page,'export');const download=await downloadPromise;const path=await download.path();const bundle=JSON.parse(await fs.readFile(path,'utf8'));await download.saveAs(`${out}/export.json`);
 function tamper(obj){if(!obj||typeof obj!=='object')return;for(const k of Object.keys(obj)){if(k==='satiety')obj[k]=500;else tamper(obj[k]);}}tamper(bundle);
 const original=(await state(page)).save;const chooserPromise=page.waitForEvent('filechooser');await tap(page,'import');const chooser=await chooserPromise;await chooser.setFiles({name:'tampered.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});await expect(page.locator('#app')).toContainText(/Die Datei konnte nicht übernommen werden/,{timeout:10000});assert.equal((await state(page)).save.dog.satiety,original.dog.satiety);
 return {satietyAfterReload:75,tamperedImportRejected:true,exportFile:download.suggestedFilename()};
});
await check('challenge-bands-loss-offline-isolation',async page=>{
 const standard=(await state(page)).save;await tap(page,'settings');await tap(page,'mode');await tap(page,'to-challenge');assert.equal((await state(page)).save.school.marks,0);
 await needs(page,{satiety:0,energy:80,vitality:100});await clock(page,'Active',11);assert.equal((await state(page)).save.dog.vitality,45);await clock(page,'Active',8);assert.equal((await state(page)).save.dog.vitality,5);await expect(page.locator('[data-view="home"]')).toContainText(/Versorgen/);
 await tap(page,'care');await tap(page,'care-meal');await expect.poll(async()=>(await state(page)).save.dog.satiety).toBe(35);await expect.poll(async()=>(await state(page)).save.pendingPresentation,{timeout:20000}).toBe(null);await page.keyboard.press('Escape');await page.waitForTimeout(350);await clock(page,'Active',1);assert.equal((await state(page)).save.dog.status,'alive');
 await needs(page,{satiety:0});await clock(page,'Active',1);assert.equal((await state(page)).save.dog.status,'lost');await expect(page.locator('[data-view="memorial"]')).toBeVisible();await tap(page,'new-run');await expect.poll(async()=>(await state(page)).save.dog.status).toBe('alive');assert.equal((await state(page)).save.dog.status,'alive');
 await needs(page,{satiety:80,comfort:80,vitality:80});await clock(page,'Offline',24);let s=(await state(page)).save;assert.equal(s.dog.satiety,64);assert.equal(s.dog.comfort,72);assert.equal(s.dog.vitality,80);
 await needs(page,{satiety:10,comfort:10,vitality:80});await clock(page,'Offline',24);s=(await state(page)).save;assert.equal(s.dog.satiety,10);assert.equal(s.dog.comfort,10);assert.equal(s.dog.vitality,80);
 await tap(page,'settings');await tap(page,'mode');await tap(page,'to-standard');await expect.poll(async()=>(await state(page)).meta.activeMode).toBe('standard');s=(await state(page)).save;assert.equal(s.saveId,standard.saveId);assert.deepEqual(s.school,standard.school);assert.deepEqual(s.dog,standard.dog);await clock(page,'Offline',24);assert.deepEqual((await state(page)).save.dog,standard.dog);
 return {yellow:45,critical:5,activeLoss:true,offlineCaps:{satiety:16,comfort:8},offlineNoKill:true,standardUnchanged:true};
});
await check('context-loss-restore-and-all-models',async page=>{
 await expect.poll(async()=>page.locator('.scene canvas').count()).toBe(1);await page.waitForTimeout(1000);await debugButton(page,'Renderer','lose WebGL context');await dbg(page,false);await expect(page.locator('#app')).toContainText(/Grafik|3D|Darstellung/);await tap(page,'profile');await expect(page.getByRole('tab',{name:'Pflege',exact:true})).toBeVisible();await debugButton(page,'Renderer','restore WebGL context');await dbg(page,false);await page.waitForTimeout(1500);await tap(page,'back');
 await page.goto(`${base}/src/render/dev/scene.html?controls=0`);await page.waitForFunction(()=>window.__pfotenzeitDev?.renderer.getStatus()==='ready');
 await page.evaluate(()=>{const a=window.__pfotenzeitDev;a.set({dogs:[...a.directive().dogs,{id:'dog_bruno',name:'Bruno',growthStage:'arriving',pose:'idle_relaxed',position:'right',facing:-25}],humans:[...a.directive().humans,{id:'human_alex',gesture:'idle',position:'edge',facing:-120}]});});
 await expect.poll(()=>page.evaluate(()=>window.__pfotenzeitDev.metrics().assetTiers),{timeout:15000}).toMatchObject({dog_nala:'glb',dog_bruno:'glb',human_mira:'glb',human_alex:'glb'});
 const growingResponse=page.waitForResponse(r=>r.url().endsWith('/dog_nala_growing.glb')&&r.ok());await page.evaluate(()=>{const a=window.__pfotenzeitDev;a.set({dogs:a.directive().dogs.map(d=>d.id==='dog_nala'?{...d,growthStage:'growing'}:d)});});await expect.poll(()=>page.evaluate(()=>window.__pfotenzeitDev.metrics().assetTiers),{timeout:15000}).toMatchObject({dog_nala:'glb'});await growingResponse;await page.waitForTimeout(500);
 const metrics=await page.evaluate(()=>window.__pfotenzeitDev.metrics());assert.ok(metrics.drawCalls<=100);return {contextRestore:true,metrics};
});
await check('missing-model-fallback',async page=>{
 await page.route('**/assets/models/**',route=>route.fulfill({status:404,body:'Missing model'}));await page.goto(`${base}/src/render/dev/scene.html?controls=0`);await page.waitForFunction(()=>window.__pfotenzeitDev?.renderer.getStatus()==='ready');await expect.poll(()=>page.evaluate(()=>window.__pfotenzeitDev.metrics().assetTiers),{timeout:15000}).toMatchObject({dog_nala:'procedural',human_mira:'procedural'});return await page.evaluate(()=>window.__pfotenzeitDev.metrics());
});
await fs.writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();if(results.some(r=>!r.pass))process.exitCode=1;
