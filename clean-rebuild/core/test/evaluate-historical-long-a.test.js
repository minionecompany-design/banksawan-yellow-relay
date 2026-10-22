import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateHistoricalLongA} from '../src/evaluate-historical-long-a.js';
import {FRAME_MS} from '../src/indicators.js';
const gen=(tf,end,n=150)=>Array.from({length:n},(_,i)=>({
 closed:true,closedAtMs:end-(n-i-1)*FRAME_MS[tf],
 close:5+(i-n)*.0001,volume:100+i
}));
const input=()=>{
 const closedAtMs=180*3_600_000+60_000;
 const histories={'1m':gen('1m',closedAtMs)};
 for(const tf of ['5m','15m','1h']){
  const d=FRAME_MS[tf],end=Math.floor((closedAtMs-1)/d)*d;
  histories[tf]=gen(tf,end);
 }
 return {timeframe:'1m',closedAtMs,histories};
};
test('causal 1m end-to-end replay from raw closed bars without future context',()=>{
 const x=input(),r=evaluateHistoricalLongA(x);
 assert.equal(r.ready,true);
 assert.equal(typeof r.longA,'boolean');
 assert.equal(r.longA,false,'rising no-pullback history must not manufacture LONG A');
});
test('future, unconfirmed and gapped context never becomes signal',()=>{
 const x=input();x.histories['5m'].at(-1).closedAtMs+=FRAME_MS['5m'];
 assert.match(evaluateHistoricalLongA(x).reason,/MISSING_PREVIOUS_CONFIRMED_5m/);
 const y=input();y.histories['1m'][20].closed=false;
 assert.equal(evaluateHistoricalLongA(y).reason,'INVALID_OR_GAPPED_1M');
});
test('5m/15m/1h lanes explicit parity gate, not synthetic notifications',()=>{
 const x=input();for(const tf of ['5m','15m','1h']){
  const r=evaluateHistoricalLongA({...x,timeframe:tf});
  assert.equal(r.ready,false);assert.equal(r.reason,'MULTI_LANE_PINE_PARITY_PENDING');
 }
});
