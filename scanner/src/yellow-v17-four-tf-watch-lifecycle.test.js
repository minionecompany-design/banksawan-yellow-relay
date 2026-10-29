import test from 'node:test';
import assert from 'node:assert/strict';
import {YellowV17WatchLifecycle,V17_FRAMES,V17_WINDOW_MS} from './yellow-v17-four-tf-watch-lifecycle.js';
const base=1_800_000_000_000;
const bar=endMs=>({endMs,open:0.05,high:0.051,low:0.049,close:0.05,volume:100});
function event(tf,at=base){return {symbol:'APRUSDT',timeframe:tf,signal:'LONG_A',price:.05,
 barClosedAtMs:at,detectedAtMs:at,id:`APRUSDT:${tf}:${at}:LONG_A`};}
for(const [tf,step] of Object.entries(V17_FRAMES)){
 test(`${tf}: accept native LONG A, preserve identity, reject skipped candle`,()=>{
  let now=base;const m=new YellowV17WatchLifecycle({clock:()=>now});
  const e=event(tf);assert.equal(m.capture(e),true);
  assert.equal(m.capture(e),false);
  now+=step;assert.equal(m.onClosedBar('APRUSDT',tf,bar(now)),1);
  now+=2*step;assert.equal(m.onClosedBar('APRUSDT',tf,bar(now)),0);
  assert.equal(m.view(e.id).status,'OFF');
 });
}
test('risk latch cannot be overwritten by priority and no ENTRY fields',()=>{
 let now=base;const m=new YellowV17WatchLifecycle({clock:()=>now});
 const e=event('1m');m.capture(e);
 assert.equal(m.observeDecision(e.id,{status:'AVOID',atMs:now,reason:'TEST_RISK'}),true);
 assert.equal(m.observeDecision(e.id,{status:'PRIORITY',atMs:now,reason:'TEST'}),true);
 const v=m.view(e.id);assert.equal(v.status,'AVOID');
 assert.equal(v.entryAllowed,false);assert.equal(v.stopLoss,null);
});
test('two-hour boundary ends episode without producing ENTRY',()=>{
 let now=base;const m=new YellowV17WatchLifecycle({clock:()=>now});
 const e=event('1m');m.capture(e);
 now+=V17_WINDOW_MS;
 assert.equal(m.view(e.id).status,'OFF');
});
test('reset does not reconstruct historical candidates',()=>{
 let now=base;const m=new YellowV17WatchLifecycle({clock:()=>now});
 const e=event('1m');m.capture(e);m.resetContinuity();
 assert.equal(m.view(e.id),null);
});
test('invalid TF, future bar and malformed event fail closed',()=>{
 let now=base;const m=new YellowV17WatchLifecycle({clock:()=>now});
 assert.equal(m.capture(event('3m')),false);
 assert.equal(m.capture(event('1m',now+60_000)),false);
 assert.equal(m.capture({...event('1m'),id:'forged'}),false);
});

test('no decision can be recorded after two-hour window',()=>{
 let now=base;const m=new YellowV17WatchLifecycle({clock:()=>now});
 const e=event('1h');assert.equal(m.capture(e),true);
 now+=V17_WINDOW_MS;
 assert.equal(m.observeDecision(e.id,{status:'PRIORITY',atMs:base+60_000}),false);
 assert.equal(m.view(e.id).status,'OFF');
});
test('malformed candle cannot advance a lane',()=>{
 let now=base;const m=new YellowV17WatchLifecycle({clock:()=>now});
 const e=event('5m');m.capture(e);now+=300_000;
 assert.equal(m.onClosedBar('APRUSDT','5m',{endMs:now}),0);
 assert.equal(m.records.get(e.id).lastBarEndMs,base);
});
