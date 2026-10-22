/** YELLOW clean rebuild / stage 1: PURE policy, no API calls or legacy state. */
export const POLICY=Object.freeze({
  quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING',
  maxPriceExclusive:10,minChangeInclusive:1,minQuoteVolumeExclusive:10_000_000,
  maxTracked:50,
  notificationTimeframes:Object.freeze(['1m','5m','15m','1h']),
  notificationSignal:'LONG_A',
});
const numeric=n=>typeof n==='number'&&Number.isFinite(n);
export function eligible(row){
  return row!==null && typeof row==='object' &&
    /^[A-Z0-9]{2,25}USDT$/.test(row.symbol||'') &&
    row.quoteAsset===POLICY.quoteAsset &&
    row.contractType===POLICY.contractType &&
    row.status===POLICY.status &&
    numeric(row.price)&&row.price>0&&row.price<POLICY.maxPriceExclusive &&
    numeric(row.change24hPct)&&row.change24hPct>=POLICY.minChangeInclusive &&
    numeric(row.quoteVolume24h)&&row.quoteVolume24h>POLICY.minQuoteVolumeExclusive &&
    row.quoteVolumeSource==='OFFICIAL_USDM_QUOTE_24H';
}
export function screenedUniverse(rows){
  if(!Array.isArray(rows))throw Error('UNIVERSE_ARRAY_REQUIRED');
  return rows.filter(eligible).sort((a,b)=>b.change24hPct-a.change24hPct||a.symbol.localeCompare(b.symbol));
}
export function chooseTracked(rows,limit=POLICY.maxTracked){
  if(!Number.isSafeInteger(limit)||limit<1||limit>POLICY.maxTracked)throw Error('INVALID_TRACKING_LIMIT');
  // Pure allocation only; actual continuity/hysteresis belongs to tracked-slot manager.
  return screenedUniverse(rows).slice(0,limit);
}
export function alertIsAllowed(event){
  return event!==null&&typeof event==='object'&&
    event.signal===POLICY.notificationSignal&&
    POLICY.notificationTimeframes.includes(event.timeframe)&&
    Number.isSafeInteger(event.barClosedAtMs)&&event.barClosedAtMs>0 &&
    event.barClosedAtMs % ({'1m':60000,'5m':300000,'15m':900000,'1h':3600000}[event.timeframe])===0 &&
    eligible(event.market);
}
