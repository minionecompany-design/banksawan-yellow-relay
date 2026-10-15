/**
 * BANKSAWAN YELLOW — research-only LONG A 1m evaluator.
 * Reference: user-supplied BANKSAWAN LONG MTF v1.3 (Pine Script).
 * Offline, zero network, no account access, no trading orders.
 *
 * Price/24h-change supplied from Binance USD-M ticker snapshots, never TradingView.
 * 5m/15m/1h must be the *previous completed* candle of the timeframe that
 * contains the evaluating 1m candle (Pine close[1] + lookahead_on semantics).
 * All histories must be strictly contiguous and sufficiently warmed up.
 * This implementation is NOT yet TradingView-parity-certified.
 */
export const SETTINGS = Object.freeze({
  minBinance24hChangePct: 1,
  highPriorityChangePct: 5,
  maxPriceExclusive: 10,
  minVolumeRatio: 0.75,
  maxDistanceFromMa7Pct: 2.5,
  entryWindow1mBars: 30,
  reclaimWindow1mBars: 90,
  homeRetentionMs: 24 * 60 * 60 * 1000,
  maxTickerAgeMs: 120_000,
});

const FRAME_MS = Object.freeze({oneMinute: 60_000, fiveMinute: 300_000,
  fifteenMinute: 900_000, oneHour: 3_600_000});
const finite = n => typeof n === 'number' && Number.isFinite(n);
const greater = (a, b) => finite(a) && finite(b) && a > b;
const greaterEq = (a, b) => finite(a) && finite(b) && a >= b;
const less = (a, b) => finite(a) && finite(b) && a < b;

function sma(values, period) {
  if (values.length < period) return null;
  const tail = values.slice(-period);
  return tail.every(finite) ? tail.reduce((s, n) => s + n, 0) / period : null;
}
export function wilderRsiSeries(closes, length = 14) {
  if (closes.length < length + 1 || closes.some(n => !finite(n))) return [];
  const output = [];
  let gain = 0, loss = 0;
  for (let i = 1; i <= length; i++) {
    const delta = closes[i] - closes[i - 1];
    gain += Math.max(0, delta); loss += Math.max(0, -delta);
  }
  gain /= length; loss /= length;
  const calculate = () => loss === 0 ? (gain === 0 ? 50 : 100)
    : 100 - 100 / (1 + gain / loss);
  output.push(calculate());
  for (let i = length + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    gain = (gain * (length - 1) + Math.max(0, delta)) / length;
    loss = (loss * (length - 1) + Math.max(0, -delta)) / length;
    output.push(calculate());
  }
  return output;
}
function metrics(bars) {
  const closes = bars.map(x => x.close);
  const volumes = bars.map(x => x.volume);
  const rsi = wilderRsiSeries(closes);
  const averageVolume = sma(volumes, 20);
  return {close: bars.at(-1).close, ma7: sma(closes, 7),
    ma25: sma(closes, 25), ma99: sma(closes, 99),
    rsi: rsi.at(-1) ?? null, rsiAvg: sma(rsi, 14),
    volRatio: averageVolume > 0 ? bars.at(-1).volume / averageVolume : 0};
}

function validSeries(bars, frameMs) {
  if (!Array.isArray(bars) || bars.length < 112) return false;
  return bars.every((bar, i) => bar && finite(bar.endMs) &&
    bar.endMs > 0 && bar.endMs % frameMs === 0 &&
    finite(bar.close) && bar.close > 0 &&
    finite(bar.volume) && bar.volume >= 0 &&
    (i === 0 || bar.endMs - bars[i-1].endMs === frameMs));
}
const previousTfEnd = (oneMinuteEnd, tfMs) =>
  Math.floor((oneMinuteEnd - 1) / tfMs) * tfMs;

export function newSymbolState() {
  return {tradeState: 0, countDown: 0, countUp: 0, lastPullbackBar: null,
    protectBar: null, index: -1, lastProcessedEndMs: null};
}

/**
 * stepLongA consumes exactly one NEW finalized 1m candle per call.
 * The caller must replay previous bars in chronological order to reconstruct
 * Pine's persistent countDown/pullback/tradeState history. Do not skip bars.
 * `ticker24h` should be the Binance USD-M snapshot applicable to this bar;
 * live ticker strings are parsed as numbers. Historical snapshot replay must
 * supply historical ticker values instead of today's ticker (no hindsight).
 */
