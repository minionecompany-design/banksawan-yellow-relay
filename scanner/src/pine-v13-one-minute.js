/** Owner's Pine v1.3, CLOSED 1m candles only. No network or notification side effects.
 * Pine position state is independent of the Binance notification filters.
 * A finite history is not assumed to start flat: wait for an observed final-exit
 * condition after the pullback counter/window is known, then replay normally.
 * This synchronizes discrete state, not a claim of measured TradingView parity.
 */
import {newParallelState,validHistory,indicators,requestedContextEnd} from './parallel-long-a.js';
import {SETTINGS} from './long-a.js';

export const PINE_1M_REVISION=1;
export function newPineOneMinuteState(){
  return {...newParallelState()['1m'],pine1m:{revision:PINE_1M_REVISION,
    synchronized:false,downCountKnown:false,unknownPullbackBars:31,anchorEndMs:null}};
}
export function validPineOneMinuteState(state){
  const p=state?.pine1m;
  return p?.revision===PINE_1M_REVISION && typeof p.synchronized==='boolean' &&
    typeof p.downCountKnown==='boolean' && Number.isSafeInteger(p.unknownPullbackBars) &&
    p.unknownPullbackBars>=0 && p.unknownPullbackBars<=31 &&
    (p.anchorEndMs===null || (Number.isSafeInteger(p.anchorEndMs)&&p.anchorEndMs>0&&
      p.anchorEndMs%60_000===0&&p.anchorEndMs<=state.lastProcessedEndMs)) &&
    (!p.synchronized || (p.downCountKnown&&p.unknownPullbackBars===0&&p.anchorEndMs!==null));
}

// Literal conditions from docs/reference/BANKSAWAN-LONG-MTF-v1.3-user-supplied.pine.
// Pine's maximumPrice=30 belongs to its internal cycle. YELLOW's <10 is applied
// only to publication; using <10 to mutate the cycle would change later A/B.
export function pineV13Conditions(current,five,fifteen,hour){
  const hourPass=hour.close>hour.ma99&&hour.ma7>=hour.ma25&&hour.rsi>=48;
  const fifteenPass=fifteen.close>fifteen.ma99&&fifteen.ma7>=fifteen.ma25&&fifteen.rsi>=48;
  const fiveReclaim=five.close>five.ma7&&five.close>five.ma25&&five.ma7>=five.ma25&&five.rsi>50;
  const fivePass=fiveReclaim&&five.rsi>=five.rsiAvg;
  const distanceFromMa7Pct=current.ma7>0?Math.abs(current.close-current.ma7)/current.ma7*100:Infinity;
  const currentReclaim=current.close>current.ma7&&current.close>current.ma25&&current.close>current.ma99&&
    current.ma7>current.ma25&&current.rsi>50&&current.rsi>current.rsiAvg&&current.rsi<75&&
    current.volumeRatio>=.75&&distanceFromMa7Pct<=2.5;
  const currentPass=currentReclaim&&current.close<30;
  const protect=current.close<current.ma7&&current.rsi<current.rsiAvg&&current.rsi<50&&
    five.close<five.ma7&&five.rsi<five.rsiAvg;
  const finalFail=(fifteen.close<fifteen.ma25&&fifteen.ma7<fifteen.ma25&&fifteen.rsi<45)||
    (five.close<five.ma99&&five.ma7<five.ma25&&five.rsi<45)||
    (current.close<current.ma99&&five.close<five.ma99&&five.rsi<45);
  return {hourPass,fifteenPass,fivePass,fiveReclaim,currentPass,currentReclaim,protect,finalFail,distanceFromMa7Pct};
}

