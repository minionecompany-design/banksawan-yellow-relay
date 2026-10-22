import {SCHEMA,universeSnapshot,unavailableSnapshot} from './contracts.js';
import {POLICY} from './product-policy.js';
const FRAME=new Set(POLICY.notificationTimeframes);
function validSymbol(s){return typeof s==='string'&&/^[A-Z0-9]{2,25}USDT$/.test(s);}
export function tradingViewUrl(symbol){
 if(!validSymbol(symbol))throw Error('INVALID_TV_SYMBOL');
 return 'https://www.tradingview.com/chart/?symbol='+encodeURIComponent('BINANCE:'+symbol+'.P');
}
export function homeSnapshot(events,now,{dataState='OK',reason=null}={}){
 if(!Number.isSafeInteger(now)||now<=0)throw Error('INVALID_TIME');
 if(dataState!=='OK'){
  if(!['STALE','DATA_UNAVAILABLE','SOURCE_UNAUTHORIZED','NO_FEED'].includes(reason))throw Error('INVALID_UNAVAILABLE_REASON');
  return {schemaVersion:SCHEMA,mode:'OFFLINE_RESEARCH',dataState:'UNAVAILABLE',reason,generatedAtMs:now,events:[],count:null};
 }
 if(!Array.isArray(events))throw Error('EVENT_ARRAY_REQUIRED');
 const accepted=new Map();
 for(const e of events){
  if(e?.signal!=='LONG_A'||!FRAME.has(e.timeframe)||!validSymbol(e.symbol)||
   !Number.isSafeInteger(e.barClosedAtMs)||e.barClosedAtMs<=0||
   e.id!==e.symbol+':'+e.timeframe+':'+e.barClosedAtMs+':LONG_A')continue;
  const item={id:e.id,symbol:e.symbol,signal:'LONG_A',timeframe:e.timeframe,
   barClosedAtMs:e.barClosedAtMs,tradingViewUrl:tradingViewUrl(e.symbol)};
  accepted.set(e.id,item);
 }
 const items=[...accepted.values()].sort((a,b)=>b.barClosedAtMs-a.barClosedAtMs||a.id.localeCompare(b.id));
 return {schemaVersion:SCHEMA,mode:'OFFLINE_RESEARCH',dataState:'OK',generatedAtMs:now,count:items.length,events:items};
}
export function cleanApiSnapshot({rows,trackedSymbols,events,now,sourceStatus='OK'}={}){
 if(sourceStatus!=='OK')return {
  universe:unavailableSnapshot(sourceStatus,now),
  home:homeSnapshot([],now,{dataState:'UNAVAILABLE',reason:sourceStatus})};
 return {universe:universeSnapshot(rows,trackedSymbols,now),home:homeSnapshot(events,now)};
}
