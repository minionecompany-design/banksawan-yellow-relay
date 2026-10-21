import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {OneMinuteBEpisodes,eligibleOneMinuteB} from '../src/one-minute-b-episodes.js';
import {YellowLiveMarket} from '../src/live-market.js';
import {YellowFcm} from '../src/live-fcm.js';

const M=60_000, A=Date.UTC(2026,9,22,10),SYM='AGTUSDT';
const ev=(signal,at,pct=1.2)=>({symbol:SYM,timeframe:'1m',signal,
  id:`${SYM}:1m:${at}:${signal}`,barClosedAtMs:at,price:.125,
  binance24hChangePct:pct,priority:'STANDARD'});
async function setup(){
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'yellow-1m-b-'));
 let now=A+1_000;
 const store=new OneMinuteBEpisodes({filename:path.join(dataDir,'episodes.json'),clock:()=>now});
 await store.restore();
 return {dataDir,store,now:x=>{now=x},getNow:()=>now};
}
test('strict q>10M and >=+1% FIRST A, at most one anchored episode',async()=>{
 const {store}=await setup();
 for(const [pct,q,price] of [[.99,10000001,.125],[1,10000000,.125],[1,10000001,10]]){
  assert.equal((await store.observe({...ev('LONG_A',A,pct),price},{quoteVolumeAtA:q})).status,'FIRST_A_NOT_ELIGIBLE');
 }
 assert.equal((await store.observe(ev('LONG_A',A,1),{quoteVolumeAtA:10000001})).status,'FIRST_A_PINNED');
 assert.equal((await store.observe(ev('LONG_A',A+20*M,20),{quoteVolumeAtA:50000000})).status,'EPISODE_ALREADY_EXISTS');
 assert.equal(store.active(SYM),true);
 assert.equal(store.activeSymbols().length,1);
});
test('silent A -> PROTECT -> B pins FIRST A q even when q later falls; restart prevents repeat',async()=>{
 const {dataDir,store,now}=await setup();
 assert.equal((await store.observe(ev('LONG_A',A),{quoteVolumeAtA:10000001})).status,'FIRST_A_PINNED');
 assert.equal((await store.observe(ev('LONG_B',A+10*M))).status,'PROTECT_WINDOW_INVALID');
 assert.equal((await store.observe(ev('PROTECT',A+17*M))).status,'PROTECTED');
 const b=await store.observe(ev('LONG_B',A+38*M));
 assert.equal(b.status,'LONG_B_SELECTED');assert.equal(b.event.quoteVolume24h,10000001);
 assert.equal(b.event.episodeStartedAtMs,A);assert.equal(b.event.protectAtMs,A+17*M);
 assert.equal(eligibleOneMinuteB(b.event),true);
 assert.equal(store.pending(A+38*M).length,1);
 assert.equal(await store.markPublished(b.event),true);
 const restarted=new OneMinuteBEpisodes({filename:path.join(dataDir,'episodes.json'),clock:()=>A+38*M});
 await restarted.restore();
 assert.equal(restarted.pending(A+38*M).length,0);
 assert.equal(restarted.active(SYM),false);
 assert.equal((await restarted.observe(ev('LONG_B',A+39*M))).status,'NOT_IN_OPEN_EPISODE');
 assert.equal((await restarted.observe(ev('LONG_A',A+40*M),{quoteVolumeAtA:10000001})).status,'EPISODE_ALREADY_EXISTS');
});
test('precise 120m FIRST A and 90m latest PROTECT boundaries',async()=>{
 const x=await setup(),store=x.store;
 await store.observe(ev('LONG_A',A),{quoteVolumeAtA:20_000_000});
 await store.observe(ev('PROTECT',A+30*M));
 assert.equal((await store.observe(ev('LONG_B',A+120*M))).status,'LONG_B_SELECTED','exactly 2h is in scope');
 const y=await setup();
 await y.store.observe(ev('LONG_A',A),{quoteVolumeAtA:20_000_000});
 await y.store.observe(ev('PROTECT',A+3*M));
 assert.equal((await y.store.observe(ev('LONG_B',A+94*M))).status,'PROTECT_WINDOW_INVALID');
 await y.store.observe(ev('PROTECT',A+20*M));
 assert.equal((await y.store.observe(ev('LONG_B',A+111*M))).status,'PROTECT_WINDOW_INVALID');
 assert.equal((await y.store.observe(ev('LONG_B',A+110*M))).status,'LONG_B_SELECTED','90 bars exactly valid');
 const z=await setup();
 await z.store.observe(ev('LONG_A',A),{quoteVolumeAtA:20_000_000});
 await z.store.observe(ev('PROTECT',A+80*M));
 assert.equal((await z.store.observe(ev('LONG_B',A+121*M))).status,'NOT_IN_OPEN_EPISODE');
});
test('OUT_FINAL, missing bars, and corrupted journal fail closed',async()=>{
 const x=await setup();
 await x.store.observe(ev('LONG_A',A),{quoteVolumeAtA:20_000_000});
 assert.equal((await x.store.observe(ev('OUT_FINAL',A+5*M))).status,'CANCELLED');
 assert.equal((await x.store.observe(ev('PROTECT',A+7*M))).status,'NOT_IN_OPEN_EPISODE');
 const y=await setup();
 await y.store.observe(ev('LONG_A',A),{quoteVolumeAtA:20_000_000});
 await y.store.cancel(SYM,'MISSING_CONTEXT');
 assert.equal(y.store.active(SYM),false);
 await writeFile(y.store.filename,'{"version":1,"rows":[{"symbol":"AGTUSDT","status":"OPEN"}]}');
 const z=new OneMinuteBEpisodes({filename:y.store.filename});
 await assert.rejects(z.restore(),/EPISODE_ROW_INVALID/);
});
test('B notifies via durable ledger HOME once; legacy 5m LONG A unaffected',async()=>{
 const x=await setup(),sent=[];
 const market=new YellowLiveMarket({dataDir:x.dataDir,clock:()=>A+38*M,
  oneMinuteLongBEnabled:true,alertTimeframes:['5m','15m','1h'],
  wsClass:class {static OPEN=1},guard:{closedReason:null,metrics:()=>({})},
  sendEvent:async e=>sent.push(e),log:()=>{}});
 await market.ledger.restore();await market.episodes.restore();
 await market.episodes.observe(ev('LONG_A',A),{quoteVolumeAtA:20_000_000});
 await market.episodes.observe(ev('PROTECT',A+17*M));
 const b=await market.episodes.observe({...ev('LONG_B',A+38*M,-0.4),price:11});
 assert.equal(b.status,'LONG_B_SELECTED');
 assert.equal(await market.publishOneMinuteB(b.event),true);
 assert.equal(sent.length,1);assert.equal(sent[0].signal,'LONG_B');
 assert.equal(market.home().length,1);assert.equal(market.home()[0].timeframe,'1m');
 assert.equal(market.home()[0].binance24hChangePct,-0.4,'B shows actual current change while A q remains pinned');
 assert.equal(market.events(0).length,1);
 assert.equal(await market.publishOneMinuteB(b.event),false);
 assert.equal(sent.length,1);
 assert.equal(market.ledger.doc.claimed.length,1);
 const a={...ev('LONG_A',A+38*M),id:`${SYM}:5m:${A+38*M}:LONG_A`,
  timeframe:'5m',quoteVolume24h:20_000_000};
 assert.equal((await market.ledger.accept(a)).accepted,true);
 assert.deepEqual(market.home().map(e=>e.signal).sort(),['LONG_A','LONG_B']);
});
test('FCM rejects 1M FIRST A and malformed B before credentials/network calls',async()=>{
 let calls=0;
 const sender=new YellowFcm({enabled:true,clock:()=>A+38*M,
  serviceAccountJson:JSON.stringify({project_id:'test',client_email:'test',private_key:'none'}),
  fetchImpl:async()=>{calls++;throw Error('SHOULD_NOT_CALL');}});
 const a={...ev('LONG_A',A),quoteVolume24h:20_000_000,expiresAtMs:A+40*M};
 assert.equal((await sender.send(a)).sent,false);
 const malformed={...ev('LONG_B',A+38*M),quoteVolume24h:20_000_000,expiresAtMs:A+43*M};
 assert.equal((await sender.send(malformed)).sent,false);
 assert.equal(calls,0);
});