function advanceCounter(bars,state){
  const close=bars.at(-1).close,prior=bars.at(-5).close,index=state.index+1;
  const countDown=close<prior?state.countDown+1:0;
  const countUp=close>prior?state.countUp+1:0;
  return {...state,index,countDown,countUp,lastProcessedEndMs:bars.at(-1).endMs,
    lastPullbackBar:state.pine1m.downCountKnown&&[9,13,14,15,16].includes(countDown)?index:state.lastPullbackBar,
    pine1m:{...state.pine1m,downCountKnown:state.pine1m.downCountKnown||close>=prior,
      unknownPullbackBars:state.pine1m.downCountKnown?Math.max(0,state.pine1m.unknownPullbackBars-1):31}};
}

/** Also used by independent conformance tests with explicit indicator snapshots. */
export function advancePineCycle(next,conditions,endMs){
  const state={...next,pine1m:{...next.pine1m}},p=state.pine1m,c=conditions;
  if(!p.synchronized){
    // finalFail is mutually exclusive with the Pine A permissions. All possible
    // prior position states therefore converge to flat on this closed candle.
    if(c.finalFail&&p.downCountKnown&&p.unknownPullbackBars===0){
      p.synchronized=true;p.anchorEndMs=endMs;state.tradeState=0;state.protectBar=null;
    }
    return {state,signal:null};
  }
  const pullback=state.lastPullbackBar!==null&&state.index-state.lastPullbackBar<=30;
  let signal=null;
  if(state.tradeState!==0&&c.finalFail){signal='OUT_FINAL';state.tradeState=0;state.protectBar=null;}
  else if(state.tradeState===0&&pullback&&c.hourPass&&c.fifteenPass&&c.fivePass&&c.currentPass){
    signal='LONG_A';state.tradeState=1;
  }else if(state.tradeState===1&&c.protect){signal='PROTECT';state.tradeState=2;state.protectBar=state.index;}
  else if(state.tradeState===2&&state.protectBar!==null&&state.index-state.protectBar<=90&&
    c.hourPass&&c.fifteenPass&&c.fiveReclaim&&c.currentReclaim){signal='LONG_B';state.tradeState=1;}
  return {state,signal};
}

export function pineOneMinuteInputs(snapshot,endMs){
  const bars=snapshot?.oneMinute?.filter(b=>b.endMs<=endMs);
  if(!validHistory(bars,60_000)||bars.at(-1).endMs!==endMs)
    return {error:'TARGET_CANDLES_GAPPED_OR_INSUFFICIENT'};
  const ctx={};
  for(const [tf,key,span] of [['5m','fiveMinute',300_000],['15m','fifteenMinute',900_000],['1h','oneHour',3_600_000]]){
    const expected=requestedContextEnd(endMs,'1m',tf);
    const series=snapshot[key]?.filter(b=>b.endMs<=expected);
    if(!validHistory(series,span)||series.at(-1).endMs!==expected)
      return {error:'CONTEXT_STALE_OR_INCOMPLETE_'+tf};
    ctx[tf]=indicators(series);
  }
  return {bars,conditions:pineV13Conditions(indicators(bars),ctx['5m'],ctx['15m'],ctx['1h'])};
}

export function eligiblePineNotification(symbol,ticker,endMs){
  if(ticker?.symbol!==symbol||ticker.source!=='BINANCE_USDM_FUTURES'||
    ticker.contractType!=='PERPETUAL'||ticker.status!=='TRADING'||
    !Number.isFinite(ticker.observedAtMs)||ticker.observedAtMs>endMs||endMs-ticker.observedAtMs>SETTINGS.maxTickerAgeMs)
    return false;
  const price=Number(ticker.lastPrice),pct=Number(ticker.priceChangePercent),q=ticker.quoteVolume24h;
  return Number.isFinite(price)&&price>0&&price<10&&Number.isFinite(pct)&&pct>1&&Number.isFinite(q)&&q>10_000_000;
}

/** The ONLY returned event is a current, eligible LONG_A. B/P/OUT are diagnostic
 * internal transitions; replay uses the same cycle and discards every event. */
