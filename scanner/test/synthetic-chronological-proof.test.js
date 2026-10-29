import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSyntheticParallelDataset} from '../src/synthetic-candles.js';
import {replayParallelHistorical} from '../src/parallel-replay.js';
import {routeParallelIntents,newIntentState} from '../src/parallel-intents.js';
import {SETTINGS} from '../src/long-a.js';

// Unlike manual-state unit tests, every LONG A here must emerge from
// consecutive closed candles and initially EMPTY state across all four lanes.
test('chronological, same-feed 1m/5m/15m/1h reconstruction produces a genuine synthetic LONG A',()=>{
  const dataset=makeSyntheticParallelDataset();
  const r=replayParallelHistorical(dataset);
  assert.equal(r.mode,'OFFLINE_FOUR_TF_PARALLEL_REPLAY');
  assert.equal(r.signalCounts['1m'],1,'unexpected synthetic signal count');
  assert.equal(r.events[0].symbol,'TESTUSDT');
  assert.equal(r.events[0].timeframe,'1m');
  assert.equal(r.events[0].signal,'LONG_A');
  assert.equal(r.events[0].binance24hChangePct,2.5);
  assert.equal(r.notificationIntents.length,1);
  assert.ok(r.validBars['1m']>100);
  assert.ok(r.dataUnhealthy.length>0,'warmup must be counted separately');
  assert.equal(dataset.fiveMinute.length,1480);
  assert.equal(dataset.fifteenMinute.length,493);
  assert.equal(dataset.oneHour.length,123);
  for(const tf of ['fiveMinute','fifteenMinute','oneHour']){
    assert.ok(dataset[tf].every(c=>c.endMs%({fiveMinute:300_000,fifteenMinute:900_000,oneHour:3_600_000})[tf]===0));
  }
});

test('chronological synthetic run at 0.99% cannot trigger LONG A',()=>{
  const r=replayParallelHistorical(makeSyntheticParallelDataset({change24hPct:0.99}));
  assert.equal(r.events.length,0);
  assert.ok(r.reasons.BINANCE_24H_FILTER>0);
});

test('replaying twice is deterministic; another timeframe does not lengthen HOME lifetime',()=>{
  const d=makeSyntheticParallelDataset();
  const a=replayParallelHistorical(d),b=replayParallelHistorical(d);
  assert.deepEqual(a.events,b.events);
  const e=a.events[0],at=e.barClosedAtMs+5_000;
  const first=routeParallelIntents([e],at,newIntentState());
  const second=routeParallelIntents([{...e,timeframe:'15m',id:`${e.symbol}:15m:${e.barClosedAtMs}:LONG_A`}],at+1_000,first.state);
  assert.equal(second.state.home.length,1);
  assert.equal(second.state.home[0].homeExpiresMs,at+SETTINGS.homeRetentionMs);
  assert.equal(second.notificationIntents.length,1);
});

for(const scenario of ['1m','5m','15m','1h']){
  test(`true chronological state replay detects LONG A in ${scenario} lane without manual state`,()=>{
    const dataset=makeSyntheticParallelDataset({scenario});
    const r=replayParallelHistorical(dataset);
    assert.equal(r.signalCounts[scenario],1,`expected one LONG A in ${scenario}: ${JSON.stringify(r.signalCounts)}`);
    const event=r.events.find(e=>e.timeframe===scenario);
    assert.ok(event);
    assert.equal(event.status,'RESEARCH_ONLY');
    assert.equal(event.binance24hChangePct,2.5);
    assert.equal(r.notificationIntents.find(e=>e.eventId===event.id)?.status,'OFFLINE_INTENT_ONLY');
    assert.ok(r.validBars[scenario]>0);
    // The generated 5m/15m/1h closes are snapshots of the exact same 1m feed.
    for(const [key,span] of [['fiveMinute',300_000],['fifteenMinute',900_000],['oneHour',3_600_000]]){
      const minute=atasetFix(dataset.oneMinute,span,event.barClosedAtMs);
      if(minute)assert.equal(dataset[key].find(b=>b.endMs===minute.endMs)?.close,minute.close);
    }
  });
}
function atasetFix(oneMinute,span,target){
  const completed=oneMinute.filter(c=>c.endMs<=target && c.endMs%span===0).at(-1);
  return completed||null;
}
