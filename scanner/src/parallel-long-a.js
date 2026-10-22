/**
 * BANKSAWAN YELLOW V2 — FOUR INDEPENDENT LONG A TIMEFRAME LANES.
 * Offline-only. No exchange access, no push, no trading orders.
 *
 * Pine LONG MTF v1.3 is calculated separately on the selected chart timeframe.
 * Each lane has its OWN pullback counter / 30-bar window / position state.
 * Cross-TF conditions remain safety permissions, NOT ordered LONG A events:
 * a 15m LONG A can fire while 1m/5m/1h never emitted LONG A.
 *
 * Canonical MTF as-of convention: context for a closed target candle at T
 * uses the most recent complete candle strictly BEFORE T of each MTF frame.
 * No future access. For lower-TF request.security on a higher chart TF this
 * is a conservative approximation; TradingView parity must be validated.
 */
import {SETTINGS, wilderRsiSeries} from './long-a.js';

export const TIMEFRAMES = Object.freeze(['1m','5m','15m','1h']);
export const PERIODS = Object.freeze({'1m':60_000,'5m':300_000,'15m':900_000,'1h':3_600_000});
const DATA_KEYS = Object.freeze({'1m':'oneMinute','5m':'fiveMinute','15m':'fifteenMinute','1h':'oneHour'});
const finite = x => typeof x === 'number' && Number.isFinite(x);
const gt = (a,b) => finite(a) && finite(b) && a>b;
const ge = (a,b) => finite(a) && finite(b) && a>=b;
const lt = (a,b) => finite(a) && finite(b) && a<b;
const currentContextEnd = (endMs, spanMs) => Math.floor((endMs-1)/spanMs)*spanMs;
/**
 * Pine request.security(..., close[1], lookahead=barmerge.lookahead_on)
 * uses the FIRST lower-timeframe intrabar on historical chart bars, but the
 * LAST intrabar on realtime chart bars. The [1] offset is applied within the
 * requested lower timeframe, which shifts the selected bar back one step.
 * Never use the historical behavior to claim a realtime delivery timestamp.
 */
export function requestedContextEnd(endMs,targetTf,contextTf,mode='CAUSAL_REALTIME') {
  if(!TIMEFRAMES.includes(targetTf)||!['5m','15m','1h'].includes(contextTf))
    throw new Error('UNSUPPORTED_MTF_CONTEXT');
  if(!['CAUSAL_REALTIME','PINE_HISTORICAL'].includes(mode))
    throw new Error('UNSUPPORTED_CONTEXT_MODE');
  const chart=PERIODS[targetTf],requested=PERIODS[contextTf];
  if(requested < chart && mode==='PINE_HISTORICAL')
    return endMs-chart;
  return currentContextEnd(endMs,requested);
}

function validHistory(bars,period) {
  return Array.isArray(bars) && bars.length>=112 && bars.every((x,i)=>
    x && finite(x.endMs) && x.endMs>0 && x.endMs%period===0 &&
    finite(x.close) && x.close>0 && finite(x.volume) && x.volume>=0 &&
    (i===0 || x.endMs-bars[i-1].endMs===period));
}
function sma(a,n) {
  if(a.length<n) return null;
  const values=a.slice(-n);
  return values.every(finite)?values.reduce((x,y)=>x+y,0)/n:null;
}
function indicators(bars) {
  const closes=bars.map(x=>x.close);
  const volumes=bars.map(x=>x.volume);
  const rsi=wilderRsiSeries(closes);
  const avgVol=sma(volumes,20);
  return {close:closes.at(-1),ma7:sma(closes,7),ma25:sma(closes,25),
    ma99:sma(closes,99),rsi:rsi.at(-1)??null,rsiAvg:sma(rsi,14),
    volumeRatio:avgVol>0?volumes.at(-1)/avgVol:0};
}

