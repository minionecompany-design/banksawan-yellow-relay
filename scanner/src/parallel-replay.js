/**
 * Chronological, offline replay of FOUR PARALLEL LONG A lanes.
 * Every target timeframe emits events independently. Context MTF indicators
 * still apply within each lane; there is no ordered TF-signal handoff.
 *
 * Requires actual, as-of Binance 24h ticker snapshots in the dataset.
 * NEVER substitutes present-day 24h changes for a historical candle.
 * Does not perform network requests or deliver notifications.
 */
import {newParallelState,stepLongAOnTimeframe,TIMEFRAMES,PERIODS} from './parallel-long-a.js';
import {newIntentState,routeParallelIntents} from './parallel-intents.js';
const keys={'1m':'oneMinute','5m':'fiveMinute','15m':'fifteenMinute','1h':'oneHour'};
const reasonsMissingData=new Set(['TARGET_CANDLES_MISSING','TARGET_CANDLES_GAPPED_OR_INSUFFICIENT',
  'OPEN_OR_FUTURE_TARGET_CANDLE','STALE_BINANCE_TICKER','INVALID_BINANCE_USDM_24H_TICKER',
  'TARGET_DATA_GAP_REBOOTSTRAP_REQUIRED']);
function validateChronology(array,label,step){
  if(!Array.isArray(array))throw new Error(`MISSING_${label}`);
  for(let i=0;i<array.length;i++){
    const b=array[i];
    if(!Number.isFinite(b?.endMs)||b.endMs%step!==0)throw new Error(`INVALID_${label}_CANDLE`);
    if(i && b.endMs<=array[i-1].endMs)throw new Error(`NON_CHRONOLOGICAL_${label}`);
  }
}
function prefixAt(items,t,field){
  let lo=0,hi=items.length;
  while(lo<hi){const m=(lo+hi)>>1;if(items[m][field]<=t)lo=m+1;else hi=m;}
  return items.slice(Math.max(0,lo-150),lo);
}
function reasonDataUnhealthy(reason){
  return reasonsMissingData.has(reason)||reason?.startsWith('CONTEXT_')||reason==='INPUT_REQUIRED';
}
/**
 * dataset: {symbol, oneMinute, fiveMinute, fifteenMinute, oneHour, tickers}
 * ticker snapshot fields: source, contractType, status, observedAtMs,
 * priceChangePercent, lastPrice, symbol.
 */
export function replayParallelHistorical(dataset,{contextMode='CAUSAL_REALTIME'}={}){
  if(!dataset||!/^[A-Z0-9]{1,25}USDT$/.test(dataset.symbol||''))throw new Error('SYMBOL_REQUIRED');
  for(const tf of TIMEFRAMES)validateChronology(dataset[keys[tf]],keys[tf],PERIODS[tf]);
  if(!Array.isArray(dataset.tickers))throw new Error('TICKERS_REQUIRED');
  for(let i=0;i<dataset.tickers.length;i++){
    const ts=dataset.tickers[i]?.observedAtMs;
    if(!Number.isFinite(ts)||(i && ts<dataset.tickers[i-1].observedAtMs))
      throw new Error('NON_CHRONOLOGICAL_TICKERS');
  }
  const times=[...new Set(TIMEFRAMES.flatMap(tf=>dataset[keys[tf]].map(x=>x.endMs)))].sort((a,b)=>a-b);
  const states=newParallelState();let intentState=newIntentState();
  const summary={symbol:dataset.symbol,mode:'OFFLINE_FOUR_TF_PARALLEL_REPLAY',contextMode,
    evaluated:{'1m':0,'5m':0,'15m':0,'1h':0},
    validBars:{'1m':0,'5m':0,'15m':0,'1h':0},
    signalCounts:{'1m':0,'5m':0,'15m':0,'1h':0},
    events:[],notificationIntents:[],dataUnhealthy:[],reasons:{},
    proofNote:'Offline replay only; not live detection, TradingView parity or trading outcome'};
  for(const time of times){
    // Ticker at or BEFORE target close; no future 24h statistics are used.
    const tickerIndex=(()=>{let lo=0,hi=dataset.tickers.length;while(lo<hi){const mid=(lo+hi)>>1;
      if(dataset.tickers[mid].observedAtMs<=time)lo=mid+1;else hi=mid;}return lo-1;})();
    const input={nowMs:time,contextMode,ticker24h:tickerIndex>=0?dataset.tickers[tickerIndex]:null};
    for(const tf of TIMEFRAMES)input[keys[tf]]=prefixAt(dataset[keys[tf]],time,'endMs');
    for(const tf of TIMEFRAMES){
      if(input[keys[tf]].at(-1)?.endMs!==time)continue;
      const result=stepLongAOnTimeframe(dataset.symbol,tf,input,states[tf]);
      states[tf]=result.state;
      summary.evaluated[tf]++;
      summary.reasons[result.reason||result.event?.signal||'UNKNOWN']=(summary.reasons[result.reason||result.event?.signal||'UNKNOWN']||0)+1;
      if(reasonDataUnhealthy(result.reason)){
        summary.dataUnhealthy.push({timeMs:time,timeframe:tf,reason:result.reason});
      }else summary.validBars[tf]++;
      if(result.event?.signal==='LONG_A'){
        summary.signalCounts[tf]++;
        summary.events.push(result.event);
        // A production system must atomically persist claims; this is an offline stand-in.
        const routed=routeParallelIntents([result.event],time,intentState);
        intentState=routed.state;
        summary.notificationIntents.push(...routed.notificationIntents);
      }
    }
  }
  summary.homeAtEnd=intentState.home.filter(x=>x.homeExpiresMs>times.at(-1));
  return summary;
}
