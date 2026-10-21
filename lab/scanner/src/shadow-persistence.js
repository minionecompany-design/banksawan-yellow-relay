/** Isolated research log and cohort snapshots, never production's /data volume. */
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
const MAX_BYTES=2*1024*1024;
export class ShadowStore {
  constructor({filename='/data/lab-shadow-v1.json',clock=()=>Date.now(),minWriteMs=60000}={}){
    if(!path.isAbsolute(filename)||!filename.endsWith('.json'))throw Error('BAD_LAB_STORE_PATH');
    this.filename=filename;this.clock=clock;this.minWriteMs=minWriteMs;
    this.lastWriteAt=0;this.lastError=null;this.writeCount=0;this.pending=null;
  }
  async load(){try{const raw=await readFile(this.filename,'utf8');if(Buffer.byteLength(raw)>MAX_BYTES)throw Error('LAB_STORE_OVER_SIZE');
    return JSON.parse(raw);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
  async save(data){if(this.pending||this.clock()-this.lastWriteAt<this.minWriteMs)return false;
    let json=JSON.stringify(data);if(Buffer.byteLength(json)>MAX_BYTES)throw Error('LAB_STORE_SIZE_CAP');
    const tmp=this.filename+'.tmp';this.pending=(async()=>{try{await mkdir(path.dirname(tmp),{recursive:true});
      await writeFile(tmp,json,{mode:0o600});await rename(tmp,this.filename);this.writeCount++;
      this.lastWriteAt=this.clock();this.lastError=null;}catch(e){this.lastError=String(e.message);throw e;}})();
    try{await this.pending;}finally{this.pending=null;}return true;}
  status(){return {writes:this.writeCount,lastWriteAt:this.lastWriteAt,lastError:this.lastError};}
}
