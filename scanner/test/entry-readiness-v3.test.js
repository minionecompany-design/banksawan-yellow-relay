import test from 'node:test';import assert from 'node:assert/strict';
import {newReadinessWatch,advanceReadinessWatch,observeReadinessQuote,readinessColor,READINESS_TARGET_TF} from '../src/entry-readiness-v3.js';
import {event as raw,context,bar} from './fixtures/entry-watch.mjs';
import {T,M} from './fixtures/analysis-companion.mjs';
import {replayReadinessComparison} from '../scripts/lib/replay-readiness-v3.mjs';
import {readFileSync} from 'node:fs';
const event={...raw,signal:'LONG_A'};
const candle=(i,o,h,l,c,v=100)=>({endMs:T+i*M,open:o,high:h,low:l,close:c,volume:v});
function dip(){return [candle(1,1.002,1.04,1.001,1.035),candle(2,1.034,1.035,1.020,1.024),
  candle(3,1.024,1.029,1.021,1.027),candle(4,1.027,1.030,1.022,1.029),candle(5,1.029,1.038,1.027,1.037,250)];}
function base(){return [candle(1,1.001,1.004,1.000,1.002),candle(2,1.002,1.005,1.001,1.003),
  candle(3,1.003,1.004,1.0005,1.002),candle(4,1.002,1.004,1.001,1.003),
  candle(5,1.003,1.005,1.002,1.004),candle(6,1.004,1.0095,1.003,1.009,250)];}
function run(tail,edit=s=>s){let w=newReadinessWatch(event),s;
  for(const b of tail){s=edit(context(b.endMs,tail.filter(x=>x.endMs<=b.endMs)));w=advanceReadinessWatch(w,b,s,b.endMs+1000);}return {w,s};}
