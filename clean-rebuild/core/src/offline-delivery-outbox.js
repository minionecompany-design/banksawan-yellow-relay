import {mkdir,readFile,open,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {alertIsAllowed} from './product-policy.js';
import {tradingViewUrl} from './api-view.js';

const STATES=new Set(['PENDING','LEASED','SENT']);
function validEvent(e){
 return e&&typeof e==='object'&&alertIsAllowed(e)&&
  /^[A-Z0-9]{2,25}USDT$/.test(e.symbol)&&
  e.id===e.symbol+':'+e.timeframe+':'+e.barClosedAtMs+':LONG_A';
}
const nonneg=n=>Number.isSafeInteger(n)&&n>=0;
function validateRow(x){
 return x&&typeof x==='object'&&typeof x.id==='string'&&
   /^[A-Z0-9]{2,25}USDT:(1m|5m|15m|1h):[0-9]+:LONG_A$/.test(x.id)&&
   typeof x.symbol==='string'&&['1m','5m','15m','1h'].includes(x.timeframe)&&
   Number.isSafeInteger(x.barClosedAtMs)&&x.barClosedAtMs>0&&
   x.id===x.symbol+':'+x.timeframe+':'+x.barClosedAtMs+':LONG_A'&&
   x.chartUrl===tradingViewUrl(x.symbol)&&STATES.has(x.state)&&
   nonneg(x.attempts)&&nonneg(x.nextAtMs)&&nonneg(x.leaseUntilMs)&&
   (x.leaseToken===null||typeof x.leaseToken==='string')&&
   (x.receipt===null||typeof x.receipt==='string')&&
   (x.state==='LEASED' ? Boolean(x.leaseToken)&&x.leaseUntilMs>0 :
    x.leaseToken===null&&x.leaseUntilMs===0)&&
   (x.state==='SENT'?Boolean(x.receipt):x.receipt===null);
}
/** Stage 7 offline FCM delivery queue, NO credentials/network. 
 * Single-process durable lease, restart recovery and idempotent event claim.
 * At-least-once semantics: a crash after FCM acceptance but before ACK can
 * resend. Remote event-ID/Android dedupe remains mandatory.
 * One logical dispatcher/recipient only; device fanout not yet implemented. */
export class OfflineDeliveryOutbox {
 constructor(filename){
  if(typeof filename!=='string'||!path.isAbsolute(filename))throw Error('ABSOLUTE_OUTBOX_PATH_REQUIRED');
  this.filename=filename;this.rows=[];this.restored=false;this.serial=Promise.resolve();
 }
 async restore(){
  let content;
  try{content=await readFile(this.filename,'utf8');}
  catch(e){if(e.code==='ENOENT'){this.restored=true;return;}throw e;}
  let raw;try{raw=JSON.parse(content);}catch{throw Error('CORRUPT_DELIVERY_OUTBOX');}
  if(raw?.version!==1||!Array.isArray(raw.rows)||raw.rows.length>100000||
    raw.rows.some(x=>!validateRow(x))||
    new Set(raw.rows.map(x=>x.id)).size!==raw.rows.length)throw Error('INVALID_DELIVERY_OUTBOX');
  this.rows=raw.rows;this.restored=true;
 }
 #inOrder(fn){
  const result=this.serial.then(fn);this.serial=result.catch(()=>{});return result;
 }
 async #commit(rows){
  const payload=JSON.stringify({version:1,rows});
  if(Buffer.byteLength(payload)>8*1024*1024)throw Error('DELIVERY_OUTBOX_SIZE_LIMIT');
  const dir=path.dirname(this.filename);await mkdir(dir,{recursive:true});
  const temp=this.filename+'.'+randomUUID()+'.tmp';
  try{
   const file=await open(temp,'wx',0o600);
   try{await file.writeFile(payload);await file.sync();}finally{await file.close();}
   await rename(temp,this.filename);
   const d=await open(dir,'r');try{await d.sync();}finally{await d.close();}
  }finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  this.rows=rows;
 }
 enqueue(event,nowMs){
  return this.#inOrder(async()=>{
   if(!this.restored)throw Error('OUTBOX_RESTORE_REQUIRED');
   if(!validEvent(event)||!nonneg(nowMs)||nowMs===0)throw Error('INVALID_LONG_A_DELIVERY');
   if(this.rows.some(x=>x.id===event.id))return false;
   const row={id:event.id,symbol:event.symbol,timeframe:event.timeframe,
    barClosedAtMs:event.barClosedAtMs,chartUrl:tradingViewUrl(event.symbol),
    state:'PENDING',attempts:0,nextAtMs:nowMs,leaseUntilMs:0,
    leaseToken:null,receipt:null};
   await this.#commit([...this.rows,row]);return true;
  });
 }
 claim(nowMs,leaseMs=60000){
  return this.#inOrder(async()=>{
   if(!this.restored)throw Error('OUTBOX_RESTORE_REQUIRED');
   if(!nonneg(nowMs)||!Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>3600000)
    throw Error('INVALID_LEASE');
   const i=this.rows.findIndex(x=>(x.state==='PENDING'&&x.nextAtMs<=nowMs)||
     (x.state==='LEASED'&&x.leaseUntilMs<=nowMs));
   if(i<0)return null;
   const row={...this.rows[i],state:'LEASED',attempts:this.rows[i].attempts+1,
    leaseToken:randomUUID(),leaseUntilMs:nowMs+leaseMs,receipt:null};
   await this.#commit(this.rows.map((x,j)=>j===i?row:x));
   return structuredClone(row);
  });
 }
 ack(id,leaseToken,receipt){
  return this.#inOrder(async()=>{
   if(!this.restored)throw Error('OUTBOX_RESTORE_REQUIRED');
   if(typeof receipt!=='string'||receipt.length===0||receipt.length>256)throw Error('INVALID_RECEIPT');
   const i=this.rows.findIndex(x=>x.id===id);
   if(i<0||this.rows[i].state!=='LEASED'||this.rows[i].leaseToken!==leaseToken)return false;
   const next={...this.rows[i],state:'SENT',receipt,leaseUntilMs:0,leaseToken:null};
   await this.#commit(this.rows.map((x,j)=>j===i?next:x));return true;
  });
 }
 retry(id,leaseToken,nowMs,delayMs){
  return this.#inOrder(async()=>{
   if(!this.restored)throw Error('OUTBOX_RESTORE_REQUIRED');
   if(!nonneg(nowMs)||!Number.isSafeInteger(delayMs)||delayMs<1000||delayMs>86400000)
    throw Error('INVALID_RETRY');
   const i=this.rows.findIndex(x=>x.id===id);
   if(i<0||this.rows[i].state!=='LEASED'||this.rows[i].leaseToken!==leaseToken)return false;
   const next={...this.rows[i],state:'PENDING',nextAtMs:nowMs+delayMs,
     leaseUntilMs:0,leaseToken:null};
   await this.#commit(this.rows.map((x,j)=>j===i?next:x));return true;
  });
 }
 snapshot(){
  if(!this.restored)throw Error('OUTBOX_RESTORE_REQUIRED');
  return structuredClone(this.rows);
 }
}
