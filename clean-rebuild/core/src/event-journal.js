import {mkdir,readFile,writeFile,rename,open} from 'node:fs/promises';
import path from 'node:path';
/** Offline durable event journal. No credentials/network. Fail closed on corrupt journal.
 * Atomic replace + fsync file and directory, serial writes via promise chain.
 * No automatic history deletion on load. */
export class EventJournal {
 constructor(filename){if(typeof filename!=='string'||!path.isAbsolute(filename))throw Error('ABSOLUTE_JOURNAL_PATH_REQUIRED');this.filename=filename;this.events=[];this.ids=new Set();this.queue=Promise.resolve();}
 async restore(){
  let body;
  try{body=await readFile(this.filename,'utf8');}catch(e){if(e.code==='ENOENT')return;throw e;}
  let parsed;try{parsed=JSON.parse(body);}catch{throw Error('CORRUPT_EVENT_JOURNAL');}
  if(parsed?.version!==1||!Array.isArray(parsed.events)||parsed.events.length>100000)throw Error('INVALID_EVENT_JOURNAL');
  const seen=new Set();
  for(const x of parsed.events){
   if(!x||typeof x.id!=='string'||!/^([A-Z0-9]{2,25}USDT):(1m|5m|15m|1h):([0-9]+):LONG_A$/.test(x.id)||seen.has(x.id)||
       x.signal!=='LONG_A'||typeof x.symbol!=='string'||typeof x.timeframe!=='string'||
       !Number.isSafeInteger(x.barClosedAtMs)||x.id!==`${x.symbol}:${x.timeframe}:${x.barClosedAtMs}:LONG_A`)throw Error('INVALID_EVENT_JOURNAL');
   seen.add(x.id);
  }
  this.events=parsed.events;this.ids=seen;
 }
 async accept(event){
  const op=this.queue.then(()=>this.#accept(event));this.queue=op.catch(()=>{});return op;
 }
 async #accept(event){
  if(!event||typeof event.id!=='string'||event.id!==`${event.symbol}:${event.timeframe}:${event.barClosedAtMs}:LONG_A`||
    event.signal!=='LONG_A'||!Number.isSafeInteger(event.barClosedAtMs)||event.barClosedAtMs<=0||
    !['1m','5m','15m','1h'].includes(event.timeframe)||!/^([A-Z0-9]{2,25}USDT)$/.test(event.symbol))throw Error('INVALID_LONG_A_EVENT');
  if(this.ids.has(event.id))return false;
  const next=[...this.events,structuredClone(event)];
  const data=JSON.stringify({version:1,events:next});
  if(Buffer.byteLength(data)>8*1024*1024)throw Error('JOURNAL_SIZE_LIMIT');
  const dir=path.dirname(this.filename);await mkdir(dir,{recursive:true});
  const tmp=this.filename+'.'+process.pid+'.tmp';
  try{
   const h=await open(tmp,'wx',0o600);
   try{await h.writeFile(data);await h.sync();}finally{await h.close();}
   await rename(tmp,this.filename);
   const d=await open(dir,'r');try{await d.sync();}finally{await d.close();}
  }catch(e){throw e;}
  this.events=next;this.ids.add(event.id);return true;
 }
 list(){return structuredClone(this.events);}
}
