import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
import {stepLongAOnTimeframe,newParallelState,requestedContextEnd,PERIODS} from '../src/parallel-long-a.js';
const keys={'1m':'oneMinute','5m':'fiveMinute','15m':'fifteenMinute','1h':'oneHour'};
for(const name of ['apr','btr','useless'])test(`historical ${name} candles: future MTF mutation cannot alter any lane decision (eligibility ticker is a test stub)`,async()=>{
 const d=JSON.parse(gunzipSync(await readFile(new URL(`../../test/fixtures/${name}.json.gz`,import.meta.url))));
 const series=Object.fromEntries(Object.entries(d.tf).map(([tf,bars])=>[tf,bars.map(b=>({endMs:b.closeTime+1,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume}))]));
 for(const tf of Object.keys(keys)){
  const end=series[tf].at(-3).endMs;
  const input={nowMs:end,ticker24h:{symbol:d.symbol,source:'BINANCE_USDM_FUTURES',contractType:'PERPETUAL',status:'TRADING',lastPrice:series[tf].at(-3).close,priceChangePercent:5,observedAtMs:end-1000}};
  for(const [ctf,key] of Object.entries(keys))input[key]=series[ctf].filter(b=>b.endMs<=end);
  const contexts={};
  for(const ctf of ['5m','15m','1h']){
   const cutoff=requestedContextEnd(end,tf,ctf);
   contexts[ctf]=[...series[ctf],{endMs:end+PERIODS[ctf],close:999999,volume:999999}].map(b=>b.endMs>cutoff?{...b,close:999999,volume:999999}:b);
  }
  const baseline=stepLongAOnTimeframe(d.symbol,tf,input,newParallelState()[tf]);
  const mutated=stepLongAOnTimeframe(d.symbol,tf,{...input,contexts},newParallelState()[tf]);
  assert.ok(baseline.diagnostics,`fixture must reach real evaluator: ${baseline.reason}`);
  assert.deepEqual(mutated,baseline);
 }
});
