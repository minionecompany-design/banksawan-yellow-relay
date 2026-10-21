/** Conservative deterministic sampling, no winners supplied by the user preselected. */
export const LAB_FRAMES=Object.freeze(['1m','5m','15m','1h']);
export const LAB_PERIOD=Object.freeze({'1m':60000,'5m':300000,'15m':900000,'1h':3600000});
const finite=x=>typeof x==='number'&&Number.isFinite(x);
export function selectNaturalPilot(tickers,exchangeSymbols,{maxSymbols=8,minQuoteVolume=5_000_000}={}){
  if(!Number.isInteger(maxSymbols)||maxSymbols<1||maxSymbols>12)throw Error('MAX_LAB_PILOT_12');
  return [...tickers.values()].filter(t=>exchangeSymbols.has(t.symbol)&&t.lastPrice<10&&
    t.lastPrice>0&&t.priceChangePercent>=0&&t.quoteVolume>=minQuoteVolume&&
    finite(t.observedAtMs))
    .sort((a,b)=>{
      // Sample mixed early-momentum and liquid candidates, not only top gainers.
      const score=t=>Math.log10(t.quoteVolume+1)*10 - Math.max(0,t.priceChangePercent-8)*4 +
         Math.min(8,t.priceChangePercent)*0.75;
      return score(b)-score(a)||a.symbol.localeCompare(b.symbol);
    }).slice(0,maxSymbols).map(x=>x.symbol);
}
export function parseClosedKline(raw,tf){
  const period=LAB_PERIOD[tf];if(!period||!Array.isArray(raw)||raw.length<7)return null;
  const endMs=Number(raw[6])+1,open=Number(raw[1]),high=Number(raw[2]),low=Number(raw[3]),
    close=Number(raw[4]),volume=Number(raw[5]);
  if(!Number.isSafeInteger(endMs)||endMs%period!==0||
    ![open,high,low,close,volume].every(finite)||Math.min(open,high,low,close)<=0||volume<0||
    high<Math.max(open,close,low)||low>Math.min(open,close,high))return null;
  return {endMs,open,high,low,close,volume};
}
export function parseStreamKline(msg,nowMs=Date.now()){
  const k=msg?.k,tf=k?.i; if(!k?.x||!LAB_PERIOD[tf]||!k?.s)return null;
  const endMs=Number(k.T)+1;const b=parseClosedKline([k.t,k.o,k.h,k.l,k.c,k.v,k.T],tf);
  if(!b||endMs>nowMs||nowMs-endMs>60_000)return null;
  return {symbol:k.s,timeframe:tf,bar:b};
}
export function addContiguousBar(series,bar,period){
  if(!Array.isArray(series)||!bar||!period)return {ok:false,reason:'BAD_SERIES'};
  const last=series.at(-1);if(last&&bar.endMs<=last.endMs)return {ok:false,reason:'OLD_OR_DUPLICATE'};
  if(last&&bar.endMs-last.endMs!==period)return {ok:false,reason:'GAP'};
  series.push(bar);if(series.length>170)series.shift();return {ok:true};
}
