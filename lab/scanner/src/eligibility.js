/** LAB-only candidate coverage policy; evaluate Binance ticker AS OF observation time.
 * Eligibility must not be inferred from TradingView's current 24h percentage.
 */
export const LAB_PRICE_EXCLUSIVE=10;
export const LAB_24H_MIN=Object.freeze({'1m':0,'1h':1});
export function labTickerGate(ticker,tf,asOfMs){
  if(!Object.hasOwn(LAB_24H_MIN,tf))return {eligible:false,reason:'UNSUPPORTED_TF'};
  const pct=Number(ticker?.priceChangePercent),price=Number(ticker?.lastPrice);
  if(!ticker || !/^[A-Z0-9]{2,25}USDT$/.test(ticker.symbol||'') ||
     ticker.source!=='BINANCE_USDM_FUTURES' || ticker.contractType!=='PERPETUAL' ||
     ticker.status!=='TRADING' || !Number.isFinite(pct) || !Number.isFinite(price) ||
     price<=0 || !Number.isSafeInteger(asOfMs) || !Number.isSafeInteger(ticker.observedAtMs) ||
     ticker.observedAtMs>asOfMs || asOfMs-ticker.observedAtMs>120_000)
    return {eligible:false,reason:'UNTRUSTWORTHY_ASOF_TICKER'};
  return {eligible:price<LAB_PRICE_EXCLUSIVE&&pct>=LAB_24H_MIN[tf],
    reason:price>=LAB_PRICE_EXCLUSIVE?'PRICE_NOT_BELOW_10':
      pct<LAB_24H_MIN[tf]?'BELOW_LAB_24H_THRESHOLD':'ELIGIBLE',
    min24hPct:LAB_24H_MIN[tf],priceExclusive:LAB_PRICE_EXCLUSIVE};
}
