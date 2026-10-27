/** Frozen OFFLINE research candidate. No imports from LIVE, Android, FCM or orders.
 * Spec: docs/YELLOW_ENTRY_V3_RESEARCH_20261028.md. Checks are not probabilities.
 */
import {ANALYSIS_FRAMES,ANALYSIS_KEYS,closedHistory,frameAnalysis,levelsAndPlan,
  validAnalysisBar,validAnalysisEventId} from './analysis-companion.js';
import {freshQuote} from './entry-watch.js';
export const READINESS_METHOD='YELLOW_TWO_PATH_READINESS_V3_RESEARCH';
export const READINESS_TARGET_TF='1m';
const M=60_000,HORIZON=360*M,WINDOW=3*M,SETUP_LIFE=30*M;
const finite=x=>typeof x==='number'&&Number.isFinite(x),positive=x=>finite(x)&&x>0;
const terminal=new Set(['ENDED','DATA_GAP','INVALIDATED']);
export function newReadinessWatch(event,at=event?.detectedAtMs){
  // V3 entry confirmation is research for genuine 1M LONG A only.
  // Other LONG A lanes and their already-LIVE assessments stay untouched.
  if(event?.timeframe!==READINESS_TARGET_TF)throw Error('READINESS_1M_ONLY');
  if(!validAnalysisEventId(event?.id)||event.signal!=='LONG_A'||event.id!==`${event.symbol}:${event.timeframe}:${event.barClosedAtMs}:LONG_A`||
    !positive(event.price)||!Number.isSafeInteger(at)||at<event.barClosedAtMs||at-event.barClosedAtMs>5*M)throw Error('INVALID_READINESS_EVENT');
  return {method:READINESS_METHOD,schemaVersion:1,mode:'RESEARCH_ONLY',eventId:event.id,signalPrice:event.price,
    signalAtMs:event.barClosedAtMs,startedAtMs:at,watchUntilMs:event.barClosedAtMs+HORIZON,
    state:'WATCHING',reason:'WAIT_SETUP',lastBarEndMs:Math.floor(at/M)*M,checkedAtMs:at,
    peak:event.price,peakAtMs:event.barClosedAtMs,setup:null,frames:null,evidence:null,
    plan:null,path:null,confirmedAtMs:null,confirmedBarEndMs:null,scenarioId:null,entryUntilMs:null};
}
function trendGate(frames,histories){
  const five=frames[1],prior=histories['5m'].at(-2);
  const recovery=five.close>five.ma7||(five.close>prior.close&&histories['5m'].at(-1).low>=prior.low);
  return {pass:recovery&&frames.slice(2).some(f=>f.trend==='UP')&&!frames.slice(2).some(f=>f.trend==='DOWN'),
    fiveMinuteRecovery:recovery,higherUp:frames.slice(2).filter(f=>f.trend==='UP').length,
    supportingTfCount:frames.slice(1).filter(f=>f.trend==='UP').length,totalSupportingTf:3};
}
function makePlan(w,b,atr,anchor,frames,histories){
  const entry=b.close,stopLoss=anchor-atr*.25,risk=entry-stopLoss,riskPct=risk/entry*100;
  const overhead=frames.slice(1).map(f=>levelsAndPlan(histories[f.timeframe],f,entry).levels.resistance).filter(positive);
  const resistance=overhead.length?Math.min(...overhead):null,roomToResistanceR=resistance===null?null:(resistance-entry)/risk;
  w.evidence.risk={riskPct,minPct:.3,maxPct:5,pass:positive(stopLoss)&&riskPct>=.3&&riskPct<=5};
  w.evidence.room={resistance,roomToResistanceR,minimumR:1.5,pass:finite(roomToResistanceR)&&roomToResistanceR>=1.5};
  if(!w.evidence.risk.pass)return {reason:'RISK_DISTANCE',plan:null};
  if(!w.evidence.room.pass)return {reason:'RESISTANCE_ROOM',plan:null};
  const plan={referenceEntry:entry,entryLow:entry-atr*.1,entryHigh:entry+atr*.25,stopLoss,
    tp1:entry+risk,tp2:entry+2*risk,tp3:entry+3*risk,riskPct,roomToResistanceR};
  if(plan.entryLow<=stopLoss||plan.entryHigh>=plan.tp1)return {reason:'ENTRY_ZONE_INVALID',plan:null};
  return {reason:'SETUP_CONFIRMED',plan};
}
export function advanceReadinessWatch(previous,bar,snapshot,now){
  if(terminal.has(previous.state))return previous;
  if(!Number.isSafeInteger(now)||!validAnalysisBar(bar)||bar.endMs>now||bar.endMs<=previous.lastBarEndMs)return previous;
  const w=structuredClone(previous);w.checkedAtMs=now;
  if(bar.endMs!==w.lastBarEndMs+M){w.lastBarEndMs=bar.endMs;w.state='DATA_GAP';w.reason='CANDLE_SEQUENCE_GAP';return w;}
  w.lastBarEndMs=bar.endMs;
  if(w.plan&&(bar.low<=w.plan.stopLoss||bar.high>=w.plan.tp1)){
    // Cannot infer the order of an SL and TP touch in the same OHLC bar.
    w.state='INVALIDATED';w.reason=bar.low<=w.plan.stopLoss&&bar.high>=w.plan.tp1?'BOUNDARIES_AMBIGUOUS':bar.low<=w.plan.stopLoss?'STOP_TOUCHED':'TARGET_TOUCHED';return w;
  }
  if(now>=(w.plan?w.entryUntilMs:w.watchUntilMs)){w.state='ENDED';w.reason=w.plan?'ENTRY_WINDOW_ENDED':'WATCH_WINDOW_ENDED';return w;}
  const histories=Object.fromEntries(ANALYSIS_FRAMES.map(tf=>[tf,closedHistory(snapshot?.[ANALYSIS_KEYS[tf]],tf,bar.endMs)]));
  const frames=ANALYSIS_FRAMES.map(tf=>frameAnalysis(histories[tf],tf));w.frames=frames;
  w.evidence={atMs:bar.endMs,elapsedMinutes:(bar.endMs-w.signalAtMs)/M,
    watchRemainingMinutes:Math.max(0,(w.watchUntilMs-now)/M),dataReady:frames.every(f=>f.availability==='READY')};
  if(!w.evidence.dataReady){w.reason='INCOMPLETE_FOUR_TF';return w;}
  if(now-bar.endMs>90_000){w.reason='LATE_CANDLE';return w;}
  const trend=trendGate(frames,histories);w.evidence.trend=trend;
  if(w.plan){if(!trend.pass){w.state='INVALIDATED';w.reason='TREND_INVALIDATED';}else w.reason='SETUP_CONFIRMED';return w;}
  const minute=frames[0],atr=minute.atr14,bars=histories['1m'],last=bars.at(-1);
  if(!positive(atr)){w.reason='INVALID_ATR';return w;}
  const priorPeak=w.peak,priorPeakAtMs=w.peakAtMs,threshold=Math.max(priorPeak*.005,atr*.8);
  if(w.setup&&bar.endMs-w.setup.armedAtMs>=SETUP_LIFE)w.setup=null;
  if(!w.setup&&bar.endMs>priorPeakAtMs&&priorPeak-bar.low>=threshold)
    w.setup={peak:priorPeak,peakAtMs:priorPeakAtMs,armedAtMs:bar.endMs,low:bar.low,lowAtMs:bar.endMs};
  if(bar.high>w.peak){w.peak=bar.high;w.peakAtMs=bar.endMs;}
  if(w.setup&&bar.low<w.setup.low){w.setup.low=bar.low;w.setup.lowAtMs=bar.endMs;}
  const prior3High=Math.max(...bars.slice(-4,-1).map(b=>b.high)),rv=minute.relativeVolume;
  const reclaim=last.close>prior3High&&last.close>minute.ma7;
  const rightCandles=w.setup?bars.filter(b=>b.endMs>w.setup.lowAtMs&&b.low>w.setup.low).length:0;
  const pullback=!!w.setup&&bar.endMs-w.setup.lowAtMs>=2*M&&bars.slice(-2).every(b=>b.low>w.setup.low)&&reclaim&&finite(rv)&&rv>=1.2;
  const base=bars.slice(-6,-1),baseHigh=Math.max(...base.map(b=>b.high)),baseLow=Math.min(...base.map(b=>b.low));
  const baseReady=base.length===5&&base.every(b=>b.endMs>w.signalAtMs)&&baseHigh-baseLow<=2*atr&&base.slice(-2).every(b=>b.low>baseLow);
  const range=bar.high-bar.low,body=bar.close-bar.open;
  const continuation=baseReady&&bar.close>baseHigh&&bar.close>minute.ma7&&bar.low>=baseLow&&
    range>0&&body/range>=.5&&range<=2.5*atr&&bar.close-baseHigh<=.75*atr&&finite(rv)&&rv>=1.5;
  w.evidence.pullback={armed:!!w.setup,anchorPeak:w.setup?.peak??priorPeak,dipLow:w.setup?.low??null,
    requiredDecline:threshold,rightCandles,minimumRightCandles:2,reclaim,prior3High,pass:pullback};
  w.evidence.continuation={baseCandles:base.filter(b=>b.endMs>w.signalAtMs).length,requiredBaseCandles:5,
    baseHigh,baseLow,baseRange:baseHigh-baseLow,maximumBaseRange:2*atr,baseReady,
    bodyFraction:range>0?body/range:null,extensionAtr:(bar.close-baseHigh)/atr,pass:continuation};
  w.evidence.volume={relativeVolume:rv,pullbackRequired:1.2,continuationRequired:1.5};
  w.state=w.setup?'PULLBACK':'WATCHING';
  if(!pullback&&!continuation){w.reason=w.setup?'WAIT_RECOVERY_AND_VOLUME':'WAIT_PULLBACK_OR_BASE';return w;}
  if(!trend.pass){w.reason='SUPPORTING_TF_NOT_READY';return w;}
  // Each formed path must get its own risk/room evaluation. A deep earlier
  // dip cannot veto a separate, tighter consolidation setup on this candle.
  const paths=[...(pullback?[['PULLBACK',w.setup.low]]:[]),...(continuation?[['CONTINUATION',baseLow]]:[])];
  w.evidence.pathDecisions=[];let selected=null;
  for(const [path,anchor] of paths){
    const decision=makePlan(w,bar,atr,anchor,frames,histories);
    w.evidence.pathDecisions.push({path,reason:decision.reason,risk:structuredClone(w.evidence.risk),room:structuredClone(w.evidence.room)});
    if(decision.plan){selected={path,...decision};break;}
  }
  if(!selected){w.reason=w.evidence.pathDecisions[0].reason;return w;}
  w.reason=selected.reason;w.plan=selected.plan;w.path=selected.path;w.state='CONFIRMED';w.confirmedAtMs=now;w.confirmedBarEndMs=bar.endMs;
  w.scenarioId=w.eventId+':V3:'+bar.endMs;w.entryUntilMs=now+WINDOW;return w;
}
export function observeReadinessQuote(previous,ticker,now){
  if(previous.state!=='CONFIRMED'||!freshQuote(ticker,now)||ticker.observedAtMs<previous.confirmedAtMs)return previous;
  if(ticker.lastPrice>previous.plan.stopLoss&&ticker.lastPrice<previous.plan.tp1)return previous;
  return {...structuredClone(previous),state:'INVALIDATED',checkedAtMs:now,
    reason:ticker.lastPrice<=previous.plan.stopLoss?'STOP_TOUCHED':'TARGET_TOUCHED'};
}
export function readinessColor(w,ticker,now){
  const base={method:READINESS_METHOD,mode:'RESEARCH_ONLY',eventId:w.eventId,path:w.path,checkedAtMs:now,evidence:w.evidence};
  const result=(status,reason)=>({...base,status,reason});
  if(!Number.isSafeInteger(now)||now<w.checkedAtMs)return result('YELLOW','INVALID_CLOCK');
  if(w.state==='ENDED'||w.state==='DATA_GAP'||now>=(w.plan?w.entryUntilMs:w.watchUntilMs))return result('OFF',w.reason);
  if(w.state==='INVALIDATED')return result('RED',w.reason);
  if(!w.evidence?.dataReady||now-w.lastBarEndMs>=90_000)return result('YELLOW','STALE_OR_MISSING_CONTEXT');
  if(!freshQuote(ticker,now))return result('YELLOW','STALE_QUOTE');
  if(ticker.lastPrice>=10||!finite(ticker.priceChangePercent)||ticker.priceChangePercent<=1||
    !finite(ticker.quoteVolume24h)||ticker.quoteVolume24h<=10_000_000)return result('YELLOW','MARKET_FILTER');
  if(!w.plan)return result(['RISK_DISTANCE','RESISTANCE_ROOM','ENTRY_ZONE_INVALID'].includes(w.reason)?'RED':'YELLOW',w.reason);
  if(w.reason!=='SETUP_CONFIRMED')return result('YELLOW',w.reason);
  if(ticker.observedAtMs<w.confirmedAtMs)return result('YELLOW','QUOTE_BEFORE_CONFIRMATION');
  if(ticker.lastPrice<=w.plan.stopLoss||ticker.lastPrice>=w.plan.tp1)return result('RED','SCENARIO_BOUNDARY');
  if(ticker.lastPrice<w.plan.entryLow||ticker.lastPrice>w.plan.entryHigh)return result('YELLOW','OUTSIDE_ENTRY_ZONE');
  return result('GREEN','SETUP_CONFIRMED');
}
