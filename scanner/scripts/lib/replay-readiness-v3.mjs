/** Saved closed candles only. Never fabricate a historical quote or GREEN. */
import {ANALYSIS_KEYS,ANALYSIS_PERIODS,validAnalysisBar,validAnalysisEventId,newPaperOutcome,advancePaperOutcome} from '../../src/analysis-companion.js';
import {newEntryWatch,advanceEntryWatch,WATCH_METHOD} from '../../src/entry-watch.js';
import {newReadinessWatch,advanceReadinessWatch,READINESS_METHOD,READINESS_TARGET_TF} from '../../src/entry-readiness-v3.js';
const M=60_000,ACTIVE=new Set(['WAITING_ENTRY','OPEN']);
export function replayReadinessComparison(source,event){
  if(source?.symbol!==event?.symbol)throw Error('REPLAY_SYMBOL_MISMATCH');
  if(!validAnalysisEventId(event?.id)||event?.signal!=='LONG_A'||
     event.id!==`${event.symbol}:${event.timeframe}:${event.barClosedAtMs}:LONG_A`)
    throw Error('INVALID_REPLAY_EVENT');
  // Do not silently delete non-1M failures from the saved evidence.
  // Every valid 5M/15M/1H case is returned as an explicit exclusion.
  if(event.timeframe!==READINESS_TARGET_TF){
    const skipped=(method)=>({method,confirmation:null,paper:null,state:'NOT_EVALUATED',
      reason:'OUT_OF_SCOPE_NON_1M',observation:'OUT_OF_SCOPE_NON_1M',paperCensored:false});
    return {event,evaluationScope:'OUT_OF_SCOPE_NON_1M',observedThroughMs:null,
      watchComplete:false,watchGap:false,baseline:skipped(WATCH_METHOD),
      candidate:skipped(READINESS_METHOD),reasonCounts:{},trace:[],
      historicalGreen:'NOT_RECONSTRUCTED_NO_HISTORICAL_ELIGIBLE_QUOTES'};
  }
  let w=newReadinessWatch(event),v1=newEntryWatch(event,event.detectedAtMs),paper=null,confirmed=null,baselineConfirmed=null;
  const data=source.candles;
  for(const [tf,key] of Object.entries(ANALYSIS_KEYS)){
    const bars=data?.[key];if(!Array.isArray(bars)||!bars.every((b,i)=>validAnalysisBar(b,ANALYSIS_PERIODS[tf])&&(!i||b.endMs>bars[i-1].endMs)))throw Error('INVALID_SAVED_CANDLES');
  }
  const start=w.lastBarEndMs,deadline=w.watchUntilMs,reasons={},trace=[];
  let last=start,watchGap=false;
  for(const b of data.oneMinute.filter(b=>b.endMs>start&&b.endMs<=deadline+123*M)){
    if(last<deadline&&b.endMs!==last+M)watchGap=true;last=b.endMs;
    const snapshot=Object.fromEntries(Object.entries(data).map(([key,bars])=>[key,bars.filter(x=>x.endMs<=b.endMs)]));
    v1=advanceEntryWatch(v1,b,snapshot,b.endMs+1000);
    if(v1.plan&&!baselineConfirmed)baselineConfirmed={plan:structuredClone(v1.plan),atMs:v1.confirmedAtMs};
    w=advanceReadinessWatch(w,b,snapshot,b.endMs+1000);
    if(paper&&w.state==='DATA_GAP'&&ACTIVE.has(paper.status))paper={...paper,status:'INCOMPLETE_DATA',endedAtMs:b.endMs};
    else if(paper)paper=advancePaperOutcome(w,paper,b);
    if(w.plan&&!confirmed){confirmed={plan:structuredClone(w.plan),atMs:w.confirmedAtMs,path:w.path,evidence:structuredClone(w.evidence)};paper=newPaperOutcome({plan:w.plan,capturedAtMs:w.confirmedAtMs});}
    if(paper?.status==='WAITING_ENTRY'&&['INVALIDATED','ENDED','DATA_GAP'].includes(w.state))
      paper={...paper,status:w.state==='DATA_GAP'?'INCOMPLETE_DATA':'NOT_ENTERED',endedAtMs:b.endMs};
    if(b.endMs<deadline&&!confirmed){reasons[w.reason]=(reasons[w.reason]||0)+1;
      if(trace.at(-1)?.reason!==w.reason)trace.push({atMs:b.endMs,reason:w.reason,close:b.close});}
  }
  const observedThroughMs=last,watchComplete=last>=deadline&&!watchGap;
  const result=(method,c,p,state,reason)=>({method,confirmation:c,paper:p,state,reason,
    observation:!c?(watchGap?'DATA_GAP':watchComplete?'NO_CONFIRMATION':'WATCH_CENSORED'):p?.status??'NO_PAPER',
    paperCensored:!!p&&ACTIVE.has(p.status)});
  return {event,evaluationScope:'LONG_A_1M_ONLY',observedThroughMs,watchComplete,watchGap,
    baseline:result(WATCH_METHOD,baselineConfirmed,v1.paper,v1.state,v1.reason),
    candidate:result(READINESS_METHOD,confirmed,paper,w.state,w.reason),reasonCounts:reasons,trace,
    historicalGreen:'NOT_RECONSTRUCTED_NO_HISTORICAL_ELIGIBLE_QUOTES'};
}
