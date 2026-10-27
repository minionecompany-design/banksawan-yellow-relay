/** Offline only. Fixed specification: docs/YELLOW_ENTRY_CANDIDATE_V2_20261027.md. */
import {ANALYSIS_FRAMES,ANALYSIS_KEYS,closedHistory,frameAnalysis,levelsAndPlan,
  validAnalysisBar,validAnalysisEventId,newPaperOutcome,advancePaperOutcome} from '../../src/analysis-companion.js';
import {newEntryWatch,advanceEntryWatch,WATCH_METHOD} from '../../src/entry-watch.js';
export const CANDIDATE_METHOD='YELLOW_HIGHER_LOW_CANDIDATE_V2_OFFLINE';
const M=60_000,WINDOW=360*M,positive=x=>Number.isFinite(x)&&x>0;

export function confirmedLows(bars,signalAtMs){
  const pivots=[];
  for(let i=2;i<bars.length-2;i++){
    const b=bars[i];if(b.endMs<=signalAtMs)continue;
    if([bars[i-2],bars[i-1],bars[i+1],bars[i+2]].every(x=>x.low>b.low))
      pivots.push({low:b.low,atMs:b.endMs,availableAtMs:bars[i+2].endMs});
  }
  return pivots;
}

export function candidateDecision(event,snapshot,endMs,observedLow){
  const histories=Object.fromEntries(ANALYSIS_FRAMES.map(tf=>[tf,closedHistory(snapshot?.[ANALYSIS_KEYS[tf]],tf,endMs)]));
  const frames=ANALYSIS_FRAMES.map(tf=>frameAnalysis(histories[tf],tf));
  const no=reason=>({reason,plan:null});
  if(frames.some(f=>f.availability!=='READY'))return no('INCOMPLETE_CONTEXT');
  const bars=histories['1m'],last=bars.at(-1),minute=frames[0],atr=minute.atr14;
  if(!positive(atr)||event.price-observedLow<Math.max(event.price*.005,atr*.8))return no('WAIT_PULLBACK');
  const pivots=confirmedLows(bars,event.barClosedAtMs),[prior,pivot]=pivots.slice(-2);
  if(!prior||!pivot||pivot.low<=prior.low||pivot.low>=last.close||
    bars.some(b=>b.endMs>pivot.atMs&&b.low<=pivot.low))return no('WAIT_HIGHER_LOW');
  if(last.close<=Math.max(...bars.slice(-4,-1).map(b=>b.high))||last.close<=minute.ma7||
    !Number.isFinite(minute.relativeVolume)||minute.relativeVolume<1.2)return no('WAIT_RECLAIM_VOLUME');
  const [previousFive,five]=histories['5m'].slice(-2);
  if(five.close<=previousFive.high||five.low<=previousFive.low||frames.slice(2).some(f=>f.trend==='DOWN'))return no('WAIT_FIVE_MINUTE_RECOVERY');
  const entry=last.close,stopLoss=pivot.low-atr*.25,risk=entry-stopLoss,riskPct=risk/entry*100;
  if(!positive(stopLoss)||riskPct<.3||riskPct>5)return no('STOP_DISTANCE');
  const overhead=frames.slice(1).map(f=>levelsAndPlan(histories[f.timeframe],f,entry).levels.resistance).filter(positive);
  const resistance=overhead.length?Math.min(...overhead):null;
  if(resistance===null||(resistance-entry)/risk<1.5)return no('RESISTANCE_ROOM');
  const plan={referenceEntry:entry,entryLow:entry-atr*.1,entryHigh:entry+atr*.25,stopLoss,
    tp1:entry+risk,tp2:entry+2*risk,tp3:entry+3*risk,riskPct,roomToResistanceR:(resistance-entry)/risk};
  if(plan.entryLow<=stopLoss||plan.entryHigh>=plan.tp1)return no('ENTRY_ZONE');
  return {reason:'HIGHER_LOW_RECLAIM',plan,pivot,previousPivot:prior,confirmedBarEndMs:endMs,confirmedAtMs:endMs+1000};
}

export function replayEntryComparison(source,event){
  if(!validAnalysisEventId(event?.id)||event.id!==`${event.symbol}:${event.timeframe}:${event.barClosedAtMs}:LONG_A`||
    event.signal!=='LONG_A'||source?.symbol!==event.symbol||!positive(event.price)||
    !Number.isSafeInteger(event.detectedAtMs)||event.detectedAtMs<event.barClosedAtMs||
    event.detectedAtMs-event.barClosedAtMs>5*M)throw Error('REPLAY_IDENTITY_MISMATCH');
  const data=source.candles;
  for(const [tf,key] of Object.entries(ANALYSIS_KEYS)){
    const p={'1m':M,'5m':5*M,'15m':15*M,'1h':60*M}[tf],bars=data?.[key];
    if(!Array.isArray(bars)||!bars.every((b,i)=>validAnalysisBar(b,p)&&(!i||b.endMs>bars[i-1].endMs)))throw Error('INVALID_REPLAY_CANDLES');
  }
  let baseline=newEntryWatch(event,event.detectedAtMs),candidate=null,paper=null,low=null;
  const watchUntilMs=event.barClosedAtMs+WINDOW,trace=[],reasons={},lastStart=Math.floor(event.detectedAtMs/M)*M;
  let last=lastStart,sequenceGap=false,watchGap=false;
  const future=data.oneMinute.filter(b=>b.endMs>lastStart&&b.endMs<=watchUntilMs+123*M);
  let firstBaseline=null;
  for(const b of future){
    const snapshot=Object.fromEntries(Object.entries(data).map(([key,bars])=>[key,bars.filter(x=>x.endMs<=b.endMs)]));
    baseline=advanceEntryWatch(baseline,b,snapshot,b.endMs+1000);
    if(baseline.plan&&!firstBaseline)firstBaseline={plan:structuredClone(baseline.plan),confirmedAtMs:baseline.confirmedAtMs,confirmedBarEndMs:baseline.confirmedBarEndMs};
    if(paper)paper=advancePaperOutcome(candidate,paper,b);
    if(b.endMs!==last+M){sequenceGap=true;if(last<watchUntilMs)watchGap=true;}
    last=b.endMs;
    if(candidate||b.endMs>=watchUntilMs||sequenceGap)continue;
    low=low===null?b.low:Math.min(low,b.low);
    const decision=candidateDecision(event,snapshot,b.endMs,low);
    reasons[decision.reason]=(reasons[decision.reason]||0)+1;
    if(trace.at(-1)?.reason!==decision.reason)trace.push({atMs:b.endMs,reason:decision.reason,close:b.close});
    if(decision.plan){candidate=decision;paper=newPaperOutcome({plan:decision.plan,capturedAtMs:decision.confirmedAtMs});}
  }
  const observedThroughMs=future.at(-1)?.endMs??lastStart;
  const watchComplete=observedThroughMs>=watchUntilMs&&!watchGap;
  const final=(method,confirmation,p)=>({method,confirmation,paper:p,
    entryStatus:confirmation?'CONFIRMED':watchGap?'DATA_GAP':watchComplete?'NO_CONFIRMATION':'WATCH_CENSORED',
    paperCensored:!!p&&['WAITING_ENTRY','OPEN'].includes(p.status)});
  return {event,observedThroughMs,watchUntilMs,watchComplete,sequenceGap,
    baseline:final(WATCH_METHOD,firstBaseline,baseline.paper),
    candidate:final(CANDIDATE_METHOD,candidate,paper),candidateReasonCounts:reasons,candidateTrace:trace};
}
