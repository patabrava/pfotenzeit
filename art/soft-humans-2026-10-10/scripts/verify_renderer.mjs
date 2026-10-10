/** Verify a stable frontend snapshot while another developer continues in the shared checkout. */
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';
const project=process.cwd(),out=path.join(project,'art/soft-humans-2026-10-10/reports/renderer-isolated'),temp=await fs.mkdtemp(path.join(os.tmpdir(),'pz-human-renderer-'));
await fs.mkdir(out,{recursive:true});
try{
 for(const name of ['src','public','scripts','package.json','tsconfig.json','vite.config.ts','index.html'])await fs.cp(name,path.join(temp,name),{recursive:true});
 await fs.symlink(path.join(project,'node_modules'),path.join(temp,'node_modules'));
 const child=spawn(process.execPath,['src/render/dev/verify-browser.mjs','--out',out],{cwd:temp,env:process.env});let log='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{log+=b;process.stdout.write(b)});
 const status=await new Promise(r=>child.on('exit',r));await fs.writeFile(path.join(out,'runner.log'),log);await fs.writeFile(path.join(out,'snapshot.json'),JSON.stringify({exitCode:status,immutableSnapshot:true,manifest:JSON.parse(await fs.readFile(path.join(temp,'public/assets/manifest.json'),'utf8'))},null,2));if(status!==0)throw Error(`Renderer verification exited ${status}`);
}finally{await fs.rm(temp,{recursive:true,force:true});}
