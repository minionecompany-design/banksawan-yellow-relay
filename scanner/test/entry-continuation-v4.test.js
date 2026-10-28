import test from 'node:test';
import assert from 'node:assert/strict';
import {newContinuationWatchV4,advanceContinuationWatchV4,continuationColorV4,continuationPriorityV4,
  CONTINUATION_V4_METHOD} from '../src/entry-continuation-v4.js';
import {newReadinessWatch,advanceReadinessWatch} from '../src/entry-readiness-v3.js';
import {event as raw,context} from './fixtures/entry-watch.mjs';
import {T,M} from './fixtures/analysis-companion.mjs';
const event={...raw,signal:'LONG_A'};
const bar=(i,o,h,l,c,v=100)=>({endMs:T+i*M,open:o,high:h,low:l,close:c,volume:v});
const stair=()=>[
 bar(1,1.000,1.004,1.000,1.002),
 bar(2,1.002,1.005,1.001,1.003),
 bar(3,1.003,1.004,1.0015,1.0035),
 bar(4,1.0035,1.005,1.002,1.004),
 bar(5,1.004,1.005,1.0025,1.0045),
 bar(6,1.0045,1.0095,1.003,1.009,250)];
function run(tail,edit=s=>s,atOffset=1000){
 let w=newContinuationWatchV4(event);
 for(const b of tail){
   const s=edit(context(b.endMs,tail.filter(x=>x.endMs<=b.endMs)));
   w=advanceContinuationWatchV4(w,b,s,b.endMs+atOffset);
 }
 return w;
}
test('V4 never evaluates non1m events or invalid identity',()=>{
 for(const tf of ['5m','15m','1h']){
   assert.throws(()=>newContinuationWatchV4({...event,timeframe:tf,
     id:`QUSDT:${tf}:${T}:LONG_A`}),/1M_ONLY/);
 }
 assert.throws(()=>newContinuationWatchV4({...event,id:'WRONG'}),/INVALID/);
});
test('V4 can confirm causal 3-bar continuation with native context while V3 stays independent',()=>{
 const b=stair(),early=run(b.slice(0,5));
 assert.equal(early.plan,null);
 const w=run(b);
 assert.equal(w.method,CONTINUATION_V4_METHOD);
 assert.ok(w.plan,w.reason);
 assert.equal(w.path,'CONTINUATION');
 assert.equal(w.evidence.continuation.baseCandles,3);
 assert.ok(w.evidence.risk.pass);
 assert.ok(w.evidence.room.pass);
 const quote={lastPrice:w.plan.referenceEntry,observedAtMs:w.confirmedAtMs+1000,
   priceChangePercent:2,quoteVolume24h:20_000_000};
 assert.equal(continuationColorV4(w,quote,w.confirmedAtMs+1000).status,'GREEN');
 let original=newReadinessWatch(event);
 for(const candle of b)original=advanceReadinessWatch(original,candle,
   context(candle.endMs,b.filter(x=>x.endMs<=candle.endMs)),candle.endMs+1000);
 assert.equal(original.method,'YELLOW_TWO_PATH_READINESS_V3_RESEARCH');
});
test('Volume, spread out base, vertical breakout and unavailable HTF block V4',()=>{
 const weak=stair();weak.at(-1).volume=90;
 assert.equal(run(weak).plan,null);
 const vert=stair();vert.at(-1).high=1.20;vert.at(-1).close=1.19;
 assert.equal(run(vert).plan,null);
 assert.equal(run(stair(),s=>({...s,oneHour:[]})).plan,null);
 const late=run(stair(),s=>s,91_000);
 assert.equal(late.plan,null);
});
test('V4 color never green for stale quote, off-zone, expiry or touched TP1',()=>{
 const w=run(stair()),now=w.confirmedAtMs+1000,
   q={lastPrice:w.plan.referenceEntry,observedAtMs:now,
     priceChangePercent:2,quoteVolume24h:20_000_000};
 for(const changed of [{priceChangePercent:0.1},{quoteVolume24h:10_000_000},
   {lastPrice:w.plan.entryHigh+.0005},{observedAtMs:now-40_000}]){
   assert.notEqual(continuationColorV4(w,{...q,...changed},now).status,'GREEN');
 }
 assert.equal(continuationColorV4(w,{...q,lastPrice:w.plan.tp1},now).status,'OFF');
 assert.equal(continuationColorV4(w,{...q,lastPrice:w.plan.stopLoss},now).status,'RED');
 assert.equal(continuationColorV4(w,q,w.entryUntilMs).status,'OFF');
});
test('No future candle changes past V4 decision; immutable plan and terminal gap',()=>{
 const b=stair(),old=run(b.slice(0,-1)),last=b.at(-1);
 const clean=context(last.endMs,b),dirty=structuredClone(clean);
 dirty.oneMinute.push(bar(9,1,10,.5,8,99999));
 const a=advanceContinuationWatchV4(old,last,clean,last.endMs+1000),
       c=advanceContinuationWatchV4(old,last,dirty,last.endMs+1000);
 assert.deepEqual(a,c);
 const gap=advanceContinuationWatchV4(a,bar(9,1.01,1.02,1.005,1.015),
   context(T+9*M),T+9*M+1000);
 assert.equal(gap.state,'DATA_GAP');
 assert.strictEqual(advanceContinuationWatchV4(gap,bar(10,1,1.01,.99,1.0),
   context(T+10*M),T+10*M+1000),gap);
});

test('PANTAU priority is separate from GREEN and cannot bypass risk/resistance',()=>{
 const w=run(stair());
 assert.equal(continuationPriorityV4(w,w.checkedAtMs).status,'CONFIRMED_NEEDS_FRESH_QUOTE');
 const candidate={...w,state:'WATCHING',plan:null,reason:'UNKNOWN_OVERHEAD_RESISTANCE',
   evidence:{...w.evidence,continuation:{...w.evidence.continuation,pass:true},
     trend:{...w.evidence.trend,pass:true},
     risk:{...w.evidence.risk,pass:true},
     room:{...w.evidence.room,resistance:null,pass:false}}};
 const priority=continuationPriorityV4(candidate,candidate.checkedAtMs);
 assert.equal(priority.status,'WATCH_PRIORITY_UNKNOWN_OVERHEAD');
 assert.equal(priority.entryAllowed,false);
 assert.notEqual(continuationColorV4(candidate,null,candidate.checkedAtMs).status,'GREEN');
 assert.equal(continuationPriorityV4({...candidate,evidence:{...candidate.evidence,
   risk:{pass:false}}}).status,'WAIT_RISK');
 assert.equal(continuationPriorityV4({...candidate,evidence:{...candidate.evidence,
   room:{pass:false,resistance:w.plan.referenceEntry+.0001}}}).status,'WAIT_RESISTANCE_ROOM');
 assert.equal(continuationPriorityV4({...candidate,evidence:{...candidate.evidence,
   trend:{pass:false}}}).status,'WAIT_HTF');
});