export function stepLongA(symbol, data, state = newSymbolState()) {
  const {oneMinute, fiveMinute, fifteenMinute, oneHour, ticker24h} = data;
  if (!Array.isArray(oneMinute) || !oneMinute.length)
    return {event:null, reason:'INSUFFICIENT_COMPLETE_CANDLES',state};
  const latest = oneMinute.at(-1);
  if (!finite(latest?.endMs) || latest.endMs % 60_000 !== 0 ||
      (finite(data.nowMs) && latest.endMs > data.nowMs))
    return {event:null, reason:'OPEN_OR_FUTURE_1M_CANDLE',state};
  if (state.lastProcessedEndMs !== null && latest.endMs <= state.lastProcessedEndMs)
    return {event:null, reason:'ALREADY_PROCESSED',state};
  if (state.lastProcessedEndMs !== null && latest.endMs - state.lastProcessedEndMs !== 60_000)
    return {event:null, reason:'1M_DATA_GAP_REBOOTSTRAP_REQUIRED',state};
  if (![oneMinute, fiveMinute, fifteenMinute, oneHour].every((bars,i) =>
    validSeries(bars, Object.values(FRAME_MS)[i])))
    return {event:null, reason:'INSUFFICIENT_OR_GAPPED_CANDLES',state};
  for (const [key, tfMs] of [['fiveMinute',FRAME_MS.fiveMinute],
     ['fifteenMinute',FRAME_MS.fifteenMinute],['oneHour',FRAME_MS.oneHour]]) {
    if (data[key].at(-1).endMs !== previousTfEnd(latest.endMs,tfMs))
      return {event:null, reason:`MTF_NOT_PREVIOUS_CONFIRMED_${key}`,state};
  }
  const pct = Number(ticker24h?.priceChangePercent);
  const lastPrice = Number(ticker24h?.lastPrice);
  // An adapter must join Binance USD-M exchangeInfo with the 24h ticker;
  // the public 24hr endpoint itself does not prove contract type.
  if (ticker24h?.symbol !== symbol || ticker24h?.contractType !== 'PERPETUAL' ||
      ticker24h?.source !== 'BINANCE_USDM_FUTURES' ||
      !finite(pct) || !finite(lastPrice) || lastPrice <= 0 ||
      !finite(ticker24h?.observedAtMs))
    return {event:null, reason:'INVALID_BINANCE_USDM_24H_TICKER',state};
  if (ticker24h.observedAtMs > latest.endMs + 5_000 ||
      latest.endMs - ticker24h.observedAtMs > SETTINGS.maxTickerAgeMs)
    return {event:null, reason:'STALE_BINANCE_TICKER',state};
  const eligible = pct >= SETTINGS.minBinance24hChangePct &&
    lastPrice < SETTINGS.maxPriceExclusive;
  const one = metrics(oneMinute), five = metrics(fiveMinute);
  const fifteen = metrics(fifteenMinute), hour = metrics(oneHour);
  const c = oneMinute.map(x=>x.close);
  const priceUp = c.at(-1) > c.at(-5), priceDown = c.at(-1) < c.at(-5);
  const index = state.index + 1;
  const countUp = priceUp ? state.countUp + 1 : 0;
  const countDown = priceDown ? state.countDown + 1 : 0;
  const pullbackCount = [9,13,14,15,16].includes(countDown);
  const pullbackBar = pullbackCount ? index : state.lastPullbackBar;
  const pullbackWindowActive = pullbackBar !== null &&
      index - pullbackBar <= SETTINGS.entryWindow1mBars;
  const hourPass = greater(hour.close,hour.ma99) &&
    greaterEq(hour.ma7,hour.ma25) && greaterEq(hour.rsi,48);
  const fifteenPass = greater(fifteen.close,fifteen.ma99) &&
    greaterEq(fifteen.ma7,fifteen.ma25) && greaterEq(fifteen.rsi,48);
  const fivePass = greater(five.close,five.ma7) && greater(five.close,five.ma25) &&
    greaterEq(five.ma7,five.ma25) && greater(five.rsi,50) &&
    greaterEq(five.rsi,five.rsiAvg);
  const distance = one.ma7 > 0 ? Math.abs(one.close-one.ma7)/one.ma7*100 : Infinity;
  const onePass = greater(one.close,one.ma7) && greater(one.close,one.ma25) &&
    greater(one.close,one.ma99) && greater(one.ma7,one.ma25) &&
    greater(one.rsi,50) && greater(one.rsi,one.rsiAvg) && less(one.rsi,75) &&
    one.volRatio >= SETTINGS.minVolumeRatio &&
    distance <= SETTINGS.maxDistanceFromMa7Pct &&
    one.close < SETTINGS.maxPriceExclusive;
  const oneWeak = less(one.close,one.ma7) && less(one.rsi,one.rsiAvg) && less(one.rsi,50);
  const fiveWeak = less(five.close,five.ma7) && less(five.rsi,five.rsiAvg);
  const fifteenFailure = less(fifteen.close,fifteen.ma25) &&
    less(fifteen.ma7,fifteen.ma25) && less(fifteen.rsi,45);
  const fiveMajorFailure = less(five.close,five.ma99) &&
    less(five.ma7,five.ma25) && less(five.rsi,45);
  const hardFailure = less(one.close,one.ma99) &&
    less(five.close,five.ma99) && less(five.rsi,45);
  const next = {...state,index,countUp,countDown,lastPullbackBar:pullbackBar,
    lastProcessedEndMs:latest.endMs};
  let signal = null;
  if (state.tradeState !== 0 && (fifteenFailure||fiveMajorFailure||hardFailure)) {
    signal='OUT_FINAL'; next.tradeState=0; next.protectBar=null;
  } else if (state.tradeState===0 && eligible && pullbackWindowActive &&
     hourPass && fifteenPass && fivePass && onePass) {
    signal='LONG_A'; next.tradeState=1;
  } else if (state.tradeState===1 && oneWeak && fiveWeak) {
    signal='PROTECT'; next.tradeState=2; next.protectBar=index;
  } else if (state.tradeState===2 && eligible && state.protectBar !== null &&
      index-state.protectBar <= SETTINGS.reclaimWindow1mBars && hourPass &&
      fifteenPass && fivePass && onePass) {
    signal='LONG_B'; next.tradeState=1;
  }
  return {state:next,
    reason: signal ? null : (!eligible?'BINANCE_24H_FILTER':'NO_CONFIRMED_SIGNAL'),
    event:signal ? {id:`${symbol}:${latest.endMs}:${signal}`,symbol,signal,
      barClosedAtMs:latest.endMs,price:one.close,
      binance24hChangePct:pct,
      priority:pct>=SETTINGS.highPriorityChangePct?'HIGH':'STANDARD',
      source:'BINANCE_USDM_24H+LOCAL_CLOSED_CANDLE_EVALUATOR',
      status:'RESEARCH_ONLY'}:null,
    diagnostics:{eligible,onePass,fivePass,fifteenPass,hourPass,
      pullbackWindowActive,distanceFromMa7Pct:distance}
  };
}