const quote=(w,at=w.checkedAtMs+1000)=>({lastPrice:w.plan.referenceEntry,observedAtMs:at,priceChangePercent:2,quoteVolume24h:20_000_000});
test('pullback above original LONG A can confirm from a previously observed peak, with two right candles',()=>{
  const tail=dip(),early=run(tail.slice(0,3)).w;assert.equal(early.plan,null);
  const {w}=run(tail);assert.ok(w.plan,w.reason);assert.equal(w.path,'PULLBACK');
  assert.ok(w.setup.low>event.price);assert.equal(w.setup.peakAtMs,T+M);
  assert.ok(w.evidence.pullback.rightCandles>=2);assert.equal(w.evidence.pullback.pass,true);
  assert.equal(w.evidence.volume.pullbackRequired,1.2);assert.equal(w.evidence.trend.totalSupportingTf,3);
});
test('five post-signal base candles can confirm continuation without a dip below the signal',()=>{
  const {w}=run(base());assert.ok(w.plan,w.reason);assert.equal(w.path,'CONTINUATION');
  assert.equal(w.evidence.continuation.baseCandles,5);assert.equal(w.evidence.continuation.pass,true);
  assert.equal(w.setup,null);assert.equal(w.evidence.volume.continuationRequired,1.5);
});
test('a failed deep-dip path cannot veto an independently valid continuation base',()=>{
  const tail=[candle(1,1.0,1.02,.9,1.001),...base().map(b=>({...b,endMs:b.endMs+M}))];
  const {w}=run(tail);assert.ok(w.plan,w.reason);assert.equal(w.path,'CONTINUATION');
  assert.equal(w.evidence.pathDecisions[0].path,'PULLBACK');
  assert.equal(w.evidence.pathDecisions[0].reason,'RISK_DISTANCE');
  assert.equal(w.evidence.pathDecisions[1].reason,'SETUP_CONFIRMED');
});
test('vertical or low-volume moves, incomplete context and late processing cannot create a plan',()=>{
  assert.equal(run([candle(1,1,1.2,.99,1.19,1000)]).w.plan,null);
  const weak=base();weak.at(-1).volume=100;assert.equal(run(weak).w.plan,null);
  assert.equal(run(dip(),s=>({...s,oneHour:[]})).w.plan,null);
  const b=dip()[0],w=newReadinessWatch(event);
  assert.equal(advanceReadinessWatch(w,b,context(b.endMs,[b]),b.endMs+91000).reason,'LATE_CANDLE');
  assert.equal(advanceReadinessWatch(w,{...b,endMs:T+2*M},context(T+2*M),T+2*M+1000).state,'DATA_GAP');
});
test('future bars cannot revise an earlier decision or retrospectively supply a base',()=>{
  const tail=dip(),{w,s}=run(tail.slice(0,-1)),last=tail.at(-1);
  const clean=context(last.endMs,tail),dirty=structuredClone(clean);
  dirty.oneMinute.push(candle(7,.1,9,.01,8,90000));
  assert.deepEqual(advanceReadinessWatch(w,last,clean,last.endMs+1000),advanceReadinessWatch(w,last,dirty,last.endMs+1000));
  assert.equal(run(base().slice(0,5)).w.plan,null);
});
test('colors require fresh eligible post-confirmation quotes; evidence is not a probability score',()=>{
  const {w}=run(dip()),at=w.checkedAtMs+1000,q=quote(w,at);
  assert.equal(readinessColor(w,q,at).status,'GREEN');
  for(const change of [{priceChangePercent:1},{quoteVolume24h:10_000_000},{lastPrice:10},
    {observedAtMs:w.confirmedAtMs-1},{lastPrice:w.plan.entryHigh+.001}])
    assert.equal(readinessColor(w,{...q,...change},at).status,'YELLOW');
  assert.equal(readinessColor(w,q,at+31000).status,'YELLOW');
  assert.equal(readinessColor(w,q,w.entryUntilMs).status,'OFF');
  assert.equal('probability' in readinessColor(w,q,at),false);
});
test('known resistance too near produces an explained RED, with no fake plan',()=>{
  const {w}=run(dip(),s=>{s.oneHour[140].high=1.038;return s;});
  assert.equal(w.plan,null);assert.equal(w.reason,'RESISTANCE_ROOM');
  const at=w.checkedAtMs+1000,q={lastPrice:1.037,observedAtMs:at,priceChangePercent:2,quoteVolume24h:20_000_000};
  assert.equal(readinessColor(w,q,at).status,'RED');assert.equal(w.evidence.room.pass,false);
});
test('confirmed plan is immutable; stop touch and gaps cannot resurrect the opportunity',()=>{
  const {w}=run(dip()),saved=structuredClone(w.plan),at=w.checkedAtMs+1000;
  const bad=observeReadinessQuote(w,{...quote(w,at),lastPrice:w.plan.stopLoss},at);
  assert.equal(bad.state,'INVALIDATED');assert.equal(readinessColor(bad,quote(w,at+1000),at+1000).status,'RED');
  const b=candle(6,1.037,1.038,1.036,1.037);
  const next=advanceReadinessWatch(bad,b,context(b.endMs,[b]),b.endMs+1000);
  assert.strictEqual(next,bad);assert.deepEqual(next.plan,saved);
  const gap=advanceReadinessWatch(w,{...b,endMs:T+8*M},context(T+8*M),T+8*M+1000);
  assert.equal(gap.state,'DATA_GAP');assert.equal(readinessColor(gap,null,T+8*M+1000).status,'OFF');
});
test('V3 plans are gated to 1M LONG A but all other TF can remain in the evidence ledger',()=>{
 assert.equal(READINESS_TARGET_TF,'1m');
 assert.equal(event.timeframe,'1m');
 const saved=context(T+M,[candle(1,1,1.001,.999,1)]);
 for(const tf of ['5m','15m','1h']){
   const other={...event,timeframe:tf,id:`${event.symbol}:${tf}:${event.barClosedAtMs}:LONG_A`};
   assert.throws(()=>newReadinessWatch(other),/READINESS_1M_ONLY/);
   const result=replayReadinessComparison({symbol:event.symbol,candles:saved},other);
   assert.equal(result.event.id,other.id);
   assert.equal(result.evaluationScope,'OUT_OF_SCOPE_NON_1M');
   assert.equal(result.candidate.observation,'OUT_OF_SCOPE_NON_1M');
   assert.equal(result.baseline.confirmation,null);
   assert.equal(result.candidate.confirmation,null);
   assert.equal(result.historicalGreen,'NOT_RECONSTRUCTED_NO_HISTORICAL_ELIGIBLE_QUOTES');
 }
 assert.throws(()=>replayReadinessComparison({symbol:'WRONGUSDT',candles:saved},
   {...event,timeframe:'5m',id:`${event.symbol}:5m:${event.barClosedAtMs}:LONG_A`}),/REPLAY_SYMBOL_MISMATCH/);
 const live1m=replayReadinessComparison({symbol:event.symbol,candles:context(T+5*M,dip())},event);
 assert.equal(live1m.evaluationScope,'LONG_A_1M_ONLY');
 assert.ok(live1m.candidate.confirmation);
});

