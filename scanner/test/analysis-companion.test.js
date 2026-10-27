import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ANALYSIS_FRAMES,ANALYSIS_KEYS,ANALYSIS_PERIODS,analyzeLongA,newPaperOutcome,
  advancePaperOutcome,summarizeAnalysis,validAnalysisEventId} from '../src/analysis-companion.js';
import {fixture,T,M} from './fixtures/analysis-companion.mjs';
const paperBar=(endMs,open=.5338,high=.5340,low=.5336,close=.5338)=>({endMs,open,high,low,close,volume:100});
function analysis(){const {event,snapshot}=fixture();return analyzeLongA(event,snapshot,event.detectedAtMs);}

test('all four lanes produce causal SMA7/25/99, prior-20 RVOL and ordered reference TP/SL',()=>{
  for(const tf of ANALYSIS_FRAMES){
    const {event,snapshot}=fixture(tf),a=analyzeLongA(event,snapshot,event.detectedAtMs);
    assert.equal(a.eventId,event.id);assert.equal(a.availability,'READY');
    assert.ok(a.frames.every(f=>f.trend==='UP'&&f.relativeVolume===2));
    assert.ok(Math.abs(a.frames[0].ma7-mean(snapshot.oneMinute.slice(-7).map(b=>b.close)))<1e-12);
    assert.ok(a.plan.stopLoss<a.plan.entryLow && a.plan.entryLow<=a.plan.referenceEntry);
    assert.ok(a.plan.tp1<a.plan.tp2 && a.plan.tp2<a.plan.tp3);
    assert.equal(a.expiresAtMs,T+15*M);
  }
});
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;

test('adding future candles cannot move an analysis, levels, or targets',()=>{
  const {event,snapshot}=fixture(),before=analyzeLongA(event,snapshot,T+4000);
  const future=structuredClone(snapshot);
  for(const tf of ANALYSIS_FRAMES)future[ANALYSIS_KEYS[tf]].push({
    ...future[ANALYSIS_KEYS[tf]].at(-1),endMs:T+ANALYSIS_PERIODS[tf],high:99,close:80});
  assert.deepEqual(analyzeLongA(event,future,T+4000),before);
});

test('missing boundary context, gapped history, open/future target and malformed OHLC never invent a plan',()=>{
  for(const change of [s=>s.oneHour.pop(),s=>s.fiveMinute.splice(80,1),
    s=>s.oneMinute.at(-1).low=NaN,s=>s.oneMinute=s.oneMinute.slice(-99)]){
    const {event,snapshot}=fixture();change(snapshot);
    const a=analyzeLongA(event,snapshot,T+4000);
    assert.equal(a.availability,'PARTIAL');assert.equal(a.plan,null);
  }
  const {event,snapshot}=fixture();
  assert.throws(()=>analyzeLongA(event,snapshot,T-1),/INVALID_ANALYSIS_EVENT/);
  assert.throws(()=>analyzeLongA(event,snapshot,T+300001),/INVALID_ANALYSIS_EVENT/);
  assert.throws(()=>analyzeLongA({...event,id:event.id.replace('LONG_A','LONG_B')},snapshot,T+4000));
  assert.equal(validAnalysisEventId('TESTUSDT:1m:12345:LONG_A'),false);
});

test('rolling breakout is visible at its actual closed candle; zero volume/ATR is not fabricated',()=>{
  const {event,snapshot}=fixture(),last=snapshot.oneMinute.at(-1);
  last.close+=.003;last.high=last.close+.001;event.price=last.close;
  const a=analyzeLongA(event,snapshot,T+4000);
  assert.equal(a.levels.interaction,'BREAKOUT');assert.ok(a.levels.breakoutLevel<event.price);
  const flat=fixture();for(const key of Object.values(ANALYSIS_KEYS))for(const b of flat.snapshot[key])
    Object.assign(b,{open:.5,high:.5,low:.5,close:.5,volume:0});
  flat.event.price=.5;const b=analyzeLongA(flat.event,flat.snapshot,T+4000);
  assert.equal(b.plan,null);assert.equal(b.frames[0].relativeVolume,null);
  assert.ok(b.warnings.includes('VOLUME_BASELINE_ZERO'));
});