export function stepPineOneMinute(symbol,input,state){
  if(!validPineOneMinuteState(state))return {event:null,state,reason:'PINE_1M_REBUILD_REQUIRED'};
  const end=input?.oneMinute?.at(-1)?.endMs;
  if(!Number.isSafeInteger(end)||end%60_000!==0||!Number.isFinite(input.nowMs)||end>input.nowMs)
    return {event:null,state,reason:'OPEN_OR_FUTURE_TARGET_CANDLE'};
  if(state.lastProcessedEndMs!==null&&end<=state.lastProcessedEndMs)
    return {event:null,state,reason:'ALREADY_PROCESSED'};
  if(state.lastProcessedEndMs!==null&&end-state.lastProcessedEndMs!==60_000)
    return {event:null,state,reason:'TARGET_DATA_GAP_REBOOTSTRAP_REQUIRED'};
  const data=pineOneMinuteInputs(input,end);
  if(data.error)return {event:null,state,reason:data.error};
  const result=advancePineCycle(advanceCounter(data.bars,state),data.conditions,end);
  const {signal}=result,next=result.state;
  if(signal)next.lastEventId=`${symbol}:1m:${end}:${signal}`;
  const eligible=eligiblePineNotification(symbol,input.ticker24h,end);
  const event=signal==='LONG_A'&&eligible&&data.bars.at(-1).close<10?{id:next.lastEventId,symbol,timeframe:'1m',signal:'LONG_A',
    barClosedAtMs:end,price:data.bars.at(-1).close,
    binance24hChangePct:Number(input.ticker24h.priceChangePercent),quoteVolume24h:input.ticker24h.quoteVolume24h,
    priority:Number(input.ticker24h.priceChangePercent)>=5?'HIGH':'STANDARD',
    source:'BINANCE_USDM_24H+PINE_V13_1M',status:'RESEARCH_ONLY'}:null;
  return {state:next,event,reason:!next.pine1m.synchronized?'PINE_1M_STATE_UNSYNCHRONIZED':null,
    diagnostics:{...data.conditions,internalSignal:signal,synchronized:next.pine1m.synchronized,eligible}};
}

/** Bounded bootstrap/catch-up. Never fabricate old 24h tickers or emit old alerts.
 * On a long gap rebuild from an observed synchronization point; if none exists,
 * retain an explicit unsynchronized state and continue silently on live bars. */
export function rebuildPineOneMinute(symbol,snapshot,checkpoint=null){
  const bars=snapshot.oneMinute;
  if(!validHistory(bars,60_000))throw Error('PINE_1M_INVALID_REBUILD_HISTORY');
  let state=newPineOneMinuteState(),usedCheckpoint=false,replayed=0;
  const cpIndex=validPineOneMinuteState(checkpoint)?bars.findIndex(b=>b.endMs===checkpoint.lastProcessedEndMs):-1;
  if(cpIndex>=111){
    state=structuredClone(checkpoint);usedCheckpoint=true;
  }
  for(let i=4;i<bars.length;i++){
    const end=bars[i].endMs;
    if(state.lastProcessedEndMs!==null&&end<=state.lastProcessedEndMs)continue;
    const prefix=bars.slice(0,i+1),input={...snapshot,oneMinute:prefix,nowMs:end};
    const data=pineOneMinuteInputs(input,end);
    if(data.error){
      if(usedCheckpoint)throw Error('PINE_1M_INCOMPLETE_CHECKPOINT_CATCHUP');
      // Counter warmup is independent of MA/RSI readiness. A context hole must
      // discard position certainty, never bridge it with a presumed flat state.
      state=advanceCounter(prefix,state);state.pine1m.synchronized=false;state.pine1m.anchorEndMs=null;
      continue;
    }
    state=stepPineOneMinute(symbol,input,state).state;replayed++;
  }
  if(state.lastProcessedEndMs!==bars.at(-1).endMs)throw Error('PINE_1M_INCOMPLETE_REBUILD');
  return {state,replayed,usedCheckpoint};
}
