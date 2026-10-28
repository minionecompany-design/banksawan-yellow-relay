/** BANKSAWAN YELLOW — optional, OFFLINE second signal for LONG A 1M.
 * Do not import into live-main/live-market/Android/FCM.
 * The GREEN gate is delegated unchanged to the existing V3 research engine.
 * RED is evidence of structural risk NOW, never a claim price won't recover.
 */
import {validAnalysisEventId,validAnalysisBar,closedHistory,frameAnalysis,ANALYSIS_KEYS} from './analysis-companion.js';
import {READINESS_METHOD,readinessColor} from './entry-readiness-v3.js';

export const SECOND_SIGNAL_METHOD='YELLOW_SECOND_SIGNAL_1M_RESEARCH';
const M=60_000;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const verdict=(status,reason,nowMs,extra={})=>({
  method:SECOND_SIGNAL_METHOD,status,reason,checkedAtMs:nowMs,...extra
});
const noFuture=(raw,at)=>Array.isArray(raw)?raw.filter(x=>Number.isSafeInteger(x?.endMs)&&x.endMs<=at):[];
const avgVolume=bars=>bars.reduce((n,b)=>n+b.volume,0)/bars.length;

/** A state-independent research label, NOT order advice or a stored traffic light.
 * An irreversible invalidation must be implemented and tested separately before
 * any promotion. Watch scenarios are immutable in the original V3 engine.
 */
export function secondSignal1m({event,watch,snapshot,ticker,nowMs}={}){
  if(event?.timeframe!=='1m')
    return verdict('NOT_APPLICABLE','ENTRY_V3_ONLY_1M',nowMs??0);
  if(!validAnalysisEventId(event?.id)||event?.signal!=='LONG_A'||
     event.id!==`${event.symbol}:1m:${event.barClosedAtMs}:LONG_A`)
    return verdict('OFF','INVALID_LONG_A_EVENT',nowMs??0);
  if(!Number.isSafeInteger(nowMs)||nowMs<event.barClosedAtMs)
    return verdict('OFF','INVALID_CLOCK',nowMs??0);
  if(!watch||watch.method!==READINESS_METHOD||watch.eventId!==event.id||
     !Number.isSafeInteger(watch.watchUntilMs)||watch.watchUntilMs!==event.barClosedAtMs+360*M)
    return verdict('YELLOW','ENTRY_WATCH_NOT_READY',nowMs,{eventId:event.id});
  const meta={eventId:event.id,setupPath:watch.path??null};
  if(nowMs>=watch.watchUntilMs && !watch.plan)
    return verdict('OFF','WATCH_WINDOW_ENDED',nowMs,meta);
  if(['ENDED','DATA_GAP'].includes(watch.state))
    return verdict('OFF',watch.reason||'WATCH_TERMINATED',nowMs,meta);
  if(watch.state==='INVALIDATED')
    return verdict(['STOP_TOUCHED','TREND_INVALIDATED'].includes(watch.reason)?'RED':'OFF',
      watch.reason||'SCENARIO_INVALIDATED',nowMs,meta);
  if(watch.plan&&Number.isSafeInteger(watch.entryUntilMs)&&nowMs>=watch.entryUntilMs)
    return verdict('OFF','ENTRY_WINDOW_ENDED',nowMs,meta);
  const one=noFuture(snapshot?.[ANALYSIS_KEYS['1m']],nowMs);
  const baseline=one.filter(b=>b.endMs<event.barClosedAtMs).slice(-20);
  const after=one.filter(b=>b.endMs>event.barClosedAtMs);
  const baseEnd=event.barClosedAtMs-M;
  const hasBaseline=baseline.length===20&&baseline[0].endMs===baseEnd-19*M&&
    baseline.at(-1).endMs===baseEnd&&baseline.every((b,i)=>
      validAnalysisBar(b,M)&&(i===0||b.endMs-baseline[i-1].endMs===M));
  const latest=after.at(-1);
  const recent=after.slice(-2);
  if(!hasBaseline||!recent.length||!latest||
     !recent.every((b,i)=>validAnalysisBar(b,M)&&(i===0||b.endMs-recent[i-1].endMs===M))||
     latest.endMs>nowMs||nowMs-latest.endMs>=90_000)
    return verdict('YELLOW','WAIT_FRESH_CLOSED_CANDLES',nowMs,meta);

  // Frozen 20-minute pre-LONG A structural floor. Never re-anchor on a
  // future low or turn an ordinary first dip into a permanent "loser" label.
  const floor=Math.min(...baseline.map(b=>b.low));
  const prevVolumes=one.filter(b=>b.endMs<latest.endMs).slice(-20);
  const volumeBase=prevVolumes.length===20?avgVolume(prevVolumes):null;
  const sellVolumeRatio=volumeBase>0?latest.volume/volumeBase:null;
  const risk={supportFloor:floor,belowSupport:recent.length===2&&
    recent[0].close<floor*.998&&recent[1].close<floor*.998,
    sellVolumeRatio,sellCandle:latest.close<latest.open,
    fiveMinuteTrend:null,fifteenMinuteTrend:null};

  const frame=(tf)=>{
    const closed=closedHistory(snapshot?.[ANALYSIS_KEYS[tf]],tf,latest.endMs);
    return Array.isArray(closed)?frameAnalysis(closed,tf):null;
  };
  const five=frame('5m'),fifteen=frame('15m');
  risk.fiveMinuteTrend=five?.availability==='READY'?five.trend:null;
  risk.fifteenMinuteTrend=fifteen?.availability==='READY'?fifteen.trend:null;

  // Strong *current* breakdown evidence, not hindsight from later prices.
  // If a candidate may still be rebounding, keep it YELLOW rather than
  // retrospectively asserting that it was a guaranteed failed LONG A.
  if(risk.belowSupport&&risk.sellCandle&&finite(risk.sellVolumeRatio)&&
     risk.sellVolumeRatio>=1.5&&risk.fiveMinuteTrend==='DOWN'&&
     risk.fifteenMinuteTrend!==null&&risk.fifteenMinuteTrend!=='UP')
    return verdict('RED','STRUCTURAL_BREAKDOWN',nowMs,{...meta,risk});

  // GREEN can only be earned by a genuine PULLBACK / CONTINUATION
  // confirmation, a fresh eligible quote and an in-zone immutable plan.
  if(watch.state==='CONFIRMED'&&['PULLBACK','CONTINUATION'].includes(watch.path)){
    const decision=readinessColor(watch,ticker,nowMs);
    if(decision.status==='GREEN')
      return verdict('GREEN',watch.path==='PULLBACK'?'PULLBACK_RECOVERED':'CONTINUATION_CONFIRMED',nowMs,
        {...meta,risk,entryUntilMs:watch.entryUntilMs});
    if(decision.status==='OFF')
      return verdict('OFF',decision.reason,nowMs,meta);
    if(decision.status==='RED')
      return verdict('RED',decision.reason,nowMs,{...meta,risk});
    return verdict('YELLOW',decision.reason,nowMs,{...meta,risk});
  }

  const reason=latest.close<event.price?'WAIT_PULLBACK_RECOVERY':'WAIT_CONTINUATION_CONFIRMATION';
  return verdict('YELLOW',reason,nowMs,{...meta,risk});
}
