/** Standalone WAL, never a production data directory. Fail on any torn/corrupt
 * transaction; replay must reproduce the saved outputs before accepting input.
 */
import {open,mkdir,unlink,stat} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ForwardShadow1m} from './forward-shadow-1m.js';
const digest=s=>createHash('sha256').update(s).digest('hex');
const ZERO='0'.repeat(64),MAX_LINE=8*1024*1024;
export class ForwardShadowJournal {
  constructor({filename,config,maxBytes=512*1024*1024}={}){
    if(!path.isAbsolute(filename??'')||!filename.endsWith('.ndjson')||
       !Number.isSafeInteger(maxBytes)||maxBytes<4096||maxBytes>1024*1024*1024)
      throw Error('INVALID_SHADOW_JOURNAL');
    this.filename=filename;this.config=config;this.maxBytes=maxBytes;
    this.previous=ZERO;this.sequence=0;this.bytes=0;this.chain=Promise.resolve();this.failed=false;
    this.pending=0;
  }
  async initialize(now){
    await mkdir(path.dirname(this.filename),{recursive:true});
    this.lock=await open(this.filename+'.lock','wx',0o600);
    await this.lock.writeFile(JSON.stringify({pid:process.pid,createdAtMs:now}));await this.lock.sync();
    try{
      let raw='';
      try{
        if((await stat(this.filename)).size>this.maxBytes)throw Error('SHADOW_JOURNAL_TOO_LARGE');
        const f=await open(this.filename,constants.O_RDONLY|constants.O_NOFOLLOW);
        try{raw=await f.readFile('utf8');}finally{await f.close();}
      }catch(e){if(e.code!=='ENOENT')throw e;}
      if(raw&&!raw.endsWith('\n'))throw Error('TORN_SHADOW_TRANSACTION');
      const lines=raw?raw.slice(0,-1).split('\n'):[];
      for(const line of lines){
        if(Buffer.byteLength(line)>MAX_LINE)throw Error('SHADOW_LINE_TOO_LARGE');
        const row=JSON.parse(line),{hash,...body}=row;
        if(body.sequence!==this.sequence||body.previous!==this.previous||digest(JSON.stringify(body))!==hash)
          throw Error('SHADOW_HASH_CHAIN_CORRUPT');
        if(!this.sequence){
          if(body.type!=='HEADER'||JSON.stringify(body.config)!==JSON.stringify(this.config))throw Error('SHADOW_CONFIG_MISMATCH');
          this.observer=new ForwardShadow1m(body.config);
        }else{
          if(body.type!=='TRANSACTION')throw Error('SHADOW_TRANSACTION_TYPE');
          const outputs=this.observer.apply(body.input);
          if(JSON.stringify(outputs)!==JSON.stringify(body.outputs))throw Error('SHADOW_REPLAY_DIVERGED');
        }
        this.previous=hash;this.sequence++;
      }
      this.bytes=Buffer.byteLength(raw);
      this.file=await open(this.filename,constants.O_WRONLY|constants.O_APPEND|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
      if(!lines.length){
        this.observer=new ForwardShadow1m(this.config);
        await this.write({type:'HEADER',config:this.config});
      }else{
        await this.ingest({type:'GAP',reason:'PROCESS_RESTART_CONTINUITY_UNPROVEN',receivedAtMs:now});
      }
      return this.observer;
    }catch(e){await this.close();throw e;}
  }
  async write(data){
    const body={sequence:this.sequence,previous:this.previous,...data};
    const hash=digest(JSON.stringify(body)),line=JSON.stringify({...body,hash})+'\n',size=Buffer.byteLength(line);
    if(size>MAX_LINE||this.bytes+size>this.maxBytes)throw Error('SHADOW_STORAGE_LIMIT_STOP');
    await this.file.writeFile(line,'utf8');await this.file.sync();
    this.previous=hash;this.sequence++;this.bytes+=size;
  }
  ingest(input){
    if(this.pending>=512){this.failed=true;return Promise.reject(Error('SHADOW_QUEUE_CAPACITY_STOP'));}
    this.pending++;
    // Capture input immediately, before a later caller can mutate it.
    const frozen=structuredClone(input);
    const job=this.chain.then(async()=>{
      if(this.failed||!this.file)throw Error('SHADOW_COLLECTOR_STOPPED');
      // Apply to a replayable reducer; a failed commit permanently stops this
      // instance. No output is published until fsync has completed.
      try{
        const outputs=this.observer.apply(frozen);
        await this.write({type:'TRANSACTION',input:frozen,outputs});return outputs;
      }catch(e){this.failed=true;throw e;}
    });
    this.chain=job.catch(()=>{});return job.finally(()=>{this.pending--;});
  }
  async close(){
    await this.chain;
    if(this.file){await this.file.close();this.file=null;}
    if(this.lock){await this.lock.close();this.lock=null;await unlink(this.filename+'.lock');}
  }
  receipt(){return {filename:path.basename(this.filename),transactions:this.sequence-1,bytes:this.bytes,
    finalHash:this.previous,failed:this.failed,uncommittedStateExcluded:this.failed,
    report:this.failed?null:this.observer.report()};}
}
