/** YELLOW v4 CONTINUATION 1M — isolated OFFLINE research only.
 * Hypothesis registered BEFORE evaluating the archived 46-case cohort:
 * a 3-bar stair-step base + fresh breakout, rather than a rigid 5-bar base,
 * may catch earlier continuation without trading an extended vertical candle.
 * Not imported by LIVE, Railway, FCM, or Android.
 */
import {ANALYSIS_FRAMES,ANALYSIS_KEYS,closedHistory,frameAnalysis,levelsAndPlan,
  validAnalysisBar,validAnalysisEventId} from './analysis-companion.js';
import {freshQuote} from './entry-watch.js';
export const CONTINUATION_V4_METHOD='YELLOW_CONTINUATION_1M_V4_RESEARCH';
const M=60_000,HORIZON=360*M,ENTRY_WINDOW=3*M;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const positive=x=>finite(x)&&x>0;
const terminal=new Set(['ENDED','DATA_GAP','INVALIDATED']);
export function newContinuationWatchV4(event,at=event?.detectedAtMs){
  if(event?.timeframe!=='1m')throw Error('CONTINUATION_V4_1M_ONLY');
  if(!validAnalysisEventId(event?.id)||event.signal!=='LONG_A'||
     event.id!==`${event.symbol}:1m:${event.barClosedAtMs}:LONG_A`||
     !positive(event.price)||!Number.isSafeInteger(at)||at<event.barClosedAtMs||at-event.barClosedAtMs>5*M)
     throw Error('INVALID_CONTINUATION_EVENT');
  return {method:CONTINUATION_V4_METHOD,mode:'RESEARCH_ONLY',schemaVersion:1,eventId:event.id,
    signalAtMs:event.barClosedAtMs,signalPrice:event.price,lastBarEndMs:Math.floor(at/M)*M,
    watchUntilMs:event.barClosedAtMs+HORIZON,entryUntilMs:null,checkedAtMs:at,
    state:'WATCHING',reason:'WAIT_STAIR_STEP',path:null,plan:null,confirmedAtMs:null,
    evidence:null,frames:null};
}
export function advanceContinuationWatchV4(previous,bar,snapshot,now){
  if(previous?.method!==CONTINUATION_V4_METHOD)throw Error('V4_WATCH_METHOD');
  if(terminal.has(previous.state))return previous;
  if(!Number.isSafeInteger(now)||!validAnalysisBar(bar,M)||
     bar.endMs>now||bar.endMs<=previous.lastBarEndMs)return previous;
  const w=structuredClone(previous);w.checkedAtMs=now;
  if(bar.endMs!==w.lastBarEndMs+M){
    w.lastBarEndMs=bar.endMs;w.state='DATA_GAP';w.reason='CANDLE_SEQUENCE_GAP';return w;
  }
  w.lastBarEndMs=bar.endMs;
  if(w.plan&&(bar.low<=w.plan.stopLoss||bar.high>=w.plan.tp1)){
    w.state='INVALIDATED';
    w.reason=bar.low<=w.plan.stopLoss&&bar.high>=w.plan.tp1?'BOUNDARIES_AMBIGUOUS':
      bar.low<=w.plan.stopLoss?'STOP_TOUCHED':'TARGET_TOUCHED';
    return w;
  }
  if(now>=(w.plan?w.entryUntilMs:w.watchUntilMs)){
    w.state='ENDED';w.reason=w.plan?'ENTRY_WINDOW_ENDED':'WATCH_WINDOW_ENDED';return w;
  }
  const histories=Object.fromEntries(ANALYSIS_FRAMES.map(tf=>
    [tf,closedHistory(snapshot?.[ANALYSIS_KEYS[tf]],tf,bar.endMs)]));
  const frames=ANALYSIS_FRAMES.map(tf=>frameAnalysis(histories[tf],tf));
  w.frames=frames;
  w.evidence={atMs:bar.endMs,elapsedMinutes:(bar.endMs-w.signalAtMs)/M,
    dataReady:frames.every(f=>f.availability==='READY')};
  if(!w.evidence.dataReady){w.reason='INCOMPLETE_FOUR_TF';return w;}
  if(now-bar.endMs>=90_000){w.reason='LATE_CANDLE';return w;}
  const m=frames[0],five=frames[1],fifteen=frames[2],hour=frames[3];
  const fiveRecovery=five.close>=five.ma7||five.close>histories['5m'].at(-2).close;
  const trend={fiveRecovery,fiveTrend:five.trend,fifteenTrend:fifteen.trend,hourTrend:hour.trend,
    pass:fiveRecovery&&five.trend!=='DOWN'&&
      !(fifteen.trend==='DOWN'&&hour.trend==='DOWN')};
  w.evidence.trend=trend;
  if(w.plan){
    if(!trend.pass){w.state='INVALIDATED';w.reason='TREND_INVALIDATED';}
    else w.reason='SETUP_CONFIRMED';
    return w;
  }
  const bars=histories['1m'],atr=m.atr14,base=bars.slice(-4,-1),last=bars.at(-1);
  if(!positive(atr)||base.length!==3){w.reason='INVALID_ATR';return w;}
  const eligibleBase=base.every(b=>b.endMs>w.signalAtMs);
  const baseHigh=Math.max(...base.map(b=>b.high));
  const baseLow=Math.min(...base.map(b=>b.low));
  const baseRange=baseHigh-baseLow;
  const improvingLows=base[1].low>=base[0].low&&base[2].low>base[0].low;
  const risingCloses=base[2].close>base[0].close&&
    base.filter((b,i)=>i>0&&b.close>=base[i-1].close).length>=1;
  const body=last.close-last.open,range=last.high-last.low,rv=m.relativeVolume;
  const nearBase=last.close>baseHigh&&last.close-baseHigh<=.8*atr;
  const notVertical=range>0&&range<=2.5*atr&&body/range>=.45;
  const breakout=eligibleBase&&baseRange<=2.5*atr&&improvingLows&&risingCloses&&
    last.low>=baseLow&&nearBase&&notVertical&&last.close>m.ma7&&
    last.close>w.signalPrice&&finite(rv)&&rv>=1.2;
  w.evidence.continuation={baseCandles:3,requiredBaseCandles:3,
    baseHigh,baseLow,baseRange,baseRangeAtr:baseRange/atr,
    improvingLows,risingCloses,relativeVolume:rv,
    volumeRequired:1.2,bodyFraction:range>0?body/range:null,
    extensionAtr:(last.close-baseHigh)/atr,pass:breakout};
  if(!breakout){w.reason='WAIT_STAIR_STEP_BREAKOUT';return w;}
  if(!trend.pass){w.reason='SUPPORTING_TF_NOT_READY';return w;}
  const entry=last.close,stopLoss=baseLow-.25*atr,risk=entry-stopLoss,
    riskPct=risk/entry*100;
  const resistances=frames.slice(1).map(f=>
    levelsAndPlan(histories[f.timeframe],f,entry).levels.resistance).filter(positive);
  const resistance=resistances.length?Math.min(...resistances):null,
    roomToResistanceR=positive(risk)&&resistance!==null?(resistance-entry)/risk:null;
  w.evidence.risk={riskPct,pass:positive(stopLoss)&&riskPct>=.3&&riskPct<=5};
  w.evidence.room={resistance,roomToResistanceR,pass:finite(roomToResistanceR)&&roomToResistanceR>=1.5};
  if(!w.evidence.risk.pass){w.reason='RISK_DISTANCE';return w;}
  if(!w.evidence.room.pass){w.reason='RESISTANCE_ROOM';return w;}
  const plan={referenceEntry:entry,entryLow:entry-.1*atr,entryHigh:entry+.25*atr,
    stopLoss,tp1:entry+risk,tp2:entry+2*risk,tp3:entry+3*risk,riskPct,roomToResistanceR};
  if(plan.entryLow<=stopLoss||plan.entryHigh>=plan.tp1){
    w.reason='ENTRY_ZONE_INVALID';return w;
  }
  w.plan=plan;w.path='CONTINUATION';w.state='CONFIRMED';
  w.confirmedAtMs=now;w.entryUntilMs=now+ENTRY_WINDOW;
  w.reason='SETUP_CONFIRMED';return w;
}
/** A genuine eligible quote AFTER confirmed candle is essential for GREEN.
 * No synthetic quote may be manufactured in archived-candle replay.
 */
