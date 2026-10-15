import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createOfflineHomeJournal} from '../src/offline-home-journal.js';
const base=Date.UTC(2026,9,15,12);
const signal=(tf,t=base)=>({symbol:'WALUSDT',timeframe:tf,
  id:`WALUSDT:${tf}:${t}:LONG_A`,barClosedAtMs:t,signal:'LONG_A',
  price:0.05123,binance24hChangePct:2.5});

test('offline HOME survives process-object restart for full 24h, never extends on another TF',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'yellow-ledger-'));
  try{
    let now=base+1000;
    const filename=path.join(dir,'offline-ledger.json');
    const first=createOfflineHomeJournal({filename,clock:()=>now});
    const a=await first.ingest([signal('1m')]);
    assert.equal(a.offlineIntents.length,1);
    const expires=a.home[0].homeExpiresMs;
    now=base+2000;
    const restarted=createOfflineHomeJournal({filename,clock:()=>now});
    const b=await restarted.ingest([signal('15m')]);
    assert.equal(b.offlineIntents.length,1);
    assert.equal(b.home[0].homeExpiresMs,expires);
    assert.equal((await restarted.ingest([signal('15m')])).offlineIntents.length,0);
    now=expires-1;
    assert.equal((await restarted.snapshot()).length,1);
    now=expires;
    assert.equal((await restarted.snapshot()).length,0);
    // A NEW LONG A later than the 24h window can create a NEW HOME clock.
    now=expires+1000;
    const anew=await restarted.ingest([signal('1m',now-500)]);
    assert.equal(anew.offlineIntents.length,1);
    assert.equal(anew.home[0].firstSeenMs,now);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('simultaneous same-ID offline ingest is serialized and never double-claims',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'yellow-ledger-'));
  try{
    const journal=createOfflineHomeJournal({filename:path.join(dir,'file.json'),clock:()=>base+3000});
    const outcomes=await Promise.all(Array.from({length:6},()=>journal.ingest([signal('5m')])));
    assert.equal(outcomes.flatMap(x=>x.offlineIntents).length,1);
    assert.equal((await journal.snapshot()).length,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('corrupted offline journal fails closed rather than silently resetting HOME',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'yellow-ledger-'));
  try{
    const filename=path.join(dir,'file.json');
    await writeFile(filename,'{"version":1,"home":"invalid","claims":[]}');
    const journal=createOfflineHomeJournal({filename,clock:()=>base+1000});
    await assert.rejects(journal.ingest([signal('1m')]),/CORRUPT_FAIL_CLOSED/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
