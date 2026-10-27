/** Bounded, independent journal. Never opens HOME / checkpoints / circuit files. */
import {readFile,writeFile,rename,unlink,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export class AnalysisCompanionStore {
  constructor(filename, maxBytes=8*1024*1024) {
    if (!path.isAbsolute(filename||'') || !filename.endsWith('.json') ||
        !Number.isSafeInteger(maxBytes) || maxBytes<4096 || maxBytes>16*1024*1024) throw Error('INVALID_ANALYSIS_STORE');
    this.filename=filename;this.maxBytes=maxBytes;this.chain=Promise.resolve();
  }
  async restore() {
    try {if ((await stat(this.filename)).size>this.maxBytes) throw Error('ANALYSIS_STORE_TOO_LARGE');}
    catch (e) {if(e.code==='ENOENT') return null;throw e;}
    return JSON.parse(await readFile(this.filename,'utf8'));
  }
  save(snapshot) {
    const payload=JSON.stringify(snapshot);
    const job=this.chain.then(async()=>{
      if (Buffer.byteLength(payload)>this.maxBytes) throw Error('ANALYSIS_STORE_TOO_LARGE');
      await mkdir(path.dirname(this.filename),{recursive:true});
      const temp=this.filename+'.tmp.'+randomUUID();
      try {
        await writeFile(temp,payload,{encoding:'utf8',flag:'wx',mode:0o600});
        await rename(temp,this.filename);
      } catch(e) {await unlink(temp).catch(()=>{});throw e;}
    });
    this.chain=job.catch(()=>{});return job;
  }
}
