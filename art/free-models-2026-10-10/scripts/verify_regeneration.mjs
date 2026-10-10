/** Build in isolation: integrated CC0 character files and entries must survive regeneration. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pz-cc0-regeneration-'));
try {
  await fs.cp('scripts',path.join(temp,'scripts'),{recursive:true});
  await fs.cp('public/assets',path.join(temp,'public/assets'),{recursive:true});
  await fs.symlink(path.join(process.cwd(),'node_modules'),path.join(temp,'node_modules'));
  const names=['dog_nala_puppy.glb','dog_nala_growing.glb','dog_bruno_puppy.glb'];
  const hash=async n=>createHash('sha256').update(await fs.readFile(path.join(temp,'public/assets/models',n))).digest('hex');
  const original=JSON.parse(await fs.readFile(path.join(temp,'public/assets/manifest.json'),'utf8'));
  const before=await Promise.all(names.map(hash));
  const run=spawnSync(process.execPath,['scripts/build-models.mjs'],{cwd:temp,encoding:'utf8'});
  if(run.status!==0)throw Error(run.stderr);
  const after=await Promise.all(names.map(hash));
  const rebuilt=JSON.parse(await fs.readFile(path.join(temp,'public/assets/manifest.json'),'utf8'));
  for(const key of ['dog.nala.puppy','dog.nala.growing','dog.bruno.puppy'])if(JSON.stringify(original.assets[key])!==JSON.stringify(rebuilt.assets[key]))throw Error(`Regeneration changed ${key}'s manifest entry`);
  if(before.some((h,i)=>h!==after[i]))throw Error('Regeneration overwrote a CC0 dog');
  await fs.writeFile('art/free-models-2026-10-10/reports/regeneration.json',JSON.stringify({passed:true,manifestEntriesPreserved:true,hashes:Object.fromEntries(names.map((n,i)=>[n,after[i]]))},null,2)+'\n');
  console.log('Isolated assets:build preserved three CC0 GLBs and manifest entries exactly.');
} finally {await fs.rm(temp,{recursive:true,force:true});}