export function continuationColorV4(w,ticker,now){
  const output=(status,reason)=>({method:CONTINUATION_V4_METHOD,status,reason,
    eventId:w?.eventId??null,checkedAtMs:now,path:w?.path??null,mode:'RESEARCH_ONLY'});
  if(!Number.isSafeInteger(now)||now<w.checkedAtMs)return output('YELLOW','INVALID_CLOCK');
  if(terminal.has(w.state)||now>=(w.plan?w.entryUntilMs:w.watchUntilMs))
    return output('OFF',w.reason);
  if(!w.plan)return output('YELLOW',w.reason);
  if(!w.evidence?.dataReady||now-w.lastBarEndMs>=90_000)
    return output('YELLOW','STALE_OR_MISSING_CONTEXT');
  if(!freshQuote(ticker,now)||ticker.observedAtMs<w.confirmedAtMs)
    return output('YELLOW','STALE_OR_PRE_CONFIRMATION_QUOTE');
  if(ticker.lastPrice>=10||!finite(ticker.priceChangePercent)||ticker.priceChangePercent<=1||
     !finite(ticker.quoteVolume24h)||ticker.quoteVolume24h<=10_000_000)
    return output('YELLOW','MARKET_FILTER');
  if(ticker.lastPrice<=w.plan.stopLoss)return output('RED','STOP_TOUCHED');
  if(ticker.lastPrice>=w.plan.tp1)return output('OFF','TP1_ALREADY_REACHED');
  if(ticker.lastPrice<w.plan.entryLow||ticker.lastPrice>w.plan.entryHigh)
    return output('YELLOW','OUTSIDE_ENTRY_ZONE');
  return output('GREEN','CONTINUATION_CONFIRMED');
}
