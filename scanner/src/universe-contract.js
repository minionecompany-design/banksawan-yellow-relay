import {PRODUCT_POLICY,productEligible} from './product-policy.js';
export const UNIVERSE_SCHEMA='yellow-universe-v1';
export const TICKER_MAX_AGE_MS=30_000;
/** Snapshot only: never fetches, subscribes, mutates episodes or caps eligibility. */
export function universeSnapshot(market){
  const now=market.clock(),rows=[];let missing=0,invalid=0,stale=0;
  const ready=market.isRunning&&!market.isHalted&&!market.wsRecovering&&market.tickerConnected&&
    market.lastTickerDataAtMs>0&&now-market.lastTickerDataAtMs<TICKER_MAX_AGE_MS&&market.lastTickerDataAtMs<=now+10_000;
  for(const [symbol,meta] of market.exchangeSymbols){
    if(!meta.marginAsset||!meta.quoteAsset||!meta.contractType||!meta.status){invalid++;continue;}
    if(meta.contractType!=='PERPETUAL'||meta.status!=='TRADING'||meta.quoteAsset!=='USDT'||meta.marginAsset!=='USDT')continue;
    const t=market.tickers.get(symbol);
    if(!t){missing++;continue;}
    if(!Number.isSafeInteger(t.observedAtMs)||t.observedAtMs>now+10_000||now-t.observedAtMs>=TICKER_MAX_AGE_MS){stale++;continue;}
    if(t.source!=='BINANCE_USDM_FUTURES'||![t.lastPrice,t.priceChangePercent,t.quoteVolume].every(Number.isFinite)||t.lastPrice<=0||t.quoteVolume<0){invalid++;continue;}
    if(!productEligible(t.lastPrice,t.priceChangePercent,t.quoteVolume))continue;
    rows.push({symbol,price:t.lastPrice,binance24hChangePct:t.priceChangePercent,quoteVolume24h:t.quoteVolume,
      source:t.source,contractType:meta.contractType,status:meta.status,quoteAsset:meta.quoteAsset,marginAsset:meta.marginAsset,
      tickerObservedAtMs:t.observedAtMs,stale:false,tracked:market.covered.has(symbol)});
  }
  rows.sort((a,b)=>b.binance24hChangePct-a.binance24hChangePct||a.symbol.localeCompare(b.symbol));
  const incomplete=missing+invalid+stale>0;
  const dataState=!ready||!market.exchangeSymbols.size?'DATA_UNAVAILABLE':incomplete?(rows.length?'PARTIAL':stale&&!missing&&!invalid?'STALE':'DATA_UNAVAILABLE'):'OK';
  const usable=dataState==='OK'||dataState==='PARTIAL';
  return {schemaVersion:UNIVERSE_SCHEMA,productPolicy:PRODUCT_POLICY,simulation:false,mode:'LIVE_SHADOW',
    generatedAtMs:now,lastTickerDataAtMs:market.lastTickerDataAtMs,dataState,
    reason:!ready?'FEED_NOT_READY':missing?'MISSING_TICKER':invalid?'INVALID_QUOTE_EVIDENCE':stale?'STALE_TICKER':!market.exchangeSymbols.size?'MISSING_METADATA':null,
    diagnostics:{missing,invalid,stale},universe:usable?rows:[],
    coverage:{eligible:usable?rows.length:null,covered:market.covered.size,maxTracked:market.maxTracked,
      trackedEligible:usable?rows.filter(r=>r.tracked).length:null}};
}
