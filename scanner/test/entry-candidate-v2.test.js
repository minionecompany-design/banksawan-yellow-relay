import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedLows,candidateDecision,replayEntryComparison} from '../scripts/lib/entry-candidate-v2.mjs';
import {T,M} from './fixtures/analysis-companion.mjs';
import {event as rawEvent,context,bar} from './fixtures/entry-watch.mjs';
const event={...rawEvent,signal:'LONG_A'};
function sample(){
  const lows=[.970,.975,.980,.982,.979,.981,.983,.984,.985];
  const tail=lows.map((low,i)=>bar(T+(i+1)*M,low,i===8?1.002:.986,i===8?1.003:.988,i===8?250:100));
  const s=context(T+9*M,tail);
  Object.assign(s.fiveMinute.at(-2),{open:.997,close:.998,high:.999,low:.990});
  Object.assign(s.fiveMinute.at(-1),{open:.999,close:1.001,high:1.002,low:.995});
  return s;
}
test('a higher low exists only after two real right-hand candles',()=>{
  const s=sample(),before=s.oneMinute.filter(b=>b.endMs<=T+6*M),after=s.oneMinute.filter(b=>b.endMs<=T+7*M);
  assert.equal(confirmedLows(before,T).length,1);
  const pivots=confirmedLows(after,T);assert.equal(pivots.length,2);
  assert.deepEqual(pivots.at(-1),{low:.979,atMs:T+5*M,availableAtMs:T+7*M});
});
test('causal higher-low stop and native 5m recovery form a separately identified candidate',()=>{
  const s=sample(),d=candidateDecision(event,s,T+9*M,.970);
  assert.ok(d.plan,d.reason);assert.equal(d.pivot.low,.979);assert.equal(d.previousPivot.low,.970);
  assert.ok(d.plan.stopLoss<.979&&d.plan.stopLoss>.970);
  const future=structuredClone(s);future.oneMinute.push(bar(T+10*M,.01,9,10,90000));
  assert.deepEqual(candidateDecision(event,future,T+9*M,.970),d);
  assert.equal(candidateDecision(event,{...s,oneHour:[]},T+9*M,.970).plan,null);
  const broken=structuredClone(s);broken.oneMinute.at(-1).low=.978;
  assert.equal(candidateDecision(event,broken,T+9*M,.970).plan,null);
  const falling=structuredClone(s);falling.fiveMinute.at(-1).close=.998;
  assert.equal(candidateDecision(event,falling,T+9*M,.970).reason,'WAIT_FIVE_MINUTE_RECOVERY');
});
test('comparison freezes first plan, excludes future candles and reports censored observations',()=>{
  const s=sample(),source={symbol:event.symbol,candles:s},one=replayEntryComparison(source,event);
  assert.ok(one.candidate.confirmation,one.candidateTrace.at(-1)?.reason);
  assert.equal(one.candidate.paperCensored,true);assert.equal(one.watchComplete,false);
  const extended=structuredClone(s);
  for(let i=10;i<=12;i++)extended.oneMinute.push(bar(T+i*M,.999,1.002,1.003,100));
  const two=replayEntryComparison({symbol:event.symbol,candles:extended},event);
  assert.deepEqual(two.candidate.confirmation,one.candidate.confirmation,'no better later plan replaces the first');
  assert.equal(one.candidate.confirmation.confirmedAtMs,T+9*M+1000);
  const gapped=structuredClone(extended);gapped.oneMinute=gapped.oneMinute.filter(b=>b.endMs!==T+11*M);
  const gap=replayEntryComparison({symbol:event.symbol,candles:gapped},event);
  assert.equal(gap.candidate.paper.status,'INCOMPLETE_DATA');assert.equal(gap.sequenceGap,true);
  assert.throws(()=>replayEntryComparison({...source,symbol:'OTHERUSDT'},event),/IDENTITY/);
});
