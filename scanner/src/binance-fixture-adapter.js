/**
 * BANKSAWAN YELLOW — OFFLINE Binance USD-M fixture adapter.
 * No fetch(), network calls, account credentials, orders or timestamps invented.
 * Accepts saved Binance /fapi/v1/klines arrays and separately recorded as-of
 * Binance /fapi/v1/ticker/24hr snapshots; refuses present-day ticker hindsight.
 */
import {PERIODS} from './parallel-long-a.js';

const positive = x => Number.isFinite(x) && x > 0;
const nonnegative = x => Number.isFinite(x) && x >= 0;
const allowed = new Set(Object.keys(PERIODS));
const requireObject = (v,code) => {if(!v||typeof v!=='object'||Array.isArray(v))throw new Error(code);};

export function normalizeBinanceKlines(rows,interval,{asOfMs}={}) {
  if(!allowed.has(interval))throw new Error('INVALID_KLINE_INTERVAL');
  if(!Array.isArray(rows)||!rows.length)throw new Error('KLINES_REQUIRED');
  if(!Number.isSafeInteger(asOfMs)||asOfMs<=0)throw new Error('AS_OF_TIME_REQUIRED');
  const span=PERIODS[interval],out=[];
  for(const [index,row] of rows.entries()){
    if(!Array.isArray(row)||row.length<11)throw new Error(`KLINE_SCHEMA_${index}`);
    const openMs=Number(row[0]),closeTime=Number(row[6]);
    const open=Number(row[1]),high=Number(row[2]),low=Number(row[3]),close=Number(row[4]);
    const volume=Number(row[5]),quoteVolume=Number(row[7]),trades=Number(row[8]);
    const takerBuyBase=Number(row[9]),takerBuyQuote=Number(row[10]);
    if(!Number.isSafeInteger(openMs)||openMs<=0||openMs%span!==0||
       !Number.isSafeInteger(closeTime)||closeTime!==openMs+span-1)
      throw new Error(`KLINE_CLOSING_TIME_INVALID_${index}`);
    const endMs=closeTime+1;
    if(endMs>asOfMs)throw new Error(`KLINE_NOT_YET_CLOSED_${index}`);
    if(![open,high,low,close].every(positive)||high<Math.max(open,close)||
       low>Math.min(open,close)||low>high||
       ![volume,quoteVolume,trades,takerBuyBase,takerBuyQuote].every(nonnegative)||
       takerBuyBase>volume+1e-9||takerBuyQuote>quoteVolume+1e-6)
      throw new Error(`KLINE_OHLCV_INVALID_${index}`);
    if(out.length&&openMs!==out.at(-1).endMs)
      throw new Error(`KLINE_GAP_DUPLICATE_OR_ORDER_${index}`);
    out.push({endMs,open,high,low,close,volume,quoteVolume,trades,takerBuyBase,takerBuyQuote});
  }
  return out;
}

export function normalizeBinanceTicker({symbol,ticker,exchangeSymbol,observedAtMs}) {
  if(typeof symbol!=='string'||!/^[A-Z0-9]{2,25}USDT$/.test(symbol))
    throw new Error('INVALID_SYMBOL');
  requireObject(ticker,'TICKER_REQUIRED');
  requireObject(exchangeSymbol,'EXCHANGE_INFO_REQUIRED');
  if(exchangeSymbol.symbol!==symbol||exchangeSymbol.contractType!=='PERPETUAL'||
     exchangeSymbol.status!=='TRADING'||exchangeSymbol.quoteAsset!=='USDT'||
     ticker.symbol!==symbol)throw new Error('NOT_ACTIVE_BINANCE_USDM_PERPETUAL');
  if(!Number.isSafeInteger(observedAtMs)||observedAtMs<=0)
    throw new Error('TICKER_OBSERVATION_TIMESTAMP_REQUIRED');
  const price=Number(ticker.lastPrice),percent=Number(ticker.priceChangePercent);
  if(!positive(price)||!Number.isFinite(percent))throw new Error('TICKER_NUMBERS_INVALID');
  return {symbol,source:'BINANCE_USDM_FUTURES',contractType:'PERPETUAL',status:'TRADING',
    observedAtMs,lastPrice:price,priceChangePercent:percent};
}

