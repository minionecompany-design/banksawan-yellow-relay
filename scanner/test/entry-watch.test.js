import test from 'node:test';import assert from 'node:assert/strict';
import {newEntryWatch,advanceEntryWatch,watchLight,observeWatchQuote,publishGreen,validEntryWatch} from '../src/entry-watch.js';
import {trafficLight} from '../src/entry-traffic-light.js';
import {newPaperOutcome,advancePaperOutcome} from '../src/analysis-companion.js';
import {T,M} from './fixtures/analysis-companion.mjs';
import {event,context,confirmation,bar} from './fixtures/entry-watch.mjs';
test('LONG A only arms watch; actual dip, two right bars, reclaim, volume and current context are required',()=>{
 let w=newEntryWatch(event,T+4000);assert.equal(w.state,'WATCHING');assert.equal(w.plan,null);
 const b=bar(T+M,.97,.98,.985);w=advanceEntryWatch(w,b,context(b.endMs,[b]),b.endMs+1000);
 assert.equal(w.state,'PULLBACK');assert.equal(w.plan,null);
 const c=confirmation();assert.equal(c.state,'CONFIRMED',c.reason);assert.equal(c.lowAtMs,T+M);
 assert.equal(c.confirmedBarEndMs,T+4*M);assert.equal(c.entryUntilMs,c.confirmedAtMs+3*M);
 assert.equal(validEntryWatch(c,event.id,T+5*M),true);
});
test('future bars cannot change an earlier decision; moving low cannot be called a confirmed bottom',()=>{
 let w=newEntryWatch(event,T+4000),b=bar(T+M,.97,.98,.985);
 const clean=context(b.endMs,[b]),future=context(b.endMs,[b]);future.oneMinute.push(bar(T+5*M,.01,9,10));
 assert.deepEqual(advanceEntryWatch(w,b,clean,b.endMs+1000),advanceEntryWatch(w,b,future,b.endMs+1000));
 w=advanceEntryWatch(w,b,clean,b.endMs+1000);b=bar(T+2*M,.96,.99,1.01,500);
 w=advanceEntryWatch(w,b,context(b.endMs,[b]),b.endMs+1000);assert.equal(w.plan,null);assert.equal(w.lowAtMs,b.endMs);
});
test('missing 4TF context, late candles and sequence gaps never mint an entry',()=>{
 const w=newEntryWatch(event,T+4000),b=bar(T+M,.97,.98,.985);
 const s=context(b.endMs,[b]);s.oneHour=[];assert.equal(advanceEntryWatch(w,b,s,b.endMs+1000).plan,null);
 assert.equal(advanceEntryWatch(w,{...b,endMs:T+2*M},s,T+2*M+1000).state,'DATA_GAP');
 assert.equal(advanceEntryWatch(w,b,context(b.endMs,[b]),T+3*M).reason,'CANDLE_KONFIRMASI_TERLAMBAT');
});
test('an SL/TP quote permanently ends entry eligibility, including after price returns',()=>{
 for(const price of [.9,1.1]){
  const w=confirmation();assert.equal(w.state,'CONFIRMED',w.reason);
  assert.equal(observeWatchQuote(w,{lastPrice:price,observedAtMs:w.confirmedAtMs+1000},w.confirmedAtMs+1000),true);
  assert.equal(watchLight(w,{lastPrice:1.002,observedAtMs:w.confirmedAtMs+2000},w.confirmedAtMs+2000).status,'OFF');
 }
});
test('green publication is counted once and has its own later-entry paper observation',()=>{
 const w=confirmation(),now=w.confirmedAtMs+1000,t={lastPrice:w.plan.referenceEntry,observedAtMs:now,priceChangePercent:2,quoteVolume24h:20000000};
 assert.equal(watchLight(w,t,now).status,'GREEN');assert.equal(publishGreen(w,t,now),true);assert.equal(publishGreen(w,t,now),false);
 assert.equal(w.greenPaper.status,'WAITING_ENTRY');assert.ok(w.greenPaper.entryAtMs>=now);
 assert.equal(watchLight(w,t,w.entryUntilMs).status,'OFF');
 assert.equal(watchLight(w,{lastPrice:1.002,observedAtMs:now+100000},now+100000).status,'YELLOW');
});
test('watch remains armed at 3h15 without retroactive plans, expires at six hours',()=>{
 let w=newEntryWatch(event,T+4000);
 for(let i=1;i<=196;i++){
  const b=bar(T+i*M,.995,1,1.001);
  w=advanceEntryWatch(w,b,context(b.endMs,[b]),b.endMs+1000);
 }
 assert.equal(w.state,'WATCHING');assert.equal(w.plan,null);
 assert.equal(watchLight(w,null,T+360*M).status,'OFF');
});
test('baseline SL result can never turn GREEN again; expiry is OFF',()=>{
 const now=T+4000,plan={referenceEntry:1,entryLow:.99,entryHigh:1.02,stopLoss:.98,tp1:1.05,tp2:1.1,tp3:1.15,riskPct:2,roomToResistanceR:2};
 const a={availability:'READY',timeframe:'5m',capturedAtMs:now,expiresAtMs:T+15*M,plan,
 frames:['1m','5m','15m','1h'].map(timeframe=>({timeframe,trend:'UP',relativeVolume:2})),levels:{interaction:'BREAKOUT'},warnings:[]};
 const paper=advancePaperOutcome(a,newPaperOutcome(a),bar(T+2*M,.97,1,1.01));
 assert.equal(paper.status,'SL_BEFORE_TP1');assert.equal(trafficLight({...a,paper},{lastPrice:1,observedAtMs:T+3*M},T+3*M).status,'OFF');
 assert.equal(trafficLight(a,null,a.expiresAtMs).status,'OFF');
});

