import test from 'node:test';import assert from 'node:assert/strict';
import {FirstABResearch,TWO_HOURS,studyBQuality} from '../src/cohorts.js';
import {HourAudit} from '../src/hour-audit.js';
const T=1797000000000, M=60000;
const event=(s,t,signal,p=1)=>({symbol:s,timeframe:'1m',signal,barClosedAtMs:t,price:p,id:`${s}:1m:${t}:${signal}`});
const bar=(t,hi=1.05,lo=.98,cls=1)=>({endMs:t,open:cls,high:Math.max(hi,cls),low:Math.min(lo,cls),close:cls});
const ctx=(t,price=1)=>({endMs:Math.floor(t/300000)*300000,close:price,ma7:price*.99,ma25:price*.97,rsi:55});
const mk=(s='TESTUSDT')=>{const x=new FirstABResearch({clock:()=>T+TWO_HOURS+10*M});
  assert.equal(x.ingest(event(s,T,'LONG_A'),{warmVerified:true}).status,'A1_STORED_SILENTLY');return x;};
test('complete 120 minute observation scores only after-B candles',()=>{
  const x=mk();x.observeClosedBar('TESTUSDT',bar(T+M,1.05,.96,1));
  x.ingest(event('TESTUSDT',T+M,'PROTECT'));
  x.ingest(event('TESTUSDT',T+2*M,'LONG_B',1.03),ctx(T+2*M));
  x.observeClosedBar('TESTUSDT',bar(T+2*M,1.50,.70,1.03)); // B bar NOT scored in post-B
  x.observeClosedBar('TESTUSDT',bar(T+3*M,1.08,.98,1.04));
  for(let i=4;i<=120;i++)x.observeClosedBar('TESTUSDT',bar(T+i*M,1.06,.99,1.01));
  assert.equal(x.summary().complete,1);assert.equal(x.summary().pending,0);
  const r=x.outcomes()[0];assert.equal(r.status,'COMPLETE_SELECTED');
  assert.equal(r.afterBMfePct,4.85);assert.equal(r.afterBMaePct,-4.85);
  assert.equal(r.afterAMfePct,50);assert.equal(r.afterAMaePct,-30);
});
test('a missing 1m candle makes episode INCOMPLETE, not unsuccessful',()=>{
 const x=mk();assert.equal(x.observeClosedBar('TESTUSDT',bar(T+M)).status,'BAR_OBSERVED');
 assert.equal(x.observeClosedBar('TESTUSDT',bar(T+3*M)).status,'INCOMPLETE');
 assert.equal(x.summary().incomplete,1);assert.equal(x.summary().closedNoSelection,0);
});
test('lost top-50 coverage or WebSocket gap becomes INCOMPLETE',()=>{
 const x=mk();assert.equal(x.markCoverageLost('TESTUSDT','ROTATED_OUT_TOP50').status,'INCOMPLETE');
 assert.equal(x.outcomes()[0].incompleteReason,'ROTATED_OUT_TOP50');
 assert.equal(x.ingest(event('TESTUSDT',T+M,'PROTECT')).status,'NO_ACTIVE_A');
});
test('restart snapshot never treats missing time as continuous observation',()=>{
 const x=mk();x.observeClosedBar('TESTUSDT',bar(T+M));
 const snap=x.snapshot();const y=new FirstABResearch({clock:()=>T+TWO_HOURS+10*M});
 assert.equal(y.restore(snap).pendingInvalidated,1);assert.equal(y.summary().incomplete,1);
 assert.equal(y.rows[0].incompleteReason,'RESTART_UNVERIFIED_CONTINUITY');
 assert.equal(y.ingest(event('TESTUSDT',T+M,'LONG_B')).status,'NO_ACTIVE_A');
});
test('watermark marks unresolved episodes incomplete instead of leaving them pending',()=>{
 const x=mk();assert.equal(x.expireUnobserved(T+TWO_HOURS+2*M),1);
 assert.equal(x.summary().incomplete,1);assert.equal(x.summary().pending,0);
});
test('reject false LONG_B count and same-candle paired events',()=>{
 const x=mk();assert.equal(x.ingest(event('TESTUSDT',T,'PROTECT')).status,'REJECT_SAME_CANDLE_STATE_EVENT');
 assert.equal(x.ingest(event('TESTUSDT',T+M,'LONG_B',1.03),ctx(T+M)).status,'REJECT_B_WITHOUT_NEW_PROTECT');
 assert.equal(x.rows[0].bCount,0);
});
test('reject B when 5m context is stale, no lookahead or accidental B3 promotion',()=>{
 const x=mk();x.ingest(event('TESTUSDT',T+M,'PROTECT'));
 assert.equal(x.ingest(event('TESTUSDT',T+2*M,'LONG_B',1.02),ctx(T+10*M)).reason,'MISSING_OR_STALE_5M_CONTEXT');
 x.ingest(event('TESTUSDT',T+3*M,'PROTECT'));
 assert.equal(x.ingest(event('TESTUSDT',T+4*M,'LONG_B',1.03),ctx(T+4*M)).status,'B2_SELECTED_RESEARCH_ONLY');
 x.ingest(event('TESTUSDT',T+5*M,'PROTECT'));
 assert.equal(x.ingest(event('TESTUSDT',T+6*M,'LONG_B',1.04),ctx(T+6*M)).status,'IGNORE_B3_PLUS');
});
test('first A cannot be accepted without warm readiness and does not poison same event ID',()=>{
 const x=new FirstABResearch({clock:()=>T+2*M});
 assert.equal(x.ingest(event('TESTUSDT',T,'LONG_A')).status,'REJECT_COLD_OR_UNPROVEN_FIRST_A');
 assert.equal(x.ingest(event('TESTUSDT',T,'LONG_A'),{warmVerified:true}).status,'A1_STORED_SILENTLY');
});
test('visual BRU and WLD cannot be declared backend miss without exact timestamps',()=>{
 const h=new HourAudit();for(const s of ['BRUSDT','WLDUSDT']){
  assert.equal(h.assessCase({symbol:s}).status,'NEED_EXACT_1H_A_CANDLE');
  assert.equal(h.assessCase({symbol:s,visualAtMs:Math.floor(T/3600000)*3600000}).status,'NO_MATCHING_BACKEND_SNAPSHOT');
 }
});
test('1H distinguishes uncovered, stale ticker, indicator rejection, and confirmed event',()=>{
 const h=new HourAudit(),hr=Math.floor(T/3600000)*3600000;
 const base={symbol:'BRUSDT',visualAtMs:hr},b={barClosedAtMs:hr,covered:true,candleReady:true,warmVerified:true,
   tickerTrusted:true,ticker24hPct:2,mtfReady:true,evaluatorVersionVerified:true,emitted:false};
 assert.equal(h.assessCase({...base,backend:{...b,covered:false}}).status,'COVERAGE_NOT_VERIFIED');
 assert.equal(h.assessCase({...base,backend:{...b,tickerTrusted:false}}).status,'TICKER_NOT_VERIFIED');
 assert.equal(h.assessCase({...base,backend:{...b,reason:'NO_CONFIRMED_SIGNAL'}}).cause,'INDICATOR_OR_STATE_REJECTED');
 assert.equal(h.assessCase({...base,backend:{...b,emitted:true}}).status,'BACKEND_1H_EVENT_CONFIRMED');
});
test('research engine has no Binance, Firebase or trading dependencies',async()=>{
 const {readFile}=await import('node:fs/promises');const {fileURLToPath}=await import('node:url');
 const s=await readFile(fileURLToPath(new URL('../src/cohorts.js',import.meta.url)),'utf8');
 assert.doesNotMatch(s,/\bfetch\s*\(|https?:\/\/|WebSocket\s*\(|firebase|sendEvent\s*\(/i);
 assert.equal(mk().summary().sendsFCM,false);
});