export function newParallelState(){
  return Object.fromEntries(TIMEFRAMES.map(tf=>[tf,{
    tradeState:0,countDown:0,countUp:0,lastPullbackBar:null,
    protectBar:null,index:-1,lastProcessedEndMs:null,lastEventId:null
  }]));
}
function checkTicker(symbol,ticker,signalEndMs){
  const pct=Number(ticker?.priceChangePercent),price=Number(ticker?.lastPrice);
  if(ticker?.symbol!==symbol||ticker?.source!=='BINANCE_USDM_FUTURES'||
      ticker?.contractType!=='PERPETUAL'||ticker?.status!=='TRADING'||
      !finite(pct)||!finite(price)||price<=0||!finite(ticker?.observedAtMs)){
    return {error:'INVALID_BINANCE_USDM_24H_TICKER'};
  }
  if(ticker.observedAtMs>signalEndMs||signalEndMs-ticker.observedAtMs>SETTINGS.maxTickerAgeMs)
    return {error:'STALE_BINANCE_TICKER'};
  return {pct,price,eligible:pct>=SETTINGS.minBinance24hChangePct &&
     price<SETTINGS.maxPriceExclusive};
}
/**
 * @param {string} symbol Binance USD-M symbol
 * @param {'1m'|'5m'|'15m'|'1h'} tf target lane
 * @param {object} input {oneMinute,fiveMinute,fifteenMinute,oneHour,ticker24h,nowMs}
 * @param {object} state a state belonging only to `tf`, not another lane
 */
