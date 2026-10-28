import test from 'node:test';import assert from 'node:assert/strict';
import {ForwardShadow1m} from '../src/forward-shadow-1m.js';
import {decideSecondSignal1m} from '../src/second-signal-compositor-1m.js';
import {observeContinuationQuoteV4,continuationColorV4} from '../src/entry-continuation-v4.js';
import {config,event,T,M,candle,native,quote,fixture,inputs,startInput,warmInput} from './fixtures/forward-shadow.mjs';
import {context} from './fixtures/entry-watch.mjs';
test('all new 1M events retained, failures included, other TF and old events excluded explicitly',()=>{
 const o=new ForwardShadow1m(config);o.apply(startInput);o.apply(startInput);
 const other={...event,timeframe:'5m',id:`QUSDT:5m:${T}:LONG_A`};
 assert.equal(o.apply({...startInput,event:other})[0].reason,'NON_1M');
 const late={...event,symbol:'BADUSDT',id:`BADUSDT:1m:${T}:LONG_A`};
 o.apply({...startInput,event:late,receivedAtMs:T+6*M});
 const report=o.report();assert.equal(report.cohortEvents,2);
 assert.equal(report.records.find(r=>r.event.symbol==='BADUSDT').completeSixHourWindow,false);
 assert.equal(report.releaseDecision,'NO_GO_LIVE');assert.equal(report.audits.prospective,false);
 assert.equal(report.independentEpisodes,2);
 assert.throws(()=>o.apply({...startInput,receivedAtMs:T}),/CLOCK/);
});
test('native TF arrival order defers only until actual context exists; initial warmup cannot backfill outcomes',()=>{
 const o=new ForwardShadow1m(config);o.apply(startInput);
 const future=structuredClone(warmInput);future.candles.oneMinute.push(candle(1,1,2,.8,1.5));o.apply(future);
 assert.equal(o.books.get(event.symbol).oneMinute.at(-1).endMs,T);
 const all=inputs().slice(2),until5=all.filter(i=>i.receivedAtMs<=T+5*M+1000);
 for(const i of until5)o.apply(i);
 assert.equal(o.records.get(event.id).v4.lastBarEndMs,T+4*M);
 const htf=all.find(i=>i.timeframe==='5m');o.apply(htf);
 assert.equal(o.records.get(event.id).v4.lastBarEndMs,T+5*M);
 const secondWarm=o.apply({...warmInput,receivedAtMs:T+5*M+2000});
 assert.equal(secondWarm[0].reason,'NEVER_REPAIR_POST_START_HISTORY');
});
test('warmup racing behind the first WS candle preserves its native receipt and processes no future outcome',()=>{
 const o=new ForwardShadow1m(config);o.apply(startInput);const first=inputs().find(i=>i.type==='NATIVE_BAR');o.apply(first);
 o.apply({...warmInput,receivedAtMs:first.receivedAtMs+500,capturedAtMs:first.receivedAtMs});
 const last=o.books.get(event.symbol).oneMinute.at(-1);
 assert.equal(last.provenance,'NATIVE_WS');assert.equal(last.firstReceivedAtMs,first.receivedAtMs);
 assert.equal(o.records.get(event.id).v4.lastBarEndMs,T+M);
});
test('GREEN needs a subsequent real eligible ticker; quote entry is independent of later OHLC highs',()=>{
 const o=fixture(),r=o.records.get(event.id),at=T+6*M+2000;
 assert.ok(r.v4.plan,r.v4.reason);assert.equal(r.lastDecision.entryAllowed,false);
 const outputs=o.apply(quote(r.v4.plan.referenceEntry,at));
 assert.equal(r.lastDecision.status,'GREEN');assert.equal(r.lastDecision.priority,false);
 assert.ok(outputs.some(x=>x.type==='PAPER_TRANSITION'&&x.lane==='unified'));
 assert.equal(r.quotePaper.unified.entryAtMs,at);
 const p=r.quotePlans.unified;
 for(const dt of [20_000,40_000])o.apply(quote(p.referenceEntry,at+dt));
 o.apply(native(candle(7,p.referenceEntry,p.tp3+.001,p.referenceEntry-.0001,p.tp1)));
 assert.equal(r.quotePaper.unified.status,'OPEN','No pre-entry/intrabar fill invention from OHLC');
 o.apply(quote(p.tp1+.001,T+7*M+2000));
 assert.equal(r.quotePaper.unified.status,'OBSERVED_TP1_FIRST');
 assert.ok(r.quotePaper.unified.netReturnPct>0);assert.equal(o.report().audits.spreadSlippageVerified,false);
});
test('same-millisecond pre-confirmation ticker and stale exchange event cannot earn GREEN',()=>{
 const o=fixture(),r=o.records.get(event.id),at=T+6*M+1000;
 o.apply(quote(r.v4.plan.referenceEntry,at));assert.notEqual(r.lastDecision.status,'GREEN');
 const stale=quote(r.v4.plan.referenceEntry,at+1000);stale.ticker.exchangeAtMs=at-40_000;
 o.apply(stale);assert.notEqual(r.lastDecision.status,'GREEN');assert.equal(r.lastDecision.priceChangeSinceAPct,null);
});
test('observed quote stop persists and cannot resurrect after rebound; red veto beats other path target',()=>{
 const o=fixture(),r=o.records.get(event.id),at=T+6*M+2000,p=r.v4.plan;
 o.apply(quote(p.referenceEntry,at));
 const stop=Math.min(p.stopLoss,r.quotePlans.unified.stopLoss);
 o.apply(quote(stop,at+1000));
 assert.equal(r.v4.state,'INVALIDATED');assert.equal(r.lastDecision.status,'RED');
 o.apply(quote(p.referenceEntry,at+2000));assert.equal(r.lastDecision.status,'RED');
 assert.equal(r.quotePaper.unified.status,'OBSERVED_SL_FIRST');
 const w=observeContinuationQuoteV4({...r.v4,state:'CONFIRMED'},quote(p.stopLoss,at+3000).ticker,at+3000);
 assert.equal(continuationColorV4(w,quote(p.referenceEntry,at+4000).ticker,at+4000).status,'RED');
 const x=decideSecondSignal1m({event,v3:{...r.v3,state:'INVALIDATED',reason:'TARGET_TOUCHED'},v4:w,
  snapshot:o.books.get(event.symbol),ticker:quote(p.referenceEntry,at+4000).ticker,nowMs:at+4000});
 assert.equal(x.status,'RED');
});
test('missing minute, explicit restart, conflict and data silence censor instead of reviving entry',()=>{
 for(const type of ['gap','restart','conflict','silence']){
  const o=fixture(),r=o.records.get(event.id),p=r.v4.plan,at=T+6*M+2000;
  o.apply(quote(p.referenceEntry,at));
  if(type==='gap')o.apply(native(candle(8,1.01,1.02,1,1.01)));
  if(type==='restart')o.apply({type:'GAP',receivedAtMs:at+1000,reason:'PROCESS_RESTART_CONTINUITY_UNPROVEN'});
  if(type==='conflict')o.apply(native(candle(6,1.0045,1.02,1.003,1.009,250),at+1000));
  if(type==='silence')o.apply({type:'HEARTBEAT',receivedAtMs:T+9*M});
  assert.equal(r.lastDecision.status,'OFF',type);assert.equal(r.quotePaper.unified.status,'INCOMPLETE_DATA',type);
  assert.equal(o.report().completeSixHourEvents,0);
 }
});
test('overlapping alarms form one independent symbol episode and mutations cannot rewrite saved evidence',()=>{
 const o=fixture(),r=o.records.get(event.id),at=T+7*M+1000;
 const later={...event,id:`QUSDT:1m:${T+7*M}:LONG_A`,barClosedAtMs:T+7*M,detectedAtMs:at};
 o.apply({type:'LONG_A',event:later,receivedAtMs:at});
 assert.equal(o.report().cohortEvents,2);assert.equal(o.report().independentEpisodes,1);
 const out=o.apply(quote(r.v4.plan.referenceEntry,at+1000));
 if(out[0])out[0].reason='EDITED';assert.notEqual(o.report().records[0].lastDecision.reason,'EDITED');
 const capped=new ForwardShadow1m({...config,maxEvents:1});capped.apply(startInput);
 assert.throws(()=>capped.apply({type:'LONG_A',event:later,receivedAtMs:at}),/CAPACITY/);
});
test('future quotes, forged native bars and mismatched source time are rejected before decisions',()=>{
 const o=fixture(),at=T+6*M+2000;
 const q=quote(1.009,at);q.ticker.observedAtMs=at+1;assert.throws(()=>o.apply(q),/TICKER/);
 const b=native(candle(7,1,1.01,.99,1),at+1);assert.throws(()=>o.apply(b),/NATIVE/);
 const r=o.records.get(event.id),future=quote(r.v4.plan.referenceEntry,at+1001).ticker;
 const d=decideSecondSignal1m({event,v3:r.v3,v4:r.v4,snapshot:o.books.get(event.symbol),ticker:future,nowMs:at+1});
 assert.notEqual(d.status,'GREEN');assert.equal(d.priceChangeSinceAPct,null);
});
test('a completed six-hour losing-or-flat window remains in the denominator after stopping collection',()=>{
 const o=new ForwardShadow1m(config);o.apply(startInput);o.apply(warmInput);
 for(let i=1;i<=360;i++){
  const end=T+i*M;o.apply(native(candle(i,1,1.001,.999,1)));
  for(const [tf,span,delay] of [['5m',5,1500],['15m',15,1600],['1h',60,1700]])
   if(i%span===0)o.apply(native({endMs:end,open:1,high:1.08,low:.99,close:1.0015,volume:100},end+delay,tf));
 }
 assert.equal(o.report().completeSixHourEvents,1);
 assert.equal(o.report().counts.unified.quotePaper.NO_PLAN,1);
 o.apply({type:'GAP',reason:'SESSION_DURATION_ENDED',receivedAtMs:T+360*M+5000});
 assert.equal(o.report().completeSixHourEvents,1);
});
test('restart never repairs old watches but a new event may seed new pre-signal context',()=>{
 const o=fixture();o.apply({type:'GAP',reason:'PROCESS_RESTART_CONTINUITY_UNPROVEN',receivedAtMs:T+7*M});
 assert.equal(o.books.size,0);
 const later={...event,id:`QUSDT:1m:${T+7*M}:LONG_A`,barClosedAtMs:T+7*M,detectedAtMs:T+7*M+1000};
 o.apply({type:'LONG_A',event:later,receivedAtMs:later.detectedAtMs});
 o.apply({type:'WARMUP',symbol:event.symbol,candles:context(T+7*M),capturedAtMs:T+7*M+1500,receivedAtMs:T+7*M+2000});
 assert.equal(o.records.get(event.id).lastDecision.status,'OFF');
 assert.equal(o.books.get(event.symbol).oneMinute.at(-1).endMs,T+7*M);
 assert.equal(o.records.get(later.id).generation,1);
});
test('an unobserved ticker interval censors a paper position even if the next sample crosses target',()=>{
 const o=fixture(),r=o.records.get(event.id),at=T+6*M+2000;
 o.apply(quote(r.v4.plan.referenceEntry,at));
 o.apply(quote(r.quotePlans.unified.tp1+.01,at+31_000));
 assert.equal(r.quotePaper.unified.status,'INCOMPLETE_DATA');
 assert.equal(r.quotePaper.unified.issue,'TICKER_SAMPLE_GAP');
});
