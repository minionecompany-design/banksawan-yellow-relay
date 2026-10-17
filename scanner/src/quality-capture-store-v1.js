/** Bounded atomic OFFLINE storage of quality research snapshots.
 * No live imports, no automatic writers. Caller controls save cadence.
 * HOME ledger, FCM, Binance and Railway config remain untouched.
 */
import {readFile,writeFile,rename,unlink,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const DEFAULT_BYTES=12*1024*1024;
export class QualityCaptureStoreV1 {
 constructor({filename,maxBytes=DEFAULT_BYTES}={}){
  if(typeof filename!=='string'||!path.isAbsolute(filename)||!filename.endsWith('.json')||
   !Number.isSafeInteger(maxBytes)||maxBytes<4096||maxBytes>32*1024*1024)
   throw Error('INVALID_QUALITY_STORE_CONFIG');
  this.filename=filename;this.maxBytes=maxBytes;this.queue=Promise.resolve();
 }
 async restore(){
  let st;try{st=await stat(this.filename);}catch(e){if(e.code==='ENOENT')return null;throw e;}
  if(st.size>this.maxBytes)throw Error('CAPTURE_FILE_OVER_LIMIT');
  let doc;try{doc=JSON.parse(await readFile(this.filename,'utf8'));}
  catch{throw Error('CAPTURE_FILE_INVALID_JSON');}
  if(doc?.version!==1||doc?.mode!=='RESEARCH_ONLY'||!Array.isArray(doc?.records))
   throw Error('CAPTURE_FILE_INVALID_DOCUMENT');
  // The matching QualityCaptureV1.restore() checks candle and event integrity.
  return doc;
 }
 save(snapshot){
  const payload=JSON.stringify(snapshot);
  const job=this.queue.then(async()=>{
   const bytes=Buffer.byteLength(payload,'utf8');
   if(bytes>this.maxBytes)throw Error('CAPTURE_FILE_OVER_LIMIT');
   await mkdir(path.dirname(this.filename),{recursive:true});
   const temp=this.filename+'.tmp.'+randomUUID();
   try{
    await writeFile(temp,payload,{encoding:'utf8',flag:'wx',mode:0o600});
    await rename(temp,this.filename);
   }catch(e){await unlink(temp).catch(()=>{});throw e;}
   return {saved:true,sizeBytes:bytes};
  });
  this.queue=job.catch(()=>{});return job;
 }
}
