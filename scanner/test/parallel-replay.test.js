import test from 'node:test';
import assert from 'node:assert/strict';
import {replayParallelHistorical} from '../src/parallel-replay.js';
const END=Date.UTC(2026,9,15,12);
const frames={oneMinute:60_000,fiveMinute:300_000,fifteenMinute:900_000,oneHour:3_600_000};
function dataset() {
  const data={symbol:'TESTUSDT'};
  for(const [key,period] of Object.entries(frames)) {
    const size=key==='oneMinute'?150:160;
    data[key]=Array.from({length:size},(_,i)=>({endMs:END-(size-i-1)*period,
      close:1+0.00005*i+0.0004*Math.sin(i*.37),volume:100}));
  }
  const allEnds=[...new Set(Object.values(frames).flatMap((_,i)=>data[Object.keys(frames)[i]].map(x=>x.endMs)))].sort((a,b)=>a-b);
  data.tickers=allEnds.map(at=>({symbol:'TESTUSDT',source:'BINANCE_USDM_FUTURES',contractType:'PERPETUAL',status:'TRADING',
    lastPrice:'1.05',priceChangePercent:'2.5',observedAtMs:at}));
  return data;
}
test('parallel replay counts each TF separately and does not invent live delivery',()=>{
  const r=replayParallelHistorical(dataset());
  assert.equal(r.mode,'OFFLINE_FOUR_TF_PARALLEL_REPLAY');
  assert.equal(r.evaluated['1m'],150);
  assert.equal(r.evaluated['5m'],160);
  assert.equal(r.evaluated['15m'],160);
  assert.equal(r.evaluated['1h'],160);
  assert.ok(r.validBars['1m']>0);
  assert.deepEqual(r.notificationIntents.filter(e=>e.status!=='OFFLINE_INTENT_ONLY'),[]);
  assert.equal(r.proofNote.includes('not live'),true);
});
test('parallel replay requires sorted as-of tickers and independent candle chronologies',()=>{
  const d=dataset(); d.tickers[2].observedAtMs=d.tickers[0].observedAtMs-1;
  assert.throws(()=>replayParallelHistorical(d),/NON_CHRONOLOGICAL_TICKERS/);
  const d2=dataset(); d2.fifteenMinute[20].endMs=d2.fifteenMinute[19].endMs;
  assert.throws(()=>replayParallelHistorical(d2),/NON_CHRONOLOGICAL_fifteenMinute/);
});
test('historical replay cannot use a future ticker to claim valid evaluation',()=>{
  const d=dataset(); d.tickers=[{symbol:d.symbol,source:'BINANCE_USDM_FUTURES',status:'TRADING',contractType:'PERPETUAL',
    lastPrice:'1.1',priceChangePercent:'8.4',observedAtMs:END+60_000}];
  const r=replayParallelHistorical(d);
  assert.equal(r.validBars['1m'],0);
  assert.equal(r.signalCounts['1m'],0);
  assert.ok(r.dataUnhealthy.some(x=>x.reason==='INVALID_BINANCE_USDM_24H_TICKER'));
});
