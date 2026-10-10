import {createServer} from 'vite';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve('art/soft-puppies-2026-10-10/reports');
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
try{
 const port=server.httpServer.address().port;
 const proc=spawn(process.execPath,['src/ui/dev/smoke.mjs'],{env:{...process.env,PZ_BASE:`http://127.0.0.1:${port}`,PZ_BROWSER_CHANNEL:'chrome'}});
 let log='';for(const stream of [proc.stdout,proc.stderr])stream.on('data',b=>{log+=b;process.stdout.write(b);});
 const status=await new Promise(resolve=>proc.on('exit',resolve));await fs.writeFile(path.join(out,'ui-smoke.txt'),log);
 if(status!==0)throw Error(`UI verification exited ${status}`);
}finally{await server.close();}
