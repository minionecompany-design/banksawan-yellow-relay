/** YELLOW product eligibility: rolling 24h Binance quote turnover, in USDT.
 * Never infer quote turnover from candle/base volume or backfill old signals.
 */
export const PRODUCT_POLICY = Object.freeze({version:'yellow-10m-v1',
  maxPriceExclusive:30,minChangeExclusive:0,minQuoteVolumeExclusive:10_000_000});
export function productEligible(price,change,quoteVolume) {
  return [price,change,quoteVolume].every(x=>typeof x==='number'&&Number.isFinite(x)) &&
    price>0 && price<PRODUCT_POLICY.maxPriceExclusive &&
    change>PRODUCT_POLICY.minChangeExclusive && quoteVolume>PRODUCT_POLICY.minQuoteVolumeExclusive;
}
export function eligibleEvent(event) {
  return !!event && productEligible(event.price,event.binance24hChangePct,event.quoteVolume24h);
}
