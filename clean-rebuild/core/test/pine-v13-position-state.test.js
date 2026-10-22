import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PineV13LongAState,pineV13StateConditions} from '../src/pine-v13-position-state.js';

const context=()=>({
 one:{close:5,ma7:4.95,ma25:4.8,ma99:4.5,rsi:60,rsiAvg:55,volRatio:.8},
 five:{close:5,ma7:4.9,ma25:4.8,ma99:4.5,rsi:58,rsiAvg:55},
 fifteen:{close:5,ma7:4.9,ma25:4.8,ma99:4.5,rsi:52},
 hour:{close:5,ma7:4.9,ma25:4.8,ma99:4.5,rsi:49},
 pullbackWindowActive:true
});
const gates=(extra={})=>({ready:true,longASetup:false,
 protectCondition:false,reclaimSetup:false,finalExitCondition:false,...extra});
const instant=600_000;
test('source pinned to exact user-supplied Pine v1.3 transition priority and defaults',async()=>{
 const source=await readFile(new URL('../../../docs/reference/BANKSAWAN-LONG-MTF-v1.3-user-supplied.pine',import.meta.url),'utf8');
 for(const phrase of [
  'var int tradeState = 0','if tradeState != 0 and finalExitCondition',
  'else if tradeState == 0 and longASetup',
  'else if tradeState == 1 and protectCondition',
  'else if tradeState == 2','reclaimWindowBars = input.int(90',
  'entryWindowBars = input.int(30','maximumPrice = input.float(30.0',
  'alertcondition('
 ])assert.ok(source.includes(phrase),phrase);
});
test('same LONG A setup repeated across candles emits once like Pine position state',()=>{
 const tracker=new PineV13LongAState();
 const signal=gates({longASetup:true});
 const first=tracker.step({closedAtMs:instant,conditions:signal});
 const second=tracker.step({closedAtMs:instant+60000,conditions:signal});
 const third=tracker.step({closedAtMs:instant+120000,conditions:signal});
 assert.equal(first.signal,'LONG_A');
 assert.equal(second.signal,null);assert.equal(third.signal,null);
 assert.equal(tracker.tradeState,1);
});
test('Pine prioritizes final exit, then LONG A only on a subsequent bar',()=>{
 const tracker=new PineV13LongAState();
 tracker.step({closedAtMs:instant,conditions:gates({longASetup:true})});
 const priority=tracker.step({closedAtMs:instant+60000,
  conditions:gates({finalExitCondition:true,longASetup:true})});
 assert.equal(priority.internalTransition,'INTERNAL_FINAL_EXIT');
 assert.equal(priority.longA,false);assert.equal(tracker.tradeState,0);
 const next=tracker.step({closedAtMs:instant+120000,conditions:gates({longASetup:true})});
 assert.equal(next.signal,'LONG_A');
});
test('PROTECT and LONG B remain internal only, and do not create new LONG A',()=>{
 const tracker=new PineV13LongAState();
 tracker.step({closedAtMs:instant,conditions:gates({longASetup:true})});
 const protect=tracker.step({closedAtMs:instant+60000,conditions:gates({protectCondition:true,longASetup:true})});
 assert.equal(protect.signal,null);assert.equal(protect.internalTransition,'INTERNAL_PROTECT');assert.equal(tracker.tradeState,2);
 const reclaimed=tracker.step({closedAtMs:instant+120000,conditions:gates({reclaimSetup:true,longASetup:true})});
 assert.equal(reclaimed.signal,null);assert.equal(reclaimed.internalTransition,'INTERNAL_RECLAIM');assert.equal(tracker.tradeState,1);
 const hold=tracker.step({closedAtMs:instant+180000,conditions:gates({longASetup:true})});
 assert.equal(hold.signal,null);assert.equal(tracker.tradeState,1);
});
test('90 bar LONG B recovery deadline; expired protected state is not reset just by LONG A setup',()=>{
 const tracker=new PineV13LongAState();
 tracker.step({closedAtMs:instant,conditions:gates({longASetup:true})});
 tracker.step({closedAtMs:instant+60000,conditions:gates({protectCondition:true})});
 let last;
 for(let i=2;i<=92;i++){
  last=tracker.step({closedAtMs:instant+i*60000,
   conditions:gates({longASetup:true,reclaimSetup:i===92})});
 }
 assert.equal(last.signal,null);
 assert.equal(tracker.tradeState,2);
 const reset=tracker.step({closedAtMs:instant+93*60000,
  conditions:gates({finalExitCondition:true,longASetup:true})});
 assert.equal(reset.signal,null);assert.equal(tracker.tradeState,0);
});
test('Pine metric predicates respect RSI, distance, exact volume and MTF weakness',()=>{
 const valid=pineV13StateConditions(context());
 assert.equal(valid.ready,true);assert.equal(valid.longASetup,true);
 assert.equal(valid.finalExitCondition,false);
 assert.equal(valid.protectCondition,false);
 const overRsi=pineV13StateConditions({...context(),one:{...context().one,rsi:75}});
 assert.equal(overRsi.longASetup,false);
 const lowVol=pineV13StateConditions({...context(),one:{...context().one,volRatio:.7499}});
 assert.equal(lowVol.longASetup,false);
 const weak=pineV13StateConditions({...context(),
  one:{...context().one,close:4,ma7:4.5,ma99:4.3,rsi:42,rsiAvg:46},
  five:{...context().five,close:4,ma7:4.4,ma25:4.5,ma99:4.6,rsi:40,rsiAvg:45}});
 assert.equal(weak.protectCondition,true);
 assert.equal(weak.finalExitCondition,true);
});
test('product max price 10 USDT is intentionally stricter than Pine default 30',()=>{
 const source=context();
 source.one={...source.one,close:12,ma7:11.8,ma25:11,ma99:10.5};
 assert.equal(pineV13StateConditions(source).longASetup,true,'Pine v1.3 default 30');
 assert.equal(pineV13StateConditions({...source,maximumPrice:10}).longASetup,false,'YELLOW screening policy');
});
test('no unconfirmed timestamps, noncontiguous bars or malformed conditions in state audit',()=>{
 const tracker=new PineV13LongAState({timeframe:'5m'});
 assert.throws(()=>tracker.step({closedAtMs:instant+60000,conditions:gates()}),/PINE_STATE_GAP_OR_OPEN_BAR/);
 assert.throws(()=>tracker.step({closedAtMs:instant,conditions:{ready:false}}),/PINE_STATE_UNCONFIRMED_CONDITIONS/);
 tracker.step({closedAtMs:instant,conditions:gates()});
 assert.throws(()=>tracker.step({closedAtMs:instant+600000,conditions:gates()}),/PINE_STATE_GAP_OR_OPEN_BAR/);
});
