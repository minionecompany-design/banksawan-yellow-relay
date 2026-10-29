/**
 * Causal offline replay from caller-supplied historical Binance USD-M candles.
 * Requires AS-OF 24h ticker snapshots (NOT the latest 24h ticker, which would
 * leak knowledge of the future). No network calls or state mutation elsewhere.
 * The input has independent, contiguous closed-candle arrays for 1m,5m,15m,1h.
 */
import {newSymbolState,stepLongA} from './long-a.js';
const PERIODS={fiveMinute:300_000,fifteenMinute:900_000,oneHour:3_600_000};
const cutoff=(end,ms)=>Math.floor((end-1)/ms)*ms;
const unhealthy=new Set(['INSUFFICIENT_COMPLETE_CANDLES','INSUFFICIENT_OR_GAPPED_CANDLES',
 '1M_DATA_GAP_REBOOTSTRAP_REQUIRED','OPEN_OR_FUTURE_1M_CANDLE','STALE_BINANCE_TICKER',
 'INVALID_BINANCE_USDM_24H_TICKER']);

/**
 * @param {object} dataset {symbol,oneMinute,fiveMinute,fifteenMinute,oneHour,tickers}
 * Each ticker item includes observedAtMs, source, contractType, and Binance 24h fields.
 * @returns {object} aggregated event and reject summaries, not profitability.
 */
export function replayHistorical(dataset) {
  if(!dataset || !/^[A-Z0-9]{1,25}USDT$/.test(dataset.symbol||''))
    throw new Error('SYMBOL_REQUIRED');
  if(!Array.isArray(dataset.oneMinute)||!Array.isArray(dataset.tickers))
    throw new Error('HISTORICAL_CANDLES_AND_TICKERS_REQUIRED');
  for(const key of Object.keys(PERIODS))if(!Array.isArray(dataset[key]))
    throw new Error('MISSING_'+key);
  const a=dataset.oneMinute,b=dataset.tickers;
  for(let i=1;i<a.length;i++)if(a[i].endMs<=a[i-1].endMs)
    throw new Error('NON_CHRONOLOGICAL_1M');
  for(let i=1;i<b.length;i++)if(b[i].observedAtMs<b[i-1].observedAtMs)
    throw new Error('NON_CHRONOLOGICAL_TICKERS');
  let state=newSymbolState(),lastTickerIndex=-1;
  const summary={symbol:dataset.symbol,mode:'OFFLINE_CAUSAL_REPLAY',
    totalEvaluated:0,validEvaluationBars:0,blockedByFilter:0,
    signalCounts:{LONG_A:0,PROTECT:0,LONG_B:0,OUT_FINAL:0},
    events:[],dataUnhealthy:[],reasons:{},
    proofNote:'No real-time data; no outcome or TradingView parity implied'};
  for(let i=111;i<a.length;i++) {
    const at=a[i].endMs;
    while(lastTickerIndex+1<b.length && b[lastTickerIndex+1].observedAtMs<=at)
      lastTickerIndex++;
    const asofTicker=lastTickerIndex<0?null:b[lastTickerIndex];
    const snapshot={oneMinute:a.slice(Math.max(0,i-149),i+1),
      ticker24h:asofTicker,nowMs:at};
    for(const [key,tfMs] of Object.entries(PERIODS)){
      const stop=cutoff(at,tfMs);
      // Binary search first future candle, maintaining chronology.
      const candles=dataset[key];let low=0,high=candles.length;
      while(low<high){const mid=(low+high)>>1;if(candles[mid].endMs<=stop)low=mid+1;else high=mid;}
      snapshot[key]=candles.slice(Math.max(0,low-129),low);
    }
    const r=stepLongA(dataset.symbol,snapshot,state);
    summary.totalEvaluated++;
    summary.reasons[r.reason||'SIGNAL']=(summary.reasons[r.reason||'SIGNAL']||0)+1;
    if(r.reason==='BINANCE_24H_FILTER')summary.blockedByFilter++;
    if(unhealthy.has(r.reason)||r.reason?.startsWith('MTF_NOT_PREVIOUS_')){
      summary.dataUnhealthy.push({timeMs:at,reason:r.reason});
    } else summary.validEvaluationBars++;
    if(r.event){summary.signalCounts[r.event.signal]++;summary.events.push(r.event)}
    state=r.state;
  }
  return summary;
}