test('paper entry waits for a full minute AFTER detection, does not fill the earlier signal-close price',()=>{
  const a=analysis(),initial=newPaperOutcome(a);
  assert.equal(initial.entryAtMs,T+M);
  assert.equal(advancePaperOutcome(a,initial,paperBar(T+M)),initial,'bar started before detection');
  const next=advancePaperOutcome(a,initial,paperBar(T+2*M));
  assert.equal(next.status,'OPEN');assert.equal(next.entryPrice,.5338);
});

test('TP+SL in one OHLC bar remains ambiguous; no win or net return is invented',()=>{
  const a=analysis(),p=a.plan;
  const out=advancePaperOutcome(a,newPaperOutcome(a),paperBar(T+2*M,p.referenceEntry,p.tp1+.001,p.stopLoss-.001));
  assert.equal(out.status,'AMBIGUOUS');assert.equal(out.netReturnPct,null);
  const s=summarizeAnalysis([{analysis:a,paper:out}]);
  assert.equal(s.ambiguousExcluded,1);assert.equal(s.decisiveSampleSize,0);assert.equal(s.tp1BeforeSlRate,null);
});

test('TP-first, SL-first, gap-through stop and missing-candle outcomes use frozen levels',()=>{
  const a=analysis(),p=a.plan,initial=newPaperOutcome(a);
  const win=advancePaperOutcome(a,initial,paperBar(T+2*M,p.referenceEntry,p.tp1+.0001,p.referenceEntry-.0001));
  assert.equal(win.status,'TP1_BEFORE_SL');assert.equal(win.exitPrice,p.tp1);
  assert.ok(Math.abs(win.grossReturnPct-win.netReturnPct-.14)<1e-10);
  const loss=advancePaperOutcome(a,initial,paperBar(T+2*M,p.referenceEntry,p.referenceEntry+.0001,p.stopLoss-.0001));
  assert.equal(loss.status,'SL_BEFORE_TP1');assert.equal(loss.exitPrice,p.stopLoss);
  const open=advancePaperOutcome(a,initial,paperBar(T+2*M));
  const gap=advancePaperOutcome(a,open,paperBar(T+3*M,p.stopLoss-.002,p.tp1+.001,p.stopLoss-.003,p.stopLoss));
  assert.equal(gap.status,'SL_BEFORE_TP1');assert.equal(gap.exitPrice,p.stopLoss-.002,'open is known before later high/low');
  assert.equal(advancePaperOutcome(a,initial,paperBar(T+3*M)).status,'INCOMPLETE_DATA');
});

test('outside-zone opening is explicitly not entered; 120m without a hit is a priced timeout',()=>{
  const a=analysis(),initial=newPaperOutcome(a);
  assert.equal(advancePaperOutcome(a,initial,paperBar(T+2*M,a.plan.entryHigh+.0001,.535,.533)).status,'NOT_ENTERED');
  let out=initial;
  for(let end=T+2*M;end<=initial.deadlineMs;end+=M)out=advancePaperOutcome(a,out,paperBar(end));
  assert.equal(out.status,'TIMEOUT');assert.equal(out.endedAtMs,initial.deadlineMs);
  assert.ok(out.netReturnPct<0,'declared costs are charged even at a flat exit');
});

test('retest requires an earlier closed breakout and rejects an intervening failed hold',()=>{
  const {event,snapshot}=fixture(),bars=snapshot.oneMinute;
  for(const b of bars.slice(-26,-6))Object.assign(b,{open:1,high:1.01,low:.99,close:1});
  for(const [i,b] of bars.slice(-6,-1).entries())Object.assign(b,{open:i?1.02:1,high:1.025,low:i?1.015:.998,close:1.02});
  Object.assign(bars.at(-1),{open:1.02,high:1.023,low:1.0105,close:1.013});event.price=1.013;
  assert.equal(analyzeLongA(event,snapshot,T+4000).levels.interaction,'RETEST');
  Object.assign(bars.at(-2),{open:1.02,high:1.025,low:.985,close:.99});
  assert.notEqual(analyzeLongA(event,snapshot,T+4000).levels.interaction,'RETEST');
});

test('Android parser fixture equals the actual engine output, preventing silent API/schema drift',()=>{
  const reply=JSON.parse(readFileSync(new URL('../../android/app/src/test/resources/analysis-companion-v1.json',import.meta.url),'utf8'));
  const a=analysis();assert.deepEqual(reply,{simulation:false,mode:'LIVE_SHADOW',analysis:{...a,paper:newPaperOutcome(a),scenarioExpired:false}});
});
