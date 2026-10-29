import test from 'node:test';
import assert from 'node:assert/strict';
import {replayHistorical} from '../src/replay.js';
const M=60_000,END=Date.UTC(2026,9,15,10,37);
const prev=(t,ms)=>Math.floor((t-1)/ms)*ms;
const series=(n,ms,end,close=1.05)=>Array.from({length:n},(_,i)=>({
  endMs:end-(n-1-i)*ms,close,volume:100}));
const bundle=()=>({symbol:'TESTUSDT',oneMinute:series(125,M,END),
  fiveMinute:series(140,5*M,prev(END,5*M)),
  fifteenMinute:series(140,15*M,prev(END,15*M)),
  oneHour:series(140,60*M,prev(END,60*M)),
  tickers:[{symbol:'TESTUSDT',source:'BINANCE_USDM_FUTURES',contractType:'PERPETUAL',
    lastPrice:'1.05',priceChangePercent:'2.3',observedAtMs:END-40*M}]
});
test('replay does not use a stale future/current ticker to invent LONG A',()=>{
 const s=replayHistorical(bundle());
 assert.equal(s.totalEvaluated,14);
 assert.equal(s.signalCounts.LONG_A,0);
 assert.ok(s.dataUnhealthy.length>0);
 assert.equal(s.mode,'OFFLINE_CAUSAL_REPLAY');
});
test('replay demands as-of ticker chronology and historical inputs',()=>{
 const d=bundle();d.tickers=[{observedAtMs:END},{observedAtMs:END-M}];
 assert.throws(()=>replayHistorical(d),/NON_CHRONOLOGICAL_TICKERS/);
 delete d.tickers;assert.throws(()=>replayHistorical(d),/HISTORICAL_CANDLES/);
});