export function stepLongAOnTimeframe(symbol,tf,input,state){
  if(!input || typeof input!=='object')return {event:null,reason:'INPUT_REQUIRED',state};
  if(!TIMEFRAMES.includes(tf)) return {event:null,reason:'INVALID_TIMEFRAME',state};
  if(!state||typeof state!=='object')return {event:null,reason:'STATE_REQUIRED',state};
  const period=PERIODS[tf],bars=input[DATA_KEYS[tf]];
  const mode=input.contextMode??'CAUSAL_REALTIME';
  if(!['CAUSAL_REALTIME','PINE_HISTORICAL'].includes(mode))return {event:null,reason:'UNSUPPORTED_CONTEXT_MODE',state};
  if(!Array.isArray(bars)||!bars.length)return {event:null,reason:'TARGET_CANDLES_MISSING',state};
  const last=bars.at(-1),end=last?.endMs;
  if(!finite(end)||end%period!==0||(finite(input.nowMs)&&end>input.nowMs))
    return {event:null,reason:'OPEN_OR_FUTURE_TARGET_CANDLE',state};
  if(state.lastProcessedEndMs!==null&&end<=state.lastProcessedEndMs)
    return {event:null,reason:'ALREADY_PROCESSED',state};
  if(state.lastProcessedEndMs!==null&&end-state.lastProcessedEndMs!==period)
    return {event:null,reason:'TARGET_DATA_GAP_REBOOTSTRAP_REQUIRED',state};
  if(!validHistory(bars,period))return {event:null,reason:'TARGET_CANDLES_GAPPED_OR_INSUFFICIENT',state};
  // All three context frames are independent snapshots of COMPLETED candles.
  // For an equal target/context TF, context must not reuse the target candle.
  const contexts={};
  for(const ctf of ['5m','15m','1h']) {
    const key=DATA_KEYS[ctf],span=PERIODS[ctf];
    const expectedEnd=requestedContextEnd(end,tf,ctf,mode);
    const supplied=input.contexts?.[ctf]??input[key];
    if(!Array.isArray(supplied)||!supplied.length)return {event:null,reason:`CONTEXT_MISSING_${ctf}`,state};
    // If the input series includes the current target candle at T, explicitly
    // cut it off. Never use a post-signal candle.
    const contextBars=supplied.filter(b=>finite(b?.endMs)&&b.endMs<=expectedEnd);
    if(!validHistory(contextBars,span)||contextBars.at(-1).endMs!==expectedEnd)
      return {event:null,reason:`CONTEXT_STALE_OR_INCOMPLETE_${ctf}`,state};
    contexts[ctf]=indicators(contextBars);
  }
  const ticker=checkTicker(symbol,input.ticker24h,end);
  if(ticker.error)return {event:null,reason:ticker.error,state};
  const pinnedB=tf==='1m'&&input.oneMinuteEpisodePinned===true&&state.tradeState===2;
  const current=indicators(bars),five=contexts['5m'],fifteen=contexts['15m'],hour=contexts['1h'];
  const closes=bars.map(b=>b.close);
  const index=state.index+1;
  const countUp=closes.at(-1)>closes.at(-5)?state.countUp+1:0;
  const countDown=closes.at(-1)<closes.at(-5)?state.countDown+1:0;
  const pullbackBar=[9,13,14,15,16].includes(countDown)?index:state.lastPullbackBar;
  const pullbackWindowActive=pullbackBar!==null && index-pullbackBar<=SETTINGS.entryWindow1mBars;
  const hourPass=gt(hour.close,hour.ma99)&&ge(hour.ma7,hour.ma25)&&ge(hour.rsi,48);
  const fifteenPass=gt(fifteen.close,fifteen.ma99)&&ge(fifteen.ma7,fifteen.ma25)&&ge(fifteen.rsi,48);
  const fivePass=gt(five.close,five.ma7)&&gt(five.close,five.ma25)&&
    ge(five.ma7,five.ma25)&&gt(five.rsi,50)&&ge(five.rsi,five.rsiAvg);
  const dist=current.ma7>0?Math.abs(current.close-current.ma7)/current.ma7*100:Infinity;
  const currentPass=gt(current.close,current.ma7)&&gt(current.close,current.ma25)&&
    gt(current.close,current.ma99)&&gt(current.ma7,current.ma25)&&
    gt(current.rsi,50)&&gt(current.rsi,current.rsiAvg)&&lt(current.rsi,75)&&
    current.volumeRatio>=SETTINGS.minVolumeRatio&&
    dist<=SETTINGS.maxDistanceFromMa7Pct&&
    (current.close<SETTINGS.maxPriceExclusive||pinnedB);
  const curWeak=lt(current.close,current.ma7)&&lt(current.rsi,current.rsiAvg)&&lt(current.rsi,50);
  const fiveWeak=lt(five.close,five.ma7)&&lt(five.rsi,five.rsiAvg);
  const finalFail=(lt(fifteen.close,fifteen.ma25)&&lt(fifteen.ma7,fifteen.ma25)&&lt(fifteen.rsi,45)) ||
    (lt(five.close,five.ma99)&&lt(five.ma7,five.ma25)&&lt(five.rsi,45)) ||
    (lt(current.close,current.ma99)&&lt(five.close,five.ma99)&&lt(five.rsi,45));
  const next={...state,index,countDown,countUp,lastPullbackBar:pullbackBar,lastProcessedEndMs:end};
  let signal=null;
  if(state.tradeState!==0&&finalFail){signal='OUT_FINAL';next.tradeState=0;next.protectBar=null;}
  else if(state.tradeState===0&&ticker.eligible&&pullbackWindowActive&&hourPass&&fifteenPass&&fivePass&&currentPass){
    signal='LONG_A';next.tradeState=1;
  }else if(state.tradeState===1&&curWeak&&fiveWeak){signal='PROTECT';next.tradeState=2;next.protectBar=index;}
  else if(state.tradeState===2&&state.protectBar!==null&&
    index-state.protectBar<=SETTINGS.reclaimWindow1mBars&&(ticker.eligible||pinnedB)&&
    hourPass&&fifteenPass&&fivePass&&currentPass){signal='LONG_B';next.tradeState=1;}
  const eventId=`${symbol}:${tf}:${end}:${signal}`;
  const event=signal?{id:eventId,symbol,timeframe:tf,signal,barClosedAtMs:end,
    price:current.close,binance24hChangePct:ticker.pct,
    priority:ticker.pct>=SETTINGS.highPriorityChangePct?'HIGH':'STANDARD',
    source:'BINANCE_USDM_24H+LOCAL_PARALLEL_MTF_EVALUATOR',status:'RESEARCH_ONLY'}:null;
  if(signal)next.lastEventId=eventId;
  return {event,state:next,reason:signal?null:(ticker.eligible?'NO_CONFIRMED_SIGNAL':'BINANCE_24H_FILTER'),
    diagnostics:{timeframe:tf,contextMode:mode,eligible:ticker.eligible,currentPass,fivePass,fifteenPass,hourPass,
      pullbackWindowActive,distanceFromMa7Pct:dist}};
}

/** One independent evaluation per lane whose target candle just closed. */
export function evaluateParallelLongA(symbol,input,states=newParallelState()) {
  const next={...states},events=[],results={};
  for(const tf of TIMEFRAMES){
    // A lane can fail independently; no global waiting for other lane events.
    const lastEnd=input?.[DATA_KEYS[tf]]?.at?.(-1)?.endMs;
    if(Number.isFinite(input?.evaluationEndMs) && lastEnd!==input.evaluationEndMs){
      results[tf]={event:null,reason:'WAITING_FOR_TARGET_CLOSE',state:states[tf]};
      continue;
    }
    const r=stepLongAOnTimeframe(symbol,tf,input,states[tf]);
    next[tf]=r.state;results[tf]=r;
    if(r.event)events.push(r.event);
  }
  return {states:next,events,results};
}