test('journal restores terminal watch and green denominator; v14 records are not retroactively armed',async()=>{
 const {AnalysisCompanionBridge}=await import('../src/analysis-companion-bridge.js');
 let now=T+4000,doc=null;const store={async restore(){return doc;},async save(d){doc=structuredClone(d);}};
 const bridge=new AnalysisCompanionBridge({clock:()=>now,store});await bridge.initialize();
 const s=context(T);s.oneMinute.at(-1).close=1;s.oneMinute.at(-1).open=1;s.oneMinute.at(-1).high=1.001;
 bridge.capture({...event,signal:'LONG_A'},s);await bridge.waitIdle();
 assert.ok(bridge.records.get(event.id));now=T+4*M+2000;
 bridge.records.get(event.id).watch=confirmation();
 assert.equal(bridge.light(event.id,{lastPrice:1.002,observedAtMs:now,priceChangePercent:2,quoteVolume24h:20000000}).status,'GREEN');
 bridge.onTicker(event.symbol,{lastPrice:.9,observedAtMs:now});await bridge.flush();
 const resumed=new AnalysisCompanionBridge({clock:()=>now,store});assert.equal(await resumed.initialize(),true);
 assert.equal(resumed.light(event.id,{lastPrice:1.002,observedAtMs:now}).status,'OFF');
 assert.equal(resumed.summary().entryWatch.greenPublished.sampleSize,1);
 assert.equal(resumed.get(event.id).entryWatch.greenPaper.status,'NOT_ENTERED');
 delete doc.records[0].watch;
 const old=new AnalysisCompanionBridge({clock:()=>now,store});assert.equal(await old.initialize(),true);
 assert.equal(old.get(event.id).entryWatch,null);assert.equal(old.light(event.id,{lastPrice:1,observedAtMs:now}),null);
 await old.flush();await resumed.flush();
});
test('invalid restored watch values cannot be treated as an entry scenario',()=>{
 const w=confirmation();w.plan.stopLoss=2;assert.equal(validEntryWatch(w,event.id,T+5*M),false);
});
test('Android fixture is generated by the actual watch and light engine',async()=>{
 const {readFile}=await import('node:fs/promises'),w=confirmation(),now=w.confirmedAtMs+1000;
 const expected={entryWatch:w,entryLight:watchLight(w,{lastPrice:w.plan.referenceEntry,observedAtMs:now,priceChangePercent:2,quoteVolume24h:20000000},now)};
 assert.deepEqual(JSON.parse(await readFile(new URL('../../android/app/src/test/resources/entry-watch-v1.json',import.meta.url),'utf8')),expected);
});
test('post-confirmation missing candles disable watch and do not invent a paper win',()=>{
 const w=confirmation(),b=bar(w.confirmedBarEndMs+3*M,.9,1,1.2);
 const next=advanceEntryWatch(w,b,context(b.endMs,[b]),b.endMs+1000);
 assert.equal(next.state,'DATA_GAP');assert.equal(next.paper.status,'INCOMPLETE_DATA');
 assert.equal(watchLight(next,{lastPrice:1.002,observedAtMs:b.endMs+1000},b.endMs+1000).status,'OFF');
});
test('new closed 5m trend against the setup permanently ends eligibility before an assumed fill',()=>{
 const w=confirmation(),b=bar(T+5*M,.999,1.002,1.003),s=context(b.endMs,[b]);
 Object.assign(s.fiveMinute.at(-1),{open:.99,close:.9,high:1,low:.89});
 const next=advanceEntryWatch(w,b,s,b.endMs+1000);
 assert.equal(next.state,'ENDED');assert.equal(next.reason,'TREN_BESAR_BERUBAH');assert.equal(next.paper.status,'NOT_ENTERED');
});
test('GREEN cannot bypass the original market eligibility or use a quote from before confirmation',()=>{
 const w=confirmation(),now=w.confirmedAtMs+1000,q={lastPrice:w.plan.referenceEntry,observedAtMs:now,priceChangePercent:2,quoteVolume24h:20000000};
 assert.equal(watchLight(w,{...q,priceChangePercent:1},now).status,'YELLOW');
 assert.equal(watchLight(w,{...q,quoteVolume24h:10000000},now).status,'YELLOW');
 assert.equal(watchLight(w,{...q,observedAtMs:w.confirmedAtMs-1},now).status,'YELLOW');
 assert.equal(watchLight(w,q,now).status,'GREEN');
});