test('archived V3 research cohort explicitly retains all 46 actual cases and counts the 1M-only scope',()=>{
 const url=new URL('../../docs/evidence/entry-v3-20261028/manifest.json',import.meta.url);
 const saved=JSON.parse(readFileSync(url,'utf8'));
 const counts=saved.cases.reduce((out,c)=>(out[c.event.timeframe]=(out[c.event.timeframe]||0)+1,out),{});
 assert.equal(saved.cases.length,46);
 assert.equal(counts['1m'],28);
 assert.equal(counts['5m'],16);
 assert.equal(counts['15m'],2);
});

test('six-hour expiry and identity validation do not invent a signal or opportunity',()=>{
  assert.throws(()=>newReadinessWatch({...event,id:'OTHER'}),/INVALID/);
  assert.throws(()=>newReadinessWatch({...event,signal:'LONG_B'}),/INVALID/);
  const w=newReadinessWatch(event);assert.equal(readinessColor(w,null,T+360*M).status,'OFF');
  const b=bar(T+M,.999,1,1.001);assert.strictEqual(advanceReadinessWatch(w,b,context(T+M),T),w);
});
test('saved replay freezes first confirmation and never labels candle-only results as GREEN',()=>{
  const tail=dip(),s=context(T+5*M,tail),one=replayReadinessComparison({symbol:event.symbol,candles:s},event);
  assert.ok(one.candidate.confirmation);assert.equal(one.candidate.paperCensored,true);
  assert.equal(one.historicalGreen,'NOT_RECONSTRUCTED_NO_HISTORICAL_ELIGIBLE_QUOTES');
  const p=one.candidate.confirmation.plan,extra=[candle(6,p.referenceEntry,p.referenceEntry+.0001,p.referenceEntry-.0001,p.referenceEntry),
    candle(7,p.referenceEntry,p.tp1+.001,p.referenceEntry-.0001,p.tp1)];
  const data=structuredClone(s);data.oneMinute.push(...extra);
  const two=replayReadinessComparison({symbol:event.symbol,candles:data},event);
  assert.deepEqual(two.candidate.confirmation,one.candidate.confirmation);
  assert.equal(two.candidate.paper.status,'TP1_BEFORE_SL');
  const gap=structuredClone(data);gap.oneMinute=gap.oneMinute.filter(b=>b.endMs!==T+6*M);
  assert.equal(replayReadinessComparison({symbol:event.symbol,candles:gap},event).candidate.paper.status,'INCOMPLETE_DATA');
  const ambiguous=structuredClone(data);ambiguous.oneMinute.at(-1).low=p.stopLoss-.001;
  assert.equal(replayReadinessComparison({symbol:event.symbol,candles:ambiguous},event).candidate.paper.status,'AMBIGUOUS');
});
