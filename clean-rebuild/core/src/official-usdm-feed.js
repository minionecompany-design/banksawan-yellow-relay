import {screenedUniverse} from './product-policy.js';
/**
 * Pure offline adapter for two documented *official global USD-M futures*
 * response shapes. This module performs NO HTTP calls and has no credentials.
 *
 * Only an explicitly authorized source may supply values. Feed outage,
 * stale/partial data, duplicates and identity mismatch produce UNAVAILABLE,
 * NEVER a misleading zero-symbol eligible universe.
 */
export const OFFICIAL_USDM_PATHS=Object.freeze({
 exchangeInfo:'/fapi/v1/exchangeInfo',ticker24h:'/fapi/v1/ticker/24hr'
});
const NAME=/^[A-Z0-9]{2,25}USDT$/;
const decimal=n=>typeof n==='string'&&/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(n)&&Number.isFinite(Number(n))?Number(n):null;
const safeMs=n=>Number.isSafeInteger(n)&&n>0;
const unavailable=(reason,details)=>Object.freeze({
 dataState:'UNAVAILABLE',reason,details,rows:[],eligible:null,verifiedSymbols:null
});
function invalid(msg){throw Error(msg);}
function identityIsOfficial(meta){
 return meta?.venue==='BINANCE_GLOBAL_USDM'&&meta.exchangeInfoPath===OFFICIAL_USDM_PATHS.exchangeInfo&&
  meta.ticker24hPath===OFFICIAL_USDM_PATHS.ticker24h;
}
/** Caller has to prove legal entitlement separately; a flag is not legal proof. */
export function normalizeOfficialUsdmSnapshot({
 exchangeInfo,ticker24h,source,accessAuthorized=false,receivedAtMs,nowMs
}={}){
 if(!accessAuthorized)return unavailable('SOURCE_UNAUTHORIZED','AUTHORIZATION_REQUIRED');
 if(!identityIsOfficial(source))return unavailable('DATA_UNAVAILABLE','INVALID_SOURCE_IDENTITY');
 if(!safeMs(receivedAtMs)||!safeMs(nowMs)||receivedAtMs>nowMs+5000||
   nowMs-receivedAtMs>90_000)return unavailable('STALE','RECEIPT_TOO_OLD');
 if(!Array.isArray(exchangeInfo?.symbols)||!Array.isArray(ticker24h)||
    exchangeInfo.symbols.length===0||ticker24h.length===0)
  return unavailable('DATA_UNAVAILABLE','INCOMPLETE_OFFICIAL_SNAPSHOT');
 try{
  const futures=new Map(),seenMetadata=new Set(),tickers=new Map();
  for(const item of exchangeInfo.symbols){
   if(typeof item?.symbol!=='string'||seenMetadata.has(item.symbol))
    invalid('DUPLICATE_OR_MALFORMED_EXCHANGE_SYMBOL');
   seenMetadata.add(item.symbol);
   if(item.quoteAsset==='USDT'&&item.contractType==='PERPETUAL'&&
      item.status==='TRADING'&&NAME.test(item.symbol)){
    if(item.pair!==undefined&&item.pair!==item.symbol)invalid('MISMATCHED_USDM_PAIR');
    futures.set(item.symbol,item);
   }
  }
  for(const ticker of ticker24h){
   if(typeof ticker?.symbol!=='string'||tickers.has(ticker.symbol))
    invalid('DUPLICATE_OR_MALFORMED_TICKER');
   tickers.set(ticker.symbol,ticker);
  }
  // All actively tradable USD-M perpetual symbols must be accounted for; if
  // even one is missing we cannot represent the scan as complete and fresh.
  const rows=[];
  for(const [symbol,meta] of futures){
   const t=tickers.get(symbol);
   if(!t)invalid('INCOMPLETE_USDM_TICKER_COVERAGE');
   const close=t.closeTime;
   if(!safeMs(close)||close>receivedAtMs+5000||
      receivedAtMs-close>120_000)invalid('STALE_USDM_TICKER');
   const price=decimal(t.lastPrice),change=decimal(t.priceChangePercent),
     quoteVolume=decimal(t.quoteVolume);
   if(price===null||change===null||quoteVolume===null||price<0||quoteVolume<0)
    invalid('MALFORMED_24H_TICKER');
   rows.push({symbol,quoteAsset:meta.quoteAsset,
    contractType:meta.contractType,status:meta.status,price,
    change24hPct:change,quoteVolume24h:quoteVolume,
    quoteVolumeSource:'OFFICIAL_USDM_QUOTE_24H'});
  }
  return Object.freeze({dataState:'OK',reason:null,details:null,rows,
    eligible:screenedUniverse(rows).length,verifiedSymbols:rows.length});
 }catch(e){
  return unavailable('DATA_UNAVAILABLE',e.message);
 }
}
