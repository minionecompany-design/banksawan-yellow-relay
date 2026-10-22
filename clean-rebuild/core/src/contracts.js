import {POLICY,screenedUniverse} from './product-policy.js';
export const SCHEMA='yellow-clean-v1';
export function universeSnapshot(rows,trackedSymbols,now){
 if(!Number.isSafeInteger(now)||now<=0)throw Error('INVALID_SNAPSHOT_TIME');
 const eligible=screenedUniverse(rows);
 const tracked=new Set(trackedSymbols);
 if(tracked.size>POLICY.maxTracked)throw Error('TOO_MANY_TRACKED');
 return {schemaVersion:SCHEMA,mode:'OFFLINE_RESEARCH',dataState:'OK',generatedAtMs:now,
  productPolicy:{maxPriceExclusive:10,minChangeInclusive:1,minQuoteVolumeExclusive:10_000_000},
  coverage:{eligible:eligible.length,covered:tracked.size,maxTracked:50,trackedEligible:eligible.filter(x=>tracked.has(x.symbol)).length},
  universe:eligible.map(x=>({symbol:x.symbol,price:x.price,binance24hChangePct:x.change24hPct,
   quoteVolume24h:x.quoteVolume24h,tracked:tracked.has(x.symbol)}))};
}
export function unavailableSnapshot(reason,now){
 if(!['STALE','DATA_UNAVAILABLE','SOURCE_UNAUTHORIZED','NO_FEED'].includes(reason))throw Error('INVALID_UNAVAILABLE_REASON');
 return {schemaVersion:SCHEMA,mode:'OFFLINE_RESEARCH',dataState:'UNAVAILABLE',reason,generatedAtMs:now,
  coverage:{eligible:null,covered:0,maxTracked:50},universe:[]};
}
