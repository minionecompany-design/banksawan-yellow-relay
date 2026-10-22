import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateCausalLongA,MODE} from '../src/evaluate-causal-long-a.js';
import {FRAME_MS} from '../src/indicators.js';
const base=172*3_600_000;
function bars(tf,end,n=120){
 const d=FRAME_MS[tf];return Array.from({length:n},(_,i)=>({
 closed:true,closedAtMs:end-(n-1-i)*d,close:5+(i-n)*0.0001,volume:100+i
 }));
}
const fixture=(tf)=>{
 const closedAtMs=base+FRAME_MS[tf],histories={};
 for(const t of ['1m','5m','15m','1h']){
  const end=t===tf?closedAtMs:Math.floor((closedAtMs-1)/FRAME_MS[t])*FRAME_MS[t];
  histories[t]=bars(t,end);
 }
 // A selected same timeframe series is also read through request.security
 // [1], and must therefore be available at previous end separately.
 if(tf!=='1m'){
  // The contract intentionally refuses to substitute the current target
  // snapshot for the requested previous bar: caller needs distinct view.
 }
 return {timeframe:tf,closedAtMs,histories};
};
test('1m uses strictly previous higher-TF contexts without lookahead',()=>{
 const q=fixture('1m'),r=evaluateCausalLongA(q);
 assert.equal(r.ready,true);assert.equal(r.mode,MODE);
 assert.equal(r.longA,false);
});
test('5m, 15m, 1h evaluate with separate previous fully closed context',()=>{
 for(const tf of ['5m','15m','1h']){
  const q=fixture(tf);
  // A source TF current bar must never be reused as close[1].
  // Need at least 112 complete candles through the prior close.
  q.histories[tf]=bars(tf,q.closedAtMs,120);
  const r=evaluateCausalLongA(q);
  assert.equal(r.ready,true,tf+': '+r.reason);
  assert.equal(r.mode,MODE);
  assert.equal(r.longA,false);
 }
});
test('missing previous candle is rejected even when target closed',()=>{
 const q=fixture('5m');
 q.histories['5m']=bars('5m',q.closedAtMs,112);
 assert.equal(evaluateCausalLongA(q).reason,'MISSING_PREVIOUS_CONFIRMED_5m');
});
test('historical lookahead mode never silently accepted as real-time parity',()=>{
 assert.equal(evaluateCausalLongA({...fixture('1m'),mode:'PINE_HISTORICAL'}).reason,'UNSUPPORTED_PARITY_MODE');
});
test('missing or gapped 5m previous context cannot create 1m signal',()=>{
 const q=fixture('1m');q.histories['5m'][20].closed=false;
 assert.equal(evaluateCausalLongA(q).reason,'MISSING_PREVIOUS_CONFIRMED_5m');
});