/**
 * Compare native higher TF candles against a complete set of saved 1M bars.
 * A partial edge bucket is ignored rather than mistaken for a mismatch.
 * Missing minute candles INSIDE a fully covered bucket fail closed.
 */
export function verifyMultiTimeframeConsistency(dataset,{priceTolerance=1e-9,volumeTolerance=1e-6}={}){
  requireObject(dataset,'DATASET_REQUIRED');
  if(!Array.isArray(dataset.oneMinute)||!dataset.oneMinute.length)
    throw new Error('ONE_MINUTE_REQUIRED');
  const minute=dataset.oneMinute;
  for(let i=1;i<minute.length;i++)if(minute[i].endMs-minute[i-1].endMs!==PERIODS['1m'])
    throw new Error('ONE_MINUTE_GAP');
  const first=minute[0].endMs,last=minute.at(-1).endMs;
  let tested=0,edgeSkipped=0;
  for(const [tf,key] of [['5m','fiveMinute'],['15m','fifteenMinute'],['1h','oneHour']]){
    const span=PERIODS[tf],count=span/PERIODS['1m'];
    if(!Array.isArray(dataset[key]))throw new Error(`MISSING_${key}`);
    for(const bar of dataset[key]){
      const start=bar.endMs-span+PERIODS['1m'];
      if(start<first||bar.endMs>last){edgeSkipped++;continue;}
      const startIndex=(start-first)/PERIODS['1m'];
      if(!Number.isInteger(startIndex)||startIndex<0)throw new Error(`MISALIGNED_${key}`);
      const parts=minute.slice(startIndex,startIndex+count);
      if(parts.length!==count||parts.at(-1).endMs!==bar.endMs)
        throw new Error(`INCOMPLETE_BUCKET_${key}`);
      const expected={close:parts.at(-1).close,open:parts[0].open,
        high:Math.max(...parts.map(x=>x.high)),low:Math.min(...parts.map(x=>x.low)),
        volume:parts.reduce((s,x)=>s+x.volume,0)};
      for(const [field,v] of Object.entries(expected)){
        if(!Number.isFinite(bar[field]))continue; // old close+volume-only fixtures
        const tol=field==='volume'?volumeTolerance:priceTolerance;
        if(Math.abs(v-bar[field])>tol*Math.max(1,Math.abs(v)))
          throw new Error(`MTF_${key}_${field.toUpperCase()}_MISMATCH`);
      }
      tested++;
    }
  }
  return {matchedCompletedBuckets:tested,partialEdgeBucketsSkipped:edgeSkipped,status:'CONSISTENT_WITH_CACHED_1M'};
}

/**
 * Build replay input from OFFLINE artifacts only. Every ticker must carry its
 * separately recorded observedAtMs; absence is a blocker, not a synthetic fix.
 */
export function normalizeRecordedBinanceBundle({symbol,klines,exchangeSymbol,tickerSnapshots,asOfMs}) {
  requireObject(klines,'KLINES_BUNDLE_REQUIRED');
  if(!Array.isArray(tickerSnapshots)||!tickerSnapshots.length)
    throw new Error('HISTORICAL_AS_OF_TICKER_SNAPSHOTS_REQUIRED');
  const dataset={symbol};
  for(const [tf,key] of [['1m','oneMinute'],['5m','fiveMinute'],['15m','fifteenMinute'],['1h','oneHour']])
    dataset[key]=normalizeBinanceKlines(klines[tf],tf,{asOfMs});
  dataset.tickers=tickerSnapshots.map((record,i)=>{
    const out=normalizeBinanceTicker({symbol,ticker:record.ticker,exchangeSymbol,observedAtMs:record.observedAtMs});
    if(out.observedAtMs>asOfMs)throw new Error(`FUTURE_TICKER_${i}`);
    if(i&&out.observedAtMs<dataset.tickers[i-1].observedAtMs)
      throw new Error('TICKERS_OUT_OF_ORDER');
    return out;
  });
  dataset.provenance={origin:'USER_SUPPLIED_SAVED_BINANCE_KLINES_AND_HISTORICAL_TICKERS',
    asOfMs,networkRequests:0};
  dataset.consistency=verifyMultiTimeframeConsistency(dataset);
  return dataset;
}
