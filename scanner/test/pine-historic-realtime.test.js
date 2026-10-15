import test from 'node:test';
import assert from 'node:assert/strict';
import {requestedContextEnd} from '../src/parallel-long-a.js';
import {makeSyntheticParallelDataset} from '../src/synthetic-candles.js';
import {replayParallelHistorical} from '../src/parallel-replay.js';
const H=Date.UTC(2026,9,15,11);

test('15m historical Pine lower-5m uses first intrabar [1], realtime uses last intrabar [1]',()=>{
  const end=H+15*60_000;
  assert.equal(requestedContextEnd(end,'15m','5m','PINE_HISTORICAL'),H);
  assert.equal(requestedContextEnd(end,'15m','5m','CAUSAL_REALTIME'),H+10*60_000);
  assert.equal(requestedContextEnd(end,'15m','15m','PINE_HISTORICAL'),H);
});
test('1h historical Pine lower TFs use first intrabar [1]; realtime is different',()=>{
  const end=H+60*60_000;
  assert.equal(requestedContextEnd(end,'1h','5m','PINE_HISTORICAL'),H);
  assert.equal(requestedContextEnd(end,'1h','15m','PINE_HISTORICAL'),H);
  assert.equal(requestedContextEnd(end,'1h','5m','CAUSAL_REALTIME'),H+55*60_000);
  assert.equal(requestedContextEnd(end,'1h','15m','CAUSAL_REALTIME'),H+45*60_000);
  assert.equal(requestedContextEnd(end,'1h','1h','CAUSAL_REALTIME'),H);
});
test('1m context is identical for realtime and historical, when higher TFs are requested',()=>{
  const end=H+8*60_000;
  for(const ctx of ['5m','15m','1h']){
    assert.equal(requestedContextEnd(end,'1m',ctx,'PINE_HISTORICAL'),
      requestedContextEnd(end,'1m',ctx,'CAUSAL_REALTIME'));
  }
});
test('historical lookahead mode is isolated and clearly labelled research, not a realtime claim',()=>{
  const d=makeSyntheticParallelDataset({scenario:'15m'});
  const historic=replayParallelHistorical(d,{contextMode:'PINE_HISTORICAL'});
  const realtime=replayParallelHistorical(d);
  assert.equal(historic.contextMode,'PINE_HISTORICAL');
  assert.equal(realtime.contextMode,'CAUSAL_REALTIME');
  assert.ok(historic.evaluated['15m']>0 && realtime.evaluated['15m']>0);
  assert.ok(historic.events.every(e=>e.status==='RESEARCH_ONLY'));
});
