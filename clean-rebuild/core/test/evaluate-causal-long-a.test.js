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
test('higher lanes reject target snapshot masquerading as previous source TF',()=>{
 for(const tf of ['5m','15m','1h']){
  const q=fixture(tf),r=evaluateCausalLongA(q);
  assert.equal(r.ready,false,tf);
  assert.match(r.reason,/MISSING_PREVIOUS_CONFIRMED_/);
 }
});
test('historical lookahead mode never silently accepted as real-time parity',()=>{
 assert.equal(evaluateCausalLongA({...fixture('1m'),mode:'PINE_HISTORICAL'}).reason,'UNSUPPORTED_PARITY_MODE');
});
test('missing or gapped 5m previous context cannot create 1m signal',()=>{
 const q=fixture('1m');q.histories['5m'][20].closed=false;
 assert.equal(evaluateCausalLongA(q).reason,'MISSING_PREVIOUS_CONFIRMED_5m');
});
