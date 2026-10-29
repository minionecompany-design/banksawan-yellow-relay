import test from 'node:test';import assert from 'node:assert/strict';
import {decideSecondSignal1m} from '../src/second-signal-compositor-1m.js';
import {newReadinessWatch} from '../src/entry-readiness-v3.js';
import {newContinuationWatchV4,advanceContinuationWatchV4} from '../src/entry-continuation-v4.js';
import {event as ev,context} from './fixtures/entry-watch.mjs';
import {T,M} from './fixtures/analysis-companion.mjs';
const event={...ev,signal:'LONG_A'};
const bar=(i,o,h,l,c,v=100)=>({endMs:T+i*M,open:o,high:h,low:l,close:c,volume:v});
const bars=[
 bar(1,1,1.004,1,1.002),bar(2,1.002,1.005,1.001,1.003),
 bar(3,1.003,1.004,1.0015,1.0035),bar(4,1.0035,1.005,1.002,1.004),
 bar(5,1.004,1.005,1.0025,1.0045),bar(6,1.0045,1.0095,1.003,1.009,250)];
function setup(){
 let v4=newContinuationWatchV4(event);
 for(const b of bars)v4=advanceContinuationWatchV4(v4,b,
    context(b.endMs,bars.filter(x=>x.endMs<=b.endMs)),b.endMs+1000);
 assert.ok(v4.plan,'The independent V4 synthetic fixture must confirm');
 const v3=newReadinessWatch(event);
 const nowMs=v4.confirmedAtMs+1000;
 const snapshot=context(bars.at(-1).endMs,bars);
 const ticker={lastPrice:v4.plan.referenceEntry,observedAtMs:nowMs,
   priceChangePercent:2,quoteVolume24h:20_000_000};
 return {event,v3,v4,nowMs,snapshot,ticker};
}
test('one decision only and no 5M/15M/1H entry lane',()=>{
 const s=setup();
 for(const tf of ['5m','15m','1h'])
   assert.equal(decideSecondSignal1m({...s,event:{...s.event,timeframe:tf}}).status,'NOT_APPLICABLE');
 assert.equal(decideSecondSignal1m({...s,v3:null}).status,'YELLOW');
});
test('GREEN is a single V4 decision with immutable levels, never a probability',()=>{
 const s=setup(),r=decideSecondSignal1m(s);
 assert.equal(r.status,'GREEN');assert.equal(r.selectedPath,'CONTINUATION');
 assert.equal(r.decisionSource,'V4');assert.equal(r.entryAllowed,true);
 assert.ok(r.priceChangeSinceAPct>0);
 assert.deepEqual(r.selectedPlan,s.v4.plan);
 assert.equal('probability' in r,false);
 assert.equal(r.priority,false);
 assert.notStrictEqual(r.selectedPlan,s.v4.plan);
});
test('risk veto overrides apparent GREEN and cannot show contradictory lamps',()=>{
 const s=setup();
 s.v3={...s.v3,state:'INVALIDATED',reason:'STOP_TOUCHED'};
 const r=decideSecondSignal1m(s);
 assert.equal(r.status,'RED');assert.equal(r.entryAllowed,false);
 assert.equal(r.selectedPlan,null);
});
test('data gap or reached TP1 ends opportunity and cannot resurrect green',()=>{
 const s=setup();
 assert.equal(decideSecondSignal1m({...s,v3:{...s.v3,state:'DATA_GAP'}}).status,'OFF');
 assert.equal(decideSecondSignal1m({...s,v4:{...s.v4,state:'INVALIDATED',reason:'TARGET_TOUCHED'}}).status,'OFF');
 assert.equal(decideSecondSignal1m({...s,nowMs:s.event.barClosedAtMs+360*M}).status,'OFF');
});
test('stale or ineligible ticker yields no green and no fabricated since-A percentage',()=>{
 const s=setup();
 const stale=decideSecondSignal1m({...s,ticker:{...s.ticker,observedAtMs:s.nowMs-40_000}});
 assert.equal(stale.status,'YELLOW');assert.equal(stale.priceChangeSinceAPct,null);
 assert.equal(stale.entryAllowed,false);
 const filtered=decideSecondSignal1m({...s,ticker:{...s.ticker,quoteVolume24h:1_000_000}});
 assert.equal(filtered.status,'YELLOW');assert.equal(filtered.entryAllowed,false);
 const oldQuote=decideSecondSignal1m({...s,ticker:{...s.ticker,observedAtMs:s.event.barClosedAtMs-1}});
 assert.equal(oldQuote.priceChangeSinceAPct,null);assert.notEqual(oldQuote.status,'GREEN');
});
test('PANTAU priority is YELLOW only, regardless of subsequent rise',()=>{
 const s=setup();
 s.v4={...s.v4,state:'WATCHING',plan:null,reason:'UNKNOWN_OVERHEAD_RESISTANCE',
   evidence:{...s.v4.evidence,atMs:s.v4.lastBarEndMs,
     continuation:{...s.v4.evidence.continuation,pass:true},
     trend:{...s.v4.evidence.trend,pass:true},
     risk:{...s.v4.evidence.risk,pass:true},
     room:{...s.v4.evidence.room,resistance:null,pass:false}}};
 const x=decideSecondSignal1m(s);
 assert.equal(x.status,'YELLOW');assert.equal(x.priority,true);
 assert.equal(x.entryAllowed,false);assert.equal(x.selectedPlan,null);
 const later=decideSecondSignal1m({...s,nowMs:s.nowMs+100_000});
 assert.equal(later.priority,false);assert.notEqual(later.status,'GREEN');
});

test('invalid event, forged identity or wrong watch method cannot be GREEN',()=>{
 const s=setup();
 assert.equal(decideSecondSignal1m({...s,event:{...s.event,id:'FORGED'}}).status,'OFF');
 assert.equal(decideSecondSignal1m({...s,event:{...s.event,signal:'LONG_B'}}).status,'OFF');
 assert.equal(decideSecondSignal1m({...s,v4:{...s.v4,method:'UNTRUSTED'}}).status,'YELLOW');
 assert.equal(decideSecondSignal1m({...s,v3:{...s.v3,method:'UNTRUSTED'}}).status,'YELLOW');
});
