/** Immutable project snapshot avoids a stale shared preview and concurrent dist rebuilds. */
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import net from 'node:net';import {spawn} from 'node:child_process';
const project=process.cwd(),out=path.join(project,'art/soft-humans-2026-10-10/reports');const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pz-human-e2e-'));
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
try{
 for(const name of ['src','public','tests','scripts','package.json','tsconfig.json','vite.config.ts','index.html','playwright.config.ts'])await fs.cp(name,path.join(temp,name),{recursive:true});
 await fs.symlink(path.join(project,'node_modules'),path.join(temp,'node_modules'));
 const config=path.join(temp,'playwright.config.ts');await fs.writeFile(config,(await fs.readFile(config,'utf8')).replaceAll('4173',String(port)).replace('reuseExistingServer: true','reuseExistingServer: false'));
 const child=spawn(path.join(project,'node_modules/.bin/playwright'),['test'],{cwd:temp,env:{...process.env,npm_config_cache:path.join(os.tmpdir(),'npm-cache')}});let log='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{log+=b;process.stdout.write(b)});
 const status=await new Promise(r=>child.on('exit',r));await fs.writeFile(path.join(out,'e2e-isolated.log'),log);await fs.writeFile(path.join(out,'e2e-isolated.json'),JSON.stringify({exitCode:status,port,snapshot:true},null,2));
 if(status!==0){await fs.cp(path.join(temp,'test-results'),path.join(out,'e2e-failures'),{recursive:true});throw Error(`E2E exited ${status}`);}
}finally{await fs.rm(temp,{recursive:true,force:true});}
