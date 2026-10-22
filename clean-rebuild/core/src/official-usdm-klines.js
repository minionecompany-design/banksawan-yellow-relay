import {FRAME_MS,validatedBars} from './indicators.js';
const sym=/^[A-Z0-9]{2,25}USDT$/;
const decimal=x=>typeof x==='string'&&/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(x)&&Number.isFinite(Number(x))?Number(x):null;
const failure=(reason,detail)=>({dataState:'UNAVAILABLE',reason,detail,bars:[],lastClosedAtMs:null});
/** Pure official USDM /fapi/v1/klines tuple parser. NO calls to Binance.
 * The /fapi/v1/klines endpoint may accept broader symbols: upstream MUST
 * supply symbol from independently validated official USD-M exchangeInfo.
 */
export function normalizeOfficialUsdmKlines({source,symbol,timeframe,klines,
 allowedSymbols,accessAuthorized=false,nowMs}={}){
 if(!accessAuthorized)return failure('SOURCE_UNAUTHORIZED','NO_ENTITLEMENT');
 if(source?.venue!=='BINANCE_GLOBAL_USDM'||source?.klinesPath!=='/fapi/v1/klines'||
    !(allowedSymbols instanceof Set)||!allowedSymbols.has(symbol)||!sym.test(symbol))
  return failure('DATA_UNAVAILABLE','UNVERIFIED_USDM_SYMBOL');
 const span=FRAME_MS[timeframe];
 if(!span||!Number.isSafeInteger(nowMs)||nowMs<=0||!Array.isArray(klines)||
    klines.length<112||klines.length>1500)
  return failure('DATA_UNAVAILABLE','INCOMPLETE_KLINE_INPUT');
 try{
  const bars=[];
  for(let i=0;i<klines.length;i++){
   const x=klines[i];
   if(!Array.isArray(x)||x.length<12)throw Error('BAD_KLINE_TUPLE');
   const openTime=x[0],closeTime=x[6],end=openTime+span;
   if(!Number.isSafeInteger(openTime)||openTime<=0||openTime%span!==0||
      !Number.isSafeInteger(closeTime)||closeTime!==end-1)
    throw Error('BAD_KLINE_TIME');
   const o=decimal(x[1]),h=decimal(x[2]),l=decimal(x[3]),
    c=decimal(x[4]),v=decimal(x[5]);
   if([o,h,l,c,v].some(y=>y===null)||o<=0||l<=0||c<=0||
      h<Math.max(o,c)||l>Math.min(o,c)||l>h)
    throw Error('BAD_KLINE_OHLCV');
   // Binance may include the actively forming last candle. Ignore ONLY
   // this final open bar. Never evaluate it as a closed LONG A.
   if(end>nowMs){
    if(i!==klines.length-1)throw Error('EARLY_OPEN_KLINE_IN_HISTORY');
    continue;
   }
   if(bars.length&&end-bars.at(-1).closedAtMs!==span)
    throw Error('GAPPED_OR_REPEATED_KLINES');
   bars.push({closed:true,closedAtMs:end,open:o,high:h,low:l,close:c,volume:v});
  }
  if(bars.length<112)return failure('DATA_UNAVAILABLE','INSUFFICIENT_CLOSED_HISTORY');
  const last=bars.at(-1).closedAtMs;
  if(nowMs-last>2*span)return failure('STALE','STALE_LAST_CLOSED_KLINE');
  if(!validatedBars(bars,timeframe,last))
   return failure('DATA_UNAVAILABLE','NONCONTIGUOUS_CLOSED_KLINES');
  return {dataState:'OK',reason:null,detail:null,bars,lastClosedAtMs:last};
 }catch(e){return failure('DATA_UNAVAILABLE',e.message);}
}
