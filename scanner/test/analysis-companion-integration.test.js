import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {AnalysisCompanionBridge} from '../src/analysis-companion-bridge.js';
import {AnalysisCompanionStore} from '../src/analysis-companion-store.js';
import {YellowLiveMarket} from '../src/live-market.js';
import {newParallelState} from '../src/parallel-long-a.js';
import {rebuildPineOneMinute} from '../src/pine-v13-one-minute.js';
import {createLiveApi} from '../src/live-api.js';
import {fixture,pineDeliveryFixture,T,M} from './fixtures/analysis-companion.mjs';

const memoryStore=()=>({doc:null,async restore(){return this.doc;},async save(doc){this.doc=structuredClone(doc);}});
async function bridge(options={}){
  const b=new AnalysisCompanionBridge({clock:()=>T+4000,store:memoryStore(),...options});
  assert.equal(await b.initialize(),true);return b;
}

test('capture is immutable, deferred, deduplicated, persisted and recoverable without replayed signals',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-analysis-'));
  try{
    let now=T+4000;const b=new AnalysisCompanionBridge({dataDir:dir,clock:()=>now});
    assert.equal(await b.initialize(),true);const {event,snapshot}=fixture();
    b.capture(event,snapshot);assert.equal(b.records.size,0,'no CPU work before send path resumes');
    snapshot.oneMinute.at(-1).close=99;await b.waitIdle();
    const first=b.get(event.id);assert.ok(first.plan);assert.equal(first.plan.referenceEntry,event.price);
    const changed=b.get(event.id);changed.plan.stopLoss=99;assert.notEqual(b.get(event.id).plan.stopLoss,99);
    b.capture(event,snapshot);await b.flush();assert.equal(b.metrics.duplicates,1);
    const file=path.join(dir,'yellow-analysis-companion-v1.json');
    assert.equal(JSON.parse(await readFile(file,'utf8')).records.length,1);
    now+=1000;const restored=new AnalysisCompanionBridge({dataDir:dir,clock:()=>now});
    assert.equal(await restored.initialize(),true);assert.deepEqual(restored.get(event.id),first);
    await restored.flush();
    await writeFile(file,'{"schemaVersion":1,"method":"WRONG","records":[]}');
    const broken=new AnalysisCompanionBridge({dataDir:dir,clock:()=>now});
    assert.equal(await broken.initialize(),false);assert.match(broken.metrics.lastFault,/INVALID_ANALYSIS_JOURNAL/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('queue/retention/capacity are bounded and expose rejected/evicted observations',async()=>{
  let now=T+4000;const b=await bridge({clock:()=>now,maxRecords:1,maxQueue:1});const {event,snapshot}=fixture();
  assert.equal(b.capture(event,snapshot),true);assert.equal(b.capture(event,snapshot),false);
  await b.waitIdle();assert.equal(b.metrics.droppedJobs,1);
  const other={...event,symbol:'OTHERUSDT',id:event.id.replace('TESTUSDT','OTHERUSDT')};
  b.capture(other,snapshot);await b.waitIdle();assert.equal(b.metrics.rejected,1,'active observation not silently evicted');
  now=T+125*M;assert.equal(b.get(event.id).paper.status,'INCOMPLETE_DATA');
  b.capture(other,snapshot);await b.waitIdle();assert.equal(b.metrics.evicted,1);assert.equal(b.records.size,1);
  now=T+25*60*M;assert.equal(b.get(other.id),null);assert.equal(b.records.size,0);await b.flush();
});

test('future or non-1m data never resolve paper outcomes; gaps and lost coverage are not wins',async()=>{
  let now=T+4000;const b=await bridge({clock:()=>now});const {event,snapshot}=fixture();
  b.capture(event,snapshot);await b.waitIdle();const a=b.get(event.id);
  const bar={endMs:T+2*M,open:event.price,high:a.plan.tp1+.001,low:event.price-.00001,close:event.price,volume:1};
  assert.equal(b.onClosedBar(event.symbol,'1m',bar),false,'future bar');
  now=T+2*M;assert.equal(b.onClosedBar(event.symbol,'5m',bar),false);
  b.onClosedBar(event.symbol,'1m',{...bar,endMs:T+3*M});assert.equal(b.queue.length,0,'still future');
  now=T+3*M;b.onClosedBar(event.symbol,'1m',{...bar,endMs:T+3*M});await b.waitIdle();
  assert.equal(b.get(event.id).paper.status,'INCOMPLETE_DATA');assert.equal(b.summary().decisiveSampleSize,0);await b.flush();
});

test('independent storage failure disables only analysis and does not throw into callers',async()=>{
  const b=await bridge({store:{async restore(){return null;},async save(){throw Error('DISK_FULL');}}});
  const {event,snapshot}=fixture();b.capture(event,snapshot);
  assert.equal(await b.flush(),false);assert.equal(b.enabled,false);assert.match(b.metrics.lastFault,/DISK_FULL/);
  assert.equal(b.capture(event,snapshot),false);
  const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-analysis-size-'));
  try{const s=new AnalysisCompanionStore(path.join(dir,'analysis.json'),4096);
    await assert.rejects(s.save({text:'x'.repeat(5000)}),/TOO_LARGE/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

async function actualDelivery(companionFactory,symbol='TESTUSDT'){
  const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-analysis-delivery-'));
  const {at}=pineDeliveryFixture(),input=at(704),end=input.oneMinute.at(-1).endMs,now=end+4000;
  let requests=0,sends=0;
  const companion=companionFactory?await companionFactory(now):null;
  const market=new YellowLiveMarket({dataDir:dir,clock:()=>now,wsClass:class{},analysisCompanion:companion,
    guard:{closedReason:null,metrics:()=>({}),getJson:()=>{requests++;throw Error('NO_NETWORK');}},
    sendEvent:async()=>{sends++;assert.equal(companion?.records?.size??0,0,'FCM runs before analysis');},log:()=>{}});
  const states=newParallelState();states['1m']=rebuildPineOneMinute(symbol,at(703)).state;
  for(const [tf,key] of [['5m','fiveMinute'],['15m','fifteenMinute'],['1h','oneHour']])states[tf].lastProcessedEndMs=input[key].at(-1).endMs;
  const tracked={states,book:{snapshot:()=>input,pineSnapshot:()=>input}};
  market.covered.set(symbol,tracked);
  market.getTickerAsOf=()=>({symbol:symbol,source:'BINANCE_USDM_FUTURES',contractType:'PERPETUAL',status:'TRADING',
    lastPrice:input.oneMinute.at(-1).close,priceChangePercent:2.5,quoteVolume24h:20_000_000,observedAtMs:end});
  try{
    await market.flushTracked(symbol,tracked);await companion?.flush?.();
    assert.equal(sends,1);assert.equal(requests,0);assert.equal(market.isHalted,false);
    return {home:market.home(),events:market.events(0),record:companion?.get?.(market.home()[0].id),states};
  }finally{await rm(dir,{recursive:true,force:true});}
}

test('actual Pine -> durable ledger -> FCM path is identical with disabled, enabled and throwing analysis',async()=>{
  const off=await actualDelivery(null);
  const on=await actualDelivery(now=>bridge({clock:()=>now}));
  const broken=await actualDelivery(()=>({enabled:true,capture(){throw Error('BROKEN_COMPANION');}}));
  assert.deepEqual(on.home,off.home);assert.deepEqual(on.events,off.events);assert.deepEqual(on.states,off.states);
  assert.deepEqual(broken.home,off.home);assert.ok(on.record?.plan);
});

test('read-only API binds analysis to real HOME event and rejects wrong ids, disabled module and stale market',async()=>{
  let now=T+4000;const b=await bridge({clock:()=>now}),{event,snapshot}=fixture();
  b.capture(event,snapshot);await b.waitIdle();
  const market={isRunning:true,isHalted:false,wsRecovering:false,tickerConnected:true,klineConnected:true,
    lastTickerDataAtMs:now,clock:()=>now,home:()=>[event],analysisCompanion:b,status:()=>({}),guard:{metrics:()=>({})}};
  const server=createLiveApi(market);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    let reply=await fetch(origin+'/api/home');const home=await reply.json();
    assert.equal(home.analysisAvailable,true);assert.equal(home.home[0].analysisCaptured,true);
    const preview=home.home[0].analysisPreview;
    const frozen=b.get(event.id);
    assert.equal(preview.eventId,event.id);
    assert.equal(preview.method,'YELLOW_COMPANION_V1');
    assert.equal(home.home[0].analysisLight.eventId,event.id);
    assert.equal(home.home[0].analysisLight.status,'YELLOW',
      'no ticker is available in this isolated API fixture');
    assert.equal(preview.referenceEntry,event.price);
    assert.equal(preview.stopLoss,frozen.plan.stopLoss);
    assert.equal(preview.tp1,frozen.plan.tp1);
    assert.ok(preview.stopLoss<preview.entryLow && preview.entryHigh<preview.tp1);
    assert.equal(preview.signalAtMs,event.barClosedAtMs);
    assert.ok(!('paper' in preview),'HOME publishes levels, not paper outcome');
    const originalGet=b.get.bind(b);
    b.get=()=>({...originalGet(event.id),availability:'PARTIAL',plan:null});
    const partial=(await (await fetch(origin+'/api/home')).json()).home[0];
    assert.equal(partial.analysisCaptured,true);
    assert.equal(partial.analysisPreview,undefined,'no levels on incomplete four-TF data');
    b.get=originalGet;
    reply=await fetch(origin+'/api/analysis?eventId='+encodeURIComponent(event.id));
    assert.equal(reply.status,200);assert.equal((await reply.json()).analysis.eventId,event.id);
    assert.equal((await fetch(origin+'/api/analysis?eventId=bad')).status,400);
    assert.equal((await fetch(origin+'/api/analysis?eventId='+encodeURIComponent(event.id.replace('TESTUSDT','OTHERUSDT')))).status,404);
    assert.equal((await fetch(origin+'/api/analysis',{method:'POST'})).status,405);
    const summary=await (await fetch(origin+'/api/analysis/summary')).json();assert.equal(summary.summary.sampleSize,1);
    b.get=()=>{throw Error('LOOKUP_FAILED');};
    const degraded=await (await fetch(origin+'/api/home')).json();
    assert.equal(degraded.home.length,1);assert.equal(degraded.analysisAvailable,false);
    assert.equal(degraded.home[0].analysisPreview,undefined);
    assert.equal(degraded.home[0].analysisLight,undefined);
    b.get=originalGet;
    b.enabled=false;assert.equal((await fetch(origin+'/api/analysis?eventId='+encodeURIComponent(event.id))).status,503);
    assert.equal((await (await fetch(origin+'/api/home')).json()).home.length,1,'analysis outage preserves HOME');
    b.enabled=true;now+=30_000;assert.equal((await fetch(origin+'/api/analysis?eventId='+encodeURIComponent(event.id))).status,503);
  }finally{await new Promise(r=>server.close(r));await b.flush();}
});

for(const symbol of ['QUSDT','WUSDT'])test(`${symbol}: actual Pine delivery reaches durable HOME and a complete analysis`,async()=>{
  const result=await actualDelivery(now=>bridge({clock:()=>now}),symbol);
  assert.equal(result.home[0].symbol,symbol);
  assert.equal(result.record.symbol,symbol);
  assert.ok(result.record.plan);
});
