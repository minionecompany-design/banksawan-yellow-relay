/**
 * Generates an auditable OFFLINE synthetic 4-lane proof, no network or trades.
 * All scenarios have one 1m source and deterministic 5m/15m/1h aggregation.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeSyntheticParallelDataset} from '../src/synthetic-candles.js';
import {replayParallelHistorical} from '../src/parallel-replay.js';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const out=path.join(root,'docs','PROOF_FOUR_TF_SYNTHETIC.json');
const proof={title:'BANKSAWAN YELLOW V2 four-lane replay proof',version:3,
 dataOrigin:'DETERMINISTIC_SYNTHETIC_CANDLES — NOT BINANCE MARKET DATA',
 sourceOf24hPct:'MOCK_BINANCE_USDM_TICKER — 2.5% IN ALL POSITIVE SCENARIOS',
 contextMode:'CAUSAL_REALTIME',
 proofScope:'Candle-to-LongA-to-offline notification intent, initial empty state',
 notProven:['TradingView/Pine real historical parity','live Binance data reliability',
   'FCM delivery','Android install','trading profitability','production READY'],
 scenarios:[]};
for(const timeframe of ['1m','5m','15m','1h']){
  const data=makeSyntheticParallelDataset({scenario:timeframe});
  const result=replayParallelHistorical(data);
  const contrast=replayParallelHistorical(data,{contextMode:'PINE_HISTORICAL'});
  const event=result.events.find(e=>e.timeframe===timeframe);
  if(!event||result.signalCounts[timeframe]!==1||
     !result.notificationIntents.some(e=>e.eventId===event.id))
    throw new Error(`PROOF_FAILED_${timeframe}`);
  proof.scenarios.push({expectedTimeframe:timeframe,
    minutesOfSynthetic1mHistory:data.oneMinute.length,
    completedCandles:Object.fromEntries(['oneMinute','fiveMinute','fifteenMinute','oneHour']
      .map(k=>[k,data[k].length])),
    positiveLongA:event,
    positiveLongAUtc:new Date(event.barClosedAtMs).toISOString(),
    signalCounts:result.signalCounts,
    selectedNotificationIntent:result.notificationIntents.find(e=>e.eventId===event.id),
    warmupOrDataNotReadyEvents:result.dataUnhealthy.length,
    validEvaluations:result.validBars,
    pineHistoricalComparison:{signalCounts:contrast.signalCounts,
      note:'Offline theoretical mode; NOT a TradingView parity result'}
  });
}
const rejected=replayParallelHistorical(makeSyntheticParallelDataset({change24hPct:0.99}));
if(rejected.events.length!==0)throw new Error('NEGATIVE_FILTER_PROOF_FAILED');
proof.negativeFilter={binance24hChangePct:0.99,longAEvents:rejected.events.length,
 blockedByBinance24hFilter:rejected.reasons.BINANCE_24H_FILTER};
await mkdir(path.dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(proof,null,2)+'\n');
console.log(`SYNTHETIC OFFLINE PROOF PASS 4/4 LANES; 0.99% NEGATIVE PASS; ${out}`);
for(const s of proof.scenarios)console.log(`${s.expectedTimeframe} LONG_A ${s.positiveLongAUtc} eventId=${s.positiveLongA.id}`);
