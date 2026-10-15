import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {LiveHomeLedger} from '../src/live-home-ledger.js';
const BASE=Date.UTC(2026,9,15,12),FILE=async()=>path.join(await mkdtemp(path.join(os.tmpdir(),'yellow-home-')),'events.json');
const sample=(tf='15m',end=BASE)=>({id:`WALUSDT:${tf}:${end}:LONG_A`,symbol:'WALUSDT',timeframe:tf,signal:'LONG_A',
 barClosedAtMs:end,price:.05123,binance24hChangePct:5.8,priority:'HIGH'});
test('two TF events generate two events but only one HOME timer; survives restart',async()=>{
 const filename=await FILE();let now=BASE+1000;const first=new LiveHomeLedger({filename,clock:()=>now});await first.restore();
 assert.equal((await first.accept(sample())).accepted,true);
 now+=2000;assert.equal((await first.accept(sample('1m'))).accepted,true);
 assert.equal(first.home().length,1);assert.equal(first.eventsSince(0).length,2);
 const newInstance=new LiveHomeLedger({filename,clock:()=>now});await newInstance.restore();
 assert.equal(newInstance.home()[0].firstSeenMs,BASE+1000);
 assert.equal((await newInstance.accept(sample())).reason,'DUPLICATE');
 now=BASE+24*3600000+1100;assert.equal(newInstance.home().length,0);
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
