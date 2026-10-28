import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,T,M} from './fixtures/analysis-companion.mjs';
import {replaySecondSignalCase} from '../scripts/lib/replay-second-signal-1m.mjs';

function caseAt1m(){
 const {event,snapshot}=fixture('1m');
 return {event,source:{symbol:event.symbol,candles:snapshot}};
}
function append(source,n,step=.0003){
 const bars=source.candles.oneMinute,start=bars.at(-1).close;
 for(let j=1;j<=n;j++){
   const close=start+j*step,open=start+(j-1)*step;
   bars.push({endMs:T+j*M,open,high:Math.max(open,close)+.00005,
     low:Math.min(open,close)-.00005,close,volume:120});
 }
}
test('A valid 5M LONG A remains present but is explicitly outside 1M entry evaluation',()=>{
 const {event,source}=caseAt1m();
 const other={...event,timeframe:'5m',id:`TESTUSDT:5m:${T}:LONG_A`};
 const result=replaySecondSignalCase(source,other);
 assert.equal(result.scope,'OUT_OF_SCOPE_NON_1M');
 assert.equal(result.candlesEvaluated,0);
 assert.equal(result.green,'NOT_RECONSTRUCTED_NO_HISTORICAL_QUOTE');
});
test('Historical 1M candle replay computes since-A return and refuses fake GREEN',()=>{
 const {event,source}=caseAt1m();append(source,5);
 const r=replaySecondSignalCase(source,event);
 assert.equal(r.scope,'LONG_A_1M_ONLY');
 assert.equal(r.candlesEvaluated,5);
 assert.equal(r.completeSixHourWindow,false);
 assert.equal(r.green,'NOT_RECONSTRUCTED_NO_HISTORICAL_QUOTE');
 assert.equal(r.colorsByClosedMinute.GREEN,0);
 assert.ok(r.maxFavorableFromAPct>0);
 assert.equal(r.chg24hAtA,null);
 const fifth=r.observations.find(x=>x.afterMinutes===5);
 assert.ok(fifth?.returnSinceAPct>0);
});
test('Future candles never rewrite an already-issued warning or status',()=>{
 const {event,source}=caseAt1m();append(source,2,-.001);
 const before=replaySecondSignalCase(source,event);
 const future=structuredClone(source);append(future,3,.20);
 const after=replaySecondSignalCase(future,event);
 assert.deepEqual(after.transitions.slice(0,before.transitions.length),before.transitions);
 assert.notEqual(before.maxFavorableFromAPct,after.maxFavorableFromAPct);
});
test('A broken candle history is rejected, not evaluated using unknown values',()=>{
 const {event,source}=caseAt1m();append(source,2);
 source.candles.oneMinute.at(-1).close=-10;
 assert.throws(()=>replaySecondSignalCase(source,event),/INVALID_CLOSED_HISTORY/);
});
test('Missing or discontinued candles are marked censored, not a failed trade',()=>{
 const {event,source}=caseAt1m();append(source,2);
 const r=replaySecondSignalCase(source,event);
 assert.equal(r.completeSixHourWindow,false);
 assert.equal(r.candlesEvaluated,2);
 assert.equal(r.v3CandleConfirmation,null);
 assert.equal(r.firstRed,null);
 assert.equal(r.afterFirstRed,null);
});
test('Mismatched event symbol and quote payload never create a candidate',()=>{
 const {event,source}=caseAt1m();
 assert.throws(()=>replaySecondSignalCase({...source,symbol:'WRONGUSDT'},event),/REPLAY_SYMBOL_MISMATCH/);
});