/** HOME is one entry per symbol, 24h clock starts on first appearance. */
export function addToHome(home,event,nowMs) {
  const active = getActiveHome(home,nowMs);
  if (!event || event.signal!=='LONG_A' || !finite(nowMs)) return active;
  if (active.some(x=>x.symbol===event.symbol)) return active;
  return [{...event,firstSeenMs:nowMs,homeExpiresMs:nowMs+SETTINGS.homeRetentionMs},...active];
}
export function getActiveHome(home,nowMs) {
  return home.filter(x=>finite(x.homeExpiresMs) && x.homeExpiresMs>nowMs);
}
export function eligibleUniverse(tickers) {
  return tickers.filter(t=> /^[A-Z0-9]+USDT$/.test(t.symbol||'') &&
    t.contractType==='PERPETUAL' && t.status==='TRADING' &&
    finite(Number(t.lastPrice)) && Number(t.lastPrice)>0 &&
    Number(t.lastPrice)<SETTINGS.maxPriceExclusive &&
    finite(Number(t.priceChangePercent)) &&
    Number(t.priceChangePercent)>=SETTINGS.minBinance24hChangePct)
    .map(t=>({symbol:t.symbol,price:Number(t.lastPrice),
      binance24hChangePct:Number(t.priceChangePercent),
      priority:Number(t.priceChangePercent)>=SETTINGS.highPriorityChangePct?'HIGH':'STANDARD'}))
    .sort((a,b)=>b.binance24hChangePct-a.binance24hChangePct);
}
