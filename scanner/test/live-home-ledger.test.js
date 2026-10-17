import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {LiveHomeLedger} from '../src/live-home-ledger.js';
const BASE=Date.UTC(2026,9,15,12),FILE=async()=>path.join(await mkdtemp(path.join(os.tmpdir(),'yellow-home-')),'events.json');
const sample=(tf='15m',end=BASE,symbol='WALUSDT')=>({id:`${symbol}:${tf}:${end}:LONG_A`,symbol,timeframe:tf,signal:'LONG_A',
 barClosedAtMs:end,price:.05123,binance24hChangePct:5.8,priority:'HIGH'});
test('two TF events have independent ten-hour HOME timers and survive restart',async()=>{
 const filename=await FILE();let now=BASE+1000;const first=new LiveHomeLedger({filename,clock:()=>now});await first.restore();
 assert.equal((await first.accept(sample())).accepted,true);
 now+=2000;assert.equal((await first.accept(sample('1m'))).accepted,true);
 assert.equal(first.home().length,2);assert.equal(first.eventsSince(0).length,2);
 const newInstance=new LiveHomeLedger({filename,clock:()=>now});await newInstance.restore();
 assert.equal(newInstance.home()[1].firstSeenMs,BASE+1000);
 assert.equal(newInstance.home()[1].homeExpiresMs,BASE+1000+10*60*60_000);
 assert.equal((await newInstance.accept(sample())).reason,'DUPLICATE');
 now=BASE+1000+10*60*60_000-1;assert.equal(newInstance.home().length,2);
 now=BASE+1000+10*60*60_000;assert.equal(newInstance.home().length,1);
});
test('old persisted HOME is capped at ten hours without inventing an event',async()=>{
 const filename=await FILE();let now=BASE+11*60*60_000;
 await writeFile(filename,JSON.stringify({version:1,home:[{symbol:'WALUSDT',firstSeenMs:BASE,homeExpiresMs:BASE+24*60*60_000}],events:[],claimed:[]}));
 const store=new LiveHomeLedger({filename,clock:()=>now});await store.restore();assert.equal(store.home().length,0);
 const file=await readFile(filename,'utf8');assert.ok(file.includes('WALUSDT'),'no deletion or data loss on load');
});
test('independent expiry; fresh valid event on the same symbol is accepted',async()=>{
 const filename=await FILE();let now=BASE+1000;const store=new LiveHomeLedger({filename,clock:()=>now});await store.restore();
 assert.equal((await store.accept(sample('1m',BASE,'WALUSDT'))).accepted,true);
 now=BASE+30*60_000;assert.equal((await store.accept(sample('1m',now-1000,'KMNOUSDT'))).accepted,true);
 assert.deepEqual(store.home().map(z=>z.symbol),['KMNOUSDT','WALUSDT']);
 now=BASE+10*60*60_000+1000;
 assert.deepEqual(store.home().map(z=>z.symbol),['KMNOUSDT']);
 const fresh=sample('1m',now-1000,'WALUSDT');
 assert.equal((await store.accept(fresh)).accepted,true);
 assert.deepEqual(store.home().map(z=>z.symbol),['WALUSDT','KMNOUSDT']);
 assert.equal(store.home()[0].homeExpiresMs,now+10*60*60_000);
});
test('ten-hour HOME preserves five-minute delivery and 24-hour claims',async()=>{
 const filename=await FILE();let now=BASE+1000;const store=new LiveHomeLedger({filename,clock:()=>now});await store.restore();
 assert.equal((await store.accept(sample())).accepted,true);
 const doc=JSON.parse(await readFile(filename,'utf8'));
 assert.equal(doc.events[0].expiresAtMs,BASE+5*60_000);
 assert.equal(doc.claimed[0].expiresAtMs,BASE+24*60*60_000);
 assert.equal(doc.home[0].homeExpiresMs,now+10*60*60_000);
});
test('future, late, wrong signal and price reject fail closed',async()=>{
 const filename=await FILE();let now=BASE+400000;const store=new LiveHomeLedger({filename,clock:()=>now});await store.restore();
 assert.equal((await store.accept(sample())).accepted,false);
 now=BASE-1000;assert.equal((await store.accept(sample())).accepted,false);
 now=BASE+1000;assert.equal((await store.accept({...sample(),price:10})).accepted,false);
 assert.equal((await store.accept({...sample(),signal:'LONG_B'})).accepted,false);
 assert.equal(store.home().length,0);
});
test('accept serializes concurrent claims exactly once',async()=>{
 const filename=await FILE();const store=new LiveHomeLedger({filename,clock:()=>BASE+1000});await store.restore();
 const results=await Promise.all(Array.from({length:25},()=>store.accept(sample())));
 assert.equal(results.filter(r=>r.accepted).length,1);
 assert.equal(store.eventsSince(0).length,1);
});
