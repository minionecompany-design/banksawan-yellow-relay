/**
 * SINGLE-PROCESS OFFLINE proof of durable HOME 24h + event dedupe.
 * No notifications, no trading, no network, and NO production ingest API.
 * Atomic rename protects the journal from partial writes. Production needs a
 * database transaction and durable FCM/poll atomic claims (not this module).
 */
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {routeParallelIntents,newIntentState} from './parallel-intents.js';
import {getActiveHome,SETTINGS} from './long-a.js';
const MAX_EVENT_AGE_MS=5*60_000;
function validateJournal(doc){
  if(doc?.version!==1 || !Array.isArray(doc.home)||!Array.isArray(doc.claims))
    throw new Error('OFFLINE_JOURNAL_CORRUPT_FAIL_CLOSED');
  if(doc.home.some(x=>typeof x.symbol!=='string'||!Number.isFinite(x.homeExpiresMs))||
    doc.claims.some(x=>typeof x.id!=='string'||!Number.isFinite(x.expiresAtMs)))
    throw new Error('OFFLINE_JOURNAL_CORRUPT_FAIL_CLOSED');
}
export function createOfflineHomeJournal({filename,clock=()=>Date.now()}={}){
  if(typeof filename!=='string'||!filename)throw new Error('LOCAL_JOURNAL_FILENAME_REQUIRED');
  let serial=Promise.resolve();
  async function read(now){
    let doc;
    try{doc=JSON.parse(await readFile(filename,'utf8'));}
    catch(e){if(e?.code==='ENOENT')doc={version:1,home:[],claims:[]};else throw e;}
    validateJournal(doc);
    return {version:1,home:getActiveHome(doc.home,now),
      claims:doc.claims.filter(c=>c.expiresAtMs>now)};
  }
  async function persist(doc){
    await mkdir(path.dirname(filename),{recursive:true});
    const tmp=`${filename}.tmp.${process.pid}`;
    await writeFile(tmp,JSON.stringify(doc),'utf8');
    await rename(tmp,filename);
  }
  function serialized(fn){
    const job=serial.then(fn);
    serial=job.catch(()=>{});
    return job;
  }
  return {
    snapshot:()=>serialized(async()=>{const now=clock();return (await read(now)).home;}),
    ingest:(events)=>serialized(async()=>{
      const now=clock();
      if(!Number.isFinite(now))throw new Error('INVALID_CLOCK');
      const doc=await read(now);
      const prev=newIntentState();prev.home=doc.home;
      prev.claimedEventIds=new Set(doc.claims.map(c=>c.id));
      const outcome=routeParallelIntents(events,now,prev);
      const newClaims=outcome.notificationIntents.map(x=>({id:x.eventId,
        expiresAtMs:x.expiresAtMs}));
      const next={version:1,home:outcome.state.home,
        claims:[...doc.claims,...newClaims].filter(c=>c.expiresAtMs>now)};
      await persist(next);
      return {home:next.home,offlineIntents:outcome.notificationIntents,rejected:outcome.rejected,
        expiresAfterMs:SETTINGS.homeRetentionMs,mode:'OFFLINE_RESEARCH_ONLY'};
    })
  };
}
