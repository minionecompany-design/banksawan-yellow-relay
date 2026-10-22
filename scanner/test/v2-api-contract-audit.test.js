import test from 'node:test';
import assert from 'node:assert/strict';
import {auditV2ApiContract} from '../scripts/lib/v2-api-contract.mjs';
import {YellowLiveMarket} from '../src/live-market.js';
import {createLiveApi} from '../src/live-api.js';
const NOW=Date.UTC(2026,9,22,12);
function snapshot(n=47){
 const count=Math.min(n,50),rows=Array.from({length:n},(_,i)=>({symbol:'COIN'+i+'USDT',
  price:.05,binance24hChangePct:2,quoteVolume24h:20_000_000,
  tickerObservedAtMs:NOW-1000,coverage:i<count?'SCANNING':'QUEUED'}));
 return {capturedAtMs:NOW,status:{ok:true,mode:'LIVE_SHADOW',exchange:'BINANCE_USDM_PERPETUAL',
  alertTimeframes:['1m','5m','15m','1h'],
  tickerConnected:true,klineConnected:true,wsRecovering:false,requestGuard:{circuitOpen:false},
  lastTickerDataAtMs:NOW-1000,lastKlineDataAtMs:NOW-1000,maxTracked:50,
  covered:count,eligible:n,allocatedScanSlots:count,coverageRatio:count/n,
  coverageComplete:n<=50,uncoveredEligible:n-count,bootstrapInProgress:0},
  universe:{simulation:false,mode:'LIVE_SHADOW',generatedAtMs:NOW,lastTickerDataAtMs:NOW-1000,
    universe:rows,coverage:{covered:count,eligible:n,allocatedScanSlots:count,maxTracked:50}},
  home:{simulation:false,mode:'LIVE_SHADOW',home:[]},events:{simulation:false,mode:'LIVE_SHADOW',events:[]}};
}
const event=()=>({id:`PLAYUSDT:1m:${NOW-1000}:LONG_A`,symbol:'PLAYUSDT',timeframe:'1m',signal:'LONG_A',
 price:.05,binance24hChangePct:2,quoteVolume24h:20_000_000,barClosedAtMs:NOW-1000,
 expiresAtMs:NOW+299_000,firstSeenMs:NOW-500,homeExpiresMs:NOW+3_600_000});

test('saved healthy 47/47 and 50/65 pass contract without claiming full release acceptance',()=>{
 for(const n of [47,65]){
  const s=snapshot(n);s.home.home.push(event());s.events.events.push(event());
  const r=auditV2ApiContract(s);assert.equal(r.passed,true,JSON.stringify(r.failures));
  assert.equal(r.covered,Math.min(n,50));assert.ok(r.notVerified.includes('FOUR_TF_DEVICE_FCM_RECEIPT'));
 }
});
test('legacy response with missing turnover and impossible 50/47 fails readiness',()=>{
 const s=snapshot();for(const row of s.universe.universe)delete row.quoteVolume24h;
 delete s.status.allocatedScanSlots;delete s.universe.coverage.allocatedScanSlots;
 s.status.covered=50;s.status.coverageRatio=50/47;
 const r=auditV2ApiContract(s);assert.equal(r.passed,false);
 for(const code of ['UNIVERSE_STRICT_FILTER_OR_VOLUME_FAILED','STATUS_COVERAGE_COUNTS_INVALID','COVERAGE_RATIO_INVALID'])
  assert.ok(r.failures.includes(code),code);
});
test('healthy empty universe passes as 0/0 without requiring non-existent kline data',()=>{
 const s=snapshot(0);s.status.coverageRatio=0;s.status.lastKlineDataAtMs=0;
 const r=auditV2ApiContract(s);assert.equal(r.passed,true,JSON.stringify(r.failures));
 assert.equal(r.covered,0);assert.equal(r.eligible,0);
});
test('independent audit rejects strict boundaries even when the server says eligible',()=>{
 for(const patch of [{price:0},{price:10},{binance24hChangePct:1},{quoteVolume24h:10_000_000},{quoteVolume24h:'20000000'}]){
  const s=snapshot();Object.assign(s.universe.universe[0],patch);
  assert.ok(auditV2ApiContract(s).failures.includes('UNIVERSE_STRICT_FILTER_OR_VOLUME_FAILED'));
 }
});
test('HOME and polling must both carry volume, matching symbol identity and fresh event lifetime',()=>{
 const s=snapshot();s.home.home.push({...event(),quoteVolume24h:undefined});
 s.events.events.push({...event(),symbol:'FOGOUSDT',expiresAtMs:NOW-1});
 const r=auditV2ApiContract(s);
 for(const code of ['HOME_STRICT_FILTER_OR_VOLUME_FAILED','EVENTS_EVENT_IDENTITY_INVALID','EVENTS_NOT_DELIVERABLE'])
  assert.ok(r.failures.includes(code),code);
});
test('duplicate symbols, stale feed, open circuit and partial bootstrap cannot pass',()=>{
 const s=snapshot();s.universe.universe[1]={...s.universe.universe[0]};
 s.status.alertTimeframes=['5m','15m','1h'];
 s.status.requestGuard.circuitOpen=true;s.status.lastKlineDataAtMs=NOW-30_000;
 s.status.bootstrapInProgress=1;
 const r=auditV2ApiContract(s);
 for(const code of ['UNIVERSE_DUPLICATE_SYMBOL','BACKEND_NOT_HEALTHY','KLINE_FEED_NOT_FRESH','STEADY_COVERAGE_NOT_REACHED','DECLARED_ALERT_TIMEFRAMES_NOT_FOUR'])
  assert.ok(r.failures.includes(code),code);
});
test('missing input and snapshots with changed membership require recapture, never invented counts',()=>{
 assert.equal(auditV2ApiContract(null).passed,false);
 const s=snapshot();s.status.eligible=48;
 assert.ok(auditV2ApiContract(s).failures.includes('SNAPSHOT_COUNTS_CHANGED_RECAPTURE'));
 s.capturedAtMs=NOW+120_001;
 assert.ok(auditV2ApiContract(s).failures.includes('SNAPSHOT_TIME_NOT_COMPARABLE'));
});
test('audit consumes actual current HTTP API serialization, not just constructed happy responses',async()=>{
 const market=new YellowLiveMarket({dataDir:'/tmp/yellow-api-contract-no-write',clock:()=>NOW,wsClass:class{},
  guard:{metrics:()=>({circuitOpen:false})},log:()=>{}});
 market.isRunning=true;market.tickerConnected=true;market.klineConnected=true;
 market.lastTickerDataAtMs=NOW-1000;market.lastKlineDataAtMs=NOW-1000;
 market.exchangeSymbols.set('PLAYUSDT',{});
 market.recordTicker({symbol:'PLAYUSDT',status:'TRADING',contractType:'PERPETUAL',lastPrice:.05,
  priceChangePercent:2,quoteVolume24h:20_000_000,observedAtMs:NOW-1000});
 market.covered.set('PLAYUSDT',{});
 const server=createLiveApi(market);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const [status,universe,home,events]=await Promise.all(['/api/status','/api/universe','/api/home','/api/events'].map(async route=>{
   const response=await fetch(base+route);assert.equal(response.status,200);return response.json();
  }));
  const report=auditV2ApiContract({capturedAtMs:NOW,status,universe,home,events});
  assert.equal(report.passed,true,JSON.stringify(report.failures));
 }finally{await new Promise(resolve=>server.close(resolve));}
});
